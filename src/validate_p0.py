#!/usr/bin/env python3
"""P0 compatibility bridge for the legacy bundle validator.

validate.js still carries a handful of assertions that intentionally describe
pre-P0 behaviour/source layout (away goals, old FA Cup entry, UCL-only wrapper
shape, and monolithic save import/export functions). We keep every other
legacy assertion authoritative, but replace those exact checks with the real,
deterministic P0 Vitest contracts.

This is intentionally a narrow allow-list, not "ignore validator failures": an
unknown legacy failure is fatal. As individual validate.js assertions are
modernised they should be removed from SUPERSEDED_LEGACY_CHECKS.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = BASE.parent
LEGACY_VALIDATOR = BASE / 'validate.js'

SUPERSEDED_LEGACY_CHECKS = {
    # P0 removes away goals. The old assertion became stochastic once level
    # aggregate ties correctly went to extra time/penalties.
    'computeTwoLegOutcome: away goals break aggregate tie',
    # The generic UEFA league-phase adapter replaced UCL-only source layout.
    'UCL matchday returns userIsHome',
    'REG: UCL results stored with isUCLMatchday flag',
    'REG: UCL matchday returns stats field',
    'REG: UCL matchday returns fitnessUpdates',
    'REG: UCL matchday returns events',
    # Championship/Premier League clubs now enter the FA Cup in round three.
    'buildInitialCupState: fa_cup Champ roundIndex=1',
    # Same recovery behaviour, refactored expression/source shape.
    'REG: played players get +20 recovery',
    # Save serialization/validation moved into shared helpers so local export,
    # cloud save and import all consume one versioned envelope path.
    'REG: export reads save store',
    'REG: export reads teams store',
    'REG: export reads players store',
    'REG: export reads fixtures store',
    'REG: export reads standings store',
    'REG: export reads honors store',
    'REG: export reads seasons store',
    'REG: import checks integrity hash',
    'REG: import checks magic version',
    'REG: import validates snapshot has save',
    'REG: import validates snapshot has teams',
    'REG: import validates snapshot has players',
    'REG: import deletes old DB before restore',
}

P0_TEST_FILES = [
    'src/modules/competitionRules.test.js',
    'src/modules/competitionIntegration.test.js',
    'src/modules/dbSaveMigration.test.js',
    'src/modules/seasonP0.test.js',
]


def _legacy_failure_labels(output: str) -> set[str]:
    return set(re.findall(r'❌ FAIL \d+: (.+)', output))


def run_legacy_validator(env: dict[str, str]) -> bool:
    proc = subprocess.run(
        ['node', str(LEGACY_VALIDATOR)],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
    )
    output = (proc.stdout or '') + (proc.stderr or '')

    if proc.returncode == 0:
        print(output, end='')
        return True

    labels = _legacy_failure_labels(output)
    unexpected = labels - SUPERSEDED_LEGACY_CHECKS
    if not labels or unexpected:
        print(output, end='')
        if unexpected:
            print('\n❌ Unexpected legacy validation failures:')
            for label in sorted(unexpected):
                print(f'  - {label}')
        return False

    result_line = next((line.strip() for line in output.splitlines() if 'RESULT:' in line), None)
    if result_line:
        print(f'  {result_line}')
    print('  ⚠️  Legacy validator hit only assertions superseded by P0 contracts:')
    for label in sorted(labels):
        print(f'     ↳ {label}')
    return True


def run_p0_contracts() -> bool:
    print('\n── Running deterministic P0 replacement contracts ───────────')
    proc = subprocess.run(
        ['npx', 'vitest', 'run', *P0_TEST_FILES],
        cwd=REPO,
        env=os.environ.copy(),
    )
    return proc.returncode == 0


def main() -> int:
    env = {
        **os.environ,
        'PITCH_BUNDLE': os.environ.get('PITCH_BUNDLE', str(REPO / '.build' / 'bundle_final.js')),
        'PITCH_SHELL': os.environ.get('PITCH_SHELL', str(BASE / 'shell.html')),
    }

    if not run_legacy_validator(env):
        return 1
    if not run_p0_contracts():
        print('\n❌ P0 replacement contracts failed.')
        return 1

    print('\n✅ Legacy validation + P0 replacement contracts passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
