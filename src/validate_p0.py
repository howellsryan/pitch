#!/usr/bin/env python3
"""Compatibility bridge for legacy bundle source-shape assertions.

validate.js still carries a handful of assertions that intentionally describe
pre-P0/P1 behaviour or monolithic source layout. We keep every other legacy
assertion authoritative, but replace those exact checks with deterministic
Vitest contracts that exercise the current architecture.

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
    # The legacy check only scans the first 5,000 source characters of
    # advanceOneFixtureWithResult. P0 draw-state handling legitimately made
    # the function longer; seasonP0.test.js preserves the real closeout contract.
    'advanceOneFixtureWithResult calls generateAIOffers',

    # P1 moves weekly closeout behind one shared world-gameweek helper so Quick
    # Sim and Broadcast cannot drift. These assertions inspect source slices of
    # the two old monolithic functions rather than executing the closeout. The
    # calls still happen once when the world GW completes; P1 world contracts
    # now cover the new projection/recovery path deterministically.
    'payWeeklyWages called from advanceOneFixture',
    'payWeeklyWages called from advanceOneFixtureWithResult',
    'updateTeamMorale called once per gameweek in advanceOneFixture',
    'LOAN: simulateAILoans called in gameweek',
    'INJ: recoveredPlayers returned from advanceOneFixture',
    # updateCache was superseded by worldRuntime's atomic projection. The legacy
    # checks search the retired helper's source for implementation details.
    'INJ: updateCache reads fresh from DB (not stale allPlayers)',
    'REG: rested players restore to 100',
    # The rollover already clears collapsedDeals in season.js. Adding P1 world
    # modules made validate.js's fixed 70k source slice end before that field.
    'collapsedDeals cleared at season rollover',
}

P0_TEST_FILES = [
    'src/modules/competitionRules.test.js',
    'src/modules/competitionIntegration.test.js',
    'src/modules/dbSaveMigration.test.js',
    'src/modules/seasonP0.test.js',
    # P1 replacements for the living-world source-shape assertions above.
    'src/modules/world.test.js',
    'src/modules/worldRuntime.test.js',
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
    print('  ⚠️  Legacy validator hit only assertions superseded by deterministic contracts:')
    for label in sorted(labels):
        print(f'     ↳ {label}')
    return True


def run_p0_contracts() -> bool:
    print('\n── Running deterministic replacement contracts ──────────────')
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
        print('\n❌ Replacement contracts failed.')
        return 1

    print('\n✅ Legacy validation + deterministic replacement contracts passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
