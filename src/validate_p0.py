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
HOME_SCREEN = BASE / 'lib' / 'ui' / 'HomeScreen.svelte'

SUPERSEDED_LEGACY_CHECKS = {
    # FC27 is now authoritative for the current new-career player/club universe.
    # These five assertions hard-code the retired hand-maintained roster shape:
    # a <=35-player cap, two player-to-club assumptions, and fixed league sizes.
    # The FC27 refresh has its own hard gates for resolved clubs, >=16 players,
    # >=1 goalkeeper, unique IDs, valid ratings/positions, and 100% FC27 ratings.
    'All PL teams <=35 players',
    'Ipswich has Hutchinson',
    'Hull has Philogene',
    'League Two exactly 24 teams',
    'Eredivisie exactly 18 teams',

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
    # P1 batches injury probability every six phases in both fast and watched
    # simulation. The old assertions require the retired per-phase source shape;
    # injuryCadence.test.js proves the cumulative 120-phase probability is equal.
    'INJ: injury events fired in simulateMatch',
    'INJ: injury events fired in simulateMatchSegment',
    # Adding the P1 world/history implementation made validate.js's fixed source
    # windows too short to see these unchanged rollover/wage details. They are
    # covered across seasonP0.test.js and seasonP1.test.js against the real files.
    'collapsedDeals cleared at season rollover',
    'processEndOfSeason clears signedThisSeason',
    'LOAN: loan metadata cleared at season end',
    'payWeeklyWages sums player wages per team',
    'payWeeklyWages skips players on loan (already prepaid)',
    'payWeeklyWages deducts bill from team budget',
    # P2 removes the three secondary-screen shortcuts from Home. Those areas
    # remain in the shared desktop/mobile navigation; Home is deliberately kept
    # focused on the season spine and next decision. The replacement contract
    # below asserts the shortcuts stay absent instead of silently ignoring drift.
    'Academy reachable from Home screen',
    'Trophies reachable from Home screen',
    # P2 decorates the watched user side through buildManagedMatchInputs so
    # persisted player roles reach the authoritative engine. The retired checks
    # search for the pre-P2 inline resolved.homePlayers/awayPlayers expression;
    # managerTactics.test.js executes the real home/away mapping contract and
    # proves the AI side is not decorated as the user's squad.
    'REG: startWatch resolves userPlayers from resolved.userIsHome',
    'REG: startWatch resolves oppPlayers from resolved.userIsHome',

    # P3 retires potential.js's per-match, Math.random()-driven development
    # implementation. Development now settles once at the completed world-week
    # boundary from canonical P1 participation/state, with deterministic seeded
    # profile logic in playerDevelopment.js. These legacy checks assert details
    # of the removed algorithm rather than the P3 behaviour. The P3 replacement
    # tests below cover participation, profile calibration, deterministic gains,
    # potential uncertainty and population bounds directly.
    'applyDevelopment applies the morale multiplier',
    'REG: development uses fitnessUpdates for participation',
    'REG: development iterates fitnessUpdates to register ALL participants',
    'REG: clean sheet uses participantIds from fitnessUpdates',
    'REG: clean sheet finds GK from participants, not all cache',
    'REG: defenders get clean sheet bonus',
    'REG: CDM included in defensive clean sheet',
    'REG: base playing points awarded',
    'REG: goal scoring gives growth points',
    'REG: assists give growth points',
    'REG: GK clean sheet gives growth points',
    'REG: youth multiplier 1.5x for age<=20',
    'REG: youth multiplier 1.3x for age<=23',
    'REG: ST primary boost is attack',
    'REG: CB primary boost is defence',
    'REG: GK primary boost is goalkeeping',

    # P7 WP2 routes every budget-mutating write through clubFinance.js's
    # applyLedgerMovement/syncLedgerCash instead of hand-rolled
    # `budget: team.budget +/- x` arithmetic, so team.budget can never drift
    # from the new finance.cash ledger. These three legacy checks match the
    # literal retired expressions; transfersLoanFinance.test.js exercises
    # loanOutPlayer/loanInPlayer's real financial outcomes directly.
    'LOAN: loan club deducted total cost',
    'LOAN: parent club receives loan fee',
    'LOAN: user loan-out gives full wage relief',

    # P7 WP4/WP5 grew processEndOfSeason's board-contract/identity-evolution
    # section past this legacy check's fixed 10,000-character scan window
    # from the start of the function — the real `generateBoardObjective(
    # userTeamUpdated...)` call this check looks for is still there, just
    # further into the function than the window can see (the same
    # fixed-window limitation already documented above for the P1/rollover
    # checks). seasonP1.test.js's own P7 WP5 test asserts the same fact
    # directly against the real, untruncated function source.
    'Season end sets a fresh objective for next season',

    # P7 WP6 grew processEndOfSeason further still (facility-investment
    # section) — the same fixed-window limitation now also hides
    # evaluateBoardObjective/nextJobSecurity and runYouthIntake from their
    # own legacy checks. seasonP1.test.js's dedicated P7 test asserts all
    # three literally against the real, untruncated source.
    'Season end evaluates the outgoing objective',
    'runYouthIntake called in processEndOfSeason',

    # P7 WP7: dismissal (job security or the board contract's own judgment)
    # now executes through the same soft dismissAndCaretake path P6 already
    # built for voluntary resignation, replacing the old hard
    # resetForNewCareer() reset — a fired manager keeps their save/career and
    # becomes a free agent, same as resigning. The legacy check's literal
    # "Start New Career" button text is gone by design; seasonP1.test.js's
    # dedicated P7 WP7 test asserts the real replacement contract (the
    # dismissAndCaretake call, the unified dismissed flag, no reset call).
    'Sacked end-state offers Start New Career, not Start Next Season',

    # P9 retires academy-only persistence. Prospects now live in the canonical
    # players store from new-career seed through academy, promotion, loan and
    # release. The old validator searches exact P7 source strings/arrays, so
    # youthAcademyP9.test.js replaces these checks with executable lifecycle
    # contracts: same-ID AI promotion, three-year first pro deal, and canonical
    # intake with an intentionally empty save.youthCohort compatibility field.
    'AI auto-promotes talented youth',
    'Youth promotion (AI) sets a 3-year contract',
    'youthCohort seeded in startNewGame',

    # Playable Key Moments Phase 7 retires variable 1x/2x/4x watched-match
    # speeds. Regulation now advances all 120 authoritative phases on one fixed
    # 750 ms cadence (90 real seconds total when uninterrupted), while pause,
    # tactics and pending playable moments freeze that clock. The replacement
    # source contract below asserts both the new cadence and that the old speed
    # controls/multiplier cannot silently return.
    'Speed control 1x/2x/4x',

    # The old tactics assertions scan MatchScreen for controls that now live in
    # the dedicated mobile-first LiveTacticsSheet component. The replacement
    # contract checks the actual sheet plus MatchScreen's immediate authoritative
    # formation-change/close handlers, so this is a source-layout replacement,
    # not a weakening of the behaviour gate.
    'In-match tactics formation changes auto-apply',
    'In-match tactics has an explicit return to match',
}

P0_TEST_FILES = [
    'src/modules/competitionRules.test.js',
    'src/modules/competitionIntegration.test.js',
    'src/modules/dbSaveMigration.test.js',
    'src/modules/seasonP0.test.js',
    'src/modules/seasonP1.test.js',
    # P1 replacements for the living-world source-shape assertions above.
    'src/modules/world.test.js',
    'src/modules/worldCompetitions.test.js',
    'src/modules/worldRuntime.test.js',
    'src/game/injuryCadence.test.js',
    # P2 replacements for watched mapping and deterministic cup parity.
    'src/game/managerTactics.test.js',
    'src/game/cupP2Parity.test.js',
    # P3 replacements for retired per-match development/source-shape checks.
    'src/modules/playerPathways.test.js',
    'src/modules/playerDevelopment.test.js',
    'src/modules/playerRehabilitation.test.js',
    # P7 WP2 replacement for the retired loan-financials source-shape checks.
    'src/modules/transfersLoanFinance.test.js',
    # P9 replacement contracts for the retired academy-array/source assertions.
    'src/modules/playerStatus.test.js',
    'src/modules/academyPathways.test.js',
    'src/modules/playerDevelopmentP9.test.js',
    'src/modules/youthAcademyP9.test.js',
    # Playable Key Moments Phase 7 live-match replacement contracts. These
    # explicitly cover the fixed cadence/ledger barrier, football clock, mobile
    # tactics UX, direct substitutions and the non-authoritative goalkeeper read.
    'src/game/matchScreenLiveTiming.test.js',
    'src/game/liveMatchClock.test.js',
    'src/game/liveTacticsMobile.test.js',
    'src/game/substitutions.test.js',
    'src/game/playableGoalkeeperRead.test.js',
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


def run_home_shortcut_contract() -> bool:
    """Protect P2's intentionally simplified Home information architecture."""
    src = HOME_SCREEN.read_text()
    retired = {
        'Academy': "navigateTo('academy')",
        'Trophies': "navigateTo('trophies')",
        'Settings': "navigateTo('settings')",
    }
    present = [label for label, needle in retired.items() if needle in src]
    if present:
        print('\n❌ Home shortcut replacement contract failed:')
        print(f"  Retired Home shortcuts still present: {', '.join(present)}")
        return False
    print('  ✅ P2 Home keeps Academy / Trophies / Settings shortcuts out of the season spine')
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
    if not run_home_shortcut_contract():
        return 1
    if not run_p0_contracts():
        print('\n❌ Replacement contracts failed.')
        return 1

    print('\n✅ Legacy validation + deterministic replacement contracts passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())