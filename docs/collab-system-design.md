# Collaborative AI Orchestration System — Design Doc

## Team
- **Person A (Saurav)**: Working with Claude (claude.ai / Claude Code)
- **Person B (Vedant)**: Working with Codex / Antigravity
- **Person C (Amal)**: Working with Cursor

---

## Problem
Three people working on the same codebase, each using different AI assistants. We need a way for all AIs to:
1. Know what the other people are working on
2. Understand the current state of the project
3. Avoid conflicts and duplicated work (when working on separate tasks)
4. Support multiple people working on the same task independently (competitive mode)
5. Contribute to a single clean codebase

---

## Architecture Overview

```
┌─────────────┐
│  Person A   │
│  + Claude   │◄──┐
└─────────────┘   │
                  │     ┌──────────────────┐
┌─────────────┐   ├────►│   Orchestrator   │
│  Person B   │   │     │  (Python script)  │
│  + Codex    │◄──┤     └────────┬─────────┘
└─────────────┘   │              │
                  │     ┌────────▼─────────┐
┌─────────────┐   │     │   Shared Repo    │
│  Person C   │   │     │     (GitHub)     │
│  + Cursor   │◄──┘     │                  │
└─────────────┘         │  - state/        │
                        │  - history/      │
                        │  - docs/         │
                        └──────────────────┘
```

### Components

#### 1. Shared Git Repo
A single GitHub/GitLab repo for all course assignments. The hackathon uses a separate repo.

#### 2. Versioned State Files (instead of one `state.json`)
To reduce merge conflicts and improve reliability, state is split:

- `state/index.json` (summary + context version + task pointers)
- `state/tasks/task-XX.json` (per-task details)
- `state/events.jsonl` (append-only event log)
- `state/schema/state.schema.json` (index schema)
- `state/schema/task.schema.json` (task schema)

**Critical rule:** state files only hold the CURRENT assignment. On submission, state is archived and reset.

---

## State Files

### `state/index.json` (summary)

```json
{
  "project": "BAX-423 HW1",
  "context_version": 4,
  "created": "2026-04-01T10:00:00Z",
  "last_updated": "2026-04-11T14:30:00Z",
  "updated_by": "Saurav",
  "updated_from_commit": "030e6cc354526e062b03167c09b98ce5a85841fb",
  "tasks": [
    {
      "id": "task-01",
      "path": "state/tasks/task-01.json",
      "mode": "split",
      "status": "in_progress"
    },
    {
      "id": "task-02",
      "path": "state/tasks/task-02.json",
      "mode": "compete",
      "status": "submitted"
    }
  ],
  "decisions": [
    { "text": "Using Python 3.11", "scope": "global" },
    { "text": "All functions must have docstrings and type hints", "scope": "global" },
    { "text": "Test files go in /tests", "scope": "global" }
  ],
  "open_questions": [
    "Should we use numpy for random number generation or stdlib?"
  ],
  "recent_changes": [
    {
      "timestamp": "2026-04-11T13:00:00Z",
      "author": "Saurav",
      "summary": "Recorded submission for task-02 by Saurav"
    }
  ]
}
```

### `state/tasks/task-02.json` (compete with evidence)

```json
{
  "id": "task-02",
  "description": "Implement reservoir sampling",
  "intent": "Implement reservoir sampling that handles streams of unknown length in O(n) time with O(k) space, producing a uniformly random sample",
  "mode": "compete",
  "status": "submitted",
  "acceptance_checks": [
    "correctness tests pass",
    "handles empty and single-element streams",
    "uniform sample distribution sanity check"
  ],
  "arbitration": {
    "method": "human_review",
    "criteria": ["correctness", "performance", "memory_efficiency", "readability"],
    "weights": {
      "correctness": 0.5,
      "readability": 0.2,
      "performance": 0.2,
      "memory_efficiency": 0.1
    }
  },
  "submissions": [
    {
      "author": "Saurav",
      "branch": "feat/reservoir-sampling-a",
      "status": "submitted",
      "notes": "Array-based approach",
      "commit_sha": "030e6cc354526e062b03167c09b98ce5a85841fb",
      "test_command": "pytest -q",
      "test_result": "pass",
      "benchmark_command": "python bench.py",
      "benchmark_result": "1M rows in 0.81s"
    },
    {
      "author": "Vedant",
      "branch": "feat/reservoir-sampling-b",
      "status": "submitted",
      "notes": "Generator-based approach, memory efficient",
      "commit_sha": null,
      "test_command": null,
      "test_result": null,
      "benchmark_command": null,
      "benchmark_result": null
    }
  ],
  "winner": null,
  "winner_selected_by": null,
  "comparison_notes": null
}
```

---

## Task Modes

### `split` — One person owns it

```json
{
  "id": "task-01",
  "intent": "Build a consistent hashing ring with virtual node support",
  "mode": "split",
  "assigned_to": "Saurav",
  "status": "in_progress",
  "branch": "feat/consistent-hashing",
  "acceptance_checks": ["unit tests pass"]
}
```

### `compete` — All attempt it, best wins

```json
{
  "id": "task-02",
  "intent": "Implement reservoir sampling for unknown-length streams in O(n) time, O(k) space",
  "mode": "compete",
  "arbitration": {
    "criteria": ["correctness", "performance", "memory_efficiency", "readability"],
    "weights": {
      "correctness": 0.5,
      "readability": 0.2,
      "performance": 0.2,
      "memory_efficiency": 0.1
    },
    "method": "human_review"
  },
  "submissions": [
    {
      "author": "Saurav",
      "branch": "feat/reservoir-sampling-a",
      "status": "submitted",
      "commit_sha": "...",
      "test_command": "pytest -q",
      "test_result": "pass"
    },
    {
      "author": "Vedant",
      "branch": "feat/reservoir-sampling-b",
      "status": "submitted",
      "commit_sha": "...",
      "test_command": "pytest -q",
      "test_result": "pass"
    },
    {
      "author": "Amal",
      "branch": "feat/reservoir-sampling-c",
      "status": "submitted",
      "commit_sha": "...",
      "test_command": "pytest -q",
      "test_result": "pass"
    }
  ],
  "winner": null,
  "comparison_notes": null
}
```

For compete tasks, the team verbally reviews each submission and runs `set-winner` to record the decision.

### `collab` — All work on the same branch together

```json
{
  "id": "task-03",
  "intent": "Full test coverage including edge cases",
  "mode": "collab",
  "assigned_to": ["Saurav", "Vedant", "Amal"],
  "status": "in_progress",
  "branch": "feat/integration-tests",
  "notes": "A does setup, B writes cases, C handles edge cases"
}
```

---

## Repo Structure

```text
repo/
├── state/
│   ├── index.json
│   ├── events.jsonl
│   ├── schema/
│   │   ├── state.schema.json
│   │   └── task.schema.json
│   └── tasks/
│       ├── task-01.json
│       ├── task-02.json
│       └── ...
├── orchestrator/
│   ├── orchestrator.py
│   ├── validate_state.py
│   └── README.md
├── history/
│   └── snapshot-<timestamp>-v<context_version>/
├── docs/
│   └── merge_checklist.md
├── hw1/
├── hw2/
├── .gitignore
└── README.md
```

---

## State Management and Concurrency

### Context Versioning
`state/index.json` includes `context_version` that increments on every update.

How it works:
- updates can specify `--expected-context-version`
- if expected version mismatches current version, update fails with stale-context error
- updater then re-read/retry

This is lightweight optimistic concurrency using git files.

### Other Reliability Rules
- writes are atomic (`.tmp` then replace)
- update path uses file lock (`state/index.json.lock`) to avoid concurrent corruption
- `recent_changes` capped at 15 entries
- schema validation required before saving state updates

---

## Orchestrator CLI (`orchestrator/orchestrator.py`)

A lightweight local script. It can run on-demand or via watch mode.

### Implemented commands

1. `add-change`
- appends to `recent_changes`
- bumps `context_version`
- updates `updated_by`, `updated_from_commit`, `last_updated`
- validates state and task schemas

2. `record-submission`
- updates compete submission evidence fields for a task
- sets task status (`in_progress` or `submitted`)
- syncs status back to `state/index.json`
- bumps `context_version`
- validates schemas

3. `set-winner`
- records the winner of a compete task after team review
- sets `winner`, `winner_selected_by`, `comparison_notes` on the task
- marks task status as `done` and syncs back to `state/index.json`
- validates all schemas before writing (no disk writes on failure)
- supports `--commit` for atomic git commit of both files
- required args: `--task-id`, `--winner`, `--selected-by`, `--notes`

4. `archive-project`
- archives current `state/` snapshot to `history/snapshot-...`
- resets assignment state:
  - `context_version = 1`
  - clears `open_questions`, `recent_changes`, events
  - preserves `decisions` where `scope == global`
  - resets task statuses and assignment-specific task fields

5. `watch`
- polls git history for new commits
- appends summarized entries into `recent_changes`
- can optionally commit state updates
- ignores likely self-authored orchestrator commits (`--bot-author`, `--bot-email`, or subject prefix `orchestrator:`)

### Validation command
`orchestrator/validate_state.py` validates index state against schema.

---

## Example Commands

```bash
python orchestrator/validate_state.py
```

```bash
python orchestrator/orchestrator.py add-change \
  --author Saurav \
  --summary "Implemented consistent hashing"
```

```bash
python orchestrator/orchestrator.py record-submission \
  --task-id task-02 \
  --author Saurav \
  --branch feat/reservoir-sampling-a \
  --test-command "pytest -q" \
  --test-result "pass" \
  --benchmark-command "python bench.py" \
  --benchmark-result "1M rows in 0.81s"
```

```bash
python orchestrator/orchestrator.py set-winner \
  --task-id task-02 \
  --winner Vedant \
  --selected-by "team consensus on call" \
  --notes "Generator approach was more memory efficient"
```

```bash
python orchestrator/orchestrator.py archive-project \
  --updated-by Saurav
```

```bash
python orchestrator/orchestrator.py watch --once
```

---

## What the Orchestrator Does and Does Not Do

### Does
- Keep shared context updated and validated
- Enforce lightweight concurrency checks
- Record submission evidence for compete tasks
- Produce deterministic compare output from rubric data
- Archive and reset state safely between assignments

### Does NOT
- Write assignment code
- Make architectural decisions
- Merge to main automatically
- Replace human judgment for final winner selection (unless team explicitly chooses auto mode)

---

## Branching & State Workflow

**Rule: State files live on `main`. Feature work lives on branches.**

### Why
- `state/index.json` and `state/tasks/*.json` are the shared context both AIs read
- If state only exists on one person's feature branch, the other person can't see it
- Keeping state on `main` avoids merge conflicts between compete branches

### Flow
```text
1. State setup committed to main (task definitions, submission slots)
2. Person A creates feat/task-X-a from main
3. Person B creates feat/task-X-b from main
4. Person C creates feat/task-X-c from main
5. All read state from main at session start
6. Submission records go on feature branches (orchestrator updates)
7. After winner is picked via set-winner → winning branch merged to main
8. State updated on main with winner info
```

### Start session
1. Pull latest `main`
2. Read `state/index.json` and relevant `state/tasks/task-XX.json` from main
3. Switch to your feature branch and work

### End session
1. Push your feature branch
2. Record state update with orchestrator command
3. Validate state if needed

### Useful prompts
- "Read state/index.json and tell me where we stand."
- "Read state/tasks/task-02.json and compare submissions against arbitration criteria."
- "Does my current branch output satisfy acceptance_checks for task-01?"

---

## API Setup

Optional: orchestrator can call an LLM API for richer summaries.

- OpenRouter (recommended)
- Claude API
- Groq

Current implemented flows do not require API usage to function.

---

## Workflow Example (Assignment)

```text
1. Assignment posted
2. Team defines split/compete/collab tasks and intents
3. Update state/index.json + task files
4. Both work on branches with their preferred AI providers
5. Record progress and submissions with orchestrator commands
6. Compare compete task outputs and pick winner/hybrid
7. Complete merge checklist, merge to main, submit
8. Run archive-project to snapshot and reset for next assignment
```

---

## Merge Checklist

Use `docs/merge_checklist.md` before selecting a winner for compete tasks.

Minimum requirements:
- all submissions include `commit_sha`
- test command and results present
- winner recorded via `set-winner` command (not hand-edited)
- `winner`, `winner_selected_by`, and `comparison_notes` set

---

## Fallback Plan

If automation feels heavy in a given week:
- skip watcher mode
- manually run `add-change` and `record-submission`
- manually compare and pick winner
- still keep state files updated

The system degrades gracefully while preserving shared context.

---

## Next Steps

1. Keep working in shared repo (`agent-collab`)
2. Ensure each submission records `commit_sha` and test evidence
3. Use compare command + checklist before merges
4. Use archive command after each assignment
5. Optionally add Slack/Discord notifier later (nice-to-have)

---

## Open Questions
- [ ] Keep arbitration default as `human_review` or switch some tasks to `auto`?
- [ ] Add required `commit_sha` at task schema level for submitted entries?
- [ ] Add CI check to fail PR if state/task schemas are invalid?
- [ ] Add automatic winner write-back option (with human confirmation)?
