const PLAYER_SELECTOR = '.broadcast-player';
const BALL_SELECTOR = '.broadcast-ball';

export const LIVE_BROADCAST_PLAYER_SPEED = 42;
export const LIVE_BROADCAST_BALL_SPEED = 135;
const SNAP_EPSILON = .06;
const MAX_FRAME_MS = 50;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const distance = Math.hypot(dx, dy);
  if (distance <= SNAP_EPSILON) return to;
  const maxDistance = Math.max(0, finite(speedPerSecond)) * Math.min(MAX_FRAME_MS, Math.max(0, finite(elapsedMs))) / 1000;
  if (maxDistance <= 0 || distance <= maxDistance) return distance <= maxDistance ? to : from;
  const ratio = maxDistance / distance;
  return { x:from.x + dx * ratio, y:from.y + dy * ratio };
}

function percent(styleValue, fallback = 50) {
  const parsed = Number.parseFloat(styleValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function samePercent(styleValue, expected) {
  return Math.abs(percent(styleValue, expected) - expected) < .001;
}

function targetSpeed(element) {
  return element.matches(BALL_SELECTOR) ? LIVE_BROADCAST_BALL_SPEED : LIVE_BROADCAST_PLAYER_SPEED;
}

function registerElement(element, states) {
  if (!(element instanceof HTMLElement) || states.has(element)) return;
  if (!element.matches(`${PLAYER_SELECTOR}, ${BALL_SELECTOR}`)) return;
  const x = percent(element.style.left);
  const y = percent(element.style.top);
  element.style.transition = 'none';
  states.set(element, {
    current:{ x, y },
    target:{ x, y },
    written:{ x, y },
  });
}

function registerTree(root, states) {
  if (!(root instanceof Element || root instanceof Document)) return;
  if (root instanceof HTMLElement) registerElement(root, states);
  root.querySelectorAll?.(`${PLAYER_SELECTOR}, ${BALL_SELECTOR}`).forEach(element => registerElement(element, states));
}

export function installLiveBroadcastMotionSmoother({ documentLike = globalThis.document, windowLike = globalThis.window } = {}) {
  if (!documentLike?.documentElement || !windowLike?.requestAnimationFrame || !globalThis.MutationObserver) return () => {};

  const states = new WeakMap();
  const active = new Set();
  let frameId = null;
  let previousAt = null;
  const reducedMotion = windowLike.matchMedia?.('(prefers-reduced-motion: reduce)');

  function register(element) {
    registerElement(element, states);
    if (states.has(element)) active.add(element);
  }

  function registerFrom(root) {
    registerTree(root, states);
    if (root instanceof HTMLElement && states.has(root)) active.add(root);
    root.querySelectorAll?.(`${PLAYER_SELECTOR}, ${BALL_SELECTOR}`).forEach(element => {
      if (states.has(element)) active.add(element);
    });
  }

  function captureTarget(element) {
    const state = states.get(element);
    if (!state) return;
    const nextX = percent(element.style.left, state.target.x);
    const nextY = percent(element.style.top, state.target.y);
    const ownWrite = samePercent(element.style.left, state.written.x) && samePercent(element.style.top, state.written.y);
    if (ownWrite) return;
    state.target = { x:nextX, y:nextY };
    element.style.left = `${state.current.x}%`;
    element.style.top = `${state.current.y}%`;
    element.style.transition = 'none';
    state.written = { ...state.current };
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => registerFrom(node));
      } else if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        register(record.target);
        captureTarget(record.target);
      }
    }
  });

  function animate(now) {
    const elapsedMs = previousAt == null ? 16.67 : Math.min(MAX_FRAME_MS, Math.max(0, now - previousAt));
    previousAt = now;
    const shouldReduce = Boolean(reducedMotion?.matches);

    for (const element of [...active]) {
      if (!element.isConnected) { active.delete(element); continue; }
      const state = states.get(element);
      if (!state) { active.delete(element); continue; }
      const next = shouldReduce
        ? { ...state.target }
        : stepBroadcastPoint(state.current, state.target, elapsedMs, targetSpeed(element));
      state.current = next;
      state.written = { ...next };
      element.style.left = `${next.x}%`;
      element.style.top = `${next.y}%`;
      element.style.transition = 'none';
    }

    frameId = windowLike.requestAnimationFrame(animate);
  }

  registerFrom(documentLike);
  observer.observe(documentLike.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['style'] });
  frameId = windowLike.requestAnimationFrame(animate);

  return () => {
    observer.disconnect();
    if (frameId != null) windowLike.cancelAnimationFrame?.(frameId);
    active.clear();
  };
}
