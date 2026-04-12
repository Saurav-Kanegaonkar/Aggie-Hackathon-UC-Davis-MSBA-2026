# Dataset Construction

The analysis panel (`panel_990_extended.parquet`) is built in three layers. Layer 1 is GivingTuesday's Basic 120 Fields data mart (Oct 2025 snapshot), which provides the validated spine of ~3.6M filings from 2007-2024 across 465K nonprofits. Layer 2 appends late-2025 and early-2026 IRS bulk XML batches (Nov 2025 through Feb 2026), adding ~165K net-new filings — mostly FY2024 extension filers and FY2025 early filers. For the ~1,600 filings that appear in both layers with different financial values (amendments filed after GivingTuesday's snapshot), we keep the IRS version as the more recent filing. Layer 3 (pending) will join NTEE codes from the IRS Business Master File for peer benchmarking by mission category.

Regenerate with: `python parsing/build_panel.py` (Layer 1), then `python parsing/extend_panel.py` (Layer 2).
