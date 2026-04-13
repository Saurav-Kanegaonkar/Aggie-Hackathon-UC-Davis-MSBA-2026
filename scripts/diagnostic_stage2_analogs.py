"""
Diagnostic harness from the Stage 2 analog addendum.
Run after pipeline completes: python scripts/diagnostic_stage2_analogs.py
"""
import pandas as pd
import json

df = pd.read_parquet('outputs/stage2/scored_rows_enriched.parquet')

# Status distribution
print('--- Analog status distribution ---')
print(df['recovery_analog_status'].value_counts())

# Yield among 'found' rows
found = df[df['recovery_analog_status'] == 'found']
print(f'\nFound rows: {len(found)}')
print(f'Found rows with count > 0: {(found["recovery_analog_count"] > 0).sum()}')
print(f'Found rows with empty analog list: {(found["recovery_analog_count"] == 0).sum()}')

# Constraint distribution among found rows
print('\n--- Constraint label among found rows ---')
print(found['recovery_analog_constraint'].value_counts())

# Format check
print('\n--- Format check ---')
sample_row = found.iloc[0]
print(f'recovery_analog_eins type: {type(sample_row["recovery_analog_eins"])}')
print(f'recovery_analog_eins sample: {sample_row["recovery_analog_eins"]}')
print(f'JSON serializable: ', end='')
try:
    json.dumps(list(sample_row['recovery_analog_eins']))
    print('yes')
except Exception as e:
    print(f'NO -- {e}')

# Shared sample dump
samples = ['204374795','237071436','203812932','201384250','061652679',
           '042800910','237102713','020549032','160470118','141843628','956125213']
sub = df[df['ein'].isin(samples)][[
    'ein','fiscal_year','recovery_analog_status','recovery_analog_constraint',
    'recovery_analog_count','recovery_analog_eins'
]]
print('\n--- Shared sample dump ---')
print(sub.to_string())
