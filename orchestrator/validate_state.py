#!/usr/bin/env python3
"""Validate state/index.json against the JSON schema."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for state and schema paths."""
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent

    parser = argparse.ArgumentParser(
        description="Validate state/index.json against state/schema/state.schema.json"
    )
    parser.add_argument(
        "--state",
        type=Path,
        default=repo_root / "state" / "index.json",
        help="Path to the state index JSON file",
    )
    parser.add_argument(
        "--schema",
        type=Path,
        default=repo_root / "state" / "schema" / "state.schema.json",
        help="Path to the JSON schema file",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    """Load and parse JSON from a file path."""
    try:
        with path.open("r", encoding="utf-8") as file_obj:
            return json.load(file_obj)
    except FileNotFoundError as exc:
        raise RuntimeError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Invalid JSON in {path}: line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc


def format_error_path(error_path: Iterable[Any]) -> str:
    """Format a validator error path as a readable location string."""
    parts = [str(part) for part in error_path]
    return "/".join(parts) if parts else "<root>"


def main() -> int:
    """Run schema validation and return process exit code."""
    args = parse_args()
    state_path = args.state.resolve()
    schema_path = args.schema.resolve()

    try:
        schema = load_json(schema_path)
        state_data = load_json(state_path)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError:
        print(
            "ERROR: Missing dependency 'jsonschema'. Install with: pip install jsonschema",
            file=sys.stderr,
        )
        return 2

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(state_data), key=lambda err: list(err.path))

    if not errors:
        print(f"OK: {state_path} is valid against {schema_path}")
        return 0

    print(
        f"INVALID: {state_path} failed validation against {schema_path} "
        f"({len(errors)} error(s))",
        file=sys.stderr,
    )
    for index, error in enumerate(errors, start=1):
        location = format_error_path(error.path)
        print(f"{index}. {location}: {error.message}", file=sys.stderr)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
