#!/usr/bin/env bash
set -euo pipefail

# cd to repo root (wherever this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=== Aggie Hackathon Setup ==="
echo ""

# Step 1: Check Python 3.11+
echo "[1/6] Checking Python version..."
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Install Python 3.11+ first."
    echo "See docs/onboarding.md for instructions."
    exit 1
fi

if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" 2>/dev/null; then
    ACTUAL=$(python3 --version 2>&1)
    echo "ERROR: Python 3.11+ required, found: $ACTUAL"
    echo "See docs/onboarding.md for install instructions."
    exit 1
fi

PYVER=$(python3 --version 2>&1)
echo "  Found $PYVER"

# Step 2: Create venv if needed
echo "[2/6] Creating virtual environment..."
if [ -d "venv" ]; then
    echo "  venv/ already exists, reusing."
else
    python3 -m venv venv
    echo "  Created venv/"
fi

# Step 3: Activate venv
echo "[3/6] Activating virtual environment..."
source venv/bin/activate

# Step 4: Upgrade pip
echo "[4/6] Upgrading pip..."
pip install --upgrade pip --quiet

# Step 5: Install dependencies
echo "[5/6] Installing dependencies..."
pip install -r requirements.txt --quiet

# Step 6: Validate
echo "[6/6] Running schema validation..."
python orchestrator/validate_state.py

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Activate the venv:  source venv/bin/activate"
echo "  2. Read the onboarding guide:  docs/onboarding.md"
echo "  3. Pull latest main and start your task"
echo ""
