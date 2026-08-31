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

# Core modules (dependencies first). P0's competitionRules.js is deliberately
# immediately before cups.js. P1's world helpers sit after youthAcademy because
# they consume fixtures, match/standing helpers and youth/newgen generation.
# worldCompetitions.js follows world.js because it consumes the same canonical
# football primitives; worldRuntime/save/season/gameweek consume both contracts.
MODULES += [
    ('modules/db.js',               'DATABASE'),
    ('modules/matchEngine.js',      'MATCH ENGINE'),
    ('modules/standings.js',        'STANDINGS'),
    ('modules/fixtures.js',         'FIXTURES'),
    ('modules/competitionRules.js', 'COMPETITION RULES'),
    ('modules/cups.js',             'CUPS'),
    ('modules/transfers.js',        'TRANSFERS'),
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
    print('  ✅ Syntax OK')
    return True


def check_duplicate_functions(bundle: str) -> bool:
    funcs = re.findall(r'\b(?:async\s+)?function\s+(\w+)\s*\(', bundle)
    counts = collections.Counter(funcs)
    duplicates = {name: count for name, count in counts.items() if count > 1}
    if duplicates:
        print('\n❌ Duplicate function names after bundling:')
        for name, count in sorted(duplicates.items()):
            print(f'  {name}: {count}')
        return False
    print('  ✅ No unexpected duplicate function names')
    return True


def run_validator() -> bool:
    env = os.environ.copy()
    env['PITCH_BUNDLE'] = str(BUNDLE)
    env['PITCH_SHELL'] = str(SHELL)
    proc = subprocess.run([sys.executable, str(BASE / 'validate_p0.py')], cwd=REPO, env=env)
    return proc.returncode == 0


def assemble_html(bundle: str) -> str:
    shell = SHELL.read_text()
    marker = '/*__PITCH_BUNDLE__*/'
    if marker not in shell:
        raise RuntimeError(f'Missing shell marker: {marker}')
    return shell.replace(marker, bundle)


def structural_checks(html: str) -> bool:
    ok = True
    print('\n── HTML structural checks ──────────────────────────────')
    checks = [
        ('Braces balanced', html.count('{') == html.count('}')),
        ('Single <script> tag', html.count('<script>') == 1),
        ('No fmtMoney()', 'fmtMoney(' not in html),
        ('No showToast()', 'showToast(' not in html),
        ('pendingEvents queue', 'pendingEvents' in html),
        ('buildPendingEvents', 'buildPendingEvents' in html),
        ('selectEleven lineup param', 'function selectEleven(players, formation = \'4-3-3\', lineup = null)' in html),
        ('No processCupRounds', 'processCupRounds(' not in html),
        ('No finaliseGW', 'finaliseGW(' not in html),
        ('Cup roundGWs present', 'roundGWs' in html),
        ('Potential system present', 'function assignPotentials' in html),
        ('GK scorer weight=0', "'GK': 0" in html),
        ('CHAMPIONSHIP_TEAMS', 'CHAMPIONSHIP_TEAMS' in html),
    ]
    for label, passed in checks:
        print(f'  {"✅" if passed else "❌"} {label}')
        ok = ok and passed
    return ok


def main() -> int:
    print('\n╔══════════════════════════════════════════════════════╗')
    print('║              PITCH — Build Pipeline                  ║')
    print('╚══════════════════════════════════════════════════════╝\n')
    bundle = build_bundle()
    BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE.write_text(bundle)
    print(f'\n  Bundle: {len(bundle):,} chars')

    print('\n── Syntax check ────────────────────────────────────────')
    if not check_syntax(bundle) or not check_duplicate_functions(bundle):
        return 1

    print('\n── Running validation suite ────────────────────────────')
    if not run_validator():
        print('\n❌ Validation failed — fix all failures before shipping.')
        return 1

    print('\n── Assembling HTML ─────────────────────────────────────')
    html = assemble_html(bundle)
    if not structural_checks(html):
        print('\n❌ HTML structural checks failed.')
        return 1

    OUTPUT.write_text(html)
    lines = html.count('\n') + 1
    print(f'\n  {len(html):,} bytes | {lines} lines | braces {html.count("{")}/{html.count("}")}')
    print('\n╔══════════════════════════════════════════════════════╗')
    print('║  ✅  Build complete → index.html                      ║')
    print('╚══════════════════════════════════════════════════════╝\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
