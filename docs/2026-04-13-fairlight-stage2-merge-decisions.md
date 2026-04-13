# Fairlight Stage 2 Merge Decisions

- **Null-NTEE handling:** Adopt CC's interpretation for recovery analog matching: if `ntee_major_category` is null on the target row, skip strict NTEE matching and fall directly to `size_bucket` fallback. Rationale: this is consistent with the locked Stage 1 precedent for null-NTEE cohort routing and produces more actionable analogs for client use.

- **Stress computability gate:** Adopt source-column null-fill when computing `largest_revenue_source` and `largest_revenue_source_pct`, while keeping the hard gate on `total_revenue`, `total_expenses`, `net_assets_eoy`, `cash_non_interest_bearing`, and `savings_temporary_investments`. Rationale: this matches the Stage 1 null-as-zero precedent for source-share construction without weakening the core stress-test computability requirements.

- **Merge owner:** CC drives the Stage 2 merge from `feat/task-02b-a` into the merge branch. Rationale: CC's branch is already the planned merge base, so keeping merge execution there minimizes coordination overhead and avoids unnecessary branch churn.

- **Stage 3:** Out of scope for this memo. Rationale: this memo exists only to settle the open Stage 2 merge calls and should not mix in Stage 3 build-mode or prep decisions.
