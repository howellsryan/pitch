import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

export const LIVE_MATCH_STORY_VERSION = 1;

function playerName(playersById, id, fallback = null) {
  return id != null && playersById?.get?.(id)?.name ? playersById.get(id).name : fallback;
}

function recordKey(record) {
  if (!record) return null;
  return `${record.phase ?? 'x'}:${record.teamId ?? 'team'}:${record.route ?? 'route'}:${record.shotId ?? 'none'}:${record.setPieceType ?? 'open'}`;
}

function cleanSentence(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function joinStory(...sentences) {
  return sentences.map(cleanSentence).filter(Boolean).join(' ');
}

function continuityLead(state, record) {
  if (!state.lastPresentedRecord) return 'The match settles into its next passage of play.';
  if (state.lastPresentedRecord.teamId === record.teamId) {
    if (state.lastPresentedRecord.outcome === 'retain' || state.lastPresentedRecord.outcome === 'progress') {
      return 'The same side keep the initiative and build again before the defence can fully reset.';
    }
    if (state.lastPresentedRecord.outcome === 'corner_won' || state.lastPresentedRecord.cornerWon) {
      return 'The pressure is still being sustained around the final third.';
    }
    return 'They stay on the ball and try to turn the next possession into something more dangerous.';
  }
  if (state.lastPresentedRecord.outcome === 'intercepted' || state.lastPresentedRecord.outcome === 'turnover') {
    return 'Possession changes hands and the game immediately starts moving the other way.';
  }
  return 'The other side now have the ball and look to build their own spell of pressure.';
}

function routeOpening(record, playersById, state) {
  const actor = playerName(playersById, record.actorId, 'The player in possession');
  const target = playerName(playersById, record.targetId, null);
  const continuity = continuityLead(state, record);

  if (record.setPieceType === 'penalty') {
    const taker = playerName(playersById, record.shotId, actor);
    return {
      phaseLabel:'Penalty',
      action:`${taker} steps up from the spot`,
      detail:joinStory(
        continuity,
        `A foul has handed the attacking side a penalty and ${taker} takes responsibility`,
        'The goalkeeper waits on the line as the stadium focuses on this one kick',
      ),
    };
  }

  if (record.setPieceType === 'direct_free_kick') {
    const taker = playerName(playersById, record.shotId, actor);
    return {
      phaseLabel:'Direct free kick · shooting range',
      action:`${taker} stands over a dangerous free kick`,
      detail:joinStory(
        continuity,
        `The foul gives ${taker} a direct sight of goal`,
        'The wall is set between ball and goalkeeper, so the challenge is to find a route over or around it',
      ),
    };
  }

  switch (record.route) {
    case 'circulation':
      return {
        phaseLabel:'Build-up · patient possession',
        action:`${actor} keeps the move under control`,
        detail:joinStory(
          continuity,
          target && target !== actor
            ? `${actor} recycles the ball toward ${target} rather than forcing the pass`
            : `${actor} slows the move down and keeps possession moving`,
          'The aim is to pull the defensive shape from side to side until a cleaner route forward appears',
        ),
      };
    case 'direct_pass':
      return {
        phaseLabel:'Progression · direct ball',
        action:`${actor} looks forward early`,
        detail:joinStory(
          continuity,
          target && target !== actor
            ? `${actor} spots ${target} ahead and tries to bypass the pressure with an early forward pass`
            : `${actor} chooses territory and tries to break a line quickly`,
          'It is a more aggressive attempt to move the match upfield before the opposition can settle',
        ),
      };
    case 'pass_into_space':
      return {
        phaseLabel:'Progression · run in behind',
        action:target ? `${actor} tries to release ${target}` : `${actor} attacks the space behind`,
        detail:joinStory(
          continuity,
          target
            ? `${target} starts the run beyond the defensive line and ${actor} tries to time the pass into the space ahead`
            : `${actor} sees space behind the back line and tries to exploit it before the defenders can drop`,
          'This is the kind of progression that can turn controlled possession into a clear chance very quickly',
        ),
      };
    case 'carry':
      return {
        phaseLabel:'Progression · carrying forward',
        action:`${actor} drives at the defence`,
        detail:joinStory(
          continuity,
          `${actor} carries the ball forward instead of releasing it immediately`,
          'The run is designed to commit a defender and create space for the next pass or shot',
        ),
      };
    case 'wide_delivery':
      return {
        phaseLabel:'Final third · wide attack',
        action:target ? `${actor} looks for ${target} in the area` : `${actor} prepares the delivery`,
        detail:joinStory(
          continuity,
          target
            ? `${actor} reaches a crossing position and shapes the ball toward ${target}`
            : `${actor} works the attack into a wide crossing position`,
          'Bodies are arriving in the box now and the move has shifted from progression to chance creation',
        ),
      };
    default: {
      const semantic = describeBroadcastLedgerRecord(record, { playersById, stage:'route' });
      return {
        phaseLabel:semantic.label,
        action:semantic.action,
        detail:joinStory(continuity, semantic.detail),
      };
    }
  }
}

function consequenceSentence(record, playersById) {
  const actor = playerName(playersById, record.actorId, 'The ball carrier');
  const defender = playerName(playersById, record.defenderId, null);

  if (record.outcome === 'intercepted') {
    return defender
      ? `But ${defender} reads the idea early and cuts the pass out, ending the move before it can reach its target.`
      : `But the pass is read and intercepted, so the attack breaks down and possession changes hands.`;
  }
  if (record.outcome === 'turnover') {
    return defender
      ? `${defender} wins the duel from ${actor}. The move is stopped and there is suddenly a chance to counter the other way.`
      : `${actor} is dispossessed. The attacking spell ends and the opposition can transition into the space left behind.`;
  }
  if (record.outcome === 'foul_won' && !record.setPieceType) {
    return `${actor} is stopped illegally. The tempo drops for a moment, but the attacking side keep possession from the free kick.`;
  }
  if (record.outcome === 'corner_won' || record.cornerWon) {
    return defender
      ? `${defender} gets enough on the attack to turn it behind, but the pressure continues with a corner.`
      : `The defence blocks the danger behind. The move does not end completely because a corner keeps the pressure on.`;
  }
  if (record.outcome === 'retain') {
    return `${actor} survives the pressure and keeps the ball. The move can continue rather than forcing the team to retreat and rebuild.`;
  }
  if (record.outcome === 'chance_created') {
    return `${actor}'s involvement opens a shooting window. The patient work has become a genuine chance and the next touch could decide the move.`;
  }
  if (record.outcome === 'progress') {
    return `${actor} gets beyond the first pressure. The defence is now less organised and the attack has room to develop closer to goal.`;
  }
  return 'The contest is still alive and both sides adjust around the ball as the move develops.';
}

function finishSentence(record, playersById) {
  const shooter = playerName(playersById, record.shotId, 'The attacker');
  if (record.finish === 'goal') return `${shooter} takes the chance and scores. The whole passage ends with the ball in the net.`;
  if (record.finish === 'saved') return `${shooter} gets the effort on target, but the goalkeeper is equal to it and keeps the score unchanged.`;
  if (record.finish === 'missed') return `${shooter} takes the shot, but it misses the target and the pressure finally comes to an end.`;
  if (record.finish === 'blocked' && record.cornerWon) return `${shooter} lets the shot go, it is blocked behind, and the attack earns another opportunity from the corner.`;
  if (record.finish === 'blocked') return `${shooter} shoots, but the defence gets in the way before the effort can trouble the goalkeeper.`;
  return null;
}

function headlineForOutcome(base, record, playersById) {
  const shooter = playerName(playersById, record.shotId, 'The attacker');
  const defender = playerName(playersById, record.defenderId, null);
  if (record.finish === 'goal') return `${shooter} finishes the move`;
  if (record.finish === 'saved') return `${shooter} is denied by the goalkeeper`;
  if (record.finish === 'missed') return `${shooter} cannot find the target`;
  if (record.finish === 'blocked') return `${shooter}'s effort is blocked`;
  if (record.outcome === 'intercepted') return defender ? `${defender} reads the pass` : 'The pass is intercepted';
  if (record.outcome === 'turnover') return defender ? `${defender} wins it back` : 'Possession turns over';
  if (record.outcome === 'chance_created') return 'The move opens into a chance';
  if (record.outcome === 'corner_won' || record.cornerWon) return 'The pressure earns a corner';
  return base.action;
}

export function createLiveMatchStoryState() {
  return {
    version:LIVE_MATCH_STORY_VERSION,
    recordKey:null,
    base:null,
    current:null,
    lastStage:null,
    lastPresentedRecord:null,
  };
}

/**
 * Builds one evolving passage from the authoritative ledger record. Internal
 * acquire/reset stages never replace meaningful prose; route, contest and
 * finish stages progressively enrich the same passage instead.
 */
export function advanceLiveMatchStory(state, { record, stage = 'route', playersById = new Map() } = {}) {
  const story = state ?? createLiveMatchStoryState();
  if (!record) {
    return story.current ?? {
      phaseLabel:'Opening exchanges',
      action:'The match is beginning to take shape',
      detail:'Both teams are feeling their way into the game, looking for the first spell of controlled possession.',
    };
  }

  const key = recordKey(record);
  if (story.recordKey !== key) {
    if (story.recordKey && story.current) story.lastPresentedRecord = story.recordSnapshot;
    story.recordKey = key;
    story.recordSnapshot = { ...record };
    story.base = null;
    story.lastStage = null;
  }

  // Acquisition is an internal sequencing step. Keep the previous passage on
  // screen until the new record has something meaningful to say.
  if (stage === 'acquire' && story.current) return story.current;

  if (!story.base) story.base = routeOpening(record, playersById, story);
  let next = { ...story.base };

  if (stage === 'contest' || stage === 'settle' || stage === 'chance' || stage === 'shot') {
    next = {
      ...next,
      action:headlineForOutcome(next, record, playersById),
      detail:joinStory(next.detail, consequenceSentence(record, playersById)),
    };
  }

  if ((stage === 'chance' || stage === 'shot' || stage === 'settle') && record.shotId != null) {
    const finish = finishSentence(record, playersById);
    if (finish) {
      next = {
        ...next,
        action:headlineForOutcome(next, record, playersById),
        detail:joinStory(story.base.detail, consequenceSentence(record, playersById), finish),
      };
    }
  }

  story.current = next;
  story.lastStage = stage;
  return next;
}
