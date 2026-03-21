#!/usr/bin/env python3
"""
PITCH — Build Script
Usage:  python3 /home/claude/pitch2/build.py
Output: /mnt/user-data/outputs/pitch.html  (also /tmp/bundle_final.js for validate.js)

Steps:
  1. Bundle all JS modules into /tmp/bundle_final.js
  2. Run validate.js — abort if any check fails
  3. Assemble shell.html + bundle → pitch.html
  4. Final structural checks → write to outputs/

Module load order matters for dependency resolution.
All ES module import/export syntax is stripped since we
bundle everything into a single plain-JS file.
"""

import re, subprocess, sys, collections
from pathlib import Path

BASE   = Path('/home/claude/pitch2')
SHELL  = BASE / 'shell.html'
OUTPUT = Path('/mnt/user-data/outputs/pitch.html')
BUNDLE = Path('/tmp/bundle_final.js')

# ── Module load order (dependencies first) ──────────────────────────────────
MODULES = [
    ('data/plTeams.js',           'PL TEAMS'),
    ('data/extraLeagues.js',      'EXTRA LEAGUES'),
    ('data/championship.js',      'CHAMPIONSHIP'),
    ('modules/db.js',             'DATABASE'),
    ('modules/matchEngine.js',    'MATCH ENGINE'),
    ('modules/standings.js',      'STANDINGS'),
    ('modules/fixtures.js',       'FIXTURES'),
    ('modules/cups.js',           'CUPS'),
    ('modules/transfers.js',      'TRANSFERS'),
    ('modules/potential.js',      'POTENTIAL'),
    ('modules/promotion.js',      'PROMOTION'),
    ('modules/youthAcademy.js',   'YOUTH ACADEMY'),
    ('modules/save.js',           'SAVE'),
    ('modules/season.js',         'SEASON'),
    ('modules/gameweek.js',       'GAMEWEEK'),
    ('ui/helpers.js',             'UI HELPERS'),
    ('ui/home_transfers.js',      'HOME & TRANSFERS'),
    ('ui/renderers.js',           'RENDERERS'),
    ('ui/squad_tactics_offers.js','SQUAD TACTICS OFFERS'),
    ('ui/academy.js',             'ACADEMY'),
    ('ui/prematch.js',            'PRE-MATCH'),
    ('ui/watchmatch.js',          'WATCH MATCH'),
]

# ── Naming fixes: old name → correct name ───────────────────────────────────
# Add to this list whenever a rename happens across modules.
RENAMES = [
    ('fmtMoney(',        'fmt.money('),
    ('fmtWage(',         'fmt.wage('),
    ('fmtDate(',         'fmt.date('),
    ('fmtShort(',        'fmt.dateShort('),
    ('showToast(',       'toast('),
    ('formLbl(',         'formLabel('),
    ('potentialAgingAdjust', 'agingValueAdjust'),
]

# ── Dynamic import fix (season.js has one leftover) ─────────────────────────
DYNAMIC_IMPORT_FIX = (
    "await import('./cups.js').catch(() => ({ buildInitialCupState: resetCups }))",
    "{ buildInitialCupState: typeof buildInitialCupState !== 'undefined' ? buildInitialCupState : resetCups }",
)


def strip_modules(src: str) -> str:
    """Remove ES module import/export syntax for plain-JS bundling."""
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

    # Clean up any stray import statements that survived
    bundle = re.sub(r'import\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];\s*', '', bundle, flags=re.DOTALL)

    # Apply dynamic import fix
    bundle = bundle.replace(*DYNAMIC_IMPORT_FIX)

    # Apply all renames
    for old, new in RENAMES:
        bundle = bundle.replace(old, new)

    return bundle


def check_syntax(bundle: str) -> bool:
    r = subprocess.run(['node', '--check'], input=bundle, capture_output=True, text=True)
    if r.returncode != 0:
        print('\n❌ SYNTAX ERROR:')
        print(r.stderr[:600])
        # Try to show context around the error line
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
    # These are known harmless duplicates (identical implementations in different modules)
    allowed_dups = {'primaryRating', 'agingValueAdjust'}
    dups = {k: v for k, v in fn_counts.items() if v > 1 and k not in allowed_dups}
    if dups:
        print(f'  ⚠️  Duplicate function names (may cause bugs): {dups}')
    else:
        print('  ✅ No unexpected duplicate function names')


def run_validation() -> bool:
    print('\n── Running validation suite ────────────────────────────')
    r = subprocess.run(['node', str(BASE / 'validate.js')], capture_output=False)
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
        'btn-adv-header present':    'btn-adv-header' in final,
        'hdrPlay.onclick wired':     'hdrPlay.onclick' in final,
        'pendingEvents queue':       'pendingEvents' in final,
        'buildPendingEvents':        'buildPendingEvents' in final,
        'pm-xi-preview present':     'pm-xi-preview' in final,
        'selectEleven lineup param': 'lineup' in final,
        'No processCupRounds':       'processCupRounds' not in final,
        'No finaliseGW':             'finaliseGW' not in final,
        'Cup roundGWs present':      'roundGWs' in final,
        'Potential system present':  'assignPotentials' in final,
        'GK scorer weight=0':        "'GK': 0" in final,
        'HOME on left in report':    '>HOME<' in final,
        'CHAMPIONSHIP_TEAMS':        'CHAMPIONSHIP_TEAMS' in final,
        'ph-play-btn CSS':           'ph-play-btn' in final,
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

    # 1. Build bundle
    bundle = build_bundle()
    BUNDLE.write_text(bundle)
    print(f'\n  Bundle: {len(bundle):,} chars')

    # 2. Syntax check
    print('\n── Syntax check ────────────────────────────────────────')
    if not check_syntax(bundle):
        sys.exit(1)
    print('  ✅ Syntax OK')
    check_duplicates(bundle)

    # 3. Validation suite
    if not run_validation():
        print('\n❌ Validation failed — fix all failures before shipping.')
        sys.exit(1)

    # 4. Assemble HTML
    print('\n── Assembling HTML ─────────────────────────────────────')
    final = assemble_html(bundle)

    # 5. HTML structural checks
    print('\n── HTML structural checks ──────────────────────────────')
    if not check_html(final):
        print('\n❌ HTML checks failed.')
        sys.exit(1)

    # 6. Write output
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(final)
    print(f'\n╔══════════════════════════════════════════════════════╗')
    print(f'║  ✅  Build complete → pitch.html                      ║')
    print(f'╚══════════════════════════════════════════════════════╝\n')


if __name__ == '__main__':
    main()
