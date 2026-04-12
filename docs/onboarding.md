# Onboarding Guide

First-day setup for new teammates. Follow these steps in order.

---

## 1. Configure git (BEFORE cloning)

On Windows, git defaults to converting LF line endings to CRLF on checkout.
Our repo enforces LF everywhere via `.gitattributes`, so set this first to
avoid phantom diffs on every file:

**Mac** -- no action needed (LF is the default).

**Windows (PowerShell):**
```powershell
git config --global core.autocrlf input
```

This tells git to convert CRLF to LF on commit but leave LF alone on checkout.

---

## 2. Clone the repo

```bash
git clone https://github.com/Saurav-Kanegaonkar/Aggie-Hackathon-UC-Davis-MSBA-2026.git
cd Aggie-Hackathon-UC-Davis-MSBA-2026
```

---

## 3. Install Python 3.11

Check your current version:

```bash
python3 --version
```

If you don't have 3.11+, install it:

**Mac (Homebrew):**
```bash
brew install python@3.11
```

**Windows:**

Download from https://www.python.org/downloads/ and install.
Make sure "Add Python to PATH" is checked during installation.

---

## 4. Create a virtual environment

**Mac:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

If you get an execution policy error on Windows:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
venv\Scripts\Activate.ps1
```

---

## 5. Install dependencies

```bash
pip install -r requirements.txt
```

---

## 6. Verify setup

Run the schema validator to confirm everything is wired up:

```bash
python orchestrator/validate_state.py
```

Expected output:
```
OK: .../state/index.json is valid against .../state/schema/state.schema.json
```

If you see `OK`, you're good.

---

## 7. You're ready -- how to start working

### Author convention

Each teammate uses their real first name in orchestrator commands:

| Person | Author ID |
|--------|-----------|
| Saurav | Saurav |
| Vedant | Vedant |
| Amal   | Amal   |

### Branch naming

All feature branches follow this pattern:

```
feat/task-XX-{a,b,c}
```

Examples:
- `feat/task-01-a` -- Saurav working on task-01
- `feat/task-02-b` -- Vedant's submission for task-02
- `feat/task-03-c` -- Amal working on task-03

For `collab` mode tasks, all teammates share one branch (e.g. `feat/task-03-collab`).

### Starting a task

1. Pull latest main:
   ```bash
   git checkout main && git pull
   ```

2. Read the task file to understand what you're building:
   ```bash
   cat state/tasks/task-XX.json
   ```

3. Create your feature branch:
   ```bash
   git checkout -b feat/task-XX-a
   ```

4. Build your solution.

5. Push your feature branch first:
   ```bash
   git push -u origin feat/task-XX-a
   ```

6. Record your submission from `main`, not from your feature branch:
   ```bash
   git checkout main
   git pull
   python orchestrator/orchestrator.py record-submission \
     --task-id task-XX \
     --author Saurav \
     --branch feat/task-XX-a \
     --notes "Brief description of what this submission does" \
     --commit
   git push
   git checkout feat/task-XX-a
   ```

   Only record your own submission. Do not run `record-submission` for someone else.

   *`--test-command` and `--test-result` are optional flags -- use them only if your task has automated tests.*

### Important: state files live on `main`

The state files are the shared audit trail for the team:

- `state/index.json`
- `state/tasks/*.json`

These files are only ever updated on `main`, never on feature branches.
Whenever you need to run an orchestrator command (`add-change`,
`record-submission`, `set-winner`, or `archive-project`), use this pattern:

```bash
git checkout main
git pull
python orchestrator/orchestrator.py <command> ... --commit
git push
git checkout <your-feature-branch>
```

Do not run orchestrator commands while checked out to your feature branch.

### After all submissions are in (compete tasks)

The team reviews all branches and decides a winner together. `set-winner` is a
team action, not an individual one. Only run it after the team has explicitly
agreed on the winner.

Example:
   ```bash
   git checkout main
   git pull
   python orchestrator/orchestrator.py set-winner \
     --task-id task-XX \
     --winner Vedant \
     --selected-by "team consensus" \
     --notes "Reason for picking this submission" \
     --commit
   git push
   git checkout feat/task-XX-a
   ```

If fewer than 2 submissions have been recorded, `set-winner` will fail. That
usually means another teammate has not recorded their submission yet.

### Key rules

- State files (`state/index.json`, `state/tasks/*.json`) are only modified via orchestrator commands, never hand-edited.
- Always pull main before starting a new task.
- Push your feature branch before recording your submission.
- Run orchestrator commands only from `main`, then push, then switch back to your branch.
- `set-winner` only happens after explicit team agreement.
- Always validate before pushing state changes: `python orchestrator/validate_state.py`
- See `docs/merge_checklist.md` before merging any branch to main.
