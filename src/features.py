"""
Stage 1 – metric computation.

Implements the four core formulas locked in checkpoint1_contract.json
plus the shadow revenue_diversification_index_renormalized metric.
"""
from __future__ import annotations

import pandas as pd

PCT_COLS = [
    "pct_contributions",
    "pct_program_revenue",
    "pct_investment_income",
    "pct_other_revenue",
]

# The three metrics used for resilient-benchmark qualification.
BENCHMARK_METRICS = [
    "operating_margin",
    "operating_runway_proxy_months",
    "revenue_diversification_index",
]

# All four computed metrics (benchmark set + shock absorption).
ALL_METRICS = BENCHMARK_METRICS + ["shock_absorption_months"]


def compute_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add metric columns to a copy of *df* and return it.

    Columns added
    -------------
    operating_margin
    operating_runway_proxy_months
    revenue_diversification_index
    revenue_diversification_index_renormalized  (shadow, not used for scoring)
    shock_absorption_months
    """
    out = df.copy()

    rev = pd.to_numeric(out["total_revenue"], errors="coerce")
    exp = pd.to_numeric(out["total_expenses"], errors="coerce")
    net = pd.to_numeric(out["net_assets_eoy"], errors="coerce")
    cash = pd.to_numeric(out["cash_non_interest_bearing"], errors="coerce").fillna(0.0)
    savs = pd.to_numeric(out["savings_temporary_investments"], errors="coerce").fillna(0.0)

    monthly_exp = exp / 12.0

    # operating_margin = (total_revenue - total_expenses) / total_revenue
    out["operating_margin"] = (rev - exp) / rev.where(rev.notna() & rev.ne(0.0))

    # operating_runway_proxy_months = net_assets_eoy / (total_expenses / 12)
    out["operating_runway_proxy_months"] = net / monthly_exp.where(
        monthly_exp.notna() & monthly_exp.ne(0.0)
    )

    # revenue_diversification_index = 1 - HHI with zero-fill for null pct_ cols
    # Contract rule: if ALL four pct_ cols are null → set index to null
    pct_df = out[PCT_COLS].apply(pd.to_numeric, errors="coerce")
    all_null_mask = pct_df.isna().all(axis=1)
    filled = pct_df.fillna(0.0)
    hhi = (filled**2).sum(axis=1)
    out["revenue_diversification_index"] = (1.0 - hhi).where(~all_null_mask)

    # Shadow metric: drop nulls, rescale remaining shares to sum to 1, recompute HHI
    valid_sum = pct_df.sum(axis=1, min_count=1)  # NaN when all cols are NaN
    renorm = pct_df.div(valid_sum, axis=0)
    hhi_renorm = (renorm**2).sum(axis=1, min_count=1)
    out["revenue_diversification_index_renormalized"] = (1.0 - hhi_renorm).where(
        valid_sum.notna() & valid_sum.ne(0.0)
    )

    # shock_absorption_months = (cash + savings) / (total_expenses / 12)
    out["shock_absorption_months"] = (cash + savs) / monthly_exp.where(
        monthly_exp.notna() & monthly_exp.ne(0.0)
    )

    return out
