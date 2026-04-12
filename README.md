# Aggie Hackathon -- UC Davis MSBA 2026

**Team:** Real Housewives of Tenderloin
**Members:** Saurav Kanegaonkar, Vedant Tiwari, Amal Farhad Shaji

48-hour hackathon (April 12-14, 2026). This repo contains the team's
collaboration system, task orchestration tooling, and all project code.
The orchestrator manages shared state so three people using different AI
assistants can work on the same codebase without stepping on each other.

---

## Quick Start

New to the repo? Follow the [Onboarding Guide](docs/onboarding.md) for
step-by-step setup on Mac and Windows.

---

## Repo Structure

```
state/
  index.json              -- Current project state (tasks, decisions, changes)
  events.jsonl            -- Append-only event log
  schema/
    state.schema.json     -- JSON Schema for index.json
    task.schema.json      -- JSON Schema for task files
  tasks/
    task-XX.json          -- Per-task details (mode, submissions, winner)

orchestrator/
  orchestrator.py         -- CLI for state updates (add-change, record-submission,
                             compare-compete-task, set-winner, archive-project, watch)
  validate_state.py       -- Schema validator
  README.md               -- Command reference and usage examples

docs/
  collab-system-design.md -- Full system design doc (architecture, modes, workflow)
  onboarding.md           -- First-day setup guide (Mac + Windows)
  merge_checklist.md      -- Pre-merge checklist for branches going into main

history/                  -- Archived project snapshots (after archive-project)
```

---

## Key Commands

Validate state:
```bash
python orchestrator/validate_state.py
```

Record a change:
```bash
python orchestrator/orchestrator.py add-change --author person_a --summary "Built X"
```

Record a compete submission:
```bash
python orchestrator/orchestrator.py record-submission --task-id task-02 --author person_a --branch feat/task-02-a --commit
```

Record a winner:
```bash
python orchestrator/orchestrator.py set-winner --task-id task-02 --winner person_b --selected-by "team consensus" --notes "Reason" --commit
```

See `orchestrator/README.md` for full command reference.

---

## Where to Find Things

| What | Where |
|------|-------|
| System design and architecture | [docs/collab-system-design.md](docs/collab-system-design.md) |
| Setup instructions | [docs/onboarding.md](docs/onboarding.md) |
| Pre-merge checklist | [docs/merge_checklist.md](docs/merge_checklist.md) |
| Command reference | [orchestrator/README.md](orchestrator/README.md) |
| Current project state | [state/index.json](state/index.json) |

---

## Tech Stack

- **Orchestrator:** Python 3.11+ (only dependency: `jsonschema`)
- **Trial project (calculator):** HTML / CSS / vanilla JavaScript, no build tools
- **Hackathon project:** TBD when the problem statement drops on April 12
