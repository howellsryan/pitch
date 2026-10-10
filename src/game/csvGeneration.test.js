import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import process from 'node:process';

function generateInvalidCsv({ orphan = false, laterLeague = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pitch-csv-'));
  try {
    mkdirSync(join(root, 'tools'));
    mkdirSync(join(root, 'src/data/csv'), { recursive:true });
    copyFileSync(resolve('tools/csv-to-league.mjs'), join(root, 'tools/csv-to-league.mjs'));
    symlinkSync(resolve('tools/lib'), join(root, 'tools/lib'), 'dir');
    const teams = 'team_id,name,reputation,league\nclub,Club,70,Premier League\n';
    const header = 'team_id,player_id,name,nationality,position,age,attack,midfield,defence,goalkeeping,value_millions,wage_thousands,potential\n';
    const valid = Array.from({ length:16 }, (_, i) => `club,p${i},Player ${i},England,${i===0?'GK':'CM'},24,70,70,70,70,1,1,75`).join('\n')+'\n';
    writeFileSync(join(root, 'src/data/csv/pl_teams.csv'), teams);
    writeFileSync(join(root, 'src/data/csv/pl_players.csv'), header+valid+(orphan ? 'missing,orphan,Orphan,England,CM,24,70,70,70,70,1,1,75\n' : laterLeague ? '' : 'club,bad,Bad,England,INVALID,24,70,70,70,70,1,1,75\n'));
    const original = 'export const PL_TEAMS = [];\n';
    writeFileSync(join(root, 'src/data/plTeams.js'), original);
    if (laterLeague) {
      writeFileSync(join(root, 'src/data/csv/championship_teams.csv'), teams);
      writeFileSync(join(root, 'src/data/csv/championship_players.csv'), header+'club,bad,Bad,England,INVALID,24,70,70,70,70,1,1,75\n');
    }
    const result = spawnSync(process.execPath, [join(root,'tools/csv-to-league.mjs'), ...(laterLeague ? [] : ['--league=prem'])], { encoding:'utf8' });
    return { status:result.status, file:readFileSync(join(root,'src/data/plTeams.js'),'utf8'), original, log:result.stdout+result.stderr };
  } finally { rmSync(root, { recursive:true, force:true }); }
}

describe('league CSV validation before generation', () => {
  it.each([{},{ orphan:true },{ laterLeague:true }])('rejects invalid inputs without replacing valid generated data (%j)', options => {
    const result = generateInvalidCsv(options);
    expect(result.status, result.log).toBe(1);
    expect(result.file).toBe(result.original);
  });
});
