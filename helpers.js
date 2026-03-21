/** ui/helpers.js — fmt.money/wage/date, toast, showModal, showLoader, navigateTo */

// ─── Formatting ───────────────────────────────────────────────
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export const fmt = {
  date:      (d) => { const dt = new Date(d); return `${DAYS[dt.getDay()]} ${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; },
  dateShort: (d) => { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]}`; },
  money:     (v) => v >= 1e9 ? `£${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `£${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `£${(v/1e3).toFixed(0)}K` : `£${v}`,
  wage:      (v) => v >= 1000 ? `£${(v/1000).toFixed(0)}K/w` : `£${v}/w`,
};

// ─── Position helpers ────────────────────────────────────────
export function posGroup(pos) {
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return 'ATT';
  if (['CM','CDM','RM','LM'].includes(pos))       return 'MID';
  if (['CB','RB','LB'].includes(pos))             return 'DEF';
  if (pos === 'GK')                               return 'GK';
  return 'MID';
}

export function primaryRating(p) {
  const g = posGroup(p.position);
  if (g === 'ATT') return p.attack;
  if (g === 'MID') return p.midfield;
  if (g === 'DEF') return p.defence;
  return p.goalkeeping;
}

export function formLabel(p) {
  const score = 50 + (p.goals ?? 0) * 8 + (p.assists ?? 0) * 5 + (p.cleanSheets ?? 0) * 6;
  const capped = Math.min(99, score);
  if (capped >= 75) return { text: '🔥 Hot',   cls: 'hot' };
  if (capped >= 62) return { text: '✅ Good',  cls: 'good' };
  return               { text: '📉 Avg',   cls: 'avg' };
}

// Deterministic flag emoji from player name chars
export function flagEmoji(name) {
  const emojis = ['🇧🇷','🇫🇷','🇩🇪','🇪🇸','🇵🇹','🇳🇬','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🇦🇷','🇧🇪','🇨🇮','🇺🇾','🇳🇱','🇮🇹','🇸🇳'];
  return emojis[(name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % emojis.length];
}

// ─── Toast ───────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('vis'));
  setTimeout(() => { el.classList.remove('vis'); el.addEventListener('transitionend', () => el.remove(), { once: true }); }, duration);
}

// ─── Loader ───────────────────────────────────────────────────
export function showLoader(msg = 'Simulating…') {
  const el = document.getElementById('loader');
  if (el) { el.querySelector('.loader-msg').textContent = msg; el.classList.add('vis'); }
}
export function hideLoader() {
  document.getElementById('loader')?.classList.remove('vis');
}

// ─── Modal ───────────────────────────────────────────────────
export function showModal(title, bodyHTML, actions = [], opts = {}) {
  document.getElementById('modal-bd')?.remove();
  const bd = document.createElement('div');
  bd.id = 'modal-bd'; bd.className = 'modal-bd';
  if (opts.wide) bd.classList.add('modal-wide');
  const actHTML = actions.map(a =>
    `<button class="btn ${a.cls ?? 'btn-sec'}" id="modal-${a.id}" data-aid="${a.id}">${a.label}</button>`
  ).join('');
  bd.innerHTML = `
    <div class="modal${opts.wide ? ' modal-xl' : ''}">
      <div class="modal-hdr">
        <span class="modal-title">${title}</span>
        <button class="modal-x" id="modal-x">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${actions.length ? `<div class="modal-foot">${actHTML}</div>` : ''}
    </div>`;
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));
  const close = () => { bd.classList.remove('open'); bd.addEventListener('transitionend', () => bd.remove(), { once: true }); };
  bd.querySelector('#modal-x').onclick = close;
  if (!opts.noDismiss) {
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
  }
  bd.querySelectorAll('[data-aid]').forEach(btn => {
    const a = actions.find(x => x.id === btn.dataset.aid);
    if (a?.handler) btn.addEventListener('click', () => { a.handler(); close(); });
    else btn.addEventListener('click', close);
  });
  return { close };
}

// ─── Screen navigation ────────────────────────────────────────
const _screens = new Map();
let _active = null;

export function registerScreen(id, onEnter) {
  const el = document.getElementById(`screen-${id}`);
  if (el) _screens.set(id, { el, onEnter });
}

export async function navigateTo(id) {
  if (!_screens.has(id) || _active === id) return;
  if (_active) {
    _screens.get(_active).el.classList.remove('active');
    document.querySelectorAll(`[data-nav="${_active}"]`).forEach(n => n.classList.remove('active'));
  }
  _active = id;
  const s = _screens.get(id);
  s.el.classList.add('active');
  s.el.scrollTop = 0;
  document.querySelectorAll(`[data-nav="${id}"]`).forEach(n => n.classList.add('active'));
  if (s.onEnter) { try { await s.onEnter(); } catch(e) { console.error(`[screen:${id}]`, e); } }
}

export const getActiveScreen = () => _active;
