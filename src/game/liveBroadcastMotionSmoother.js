const PLAYER_SELECTOR = '.broadcast-player';
const BALL_SELECTOR = '.broadcast-ball';
const ELEMENT_SELECTOR = `${PLAYER_SELECTOR}, ${BALL_SELECTOR}`;

export const LIVE_BROADCAST_PLAYER_SPEED = 76;
export const LIVE_BROADCAST_BALL_SPEED = 220;
export const LIVE_BROADCAST_SCENE_CUT_DISTANCE = 28;
export const LIVE_BROADCAST_KEEPER_EDGE = 17;

const SNAP_EPSILON = .05;
const MAX_FRAME_MS = 50;
const MIN_PLAYER_GAP = 2.15;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, finite(value, min)));
}

function distance(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.y) - finite(b?.y));
}

function mix(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return {
    x:finite(a?.x) + (finite(b?.x) - finite(a?.x)) * t,
    y:finite(a?.y) + (finite(b?.y) - finite(a?.y)) * t,
  };
}

export function stepBroadcastCoordinate(current, target, elapsedMs, speedPerSecond) {
  const from = finite(current);
  const to = finite(target, from);
  const delta = to - from;
  if (Math.abs(delta) <= SNAP_EPSILON) return to;
  const maxStep = Math.max(0, finite(speedPerSecond)) * Math.min(MAX_FRAME_MS, Math.max(0, finite(elapsedMs))) / 1000;
  if (maxStep <= 0) return from;
  return from + Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
}

export function stepBroadcastPoint(current, target, elapsedMs, speedPerSecond) {
  const from = { x:finite(current?.x), y:finite(current?.y) };
  const to = { x:finite(target?.x, from.x), y:finite(target?.y, from.y) };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= SNAP_EPSILON) return to;
  const maxDistance = Math.max(0, finite(speedPerSecond)) * Math.min(MAX_FRAME_MS, Math.max(0, finite(elapsedMs))) / 1000;
  if (maxDistance <= 0 || dist <= maxDistance) return dist <= maxDistance ? to : from;
  const ratio = maxDistance / dist;
  return { x:from.x + dx * ratio, y:from.y + dy * ratio };
}

export function stabiliseBroadcastTarget(target, anchor, { keeper = false, keeperSide = null, engaged = false } = {}) {
  const safeTarget = { x:clamp(target?.x), y:clamp(target?.y) };
  const safeAnchor = { x:clamp(anchor?.x, 3, 97), y:clamp(anchor?.y, 3, 97) };

  if (keeper) {
    const side = keeperSide ?? (safeAnchor.y < 50 ? 'top' : 'bottom');
    return {
      x:clamp(safeTarget.x, 41, 59),
      y:side === 'top'
        ? clamp(safeTarget.y, 4, LIVE_BROADCAST_KEEPER_EDGE)
        : clamp(safeTarget.y, 100 - LIVE_BROADCAST_KEEPER_EDGE, 96),
    };
  }

  const xBlend = engaged ? .9 : .78;
  const yBlend = engaged ? .93 : .84;
  const blended = {
    x:safeAnchor.x + (safeTarget.x - safeAnchor.x) * xBlend,
    y:safeAnchor.y + (safeTarget.y - safeAnchor.y) * yBlend,
  };
  return {
    x:clamp(blended.x, Math.max(4, safeAnchor.x - 30), Math.min(96, safeAnchor.x + 30)),
    y:clamp(blended.y, Math.max(4, safeAnchor.y - 36), Math.min(96, safeAnchor.y + 36)),
  };
}

export function shouldCutBroadcastTransition(current, target, {
  ball = false,
  shooting = false,
  keeper = false,
  engaged = false,
} = {}) {
  const dist = distance(current, target);
  if (keeper) return dist > 22;
  if (ball) return dist > (shooting ? 58 : LIVE_BROADCAST_SCENE_CUT_DISTANCE);
  return dist > (engaged ? 36 : 30);
}

export function separateBroadcastPoints(points, minimum = MIN_PLAYER_GAP) {
  const out = (points ?? []).map(point => ({ ...point }));
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        if (a.keeper || b.keeper) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= minimum) continue;
        const nx = dist > .001 ? dx / dist : (i % 2 ? 1 : -1);
        const ny = dist > .001 ? dy / dist : (j % 2 ? .35 : -.35);
        const push = (minimum - dist) / 2;
        a.x = clamp(a.x + nx * push, 3, 97);
        a.y = clamp(a.y + ny * push, 3, 97);
        b.x = clamp(b.x - nx * push, 3, 97);
        b.y = clamp(b.y - ny * push, 3, 97);
      }
    }
  }
  return out;
}

function percent(styleValue, fallback = 50) {
  const parsed = Number.parseFloat(styleValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function samePercent(styleValue, expected) {
  return Math.abs(percent(styleValue, expected) - expected) < .001;
}

function isElementLike(value) {
  return value?.nodeType === 1 && typeof value.matches === 'function' && value.style;
}

function elementFlags(element) {
  return {
    isBall:element.matches(BALL_SELECTOR),
    isKeeper:element.matches(`${PLAYER_SELECTOR}.keeper`),
    isEngaged:element.matches(`${PLAYER_SELECTOR}.carrying, ${PLAYER_SELECTOR}.pressing, ${PLAYER_SELECTOR}.receiving, ${PLAYER_SELECTOR}.rushing`),
    isShooting:element.matches(`${BALL_SELECTOR}.shooting`),
  };
}

function registerElement(element, states, active) {
  if (!isElementLike(element) || states.has(element) || !element.matches(ELEMENT_SELECTOR)) return;
  const current = { x:percent(element.style.left), y:percent(element.style.top) };
  const flags = elementFlags(element);
  element.style.transition = 'none';
  element.style.willChange = 'left, top, opacity';
  states.set(element, {
    current:{ ...current },
    target:{ ...current },
    written:{ ...current },
    anchor:{ ...current },
    keeperSide:flags.isKeeper ? (current.y < 50 ? 'top' : 'bottom') : null,
    cutFrames:0,
    ...flags,
  });
  active.add(element);
}

function registerTree(root, states, active) {
  if (!root?.querySelectorAll) return;
  if (isElementLike(root)) registerElement(root, states, active);
  root.querySelectorAll(ELEMENT_SELECTOR).forEach(element => registerElement(element, states, active));
}

function refreshFlags(element, state) {
  Object.assign(state, elementFlags(element));
}

function captureTarget(element, state) {
  refreshFlags(element, state);
  const raw = {
    x:percent(element.style.left, state.target.x),
    y:percent(element.style.top, state.target.y),
  };
  const ownWrite = samePercent(element.style.left, state.written.x)
    && samePercent(element.style.top, state.written.y);
  if (ownWrite) return;

  if (state.isKeeper && Math.abs(raw.y - state.current.y) > 55) {
    state.keeperSide = raw.y < 50 ? 'top' : 'bottom';
    state.anchor = { ...raw };
    state.target = stabiliseBroadcastTarget(raw, state.anchor, {
      keeper:true,
      keeperSide:state.keeperSide,
    });
    state.current = { ...state.target };
    state.cutFrames = 3;
  } else {
    const target = state.isBall
      ? { x:clamp(raw.x, 1, 99), y:clamp(raw.y, 1, 99) }
      : stabiliseBroadcastTarget(raw, state.anchor, {
          keeper:state.isKeeper,
          keeperSide:state.keeperSide,
          engaged:state.isEngaged,
        });
    const cut = shouldCutBroadcastTransition(state.current, target, {
      ball:state.isBall,
      shooting:state.isShooting,
      keeper:state.isKeeper,
      engaged:state.isEngaged,
    });
    if (cut) {
      const jump = distance(state.current, target);
      if (!state.isBall && !state.isKeeper) {
        state.anchor = jump > 50 ? { ...target } : mix(state.anchor, target, .35);
      }
      state.current = { ...target };
      state.target = { ...target };
      state.cutFrames = 3;
    } else {
      state.target = target;
    }
  }

  element.style.left = `${state.current.x}%`;
  element.style.top = `${state.current.y}%`;
  element.style.transition = 'none';
  state.written = { ...state.current };
}

export function installLiveBroadcastMotionSmoother({
  documentLike = globalThis.document,
  windowLike = globalThis.window,
} = {}) {
  const Observer = globalThis.MutationObserver;
  if (!documentLike?.documentElement || !windowLike?.requestAnimationFrame || !Observer) return () => {};

  const states = new WeakMap();
  const active = new Set();
  let frameId = null;
  let previousAt = null;
  const reducedMotion = windowLike.matchMedia?.('(prefers-reduced-motion: reduce)');

  registerTree(documentLike, states, active);

  const observer = new Observer(records => {
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => registerTree(node, states, active));
        continue;
      }
      if (!isElementLike(record.target)) continue;
      registerElement(record.target, states, active);
      const state = states.get(record.target);
      if (!state) continue;
      if (record.attributeName === 'class') refreshFlags(record.target, state);
      else captureTarget(record.target, state);
    }
  });

  observer.observe(documentLike.documentElement, {
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['style', 'class'],
  });

  function animate(now) {
    const elapsedMs = previousAt == null ? 16.67 : Math.min(MAX_FRAME_MS, Math.max(0, now - previousAt));
    previousAt = now;
    const shouldReduce = Boolean(reducedMotion?.matches);
    const nextRows = [];

    for (const element of [...active]) {
      if (!element.isConnected) {
        active.delete(element);
        continue;
      }
      const state = states.get(element);
      if (!state) {
        active.delete(element);
        continue;
      }
      const speed = state.isBall ? LIVE_BROADCAST_BALL_SPEED : LIVE_BROADCAST_PLAYER_SPEED;
      const next = shouldReduce || state.cutFrames > 0
        ? { ...state.target }
        : stepBroadcastPoint(state.current, state.target, elapsedMs, state.isKeeper ? speed * .72 : speed);
      nextRows.push({ element, state, x:next.x, y:next.y, keeper:state.isKeeper, ball:state.isBall });
    }

    const players = nextRows.filter(row => !row.ball);
    const separated = separateBroadcastPoints(players);
    const separatedByElement = new Map(separated.map(row => [row.element, row]));

    for (const row of nextRows) {
      const resolved = row.ball ? row : separatedByElement.get(row.element) ?? row;
      let next = { x:resolved.x, y:resolved.y };
      if (row.state.isKeeper) {
        next = stabiliseBroadcastTarget(next, row.state.anchor, {
          keeper:true,
          keeperSide:row.state.keeperSide,
        });
      }
      row.state.current = next;
      row.state.written = { ...next };
      row.element.style.left = `${next.x}%`;
      row.element.style.top = `${next.y}%`;
      row.element.style.transition = 'none';

      if (row.state.cutFrames > 0) {
        row.element.style.opacity = row.state.isBall ? '0.28' : '0.72';
        row.state.cutFrames -= 1;
      } else if (row.element.style.opacity) {
        row.element.style.opacity = '';
      }
    }

    frameId = windowLike.requestAnimationFrame(animate);
  }

  frameId = windowLike.requestAnimationFrame(animate);

  return () => {
    observer.disconnect();
    if (frameId != null) windowLike.cancelAnimationFrame?.(frameId);
    active.clear();
  };
}
