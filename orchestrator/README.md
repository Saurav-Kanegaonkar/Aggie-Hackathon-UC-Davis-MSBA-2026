# Orchestrator Plan

This folder contains the lightweight coordination script and validators.

Components:

- `validate_state.py`: validate `state/index.json` against schema.
- `orchestrator.py`: safe state updates, `context_version` bumping, stale-write guard.
- `state/schema/task.schema.json`: task detail schema used by orchestrator task-file validation.
- optional helper commands (next):
  - `archive-project`
  - `record-submission`
  - `set-winner`
  - `watch`

Design requirements:

1. Ignore self-generated bot commits to avoid loops.
2. Abort write if current `context_version` has changed since read.
3. Ensure `recent_changes` is capped at 15 entries.
4. Require schema validation before writing state updates.

## Validation script

`validate_state.py` is implemented and validates `state/index.json` against `state/schema/state.schema.json`.

Usage:

```bash
python orchestrator/validate_state.py
```

Optional path overrides:

```bash
python orchestrator/validate_state.py \
  --state state/index.json \
  --schema state/schema/state.schema.json
```

Dependency:

- `jsonschema` (install with `pip install jsonschema`)

## Orchestrator script

`orchestrator.py` currently provides:

- `add-change`: appends to `recent_changes`, updates metadata fields, validates schema, writes atomically.
- `record-submission`: updates a compete task submission in `state/tasks/task-XX.json`, updates `state/index.json`, bumps `context_version`, validates schema, writes atomically.
- `set-winner`: records the winner of a compete task, sets status to done, validates all schemas before writing, supports `--commit`.
- `archive-project`: archives the current state snapshot to `history/`, resets assignment state safely, and sets `context_version` to `1`.
- `watch`: polls git history for new commits, appends `recent_changes`, and can optionally commit `state/index.json`.

Task-schema validation:

- `add-change`, `record-submission`, `archive-project`, and `watch` validate all task files referenced by `state/index.json` against `state/schema/task.schema.json`.
- Override with `--task-schema` if needed.

Usage:

```bash
python orchestrator/orchestrator.py add-change \
  --author person_a \
  --summary "Implemented X"
```

Optional stale-context check:

```bash
python orchestrator/orchestrator.py add-change \
  --author person_a \
  --summary "Implemented X" \
  --expected-context-version 2
```

Optional commit:

```bash
python orchestrator/orchestrator.py add-change \
  --author person_a \
  --summary "Implemented X" \
  --commit
```

Record a compete submission:

```bash
python orchestrator/orchestrator.py record-submission \
  --task-id task-02 \
  --author person_a \
  --branch feat/reservoir-sampling-a \
  --test-command "pytest -q" \
  --test-result "pass" \
  --benchmark-command "python bench.py" \
  --benchmark-result "1M rows in 0.81s"
```

Optional stale-context check and commit:

```bash
python orchestrator/orchestrator.py record-submission \
  --task-id task-02 \
  --author person_a \
  --expected-context-version 3 \
  --commit
```

Record a compete task winner:

```bash
python orchestrator/orchestrator.py set-winner \
  --task-id task-02 \
  --winner person_b \
  --selected-by "team consensus on call" \
  --notes "Vedant's gradient look won, cleanest button spacing"
```

With stale-context guard and commit:

```bash
python orchestrator/orchestrator.py set-winner \
  --task-id task-02 \
  --winner person_b \
  --selected-by "team consensus on call" \
  --notes "Vedant's gradient look won, cleanest button spacing" \
  --expected-context-version 5 \
  --commit
```

Run watcher once (single cycle):

```bash
python orchestrator/orchestrator.py watch --once
```

Run watcher continuously (5s polling, default):

```bash
python orchestrator/orchestrator.py watch
```

Watcher with commit + explicit self-author filters:

```bash
python orchestrator/orchestrator.py watch \
  --bot-author orchestrator-bot \
  --bot-email orchestrator@example.com \
  --commit
```

Archive the project state and reset assignment context:

```bash
python orchestrator/orchestrator.py archive-project
```

With stale-context guard and optional commit:

```bash
python orchestrator/orchestrator.py archive-project \
  --expected-context-version 3 \
  --updated-by person_a \
  --commit
```

Notes:

- Snapshot path format: `history/snapshot-<timestamp>-v<context_version>[-label]/state/...`
- `state/index.json` is reset with:
  - preserved `project`, `tasks` wiring, and `decisions` where `scope == "global"`
  - cleared `open_questions` and `recent_changes`
  - `context_version` reset to `1`
- task detail files are reset to `status: not_started` and assignment-specific fields are cleared
- `state/events.jsonl` is archived and then cleared
- watcher mode stores cursor at `state/watch.cursor` by default and skips likely self-authored orchestrator commits (`--bot-author`, `--bot-email`, or commit subject prefix `orchestrator:`)

Exit codes:

- `0`: success or intentional self-author skip
- `1`: schema validation failure
- `2`: runtime/setup error
- `3`: stale context mismatch
