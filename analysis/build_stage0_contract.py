#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analysis.stage0_contract import (
    build_stage0_artifacts,
    load_contract,
    load_panel,
    resolve_input_path,
    write_stage0_artifacts,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Fairlight Stage 0 shared contract artifacts.")
    parser.add_argument("--input", help="Input panel path. Defaults to the checked-in checkpoint panel.")
    parser.add_argument(
        "--contract",
        default="config/checkpoint1_contract.json",
        help="Path to the Stage 0 contract JSON.",
    )
    parser.add_argument(
        "--output-dir",
        default="outputs/stage0",
        help="Directory where shared sample artifacts should be written.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contract = load_contract(args.contract)
    input_path = resolve_input_path(args.input)
    panel = load_panel(input_path)
    artifacts = build_stage0_artifacts(panel, contract)
    write_stage0_artifacts(artifacts, Path(args.output_dir), contract)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
