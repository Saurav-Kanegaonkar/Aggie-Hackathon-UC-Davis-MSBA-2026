# Dataset Construction

## Three-Layer Pipeline

The analysis panel is built in three layers:

**Layer 1 — GivingTuesday spine** (`panel_990.parquet`). GivingTuesday's Basic 120 Fields data mart (Oct 2025 snapshot) provides the validated spine of ~3.6M full-990 filings from 2007–2024 across 465K nonprofits. Joined with the GivingTuesday Missions mart for mission descriptions. Cross-validated against raw IRS XML at **99.2% match** across 20,075 field comparisons.

**Layer 2 — IRS recency extension** (`panel_990_extended.parquet`). Appends late-2025 and early-2026 IRS bulk XML batches (Nov 2025–Feb 2026), adding ~167K net-new filings — mostly FY2024 extension filers and FY2025 early filers. For the ~1,600 filings that appear in both layers with different financial values (amendments filed after GivingTuesday's snapshot), the IRS version is kept as the more recent filing. These rows have `submitted_on` populated and are null on the 14 new columns added in Layer 2b.

**Layer 2b — Column expansion** (`panel_990_extended_v2.parquet`). Re-reads the GivingTuesday Basic 120 with 14 additional columns (expenses by function, liquidity, board size, formation year, etc.). IRS-sourced rows (~167K, 4.4% of total) remain null on these new columns.

**Layer 3 — NTEE enrichment** (`panel_990_extended_v3.parquet`). Joins NTEE codes from the IRS Business Master File for peer benchmarking by mission category. Adds `ntee_code`, `ntee_major_category`, and `ntee_major_category_name`.

## Final Panel Schema (v2: 39 columns)

| Column | Type | Description |
|--------|------|-------------|
| `ein` | string | Employer Identification Number |
| `org_name` | string | Organization name (line 1 + line 2 concatenated) |
| `state` | string | US state abbreviation or foreign country code |
| `city` | string | City name |
| `tax_period_end` | string | Tax period end date (YYYYMMDD from GT, YYYY-MM-DD from IRS) |
| `fiscal_year` | Int64 | Fiscal year derived from tax period end |
| `return_type` | string | Always "990" (filtered at build time) |
| `total_revenue` | float64 | Total revenue, current year |
| `total_expenses` | float64 | Total expenses, current year |
| `total_assets_eoy` | float64 | Total assets, end of year |
| `total_liabilities_eoy` | float64 | Total liabilities, end of year |
| `net_assets_eoy` | float64 | Net assets / fund balances, end of year |
| `net_assets_boy` | float64 | Net assets, beginning of year (shifted from prior year's EOY) |
| `contributions_grants` | float64 | Contributions and grants received |
| `government_grants` | float64 | Government grants specifically |
| `program_service_revenue` | float64 | Program service revenue |
| `investment_income` | float64 | Investment income |
| `other_revenue` | float64 | Derived: total - contributions - program - investment |
| `pct_contributions` | float64 | Contributions / total revenue |
| `pct_program_revenue` | float64 | Program service revenue / total revenue |
| `pct_investment_income` | float64 | Investment income / total revenue |
| `pct_other_revenue` | float64 | Other revenue / total revenue |
| `program_expenses` | float64 | Program service expenses |
| `management_general_expenses` | float64 | Management and general expenses |
| `fundraising_expenses` | float64 | Fundraising expenses |
| `total_functional_expenses` | float64 | Total functional expenses (should ≈ total_expenses) |
| `grants_paid` | float64 | Grants and allocations paid |
| `compensation_top_officer` | float64 | Compensation of current officers/directors/trustees |
| `cash_non_interest_bearing` | float64 | Cash — non-interest-bearing, EOY |
| `savings_temporary_investments` | float64 | Savings and temporary cash investments, EOY |
| `unrestricted_net_assets` | float64 | Unrestricted net assets, EOY (pre-2018 terminology) |
| `temp_restricted_net_assets` | float64 | Temporarily restricted net assets, EOY (pre-2018 only) |
| `perm_restricted_net_assets` | float64 | Permanently restricted net assets, EOY (pre-2018 only) |
| `num_employees` | Int64 | Number of employees |
| `num_voting_board_members` | Int64 | Number of voting board members |
| `formation_year` | Int64 | Year the organization was formed |
| `mission_desc` | string | Mission description (truncated to 500 chars) |
| `years_of_data` | Int64 | Count of fiscal years present for this EIN |
| `submitted_on` | string | IRS filing timestamp (populated only for IRS-sourced rows) |

v3 adds three more columns: `ntee_code` (string), `ntee_major_category` (string), `ntee_major_category_name` (string).

## Known Data Quality Caveats

1. **`formation_year` is NOT a website URL.** The source field `FORMATIONORM` was mislabeled in initial dictionary review. Values are years (e.g. 1920, 1993). Junk values outside 1700–2026 (e.g. 1003, 9999) should be clamped to null at load time.

2. **IRS-sourced rows are null on new columns.** Rows with `submitted_on` populated (~167K, 4.4% of panel) come from raw IRS XML and are null on all 14 columns added in v2 (program_expenses through formation_year). Filter these out for analyses that depend on the new columns.

3. **Donor-restriction terminology shifted in 2018.** FASB ASU 2016-14 replaced "unrestricted / temporarily restricted / permanently restricted" with "without / with donor restrictions." In the data: `perm_restricted_net_assets` drops to 0% populated after 2018; `temp_restricted_net_assets` drops from ~33% to ~10% by 2024; `unrestricted_net_assets` drops from ~75% to ~28% by 2024. Post-2018 filings use a single "without donor restrictions" field that maps to `unrestricted_net_assets`.

4. **Sentinel junk in count fields.** `num_employees` has max 999,999 and `num_voting_board_members` has max 830,201. Cap at 200,000 and 500 respectively at feature engineering time.

5. **Negative expense values are real.** Negative values on expense fields (e.g. program_expenses = -188M) represent filer corrections / adjustments, not parse errors. Do not drop them blindly.

6. **Amendment handling.** For the ~1,600 (EIN, tax_period_end) pairs appearing in both GivingTuesday and IRS batches with different financial values, the IRS version is retained as the more recent filing.

## Regeneration Instructions

| Script | Output | Approx. time |
|--------|--------|---------------|
| `python3 parsing/build_panel.py` | `data/processed/panel_990.parquet` (Layer 1) | ~3 min |
| `python3 parsing/extend_panel.py` | `data/processed/panel_990_extended.parquet` (Layer 2) | ~30 min (incl. download) |
| `python3 parsing/build_panel_v2.py` | `data/processed/panel_990_extended_v2.parquet` (Layer 2b) | ~6 min |
| `python3 parsing/enrich_ntee.py` | `data/processed/panel_990_extended_v3.parquet` (Layer 3) | TBD |

Requires: Python 3.12+, pandas, pyarrow, lxml, scipy. Activate `.venv` before running.

Raw data sources (not committed, download separately):
- `data/raw/gt_basic120.csv` — GivingTuesday Basic 120 Fields mart (~2.3 GB)
- `data/raw/gt_missions.csv` — GivingTuesday Missions mart
- `raw_data/` — IRS monthly XML ZIPs (Nov 2025–Feb 2026)

## Parquet Distribution

Parquet files are too large for git (539 MB for v2). Share via Google Drive:
- **Link**: _(to be added by Saurav after upload)_

## Validation

Cross-validated against independently parsed IRS raw XML (`parsing/parse_990.py` + `parsing/validate_panel.py`): **99.2% exact match** on total_assets_eoy, total_liabilities_eoy, net_assets_eoy, and program_service_revenue across 20,075 field comparisons.
