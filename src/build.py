#!/usr/bin/env python3
"""
PITCH — Build Script
Usage:  python3 src/build.py
Output: index.html at the repo root (plus .build/bundle_final.js)

Module load order matters for dependency resolution. ES module import/export
syntax is stripped because the legacy bundle is emitted as one plain script.
"""

import os, re, subprocess, sys, collections
from pathlib import Path

BASE   = Path(__file__).resolve().parent
REPO   = BASE.parent
SHELL  = BASE / 'shell.html'
OUTPUT = REPO / 'index.html'
BUNDLE = REPO / '.build' / 'bundle_final.js'

MODULES = []

_data_dir = BASE / 'data'
_data_files = sorted(_data_dir.glob('*.js'))
for df in _data_files:
    label = df.stem.upper().replace('_', ' ')
    MODULES.append((f'data/{df.name}', label))

# Core modules (dependencies first). P5 training is consumed by P3 development,
# while coaching is dependency-free and is shared by scouting/runtime. Scouting
# loads after player/tactics selectors and before the shared P4/P5 squad planner.
# P3 rehabilitation/player model then compose the canonical weekly player state.
# P4's market state/facade follow the shared planner. P5 runtime sits after those
# pure contracts and before save/gameweek, where migration and closeout consume
# it. P1 world helpers remain after youthAcademy and before worldRuntime/save.
MODULES += [
    ('modules/db.js',               'DATABASE'),
    ('modules/playerPathways.js',   'PLAYER PATHWAYS'),
    ('modules/training.js',         'TRAINING'),
    ('modules/coaching.js',         'COACHING'),
    ('modules/playerDevelopment.js', 'PLAYER DEVELOPMENT'),
    ('modules/playerRehabilitation.js', 'PLAYER REHABILITATION'),
    ('modules/playerModel.js',      'PLAYER MODEL'),
    ('modules/tactics.js',          'TACTICS'),
    ('modules/managerTactics.js',   'MANAGER TACTICS'),
    ('modules/matchEngine.js',      'MATCH ENGINE'),
    ('modules/standings.js',        'STANDINGS'),
    ('modules/fixtures.js',         'FIXTURES'),
    ('modules/competitionRules.js', 'COMPETITION RULES'),
    ('modules/cups.js',             'CUPS'),
    ('modules/scouting.js',         'SCOUTING'),
    ('modules/squadPlanning.js',    'SQUAD PLANNING'),
    ('modules/transferMarket.js',   'TRANSFER MARKET'),
    ('modules/transfers.js',        'TRANSFERS'),
    ('modules/p5Runtime.js',        'P5 CAREER DEPTH RUNTIME'),
    ('modules/potential.js',        'POTENTIAL'),
    ('modules/injuries.js',         'INJURIES'),
    ('modules/promotion.js',        'PROMOTION'),
    ('modules/youthAcademy.js',     'YOUTH ACADEMY'),
    ('modules/world.js',            'LIVING WORLD'),
    ('modules/worldCompetitions.js','WORLD COMPETITIONS'),
    ('modules/worldRuntime.js',     'WORLD RUNTIME'),
    ('modules/save.js',             'SAVE'),
    ('modules/season.js',           'SEASON'),
    ('modules/gameweek.js',         'GAMEWEEK'),
    ('lib/theme.mjs',               'CLUB THEME'),
    ('ui/helpers.js',               'UI HELPERS'),
    ('ui/home_transfers.js',        'HOME & TRANSFERS'),
    ('ui/renderers.js',             'RENDERERS'),
    ('ui/squad_tactics_offers.js',  'SQUAD TACTICS OFFERS'),
    ('ui/inbox.js',                 'INBOX'),
]

RENAMES = [
    ('fmtMoney(',        'fmt.money('),
    ('fmtWage(',         'fmt.wage('),
    ('fmtDate(',         'fmt.date('),
    ('fmtShort(',        'fmt.dateShort('),
    ('showToast(',       'toast('),
    ('formLbl(',         'formLabel('),
    ('potentialAgingAdjust', 'agingValueAdjust'),
    ('potentialAgingDecline', 'applyAgingDecline'),
]

DYNAMIC_IMPORT_FIX = (
    "await import('./cups.js').catch(() => ({ buildInitialCupState: resetCups }))",
    "{ buildInitialCupState: typeof buildInitialCupState !== 'undefined' ? buildInitialCupState : resetCups }",
)


def strip_modules(src: str) -> str:
    src = re.sub(r'import\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];\s*', '', src, flags=re.DOTALL)
    src = re.sub(r'import\s+\w+\s+from\s*[\'"][^\'"]+[\'"];\s*', '', src)
    src = re.sub(r'\bexport\s+async\s+function\b', 'async function', src)
    src = re.sub(r'\bexport\s+function\b',         'function',        src)
    src = re.sub(r'\bexport\s+(const|let|var)\b',  r'\1',             src)
    src = re.sub(r'\bexport\s+\{[^}]*\};\s*\n?',   '',                src)
    src = re.sub(r'\bexport\s+default\b',           '',                src)
    return src


def build_bundle() -> str:
    print('── Building bundle ─────────────────────────────────────')
    parts = []
    for path, label in MODULES:
        full = BASE / path
        if not full.exists():
            print(f'  ❌ Missing: {path}')
            sys.exit(1)
        src = strip_modules(full.read_text())
        parts.append(f'\n// {"─"*56}\n// {label}\n// {"─"*56}\n{src}')
        print(f'  ✅ {path}  ({full.stat().st_size:,} bytes)')

    bundle = '\n'.join(parts)
    bundle = re.sub(r'import\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];\s*', '', bundle, flags=re.DOTALL)
    bundle = bundle.replace(*DYNAMIC_IMPORT_FIX)
    for old, new in RENAMES:
        bundle = bundle.replace(old, new)
    return bundle


def check_syntax(bundle: str) -> bool:
    r = subprocess.run(['node', '--check'], input=bundle, capture_output=True, text=True)
    if r.returncode != 0:
        print('\n❌ SYNTAX ERROR:')
        print(r.stderr[:600])
        lines = bundle.split('\n')
        for seg in r.stderr.split(':'):
            try:
                n = int(seg.strip())
                if 1 < n <= len(lines):
                    print(f'\nContext around line {n}:')
                    for i in range(max(0, n-3), min(len(lines), n+3)):
                        marker = '>>>' if i+1 == n else '   '
                        print(f'  {marker} {i+1}: {lines[i]}')
                    break
            except ValueError:
                pass
        return False
    return True


def check_duplicates(bundle: str):
    fn_counts = collections.Counter(re.findall(r'(?:async )?function (\w+)\s*\(', bundle))
    allowed_dups = {'primaryRating', 'agingValueAdjust'}
    dups = {k: v for k, v in fn_counts.items() if v > 1 and k not in allowed_dups}
    if dups:
        print(f'  ⚠️  Duplicate function names (may cause bugs): {dups}')
    else:
        print('  ✅ No unexpected duplicate function names')


def run_validation() -> bool:
    print('\n── Running validation suite ────────────────────────────')
    env = {**os.environ, 'PITCH_BUNDLE': str(BUNDLE), 'PITCH_SHELL': str(SHELL)}
    # P0 keeps the 1,200+ legacy assertions authoritative, but a narrow bridge
    # replaces only the assertions that describe intentionally retired P0
    # behaviour/source layout with deterministic Vitest contracts.
    r = subprocess.run(['python3', str(BASE / 'validate_p0.py')], capture_output=False, env=env)
    return r.returncode == 0


def assemble_html(bundle: str) -> str:
    if not SHELL.exists():
        print(f'❌ Shell not found: {SHELL}')
        sys.exit(1)
    shell = SHELL.read_text()
    return shell + '\n' + bundle + '\n</script>\n</body>\n</html>'


def check_html(final: str) -> bool:
    script = final[final.index('<script>')+8 : final.rindex('</script>')]
    ob, cb = script.count('{'), script.count('}')
    required = {
        'Braces balanced':           ob == cb,
        'Single <script> tag':       final.count('<script>') == 1,
        'No fmtMoney()':             'fmtMoney(' not in final,
        'No showToast()':            'showToast(' not in final,
        'pendingEvents queue':       'pendingEvents' in final,
        'buildPendingEvents':        'buildPendingEvents' in final,
        'selectEleven lineup param': 'lineup' in final,
        'No processCupRounds':       'processCupRounds' not in final,
        'No finaliseGW':             'finaliseGW' not in final,
        'Cup roundGWs present':      'roundGWs' in final,
        'Potential system present':  'assignPotentials' in final,
        'GK scorer weight=0':        "'GK': 0" in final,
        'CHAMPIONSHIP_TEAMS':        'CHAMPIONSHIP_TEAMS' in final,
    }

    all_ok = True
    for label, ok in required.items():
        print(f"  {'✅' if ok else '❌'} {label}")
        if not ok:
            all_ok = False

    print(f'\n  {len(final):,} bytes | {final.count(chr(10))} lines | braces {ob}/{cb}')
    return all_ok


def main():
    print('\n╔══════════════════════════════════════════════════════╗')
    print('║              PITCH — Build Pipeline                  ║')
    print('╚══════════════════════════════════════════════════════╝\n')

    bundle = build_bundle()
    BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE.write_text(bundle)
    print(f'\n  Bundle: {len(bundle):,} chars')

    print('\n── Syntax check ────────────────────────────────────────')
    if not check_syntax(bundle):
        sys.exit(1)
    print('  ✅ Syntax OK')
    check_duplicates(bundle)

    if not run_validation():
        print('\n❌ Validation failed — fix all failures before shipping.')
        sys.exit(1)

    print('\n── Assembling HTML ─────────────────────────────────────')
    final = assemble_html(bundle)

    print('\n── HTML structural checks ──────────────────────────────')
    if not check_html(final):
        print('\n❌ HTML checks failed.')
        sys.exit(1)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(final)
    print(f'\n╔══════════════════════════════════════════════════════╗')
    print(f'║  ✅  Build complete → index.html                      ║')
    print(f'╚══════════════════════════════════════════════════════╝\n')


if __name__ == '__main__':
    main()
