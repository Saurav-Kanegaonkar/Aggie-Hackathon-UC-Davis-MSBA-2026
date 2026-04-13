#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analysis.checkpoint1 import (
    build_checkpoint1_outputs,
    load_stage1_inputs,
    write_checkpoint1_outputs,
)


def resolve_repo_path(path: str | Path | None, default: str | Path) -> Path:
    resolved = Path(path or default)
    return resolved if resolved.is_absolute() else ROOT / resolved


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Fairlight checkpoint 1 outputs.")
    parser.add_argument("--input", help="Input panel path. Defaults to the latest local checkpoint panel.")
    parser.add_argument(
        "--contract",
        default="config/checkpoint1_contract.json",
        help="Path to the checkpoint contract JSON.",
    )
    parser.add_argument(
        "--output-dir",
        default="outputs/stage1",
        help="Directory where checkpoint outputs should be written.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = resolve_repo_path(args.input, "data/panel_990_extended_v4.parquet")
    contract_path = resolve_repo_path(args.contract, "config/checkpoint1_contract.json")
    output_dir = resolve_repo_path(args.output_dir, "outputs/stage1")

    panel, contract = load_stage1_inputs(input_path, contract_path)
    outputs = build_checkpoint1_outputs(panel, contract)
    write_checkpoint1_outputs(outputs, output_dir, contract)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
