# Shared agent workflows

Pitch consumes reusable skills from Agent-Template and their canonical upstream
sources. `.agents/skills.lock.json` owns exact revisions and selected skill paths.
The game-specific rules remain in this repository's AGENTS.md/CLAUDE.md.

## Start a task

From the repository root, before implementation or editing durable instructions:

```bash
npm run agents:install
npm run agents:check
```

Equivalent commands: `python3 tools/agent-skills.py` and
`python3 tools/agent-skills.py --check`. Requires Python 3.10+, Git and symlink
support. First install needs GitHub/raw.githubusercontent.com access. The loader
checks the centrally maintained installer's SHA-256 before executing it.

Read `.agents/skills/<name>/SKILL.md` in full for each applicable skill. Generated
links expose the same files to Claude Code under `.claude/skills/`. If native
skill discovery happened before bootstrap, read those files directly for this
task; use a fresh session when native menu discovery is needed. Never claim a
skill ran merely because its name appeared in these instructions.

| Task | Skill |
| --- | --- |
| Implementation | delivery-loop |
| Novel/multi-system, save lifecycle, event queue, simulation mathematics, module/import ordering, data pipeline or rating calibration | plan-gate |
| Changes to existing work | scope-fence |
| Broken behaviour | systematic-debugging |
| Completion, commit or PR evidence | verification-before-completion |
| Persistent instructions or consequential recalled facts | memory-hygiene |
| Failing regression construction requested by systematic-debugging | test-driven-development |

An upstream reference such as `superpowers:test-driven-development` maps to the
installed `test-driven-development` directory. Its supporting resources are
included. Code Review is a charter inside delivery-loop's `steps.md`; it does not
depend on a missing `code-review` plugin.

## Pitch-specific gates

- Keep authoritative simulation in the engine, presentation in Broadcast, domain
  logic DOM-free, and existing save/queue boundaries intact. Read the contributor
  guide and live code for current ownership and schema, not old skill examples.
- Run `npm run build`, `npm run test`, `npm run lint` and
  `npm run check:accents` for implementation verification as required by the guide.
  The legacy replacement-contract bridge must pass; allow-listed old assertions
  alone are not proof. Do not weaken tests or thresholds to obtain a green result.
- Testing is logic/unit contracts plus hands-on app inspection. Do not add or
  restore an E2E/browser suite, dependencies or CI browser job. Upstream skill
  examples do not change this policy. Reproduce UI defects manually; cover pure
  domain regressions with Vitest.
- New/restyled UI requires inspected rendered screenshots at the affected mobile
  width and wider widths where changed. Inspect opaque surfaces and resolved
  theme tokens. A green source validator cannot prove that a screen looks right.
- For persistence bugs, trace values across Svelte state and IndexedDB: deep
  reactive proxies cannot be structured-cloned directly. Fix the owning boundary.
- Failed tests need diagnosis; do not rerun until chance produces green. Check
  a suspected pre-existing failure against unchanged main and disclose evidence.
- Work within the user's authorized scope. Before a fourth unsuccessful debugging
  fix, stop and reassess the architecture; surface genuine product/scope decisions.
- Final handoff reports what changed, fresh verification, PR and direct preview
  links, next milestone, and anything not verified. CI/preview evidence must
  correspond to the final pushed SHA where those gates apply.

These retain the relevant rules previously embedded in local skill copies.
Obsolete validator counts, migration-phase guesses and historical flake exemptions
are not carried into shared workflows. The user's current instructions and host
permissions remain authoritative; installing a skill grants no new permissions.

## Restricted / GitHub-only sessions

If bootstrap is unavailable, read `.agents/skills.lock.json` through the GitHub
connector. For each applicable skill, fetch the listed path's `SKILL.md` at the
source's **exact revision**, then its referenced resources (for delivery-loop,
also `steps.md`). This is explicit instruction loading, not native installation.
Identify the source and revision loaded. Do not substitute `main` or infer the
procedure from its name. If a necessary resource cannot be retrieved or a required
script cannot execute, disclose the specific limitation before dependent work.

## Updates and rollback

1. Improve shared skills in Agent-Template, not the generated directories here.
2. Merge the central change first. From that clean checkout, generate a new lock
   using `python3 -B scripts/create_lock.py` and save it as `.agents/skills.lock.json`.
3. Compare `tools/agent-skills.py` with the central `templates/agent-skills.py` when
   updating the bootstrap. Review changed upstream instructions/resources.
4. Install, check and run the appropriate Pitch gates; review this adoption in a PR.
5. To roll back, restore the previous lock and rerun the installer. Existing clean
   cached revisions are reused. Local/project-owned skills are never overwritten.

Pin a merged central commit when adopting updates. If a central PR is squash or
rebase merged, regenerate the lock from the resulting merged commit and rerun
verification. Avoid relying on a subsequently unreachable PR commit.

Do not enable a native marketplace copy of the same workflow alongside bootstrap
links. Marketplace installation is an alternative for separate environments and
does not enforce this lockfile. See Agent-Template's `docs/distribution.md` for
native installation and for adding other repositories later.

## CI and cache maintenance

The dedicated `Agent workflows` job verifies installation from a fresh checkout
and checks it offline. It does not affect application dependencies, build output,
the game runtime or Cloudflare's deployment command.

Cache edits are rejected. Preserve any accidental edits elsewhere, then remove
only the affected `.agents/cache/sources/<owner>/<repo>/<revision>` directory and
reinstall. If a process was interrupted, first confirm it is no longer running
before removing `.agents/install.lock`. Changed/unmanaged discovery links are
rejected, not overwritten. Other project-specific skills can remain checked in.
ESLint excludes generated skill/cache paths so upstream helper code is not
mistaken for Pitch source. Vitest already selects only `src/` and `functions/`.
