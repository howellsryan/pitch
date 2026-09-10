import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  attachPendingPlayableMoment,
  createPlayableMatchSession,
  restorePlayableRuntime,
} from './playableMomentsCareer.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(resolve(here, 'db.js'), 'utf8');

function functionSource(name, length = 2600) {
  const start = dbSource.indexOf(`export async function ${name}`);
  return start === -1 ? '' : dbSource.slice(start, start + length);
}

function liveState() {
  return {
    matchEngineVersion:1,
    actionResolverVersion:2,
    actionLedgerVersion:1,
    rngPacketVersion:1,
    hFitness:new Map([['h1', 91]]),
    aFitness:new Map([['a1', 88]]),
    hActive:[{ id:'h1' }],
    aActive:[{ id:'a1' }],
    hBenchLeft:[],
    aBenchLeft:[],
    hGoals:0,
    aGoals:0,
    hPhases:12,
    aPhases:11,
    hSubsLeft:3,
    aSubsLeft:3,
    actionLedger:[],
    seed:42,
    rngState:77,
  };
}

function pendingSession() {
  const session = createPlayableMatchSession({
    slotId:'career_a',
    event:{ type:'league', gw:4, fixtureId:'fixture-envelope', userIsHome:true },
    userTeamId:'home',
    userIsHome:true,
    liveState:liveState(),
    currentPhase:23,
  });
  return attachPendingPlayableMoment(session, {
    moment:{
      version:1,
      phase:24,
      minute:18,
      mode:'attack',
      attackingTeamId:'home',
      defendingTeamId:'away',
      shooterId:'h1',
      shooterName:'Home One',
      goalkeeperId:'a1',
      goalkeeperName:'Away One',
      defenderId:null,
      route:'carry',
      xg:.22,
      geometry:{ coordinateSystem:'goal-facing-v1', goal:{ width:7.32, height:2.44 } },
    },
    continuation:{
      version:1,
      phase:24,
      minute:18,
      packet:{ version:1, possession:.1, route:.2, actor:.3, target:.4, defender:.5, execution:.6, outcome:.7, chance:.2, shooter:.3, shot:.4, finish:.5, assist:.6, discipline:.8, injury:.9 },
      preparedAction:{ version:1, phase:24 },
      isHome:true,
      rngState:78,
      hActive:[{ id:'h1' }],
      aActive:[{ id:'a1' }],
      hBenchLeft:[],
      aBenchLeft:[],
      hFitness:new Map([['h1', 90.8]]),
      aFitness:new Map([['a1', 87.8]]),
      hSubsLeft:3,
      aSubsLeft:3,
      hGoals:0,
      aGoals:0,
      hPhases:13,
      aPhases:11,
      hStr:{ attack:80 },
      aStr:{ goalkeeping:80 },
      actionLedger:[],
    },
  });
}

describe('Phase 2 save-envelope compatibility', () => {
  it('keeps a pending playable continuation as plain JSON inside the existing active save row', () => {
    const pending = pendingSession();
    const envelopeShapedSnapshot = {
      schemaVersion:2,
      slotId:'career_a',
      stores:{ save:[{ id:'active', slotId:'career_a', saveSchemaVersion:2, playableMatchSession:pending }] },
    };

    const restoredEnvelope = JSON.parse(JSON.stringify(envelopeShapedSnapshot));
    const restoredSession = restoredEnvelope.stores.save[0].playableMatchSession;
    const runtime = restorePlayableRuntime(restoredSession);

    expect(restoredSession.status).toBe('pending');
    expect(restoredSession.pending.momentId).toBe(pending.pending.momentId);
    expect(runtime.currentPhase).toBe(23);
    expect(runtime.pending.continuation.hFitness).toBeInstanceOf(Map);
    expect(runtime.pending.continuation.hFitness.get('h1')).toBe(90.8);
  });

  it('keeps local export and cloud save on the same complete save-envelope owner', () => {
    const envelope = functionSource('buildSaveEnvelope', 3600);
    const localExport = functionSource('exportSaveFile', 1800);
    const cloudExport = functionSource('buildCloudSaveBlob', 1000);

    expect(envelope).toContain('const snapshot = await _snapshotSlot(slotId)');
    expect(envelope).toContain("snapshot.save?.find(s => s.id === 'active')");
    expect(localExport).toContain('await buildSaveEnvelope(slotId)');
    expect(cloudExport).toContain('await buildSaveEnvelope(slotId)');
  });
});
