#!/usr/bin/env python3
"""Parse IRS Form 990 XML files into a single Parquet file.

Usage:
    python parsing/parse_990.py raw_data/2019_990/ data/processed/filings_2019.parquet
    python parsing/parse_990.py raw_data/2019_990/ data/processed/filings_2019.parquet --limit 100
"""

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
from lxml import etree

NS = {"irs": "http://www.irs.gov/efile"}


# ---------------------------------------------------------------------------
# Field extraction helpers
# ---------------------------------------------------------------------------

def _text(tree, xpath):
    """Return text content of the first match, or None."""
    els = tree.xpath(xpath, namespaces=NS)
    return els[0].text.strip() if els and els[0].text else None


def _int_field(tree, xpath):
    """Return integer value or None."""
    raw = _text(tree, xpath)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _float_field(tree, xpath):
    """Return float value or None (handles decimals in revenue fields)."""
    raw = _text(tree, xpath)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _org_name(tree):
    """Concatenate BusinessNameLine1Txt and optional Line2."""
    line1 = _text(tree, "//irs:ReturnHeader/irs:Filer/irs:BusinessName/irs:BusinessNameLine1Txt")
    line2 = _text(tree, "//irs:ReturnHeader/irs:Filer/irs:BusinessName/irs:BusinessNameLine2Txt")
    if line1 and line2:
        return f"{line1} {line2}"
    return line1


def _state(tree):
    """US state abbreviation, falling back to foreign country code."""
    us = _text(tree, "//irs:ReturnHeader/irs:Filer/irs:USAddress/irs:StateAbbreviationCd")
    if us:
        return us
    return _text(tree, "//irs:ReturnHeader/irs:Filer/irs:ForeignAddress/irs:CountryCd")


def _city(tree):
    """City from US or foreign address."""
    us = _text(tree, "//irs:ReturnHeader/irs:Filer/irs:USAddress/irs:CityNm")
    if us:
        return us
    return _text(tree, "//irs:ReturnHeader/irs:Filer/irs:ForeignAddress/irs:CityNm")


def _mission(tree):
    """Mission description, whitespace-normalized and truncated to 500 chars."""
    # Try MissionDesc first, fall back to ActivityOrMissionDesc
    raw = _text(tree, "//irs:ReturnData/irs:IRS990/irs:MissionDesc")
    if raw is None:
        raw = _text(tree, "//irs:ReturnData/irs:IRS990/irs:ActivityOrMissionDesc")
    if raw is None:
        return None
    cleaned = " ".join(raw.split())
    return cleaned[:500]


def _fiscal_year(tax_period_end):
    """Extract fiscal year from tax_period_end string (YYYY-MM-DD)."""
    if tax_period_end and len(tax_period_end) >= 4:
        return int(tax_period_end[:4])
    return None


# ---------------------------------------------------------------------------
# Single-file parser
# ---------------------------------------------------------------------------

def parse_one(filepath):
    """Parse a single 990 XML file. Returns a dict or None on failure."""
    tree = etree.parse(str(filepath))

    # Sanity check: return type must be 990
    return_type = _text(tree, "//irs:ReturnHeader/irs:ReturnTypeCd")
    if return_type and return_type != "990":
        print(
            f"WARNING: unexpected ReturnTypeCd '{return_type}' in {filepath.name} — "
            f"expected '990'. Parsing anyway but row may have wrong field mappings.",
            file=sys.stderr,
        )

    ein = _text(tree, "//irs:ReturnHeader/irs:Filer/irs:EIN")
    tax_period_end = _text(tree, "//irs:ReturnHeader/irs:TaxPeriodEndDt")

    row = {
        "ein": ein,
        "org_name": _org_name(tree),
        "state": _state(tree),
        "city": _city(tree),
        "ntee_code": None,  # Not in 990 XML; will join from BMF later
        "tax_period_end": tax_period_end,
        "fiscal_year": _fiscal_year(tax_period_end),
        "return_type": return_type,
        "filing_date": _text(tree, "//irs:ReturnHeader/irs:ReturnTs"),
        # Size
        "total_revenue": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYTotalRevenueAmt"),
        "total_expenses": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYTotalExpensesAmt"),
        "total_assets_eoy": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:TotalAssetsEOYAmt"),
        "total_liabilities_eoy": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:TotalLiabilitiesEOYAmt"),
        "net_assets_eoy": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:NetAssetsOrFundBalancesEOYAmt"),
        "net_assets_boy": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:NetAssetsOrFundBalancesBOYAmt"),
        # Revenue mix
        "contributions_grants": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYContributionsGrantsAmt"),
        "program_service_revenue": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYProgramServiceRevenueAmt"),
        "investment_income": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYInvestmentIncomeAmt"),
        "other_revenue": _float_field(tree, "//irs:ReturnData/irs:IRS990/irs:CYOtherRevenueAmt"),
        # Mission
        "mission_desc": _mission(tree),
        # Provenance
        "source_file": filepath.name,
    }

    # --- v2 extension fields (balance sheet, functional expenses, governance) ---
    P = "//irs:ReturnData/irs:IRS990/"

    # Functional expense breakdown (Part IX totals)
    row["program_expenses"] = _float_field(tree, P + "irs:TotalFunctionalExpensesGrp/irs:ProgramServicesAmt")
    row["management_general_expenses"] = _float_field(tree, P + "irs:TotalFunctionalExpensesGrp/irs:ManagementAndGeneralAmt")
    row["fundraising_expenses"] = _float_field(tree, P + "irs:TotalFunctionalExpensesGrp/irs:FundraisingAmt")
    row["total_functional_expenses"] = _float_field(tree, P + "irs:TotalFunctionalExpensesGrp/irs:TotalAmt")

    # Liquidity (Part X balance sheet)
    row["cash_non_interest_bearing"] = _float_field(tree, P + "irs:CashNonInterestBearingGrp/irs:EOYAmt")
    row["savings_temporary_investments"] = _float_field(tree, P + "irs:SavingsAndTempCashInvstGrp/irs:EOYAmt")

    # Net asset classes — try post-FASB (2018+) first, then pre-FASB
    row["unrestricted_net_assets"] = (
        _float_field(tree, P + "irs:NoDonorRestrictionNetAssetsGrp/irs:EOYAmt")
        or _float_field(tree, P + "irs:UnrestrictedNetAssetsGrp/irs:EOYAmt")
    )
    row["temp_restricted_net_assets"] = (
        _float_field(tree, P + "irs:DonorRstrNetAssetsGrp/irs:EOYAmt")
        or _float_field(tree, P + "irs:TemporarilyRstrNetAssetsGrp/irs:EOYAmt")
    )
    row["perm_restricted_net_assets"] = _float_field(tree, P + "irs:PermanentlyRstrNetAssetsGrp/irs:EOYAmt")

    # Grants and compensation
    row["grants_paid"] = _float_field(tree, P + "irs:CYGrantsAndSimilarPaidAmt")
    row["compensation_top_officer"] = _float_field(tree, P + "irs:CompCurrentOfcrDirectorsGrp/irs:TotalAmt")

    # Government grants (Part VIII revenue)
    row["government_grants"] = _float_field(tree, P + "irs:GovernmentGrantsAmt")

    # Governance counts
    row["num_employees"] = _int_field(tree, P + "irs:TotalEmployeeCnt")
    row["num_volunteers"] = _int_field(tree, P + "irs:TotalVolunteersCnt")
    row["num_voting_board_members"] = _int_field(tree, P + "irs:VotingMembersGoverningBodyCnt")
    row["formation_year"] = _int_field(tree, P + "irs:FormationYr")

    return row


# ---------------------------------------------------------------------------
# Batch runner
# ---------------------------------------------------------------------------

def parse_batch(input_dir, output_path, limit=None):
    """Parse all XML files in input_dir and write to Parquet."""
    xml_files = sorted(Path(input_dir).glob("*.xml"))
    total = len(xml_files)

    if limit:
        xml_files = xml_files[:limit]
        print(f"Running on first {limit} of {total} files", file=sys.stderr)

    rows = []
    errors = []
    warnings = []

    t0 = time.time()
    for i, f in enumerate(xml_files, 1):
        try:
            row = parse_one(f)
            rows.append(row)
        except Exception as e:
            errors.append((f.name, str(e)))
            print(f"ERROR parsing {f.name}: {e}", file=sys.stderr)

        if i % 500 == 0:
            print(f"  ... processed {i}/{len(xml_files)}", file=sys.stderr)

    elapsed = time.time() - t0

    df = pd.DataFrame(rows)

    # Write parquet
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False, engine="pyarrow")

    # Summary
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Parsed {len(rows)} of {len(xml_files)} files in {elapsed:.1f}s", file=sys.stderr)
    if errors:
        print(f"  Errors ({len(errors)}):", file=sys.stderr)
        for fname, err in errors:
            print(f"    {fname}: {err}", file=sys.stderr)
    else:
        print(f"  Errors: 0", file=sys.stderr)
    print(f"  Output: {output_path} ({len(df)} rows x {len(df.columns)} cols)", file=sys.stderr)

    # Null counts
    print(f"\nNull counts per column:", file=sys.stderr)
    nulls = df.isnull().sum()
    for col in df.columns:
        if nulls[col] > 0:
            print(f"  {col}: {nulls[col]}/{len(df)}", file=sys.stderr)
    if nulls.sum() == 0:
        print(f"  (none)", file=sys.stderr)

    # First 5 rows
    print(f"\nFirst 5 rows:", file=sys.stderr)
    print(df.head().to_string(), file=sys.stderr)

    return df


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Parse IRS Form 990 XML files to Parquet")
    parser.add_argument("input_dir", help="Directory containing 990 XML files")
    parser.add_argument("output_path", help="Output Parquet file path")
    parser.add_argument("--limit", type=int, default=None, help="Parse only first N files (for smoke testing)")
    args = parser.parse_args()

    if not Path(args.input_dir).is_dir():
        print(f"ERROR: {args.input_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    parse_batch(args.input_dir, args.output_path, limit=args.limit)


if __name__ == "__main__":
    main()
