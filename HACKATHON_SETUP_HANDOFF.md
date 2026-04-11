# UC Davis MSBA Hackathon — Repo Setup Handoff

> **Purpose of this document:** Complete context handoff so any Claude instance (this chat, a fresh chat, or Claude Code) can pick up exactly where we left off and continue setting up the hackathon repo and trial project.

---

## 1. Hackathon Context

- **Event:** UC Davis MSBA Hackathon (official, 48 hours)
- **Dates:** Sunday April 12, 2026, 12:00 PM → Tuesday April 14, 2026, 12:00 PM
- **Team name:** Real Housewives of Tenderloin
- **Team members:**
  - Person A: (the user — using Claude / Claude Code) - Saurav Kanegaonkar
  - Person B: Vedant Tiwari
  - Person C: Amal Farhad Shaji
- **Prizes:** Grand Gold $3,000 / Silver $2,000 / Bronze $1,000 per team
- **Goal:** Win the hackathon
- **Deliverables (expected):** Slide deck + video presentation + likely a web application

### What we know about the actual hackathon problem

- **Problem statement:** Not yet released. Will drop Sunday April 12 at 12:00 PM.
- **Data:** Expected to be very large. Many individual files, one per person/entity, in XML, HTML, or PDF format. Will need significant pre-processing.
- **Submission format:** Slide deck + video. Likely also a web application (frontend, not just a dashboard).

### User's strategy

- **First 24 hours:** Build complete end-to-end project including draft slide deck and video
- **Second 24 hours:** Polish, refine, re-record, perfect

---

## 2. Cross-Platform Constraints (CRITICAL)

The team has mixed operating systems:
- **2 members on Mac**
- **1 member on Windows**

This creates several gotchas the setup MUST handle:

| Issue | Fix |
|---|---|
| `fcntl` is Unix-only — Windows will crash on import | Wrap in try/except with `msvcrt.locking()` fallback OR use `portalocker` package |
| CRLF vs LF line endings cause phantom diffs | `.gitattributes` forcing LF for `.json`, `.py`, `.md`, `.jsonl`, `.html`, `.css`, `.js` |
| Shell commands differ (bash vs PowerShell) | Provide both `setup.sh` and `setup.ps1`, document both in README |
| Virtual env activation paths differ | Document `source venv/bin/activate` (Mac) and `venv\Scripts\Activate.ps1` (Windows) |
| File encoding defaults differ | Always specify `encoding="utf-8"` in Python file ops |
| Case-sensitive filenames on Mac/Linux but not Windows | Enforce all-lowercase filenames with underscores |
| Python version mismatch | Pin Python 3.11 in `.python-version` |
| `git config core.autocrlf` | Tell Windows user to run `git config --global core.autocrlf input` |

---

## 3. Collaboration System (Inherited from Class Project)

The team has an existing collaboration system from a class project that we're adapting for the hackathon. Key components:

- **Shared git repo** with state files on `main`, feature work on branches
- **Versioned state files** in `state/` folder (split into `index.json` + per-task files + `events.jsonl`)
- **Three task modes:**
  - `split` — one person owns the task
  - `compete` — multiple people attempt independently, best wins (rubric-scored)
  - `collab` — multiple people work on the same branch together
- **Orchestrator CLI** (`orchestrator/orchestrator.py`) for safe state updates with optimistic concurrency
- **Validator** (`orchestrator/validate_state.py`) for schema validation

### Files the user has already provided (in previous chat messages)

1. `collab-system-design.md` — Full design doc (the blueprint)
2. `orchestrator.py` — Lightweight orchestrator script (~1639 lines)
3. `validate_state.py` — Schema validator
4. `state.schema.json` — JSON schema for state index
5. `task.schema.json` — JSON schema for task details
6. `README.md` — Orchestrator README

**These files were originally designed for 2 people. They need to be adapted for 3 people.**

### Required adaptations for 3 people

1. **Replace `fcntl` with cross-platform locking** so Windows works. Recommended: try `import fcntl` first, fall back to `msvcrt` on Windows. Or use `portalocker` package.
2. **`compare-compete-task` command** currently hardcodes "exactly 2 submissions" at line ~1493 of `orchestrator.py`. Relax to allow 2 OR 3 submissions and do pairwise scoring.
3. **Add `person_c` as a valid author** in any place that enumerates authors.
4. **Branch naming convention:** `feat/task-X-a`, `feat/task-X-b`, `feat/task-X-c`.
5. **3-way tie handling** in `compare-compete-task` (rare but possible).

---

## 4. Repo Decisions Made

- **Repo name:** `Aggie-Hackathon-UC-Davis-MSBA-2026`
- **Visibility:** Private on GitHub
- **Collaborator setup:** User will manually invite Vedant and Amal as GitHub collaborators
- **Tech stack for trial project:** Pure HTML / CSS / vanilla JavaScript (no build tools, no npm, runs in any browser)
- **Tech stack for hackathon itself:** TBD when problem statement drops, but likely also web-based

---

## 5. Peer-Review Architecture (Two Claudes Collaborating)

The user explicitly wants **peer collaboration with review**, not master/worker. Both Claudes think; the user mediates.

### Roles

- **Claude in this chat = Reviewer / Architect**
  - Holds strategic context, project memory, hackathon goals
  - Writes **phase briefs** (goals + constraints + known gotchas, NOT prescriptive instructions)
  - Reviews Claude Code's proposals and pokes holes
  - For trivial decisions (folder names, .gitignore contents, file locations), just specifies them directly — no need to bounce
  - Helps with slide deck, video script, presentation polish during hackathon

- **Claude Code = Proposer / Executor**
  - Reads phase briefs and produces a **proposal** before touching any files
  - Lives inside the repo with full filesystem access
  - Free to push back on the reviewer's critiques if it has good reasons
  - Executes only after agreement is reached

- **User = Mediator**
  - Carries messages between the two Claudes
  - Arbitrates genuine disagreements
  - Owns final decisions

### The loop (for non-trivial phases)

1. Reviewer writes a Phase Brief (goal, constraints, gotchas — no file contents)
2. User hands brief to Claude Code
3. Claude Code produces a proposal (planned files, commands, decisions, risks) — DOES NOT execute yet
4. User pastes proposal back to Reviewer
5. Reviewer critiques: missing edge cases, Windows traps, over-engineering, better alternatives
6. User hands critique to Claude Code
7. Claude Code revises (or pushes back if Reviewer is wrong)
8. Once aligned, Claude Code executes
9. Claude Code reports results, Reviewer signs off, next phase

### When to skip the loop (trivial decisions)

For things that don't require brainstorming, the Reviewer just specifies directly in the brief:
- Folder structure
- File names
- `.gitignore` / `.gitattributes` contents
- Standard commit messages
- Verification commands

Save peer review for:
- Cross-platform locking strategy (fcntl replacement)
- 3-person `compare-compete-task` redesign
- Trial project task split decisions
- Schema modifications
- Anything that touches the orchestrator's logic

### Why this is better than master/worker

- Catches the Reviewer's mistakes (working from skimmed memory of a 1639-line script)
- Catches Claude Code's mistakes (over-engineering, missing constraints)
- Surfaces disagreements before broken code is committed
- Mirrors how the user will collaborate with both Claudes during the actual hackathon

---

## 6. Trial Project (Before the Real Hackathon)

**Project:** Vanilla JS Calculator with Session History

**Why this project:**
- Simple enough that bugs come from the *workflow*, not the project — perfect for stress-testing the orchestrator
- Pure HTML/CSS/JS, no build tools, no dependency management
- Naturally splits into 3 tasks that exercise all three orchestrator modes
- Visual output, easy to demo and judge

**Scope:**
- `index.html` — layout (display, button grid, history panel)
- `js/calculator.js` — core arithmetic and expression evaluation
- `js/history.js` — in-memory history array (cleared on refresh)
- `js/ui.js` — DOM event handlers, glue code
- `css/styles.css` — styling

**Task breakdown (tests all three orchestrator modes):**

| Task ID | Mode | Owner(s) | Description |
|---|---|---|---|
| task-01 | split | 1 person | Build `js/calculator.js` core arithmetic logic |
| task-02 | compete | All 3 | Each writes their own `css/styles.css`, best visual wins (subjective, mirrors hackathon judging) |
| task-03 | collab | All 3 | `index.html` + `js/ui.js` + `js/history.js` together on one branch |

---

## 7. Phased Bootstrap Plan (Where We Were Going Next)

The user agreed to a **phased** approach (safer than one mega-prompt). Each phase produces a verifiable checkpoint before moving on.

### Phase 1 — Repo Scaffolding & Cross-Platform Configs
**Goal:** Empty but properly configured repo.
- Initialize git repo
- Create folder structure: `state/`, `state/schema/`, `state/tasks/`, `orchestrator/`, `docs/`, `history/`, `trial-calculator/`
- Create `.gitignore` (Python + Node + IDE files)
- Create `.gitattributes` (force LF line endings)
- Create `.python-version` (pin 3.11)
- Create root `README.md` (placeholder)
- First commit: `chore: initial scaffold`
- **Verify:** folder tree matches spec, `git log` shows one commit

### Phase 2 — Orchestrator + Schemas
**Goal:** Working orchestrator with 3-person support and Windows-compatible locking.
- Drop in `state/schema/state.schema.json` and `task.schema.json` (already provided)
- Create **patched** `orchestrator/orchestrator.py`:
  - Windows-safe file locking (replace `fcntl`-only block)
  - 3-person `compare-compete-task` (allow 2 or 3 submissions)
- Create `orchestrator/validate_state.py`
- Create `orchestrator/README.md`
- Create empty `state/index.json` and `state/events.jsonl` placeholders
- Create `requirements.txt` with `jsonschema`
- **Verify:** `python orchestrator/validate_state.py` runs without crashing

### Phase 3 — Documentation
**Goal:** Onboarding-ready docs for all three teammates on Mac + Windows.
- `docs/collab-system-design.md` (updated for 3 people)
- `docs/onboarding.md` (first-day setup steps with both Mac and Windows commands)
- `docs/merge_checklist.md` (compete-task winner selection checklist)
- Updated root `README.md` (project overview, quick start)

### Phase 4 — Setup Scripts
**Goal:** One-command setup for any teammate after cloning.
- `setup.sh` for Mac (creates venv, installs jsonschema, validates)
- `setup.ps1` for Windows (same, PowerShell version)

### Phase 5 — Trial Project Initialization
**Goal:** Pre-filled state and task files for the calculator project.
- Initialize `state/index.json` with project name "Trial: Vanilla JS Calculator"
- Create `state/tasks/task-01.json` (split — calculator.js)
- Create `state/tasks/task-02.json` (compete — styles.css)
- Create `state/tasks/task-03.json` (collab — html + ui + history)
- Create empty `trial-calculator/` placeholder files
- Run `python orchestrator/validate_state.py` to confirm everything is valid
- Commit: `feat: initialize trial calculator project state`

### Phase 6 — End-to-End Workflow Test
**Goal:** Prove the whole system works before the real hackathon starts.
- Each teammate clones the repo and runs the setup script
- Each creates their feature branch (`feat/task-01-a`, etc.)
- Build the calculator
- Use `record-submission`, `compare-compete-task`, merge winners to main
- Run `archive-project` to reset state for the real hackathon
- **Verify:** State resets cleanly, history snapshot exists in `history/`

---

## 8. What To Do Next (Resuming This Conversation)

If a fresh Claude is reading this and needs to continue:

1. **Acknowledge** you've read this handoff doc completely.
2. **Confirm** the user has the original 6 files (collab-system-design.md, orchestrator.py, validate_state.py, state.schema.json, task.schema.json, README.md) ready to upload again if needed.
3. **Ask** which phase to start with. Default is Phase 1.
4. **Generate** the bootstrap prompt for that phase. The prompt should be a single self-contained instruction the user can paste directly into Claude Code, including:
   - Project context (1 paragraph from this doc)
   - Exact files to create with full content
   - Verification commands to run at the end
   - Expected output of verification
5. **Wait** for the user to confirm the phase ran successfully in Claude Code before generating the next phase's prompt.

### Important reminders for the assistant

- **Don't overwhelm with options.** The user has already made all the architectural decisions. Just execute.
- **The user prefers concise responses.** Don't re-explain things that are in this doc.
- **Peer-review architecture, not master/worker.** Write phase *briefs* for Claude Code (goals + constraints + gotchas), not prescriptive instructions. Claude Code proposes, you critique, user mediates. See Section 5.
- **Trivial decisions get specified directly.** Don't bounce folder names and .gitignore contents through Claude Code. Save peer review for genuine brainstorming (cross-platform locking, 3-person compete logic, schema changes).
- **Cross-platform safety is non-negotiable.** Every script must work on Mac AND Windows.
- **The trial project is just a workflow test.** Don't over-engineer the calculator. Simple is the goal.
- **The real hackathon problem statement drops April 12 at 12 PM.** All trial work must be DONE before then.

---

## 9. Open Items / Pending Decisions

- [ ] User needs to re-upload the 6 original files if starting in a fresh chat
- [ ] User needs to create the GitHub repo `Aggie-Hackathon-UC-Davis-MSBA-2026` (private) and invite Vedant + Amal
- [ ] User needs to decide which teammate will use which AI tool for the actual hackathon (Claude Code vs Codex vs Antigravity vs Cursor) — doesn't affect setup, but matters for task assignment
- [ ] User needs to decide whether the Windows teammate has Python 3.11 installed and `git` configured

---

## 10. Quick Reference: File Inventory

Files the user has already shared in this chat (and should re-upload to a fresh chat if continuing there):

1. `collab-system-design.md` — Full collaboration system blueprint
2. `orchestrator.py` — Main orchestrator CLI script (~1639 lines, needs 3-person + Windows patches)
3. `validate_state.py` — Schema validator script
4. `README.md` — Orchestrator usage README
5. `state.schema.json` — JSON Schema for `state/index.json`
6. `task.schema.json` — JSON Schema for `state/tasks/task-*.json`

---

**End of handoff document. Resume from Phase 1 unless the user specifies otherwise.**
