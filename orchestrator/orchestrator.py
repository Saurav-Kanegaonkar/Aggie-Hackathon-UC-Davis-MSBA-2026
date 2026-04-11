#!/usr/bin/env python3
"""Lightweight state orchestrator for shared collaboration context."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import fcntl
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("fcntl is required on this platform") from exc


def utc_now_iso() -> str:
    """Return current UTC time in ISO-8601 format with Z suffix."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def parse_args() -> argparse.Namespace:
    """Parse orchestrator CLI arguments."""
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent

    parser = argparse.ArgumentParser(description="Update shared state safely")
    parser.add_argument(
        "--state",
        type=Path,
        default=repo_root / "state" / "index.json",
        help="Path to state/index.json",
    )
    parser.add_argument(
        "--schema",
        type=Path,
        default=repo_root / "state" / "schema" / "state.schema.json",
        help="Path to state schema JSON",
    )
    parser.add_argument(
        "--task-schema",
        type=Path,
        default=repo_root / "state" / "schema" / "task.schema.json",
        help="Path to task schema JSON",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add_change = subparsers.add_parser(
        "add-change", help="Append a recent change entry"
    )
    add_change.add_argument(
        "--author", required=True, help="Author for recent_changes entry"
    )
    add_change.add_argument(
        "--summary", required=True, help="Summary for recent_changes entry"
    )
    add_change.add_argument(
        "--updated-by",
        default=None,
        help="Value for updated_by (defaults to --author)",
    )
    add_change.add_argument(
        "--expected-context-version",
        type=int,
        default=None,
        help="Abort if current context_version is different",
    )
    add_change.add_argument(
        "--bot-author",
        default="orchestrator-bot",
        help="Author name treated as self-generated and ignored",
    )
    add_change.add_argument(
        "--commit",
        action="store_true",
        help="Commit state/index.json after successful update",
    )
    add_change.add_argument(
        "--commit-message",
        default=None,
        help="Optional custom git commit message",
    )

    record_submission = subparsers.add_parser(
        "record-submission",
        help="Record or update a compete task submission",
    )
    record_submission.add_argument(
        "--task-id", required=True, help="Task identifier, e.g. task-02"
    )
    record_submission.add_argument(
        "--author", required=True, help="Submission author, e.g. person_a"
    )
    record_submission.add_argument(
        "--branch",
        default=None,
        help="Branch for this submission (optional; keeps existing if omitted)",
    )
    record_submission.add_argument(
        "--commit-sha",
        default=None,
        help="Commit SHA for submission (defaults to current HEAD)",
    )
    record_submission.add_argument("--notes", default=None, help="Submission notes")
    record_submission.add_argument(
        "--test-command", default=None, help="Test command used"
    )
    record_submission.add_argument(
        "--test-result", default=None, help="Test result summary"
    )
    record_submission.add_argument(
        "--benchmark-command",
        default=None,
        help="Benchmark command used",
    )
    record_submission.add_argument(
        "--benchmark-result",
        default=None,
        help="Benchmark result summary",
    )
    record_submission.add_argument(
        "--updated-by",
        default=None,
        help="Value for updated_by (defaults to --author)",
    )
    record_submission.add_argument(
        "--expected-context-version",
        type=int,
        default=None,
        help="Abort if current context_version is different",
    )
    record_submission.add_argument(
        "--commit",
        action="store_true",
        help="Commit updated task file and state/index.json",
    )
    record_submission.add_argument(
        "--commit-message",
        default=None,
        help="Optional custom git commit message",
    )

    compare_compete = subparsers.add_parser(
        "compare-compete-task",
        help="Compare compete submissions and recommend winner or tie",
    )
    compare_compete.add_argument(
        "--task-id", required=True, help="Task identifier, e.g. task-02"
    )
    compare_compete.add_argument(
        "--tie-threshold",
        type=float,
        default=0.05,
        help="If weighted score delta is below this threshold, return tie",
    )

    archive_project = subparsers.add_parser(
        "archive-project",
        help="Archive current assignment state and reset to template",
    )
    archive_project.add_argument(
        "--updated-by",
        default="orchestrator",
        help="Value for updated_by in the reset state",
    )
    archive_project.add_argument(
        "--expected-context-version",
        type=int,
        default=None,
        help="Abort if current context_version is different",
    )
    archive_project.add_argument(
        "--history-dir",
        type=Path,
        default=repo_root / "history",
        help="Directory where archive snapshots are written",
    )
    archive_project.add_argument(
        "--archive-label",
        default=None,
        help="Optional suffix label for archive snapshot directory",
    )
    archive_project.add_argument(
        "--commit",
        action="store_true",
        help="Commit archived snapshot and reset state files",
    )
    archive_project.add_argument(
        "--commit-message",
        default=None,
        help="Optional custom git commit message",
    )

    watch = subparsers.add_parser(
        "watch",
        help="Watch git commits and auto-record recent_changes entries",
    )
    watch.add_argument(
        "--interval-seconds",
        type=float,
        default=5.0,
        help="Polling interval between checks (ignored with --once)",
    )
    watch.add_argument(
        "--once",
        action="store_true",
        help="Run a single watcher cycle and exit",
    )
    watch.add_argument(
        "--cursor-file",
        type=Path,
        default=repo_root / "state" / "watch.cursor",
        help="Path to watcher cursor file storing last processed commit",
    )
    watch.add_argument(
        "--fetch",
        action="store_true",
        help="Run git fetch --all --prune before each cycle",
    )
    watch.add_argument(
        "--bot-author",
        default="orchestrator-bot",
        help="Author name treated as self-generated and ignored",
    )
    watch.add_argument(
        "--bot-email",
        default=None,
        help="Author email treated as self-generated and ignored",
    )
    watch.add_argument(
        "--updated-by",
        default="orchestrator-watcher",
        help="Value for updated_by on watcher-generated state updates",
    )
    watch.add_argument(
        "--commit",
        action="store_true",
        help="Commit state/index.json after each watcher update",
    )
    watch.add_argument(
        "--max-commits-per-cycle",
        type=int,
        default=50,
        help="Maximum newly discovered commits to process per cycle",
    )

    return parser.parse_args()


def load_json(path: Path) -> Any:
    """Load JSON from path with friendly errors."""
    try:
        with path.open("r", encoding="utf-8") as file_obj:
            return json.load(file_obj)
    except FileNotFoundError as exc:
        raise RuntimeError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Invalid JSON in {path}: line {exc.lineno}, col {exc.colno}: {exc.msg}"
        ) from exc


def validate_state(state_data: Any, schema_data: Any) -> list[str]:
    """Validate state data against schema and return error messages."""
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'jsonschema'. Install with: pip install jsonschema"
        ) from exc

    validator = Draft202012Validator(schema_data, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(state_data), key=lambda err: list(err.path))
    messages: list[str] = []
    for error in errors:
        location = (
            "/".join(str(part) for part in error.path) if error.path else "<root>"
        )
        messages.append(f"{location}: {error.message}")
    return messages


def validate_json_data(payload: Any, schema_data: Any) -> list[str]:
    """Validate arbitrary JSON payload against schema and return errors."""
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency 'jsonschema'. Install with: pip install jsonschema"
        ) from exc

    validator = Draft202012Validator(schema_data, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(payload), key=lambda err: list(err.path))
    messages: list[str] = []
    for error in errors:
        location = (
            "/".join(str(part) for part in error.path) if error.path else "<root>"
        )
        messages.append(f"{location}: {error.message}")
    return messages


def validate_tasks_from_index(
    index_data: dict[str, Any],
    repo_root: Path,
    task_schema_data: Any,
    overrides: dict[str, dict[str, Any]] | None = None,
) -> list[str]:
    """Validate every task file referenced by state/index.json."""
    tasks = index_data.get("tasks")
    if not isinstance(tasks, list):
        raise RuntimeError("state/index.json tasks missing or invalid")

    override_map = overrides or {}
    errors: list[str] = []
    for entry in tasks:
        if not isinstance(entry, dict):
            errors.append("tasks: contains non-object entry")
            continue
        task_path = entry.get("path")
        task_id = entry.get("id")
        if not isinstance(task_path, str) or not task_path:
            errors.append("tasks: entry path missing or invalid")
            continue

        if task_path in override_map:
            task_data = override_map[task_path]
        else:
            abs_path = (repo_root / task_path).resolve()
            try:
                task_data = load_json(abs_path)
            except RuntimeError as exc:
                errors.append(f"{task_path}: {exc}")
                continue

        task_errors = validate_json_data(task_data, task_schema_data)
        for task_error in task_errors:
            task_label = str(task_id) if isinstance(task_id, str) else task_path
            errors.append(f"{task_label} ({task_path}): {task_error}")

    return errors


def atomic_write_json(path: Path, data: Any) -> None:
    """Atomically write JSON file to avoid partial writes."""
    tmp_path = path.with_name(f"{path.name}.tmp")
    payload = json.dumps(data, indent=2) + "\n"
    with tmp_path.open("w", encoding="utf-8") as file_obj:
        file_obj.write(payload)
    os.replace(tmp_path, path)


def atomic_write_text(path: Path, payload: str) -> None:
    """Atomically write text file to avoid partial writes."""
    tmp_path = path.with_name(f"{path.name}.tmp")
    with tmp_path.open("w", encoding="utf-8") as file_obj:
        file_obj.write(payload)
    os.replace(tmp_path, path)


def get_head_sha(repo_root: Path) -> str | None:
    """Return current git HEAD SHA, or None if unavailable."""
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def run_git(repo_root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run a git command in repo_root and return completed process."""
    return subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )


def ensure_git_repo(repo_root: Path) -> None:
    """Ensure repository root is inside a git work tree."""
    result = run_git(repo_root, ["rev-parse", "--is-inside-work-tree"])
    if result.returncode != 0 or result.stdout.strip() != "true":
        raise RuntimeError(f"Not a git repository: {repo_root}")


def read_text_if_exists(path: Path) -> str | None:
    """Read text if file exists, else None."""
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def get_git_log_range(repo_root: Path, rev_range: str) -> list[dict[str, str]]:
    """Return commit metadata for a rev range in oldest-first order."""
    fmt = "%H%x1f%an%x1f%ae%x1f%s"
    result = run_git(
        repo_root, ["log", "--reverse", f"--pretty=format:{fmt}", rev_range]
    )
    if result.returncode != 0:
        stderr = result.stderr.strip()
        raise RuntimeError(stderr or f"git log failed for range {rev_range}")

    commits: list[dict[str, str]] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\x1f")
        if len(parts) != 4:
            continue
        commit_sha, author_name, author_email, subject = parts
        commits.append(
            {
                "sha": commit_sha,
                "author_name": author_name,
                "author_email": author_email,
                "subject": subject,
            }
        )
    return commits


def get_head_commit(repo_root: Path) -> dict[str, str] | None:
    """Return metadata for HEAD commit."""
    fmt = "%H%x1f%an%x1f%ae%x1f%s"
    result = run_git(repo_root, ["log", "-1", f"--pretty=format:{fmt}", "HEAD"])
    if result.returncode != 0:
        return None
    line = result.stdout.strip()
    if not line:
        return None
    parts = line.split("\x1f")
    if len(parts) != 4:
        return None
    commit_sha, author_name, author_email, subject = parts
    return {
        "sha": commit_sha,
        "author_name": author_name,
        "author_email": author_email,
        "subject": subject,
    }


def read_cursor(cursor_file: Path) -> str | None:
    """Read watcher cursor commit SHA if available."""
    text = read_text_if_exists(cursor_file)
    if text is None:
        return None
    sha = text.strip()
    return sha or None


def write_cursor(cursor_file: Path, sha: str) -> None:
    """Persist watcher cursor commit SHA atomically."""
    cursor_file.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(cursor_file, f"{sha}\n")


def resolve_new_commits(
    repo_root: Path, last_seen_sha: str | None
) -> list[dict[str, str]]:
    """Resolve new commits since cursor. If no cursor, return current HEAD only."""
    head_sha = get_head_sha(repo_root)
    if not head_sha:
        return []

    if not last_seen_sha:
        head_commit = get_head_commit(repo_root)
        return [head_commit] if head_commit else []

    merge_base = run_git(
        repo_root, ["merge-base", "--is-ancestor", last_seen_sha, head_sha]
    )
    if merge_base.returncode != 0:
        head_commit = get_head_commit(repo_root)
        return [head_commit] if head_commit else []

    if last_seen_sha == head_sha:
        return []

    return get_git_log_range(repo_root, f"{last_seen_sha}..{head_sha}")


def should_skip_watcher_commit(
    commit: dict[str, str], args: argparse.Namespace
) -> bool:
    """Return True when commit appears self-authored by orchestrator automation."""
    author_name = commit.get("author_name", "")
    author_email = commit.get("author_email", "")
    subject = (commit.get("subject") or "").lower()
    if args.bot_author and author_name == args.bot_author:
        return True
    if args.bot_email and author_email == args.bot_email:
        return True
    return subject.startswith("orchestrator:")


def maybe_commit_state(repo_root: Path, message: str) -> None:
    """Commit state/index.json if requested."""
    add_result = subprocess.run(
        ["git", "add", "state/index.json"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if add_result.returncode != 0:
        raise RuntimeError(add_result.stderr.strip() or "git add failed")

    commit_result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if commit_result.returncode != 0:
        stderr = commit_result.stderr.strip()
        stdout = commit_result.stdout.strip()
        detail = stderr or stdout or "git commit failed"
        raise RuntimeError(detail)


def maybe_commit_files(repo_root: Path, paths: list[str], message: str) -> None:
    """Commit provided files if requested."""
    add_result = subprocess.run(
        ["git", "add", *paths],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if add_result.returncode != 0:
        raise RuntimeError(add_result.stderr.strip() or "git add failed")

    commit_result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if commit_result.returncode != 0:
        stderr = commit_result.stderr.strip()
        stdout = commit_result.stdout.strip()
        detail = stderr or stdout or "git commit failed"
        raise RuntimeError(detail)


def with_state_lock(state_path: Path):
    """Context manager-like generator for exclusive state lock."""
    lock_path = state_path.with_name(f"{state_path.name}.lock")
    lock_file = lock_path.open("w", encoding="utf-8")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()


def make_archive_dir_name(
    timestamp: str, context_version: int, label: str | None
) -> str:
    """Build a stable archive directory name."""
    ts_token = timestamp.replace("-", "").replace(":", "")
    if ts_token.endswith("Z"):
        ts_token = ts_token[:-1]
    dir_name = f"snapshot-{ts_token}-v{context_version}"
    if isinstance(label, str) and label.strip():
        normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", label.strip()).strip("-._")
        if normalized:
            dir_name = f"{dir_name}-{normalized}"
    return dir_name


def next_available_path(path: Path) -> Path:
    """Return path or a suffixed variant that does not yet exist."""
    if not path.exists():
        return path

    index = 2
    while True:
        candidate = path.with_name(f"{path.name}-{index}")
        if not candidate.exists():
            return candidate
        index += 1


def reset_task_data(task_data: dict[str, Any]) -> dict[str, Any]:
    """Reset assignment-specific task fields while preserving structure."""
    reset = dict(task_data)
    reset["status"] = "not_started"

    clear_to_null = (
        "assigned_to",
        "branch",
        "notes",
        "winner",
        "winner_selected_by",
        "comparison_notes",
    )
    for field in clear_to_null:
        if field in reset:
            reset[field] = None

    if isinstance(reset.get("submissions"), list):
        reset["submissions"] = []

    return reset


def build_reset_index(
    index_data: dict[str, Any], timestamp: str, updated_by: str, head_sha: str | None
) -> dict[str, Any]:
    """Build fresh index template preserving global decisions and task wiring."""
    project = index_data.get("project")
    if not isinstance(project, str) or not project:
        raise RuntimeError("state/index.json project missing or invalid")

    tasks = index_data.get("tasks")
    if not isinstance(tasks, list):
        raise RuntimeError("state/index.json tasks missing or invalid")

    reset_tasks: list[dict[str, Any]] = []
    for task in tasks:
        if not isinstance(task, dict):
            raise RuntimeError("state/index.json tasks contains non-object entry")
        task_id = task.get("id")
        task_path = task.get("path")
        mode = task.get("mode")
        if (
            not isinstance(task_id, str)
            or not isinstance(task_path, str)
            or not isinstance(mode, str)
        ):
            raise RuntimeError("state/index.json task entry missing required fields")
        reset_tasks.append(
            {
                "id": task_id,
                "path": task_path,
                "mode": mode,
                "status": "not_started",
            }
        )

    decisions = index_data.get("decisions")
    if not isinstance(decisions, list):
        raise RuntimeError("state/index.json decisions missing or invalid")

    global_decisions: list[dict[str, str]] = []
    for decision in decisions:
        if isinstance(decision, dict) and decision.get("scope") == "global":
            text = decision.get("text")
            scope = decision.get("scope")
            if isinstance(text, str) and text and isinstance(scope, str):
                global_decisions.append({"text": text, "scope": scope})

    return {
        "project": project,
        "context_version": 1,
        "created": timestamp,
        "last_updated": timestamp,
        "updated_by": updated_by,
        "updated_from_commit": head_sha,
        "tasks": reset_tasks,
        "decisions": global_decisions,
        "open_questions": [],
        "recent_changes": [],
    }


def write_archive_snapshot(
    archive_root: Path,
    index_data: dict[str, Any],
    task_records: list[tuple[str, dict[str, Any]]],
    events_path: Path,
) -> None:
    """Write archive snapshot files under history/<snapshot>/state/."""
    archive_state = archive_root / "state"
    archive_tasks = archive_state / "tasks"
    archive_tasks.mkdir(parents=True, exist_ok=True)

    atomic_write_json(archive_state / "index.json", index_data)
    for task_rel_path, task_data in task_records:
        task_target = archive_root / task_rel_path
        task_target.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_json(task_target, task_data)

    if events_path.exists():
        events_target = archive_state / "events.jsonl"
        payload = events_path.read_text(encoding="utf-8")
        events_target.write_text(payload, encoding="utf-8")


def print_validation_errors(prefix: str, errors: list[str]) -> None:
    """Print indexed validation errors to stderr."""
    print(f"{prefix} ({len(errors)} error(s))", file=sys.stderr)
    for index, error in enumerate(errors, start=1):
        print(f"{index}. {error}", file=sys.stderr)


def cmd_archive_project(args: argparse.Namespace) -> int:
    """Archive current assignment state and reset state templates safely."""
    state_path = args.state.resolve()
    schema_path = args.schema.resolve()
    task_schema_path = args.task_schema.resolve()
    repo_root = state_path.parent.parent
    history_dir = args.history_dir.resolve()
    events_path = (repo_root / "state" / "events.jsonl").resolve()

    schema_data = load_json(schema_path)
    task_schema_data = load_json(task_schema_path)
    head_sha = get_head_sha(repo_root)
    timestamp = utc_now_iso()

    for _ in with_state_lock(state_path):
        index_data = load_json(state_path)
        current_version = index_data.get("context_version")
        if not isinstance(current_version, int):
            raise RuntimeError("context_version missing or not an integer")

        if (
            args.expected_context_version is not None
            and current_version != args.expected_context_version
        ):
            print(
                "STALE_CONTEXT: expected "
                f"{args.expected_context_version}, found {current_version}. "
                "Reload state and retry.",
                file=sys.stderr,
            )
            return 3

        tasks = index_data.get("tasks")
        if not isinstance(tasks, list):
            raise RuntimeError("state/index.json tasks missing or invalid")

        task_records: list[tuple[str, dict[str, Any], Path]] = []
        for entry in tasks:
            if not isinstance(entry, dict):
                raise RuntimeError("state/index.json tasks contains non-object entry")
            task_rel = entry.get("path")
            if not isinstance(task_rel, str) or not task_rel:
                raise RuntimeError("state/index.json task path missing or invalid")
            task_abs = (repo_root / task_rel).resolve()
            task_data = load_json(task_abs)
            task_records.append((task_rel, task_data, task_abs))

        history_dir.mkdir(parents=True, exist_ok=True)
        archive_name = make_archive_dir_name(
            timestamp, current_version, args.archive_label
        )
        archive_root = next_available_path(history_dir / archive_name)
        archive_root.mkdir(parents=True, exist_ok=False)

        write_archive_snapshot(
            archive_root,
            index_data,
            [(task_rel, task_data) for task_rel, task_data, _ in task_records],
            events_path,
        )

        reset_index = build_reset_index(
            index_data, timestamp, args.updated_by, head_sha
        )

        errors = validate_state(reset_index, schema_data)
        if errors:
            print_validation_errors("INVALID: reset state failed validation", errors)
            return 1

        reset_task_map: dict[str, dict[str, Any]] = {}
        for task_rel, task_data, _ in task_records:
            reset_task_map[task_rel] = reset_task_data(task_data)

        task_errors = validate_tasks_from_index(
            reset_index,
            repo_root,
            task_schema_data,
            overrides=reset_task_map,
        )
        if task_errors:
            print_validation_errors(
                "INVALID_TASKS: reset task state failed validation", task_errors
            )
            return 1

        for task_rel, _, task_abs in task_records:
            atomic_write_json(task_abs, reset_task_map[task_rel])

        if events_path.exists():
            atomic_write_text(events_path, "")

        atomic_write_json(state_path, reset_index)

    print(
        f"OK: archived project state to {archive_root} and reset {state_path} "
        "(context_version=1)"
    )

    if args.commit:
        commit_message = args.commit_message or (
            f"orchestrator: archive project and reset state ({archive_root.name})"
        )
        commit_paths = [
            str(state_path.relative_to(repo_root)),
            *[str(task_abs.relative_to(repo_root)) for _, _, task_abs in task_records],
            str(events_path.relative_to(repo_root)),
            str(archive_root.relative_to(repo_root)),
        ]
        maybe_commit_files(repo_root, commit_paths, commit_message)
        print("OK: committed archive snapshot and reset state")

    return 0


def append_change_from_commit(
    *,
    state_path: Path,
    repo_root: Path,
    state_schema_data: Any,
    task_schema_data: Any,
    updated_by: str,
    commit: dict[str, str],
) -> tuple[int, int]:
    """Append one recent_changes entry based on commit metadata."""
    commit_sha = commit.get("sha") or ""
    author_name = commit.get("author_name") or "unknown"
    subject = commit.get("subject") or "(no subject)"

    for _ in with_state_lock(state_path):
        state_data = load_json(state_path)
        current_version = state_data.get("context_version")
        if not isinstance(current_version, int):
            raise RuntimeError("context_version missing or not an integer")

        recent_changes = state_data.get("recent_changes")
        if not isinstance(recent_changes, list):
            raise RuntimeError("recent_changes missing or not a list")

        summary = f"Observed commit {commit_sha[:12]}: {subject}"
        recent_changes.append(
            {
                "timestamp": utc_now_iso(),
                "author": author_name,
                "summary": summary,
            }
        )
        state_data["recent_changes"] = recent_changes[-15:]
        state_data["last_updated"] = utc_now_iso()
        state_data["updated_by"] = updated_by
        state_data["updated_from_commit"] = commit_sha or None
        state_data["context_version"] = current_version + 1

        state_errors = validate_state(state_data, state_schema_data)
        if state_errors:
            print_validation_errors(
                f"INVALID: {state_path} failed validation",
                state_errors,
            )
            raise RuntimeError("state validation failed during watcher update")

        task_errors = validate_tasks_from_index(state_data, repo_root, task_schema_data)
        if task_errors:
            print_validation_errors(
                "INVALID_TASKS: task files failed validation",
                task_errors,
            )
            raise RuntimeError("task validation failed during watcher update")

        atomic_write_json(state_path, state_data)
        return current_version, state_data["context_version"]

    raise RuntimeError("failed to acquire state lock")


def run_watch_cycle(
    args: argparse.Namespace,
    *,
    repo_root: Path,
    state_path: Path,
    cursor_file: Path,
    state_schema_data: Any,
    task_schema_data: Any,
) -> tuple[int, int, int]:
    """Process one watcher cycle and return stats."""
    if args.fetch:
        fetch_result = run_git(repo_root, ["fetch", "--all", "--prune"])
        if fetch_result.returncode != 0:
            stderr = fetch_result.stderr.strip()
            raise RuntimeError(stderr or "git fetch failed")

    last_seen_sha = read_cursor(cursor_file)
    commits = resolve_new_commits(repo_root, last_seen_sha)
    if not commits:
        return (0, 0, 0)

    limit = args.max_commits_per_cycle
    if limit is not None and limit > 0:
        commits = commits[:limit]

    scanned = 0
    skipped = 0
    recorded = 0
    cursor_sha = last_seen_sha

    for commit in commits:
        commit_sha = commit.get("sha")
        if not commit_sha:
            continue
        scanned += 1
        cursor_sha = commit_sha

        if should_skip_watcher_commit(commit, args):
            skipped += 1
            print(
                f"SKIP: self-authored commit {commit_sha[:12]} "
                f"({commit.get('author_name', 'unknown')})"
            )
            continue

        old_version, new_version = append_change_from_commit(
            state_path=state_path,
            repo_root=repo_root,
            state_schema_data=state_schema_data,
            task_schema_data=task_schema_data,
            updated_by=args.updated_by,
            commit=commit,
        )
        print(
            f"OK: watcher recorded commit {commit_sha[:12]} "
            f"context_version {old_version} -> {new_version}"
        )
        recorded += 1

        if args.commit:
            message = f"orchestrator: watcher sync commit {commit_sha[:12]}"
            maybe_commit_state(repo_root, message)
            print("OK: committed state/index.json")

    if cursor_sha and cursor_sha != last_seen_sha:
        write_cursor(cursor_file, cursor_sha)

    return scanned, skipped, recorded


def cmd_watch(args: argparse.Namespace) -> int:
    """Watch git commits and append state recent_changes entries automatically."""
    state_path = args.state.resolve()
    schema_path = args.schema.resolve()
    task_schema_path = args.task_schema.resolve()
    cursor_file = args.cursor_file.resolve()
    repo_root = state_path.parent.parent

    ensure_git_repo(repo_root)
    if not args.once and args.interval_seconds <= 0:
        raise RuntimeError(
            "--interval-seconds must be > 0 when running continuous watch"
        )
    if args.max_commits_per_cycle <= 0:
        raise RuntimeError("--max-commits-per-cycle must be >= 1")

    state_schema_data = load_json(schema_path)
    task_schema_data = load_json(task_schema_path)

    if args.once:
        scanned, skipped, recorded = run_watch_cycle(
            args,
            repo_root=repo_root,
            state_path=state_path,
            cursor_file=cursor_file,
            state_schema_data=state_schema_data,
            task_schema_data=task_schema_data,
        )
        print(
            f"WATCH: cycle complete scanned={scanned} skipped={skipped} recorded={recorded}"
        )
        return 0

    print(
        f"WATCH: starting loop interval={args.interval_seconds:.2f}s "
        f"cursor={cursor_file}"
    )
    while True:
        scanned, skipped, recorded = run_watch_cycle(
            args,
            repo_root=repo_root,
            state_path=state_path,
            cursor_file=cursor_file,
            state_schema_data=state_schema_data,
            task_schema_data=task_schema_data,
        )
        if scanned or skipped or recorded:
            print(
                f"WATCH: cycle complete scanned={scanned} "
                f"skipped={skipped} recorded={recorded}"
            )
        time.sleep(args.interval_seconds)


def cmd_add_change(args: argparse.Namespace) -> int:
    """Append recent change entry and bump context safely."""
    state_path = args.state.resolve()
    schema_path = args.schema.resolve()
    task_schema_path = args.task_schema.resolve()
    repo_root = state_path.parent.parent

    if args.author == args.bot_author:
        print(f"SKIP: self-generated author '{args.bot_author}' ignored")
        return 0

    schema_data = load_json(schema_path)
    task_schema_data = load_json(task_schema_path)

    for _ in with_state_lock(state_path):
        state_data = load_json(state_path)
        current_version = state_data.get("context_version")
        if not isinstance(current_version, int):
            raise RuntimeError("context_version missing or not an integer")

        if (
            args.expected_context_version is not None
            and current_version != args.expected_context_version
        ):
            print(
                "STALE_CONTEXT: expected "
                f"{args.expected_context_version}, found {current_version}. "
                "Reload state and retry.",
                file=sys.stderr,
            )
            return 3

        recent_changes = state_data.get("recent_changes")
        if not isinstance(recent_changes, list):
            raise RuntimeError("recent_changes missing or not a list")

        recent_changes.append(
            {
                "timestamp": utc_now_iso(),
                "author": args.author,
                "summary": args.summary,
            }
        )
        state_data["recent_changes"] = recent_changes[-15:]

        state_data["last_updated"] = utc_now_iso()
        state_data["updated_by"] = args.updated_by or args.author
        state_data["updated_from_commit"] = get_head_sha(repo_root)
        state_data["context_version"] = current_version + 1

        errors = validate_state(state_data, schema_data)
        if errors:
            print_validation_errors(f"INVALID: {state_path} failed validation", errors)
            return 1

        task_errors = validate_tasks_from_index(state_data, repo_root, task_schema_data)
        if task_errors:
            print_validation_errors(
                "INVALID_TASKS: task files failed validation",
                task_errors,
            )
            return 1

        atomic_write_json(state_path, state_data)

        old_version = current_version
        new_version = state_data["context_version"]

    print(f"OK: updated {state_path} context_version {old_version} -> {new_version}")

    if args.commit:
        commit_message = args.commit_message or (
            f"orchestrator: update state context_version {old_version}->{new_version}"
        )
        maybe_commit_state(repo_root, commit_message)
        print("OK: committed state/index.json")

    return 0


def get_task_path(index_data: dict[str, Any], task_id: str, repo_root: Path) -> Path:
    """Resolve task path from state/index.json by task id."""
    tasks = index_data.get("tasks")
    if not isinstance(tasks, list):
        raise RuntimeError("state/index.json tasks missing or invalid")

    for task_entry in tasks:
        if isinstance(task_entry, dict) and task_entry.get("id") == task_id:
            task_path = task_entry.get("path")
            if not isinstance(task_path, str) or not task_path:
                raise RuntimeError(f"Task {task_id} path missing in state/index.json")
            return (repo_root / task_path).resolve()

    raise RuntimeError(f"Task {task_id} not found in state/index.json")


def update_submission_entry(
    submissions: list[dict[str, Any]], args: argparse.Namespace, default_sha: str | None
) -> bool:
    """Update existing submission in-place; returns True if updated."""
    for submission in submissions:
        if submission.get("author") != args.author:
            continue

        submission["status"] = "submitted"
        if args.branch is not None:
            submission["branch"] = args.branch
        if args.notes is not None:
            submission["notes"] = args.notes
        if args.commit_sha is not None:
            submission["commit_sha"] = args.commit_sha
        elif submission.get("commit_sha") in (None, ""):
            submission["commit_sha"] = default_sha

        if args.test_command is not None:
            submission["test_command"] = args.test_command
        if args.test_result is not None:
            submission["test_result"] = args.test_result
        if args.benchmark_command is not None:
            submission["benchmark_command"] = args.benchmark_command
        if args.benchmark_result is not None:
            submission["benchmark_result"] = args.benchmark_result
        return True

    return False


def cmd_record_submission(args: argparse.Namespace) -> int:
    """Record or update compete task submission and bump context."""
    state_path = args.state.resolve()
    schema_path = args.schema.resolve()
    task_schema_path = args.task_schema.resolve()
    repo_root = state_path.parent.parent

    schema_data = load_json(schema_path)
    task_schema_data = load_json(task_schema_path)
    head_sha = get_head_sha(repo_root)

    for _ in with_state_lock(state_path):
        index_data = load_json(state_path)
        current_version = index_data.get("context_version")
        if not isinstance(current_version, int):
            raise RuntimeError("context_version missing or not an integer")

        if (
            args.expected_context_version is not None
            and current_version != args.expected_context_version
        ):
            print(
                "STALE_CONTEXT: expected "
                f"{args.expected_context_version}, found {current_version}. "
                "Reload state and retry.",
                file=sys.stderr,
            )
            return 3

        task_path = get_task_path(index_data, args.task_id, repo_root)
        task_data = load_json(task_path)

        if task_data.get("mode") != "compete":
            raise RuntimeError(f"Task {args.task_id} is not in compete mode")

        submissions = task_data.get("submissions")
        if not isinstance(submissions, list):
            raise RuntimeError(f"Task {args.task_id} submissions missing or invalid")

        updated = update_submission_entry(submissions, args, head_sha)
        if not updated:
            submissions.append(
                {
                    "author": args.author,
                    "branch": args.branch,
                    "status": "submitted",
                    "notes": args.notes,
                    "commit_sha": args.commit_sha or head_sha,
                    "test_command": args.test_command,
                    "test_result": args.test_result,
                    "benchmark_command": args.benchmark_command,
                    "benchmark_result": args.benchmark_result,
                }
            )

        task_data["submissions"] = submissions
        task_data["status"] = "in_progress"

        all_submitted = all(
            isinstance(item, dict) and item.get("status") == "submitted"
            for item in submissions
        )
        if all_submitted:
            task_data["status"] = "submitted"

        atomic_write_json(task_path, task_data)

        recent_changes = index_data.get("recent_changes")
        if not isinstance(recent_changes, list):
            raise RuntimeError("recent_changes missing or not a list")

        submission_summary = (
            f"Recorded submission for {args.task_id} by {args.author} "
            f"on {args.branch or 'existing-branch'}"
        )
        recent_changes.append(
            {
                "timestamp": utc_now_iso(),
                "author": args.author,
                "summary": submission_summary,
            }
        )
        index_data["recent_changes"] = recent_changes[-15:]

        for entry in index_data.get("tasks", []):
            if isinstance(entry, dict) and entry.get("id") == args.task_id:
                entry["status"] = task_data["status"]
                break

        index_data["last_updated"] = utc_now_iso()
        index_data["updated_by"] = args.updated_by or args.author
        index_data["updated_from_commit"] = head_sha
        index_data["context_version"] = current_version + 1

        errors = validate_state(index_data, schema_data)
        if errors:
            print_validation_errors(f"INVALID: {state_path} failed validation", errors)
            return 1

        task_errors = validate_tasks_from_index(index_data, repo_root, task_schema_data)
        if task_errors:
            print_validation_errors(
                "INVALID_TASKS: task files failed validation",
                task_errors,
            )
            return 1

        atomic_write_json(state_path, index_data)

        old_version = current_version
        new_version = index_data["context_version"]

    print(
        f"OK: recorded submission for {args.task_id} ({args.author}), "
        f"context_version {old_version} -> {new_version}"
    )

    if args.commit:
        commit_message = args.commit_message or (
            f"orchestrator: record submission {args.task_id} by {args.author}"
        )
        relative_task_path = str(task_path.relative_to(repo_root))
        maybe_commit_files(
            repo_root, ["state/index.json", relative_task_path], commit_message
        )
        print("OK: committed updated state files")

    return 0


def clamp_score(value: float) -> float:
    """Clamp rubric score to [0.0, 1.0]."""
    return max(0.0, min(1.0, value))


def parse_duration_seconds(value: Any) -> float | None:
    """Parse first duration token from free-text benchmark result."""
    if not isinstance(value, str) or not value.strip():
        return None

    match = re.search(
        r"([0-9]+(?:\.[0-9]+)?)\s*(ms|millisecond(?:s)?|s|sec(?:ond)?(?:s)?|min(?:ute)?(?:s)?)\b",
        value.lower(),
    )
    if not match:
        return None

    amount = float(match.group(1))
    unit = match.group(2)
    if unit.startswith("ms") or unit.startswith("millisecond"):
        return amount / 1000.0
    if unit.startswith("min"):
        return amount * 60.0
    return amount


def get_explicit_score(submission: dict[str, Any], criterion: str) -> float | None:
    """Get optional explicit rubric score for a criterion."""
    rubric_scores = submission.get("rubric_scores")
    if not isinstance(rubric_scores, dict):
        return None
    raw_value = rubric_scores.get(criterion)
    if not isinstance(raw_value, (int, float)):
        return None
    return clamp_score(float(raw_value))


def score_correctness(submission: dict[str, Any]) -> tuple[float, str]:
    """Score correctness from test evidence."""
    test_result = submission.get("test_result")
    if isinstance(test_result, str):
        lowered = test_result.lower()
        if any(token in lowered for token in ("fail", "error", "exception")):
            return 0.0, f"test_result={test_result!r}"
        if any(token in lowered for token in ("pass", "passed", "ok", "success")):
            return 1.0, f"test_result={test_result!r}"
        return 0.5, f"test_result={test_result!r}"

    if isinstance(submission.get("test_command"), str):
        return 0.5, "test command present, result missing"
    return 0.5, "no test evidence"


def score_memory_efficiency(submission: dict[str, Any]) -> tuple[float, str]:
    """Score memory efficiency from notes/benchmark text clues."""
    notes = submission.get("notes")
    benchmark_result = submission.get("benchmark_result")
    chunks = []
    if isinstance(notes, str):
        chunks.append(notes.lower())
    if isinstance(benchmark_result, str):
        chunks.append(benchmark_result.lower())
    corpus = " ".join(chunks)

    if not corpus:
        return 0.5, "no memory evidence"

    if "o(k)" in corpus or "constant memory" in corpus:
        return 1.0, "explicit bounded memory claim"

    positive = ("memory efficient", "low memory", "memory-light", "bounded space")
    negative = ("memory heavy", "high memory", "memory leak", "o(n) space")

    if any(token in corpus for token in negative):
        return 0.2, "negative memory signal in notes/benchmark"
    if any(token in corpus for token in positive):
        return 0.8, "positive memory signal in notes/benchmark"
    return 0.5, "memory signal unclear"


def score_readability(submission: dict[str, Any]) -> tuple[float, str]:
    """Score readability using notes quality as proxy evidence."""
    notes = submission.get("notes")
    if not isinstance(notes, str) or not notes.strip():
        return 0.5, "no readability evidence"

    lowered = notes.lower()
    if any(
        token in lowered for token in ("readable", "clear", "docstring", "type hint")
    ):
        return 0.8, "explicit readability signal in notes"
    if any(token in lowered for token in ("hacky", "quick fix", "wip")):
        return 0.4, "potential readability risk signal"
    if len(notes.strip()) >= 40:
        return 0.7, "detailed implementation notes"
    return 0.6, "brief implementation notes"


def score_performance_pair(
    left: dict[str, Any], right: dict[str, Any]
) -> tuple[tuple[float, str], tuple[float, str]]:
    """Score performance comparatively when explicit scores are unavailable."""
    left_duration = parse_duration_seconds(left.get("benchmark_result"))
    right_duration = parse_duration_seconds(right.get("benchmark_result"))

    if left_duration is not None and right_duration is not None:
        if abs(left_duration - right_duration) <= 1e-12:
            reason = f"equal parsed durations ({left_duration:.6f}s vs {right_duration:.6f}s)"
            return (0.5, reason), (0.5, reason)
        if left_duration < right_duration:
            return (
                1.0,
                f"faster parsed duration ({left_duration:.6f}s < {right_duration:.6f}s)",
            ), (
                0.0,
                f"slower parsed duration ({right_duration:.6f}s > {left_duration:.6f}s)",
            )
        return (
            0.0,
            f"slower parsed duration ({left_duration:.6f}s > {right_duration:.6f}s)",
        ), (
            1.0,
            f"faster parsed duration ({right_duration:.6f}s < {left_duration:.6f}s)",
        )

    if left_duration is not None and right_duration is None:
        return (0.75, f"parsed duration {left_duration:.6f}s available"), (
            0.5,
            "no parseable benchmark duration",
        )
    if left_duration is None and right_duration is not None:
        return (0.5, "no parseable benchmark duration"), (
            0.75,
            f"parsed duration {right_duration:.6f}s available",
        )

    return (0.5, "no parseable benchmark duration"), (
        0.5,
        "no parseable benchmark duration",
    )


def resolve_compete_weights(task_data: dict[str, Any]) -> list[tuple[str, float]]:
    """Resolve criteria and normalized weights for compete arbitration."""
    arbitration = task_data.get("arbitration")
    if not isinstance(arbitration, dict):
        raise RuntimeError("Task arbitration missing or invalid")

    criteria = arbitration.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        raise RuntimeError("Task arbitration.criteria missing or invalid")

    unique_criteria: list[str] = []
    for item in criteria:
        if isinstance(item, str) and item and item not in unique_criteria:
            unique_criteria.append(item)
    if not unique_criteria:
        raise RuntimeError("Task arbitration.criteria has no usable entries")

    raw_weights = arbitration.get("weights")
    weights: list[tuple[str, float]] = []
    if isinstance(raw_weights, dict):
        for criterion in unique_criteria:
            raw_value = raw_weights.get(criterion)
            if isinstance(raw_value, (int, float)) and float(raw_value) > 0:
                weights.append((criterion, float(raw_value)))
            else:
                weights.append((criterion, 0.0))
    else:
        weights = [(criterion, 1.0) for criterion in unique_criteria]

    total = sum(weight for _, weight in weights)
    if total <= 0:
        equal = 1.0 / len(unique_criteria)
        return [(criterion, equal) for criterion in unique_criteria]

    return [(criterion, weight / total) for criterion, weight in weights]


def cmd_compare_compete_task(args: argparse.Namespace) -> int:
    """Compare two compete submissions and print deterministic recommendation."""
    if args.tie_threshold < 0:
        raise RuntimeError("--tie-threshold must be >= 0")

    state_path = args.state.resolve()
    schema_path = args.schema.resolve()
    task_schema_path = args.task_schema.resolve()
    repo_root = state_path.parent.parent
    state_schema_data = load_json(schema_path)
    task_schema_data = load_json(task_schema_path)
    index_data = load_json(state_path)

    state_errors = validate_state(index_data, state_schema_data)
    if state_errors:
        print_validation_errors(
            f"INVALID: {state_path} failed validation", state_errors
        )
        return 1

    task_errors = validate_tasks_from_index(index_data, repo_root, task_schema_data)
    if task_errors:
        print_validation_errors(
            "INVALID_TASKS: task files failed validation", task_errors
        )
        return 1

    task_path = get_task_path(index_data, args.task_id, repo_root)
    task_data = load_json(task_path)

    if task_data.get("mode") != "compete":
        raise RuntimeError(f"Task {args.task_id} is not in compete mode")

    submissions = task_data.get("submissions")
    if not isinstance(submissions, list):
        raise RuntimeError(f"Task {args.task_id} submissions missing or invalid")
    if len(submissions) != 2:
        raise RuntimeError(
            f"Task {args.task_id} compare-compete-task requires exactly 2 submissions"
        )

    normalized_weights = resolve_compete_weights(task_data)

    ordered_submissions = sorted(
        submissions,
        key=lambda item: (
            str(item.get("author", "")),
            str(item.get("branch", "")),
        ),
    )
    left = ordered_submissions[0]
    right = ordered_submissions[1]

    left_author = str(left.get("author") or "unknown")
    right_author = str(right.get("author") or "unknown")

    scores: dict[str, dict[str, float]] = {
        left_author: {},
        right_author: {},
    }
    reasons: dict[str, dict[str, str]] = {
        left_author: {},
        right_author: {},
    }

    for criterion, _ in normalized_weights:
        left_explicit = get_explicit_score(left, criterion)
        right_explicit = get_explicit_score(right, criterion)

        if left_explicit is not None:
            scores[left_author][criterion] = left_explicit
            reasons[left_author][criterion] = "explicit rubric score"
        if right_explicit is not None:
            scores[right_author][criterion] = right_explicit
            reasons[right_author][criterion] = "explicit rubric score"

        if criterion == "performance":
            left_perf, right_perf = score_performance_pair(left, right)
            if left_explicit is None:
                scores[left_author][criterion] = left_perf[0]
                reasons[left_author][criterion] = left_perf[1]
            if right_explicit is None:
                scores[right_author][criterion] = right_perf[0]
                reasons[right_author][criterion] = right_perf[1]
            continue

        if left_explicit is None:
            if criterion == "correctness":
                value, reason = score_correctness(left)
            elif criterion == "memory_efficiency":
                value, reason = score_memory_efficiency(left)
            elif criterion == "readability":
                value, reason = score_readability(left)
            else:
                value, reason = 0.5, "no heuristic for criterion"
            scores[left_author][criterion] = value
            reasons[left_author][criterion] = reason

        if right_explicit is None:
            if criterion == "correctness":
                value, reason = score_correctness(right)
            elif criterion == "memory_efficiency":
                value, reason = score_memory_efficiency(right)
            elif criterion == "readability":
                value, reason = score_readability(right)
            else:
                value, reason = 0.5, "no heuristic for criterion"
            scores[right_author][criterion] = value
            reasons[right_author][criterion] = reason

    left_total = 0.0
    right_total = 0.0
    for criterion, weight in normalized_weights:
        left_total += scores[left_author][criterion] * weight
        right_total += scores[right_author][criterion] * weight

    left_total = round(left_total, 6)
    right_total = round(right_total, 6)
    delta = abs(left_total - right_total)

    recommendation: str
    if delta < args.tie_threshold:
        recommendation = "TIE_HUMAN_REQUIRED"
    elif left_total > right_total:
        recommendation = left_author
    else:
        recommendation = right_author

    print(f"TASK: {args.task_id}")
    print(f"TASK_PATH: {task_path}")
    print(f"MODE: compete")
    print(f"COMPARE: {left_author} vs {right_author}")
    print("RUBRIC:")

    for criterion, weight in normalized_weights:
        left_score = scores[left_author][criterion]
        right_score = scores[right_author][criterion]
        left_reason = reasons[left_author][criterion]
        right_reason = reasons[right_author][criterion]
        print(
            f"- {criterion} (weight={weight:.4f}) | "
            f"{left_author}: {left_score:.4f} [{left_reason}] | "
            f"{right_author}: {right_score:.4f} [{right_reason}]"
        )

    print("TOTALS:")
    print(f"- {left_author}: {left_total:.6f}")
    print(f"- {right_author}: {right_total:.6f}")
    print(
        f"RULE: tie if |delta| < {args.tie_threshold:.6f} (observed delta={delta:.6f})"
    )
    if recommendation == "TIE_HUMAN_REQUIRED":
        print("RECOMMENDATION: tie/human required")
    else:
        print(f"RECOMMENDATION: choose {recommendation}")

    return 0


def main() -> int:
    """Main entrypoint."""
    args = parse_args()
    try:
        if args.command == "add-change":
            return cmd_add_change(args)
        if args.command == "record-submission":
            return cmd_record_submission(args)
        if args.command == "compare-compete-task":
            return cmd_compare_compete_task(args)
        if args.command == "archive-project":
            return cmd_archive_project(args)
        if args.command == "watch":
            return cmd_watch(args)
        print(f"ERROR: unsupported command '{args.command}'", file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
