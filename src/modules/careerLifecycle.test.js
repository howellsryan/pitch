import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const saveSource = readFileSync(new URL('./save.js', import.meta.url), 'utf8');
const dbSource = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../lib/ui/EntryScreen.svelte', import.meta.url), 'utf8');
const careerMenuSource = readFileSync(new URL('../lib/ui/CareerMenu.svelte', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../lib/ui/SettingsScreen.svelte', import.meta.url), 'utf8');

function asyncFunctionSource(source, name, nextMarker) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(nextMarker, start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('career lifecycle UI contracts', () => {
  it('clears generated slot stores before best-effort deletion and never hangs on blocked cleanup', () => {
    const resetSlot = dbSource.slice(
      dbSource.indexOf('async function _resetNamedSlot'),
      dbSource.indexOf('function _closeOpenSlot'),
    );

    expect(resetSlot.indexOf('await _clearNamedDB(name)'))
      .toBeLessThan(resetSlot.indexOf('await _deleteNamedDB(name)'));
    expect(dbSource).toContain('req.onblocked = resolve');
  });

  it('clears the selected slot before a fresh career writes any rows', () => {
    const startNewGame = saveSource.slice(
      saveSource.indexOf('export async function startNewGame'),
      saveSource.indexOf('export async function patchSave'),
    );
    const clearIndex = startNewGame.indexOf('await prepareActiveCareerSlotForNewSave()');
    const firstWriteIndex = startNewGame.indexOf('await putTeamsBulk(teams)');

    expect(clearIndex).toBeGreaterThan(-1);
    expect(firstWriteIndex).toBeGreaterThan(clearIndex);
  });

  it('reloads after committing a new career so mounted state cannot leak across slots', () => {
    const start = asyncFunctionSource(entrySource, 'start', '\n  // Both import paths');

    expect(start).toContain("_showFullOverlay('Starting career…')");
    expect(start).toContain('window.location.reload()');
    expect(start).not.toContain('await enterGame()');
  });

  it('routes both delete confirmations through the local-and-cloud delete boundary', () => {
    const menuDelete = asyncFunctionSource(careerMenuSource, 'confirmDelete', '\n  function formatPosition');
    const settingsDelete = asyncFunctionSource(settingsSource, 'confirmReset', '\n  async function recalcPotentials');

    expect(menuDelete).toContain('await deleteCareerEverywhere(target.slotId)');
    expect(settingsDelete).toContain('await deleteCareerEverywhere()');
  });
});
