// ══════════════════════════════════════════════════════════════
// INBOX / NEWS FEED
// ══════════════════════════════════════════════════════════════

// ─── News item factory ────────────────────────────────────────
// type: 'match' | 'transfer_in' | 'transfer_out' | 'injury' | 'season' | 'academy' | 'offer'
function _makeNewsItem(type, title, body, extra = {}) {
  return {
    id:    `news_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    type,
    title,
    body,
    read:  false,
    ts:    Date.now(),
    ...extra, // gw, date, icon
  };
}

// ─── Add to save.inbox (cap at 80) — serialised to prevent race conditions ──
let _inboxWriteQueue = Promise.resolve();
async function addNewsItem(item) {
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
async function _updateInboxBadge() {
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
const _NEWS_CAT = {
  match:        { label: 'Match',    icon: '⚽', color: 'var(--acc)'  },
  transfer_in:  { label: 'Signing',  icon: '📥', color: '#22c55e'     },
  transfer_out: { label: 'Sale',     icon: '📤', color: '#f97316'     },
  injury:       { label: 'Injury',   icon: '🚑', color: 'var(--acc3)' },
  season:       { label: 'Season',   icon: '🏆', color: 'var(--acc2)' },
  academy:      { label: 'Academy',  icon: '🎓', color: '#a78bfa'     },
  offer:        { label: 'Offer',    icon: '📨', color: '#38bdf8'     },
};

// ─── Render inbox screen ──────────────────────────────────────
async function renderInbox() {
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
    ? `<div class="inbox-empty"><div style="font-size:36px">📭</div><div class="inbox-empty-title">No messages</div><div class="inbox-empty-sub">News and updates will appear here as your season unfolds.</div></div>`
    : filtered.map(item => {
        const cat = _NEWS_CAT[item.type] || { icon: '📋', color: 'var(--tx2)', label: '' };
        const ago = _timeAgo(item.ts);
        return `<div class="inbox-item${item.read?' read':''}">
          <div class="inbox-icon" style="background:${cat.color}18;color:${cat.color}">${cat.icon}</div>
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

function _timeAgo(ts) {
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

async function newsMatchResult(result, save) {
  const isHome = result.homeTeamId === save.userTeamId;
  const ug = isHome ? result.homeGoals : result.awayGoals;
  const og = isHome ? result.awayGoals : result.homeGoals;
  const outcome = ug > og ? 'WIN' : ug < og ? 'LOSS' : 'DRAW';
  const oppName = isHome ? result.awayTeamName : result.homeTeamName;
  const oppGoals = og;
  const userGoals = ug;

  const icon = outcome === 'WIN' ? '🟢' : outcome === 'LOSS' ? '🔴' : '🟡';
  const title = `${icon} ${outcome} ${userGoals}–${oppGoals} vs ${oppName}`;
  const scorers = (isHome ? result.homeScorers : result.awayScorers) || [];
  const scorerStr = scorers.map(s => `${s.playerName} ${s.minute}'`).join(', ');
  const comp = result.competition || 'League';
  const body = [
    scorerStr ? `Scorers: ${scorerStr}` : null,
    `${comp} · GW${result.gameweek || save.currentGameweek}`,
  ].filter(Boolean).join(' · ');

  await addNewsItem(_makeNewsItem('match', title, body, { gw: result.gameweek || save.currentGameweek }));
}

async function newsPlayerSigned(player, fee, save) {
  const title = `📥 ${player.name} signed`;
  const body  = `${player.position} · Age ${player.age} · ${fmt.money(fee)} fee`;
  await addNewsItem(_makeNewsItem('transfer_in', title, body, { gw: save.currentGameweek }));
}

async function newsPlayerSold(player, fee, buyerName, save) {
  const title = `📤 ${player.name} sold to ${buyerName}`;
  const body  = `${player.position} · Age ${player.age} · ${fmt.money(fee)} fee received`;
  await addNewsItem(_makeNewsItem('transfer_out', title, body, { gw: save.currentGameweek }));
}

async function newsInjury(player, injuryName, gwsLeft, save) {
  const title = `🚑 ${player.name} injured`;
  const body  = `${injuryName} · ${injuryDurationLabel(gwsLeft)} estimated recovery`;
  await addNewsItem(_makeNewsItem('injury', title, body, { gw: save.currentGameweek }));
}

async function newsAIBid(player, offer, buyerName, save) {
  const title = `📨 Bid received for ${player.name}`;
  const body  = `${buyerName} have offered ${fmt.money(offer)} · Head to Transfers to respond`;
  await addNewsItem(_makeNewsItem('offer', title, body, { gw: save.currentGameweek }));
}

async function newsSeasonEnd(finish, league, trophies, prizeMoney, save) {
  const ordStr = finish + (['st','nd','rd'][finish-1]||'th');
  const title  = trophies.length ? `🏆 ${trophies[0]}` : `Season ${save.season} complete`;
  const parts  = [`Finished ${ordStr} in ${league}`];
  if (prizeMoney) parts.push(`Prize money: ${fmt.money(prizeMoney)}`);
  if (trophies.length > 1) parts.push(...trophies.slice(1));
  await addNewsItem(_makeNewsItem('season', title, parts.join(' · '), { gw: save.currentGameweek }));
}

async function newsPromotion(teamName, toLeague, save) {
  const title = `⬆️ Promoted to ${toLeague}!`;
  const body  = `${teamName} have earned promotion. New challenges await.`;
  await addNewsItem(_makeNewsItem('season', title, body, { gw: save.currentGameweek }));
}

async function newsRelegation(teamName, toLeague, save) {
  const title = `⬇️ Relegated to ${toLeague}`;
  const body  = `${teamName} drop down. Time to bounce back.`;
  await addNewsItem(_makeNewsItem('season', title, body, { gw: save.currentGameweek }));
}

async function newsYouthPromotion(player, save) {
  const title = `🎓 ${player.name} promoted from academy`;
  const body  = `${player.position} · Age ${player.age} · joins the first team squad`;
  await addNewsItem(_makeNewsItem('academy', title, body, { gw: save.currentGameweek }));
}

async function newsYouthIntake(count, wonderkids, save) {
  const wkStr = wonderkids > 0 ? ` — ${wonderkids} wonderkid${wonderkids>1?'s':''} spotted!` : '';
  const title = `🎓 Youth intake complete`;
  const body  = `${count} new prospects joined the academy${wkStr}`;
  await addNewsItem(_makeNewsItem('academy', title, body, { gw: save.currentGameweek }));
}
