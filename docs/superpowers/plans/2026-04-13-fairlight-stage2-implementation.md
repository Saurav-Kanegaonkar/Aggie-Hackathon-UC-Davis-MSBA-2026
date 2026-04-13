# Fairlight Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 2 enrichment pipeline that reads canonical Stage 1 scored rows, hydrates raw financial inputs from the merged scoring base, and writes contract-compliant stress test, recovery analog, and urgency fields to `outputs/stage2/scored_rows_enriched.parquet`.

**Architecture:** Add a new `scoring/` package on this branch with a Stage 2 entrypoint plus focused modules for hydration, stress, analog retrieval, and urgency. Keep contract logic deterministic and testable with fixture-sized DataFrames so the code can be verified without the full production parquet present locally.

**Tech Stack:** Python, pandas, numpy, jsonschema, pytest

---

## File Structure

- Create: `scoring/__init__.py`
- Create: `scoring/stage2_build.py`
- Create: `scoring/stage2_hydrate.py`
- Create: `scoring/stage2_stress.py`
- Create: `scoring/stage2_analogs.py`
- Create: `scoring/stage2_urgency.py`
- Create: `config/schemas/checkpoint2_scored_row.schema.json`
- Create: `tests/test_stage2_stress.py`
- Create: `tests/test_stage2_analogs.py`
- Create: `tests/test_stage2_build.py`

### Task 1: Add Stage 2 Output Schema

**Files:**
- Create: `config/schemas/checkpoint2_scored_row.schema.json`
- Test: `tests/test_stage2_build.py`

- [ ] **Step 1: Write the failing schema-presence test**

```python
import json
from pathlib import Path


def test_checkpoint2_schema_lists_required_stage2_fields():
    schema = json.loads(
        Path("config/schemas/checkpoint2_scored_row.schema.json").read_text()
    )

    expected = {
        "largest_revenue_source",
        "largest_revenue_source_pct",
        "gov_dependency_pct",
        "stress_25pct_post_shock_revenue",
        "stress_25pct_burn_months",
        "stress_25pct_severity",
        "stress_50pct_post_shock_revenue",
        "stress_50pct_burn_months",
        "stress_50pct_severity",
        "stress_test_status",
        "recovery_analog_eins",
        "recovery_analog_count",
        "recovery_analog_evidence",
        "recovery_analog_constraint",
        "recovery_analog_status",
        "urgency_flag",
        "urgency_severity",
        "urgency_reason",
    }

    assert expected.issubset(schema["properties"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_stage2_build.py::test_checkpoint2_schema_lists_required_stage2_fields -v`
Expected: FAIL because `config/schemas/checkpoint2_scored_row.schema.json` does not exist yet

- [ ] **Step 3: Write minimal schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Checkpoint2ScoredRow",
  "type": "object",
  "properties": {
    "ein": { "type": "string" },
    "fiscal_year": { "type": "integer" },
    "largest_revenue_source": { "type": ["string", "null"] },
    "largest_revenue_source_pct": { "type": ["number", "null"] },
    "gov_dependency_pct": { "type": ["number", "null"] },
    "stress_25pct_post_shock_revenue": { "type": ["number", "null"] },
    "stress_25pct_burn_months": { "type": ["number", "null"] },
    "stress_25pct_severity": { "type": ["string", "null"] },
    "stress_50pct_post_shock_revenue": { "type": ["number", "null"] },
    "stress_50pct_burn_months": { "type": ["number", "null"] },
    "stress_50pct_severity": { "type": ["string", "null"] },
    "stress_test_status": { "type": ["string", "null"] },
    "recovery_analog_eins": { "type": ["array", "null"], "items": { "type": "string" } },
    "recovery_analog_count": { "type": ["integer", "null"] },
    "recovery_analog_evidence": { "type": ["array", "null"], "items": { "type": "object" } },
    "recovery_analog_constraint": { "type": ["string", "null"] },
    "recovery_analog_status": { "type": ["string", "null"] },
    "urgency_flag": { "type": ["boolean", "null"] },
    "urgency_severity": { "type": ["string", "null"] },
    "urgency_reason": { "type": ["string", "null"] }
  },
  "required": ["ein", "fiscal_year"],
  "additionalProperties": true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_stage2_build.py::test_checkpoint2_schema_lists_required_stage2_fields -v`
Expected: PASS

### Task 2: Implement Stress Test And Urgency Modules

**Files:**
- Create: `scoring/stage2_stress.py`
- Create: `scoring/stage2_urgency.py`
- Test: `tests/test_stage2_stress.py`

- [ ] **Step 1: Write failing stress/urgency tests**

```python
import pandas as pd

from scoring.stage2_stress import enrich_stress_fields
from scoring.stage2_urgency import enrich_urgency_fields


def test_stress_module_sets_none_severity_and_null_burn_when_profitable_post_shock():
    df = pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "benchmark_status": "ok",
                "total_revenue": 1000.0,
                "total_expenses": 700.0,
                "cash_non_interest_bearing": 120.0,
                "savings_temporary_investments": 0.0,
                "net_assets_eoy": 50.0,
                "contributions_grants": 800.0,
                "program_service_revenue": 200.0,
                "investment_income": 0.0,
                "other_revenue": 0.0,
            }
        ]
    )

    out = enrich_stress_fields(df)

    assert out.loc[0, "largest_revenue_source"] == "contributions"
    assert out.loc[0, "stress_25pct_severity"] == "none"
    assert pd.isna(out.loc[0, "stress_25pct_burn_months"])


def test_urgency_module_preserves_binary_rule_and_acute_subtier():
    df = pd.DataFrame(
        [
            {
                "benchmark_status": "ok",
                "shock_absorption_months": 0.8,
                "operating_margin": -0.15,
            }
        ]
    )

    out = enrich_urgency_fields(df)

    assert out.loc[0, "urgency_flag"] is True
    assert out.loc[0, "urgency_severity"] == "acute"
    assert (
        out.loc[0, "urgency_reason"]
        == "negative_margin_and_lt1m_shock_absorption_and_margin_below_neg10pct"
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_stage2_stress.py -v`
Expected: FAIL because `scoring.stage2_stress` and `scoring.stage2_urgency` do not exist yet

- [ ] **Step 3: Write minimal stress and urgency implementations**

```python
# scoring/stage2_stress.py
SOURCE_MAP = [
    ("contributions", "contributions_grants"),
    ("program_revenue", "program_service_revenue"),
    ("investment_income", "investment_income"),
    ("other_revenue", "other_revenue"),
]


def enrich_stress_fields(df: pd.DataFrame) -> pd.DataFrame:
    ...
```

```python
# scoring/stage2_urgency.py
def enrich_urgency_fields(df: pd.DataFrame) -> pd.DataFrame:
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_stage2_stress.py -v`
Expected: PASS

### Task 3: Implement Raw-Input Hydration

**Files:**
- Create: `scoring/stage2_hydrate.py`
- Test: `tests/test_stage2_build.py`

- [ ] **Step 1: Write failing hydration tests**

```python
import pandas as pd

from scoring.stage2_hydrate import hydrate_stage2_inputs


def test_hydration_keeps_stage1_row_count_and_adds_raw_columns():
    scored = pd.DataFrame(
        [{"ein": "1", "fiscal_year": 2024, "benchmark_status": "ok"}]
    )
    panel = pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "tax_period_end": "2024-12-31",
                "total_revenue": 100.0,
                "total_expenses": 80.0,
                "cash_non_interest_bearing": 10.0,
                "savings_temporary_investments": 5.0,
                "contributions_grants": 60.0,
                "program_service_revenue": 40.0,
                "investment_income": 0.0,
                "other_revenue": 0.0,
                "government_grants": 20.0,
                "net_assets_eoy": 15.0,
                "ntee_major_category": "B",
                "state": "CA",
            }
        ]
    )

    out = hydrate_stage2_inputs(scored, panel)

    assert len(out) == 1
    assert out.loc[0, "total_revenue"] == 100.0
    assert out.loc[0, "government_grants"] == 20.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_stage2_build.py::test_hydration_keeps_stage1_row_count_and_adds_raw_columns -v`
Expected: FAIL because `scoring.stage2_hydrate` does not exist yet

- [ ] **Step 3: Write minimal hydration implementation**

```python
RAW_STAGE2_COLUMNS = [
    "tax_period_end",
    "total_revenue",
    "total_expenses",
    "cash_non_interest_bearing",
    "savings_temporary_investments",
    "contributions_grants",
    "program_service_revenue",
    "investment_income",
    "other_revenue",
    "government_grants",
    "net_assets_eoy",
    "ntee_major_category",
    "size_bucket",
    "state",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_stage2_build.py::test_hydration_keeps_stage1_row_count_and_adds_raw_columns -v`
Expected: PASS

### Task 4: Implement Recovery Analog Retrieval

**Files:**
- Create: `scoring/stage2_analogs.py`
- Test: `tests/test_stage2_analogs.py`

- [ ] **Step 1: Write failing analog tests**

```python
import pandas as pd

from scoring.stage2_analogs import enrich_recovery_analogs


def test_analog_module_marks_not_applicable_for_not_scoreable_rows():
    scored = pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "benchmark_status": "not_scoreable",
                "operating_margin_gap": -1.0,
                "operating_runway_gap": -0.5,
                "revenue_diversification_gap": -0.2,
            }
        ]
    )

    panel = pd.DataFrame([])

    out = enrich_recovery_analogs(scored, panel)

    assert out.loc[0, "recovery_analog_status"] == "not_applicable"
    assert out.loc[0, "recovery_analog_count"] == 0


def test_primary_constraint_uses_most_negative_gap_with_fixed_tie_break():
    scored = pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "benchmark_status": "ok",
                "operating_margin_gap": -1.0,
                "operating_runway_gap": -1.0,
                "revenue_diversification_gap": -0.2,
            }
        ]
    )

    panel = pd.DataFrame([])

    out = enrich_recovery_analogs(scored, panel)

    assert out.loc[0, "recovery_analog_constraint"] == "low_margin"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_stage2_analogs.py -v`
Expected: FAIL because `scoring.stage2_analogs` does not exist yet

- [ ] **Step 3: Write minimal analog implementation**

```python
CONSTRAINT_ORDER = [
    ("operating_margin_gap", "low_margin"),
    ("operating_runway_gap", "low_runway"),
    ("revenue_diversification_gap", "high_concentration_in_volatile_source"),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_stage2_analogs.py -v`
Expected: PASS

### Task 5: Wire Stage 2 Build Entry Point

**Files:**
- Create: `scoring/stage2_build.py`
- Create: `scoring/__init__.py`
- Modify: `tests/test_stage2_build.py`

- [ ] **Step 1: Write failing build integration test**

```python
import pandas as pd
from pathlib import Path

from scoring.stage2_build import build_stage2


def test_build_stage2_writes_parquet(tmp_path: Path):
    stage1_path = tmp_path / "scored_rows.parquet"
    panel_path = tmp_path / "panel.parquet"
    output_path = tmp_path / "scored_rows_enriched.parquet"

    pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "benchmark_status": "ok",
                "operating_margin": -0.2,
                "shock_absorption_months": 0.5,
                "operating_margin_gap": -1.0,
                "operating_runway_gap": -0.4,
                "revenue_diversification_gap": -0.3,
            }
        ]
    ).to_parquet(stage1_path, index=False)

    pd.DataFrame(
        [
            {
                "ein": "1",
                "fiscal_year": 2024,
                "tax_period_end": "2024-12-31",
                "total_revenue": 100.0,
                "total_expenses": 120.0,
                "cash_non_interest_bearing": 12.0,
                "savings_temporary_investments": 0.0,
                "contributions_grants": 90.0,
                "program_service_revenue": 10.0,
                "investment_income": 0.0,
                "other_revenue": 0.0,
                "government_grants": 0.0,
                "net_assets_eoy": -5.0,
                "ntee_major_category": "B",
                "size_bucket": "<500K",
                "state": "CA",
            }
        ]
    ).to_parquet(panel_path, index=False)

    out = build_stage2(stage1_path, panel_path, output_path)

    assert output_path.exists()
    assert len(out) == 1
    assert "stress_50pct_severity" in out.columns
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_stage2_build.py::test_build_stage2_writes_parquet -v`
Expected: FAIL because `scoring.stage2_build` does not exist yet

- [ ] **Step 3: Write minimal build pipeline**

```python
def build_stage2(stage1_path, panel_path, output_path):
    scored = pd.read_parquet(stage1_path)
    panel = pd.read_parquet(panel_path)
    hydrated = hydrate_stage2_inputs(scored, panel)
    stressed = enrich_stress_fields(hydrated)
    analoged = enrich_recovery_analogs(stressed, panel)
    urgent = enrich_urgency_fields(analoged)
    urgent.to_parquet(output_path, index=False)
    return urgent
```

- [ ] **Step 4: Run Stage 2 tests**

Run: `pytest tests/test_stage2_build.py tests/test_stage2_stress.py tests/test_stage2_analogs.py -v`
Expected: PASS
