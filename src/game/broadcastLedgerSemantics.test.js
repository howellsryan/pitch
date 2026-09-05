import { describe, expect, it } from 'vitest';
import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

const playersById = new Map([
  ['p1',{ id:'p1', name:'Mason Vale' }],
  ['p2',{ id:'p2', name:'Rico Lane' }],
  ['d1',{ id:'d1', name:'Jon Bell' }],
  ['s1',{ id:'s1', name:'Kai Stone' }],
]);

function record(extra = {}) {
  return {
    route:'circulation', actorId:'p1', targetId:'p2', defenderId:'d1',
    outcome:'retain', ...extra,
  };
}

describe('T6 authoritative broadcast semantics', () => {
  it.each([
    ['circulation','Build up · circulate','CIRCULATION · KEEPING THE BALL','recycles possession'],
    ['direct_pass','Progression · direct pass','DIRECT PASS · BREAKING LINES','looks early'],
    ['pass_into_space','Penetration · pass into space','PASS INTO SPACE · RUN IN BEHIND','attacks the space'],
    ['carry','Progression · carry','CARRY · DRIVING FORWARD','carries at'],
    ['wide_delivery','Wide attack · delivery','WIDE DELIVERY · INTO THE BOX','shapes a delivery'],
  ])('distinguishes the %s route without changing the record', (route, label, action, detail) => {
    const input = record({ route });
    const before = structuredClone(input);
    const presentation = describeBroadcastLedgerRecord(input, { playersById, stage:'route' });

    expect(presentation).toMatchObject({ label, action });
    expect(presentation.detail).toContain(detail);
    expect(input).toEqual(before);
  });

  it.each([
    ['intercepted','INTERCEPTION · PASS CUT OUT','Jon Bell reads Mason Vale'],
    ['turnover','TACKLE · POSSESSION LOST','Jon Bell wins the duel'],
    ['foul_won','FOUL · FREE KICK WON','Mason Vale draws the foul'],
    ['retain','POSSESSION RETAINED · RECYCLE','Mason Vale keeps possession'],
    ['progress','PROGRESSION · LINE BROKEN','Mason Vale progresses'],
    ['chance_created','PROGRESSION · CHANCE CREATED','opens a shooting chance'],
  ])('describes authoritative %s contest outcomes', (outcome, action, detail) => {
    const presentation = describeBroadcastLedgerRecord(record({ outcome }), { playersById, stage:'contest' });
    expect(presentation.action).toBe(action);
    expect(presentation.detail).toContain(detail);
  });

  it.each([
    ['goal',false,'SHOT · GOAL','Kai Stone finishes'],
    ['saved',false,'SHOT · SAVED','Kai Stone\'s effort is kept out'],
    ['missed',false,'SHOT · WIDE','Kai Stone sends the effort'],
    [null,true,'SHOT BLOCKED · CORNER','Kai Stone\'s effort is blocked behind'],
    [null,false,'SHOT · BLOCKED','Kai Stone\'s effort is blocked'],
  ])('describes the authoritative %s shot outcome without inferring another result', (finish, cornerWon, action, detail) => {
    const presentation = describeBroadcastLedgerRecord(
      record({ outcome:'chance_created', shotId:'s1', finish, cornerWon }),
      { playersById, stage:'chance' },
    );
    expect(presentation.action).toBe(action);
    expect(presentation.detail).toContain(detail);
  });

  it('falls back safely for sparse legacy records and exposes no engine internals', () => {
    const presentation = describeBroadcastLedgerRecord({}, { stage:'route' });
    expect(presentation.label).toBe('Build up');
    expect(presentation.detail).toEqual(expect.any(String));
    expect(JSON.stringify(presentation)).not.toContain('execution');
    expect(JSON.stringify(presentation)).not.toContain('successChance');
  });
});
