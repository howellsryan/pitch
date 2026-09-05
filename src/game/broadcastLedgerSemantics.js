const ROUTE_PRESENTATION = Object.freeze({
  circulation:{ label:'Build up · circulate', action:'CIRCULATION · KEEPING THE BALL' },
  direct_pass:{ label:'Progression · direct pass', action:'DIRECT PASS · BREAKING LINES' },
  pass_into_space:{ label:'Penetration · pass into space', action:'PASS INTO SPACE · RUN IN BEHIND' },
  carry:{ label:'Progression · carry', action:'CARRY · DRIVING FORWARD' },
  wide_delivery:{ label:'Wide attack · delivery', action:'WIDE DELIVERY · INTO THE BOX' },
});

export const BROADCAST_LEDGER_SEMANTICS_VERSION = 1;

function playerName(playersById, id, fallback) {
  return id != null && playersById?.get?.(id)?.name ? playersById.get(id).name : fallback;
}

function routeDetail(record, names) {
  const { actor, target, defender } = names;
  switch (record.route) {
    case 'circulation': return target && target !== actor ? `${actor} recycles possession toward ${target}.` : `${actor} keeps the move alive.`;
    case 'direct_pass': return target && target !== actor ? `${actor} looks early for ${target}.` : `${actor} plays forward quickly.`;
    case 'pass_into_space': return target && target !== actor ? `${target} attacks the space beyond the line as ${actor} releases the pass.` : `${actor} looks to exploit the space behind.`;
    case 'carry': return defender ? `${actor} carries at ${defender}.` : `${actor} drives forward with the ball.`;
    case 'wide_delivery': return target && target !== actor ? `${actor} shapes a delivery toward ${target}.` : `${actor} sends the ball into the danger area.`;
    default: return `${actor} advances the attack.`;
  }
}

function contestPresentation(record, names) {
  const { actor, defender } = names;
  if (record.outcome === 'intercepted') return {
    action:'INTERCEPTION · PASS CUT OUT',
    detail:defender ? `${defender} reads ${actor}'s pass and steps in.` : `${actor}'s pass is intercepted.`,
  };
  if (record.outcome === 'turnover') return {
    action:'TACKLE · POSSESSION LOST',
    detail:defender ? `${defender} wins the duel from ${actor}.` : `${actor} is dispossessed.`,
  };
  if (record.outcome === 'foul_won') return {
    action:'FOUL · FREE KICK WON',
    detail:defender ? `${actor} draws the foul from ${defender}.` : `${actor} wins a free kick.`,
  };
  if (record.outcome === 'corner_won' || record.cornerWon) return {
    action:record.route === 'wide_delivery' ? 'DELIVERY BLOCKED · CORNER' : 'BLOCKED · CORNER WON',
    detail:defender ? `${defender} blocks the attack behind for a corner.` : 'The attack is blocked behind for a corner.',
  };
  if (record.outcome === 'retain') return {
    action:record.route === 'circulation' ? 'POSSESSION RETAINED · RECYCLE' : 'POSSESSION RETAINED',
    detail:`${actor} keeps possession after the contest.`,
  };
  if (record.outcome === 'progress' || record.outcome === 'chance_created') return {
    action:record.outcome === 'chance_created' ? 'PROGRESSION · CHANCE CREATED' : 'PROGRESSION · LINE BROKEN',
    detail:record.outcome === 'chance_created'
      ? `${actor}'s route opens a shooting chance.`
      : `${actor} progresses beyond the pressure.`,
  };
  return { action:'CONTEST · ATTACK CONTINUES', detail:`${actor} contests the next phase of the move.` };
}

function shotPresentation(record, names) {
  const shooter = names.shooter;
  if (record.finish === 'goal') return { action:'SHOT · GOAL', detail:`${shooter} finishes the chance.` };
  if (record.finish === 'saved') return { action:'SHOT · SAVED', detail:`${shooter}'s effort is kept out.` };
  if (record.finish === 'missed') return { action:'SHOT · WIDE', detail:`${shooter} sends the effort off target.` };
  if (record.cornerWon) return { action:'SHOT BLOCKED · CORNER', detail:`${shooter}'s effort is blocked behind.` };
  return { action:'SHOT · BLOCKED', detail:`${shooter}'s effort is blocked.` };
}

/**
 * T6 presentation-only language over one authoritative ledger record.
 * No timing, geometry, RNG or football outcome is produced here.
 */
export function describeBroadcastLedgerRecord(record, { playersById = new Map(), stage = 'route' } = {}) {
  if (!record || typeof record !== 'object') return { label:'Build up', action:'BUILDING THE ATTACK', detail:'The teams reset for the next phase.' };
  const names = {
    actor:playerName(playersById, record.actorId, 'The ball carrier'),
    target:playerName(playersById, record.targetId, null),
    defender:playerName(playersById, record.defenderId, null),
    shooter:playerName(playersById, record.shotId, 'The attacker'),
  };
  const route = ROUTE_PRESENTATION[record.route] ?? { label:'Build up', action:'BUILDING THE ATTACK' };

  if (stage === 'chance' || stage === 'shot' || (record.shotId != null && stage === 'settle')) {
    const shot = shotPresentation(record, names);
    return { label:route.label, ...shot };
  }
  if (stage === 'contest' || stage === 'settle') {
    const contest = contestPresentation(record, names);
    return { label:route.label, ...contest };
  }
  if (stage === 'acquire') {
    return {
      label:route.label,
      action:'TRANSITION · SECURING POSSESSION',
      detail:`${names.actor} moves onto the ball for the next attack.`,
    };
  }
  return { label:route.label, action:route.action, detail:routeDetail(record, names) };
}
