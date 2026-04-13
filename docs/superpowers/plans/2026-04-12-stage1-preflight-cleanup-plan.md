# Stage 1 Preflight Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stage 0 executable against the merged contract and reset Stage 1 to a clean, contract-aligned baseline before any checkpoint scoring work begins.

**Architecture:** Keep Stage 0 and Stage 1 aligned to the merged shared contract by fixing the Stage 0 builder first, then replacing the disposable Stage 1 scaffold with a parquet-first interface that matches the current schema. Use TDD throughout so every contract rule is backed by a failing test before implementation.

**Tech Stack:** Python 3, pandas, pyarrow/parquet, unittest, JSON contract + JSON Schema

---

## File Map

- Modify: `/private/tmp/fairlight-task-01-c/analysis/stage0_contract.py`
  - Add curated shared-sample support while preserving legacy quantile fallback.
- Modify: `/private/tmp/fairlight-task-01-c/tests/test_stage0_contract.py`
  - Replace stale fixture expectations with merged-contract expectations.
- Replace: `/private/tmp/fairlight-task-01-c/tests/test_checkpoint1.py`
  - Rewrite around canonical parquet output and current scored-row schema.
- Replace: `/private/tmp/fairlight-task-01-c/analysis/checkpoint1.py`
  - Fresh Stage 1 pipeline aligned to current contract.
- Replace: `/private/tmp/fairlight-task-01-c/analysis/build_checkpoint1.py`
  - Thin CLI wrapper around the Stage 1 pipeline.

## Task 1: Fix Stage 0 Curated Shared Samples

**Files:**
- Modify: `/private/tmp/fairlight-task-01-c/tests/test_stage0_contract.py`
- Modify: `/private/tmp/fairlight-task-01-c/analysis/stage0_contract.py`

- [ ] **Step 1: Write the failing Stage 0 test for curated sample mode**

```python
def test_stage0_cli_uses_curated_shared_samples(self):
    shared_samples, _ = self.run_cli()
    expected = {
        "204374795", "237071436", "203812932", "201384250", "061652679",
        "042800910", "237102713", "020549032", "160470118", "141843628",
        "956125213",
    }
    self.assertEqual(set(shared_samples["ein"].astype(str)), expected)
```

- [ ] **Step 2: Run the Stage 0 tests to verify the new test fails**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_stage0_contract.py' -v`
Expected: FAIL because `analysis/stage0_contract.py` still reads `quantiles` and does not support `method == "curated"`.

- [ ] **Step 3: Implement curated sample support with legacy fallback**

```python
def select_shared_samples(latest: pd.DataFrame, contract: dict) -> pd.DataFrame:
    selection = contract["shared_sample_selection"]
    if selection.get("method") == "curated":
        ein_order = [str(ein) for ein in selection["eins"]]
        curated = latest[latest["ein"].astype(str).isin(ein_order)].copy()
        curated["_order"] = curated["ein"].astype(str).map({ein: idx for idx, ein in enumerate(ein_order)})
        curated["is_shared_sample"] = True
        return curated.sort_values(["_order", "tax_period_end"], kind="mergesort").drop(columns=["_order"])

    quantiles = selection["quantiles"]
    ...
```

- [ ] **Step 4: Run the Stage 0 tests to verify curated samples pass**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_stage0_contract.py' -v`
Expected: PASS for the curated-sample test and no regressions on existing Stage 0 tests.

- [ ] **Step 5: Commit the Stage 0 curated-sample fix**

```bash
git -C /private/tmp/fairlight-task-01-c add \
  analysis/stage0_contract.py \
  tests/test_stage0_contract.py
git -C /private/tmp/fairlight-task-01-c commit -m "fix: support curated Stage 0 shared samples"
```

## Task 2: Bring Stage 0 Tests Up To The Merged Contract

**Files:**
- Modify: `/private/tmp/fairlight-task-01-c/tests/test_stage0_contract.py`

- [ ] **Step 1: Write failing assertions for merged-contract-only fields**

```python
self.assertIn("stage1_output", contract)
self.assertEqual(contract["stage1_output"]["path"], "outputs/stage1/scored_rows.parquet")
null_handling = contract["metric_formulas"]["revenue_diversification_null_handling"]
self.assertIn("rule", null_handling)
self.assertIn("all_null_edge_case", null_handling)
self.assertIn("shadow_metric", null_handling)
```

- [ ] **Step 2: Run the Stage 0 tests to verify any stale fixture assumptions fail**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_stage0_contract.py' -v`
Expected: FAIL if the fixture contract or test logic still assumes the old quantile-only shape.

- [ ] **Step 3: Update the Stage 0 fixture contract to mirror current contract shape**

```python
contract = {
    "states": ["CA", "WA"],
    "submitted_on_filter": {"rule": "include_all", "description": "All rows included regardless of submitted_on."},
    "metric_formulas": {
        "revenue_diversification_null_handling": {
            "rule": "...",
            "all_null_edge_case": "...",
            "shadow_metric": "...",
        }
    },
    "shared_sample_selection": {
        "method": "curated",
        "count": 11,
        "eins": [...],
    },
    "stage1_output": {
        "path": "outputs/stage1/scored_rows.parquet",
        "format": "parquet",
        "schema": "config/schemas/checkpoint1_scored_row.schema.json",
    },
}
```

- [ ] **Step 4: Re-run Stage 0 tests**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_stage0_contract.py' -v`
Expected: PASS and now actually validate the merged contract surface.

- [ ] **Step 5: Commit the Stage 0 contract-test alignment**

```bash
git -C /private/tmp/fairlight-task-01-c add tests/test_stage0_contract.py
git -C /private/tmp/fairlight-task-01-c commit -m "test: align Stage 0 tests with merged contract"
```

## Task 3: Reset Stage 1 Tests To The Canonical Interface

**Files:**
- Replace: `/private/tmp/fairlight-task-01-c/tests/test_checkpoint1.py`

- [ ] **Step 1: Delete the disposable CSV-based Stage 1 scaffold**

Run: `rm -f /private/tmp/fairlight-task-01-c/tests/test_checkpoint1.py`
Expected: file removed so the new test file can be written cleanly from the merged contract.

- [ ] **Step 2: Write the failing parquet-first Stage 1 tests**

```python
def test_checkpoint1_cli_writes_contract_parquet_output(self):
    output_path = self.run_cli()
    self.assertEqual(output_path.name, "scored_rows.parquet")
    scored = pd.read_parquet(output_path)
    self.assertIn("benchmark_operating_margin_q75", scored.columns)
    self.assertIn("benchmark_fallback_step", scored.columns)
    self.assertIn("is_shared_sample", scored.columns)
    self.assertIn("revenue_diversification_index_renormalized", scored.columns)
    self.assertIn("operating_runway_proxy_months", scored.columns)
```

```python
def test_diversification_zero_fill_and_shadow_metric(self):
    scored = pd.read_parquet(self.run_cli())
    row = scored[scored["ein"] == "000000003"].iloc[0]
    self.assertFalse(pd.isna(row["revenue_diversification_index"]))
    self.assertFalse(pd.isna(row["revenue_diversification_index_renormalized"]))
```

- [ ] **Step 3: Run the Stage 1 tests to verify they fail on the missing implementation**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: FAIL because the replacement `build_checkpoint1.py` and `checkpoint1.py` are not yet implemented against the new parquet contract.

- [ ] **Step 4: Save the new Stage 1 test scaffold**

```python
ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "analysis" / "build_checkpoint1.py"
CANONICAL_OUTPUT = ROOT / "outputs" / "stage1" / "scored_rows.parquet"
```

- [ ] **Step 5: Commit the Stage 1 contract-aligned tests**

```bash
git -C /private/tmp/fairlight-task-01-c add tests/test_checkpoint1.py
git -C /private/tmp/fairlight-task-01-c commit -m "test: reset Stage 1 scaffold to parquet contract"
```

## Task 4: Replace The Draft Stage 1 CLI

**Files:**
- Replace: `/private/tmp/fairlight-task-01-c/analysis/build_checkpoint1.py`

- [ ] **Step 1: Write the minimal failing CLI wrapper expectation into tests**

```python
result = subprocess.run(
    [sys.executable, str(CLI), "--input", str(input_path), "--contract", str(contract_path)],
    capture_output=True,
    text=True,
    cwd=ROOT,
)
self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
```

- [ ] **Step 2: Run the Stage 1 tests to verify CLI absence failure**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: FAIL with missing file or missing canonical parquet output.

- [ ] **Step 3: Replace the draft CLI with the thin contract-first wrapper**

```python
#!/usr/bin/env python3
from analysis.checkpoint1 import build_checkpoint1_outputs, load_stage1_inputs, write_checkpoint1_outputs

def main() -> int:
    args = parse_args()
    panel, contract = load_stage1_inputs(args.input, args.contract)
    outputs = build_checkpoint1_outputs(panel, contract)
    write_checkpoint1_outputs(outputs, ROOT, contract)
    return 0
```

- [ ] **Step 4: Re-run Stage 1 tests**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: still FAIL, but now on pipeline behavior rather than missing CLI.

- [ ] **Step 5: Commit the Stage 1 CLI reset**

```bash
git -C /private/tmp/fairlight-task-01-c add analysis/build_checkpoint1.py
git -C /private/tmp/fairlight-task-01-c commit -m "feat: add Stage 1 canonical CLI wrapper"
```

## Task 5: Implement Contract-Aligned Stage 1 Core Logic

**Files:**
- Replace: `/private/tmp/fairlight-task-01-c/analysis/checkpoint1.py`
- Modify: `/private/tmp/fairlight-task-01-c/tests/test_checkpoint1.py`

- [ ] **Step 1: Write a failing test for schema-facing fields**

```python
required = {
    "size_bucket",
    "cohort_level",
    "cohort_key",
    "cohort_size",
    "benchmark_rule",
    "benchmark_fallback_step",
    "benchmark_operating_margin_q75",
    "benchmark_operating_runway_q75",
    "benchmark_revenue_diversification_q75",
    "operating_margin_gap",
    "operating_runway_gap",
    "revenue_diversification_gap",
    "confidence_reason",
    "is_shared_sample",
}
self.assertTrue(required.issubset(set(scored.columns)))
```

- [ ] **Step 2: Run the Stage 1 tests to verify the field coverage fails**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: FAIL on missing columns and incomplete pipeline output.

- [ ] **Step 3: Implement the fresh Stage 1 pipeline**

```python
def build_checkpoint1_outputs(panel: pd.DataFrame, contract: dict) -> pd.DataFrame:
    filtered = filter_stage0_panel(panel, contract)
    deduped = dedupe_panel(filtered, key_fields=contract["key_fields"])
    scored = add_stage1_metrics(deduped, contract)
    scored = assign_stage1_cohorts(scored, contract)
    scored = attach_resilient_benchmarks(scored, contract)
    scored = attach_confidence_fields(scored, contract)
    return scored
```

Implementation requirements:

- honor `benchmark_window.scoring_years == [2023, 2024]`
- compute `operating_runway_proxy_months`
- compute official zero-fill diversification and shadow renormalized diversification
- emit `is_shared_sample` from curated EIN list
- emit benchmark Q75 columns and per-metric gaps
- emit `benchmark_fallback_step`
- emit `confidence_reason`

- [ ] **Step 4: Re-run Stage 1 tests**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: PASS for canonical output path, schema-facing fields, curated sample tagging, and diversification null-handling.

- [ ] **Step 5: Commit the Stage 1 core reset**

```bash
git -C /private/tmp/fairlight-task-01-c add analysis/checkpoint1.py tests/test_checkpoint1.py
git -C /private/tmp/fairlight-task-01-c commit -m "feat: implement contract-aligned Stage 1 baseline"
```

## Task 6: Full Verification

**Files:**
- Modify if needed: `/private/tmp/fairlight-task-01-c/analysis/checkpoint1.py`
- Modify if needed: `/private/tmp/fairlight-task-01-c/tests/test_checkpoint1.py`
- Modify if needed: `/private/tmp/fairlight-task-01-c/tests/test_stage0_contract.py`

- [ ] **Step 1: Run Stage 0 test suite**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_stage0_contract.py' -v`
Expected: PASS

- [ ] **Step 2: Run Stage 1 test suite**

Run: `python3 -m unittest discover -s /private/tmp/fairlight-task-01-c/tests -p 'test_checkpoint1.py' -v`
Expected: PASS

- [ ] **Step 3: Run state validation**

Run: `python3 /private/tmp/fairlight-task-01-c/orchestrator/validate_state.py --state /private/tmp/fairlight-task-01-c/state/index.json --schema /private/tmp/fairlight-task-01-c/state/schema/state.schema.json`
Expected: `OK`

- [ ] **Step 4: Verify branch working tree is clean except for intentional Stage 1 implementation changes**

Run: `git -C /private/tmp/fairlight-task-01-c status --short --branch`
Expected: no ambiguous draft files left over

- [ ] **Step 5: Commit final verification adjustments**

```bash
git -C /private/tmp/fairlight-task-01-c add -A
git -C /private/tmp/fairlight-task-01-c commit -m "test: finish Stage 1 preflight cleanup verification"
```

## Self-Review

Spec coverage:

- Stage 0 curated sample rebuild: covered by Task 1
- Stage 0 merged-contract tests: covered by Task 2
- Stage 1 canonical parquet interface: covered by Tasks 3 and 4
- Stage 1 schema-facing fields: covered by Task 5
- diversification null-handling execution: covered by Task 5

Placeholder scan:

- no `TODO`
- no `TBD`
- every task has exact files, commands, and expected failure/pass signals

Type consistency:

- canonical output path consistently uses `outputs/stage1/scored_rows.parquet`
- Stage 1 metric name consistently uses `operating_runway_proxy_months`
- shared sample tagging consistently uses curated EIN list from contract
