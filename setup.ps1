$ErrorActionPreference = "Stop"

# cd to repo root (wherever this script lives)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host ""
Write-Host "=== Aggie Hackathon Setup ==="
Write-Host ""

# Step 1: Check Python 3.11+
Write-Host "[1/6] Checking Python version..."

$pythonCmd = $null
foreach ($candidate in @("python", "python3")) {
    try {
        $null = & $candidate --version 2>&1
        $pythonCmd = $candidate
        break
    } catch {
        continue
    }
}

if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found. Install Python 3.11+ first." -ForegroundColor Red
    Write-Host "See docs/onboarding.md for instructions."
    exit 1
}

$versionCheck = & $pythonCmd -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" 2>&1
if ($LASTEXITCODE -ne 0) {
    $actual = & $pythonCmd --version 2>&1
    Write-Host "ERROR: Python 3.11+ required, found: $actual" -ForegroundColor Red
    Write-Host "See docs/onboarding.md for install instructions."
    exit 1
}

$pyver = & $pythonCmd --version 2>&1
Write-Host "  Found $pyver"

# Step 2: Create venv if needed
Write-Host "[2/6] Creating virtual environment..."
if (Test-Path "venv") {
    Write-Host "  venv/ already exists, reusing."
} else {
    & $pythonCmd -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create virtual environment." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Created venv/"
}

# Step 3: Activate venv
Write-Host "[3/6] Activating virtual environment..."
& .\venv\Scripts\Activate.ps1

# Step 4: Upgrade pip
Write-Host "[4/6] Upgrading pip..."
pip install --upgrade pip --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upgrade pip." -ForegroundColor Red
    exit 1
}

# Step 5: Install dependencies
Write-Host "[5/6] Installing dependencies..."
pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
    exit 1
}

# Step 6: Validate
Write-Host "[6/6] Running schema validation..."
python orchestrator/validate_state.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Schema validation failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Setup complete ==="
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Activate the venv:  venv\Scripts\Activate.ps1"
Write-Host "  2. Read the onboarding guide:  docs\onboarding.md"
Write-Host "  3. Pull latest main and start your task"
Write-Host ""

# Remind Windows users about git config
$autocrlf = git config --global core.autocrlf 2>$null
if ($autocrlf -ne "input") {
    Write-Host "REMINDER: Run 'git config --global core.autocrlf input' to avoid line-ending issues." -ForegroundColor Yellow
    Write-Host "See docs/onboarding.md Section 1 for details."
    Write-Host ""
}
