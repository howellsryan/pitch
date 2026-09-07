const ROUTE_PRESENTATION = Object.freeze({
  circulation:{ label:'Build-up · patient circulation', action:'BUILD-UP · KEEPING THE BALL' },
  direct_pass:{ label:'Progression · direct ball', action:'DIRECT PROGRESSION · BREAKING LINES' },
  pass_into_space:{ label:'Progression · ball in behind', action:'RUN IN BEHIND · ATTACKING SPACE' },
  carry:{ label:'Progression · ball carry', action:'CARRY · COMMITTING THE DEFENCE' },
  wide_delivery:{ label:'Final third · wide delivery', action:'WIDE ATTACK · DELIVERY INTO THE BOX' },
});

export const BROADCAST_LEDGER_SEMANTICS_VERSION = 2;

function player(playersById, id) {
  return id != null ? playersById?.get?.(id) ?? null : null;
}

function playerName(playersById, id, fallback) {
  return player(playersById, id)?.name ?? fallback;
}

function isGoalkeeper(playersById, id) {
  const candidate = player(playersById, id);
  return candidate?.position === 'GK' || candidate?.naturalPosition === 'GK';
}

function goalkeeperRoutePresentation(record, names) {
  if (record.route === 'circulation') {
    return {
      label:'Build-up · goalkeeper short',
      action:'GOALKEEPER BUILD-UP · PLAYING SHORT',
      detail:names.target && names.target !== names.actor
        ? `${names.actor} starts short toward ${names.target}. The idea is to draw the first line of pressure and create a free player for the next pass.`
        : `${names.actor} keeps the restart short. The team is trying to draw the press before progressing.`
    };
  }
  if (record.route === 'direct_pass') {
    return {
      label:'Build-up · goalkeeper direct',
      action:'GOALKEEPER BUILD-UP · GOING DIRECT',
      detail:names.target && names.target !== names.actor
        ? `${names.actor} goes early toward ${names.target}. The aim is to bypass the press and compete higher up the pitch.`
        : `${names.actor} sends the ball long to bypass the first press.`
    };
  }
  if (record.route === 'pass_into_space') {
    return {
      label:'Transition · goalkeeper release',
      action:'GOALKEEPER RELEASE · SPACE AHEAD',
      detail:names.target && names.target !== names.actor
        ? `${names.actor} releases ${names.target} into space. The opposition shape is being attacked before it can reset.`
        : `${names.actor} releases quickly into the space ahead before the opposition can recover.`
    };
  }
  return null;
}

function routeDetail(record, names) {
  const { actor, target, defender } = names;
  switch (record.route) {
    case 'circulation':
      return target && target !== actor
        ? `${actor} recycles possession toward ${target}. The team is moving the defensive block to open a safer progression lane.`
        : `${actor} keeps the move alive. The priority is control while a better route forward develops.`;
    case 'direct_pass':
      return target && target !== actor
        ? `${actor} looks early for ${target}. The intention is to bypass midfield pressure before the defensive line can reset.`
        : `${actor} plays forward quickly. The team is choosing territory over another circulation pass.`;
    case 'pass_into_space':
      return target && target !== actor
        ? `${target} attacks the space beyond the line as ${actor} releases the pass. This targets the gap behind an advanced defence.`
        : `${actor} looks to exploit the space behind. The move is trying to turn the back line rather than play in front of it.`;
    case 'carry':
      return defender
        ? `${actor} carries directly at ${defender}. Committing a defender can free a teammate or open the next passing lane.`
        : `${actor} drives forward with the ball. The carry is being used to gain territory and force the defence to engage.`;
    case 'wide_delivery':
      return target && target !== actor
        ? `${actor} shapes a delivery toward ${target}. The attack has reached crossing territory and is trying to overload the box.`
        : `${actor} sends the ball into the danger area. The move has progressed wide and is now attacking the penalty area.`;
    default:
      return `${actor} advances the attack. The team is looking for the next route through the defensive shape.`;
  }
}

function contestPresentation(record, names) {
  const { actor, defender } = names;
  if (record.outcome === 'intercepted') return {
    action:'INTERCEPTION · PASS CUT OUT',
    detail:defender
      ? `${defender} reads ${actor}'s pass and steps in. The progression breaks down and possession changes hands.`
      : `${actor}'s pass is intercepted. The attack ends before it can reach the next line.`,
  };
  if (record.outcome === 'turnover') return {
    action:'DUEL LOST · POSSESSION TURNS OVER',
    detail:defender
      ? `${defender} wins the duel from ${actor}. That creates a transition opportunity before the shape resets.`
      : `${actor} is dispossessed. The opposition have a transition opportunity.`,
  };
  if (record.outcome === 'foul_won') return {
    action:'FOUL · FREE KICK WON',
    detail:defender
      ? `${actor} draws the foul from ${defender}. The attack stops, but possession is secured for a controlled restart.`
      : `${actor} wins a free kick and gives the team a controlled restart.`,
  };
  if (record.outcome === 'corner_won' || record.cornerWon) return {
    action:record.route === 'wide_delivery' ? 'DELIVERY BLOCKED · CORNER' : 'ATTACK BLOCKED · CORNER WON',
    detail:defender
      ? `${defender} blocks the attack behind. The pressure is sustained through a corner.`
      : 'The attack is blocked behind, but the pressure continues from a corner.',
  };
  if (record.outcome === 'retain') return {
    action:record.route === 'circulation' ? 'PRESSURE BEATEN · POSSESSION RETAINED' : 'POSSESSION RETAINED · ATTACK CONTINUES',
    detail:`${actor} keeps possession after the contest. The team can keep building rather than reset defensively.`,
  };
  if (record.outcome === 'progress' || record.outcome === 'chance_created') return {
    action:record.outcome === 'chance_created' ? 'LINE BROKEN · CHANCE CREATED' : 'PROGRESSION · LINE BROKEN',
    detail:record.outcome === 'chance_created'
      ? `${actor}'s route opens a shooting window. The move has progressed from possession into a genuine chance.`
      : `${actor} gets beyond the pressure. The next action can now attack a less organised defensive line.`,
  };
  return {
    action:'CONTEST · ATTACK CONTINUES',
    detail:`${actor} contests the next phase of the move. Possession remains live while both teams reorganise around the ball.`,
  };
}

function shotPresentation(record, names) {
  const shooter = names.shooter;
  if (record.finish === 'goal') return {
    action:'GOAL · CHANCE CONVERTED',
    detail:`${shooter} finishes the chance. The attacking move has produced the decisive action.`,
  };
  if (record.finish === 'saved') return {
    action:'SAVE · GOALKEEPER DENIES THE CHANCE',
    detail:`${shooter}'s effort is kept out. The chance reaches the goalkeeper but does not change the score.`,
  };
  if (record.finish === 'missed') return {
    action:'SHOT · OFF TARGET',
    detail:`${shooter} sends the effort off target. The move creates a shot but not a save.`,
  };
  if (record.cornerWon) return {
    action:'SHOT BLOCKED · CORNER',
    detail:`${shooter}'s effort is blocked behind. The attack keeps territorial pressure through the corner.`,
  };
  return {
    action:'SHOT · BLOCKED',
    detail:`${shooter}'s effort is blocked before it reaches goal. The defensive line survives the chance.`,
  };
}

/**
 * Text-first presentation language over one authoritative ledger record.
 * It explains the route and consequence without inventing timing, geometry,
 * RNG, player decisions or football outcomes that are not in the ledger.
 */
export function describeBroadcastLedgerRecord(record, { playersById = new Map(), stage = 'route' } = {}) {
  if (!record || typeof record !== 'object') return {
    label:'Match flow',
    action:'TEAMS RESETTING',
    detail:'Both sides reorganise for the next phase of play.',
  };

  const names = {
    actor:playerName(playersById, record.actorId, 'The ball carrier'),
    target:playerName(playersById, record.targetId, null),
    defender:playerName(playersById, record.defenderId, null),
    shooter:playerName(playersById, record.shotId, 'The attacker'),
  };
  const route = ROUTE_PRESENTATION[record.route] ?? { label:'Build-up', action:'BUILDING THE ATTACK' };

  if (stage === 'chance' || stage === 'shot' || (record.shotId != null && stage === 'settle')) {
    const shot = shotPresentation(record, names);
    return { label:route.label, ...shot };
  }
  if (stage === 'contest' || stage === 'settle') {
    const contest = contestPresentation(record, names);
    return { label:route.label, ...contest };
  }
  if (stage === 'acquire') {
    if (isGoalkeeper(playersById, record.actorId)) {
      return {
        label:'Build-up · goalkeeper possession',
        action:'GOALKEEPER POSSESSION · RESETTING PLAY',
        detail:`${names.actor} takes control and gives the team a chance to rebuild its shape before the next progression.`,
      };
    }
    return {
      label:'Transition · securing possession',
      action:'POSSESSION SECURED · NEXT ATTACK FORMING',
      detail:`${names.actor} moves onto the ball as teammates reorganise for the next phase of the attack.`,
    };
  }

  if (isGoalkeeper(playersById, record.actorId)) {
    const goalkeeper = goalkeeperRoutePresentation(record, names);
    if (goalkeeper) return goalkeeper;
  }

  return { label:route.label, action:route.action, detail:routeDetail(record, names) };
}
