import { getSave } from '../modules/db.js';
import { injuryDurationLabel } from '../modules/injuries.js';
import { patchSave } from '../modules/save.js';
import { fmt } from './helpers.js';

// ══════════════════════════════════════════════════════════════
// INBOX / NEWS FEED
// ══════════════════════════════════════════════════════════════

function _newsIcon(path) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const _NEWS_ICONS = {
  ball: _newsIcon('<circle cx="12" cy="12" r="8"/><path d="m12 7 3 2-1 3.5h-4L9 9zM4 11l4 2-1 4M20 11l-4 2 1 4M9 20l2-3h2l2 3"/>'),
  transfer: _newsIcon('<path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/>'),
  transferIn: _newsIcon('<path d="M4 8h12M12 4l4 4-4 4M20 16H8"/><path d="M5 13v6h6"/>'),
  transferOut: _newsIcon('<path d="M20 8H8m4-4L8 8l4 4M4 16h12"/><path d="M19 13v6h-6"/>'),
  injury: _newsIcon('<path d="M9.5 3h5l1 5h5v5h-5l-1 8h-5l-1-8h-5V8h5z"/>'),
  trophy: _newsIcon('<path d="M8 4h8v4c0 4-1.5 7-4 7s-4-3-4-7z"/><path d="M8 7H4c0 4 2 6 5 6M16 7h4c0 4-2 6-5 6M12 15v4M8 21h8"/>'),
  academy: _newsIcon('<path d="m3 9 9-5 9 5-9 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5M21 9v6"/>'),
  inbox: _newsIcon('<path d="M4 6h16v12H4z"/><path d="m4 8 8 6 8-6"/>'),
  info: _newsIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'),
};

// ─── News item factory ────────────────────────────────────────
// type: 'match' | 'transfer_in' | 'transfer_out' | 'injury' | 'season' | 'academy' | 'offer'
export function _makeNewsItem(type, title, body, extra = {}) {
  return {
    id:    `news_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    type,
    title,
    body,
    read:  false,
    ts:    Date.now(),
    ...extra, // gw, date, icon semantic key
  };
}

// ─── Add to save.inbox (cap at 80) — serialised to prevent race conditions ──
export let _inboxWriteQueue = Promise.resolve();
export async function addNewsItem(item) {
  _inboxWriteQueue = _inboxWriteQueue.then(async () => {
    const save = await getSave();
    const inbox = save.inbox || [];
    inbox.unshift(item);
    if (inbox.length > 80) inbox.length = 80;
    await patchSave({ inbox });
    _updateInboxBadge();
  }).catch(() => {});
  return _inboxWriteQueue;
}

// ─── Badge update ─────────────────────────────────────────────
export async function _updateInboxBadge() {
  const save = await getSave();
  const unread = (save.inbox || []).filter(i => !i.read).length;
  // Desktop sidebar badge
  document.querySelectorAll('[data-nav="inbox"] .nav-badge').forEach(el => {
    el.textContent = unread;
    el.style.display = unread > 0 ? 'flex' : 'none';
  });
  // Mobile bottom nav badge (legacy - kept for safety)
  document.querySelectorAll('.bn[data-nav="inbox"] .bn-badge').forEach(el => {
    el.textContent = unread > 9 ? '9+' : unread;
    el.style.display = unread > 0 ? 'flex' : 'none';
  });
  // Home header inbox button badge
  const hdrBadge = document.getElementById('h-inbox-badge');
  if (hdrBadge) {
    hdrBadge.textContent = unread > 9 ? '9+' : unread;
    hdrBadge.style.display = unread > 0 ? 'flex' : 'none';
  }
}

// ─── Category config ─────────────────────────────────────────
export const _NEWS_CAT = {
  match:        { label: 'Match',    icon: _NEWS_ICONS.ball,        color: 'var(--acc)'  },
  transfer_in:  { label: 'Signing',  icon: _NEWS_ICONS.transferIn,  color: '#22c55e'     },
  transfer_out: { label: 'Sale',     icon: _NEWS_ICONS.transferOut, color: '#f97316'     },
  injury:       { label: 'Injury',   icon: _NEWS_ICONS.injury,      color: 'var(--acc3)' },
  season:       { label: 'Season',   icon: _NEWS_ICONS.trophy,      color: 'var(--acc2)' },
  academy:      { label: 'Academy',  icon: _NEWS_ICONS.academy,     color: '#a78bfa'     },
  offer:        { label: 'Offer',    icon: _NEWS_ICONS.inbox,       color: '#38bdf8'     },
};

function _itemIcon(item, cat) {
  if (item.icon === 'transfer') return _NEWS_ICONS.transfer;
  if (item.icon === 'transfer_in') return _NEWS_ICONS.transferIn;
  if (item.icon === 'transfer_out') return _NEWS_ICONS.transferOut;
  if (item.icon === 'injury') return _NEWS_ICONS.injury;
  if (item.icon === 'trophy') return _NEWS_ICONS.trophy;
  if (item.icon === 'academy') return _NEWS_ICONS.academy;
  if (item.icon === 'ball') return _NEWS_ICONS.ball;
  return cat.icon;
}

// ─── Render inbox screen ──────────────────────────────────────
export async function renderInbox() {
  const el = document.getElementById('screen-inbox');
  if (!el) return;

  const save = await getSave();
  const inbox = save.inbox || [];

  // Mark all as read
  if (inbox.some(i => !i.read)) {
    const updated = inbox.map(i => ({ ...i, read: true }));
    await patchSave({ inbox: updated });
    _updateInboxBadge();
  }

  const activeFilter = el.dataset.filter || 'all';

  const filtered = activeFilter === 'all'
    ? inbox
    : inbox.filter(i => i.type === activeFilter || (i.type || '').startsWith(activeFilter));

  const tabs = [
    { id: 'all',         label: 'All'      },
    { id: 'match',       label: 'Matches'  },
    { id: 'transfer',    label: 'Transfers' },
    { id: 'injury',      label: 'Injuries' },
    { id: 'season',      label: 'Season'   },
    { id: 'academy',     label: 'Academy'  },
  ];

  const tabsHtml = tabs.map(t =>
    `<div class="inbox-tab${activeFilter===t.id?' on':''}" data-tab="${t.id}">${t.label}</div>`
  ).join('');

  const itemsHtml = filtered.length === 0
    ? `<div class="inbox-empty"><div class="inbox-empty-icon">${_NEWS_ICONS.inbox}</div><div class="inbox-empty-title">No messages</div><div class="inbox-empty-sub">News and updates will appear here as your season unfolds.</div></div>`
    : filtered.map(item => {
        const cat = _NEWS_CAT[item.type] || { icon: _NEWS_ICONS.info, color: 'var(--tx2)', label: '' };
        const ago = _timeAgo(item.ts);
        const icon = _itemIcon(item, cat);
        return `<div class="inbox-item${item.read?' read':''}">
          <div class="inbox-icon" style="background:${cat.color}18;color:${cat.color}">${icon}</div>
          <div class="inbox-content">
            <div class="inbox-header">
              <span class="inbox-title">${item.title}</span>
              <span class="inbox-time">${ago}</span>
            </div>
            ${item.body ? `<div class="inbox-body">${item.body}</div>` : ''}
            ${item.gw ? `<div class="inbox-meta">GW${item.gw}</div>` : ''}
          </div>
        </div>`;
      }).join('');

  el.innerHTML = `
    <div class="ph" style="flex-shrink:0">
      <div class="ph-left"><div class="pl">Inbox</div><div class="pt">News &amp; Updates</div></div>
      <div class="ph-right" style="font-size:11px;color:var(--txd)">${inbox.length} items</div>
    </div>
    <div class="inbox-tabs">${tabsHtml}</div>
    <div class="inbox-list">${itemsHtml}</div>
  `;

  el.querySelectorAll('.inbox-tab').forEach(tab => {
    tab.onclick = () => {
      el.dataset.filter = tab.dataset.tab;
      renderInbox();
    };
  });
}

export function _timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  return `${days}d ago`;
}

// ══════════════════════════════════════════════════════════════
// NEWS GENERATION HELPERS — called from other modules
// ══════════════════════════════════════════════════════════════

export async function newsMatchResult(result, save) {
  const isHome = result.homeTeamId === save.userTeamId;
  const ug = isHome ? result.homeGoals : result.awayGoals;
  const og = isHome ? result.awayGoals : result.homeGoals;
  const outcome = ug > og ? 'WIN' : ug < og ? 'LOSS' : 'DRAW';
  const oppName = isHome ? result.awayTeamName : result.homeTeamName;
  const oppGoals = og;
  const userGoals = ug;

  const title = `${outcome} ${userGoals}–${oppGoals} vs ${oppName}`;
  const scorers = (isHome ? result.homeScorers : result.awayScorers) || [];
  const scorerStr = scorers.map(s => `${s.playerName} ${s.minute}'`).join(', ');
  const comp = result.competition || 'League';
  const body = [
    scorerStr ? `Scorers: ${scorerStr}` : null,
    `${comp} · GW${result.gameweek || save.currentGameweek}`,
  ].filter(Boolean).join(' · ');

  await addNewsItem(_makeNewsItem('match', title, body, { gw: result.gameweek || save.currentGameweek, icon: 'ball' }));
}

export async function newsPlayerSigned(player, fee, save) {
  const title = `${player.name} signed`;
  const body  = `${player.position} · Age ${player.age} · ${fmt.money(fee)} fee`;
  await addNewsItem(_makeNewsItem('transfer_in', title, body, { gw: save.currentGameweek, icon: 'transfer_in' }));
}

export async function newsPlayerSold(player, fee, buyerName, save) {
  const title = `${player.name} sold to ${buyerName}`;
  const body  = `${player.position} · Age ${player.age} · ${fmt.money(fee)} fee received`;
  await addNewsItem(_makeNewsItem('transfer_out', title, body, { gw: save.currentGameweek, icon: 'transfer_out' }));
}

export async function newsInjury(player, injuryName, gwsLeft, save) {
  const title = `${player.name} injured`;
  const body  = `${injuryName} · ${injuryDurationLabel(gwsLeft)} estimated recovery`;
  await addNewsItem(_makeNewsItem('injury', title, body, { gw: save.currentGameweek, icon: 'injury' }));
}

export async function newsAIBid(player, offer, buyerName, save) {
  const title = `Bid received for ${player.name}`;
  const body  = `${buyerName} have offered ${fmt.money(offer)} · Head to Transfers to respond`;
  await addNewsItem(_makeNewsItem('offer', title, body, { gw: save.currentGameweek }));
}

export async function newsSeasonEnd(finish, league, trophies, prizeMoney, save) {
  const ordStr = finish + (['st','nd','rd'][finish-1]||'th');
  const title  = trophies.length ? trophies[0] : `Season ${save.season} complete`;
  const parts  = [`Finished ${ordStr} in ${league}`];
  if (prizeMoney) parts.push(`Prize money: ${fmt.money(prizeMoney)}`);
  if (trophies.length > 1) parts.push(...trophies.slice(1));
  await addNewsItem(_makeNewsItem('season', title, parts.join(' · '), { gw: save.currentGameweek, icon: 'trophy' }));
}

export async function newsPromotion(teamName, toLeague, save) {
  const title = `Promoted to ${toLeague}!`;
  const body  = `${teamName} have earned promotion. New challenges await.`;
  await addNewsItem(_makeNewsItem('season', title, body, { gw: save.currentGameweek, icon: 'trophy' }));
}

export async function newsRelegation(teamName, toLeague, save) {
  const title = `Relegated to ${toLeague}`;
  const body  = `${teamName} drop down. Time to bounce back.`;
  await addNewsItem(_makeNewsItem('season', title, body, { gw: save.currentGameweek }));
}

export async function newsYouthPromotion(player, save) {
  const title = `${player.name} promoted from academy`;
  const body  = `${player.position} · Age ${player.age} · joins the first team squad`;
  await addNewsItem(_makeNewsItem('academy', title, body, { gw: save.currentGameweek, icon: 'academy' }));
}

export async function newsYouthIntake(count, wonderkids, save) {
  const wkStr = wonderkids > 0 ? ` — ${wonderkids} wonderkid${wonderkids>1?'s':''} spotted!` : '';
  const title = 'Youth intake complete';
  const body  = `${count} new prospects joined the academy${wkStr}`;
  await addNewsItem(_makeNewsItem('academy', title, body, { gw: save.currentGameweek, icon: 'academy' }));
}