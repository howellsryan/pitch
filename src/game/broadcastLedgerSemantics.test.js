import { describe, expect, it } from 'vitest';
import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

const playersById = new Map([
  ['g1',{ id:'g1', name:'Noah Hart', position:'GK' }],
  ['p1',{ id:'p1', name:'Mason Vale', position:'CM' }],
  ['p2',{ id:'p2', name:'Rico Lane', position:'ST' }],
  ['d1',{ id:'d1', name:'Jon Bell', position:'CB' }],
  ['s1',{ id:'s1', name:'Kai Stone', position:'ST' }],
]);

function record(extra = {}) {
  return {
    route:'circulation', actorId:'p1', targetId:'p2', defenderId:'d1',
    outcome:'retain', ...extra,
  };
}

describe('text-first authoritative broadcast semantics', () => {
  it.each([
    ['circulation','Build-up · patient circulation','BUILD-UP · KEEPING THE BALL','moving the defensive block'],
    ['direct_pass','Progression · direct ball','DIRECT PROGRESSION · BREAKING LINES','bypass midfield pressure'],
    ['pass_into_space','Progression · ball in behind','RUN IN BEHIND · ATTACKING SPACE','gap behind an advanced defence'],
    ['carry','Progression · ball carry','CARRY · COMMITTING THE DEFENCE','Committing a defender'],
    ['wide_delivery','Final third · wide delivery','WIDE ATTACK · DELIVERY INTO THE BOX','overload the box'],
  ])('explains the %s route and its tactical intention without changing the record', (route, label, action, detail) => {
    const input = record({ route });
    const before = JSON.parse(JSON.stringify(input));
    const presentation = describeBroadcastLedgerRecord(input, { playersById, stage:'route' });

    expect(presentation).toMatchObject({ label, action });
    expect(presentation.detail).toContain(detail);
    expect(input).toEqual(before);
  });

  it('recognises goalkeeper build-up rather than presenting a generic cross-pitch action', () => {
    const short = describeBroadcastLedgerRecord(
      record({ actorId:'g1', targetId:'d1', route:'circulation' }),
      { playersById, stage:'route' },
    );
    const direct = describeBroadcastLedgerRecord(
      record({ actorId:'g1', targetId:'p2', route:'direct_pass' }),
      { playersById, stage:'route' },
    );

    expect(short.action).toBe('GOALKEEPER BUILD-UP · PLAYING SHORT');
    expect(short.detail).toContain('draw the first line of pressure');
    expect(direct.action).toBe('GOALKEEPER BUILD-UP · GOING DIRECT');
    expect(direct.detail).toContain('bypass the press');
  });

  it.each([
    ['intercepted','INTERCEPTION · PASS CUT OUT','possession changes hands'],
    ['turnover','DUEL LOST · POSSESSION TURNS OVER','transition opportunity'],
    ['foul_won','FOUL · FREE KICK WON','controlled restart'],
    ['retain','PRESSURE BEATEN · POSSESSION RETAINED','keep building'],
    ['progress','PROGRESSION · LINE BROKEN','less organised defensive line'],
    ['chance_created','LINE BROKEN · CHANCE CREATED','genuine chance'],
  ])('describes authoritative %s contest outcomes and consequence', (outcome, action, detail) => {
    const presentation = describeBroadcastLedgerRecord(record({ outcome }), { playersById, stage:'contest' });
    expect(presentation.action).toBe(action);
    expect(presentation.detail).toContain(detail);
  });

  it.each([
    ['goal',false,'GOAL · CHANCE CONVERTED','decisive action'],
    ['saved',false,'SAVE · GOALKEEPER DENIES THE CHANCE','does not change the score'],
    ['missed',false,'SHOT · OFF TARGET','not a save'],
    [null,true,'SHOT BLOCKED · CORNER','territorial pressure'],
    [null,false,'SHOT · BLOCKED','defensive line survives'],
  ])('describes the authoritative %s shot outcome without inferring another result', (finish, cornerWon, action, detail) => {
    const presentation = describeBroadcastLedgerRecord(
      record({ outcome:'chance_created', shotId:'s1', finish, cornerWon }),
      { playersById, stage:'chance' },
    );
    expect(presentation.action).toBe(action);
    expect(presentation.detail).toContain(detail);
  });

  it('describes goalkeeper possession as a reset before the next attack', () => {
    const presentation = describeBroadcastLedgerRecord(
      record({ actorId:'g1' }),
      { playersById, stage:'acquire' },
    );
    expect(presentation.action).toBe('GOALKEEPER POSSESSION · RESETTING PLAY');
    expect(presentation.detail).toContain('rebuild its shape');
  });

  it('falls back safely for sparse legacy records and exposes no engine internals', () => {
    const presentation = describeBroadcastLedgerRecord({}, { stage:'route' });
    expect(presentation.label).toBe('Build-up');
    expect(presentation.detail).toEqual(expect.any(String));
    expect(JSON.stringify(presentation)).not.toContain('execution');
    expect(JSON.stringify(presentation)).not.toContain('successChance');
  });
});
