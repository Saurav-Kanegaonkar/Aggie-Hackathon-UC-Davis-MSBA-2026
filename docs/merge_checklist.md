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

## Compete tasks (additional checks)

- [ ] Winner recorded via `set-winner` command before merge
- [ ] `winner`, `winner_selected_by`, and `comparison_notes` are all set in the task file
- [ ] Only the winning branch is being merged (losing branches stay unmerged)

## After merge

- [ ] Pull main and verify `python orchestrator/validate_state.py` still passes
- [ ] Delete merged feature branch (remote and local)
