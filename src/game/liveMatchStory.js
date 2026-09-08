import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

export const LIVE_MATCH_STORY_VERSION = 3;
export const LIVE_MATCH_READER_TIMING = Object.freeze({
  secondBeatMs:1500,
  consequenceMs:3300,
  terminalMs:5400,
  routineCompleteMs:5200,
  eventCompleteMs:6800,
  goalCompleteMs:7800,
  holdAfterCompleteMs:1200,
  routineSampleEveryPhases:16,
  maxQueuedEvents:4,
});

const TERMINAL_STAGES = new Set(['chance', 'shot', 'settle']);

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

function joinStory(sentences) {
  return sentences.map(cleanSentence).filter(Boolean).join(' ');
}

function continuityLead(state, record) {
  const previous = state.lastPresentedRecord;
  if (!previous) return 'The match settles into its next meaningful passage of play.';
  if (previous.teamId === record.teamId) {
    if (previous.outcome === 'retain' || previous.outcome === 'progress' || previous.outcome === 'chance_created') {
      return 'The same side keep the initiative and continue the spell of pressure.';
    }
    if (previous.outcome === 'corner_won' || previous.cornerWon) {
      return 'The pressure is still being sustained around the final third.';
    }
    return 'They regain control and look to build the next attack.';
  }
  if (previous.outcome === 'intercepted' || previous.outcome === 'turnover') {
    return 'Possession changes hands and the game starts moving the other way.';
  }
  return 'The other side now take over and begin their own spell with the ball.';
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
      sentences:[
        continuity,
        `A foul has handed the attacking side a penalty and ${taker} takes responsibility as the goalkeeper waits on the line`,
      ],
    };
  }

  if (record.setPieceType === 'direct_free_kick') {
    const taker = playerName(playersById, record.shotId, actor);
    return {
      phaseLabel:'Direct free kick · shooting range',
      action:`${taker} stands over a dangerous free kick`,
      sentences:[
        continuity,
        `The foul gives ${taker} a direct sight of goal and the defence sets its wall between ball and goalkeeper`,
      ],
    };
  }

  switch (record.route) {
    case 'circulation':
      return {
        phaseLabel:'Build-up · patient possession',
        action:`${actor} keeps the move under control`,
        sentences:[
          continuity,
          target && target !== actor
            ? `${actor} recycles the ball toward ${target}, keeping possession rather than forcing the next pass`
            : `${actor} slows the move down and keeps the ball moving while a route forward develops`,
        ],
      };
    case 'direct_pass':
      return {
        phaseLabel:'Progression · direct ball',
        action:`${actor} looks forward early`,
        sentences:[
          continuity,
          target && target !== actor
            ? `${actor} spots ${target} ahead and tries to bypass the pressure with an early forward ball`
            : `${actor} chooses the direct route and tries to break a defensive line before it can settle`,
        ],
      };
    case 'pass_into_space':
      return {
        phaseLabel:'Progression · run in behind',
        action:target ? `${actor} tries to release ${target}` : `${actor} attacks the space behind`,
        sentences:[
          continuity,
          target
            ? `${target} starts the run beyond the defensive line and ${actor} tries to time the pass into the space ahead`
            : `${actor} sees the space beyond the back line and tries to exploit it before the defence can drop`,
        ],
      };
    case 'carry':
      return {
        phaseLabel:'Progression · carrying forward',
        action:`${actor} drives at the defence`,
        sentences:[
          continuity,
          `${actor} carries the ball forward, trying to commit a defender before choosing the next pass or shot`,
        ],
      };
    case 'wide_delivery':
      return {
        phaseLabel:'Final third · wide attack',
        action:target ? `${actor} looks for ${target} in the area` : `${actor} prepares the delivery`,
        sentences:[
          continuity,
          target
            ? `${actor} reaches a crossing position and shapes the delivery toward ${target} as runners arrive in the area`
            : `${actor} works the attack wide and prepares to send the ball into a crowded penalty area`,
        ],
      };
    default: {
      const semantic = describeBroadcastLedgerRecord(record, { playersById, stage:'route' });
      return {
        phaseLabel:semantic.label,
        action:semantic.action,
        sentences:[continuity, semantic.detail],
      };
    }
  }
}

function consequenceSentence(record, playersById) {
  const actor = playerName(playersById, record.actorId, 'The ball carrier');
  const defender = playerName(playersById, record.defenderId, null);

  if (record.outcome === 'intercepted') {
    return defender
      ? `But ${defender} reads the idea and cuts the pass out before the move can develop further.`
      : 'But the pass is read and intercepted, bringing that attacking move to an end.';
  }
  if (record.outcome === 'turnover') {
    return defender
      ? `${defender} wins the duel from ${actor}, and the attack is stopped with space available for the transition.`
      : `${actor} is dispossessed and the attacking spell breaks down.`;
  }
  if (record.outcome === 'foul_won' && !record.setPieceType) {
    return `${actor} is stopped illegally, so the attacking side keep the ball from the resulting free kick.`;
  }
  if (record.outcome === 'corner_won' || record.cornerWon) {
    return defender
      ? `${defender} gets enough on the danger to turn it behind, but the pressure continues with a corner.`
      : 'The defence turns the danger behind and the pressure continues from a corner.';
  }
  if (record.outcome === 'chance_created') {
    return 'The move has opened a shooting chance now, with the defence no longer fully set.';
  }
  if (record.outcome === 'progress') {
    return `${actor} gets beyond the first pressure and the attack can continue closer to goal.`;
  }
  if (record.outcome === 'retain') {
    return `${actor} keeps possession and the move remains alive.`;
  }
  return 'The contest stays alive as both sides adjust around the ball.';
}

function finishSentence(record, playersById) {
  const shooter = playerName(playersById, record.shotId, 'The attacker');
  if (record.finish === 'goal') return `${shooter} takes the chance... GOAL! The move ends with the ball in the net.`;
  if (record.finish === 'saved') return `${shooter} gets the shot on target... SAVE! The goalkeeper gets there and keeps it out.`;
  if (record.finish === 'missed') return `${shooter} takes the shot... but it is off target and the pressure comes to an end.`;
  if (record.finish === 'blocked' && record.cornerWon) return `${shooter} lets the shot go... BLOCKED! It turns behind and the attack earns a corner.`;
  if (record.finish === 'blocked') return `${shooter} shoots... BLOCKED! The defence gets in the way before it can reach goal.`;
  return null;
}

function terminalHeadline(record, playersById, fallback) {
  const shooter = playerName(playersById, record.shotId, 'The attacker');
  if (record.finish === 'goal') return `GOAL! ${shooter}`;
  if (record.finish === 'saved') return `SAVE · ${shooter} denied`;
  if (record.finish === 'missed') return `${shooter} misses the target`;
  if (record.finish === 'blocked') return `${shooter}'s effort is blocked`;
  return fallback;
}

function eventPriority(record) {
  if (record?.finish === 'goal') return 100;
  if (record?.setPieceType === 'penalty' || record?.setPieceType === 'direct_free_kick') return 90;
  if (record?.shotId != null || record?.finish) return 80;
  if (record?.outcome === 'corner_won' || record?.cornerWon) return 60;
  if (Number(record?.phase) % LIVE_MATCH_READER_TIMING.routineSampleEveryPhases === 0) return 20;
  return 0;
}

function buildStoryEvent(state, record, playersById, nowMs) {
  const opening = routeOpening(record, playersById, state);
  const priority = eventPriority(record);
  return {
    key:recordKey(record),
    record:{ ...record },
    playersById:new Map(playersById),
    priority,
    queuedAt:nowMs,
    startedAt:null,
    phaseLabel:opening.phaseLabel,
    action:opening.action,
    opening:opening.sentences.map(cleanSentence),
    consequence:cleanSentence(consequenceSentence(record, playersById)),
    finish:cleanSentence(finishSentence(record, playersById)),
    terminalUnlocked:false,
  };
}

function isKeyEvent(record) {
  return eventPriority(record) > 0;
}

function findEvent(state, key) {
  if (state.current?.key === key) return state.current;
  return state.queue.find(event => event.key === key) ?? null;
}

function enqueueEvent(state, event) {
  if (state.queue.length >= LIVE_MATCH_READER_TIMING.maxQueuedEvents) {
    const lowestPriority = Math.min(...state.queue.map(item => item.priority));
    if (event.priority <= lowestPriority) return;
    const dropIndex = state.queue.findIndex(item => item.priority === lowestPriority);
    state.queue.splice(dropIndex, 1);
  }
  state.queue.push(event);
}

function activateEvent(state, event, nowMs) {
  event.startedAt = nowMs;
  state.current = event;
  state.lastPresentedRecord = event.record;
}

function promoteNext(state, nowMs) {
  if (state.current || !state.queue.length) return;
  activateEvent(state, state.queue.shift(), nowMs);
}

function maybePreemptRoutine(state, nowMs) {
  if (!state.current || state.current.priority > 20 || !state.queue.length) return;
  const age = nowMs - state.current.startedAt;
  if (age < 2400) return;
  const importantIndex = state.queue.findIndex(event => event.priority >= 80);
  if (importantIndex < 0) return;
  const [important] = state.queue.splice(importantIndex, 1);
  activateEvent(state, important, nowMs);
}

function maybePreemptForGoal(state, nowMs, force = false) {
  if (state.current?.record?.finish === 'goal') return;
  const goalIndex = state.queue.findIndex(event => event.record?.finish === 'goal');
  if (goalIndex < 0) return;
  if (!force && state.current) {
    const age = nowMs - state.current.startedAt;
    if (age < LIVE_MATCH_READER_TIMING.secondBeatMs) return;
  }
  const [goal] = state.queue.splice(goalIndex, 1);
  activateEvent(state, goal, nowMs);
}

function reconcileMatchEnd(state, nowMs) {
  // Full time must never wait for stale routine commentary. Keep only an
  // authoritative goal passage that still needs to reach its terminal beat.
  state.queue = state.queue.filter(event => event.record?.finish === 'goal');
  if (state.current?.record?.finish !== 'goal') {
    state.current = null;
    maybePreemptForGoal(state, nowMs, true);
  }
}

function completeAt(event) {
  if (event.record.finish === 'goal') return LIVE_MATCH_READER_TIMING.goalCompleteMs;
  if (event.priority >= 60) return LIVE_MATCH_READER_TIMING.eventCompleteMs;
  return LIVE_MATCH_READER_TIMING.routineCompleteMs;
}

function maybeAdvanceReader(state, nowMs) {
  if (!state.current) {
    promoteNext(state, nowMs);
    return;
  }
  const age = nowMs - state.current.startedAt;
  const terminalReady = !state.current.finish || state.current.terminalUnlocked;
  if (!terminalReady) return;
  if (age < completeAt(state.current) + LIVE_MATCH_READER_TIMING.holdAfterCompleteMs) return;
  state.current = null;
  promoteNext(state, nowMs);
}

function visibleStory(event, nowMs) {
  if (!event) {
    return {
      phaseLabel:'Opening exchanges',
      action:'The match is beginning to take shape',
      detail:'Both teams are feeling their way into the game and waiting for the first meaningful passage to develop.',
    };
  }

  const age = Math.max(0, nowMs - event.startedAt);
  const visible = [event.opening[0]];
  if (age >= LIVE_MATCH_READER_TIMING.secondBeatMs && event.opening[1]) visible.push(event.opening[1]);
  if (age >= LIVE_MATCH_READER_TIMING.consequenceMs) visible.push(event.consequence);

  const showTerminal = event.finish
    && event.terminalUnlocked
    && age >= LIVE_MATCH_READER_TIMING.terminalMs;
  if (showTerminal) visible.push(event.finish);

  return {
    phaseLabel:event.phaseLabel,
    action:showTerminal ? terminalHeadline(event.record, event.playersById, event.action) : event.action,
    detail:joinStory(visible),
  };
}

export function createLiveMatchStoryState() {
  return {
    version:LIVE_MATCH_STORY_VERSION,
    current:null,
    queue:[],
    seenKeys:new Set(),
    lastPresentedRecord:null,
    nowMs:0,
  };
}

export function resetLiveMatchStoryForHalfTime(state) {
  if (!state) return;
  state.current = null;
  state.queue.length = 0;
  state.lastPresentedRecord = null;
}

/**
 * Human-paced text commentary reader.
 *
 * The engine may continue through its authoritative phases, but only meaningful
 * records are admitted to this reader. Each selected passage then unfolds over
 * several seconds. Internal acquire/route/contest labels never replace the text
 * the manager is currently reading, and terminal outcomes are withheld until
 * the authoritative presentation reaches a terminal stage. A goal therefore
 * lands at the end of the narrated move as "... GOAL!", rather than flashing
 * as a separate one-second card.
 */
export function advanceLiveMatchStory(state, {
  record,
  stage = 'route',
  playersById = new Map(),
  nowMs = 0,
  matchComplete = false,
} = {}) {
  const story = state ?? createLiveMatchStoryState();
  story.nowMs = Math.max(story.nowMs, Number(nowMs) || 0);

  if (record) {
    const key = recordKey(record);
    const existing = findEvent(story, key);
    if (existing && TERMINAL_STAGES.has(stage)) existing.terminalUnlocked = true;

    if (!existing && !story.seenKeys.has(key) && isKeyEvent(record)) {
      story.seenKeys.add(key);
      const event = buildStoryEvent(story, record, playersById, story.nowMs);
      if (TERMINAL_STAGES.has(stage)) event.terminalUnlocked = true;
      enqueueEvent(story, event);
    }
  }

  maybeAdvanceReader(story, story.nowMs);
  maybePreemptForGoal(story, story.nowMs, matchComplete);
  maybePreemptRoutine(story, story.nowMs);
  if (matchComplete) reconcileMatchEnd(story, story.nowMs);
  maybeAdvanceReader(story, story.nowMs);

  return visibleStory(story.current, story.nowMs);
}
