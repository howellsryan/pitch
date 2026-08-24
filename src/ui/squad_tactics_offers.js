import { getPlayersByTeam, getSave, getTeam, putPlayer, putSave } from '../modules/db.js';
import { FORMATIONS, primaryRating } from '../modules/matchEngine.js';
import { acceptOffer, counterOffer, formAdjustedValue, rejectOffer } from '../modules/transfers.js';
import { getPotentialLabel, getPotentialStars } from '../modules/potential.js';
import { fmt, formLabel, posGroup, showModal, toast } from './helpers.js';
import { renderHome, renderTransfers } from './home_transfers.js';
import { renderTrophies } from './renderers.js';

// ══════════════════════════════════════════════════════════════
// SQUAD SCREEN — compact no-scroll desktop table
// ══════════════════════════════════════════════════════════════
export async function renderSquad() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);
  const team    = await getTeam(save.userTeamId);
  const el      = document.getElementById('sq-list');
  if (!el) return;

  const hdrEl = document.getElementById('sq-hdr');
  if (hdrEl && team) hdrEl.innerHTML = `
    <div style="text-align:right">
      <div style="font-family:var(--fd);font-size:15px;letter-spacing:1px">${team.name}</div>
      <div style="font-size:10px;color:var(--tx2)">${players.length} registered</div>
    </div>`;

  const groups = {
    'GK':  players.filter(p => p.position === 'GK'),
    'DEF': players.filter(p => ['CB','RB','LB'].includes(p.position)),
    'MID': players.filter(p => ['CM','CDM','CAM','RM','LM'].includes(p.position)),
    'FWD': players.filter(p => ['ST','CF','RW','LW'].includes(p.position)),
  };
  const groupNames = { GK:'GK', DEF:'DEF', MID:'MID', FWD:'FWD' };

  // Colour-coded number helper (replaces bars)
  const attrNum = (val) => {
    const c = val >= 80 ? 'var(--acc)' : val >= 65 ? 'var(--acc2)' : val >= 50 ? 'var(--tx)' : 'var(--acc3)';
    return `<span style="color:${c};font-family:var(--fm);font-size:11px;font-weight:700">${val}</span>`;
  };

  const buildRow = (p) => {
    const g        = posGroup(p.position);
    const r        = primaryRating(p);
    const fitness  = Math.round(p.fitness ?? 90);
    const fitColor = fitness >= 75 ? 'var(--acc)' : fitness >= 50 ? 'var(--acc2)' : 'var(--acc3)';
    const fav      = formAdjustedValue ? formAdjustedValue(p) : p.value;
    const isListed = p.transferListed === true;
    const potStars = getPotentialStars ? getPotentialStars(p) : 0;
    const potColor = ['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars] ?? '#8a9ab0';
    const fl       = formLabel(p);

    const atkNum = p.position === 'GK' ? attrNum(p.goalkeeping) : attrNum(p.attack);
    const midNum = p.position === 'GK' ? attrNum(p.defence) : attrNum(p.midfield);
    const defNum = p.position === 'GK' ? `<span style="color:var(--txd);font-size:10px">—</span>` : attrNum(p.defence);

    return `<div class="sq-row ${isListed ? 'sq-row-listed' : ''} ${p.injured ? 'sq-row-inj' : ''}" data-pid="${p.id}">
      <div class="sq-col-rat">${r}</div>
      <div><span class="pos ${g}" style="font-size:8px">${p.position}</span></div>
      <div class="sq-col-name">
        ${p.injured ? '<span class="inj-badge">INJ</span>' : ''}
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
        ${isListed ? '<span class="listed-badge">TL</span>' : ''}
        ${p.isWonderkid ? '<span style="font-size:8px;color:var(--acc2)">★</span>' : ''}
      </div>
      <div style="text-align:center;font-size:10px;color:var(--tx2)">${p.age}</div>
      <div style="text-align:center;font-size:10px;color:${fitColor};font-family:var(--fm)">${fitness}%</div>
      <div style="text-align:center">${potStars ? `<span style="color:${potColor};font-size:9px">${'★'.repeat(potStars)}</span>` : ''}</div>
      <div class="sq-col-num" style="text-align:center">${atkNum}</div>
      <div class="sq-col-num" style="text-align:center">${midNum}</div>
      <div class="sq-col-num" style="text-align:center">${defNum}</div>
      <div class="sq-col-money">${fmt.money(fav)}</div>
      <div class="sq-col-btns">
        <button class="sq-btn-sm ${p.inSquad !== false ? 'sq-btn-in' : 'sq-btn-out'}"
          data-sq-action="${p.inSquad !== false ? 'exclude' : 'include'}"
          data-pid="${p.id}">${p.inSquad !== false ? 'Active' : 'Excl'}</button>
        <button class="sq-btn-sm ${isListed ? 'sq-btn-unlist' : 'sq-btn-list'}"
          data-sq-action="${isListed ? 'unlist' : 'list'}"
          data-pid="${p.id}">${isListed ? 'Unlist' : 'List'}</button>
      </div>
    </div>`;
  };

  const hdrRow = `<div class="sq-tbl-hdr">
    <div style="text-align:center">RTG</div><div>POS</div><div>NAME</div>
    <div style="text-align:center">AGE</div><div style="text-align:center">FIT</div>
    <div style="text-align:center">POT</div>
    <div style="text-align:center">ATK</div><div style="text-align:center">MID</div><div style="text-align:center">DEF</div>
    <div style="text-align:right">VALUE</div><div></div>
  </div>`;

  const groupsHTML = Object.entries(groups).filter(([,g]) => g.length > 0).map(([key, grp]) => {
    const sorted = [...grp].sort((a,b) => primaryRating(b) - primaryRating(a));
    return `<div class="sq-group">
      <div class="sq-group-hdr">
        <span>${{GK:'Goalkeepers',DEF:'Defenders',MID:'Midfielders',FWD:'Forwards'}[key]}</span>
        <span style="font-size:10px;font-family:var(--fm);color:var(--txd)">${grp.length}</span>
      </div>
      <div class="sq-rows">${sorted.map(p => buildRow(p)).join('')}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="squad-layout">${hdrRow}<div class="sq-scroll">${groupsHTML}</div></div>`;

  // Row click → player modal
  el.querySelectorAll('.sq-row').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('[data-sq-action]')) return;
      const pl = players.find(p => p.id === row.dataset.pid);
      if (pl) openSquadPlayerModal(pl, players, save);
    };
  });

  // Action buttons
  el.querySelectorAll('[data-sq-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleSquadAction(btn.dataset.sqAction, btn.dataset.pid, players, save);
    };
  });
}

export function openSquadPlayerModal(p, players, save) {
  const g        = posGroup(p.position);
  const r        = primaryRating(p);
  const fav      = formAdjustedValue ? formAdjustedValue(p) : p.value;
  const fitness  = Math.round(p.fitness ?? 90);
  const fitColor = fitness >= 75 ? 'var(--acc)' : fitness >= 50 ? 'var(--acc2)' : 'var(--acc3)';
  const potStars = getPotentialStars ? getPotentialStars(p) : 0;
  const potLabel = getPotentialLabel ? getPotentialLabel(p) : '';
  const potColor = ['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars] ?? '#8a9ab0';
  const fl       = formLabel(p);
  const isGK     = p.position === 'GK';
  const isFWD    = ['ST','CF','RW','LW'].includes(p.position);
  const isMID    = ['CM','CDM','CAM','RM','LM'].includes(p.position);
  const isDEF    = ['CB','RB','LB'].includes(p.position);

  const attrBarHTML = (label, val, isPrimary) => {
    const pct = Math.round((val / 99) * 100);
    const color = isPrimary ? 'var(--acc)' : val >= 70 ? 'var(--acc2)' : val >= 50 ? 'var(--tx2)' : 'var(--acc3)';
    const barColor = isPrimary ? 'linear-gradient(90deg,var(--acc),#7fff9a)' : 'linear-gradient(90deg,var(--sur3),var(--tx2))';
    return `<div class="sq-attr-row">
      <div class="sq-attr-lbl">${label}</div>
      <div class="sq-attr-bar-w"><div class="sq-attr-bar" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="sq-attr-val" style="color:${color}">${val}</div>
    </div>`;
  };

  // Position-specific stat cards
  const statCards = [];
  if (!isGK && p.goals > 0)       statCards.push({lbl:'Goals',val:p.goals,sub:'This save',color:'var(--acc3)'});
  if (!isGK && p.assists > 0)     statCards.push({lbl:'Assists',val:p.assists,sub:'This save',color:'var(--acc2)'});
  if ((isGK||isDEF) && p.cleanSheets > 0) statCards.push({lbl:'Clean Sheets',val:p.cleanSheets,sub:'This save',color:'var(--acc)'});
  if (statCards.length === 0) {
    if (p.goals === 0 && !isGK)   statCards.push({lbl:'Goals',val:0,sub:'This save',color:'var(--txd)'});
    if (p.assists === 0 && !isGK) statCards.push({lbl:'Assists',val:0,sub:'This save',color:'var(--txd)'});
    if ((isGK||isDEF) && p.cleanSheets === 0) statCards.push({lbl:'Clean Sheets',val:0,sub:'This save',color:'var(--txd)'});
  }

  // Attribute bars (position-specific)
  let attrHTML = '';
  if (isGK) {
    attrHTML = attrBarHTML('Goalkeeping', p.goalkeeping, true)
             + attrBarHTML('Defence', p.defence, false)
             + attrBarHTML('Midfield', p.midfield, false)
             + attrBarHTML('Attack', p.attack, false);
  } else if (isDEF) {
    attrHTML = attrBarHTML('Defence', p.defence, true)
             + attrBarHTML('Midfield', p.midfield, false)
             + attrBarHTML('Attack', p.attack, false);
  } else if (isMID) {
    attrHTML = attrBarHTML('Midfield', p.midfield, true)
             + attrBarHTML('Attack', p.attack, false)
             + attrBarHTML('Defence', p.defence, false);
  } else {
    attrHTML = attrBarHTML('Attack', p.attack, true)
             + attrBarHTML('Midfield', p.midfield, false)
             + attrBarHTML('Defence', p.defence, false);
  }

  const purchaseInfo = p.purchasedFor
    ? `<div style="font-size:11px;color:var(--tx2)">Paid: <strong style="color:var(--tx)">${fmt.money(p.purchasedFor)}</strong></div>`
    : '';

  const bodyHTML = `
    <div style="display:flex;gap:14px;align-items:flex-start;padding:4px 0 14px;border-bottom:1px solid var(--bdr);flex-wrap:wrap">
      <div style="background:var(--sur2);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:14px;flex:1;min-width:220px">
        <div style="font-family:var(--fd);font-size:38px;color:var(--acc2);line-height:1">${r}</div>
        <div>
          <div style="font-family:var(--fd);font-size:17px;letter-spacing:.5px;margin-bottom:4px">${p.name}</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="pos ${g}">${p.position}</span>
            <span style="font-size:11px;color:var(--tx2)">Age ${p.age}</span>
            <span class="fb ${fl.cls}">${fl.text}</span>
            ${p.isWonderkid ? '<span style="background:linear-gradient(135deg,#f5c842,#f97316);color:#000;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;font-family:var(--fm)">WONDERKID</span>' : ''}
            ${p.injured ? '<span class="inj-badge">INJURED</span>' : ''}
          </div>
          ${potStars ? `<div style="color:${potColor};font-size:11px;margin-top:4px">${'★'.repeat(potStars)}${'☆'.repeat(5-potStars)} <span style="color:var(--tx2);font-size:10px">${potLabel}</span></div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:130px">
        <div style="font-size:10px;color:var(--tx2)">Form Value: <strong style="color:var(--acc2)">${fmt.money(fav)}</strong></div>
        <div style="font-size:10px;color:var(--tx2)">Wage: <strong style="color:var(--tx)">${fmt.wage(p.wage)}</strong>/wk</div>
        <div style="font-size:10px;color:var(--tx2)">Fitness: <strong style="color:${fitColor}">${fitness}%</strong></div>
        <div style="font-size:10px;color:var(--tx2)">Peak Age: <strong style="color:var(--tx)">${p.peakAge ?? '—'}</strong></div>
        ${purchaseInfo}
      </div>
    </div>
    ${statCards.length ? `
    <div style="display:grid;grid-template-columns:repeat(${Math.min(statCards.length,3)},1fr);gap:8px;margin:12px 0">
      ${statCards.map(s => `<div class="sq-modal-stat">
        <div class="sq-modal-stat-lbl">${s.lbl}</div>
        <div class="sq-modal-stat-val" style="color:${s.color}">${s.val}</div>
        <div class="sq-modal-stat-sub">${s.sub}</div>
      </div>`).join('')}
    </div>` : ''}
    <div style="margin-top:4px">
      <div style="font-size:9px;font-family:var(--fm);color:var(--txd);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Attributes</div>
      ${attrHTML}
    </div>`;

  const isListed = p.transferListed === true;
  const inSquad  = p.inSquad !== false;

  showModal(p.name, bodyHTML, [
    {
      id: 'sq-toggle-squad', label: inSquad ? 'Exclude from Squad' : 'Add to Squad',
      cls: inSquad ? 'btn-s' : 'btn-p',
      handler: async () => {
        await putPlayer({ ...p, inSquad: !inSquad });
        toast(`${p.name} ${inSquad ? 'excluded from' : 'added to'} squad`, 'info', 2000);
        await renderSquad();
      }
    },
    {
      id: 'sq-toggle-list', label: isListed ? 'Remove from List' : 'List for Transfer',
      cls: isListed ? 'btn-s' : 'btn-s',
      handler: async () => {
        await putPlayer({ ...p, transferListed: !isListed });
        toast(isListed ? `${p.name} removed from transfer list` : `${p.name} listed — AI clubs will bid`, isListed ? 'info' : 'success', 3000);
        await renderSquad();
      }
    },
    { id: 'sq-close', label: 'Close', cls: 'btn-s' }
  ]);
}

export async function handleSquadAction(action, playerId, players, save) {
  const pl = players.find(p => p.id === playerId);
  if (!pl) return;
  switch (action) {
    case 'include':  await putPlayer({ ...pl, inSquad: true });           toast(`${pl.name} added to squad`, 'success', 2000); break;
    case 'exclude':  await putPlayer({ ...pl, inSquad: false });          toast(`${pl.name} excluded from squad`, 'info', 2000); break;
    case 'list':     await putPlayer({ ...pl, transferListed: true });    toast(`${pl.name} listed for transfer`, 'success', 3000); break;
    case 'unlist':   await putPlayer({ ...pl, transferListed: false });   toast(`${pl.name} removed from transfer list`, 'info', 2000); break;
  }
  await renderSquad();
}


// ══════════════════════════════════════════════════════════════
// TACTICS SCREEN — full-screen pitch, tap-to-swap bottom sheet
// ══════════════════════════════════════════════════════════════
export async function renderTactics() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);
  const el      = document.getElementById('screen-tactics');
  if (!el) return;

  const currentFormation = save.formation ?? '4-3-3';
  const savedLineup      = save.lineup ?? [];
  const currentMentality = save.mentality ?? 'balanced';

  const MENTALITIES = [
    // mentality-pill buttons rendered as compact m-pill strip
    { id:'defensive',  icon:'🛡️', label:'DEF',  fullLabel:'Defensive',  desc:'Compact & hard to break down' },
    { id:'balanced',   icon:'⚖️', label:'BAL',   fullLabel:'Balanced',   desc:'No bias — steady in both phases' },
    { id:'possession', icon:'🎯', label:'POS', fullLabel:'Possession', desc:'Patient build-up, dominate the ball' },
    { id:'attacking',  icon:'⚡', label:'ATK',  fullLabel:'Attacking',  desc:'High press & direct, more exposed' },
  ];
  const curMentObj = MENTALITIES.find(m => m.id === currentMentality) ?? MENTALITIES[1];

  // Formation visual slot positions (x/y as % of pitch)
  const SLOT_LAYOUT = {
    // 3 at the back
    '3-4-3':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:54},{p:'CM',x:62,y:54},{p:'CM',x:38,y:54},{p:'LM',x:15,y:54},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
    '3-5-2':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:88,y:52},{p:'CM',x:67,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:33,y:52},{p:'LM',x:12,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '3-4-1-2': [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:56},{p:'CM',x:62,y:56},{p:'CM',x:38,y:56},{p:'LM',x:15,y:56},{p:'CAM',x:50,y:38},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    // 4 at the back
    '4-3-3':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:73,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:27,y:52},{p:'RW',x:82,y:28},{p:'ST',x:50,y:20},{p:'LW',x:18,y:28}],
    '4-2-3-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:63,y:58},{p:'CDM',x:37,y:58},{p:'RW',x:80,y:38},{p:'CAM',x:50,y:38},{p:'LW',x:20,y:38},{p:'ST',x:50,y:18}],
    '4-4-2':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '4-1-2-1-2':[{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'CM',x:70,y:46},{p:'CM',x:30,y:46},{p:'CAM',x:50,y:34},{p:'ST',x:65,y:20},{p:'ST',x:35,y:20}],
    '4-3-2-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:70,y:55},{p:'CDM',x:50,y:58},{p:'CM',x:30,y:55},{p:'RW',x:72,y:35},{p:'LW',x:28,y:35},{p:'ST',x:50,y:20}],
    '4-5-1':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:66,y:52},{p:'CM',x:50,y:52},{p:'CM',x:34,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
    '4-4-1-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'CAM',x:50,y:34},{p:'ST',x:50,y:20}],
    '4-1-4-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'RM',x:82,y:44},{p:'CM',x:63,y:44},{p:'CM',x:37,y:44},{p:'LM',x:18,y:44},{p:'ST',x:50,y:20}],
    // 5 at the back
    '5-3-2':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:68,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:32,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '5-4-1':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
    '5-2-3':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
  };

  const slots = SLOT_LAYOUT[currentFormation] ?? SLOT_LAYOUT['4-3-3'];

  // Build assignment: for each slot, find best available player
  const posMap = { GK:['GK'], RB:['RB'], LB:['LB'], CB:['CB'], RM:['RM','CM'], LM:['LM','CM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW'] };
  const avail  = players.filter(p => !p.injured && !p.suspended).sort((a,b) => primaryRating(b)-primaryRating(a));
  const assignment = new Array(11).fill(null);
  const usedIds    = new Set();

  // If there's a saved lineup, use those players in order
  if (savedLineup.length === 11) {
    savedLineup.forEach((pid, i) => {
      const pl = players.find(p => p.id === pid);
      if (pl) { assignment[i] = pl; usedIds.add(pl.id); }
    });
  } else {
    // Auto-assign
    slots.forEach((slot, i) => {
      const acceptable = posMap[slot.p] ?? [slot.p];
      const cand = avail.find(p => !usedIds.has(p.id) && acceptable.includes(p.position));
      if (cand) { assignment[i] = cand; usedIds.add(cand.id); }
    });
    // Fill any remaining with best available
    slots.forEach((slot, i) => {
      if (assignment[i]) return;
      const cand = avail.find(p => !usedIds.has(p.id) && p.position !== 'GK');
      if (cand) { assignment[i] = cand; usedIds.add(cand.id); }
    });
  }

  const mentalityLabels = { defensive:'🛡️ Defensive', balanced:'⚖️ Balanced', possession:'🎯 Possession', attacking:'⚡ Attacking' };

  // Group formations by back line count
  const formationGroups = [
    { label:'3 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('3-')) },
    { label:'4 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('4-')) },
    { label:'5 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('5-')) },
  ];

  el.innerHTML = `
  <div class="tactics-layout">
    <!-- Controls bar -->
    <div class="tac-controls">
      <div class="tac-dd-half">
        <div class="tac-dd-label">Formation</div>
        <div class="tac-dropdown" id="formation-dd">
          <button class="tac-dd-btn" id="fm-selected-btn">
            <span class="tac-dd-val">${currentFormation}</span>
            <span class="tac-dd-arrow">▾</span>
          </button>
          <div class="tac-dd-list" id="fm-dd-list">
            ${formationGroups.map(g => g.formations.length ? `
              <div class="tac-dd-group-hdr">${g.label}</div>
              ${g.formations.map(f => `
                <button class="tac-dd-option ${f===currentFormation?'tac-dd-active':''}" data-fm="${f}">
                  <span class="tac-dd-opt-name">${f}</span>
                  ${f===currentFormation ? '<span class="tac-dd-check">✓</span>' : ''}
                </button>`).join('')}` : '').join('')}
          </div>
        </div>
      </div>
      <div class="tac-dd-half">
        <div class="tac-dd-label">Mentality</div>
        <div class="tac-dropdown" id="mentality-dd">
          <button class="tac-dd-btn" id="m-selected-btn">
            <span class="m-pill-icon">${curMentObj.icon}</span>
            <span class="tac-dd-val">${curMentObj.fullLabel}</span>
            <span class="tac-dd-arrow">▾</span>
          </button>
          <div class="tac-dd-list" id="m-dd-list">
            ${MENTALITIES.filter(m => m.id !== currentMentality).map(m => `
              <button class="tac-dd-option" data-mentality="${m.id}">
                <span class="m-pill-icon">${m.icon}</span>
                <span class="m-dd-opt-info">
                  <span class="m-dd-opt-label">${m.fullLabel}</span>
                  <span class="m-dd-opt-desc">${m.desc}</span>
                </span>
              </button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Full-screen pitch -->
    <div class="tac-pitch-area">
      <div class="pitch-wrap">
        <div class="pitch-bg" id="tac-pitch">
          <div class="pitch-line half"></div>
          <div class="pitch-circle"></div>
          <div class="pitch-box top"></div>
          <div class="pitch-box bot"></div>
          <div class="pitch-six top"></div>
          <div class="pitch-six bot"></div>
          <div class="pitch-arc top"></div>
          <div class="pitch-arc bot"></div>
          <div class="pitch-spot top"></div>
          <div class="pitch-spot bot"></div>
          <div class="pitch-spot mid"></div>
          ${slots.map((slot, i) => {
            const pl = assignment[i];
            const g  = pl ? posGroup(pl.position) : posGroup(slot.p);
            const r  = pl ? primaryRating(pl) : '';
            const isInj = pl?.injured === true;
            return `<div class="pitch-slot" style="left:${slot.x}%;top:${slot.y}%" data-slot="${i}">
              <div class="slot-outer">
                <div class="slot-inner ${pl ? `pos-${g}` : 'pos-empty'}${isInj ? ' slot-injured' : ''}" title="${pl?.name ?? slot.p}${isInj ? ' (INJURED)' : ''}">
                  ${pl
                    ? `<div class="slot-rating">${r}</div><div class="slot-pos">${pl.position}</div>${isInj ? '<div class="slot-inj-icon">🚑</div>' : ''}`
                    : `<div class="slot-pos slot-empty-lbl">${slot.p}</div>`
                  }
                </div>
                ${pl ? `<div class="slot-name">${pl.name.split(' ').slice(-1)[0]}${isInj ? ' 🚑' : ''}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Bench strip (desktop only — hidden on mobile via CSS) -->
    ${(() => {
      const posColors = { ATT:'#e84855', MID:'#f5c842', DEF:'#12a864', GK:'#7c83e8' };
      const benchPlayers = players
        .filter(p => !p.injured && !p.suspended && !assignment.some(a => a?.id === p.id))
        .sort((a, b) => primaryRating(b) - primaryRating(a))
        .slice(0, 12);
      return `<div class="tac-bench-strip">
        <div class="tac-bench-label">BENCH</div>
        <div class="tac-bench-players">
          ${benchPlayers.map(p => {
            const g   = posGroup(p.position);
            const r   = primaryRating(p);
            const fit = Math.round(p.fitness ?? 90);
            const fitCol = fit >= 75 ? 'var(--acc)' : fit >= 50 ? 'var(--acc2)' : 'var(--acc3)';
            const avatarBg = posColors[g] ?? '#8a9ab0';
            const initials = p.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
            return `<div class="tac-bench-card" data-bench-pid="${p.id}" title="${p.name} · ${p.position} · ${r}">
              <div class="tac-bench-avatar" style="background:${avatarBg}22;border-color:${avatarBg}55;color:${avatarBg}">${initials}</div>
              <div class="tac-bench-pos">${p.position}</div>
              <div class="tac-bench-name">${p.name.split(' ').slice(-1)[0]}</div>
              <div class="tac-bench-rat">${r}</div>
              <div class="tac-bench-fit" style="color:${fitCol}">${fit}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    })()}
  </div>`;

  // ── Generic dropdown wiring helper ─────────────────────
  function wireDropdown(btnId, listId, onSelect) {
    const btn = el.querySelector('#' + btnId);
    const list = el.querySelector('#' + listId);
    if (!btn || !list) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      // Close any other open dropdown first
      el.querySelectorAll('.tac-dd-list.open').forEach(l => { if (l !== list) l.classList.remove('open'); });
      const isOpen = list.classList.contains('open');
      list.classList.toggle('open');
      if (!isOpen) {
        const closeDD = () => { list.classList.remove('open'); document.removeEventListener('click', closeDD); };
        setTimeout(() => document.addEventListener('click', closeDD), 0);
      }
    };
    list.querySelectorAll('.tac-dd-option').forEach(opt => {
      opt.onclick = async (e) => {
        e.stopPropagation();
        list.classList.remove('open');
        await onSelect(opt);
      };
    });
  }

  // ── Formation dropdown ────────────────────────────────────
  wireDropdown('fm-selected-btn', 'fm-dd-list', async (opt) => {
    const sv = await getSave();
    await putSave({ ...sv, formation: opt.dataset.fm, lineup: null });
    await renderTactics();
  });

  // ── Mentality dropdown ─────────────────────────────────
  wireDropdown('m-selected-btn', 'm-dd-list', async (opt) => {
    const sv = await getSave();
    await putSave({ ...sv, mentality: opt.dataset.mentality });
    toast(`Mentality: ${mentalityLabels[opt.dataset.mentality] ?? opt.dataset.mentality}`, 'info', 2000);
    await renderTactics();
  });

  // ── Click a pitch slot → open swap bottom sheet ───────────
  el.querySelectorAll('.pitch-slot').forEach(slot => {
    slot.onclick = () => {
      const idx = parseInt(slot.dataset.slot);
      const cur = assignment[idx];
      openSwapPicker(idx, cur, players, assignment, slots, currentFormation, save);
    };
  });

  // ── Click a bench card → open swap picker targeting best slot ──
  el.querySelectorAll('.tac-bench-card').forEach(card => {
    card.onclick = () => {
      const pid = card.dataset.benchPid;
      const benchPlayer = players.find(p => p.id === pid);
      if (!benchPlayer) return;
      // Find the slot whose position group best matches this player, preferring empty slots
      const posMap = { GK:['GK'], RB:['RB','LB'], LB:['LB','RB'], CB:['CB'], RM:['RM','CM','CAM'], LM:['LM','CM','CAM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM','RW','LW'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW','CAM'] };
      let bestSlotIdx = 0;
      let bestScore   = -1;
      slots.forEach((slot, i) => {
        const acceptable = posMap[slot.p] ?? [slot.p];
        const isNatural  = acceptable.includes(benchPlayer.position);
        const isEmpty    = !assignment[i];
        const score      = (isNatural ? 2 : 0) + (isEmpty ? 1 : 0);
        if (score > bestScore) { bestScore = score; bestSlotIdx = i; }
      });
      openSwapPicker(bestSlotIdx, assignment[bestSlotIdx], players, assignment, slots, currentFormation, save, benchPlayer);
    };
  });
}

export function openSwapPicker(slotIdx, currentPlayer, players, assignment, slots, formation, save, preSelected) {
  // Remove any existing swap sheet
  document.querySelector('.swap-backdrop')?.remove();
  document.querySelector('.swap-sheet')?.remove();

  const slot     = slots[slotIdx];
  const posMap   = { GK:['GK'], RB:['RB','LB'], LB:['LB','RB'], CB:['CB'], RM:['RM','CM','CAM'], LM:['LM','CM','CAM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM','RW','LW'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW','CAM'] };
  const naturalPositions = posMap[slot.p] ?? [slot.p];

  // Score each candidate by how good a fit they are
  const candidates = players.filter(p => !p.injured && !p.suspended);

  // Categorise players into groups for clarity
  const naturalFit = [];   // Position matches the slot
  const versatile  = [];   // Same position group (DEF/MID/ATT)
  const outOfPos   = [];   // Different group entirely

  const slotGroup = posGroup(slot.p);

  candidates.forEach(p => {
    const isCurrent = currentPlayer?.id === p.id;
    const isInXI    = assignment.some((ap, i) => ap?.id === p.id && i !== slotIdx);
    const pGroup    = posGroup(p.position);
    const isNatural = naturalPositions.includes(p.position);

    const entry = { player: p, isCurrent, isInXI, isNatural, group: pGroup };

    if (isCurrent) {
      // Current player shown separately in the header
    } else if (isNatural) {
      naturalFit.push(entry);
    } else if (pGroup === slotGroup || (slotGroup === 'MID' && pGroup === 'ATT') || (slotGroup === 'ATT' && pGroup === 'MID')) {
      versatile.push(entry);
    } else {
      outOfPos.push(entry);
    }
  });

  // Sort each group: non-XI first (bench options), then by rating
  const sortGroup = arr => arr.sort((a, b) => {
    if (a.isInXI !== b.isInXI) return a.isInXI ? 1 : -1;
    return primaryRating(b.player) - primaryRating(a.player);
  });
  sortGroup(naturalFit);
  sortGroup(versatile);
  sortGroup(outOfPos);

  const buildRow = (entry) => {
    const p = entry.player;
    const g = posGroup(p.position);
    const r = primaryRating(p);
    const fit = Math.round(p.fitness ?? 90);
    const fitCol = fit >= 75 ? 'var(--tx2)' : fit >= 50 ? 'var(--acc2)' : 'var(--acc3)';
    const ratingColor = entry.isNatural ? 'var(--acc)' : 'var(--tx2)';

    return `<div class="swap-row ${entry.isInXI ? 'dimmed' : ''} ${entry.isNatural ? 'natural' : ''} ${preSelected?.id===p.id?'swap-presel':''}" data-pid="${p.id}">
      <div class="swap-row-pos" style="background:var(--sur2);border:1px solid var(--bdr);color:var(--tx)">${p.position}</div>
      <div class="swap-row-info">
        <div class="swap-row-name">${p.name}</div>
        <div class="swap-row-meta">
          <span>Age ${p.age}</span>
          ${p.goals > 0 ? `<span>⚽${p.goals}</span>` : ''}
          ${p.assists > 0 ? `<span>🎯${p.assists}</span>` : ''}
        </div>
      </div>
      ${entry.isInXI ? '<span class="swap-row-badge xi">IN XI</span>' : ''}
      <span class="swap-row-fit" style="color:${fitCol}">${fit}%</span>
      <span class="swap-row-rat" style="color:${ratingColor}">${r}</span>
    </div>`;
  };

  // Build sections HTML
  let sectionsHTML = '';
  if (naturalFit.length) {
    sectionsHTML += `<div class="swap-section-hdr">Best fit for ${slot.p}</div>`;
    sectionsHTML += naturalFit.map(buildRow).join('');
  }
  if (versatile.length) {
    sectionsHTML += `<div class="swap-section-hdr">Can play here</div>`;
    sectionsHTML += versatile.map(buildRow).join('');
  }
  if (outOfPos.length) {
    sectionsHTML += `<div class="swap-section-hdr">Out of position</div>`;
    sectionsHTML += outOfPos.map(buildRow).join('');
  }

  // Current player info
  const curG = currentPlayer ? posGroup(currentPlayer.position) : '';
  const curR = currentPlayer ? primaryRating(currentPlayer) : '';
  const curFit = currentPlayer ? Math.round(currentPlayer.fitness ?? 90) : 0;

  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'swap-backdrop';
  document.body.appendChild(backdrop);

  // Create sheet
  const sheet = document.createElement('div');
  sheet.className = 'swap-sheet';
  sheet.innerHTML = `
    <div class="swap-sheet-handle"></div>
    <div class="swap-sheet-hdr">
      <span class="swap-sheet-title">${slot.p} Slot</span>
      <div class="swap-sheet-close">✕</div>
    </div>
    ${currentPlayer ? `
    <div class="swap-sheet-current">
      <div class="swap-row-pos" style="background:var(--sur2);border:1px solid var(--bdr);color:var(--tx);font-size:10px;font-weight:700;width:32px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center">${currentPlayer.position}</div>
      <div class="swap-current-info">
        <div class="swap-current-name">${currentPlayer.name}</div>
        <div class="swap-current-meta">Current · Rating ${curR} · Fitness ${curFit}%</div>
      </div>
    </div>` : ''}
    <div class="swap-list">
      ${sectionsHTML}
    </div>`;
  document.body.appendChild(sheet);

  // Animate in
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });

  const close = () => {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    sheet.addEventListener('transitionend', () => sheet.remove(), { once: true });
  };

  backdrop.onclick = close;
  sheet.querySelector('.swap-sheet-close').onclick = close;

  // Wire swap rows
  sheet.querySelectorAll('.swap-row').forEach(row => {
    row.onclick = async () => {
      const allCandidates = [...naturalFit, ...versatile, ...outOfPos];
      const entry = allCandidates.find(e => e.player.id === row.dataset.pid);
      if (!entry) return;
      const newPlayer = entry.player;

      close();

      // If new player is in another slot, swap them
      const otherSlotIdx = assignment.findIndex((ap, i) => ap?.id === newPlayer.id && i !== slotIdx);
      const newAssignment = [...assignment];
      newAssignment[slotIdx] = newPlayer;
      if (otherSlotIdx >= 0) newAssignment[otherSlotIdx] = currentPlayer ?? null;

      const sv = await getSave();
      const lineup = newAssignment.filter(Boolean).map(p => p.id);
      await putSave({ ...sv, lineup, formation });
      toast(`${newPlayer.name} → ${slot.p} slot`, 'success', 2000);
      await renderTactics();
    };
  });
}

// ══════════════════════════════════════════════════════════════
// TRANSFER OFFERS — shown via modal from Transfers screen
// ══════════════════════════════════════════════════════════════
export async function showOffersModal() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);

  const offers  = (save.inboundOffers ?? []).filter(o => o.status === 'pending');
  const byId    = new Map(players.map(p => [p.id, p]));
  const listed  = players.filter(p => p.transferListed);

  const bodyHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:14px;max-height:70vh;overflow-y:auto;padding:4px">

      <div>
        <div style="font-family:var(--fd);font-size:16px;letter-spacing:1px;margin-bottom:14px">
          Inbound Offers <span style="font-size:13px;color:var(--tx2);font-family:var(--fb)">(${offers.length})</span>
        </div>
        ${offers.length ? offers.map(offer => {
          const pl = byId.get(offer.playerId);
          if (!pl) return '';
          const fav      = formAdjustedValue(pl);
          const pct      = Math.round((offer.fee / fav) * 100);
          const g        = posGroup(pl.position);
          const fl       = formLabel(pl);
          const isListed = pl.transferListed === true;
          return `<div class="offer-card-v2" data-offer-pid="${pl.id}">
            <div class="offer-card-top">
              <div class="offer-player-info">
                <div class="pl-av" style="background:var(--sur3);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--tx2);letter-spacing:.5px">${posGroup(pl.position)}</div>
                <div>
                  <div style="font-weight:600;font-size:14px">${pl.name} ${isListed ? '<span class="listed-badge">LISTED</span>' : ''}</div>
                  <div style="font-size:11px;color:var(--tx2);display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
                    <span class="pos ${g}">${pl.position}</span>
                    <span>Age ${pl.age}</span>
                    <span class="fb ${fl.cls}">${fl.text}</span>
                    ${!isListed ? `<span style="color:var(--acc2);font-size:10px">⚠ Unsolicited bid</span>` : ''}
                  </div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:10px;color:var(--tx2)">From</div>
                <div style="font-weight:700;font-size:14px">${offer.clubName}</div>
              </div>
            </div>
            <div class="offer-amounts">
              <div class="offer-amt-box" style="border-color:${pct>=100?'rgba(18,168,100,.4)':'rgba(232,72,85,.4)'}">
                <div class="offer-amt-lbl">Their Offer</div>
                <div class="offer-amt-val" style="color:${pct>=100?'var(--acc)':'var(--acc3)'}">${fmt.money(offer.fee)}</div>
                <div class="offer-amt-sub">${pct}% of form value</div>
              </div>
              <div class="offer-amt-box">
                <div class="offer-amt-lbl">Form Value</div>
                <div class="offer-amt-val">${fmt.money(fav)}</div>
                <div class="offer-amt-sub">Base: ${fmt.money(pl.value)}</div>
              </div>
              <div class="offer-amt-box">
                <div class="offer-amt-lbl">Min. Accept</div>
                <div class="offer-amt-val" style="color:var(--tx2)">${fmt.money(Math.round(fav * (isListed ? 0.88 : 1.05)))}</div>
                <div class="offer-amt-sub">${isListed ? 'Listed player' : 'Unlisted premium'}</div>
              </div>
            </div>
            <div class="offer-btns">
              <button class="btn btn-p" data-offer-accept="${pl.id}">✅ Accept ${fmt.money(offer.fee)}</button>
              <button class="btn btn-s" data-offer-counter="${pl.id}" data-offer-fee="${offer.fee}" data-offer-fav="${fav}" data-offer-listed="${isListed?1:0}" data-offer-name="${pl.name}" data-offer-club="${offer.clubName}">
                💬 Counter
              </button>
              <button class="btn btn-d" data-offer-reject="${pl.id}">✕ Reject</button>
            </div>
          </div>`;
        }).join('') : `<div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:40px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">📭</div>
          <div style="font-family:var(--fd);font-size:20px;letter-spacing:1px;margin-bottom:6px">No Pending Offers</div>
          <div style="font-size:12px;color:var(--tx2)">AI clubs bid each gameweek. List players to attract more offers.</div>
        </div>`}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px">
          <div style="font-family:var(--fd);font-size:14px;letter-spacing:1px;margin-bottom:4px">Transfer Listed</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">${listed.length} player${listed.length!==1?'s':''} available</div>
          ${listed.length ? listed.map(p => {
            const g = posGroup(p.position);
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)">
              <span class="pos ${g}">${p.position}</span>
              <span style="flex:1;font-size:12px;font-weight:500">${p.name}</span>
              <span style="font-family:var(--fm);font-size:11px;color:var(--acc2)">${fmt.money(formAdjustedValue(p))}</span>
            </div>`;
          }).join('') : `<div style="font-size:12px;color:var(--txd)">No players listed. Go to Squad to list players.</div>`}
        </div>
        <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px">
          <div style="font-family:var(--fd);font-size:14px;letter-spacing:1px;margin-bottom:8px;color:var(--acc2)">ℹ Offer Rules</div>
          <div style="font-size:11px;color:var(--tx2);line-height:1.7">
            <div>• <strong>Listed players:</strong> AI offers from 85% of form value</div>
            <div>• <strong>Unlisted players:</strong> AI must offer 110%+ to tempt you</div>
            <div>• <strong>Form boost:</strong> goals/assists increase asking price</div>
            <div>• Offers arrive each gameweek automatically</div>
          </div>
        </div>
      </div>

    </div>`;

  const modal = showModal('📨 Transfer Inbox', bodyHTML, [], { wide: true });

  // ── Button handlers inside modal ────────────────────────
  const bd = document.getElementById('modal-bd');
  if (!bd) return;

  bd.querySelectorAll('[data-offer-accept]').forEach(btn => {
    btn.onclick = async () => {
      try {
        btn.closest('.offer-card-v2')?.remove();
        const { fee, buyerName } = await acceptOffer(btn.dataset.offerAccept);
        toast(`✅ Sold for ${fmt.money(fee)} to ${buyerName}!`, 'success', 5000);
        _updateOffersBadge();
        modal.close();
        await renderTransfers();
        await renderHome();
      } catch(e) { toast(`❌ ${e.message}`, 'error', 4000); }
    };
  });
  bd.querySelectorAll('[data-offer-reject]').forEach(btn => {
    btn.onclick = async () => {
      btn.closest('.offer-card-v2')?.remove();
      await rejectOffer(btn.dataset.offerReject);
      toast('Offer rejected', 'info', 2000);
      _updateOffersBadge();
      // Check if any offers remain
      const remaining = bd.querySelectorAll('.offer-card-v2');
      if (!remaining.length) {
        modal.close();
        await showOffersModal();
      }
    };
  });
  bd.querySelectorAll('[data-offer-counter]').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.offerCounter;
      const theirFee = parseInt(btn.dataset.offerFee);
      const fav = parseInt(btn.dataset.offerFav);
      const isListed = btn.dataset.offerListed === '1';
      const pName = btn.dataset.offerName;
      const clubName = btn.dataset.offerClub;

      // Counter slider range: from their offer up to 2× form value
      const minAsk = theirFee;
      const maxAsk = Math.round(fav * 2.0);
      const defaultAsk = Math.round(fav * (isListed ? 1.05 : 1.15));

      const likelihoodText = (v) => {
        const ratio = v / theirFee;
        if (ratio <= 1.05) return { text: '🤝 Almost certain — close to their offer', color: 'var(--acc)' };
        if (ratio <= 1.20) return { text: '✓ Good chance — reasonable ask', color: 'var(--acc)' };
        if (ratio <= 1.40) return { text: '⚠️ May negotiate — they\'ll try to meet halfway', color: 'var(--acc2)' };
        if (ratio <= 1.70) return { text: '🔥 Ambitious — they might walk away', color: 'var(--acc3)' };
        return { text: '✕ Very unlikely — too far from their offer', color: 'var(--acc3)' };
      };

      showModal(`💬 Counter ${clubName}`, `
        <div class="ctr">
          <div class="ctr-pl"><strong>${pName}</strong></div>
          <div class="ctr-row"><span>Their Offer</span><strong style="color:var(--tx2)">${fmt.money(theirFee)}</strong></div>
          <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fav)}</strong></div>
          <div style="margin:16px 0 8px;font-size:12px;font-weight:600;color:var(--tx)">Your Asking Price</div>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="range" id="counter-slider" min="${minAsk}" max="${maxAsk}" value="${defaultAsk}" step="100000" style="flex:1">
            <div id="counter-val" style="font-family:var(--fd);font-size:18px;color:var(--acc2);min-width:80px;text-align:right">${fmt.money(defaultAsk)}</div>
          </div>
          <div id="counter-likelihood" style="font-size:11px;margin-top:6px;color:var(--acc)"></div>
        </div>`,
        [{id:'send',label:'Send Counter',cls:'btn-p',handler:async()=>{
          const askVal = Number(document.getElementById('counter-slider')?.value || defaultAsk);
          const result = await counterOffer(pid, askVal);

          if (result.outcome === 'accepted') {
            toast(`✅ ${result.clubName} agreed to ${fmt.money(result.fee)}!`, 'success', 4000);
            modal.close();
            await showOffersModal();
          } else if (result.outcome === 'counter') {
            toast(`💬 ${result.clubName} counter: ${fmt.money(result.fee)} (was ${fmt.money(result.originalFee)})`, 'info', 5000);
            modal.close();
            await showOffersModal();
          } else {
            toast(`❌ ${result.clubName ?? 'Club'} withdrew their interest`, 'error', 4000);
            _updateOffersBadge();
            modal.close();
            await showOffersModal();
          }
        }},{id:'x',label:'Cancel',cls:'btn-s'}]
      );

      // Wire up the slider live update
      const csl = document.getElementById('counter-slider');
      const cvl = document.getElementById('counter-val');
      const clh = document.getElementById('counter-likelihood');
      const updateCounterHint = () => {
        const v = Number(csl?.value || defaultAsk);
        if (cvl) cvl.textContent = fmt.money(v);
        if (clh) {
          const lk = likelihoodText(v);
          clh.textContent = lk.text;
          clh.style.color = lk.color;
        }
      };
      if (csl) { csl.oninput = updateCounterHint; updateCounterHint(); }
    };
  });
}

// Update the badge on the Offers button in the Transfers screen
export async function _updateOffersBadge() {
  const save  = await getSave();
  const count = (save.inboundOffers ?? []).filter(o => o.status === 'pending').length;
  const badge = document.getElementById('tt-offers-badge');
  const btn   = document.getElementById('tt-offers');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
  if (btn) {
    btn.style.borderColor = count > 0 ? 'var(--acc2)' : 'var(--bdr)';
  }
}

// Keep old name as alias so nothing breaks if referenced elsewhere
export async function renderOffers() { await showOffersModal(); }


// renderCups is now merged into renderTrophies (Trophies screen).
// Kept as a named function so any validator/reference checks still resolve.
export async function renderCups() { await renderTrophies(); }

