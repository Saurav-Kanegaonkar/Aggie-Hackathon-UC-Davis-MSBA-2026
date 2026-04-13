# Pre-Merge Checklist

Run through this before merging any branch to main.

---

## All branches

- [ ] State files updated via orchestrator command (not hand-edited)
- [ ] Task status in `state/tasks/task-XX.json` reflects reality
- [ ] Schema validation passes locally:
      `python orchestrator/validate_state.py`
- [ ] No `state/index.json.lock` file accidentally staged or committed
- [ ] Branch is up to date with main (rebase or merge main into branch first)

## Compete tasks — single-winner path (additional checks)

- [ ] Winner recorded via `set-winner` command before merge
- [ ] `winner`, `winner_selected_by`, and `comparison_notes` are all set in the task file
- [ ] Only the winning branch is being merged (losing branches stay unmerged)
- [ ] Losing compete branches kept for at least 24 hours (don't delete immediately -- you may want to cherry-pick parts later)

## Compete tasks — checkpointed convergence path (additional checks)

Use this path when the team ratifies a hybrid merge spec at an in-progress compete task checkpoint instead of selecting a single winner. For checkpoint convergence merges inside an active compete task, the ratified merge spec is the audit record. Use `set-winner` only when formally closing a single-winner compete task.

- [ ] Team has ratified a written merge spec identifying which pieces come from which builder
- [ ] Merge spec recorded via `add-change` orchestrator entry (not `set-winner`)
- [ ] One builder produces the merged branch from the ratified spec
- [ ] Merged branch passes the same pre-merge checks as all branches above (state files, schema validation, up-to-date with main)
- [ ] Non-merged builder branches kept for at least 24 hours (same retention rule as losing branches)

## After merge

- [ ] Pull main and verify `python orchestrator/validate_state.py` still passes
- [ ] Delete merged feature branch (remote and local)
