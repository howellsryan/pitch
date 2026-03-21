// ══════════════════════════════════════════════════════════════
// SQUAD SCREEN — clean card-based layout with transfer listing
// ══════════════════════════════════════════════════════════════
async function renderSquad() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);
  const team    = await getTeam(save.userTeamId);
  const el      = document.getElementById('sq-list');
  if (!el) return;

  const hdrEl = document.getElementById('sq-hdr');
  if (hdrEl && team) hdrEl.innerHTML = `
    <div style="text-align:right">
      <div style="font-family:var(--fd);font-size:16px;letter-spacing:1px">${team.name}</div>
      <div style="font-size:11px;color:var(--tx2)">${players.length} players registered</div>
    </div>`;

  const groups = {
    'GK': players.filter(p => p.position === 'GK'),
    'DEF': players.filter(p => ['CB','RB','LB'].includes(p.position)),
    'MID': players.filter(p => ['CM','CDM','CAM','RM','LM'].includes(p.position)),
    'FWD': players.filter(p => ['ST','CF','RW','LW'].includes(p.position)),
  };
  const groupNames = { GK:'Goalkeepers', DEF:'Defenders', MID:'Midfielders', FWD:'Forwards' };

  el.innerHTML = Object.entries(groups).filter(([,g]) => g.length > 0).map(([key, grp]) => {
    const sorted = [...grp].sort((a,b) => primaryRating(b) - primaryRating(a));
    return `<div class="sq-group">
      <div class="sq-group-hdr">
        <span>${groupNames[key]}</span>
        <span style="font-size:11px;font-family:var(--fm);color:var(--tx2)">${grp.length} players</span>
      </div>
      <div class="sq-cards">
        ${sorted.map(p => buildPlayerCard(p, save)).join('')}
      </div>
    </div>`;
  }).join('');

  // Wire all action buttons
  el.querySelectorAll('[data-sq-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleSquadAction(btn.dataset.sqAction, btn.dataset.pid, players, save);
    };
  });
}

function buildPlayerCard(p, save) {
  const g        = posGroup(p.position);
  const r        = primaryRating(p);
  const fl       = formLabel(p);
  const fitness  = Math.round(p.fitness ?? 90);
  const fitColor = fitness >= 75 ? 'var(--acc)' : fitness >= 50 ? 'var(--acc2)' : 'var(--acc3)';
  const fav      = formAdjustedValue ? formAdjustedValue(p) : p.value;
  const isListed = p.transferListed === true;
  const potStars = getPotentialStars ? getPotentialStars(p) : 0;
  const potLabel = getPotentialLabel ? getPotentialLabel(p) : '';
  const potDisp  = potStars ? '★'.repeat(potStars) + '☆'.repeat(5 - potStars) : '';
  const potColor = ['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars] ?? '#8a9ab0';

  return `<div class="sq-card ${p.injured ? 'sq-card-inj' : ''} ${isListed ? 'sq-card-listed' : ''}">
    <div class="sq-card-left">
      <div class="sq-card-rat">${r}</div>
      <div class="sq-card-pos pos ${g}">${p.position}</div>
    </div>
    <div class="sq-card-mid">
      <div class="sq-card-name">
        ${p.injured ? '🤕 ' : ''}${p.name}
        ${p.injured ? '<span class="inj-badge">INJ</span>' : ''}
        ${isListed ? '<span class="listed-badge">LISTED</span>' : ''}
      </div>
      <div class="sq-card-meta">
        <span>Age ${p.age}</span>
        <span class="fb ${fl.cls}">${fl.text}</span>
        ${potDisp ? `<span style="color:${potColor};font-size:10px" title="${potLabel}">${potDisp}</span>` : ''}
        ${p.goals > 0    ? `<span>⚽ ${p.goals}</span>` : ''}
        ${p.assists > 0  ? `<span>🎯 ${p.assists}</span>` : ''}
        ${p.cleanSheets > 0 ? `<span>🧤 ${p.cleanSheets}</span>` : ''}
      </div>
      <div class="sq-card-bars">
        ${p.position === 'GK'
          ? `${attrBar('GK', p.goalkeeping, true)}${attrBar('ATK', p.attack, false)}`
          : `${attrBar('ATK', p.attack, g==='ATT')}${attrBar('MID', p.midfield, g==='MID')}${attrBar('DEF', p.defence, g==='DEF')}`
        }
      </div>
    </div>
    <div class="sq-card-right">
      <div class="sq-card-val">${fmt.money(fav)}</div>
      <div class="sq-card-wage">${fmt.wage(p.wage)}</div>
      <div class="sq-card-fit" style="color:${fitColor}">🏃 ${fitness}%</div>
      <div class="sq-card-btns">
        <button class="sq-btn-sm ${p.inSquad !== false ? 'sq-btn-in' : 'sq-btn-out'}"
          data-sq-action="${p.inSquad !== false ? 'exclude' : 'include'}"
          data-pid="${p.id}">
          ${p.inSquad !== false ? 'Active' : 'Excluded'}
        </button>
        <button class="sq-btn-sm ${isListed ? 'sq-btn-unlist' : 'sq-btn-list'}"
          data-sq-action="${isListed ? 'unlist' : 'list'}"
          data-pid="${p.id}">
          ${isListed ? 'Unlist' : 'List'}
        </button>
      </div>
    </div>
  </div>`;
}

function attrBar(label, val, isPrimary) {
  const pct = Math.round((val / 99) * 100);
  const color = isPrimary
    ? 'linear-gradient(90deg,var(--acc),#7fff9a)'
    : 'linear-gradient(90deg,var(--sur3),var(--tx2))';
  return `<div class="sq-bar-row">
    <span class="sq-bar-lbl">${label}</span>
    <div class="sq-bar-w"><div class="sq-bar" style="width:${pct}%;background:${color}"></div></div>
    <span class="sq-bar-v" style="${isPrimary ? 'color:var(--acc)' : ''}">${val}</span>
  </div>`;
}

async function handleSquadAction(action, playerId, players, save) {
  const pl = players.find(p => p.id === playerId);
  if (!pl) return;

  switch (action) {
    case 'include':
      await putPlayer({ ...pl, inSquad: true });
      toast(`${pl.name} added to squad`, 'success', 2000);
      break;
    case 'exclude':
      await putPlayer({ ...pl, inSquad: false });
      toast(`${pl.name} excluded from squad`, 'info', 2000);
      break;
    case 'list':
      await putPlayer({ ...pl, transferListed: true });
      toast(`${pl.name} listed for transfer — AI clubs will now bid`, 'success', 3000);
      break;
    case 'unlist':
      await putPlayer({ ...pl, transferListed: false });
      toast(`${pl.name} removed from transfer list`, 'info', 2000);
      break;
  }
  await renderSquad();
}

// ══════════════════════════════════════════════════════════════
// TACTICS SCREEN — click slot → player picker swap
// ══════════════════════════════════════════════════════════════
async function renderTactics() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);
  const el      = document.getElementById('screen-tactics');
  if (!el) return;

  const currentFormation = save.formation ?? '4-3-3';
  const savedLineup      = save.lineup ?? [];

  // Formation visual slot positions (x/y as % of pitch)
  const SLOT_LAYOUT = {
    '4-3-3':   [{p:'GK',x:50,y:88},{p:'RB',x:82,y:70},{p:'CB',x:61,y:70},{p:'CB',x:39,y:70},{p:'LB',x:18,y:70},{p:'CM',x:73,y:50},{p:'CDM',x:50,y:50},{p:'CM',x:27,y:50},{p:'RW',x:80,y:26},{p:'ST',x:50,y:20},{p:'LW',x:20,y:26}],
    '4-2-3-1': [{p:'GK',x:50,y:88},{p:'RB',x:82,y:70},{p:'CB',x:61,y:70},{p:'CB',x:39,y:70},{p:'LB',x:18,y:70},{p:'CDM',x:63,y:56},{p:'CDM',x:37,y:56},{p:'RW',x:80,y:36},{p:'CAM',x:50,y:36},{p:'LW',x:20,y:36},{p:'ST',x:50,y:18}],
    '4-4-2':   [{p:'GK',x:50,y:88},{p:'RB',x:82,y:70},{p:'CB',x:61,y:70},{p:'CB',x:39,y:70},{p:'LB',x:18,y:70},{p:'RM',x:82,y:50},{p:'CM',x:61,y:50},{p:'CM',x:39,y:50},{p:'LM',x:18,y:50},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '3-5-2':   [{p:'GK',x:50,y:88},{p:'CB',x:70,y:72},{p:'CB',x:50,y:72},{p:'CB',x:30,y:72},{p:'RM',x:88,y:50},{p:'CM',x:67,y:50},{p:'CDM',x:50,y:50},{p:'CM',x:33,y:50},{p:'LM',x:12,y:50},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '3-4-3':   [{p:'GK',x:50,y:88},{p:'CB',x:70,y:72},{p:'CB',x:50,y:72},{p:'CB',x:30,y:72},{p:'RM',x:85,y:52},{p:'CM',x:62,y:52},{p:'CM',x:38,y:52},{p:'LM',x:15,y:52},{p:'RW',x:78,y:26},{p:'ST',x:50,y:20},{p:'LW',x:22,y:26}],
    '4-5-1':   [{p:'GK',x:50,y:88},{p:'RB',x:82,y:70},{p:'CB',x:61,y:70},{p:'CB',x:39,y:70},{p:'LB',x:18,y:70},{p:'RM',x:82,y:50},{p:'CM',x:66,y:50},{p:'CM',x:50,y:50},{p:'CM',x:34,y:50},{p:'LM',x:18,y:50},{p:'ST',x:50,y:20}],
    '5-3-2':   [{p:'GK',x:50,y:88},{p:'RB',x:88,y:70},{p:'CB',x:70,y:72},{p:'CB',x:50,y:72},{p:'CB',x:30,y:72},{p:'LB',x:12,y:70},{p:'CM',x:68,y:50},{p:'CDM',x:50,y:50},{p:'CM',x:32,y:50},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
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

  el.innerHTML = `
  <div class="scroll-pad">
    <div class="ph"><div class="ph-left"><div class="pl">Team Sheet</div><div class="pt">Tactics</div></div></div>
    <div class="tactics-layout">

      <div class="tactics-left">
        <div class="tac-section">
          <div class="tac-section-title">Formation</div>
          <div class="formation-pills">
            ${Object.keys(FORMATIONS).map(f => `<button class="form-pill ${f===currentFormation?'active':''}" data-fm="${f}">${f}</button>`).join('')}
          </div>
        </div>

        <div class="pitch-wrap">
          <div class="pitch-bg" id="tac-pitch">
            <div class="pitch-line half"></div>
            <div class="pitch-circle"></div>
            <div class="pitch-box top"></div>
            <div class="pitch-box bot"></div>
            ${slots.map((slot, i) => {
              const pl = assignment[i];
              const g  = pl ? posGroup(pl.position) : posGroup(slot.p);
              return `<div class="pitch-slot" style="left:${slot.x}%;top:${slot.y}%" data-slot="${i}">
                <div class="slot-inner ${pl ? `pos-${g}` : 'pos-empty'}" title="${pl?.name ?? slot.p}">
                  ${pl
                    ? `<div class="slot-name">${pl.name.split(' ').slice(-1)[0]}</div><div class="slot-pos">${pl.position}</div>`
                    : `<div class="slot-pos slot-empty-lbl">${slot.p}</div>`
                  }
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="tac-actions">
          <button class="btn btn-p" id="btn-save-lineup">💾 Save Lineup</button>
          <button class="btn btn-s" id="btn-auto-lineup">🔄 Auto Pick</button>
        </div>
      </div>

      <div class="tactics-right">
        <div class="tac-section-title" style="padding:14px 16px 0">Squad</div>
        <div class="tac-player-list" id="tac-player-list">
          ${players.sort((a,b) => primaryRating(b)-primaryRating(a)).map(p => {
            const g       = posGroup(p.position);
            const r       = primaryRating(p);
            const inXI    = assignment.some(ap => ap?.id === p.id);
            const slotIdx = assignment.findIndex(ap => ap?.id === p.id);
            const fit     = Math.round(p.fitness ?? 90);
            const fitCol  = fit >= 75 ? 'var(--acc)' : fit >= 50 ? 'var(--acc2)' : 'var(--acc3)';
            return `<div class="tac-pl-row ${inXI ? 'in-lineup' : ''} ${p.injured ? 'injured' : ''}"
              data-pid="${p.id}" data-slot="${slotIdx}" title="${p.injured ? 'Injured' : ''}">
              <span class="pos ${g}">${p.position}</span>
              <span class="tac-pl-name">${p.name}</span>
              <span style="font-size:10px;color:${fitCol};font-family:var(--fm)">${fit}%</span>
              <span class="tac-pl-rat">${r}</span>
              ${p.injured ? '<span class="inj-badge">INJ</span>' : ''}
              ${inXI ? '<span style="font-size:9px;color:var(--acc);font-family:var(--fm)">XI</span>' : ''}
            </div>`;
          }).join('')}
        </div>
      </div>

    </div>
    <!-- Player swap modal container -->
    <div id="tac-swap-modal" style="display:none"></div>
  </div>`;

  // ── Formation switcher ────────────────────────────────────
  el.querySelectorAll('.form-pill').forEach(btn => {
    btn.onclick = async () => {
      const sv = await getSave();
      await putSave({ ...sv, formation: btn.dataset.fm, lineup: null });
      await renderTactics();
    };
  });

  // ── Save lineup ───────────────────────────────────────────
  el.querySelector('#btn-save-lineup')?.addEventListener('click', async () => {
    const lineup = assignment.filter(Boolean).map(p => p.id);
    const sv     = await getSave();
    await putSave({ ...sv, lineup, formation: currentFormation });
    toast('Lineup saved! ✅', 'success', 2500);
  });

  // ── Auto pick ─────────────────────────────────────────────
  el.querySelector('#btn-auto-lineup')?.addEventListener('click', async () => {
    const sv = await getSave();
    await putSave({ ...sv, lineup: null });
    await renderTactics();
    toast('Auto lineup selected', 'info', 2000);
  });

  // ── Click a pitch slot → open swap picker ─────────────────
  el.querySelectorAll('.pitch-slot').forEach(slot => {
    slot.onclick = () => {
      const idx = parseInt(slot.dataset.slot);
      const cur = assignment[idx];
      openSwapPicker(idx, cur, players, assignment, slots, currentFormation, save);
    };
  });

  // ── Click a squad player → offer to swap into XI ──────────
  el.querySelectorAll('#tac-player-list .tac-pl-row').forEach(row => {
    row.onclick = () => {
      if (row.classList.contains('injured')) return;
      const pid     = row.dataset.pid;
      const clickedPlayer = players.find(p => p.id === pid);
      if (!clickedPlayer) return;
      const inXI    = assignment.some(a => a?.id === pid);
      if (inXI) {
        // Already in XI — click slot instead (find their slot)
        const idx = assignment.findIndex(a => a?.id === pid);
        if (idx >= 0) openSwapPicker(idx, clickedPlayer, players, assignment, slots, currentFormation, save);
      } else {
        // Not in XI — open picker for the most appropriate slot
        const g       = posGroup(clickedPlayer.position);
        const posMap2 = { GK:['GK'], ATT:['ST','CF','RW','LW','CAM'], MID:['CM','CDM','CAM','RM','LM'], DEF:['CB','RB','LB'] };
        const slotPos = posMap2[g] ?? [];
        const idx     = slots.findIndex((s,i) => slotPos.includes(s.p) && assignment[i]?.id !== clickedPlayer.id);
        if (idx >= 0) openSwapPicker(idx, assignment[idx], players, assignment, slots, currentFormation, save, clickedPlayer);
        else openSwapPicker(0, assignment[0], players, assignment, slots, currentFormation, save, clickedPlayer);
      }
    };
  });
}

function openSwapPicker(slotIdx, currentPlayer, players, assignment, slots, formation, save, preSelected) {
  const slot     = slots[slotIdx];
  const posMap   = { GK:['GK'], RB:['RB','LB'], LB:['LB','RB'], CB:['CB'], RM:['RM','CM','CAM'], LM:['LM','CM','CAM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM','RW','LW'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW','CAM'] };
  const acceptable = posMap[slot.p] ?? [slot.p];

  // Candidates: not injured, not the current player in this slot, sorted by suitability + rating
  const candidates = players
    .filter(p => !p.injured)
    .sort((a,b) => {
      const aFit = acceptable.includes(a.position) ? 1 : 0;
      const bFit = acceptable.includes(b.position) ? 1 : 0;
      if (bFit !== aFit) return bFit - aFit;
      return primaryRating(b) - primaryRating(a);
    });

  const rows = candidates.map(p => {
    const g       = posGroup(p.position);
    const r       = primaryRating(p);
    const inXI    = assignment.some((ap,i) => ap?.id === p.id && i !== slotIdx);
    const isRight = acceptable.includes(p.position);
    const isCurrent = currentPlayer?.id === p.id;
    return `<div class="swap-row ${isCurrent?'swap-current':''} ${preSelected?.id===p.id?'swap-presel':''}" data-pid="${p.id}">
      <span class="pos ${g}" style="${!isRight?'opacity:.55':''}">${p.position}</span>
      <span style="flex:1;font-size:13px;font-weight:${isRight?600:400};${!isRight?'color:var(--tx2)':''}">${p.name}</span>
      <span style="font-size:10px;color:var(--tx2);margin-right:6px">${inXI?'<span style="color:var(--acc2)">XI</span>':''}</span>
      <span style="font-family:var(--fm);font-size:13px;color:var(--acc2)">${r}</span>
    </div>`;
  }).join('');

  showModal(
    `${slot.p} — Select Player`,
    `<div style="margin-bottom:8px;font-size:11px;color:var(--tx2)">
      Current: <strong>${currentPlayer?.name ?? 'Empty'}</strong> · Slot: ${slot.p}
    </div>
    <div style="display:flex;flex-direction:column;gap:2px;max-height:52vh;overflow-y:auto">
      ${rows}
    </div>`,
    []
  );

  // Wire clicks inside modal
  setTimeout(() => {
    document.querySelectorAll('.swap-row').forEach(row => {
      row.onclick = async () => {
        const newPlayer = candidates.find(p => p.id === row.dataset.pid);
        if (!newPlayer) return;

        // Close modal
        document.getElementById('modal-bd')?.remove();

        // If new player is in another slot, swap
        const otherSlotIdx = assignment.findIndex((ap,i) => ap?.id === newPlayer.id && i !== slotIdx);
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
  }, 50);
}

// ══════════════════════════════════════════════════════════════
// TRANSFER OFFERS SCREEN
// ══════════════════════════════════════════════════════════════
async function renderOffers() {
  const save    = await getSave();
  const players = await getPlayersByTeam(save.userTeamId);
  const el      = document.getElementById('screen-offers');
  if (!el) return;

  const offers  = (save.inboundOffers ?? []).filter(o => o.status === 'pending');
  const byId    = new Map(players.map(p => [p.id, p]));
  const listed  = players.filter(p => p.transferListed);

  el.innerHTML = `
  <div class="scroll-pad">
    <div class="ph"><div class="ph-left"><div class="pl">Transfer Inbox</div><div class="pt">Offers</div></div></div>
    <div style="padding:14px 20px 20px;display:grid;grid-template-columns:1fr 300px;gap:14px">

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
          const isUnder  = offer.fee < fav;
          return `<div class="offer-card-v2">
            <div class="offer-card-top">
              <div class="offer-player-info">
                <div class="pl-av">${flagEmoji(pl.name)}</div>
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
              <button class="btn btn-p" data-accept="${pl.id}">✅ Accept ${fmt.money(offer.fee)}</button>
              <button class="btn btn-s" data-counter="${pl.id}" data-ask="${Math.round(fav * (isListed ? 1.0 : 1.1))}">
                💬 Counter ${fmt.money(Math.round(fav * (isListed ? 1.0 : 1.1)))}
              </button>
              <button class="btn btn-d" data-reject="${pl.id}">✕ Reject</button>
            </div>
          </div>`;
        }).join('') : `<div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:40px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">📭</div>
          <div style="font-family:var(--fd);font-size:20px;letter-spacing:1px;margin-bottom:6px">No Pending Offers</div>
          <div style="font-size:12px;color:var(--tx2)">AI clubs bid each gameweek. List players to attract more offers.</div>
        </div>`}
      </div>

      <div>
        <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px;margin-bottom:12px">
          <div style="font-family:var(--fd);font-size:16px;letter-spacing:1px;margin-bottom:4px">Transfer Listed</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:12px">${listed.length} player${listed.length!==1?'s':''} available</div>
          ${listed.length ? listed.map(p => {
            const g = posGroup(p.position);
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bdr)">
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

    </div>
  </div>`;

  // ── Button handlers ───────────────────────────────────────
  el.querySelectorAll('[data-accept]').forEach(btn => {
    btn.onclick = async () => {
      try {
        // Optimistically remove the offer card immediately
        btn.closest('.offer-card-v2')?.remove();
        const { fee, buyerName } = await acceptOffer(btn.dataset.accept);
        toast(`✅ Sold for ${fmt.money(fee)} to ${buyerName}!`, 'success', 5000);
        await renderOffers();
        await renderHome();
      } catch(e) { toast(`❌ ${e.message}`, 'error', 4000); }
    };
  });
  el.querySelectorAll('[data-reject]').forEach(btn => {
    btn.onclick = async () => {
      btn.closest('.offer-card-v2')?.remove();
      await rejectOffer(btn.dataset.reject);
      toast('Offer rejected', 'info', 2000);
      await renderOffers();
    };
  });
  el.querySelectorAll('[data-counter]').forEach(btn => {
    btn.onclick = async () => {
      const ask = parseInt(btn.dataset.ask);
      await counterOffer(btn.dataset.counter, ask);
      toast(`Counter of ${fmt.money(ask)} sent!`, 'info', 3000);
      await renderOffers();
    };
  });
}

// ══════════════════════════════════════════════════════════════
// UCL SCREEN: override renderCups to show league phase table
// ══════════════════════════════════════════════════════════════
async function renderCups() {
  const save = await getSave();
  const el   = document.getElementById('cups-grid');
  if (!el) return;

  const cups   = save.cups ?? {};
  const cupIds = Object.keys(cups);

  if (!cupIds.length) {
    el.innerHTML = `<div class="no-data" style="grid-column:1/-1;padding:40px">No cup competitions. Start a new game to get cups.</div>`;
    return;
  }

  el.innerHTML = cupIds.map(cupId => {
    const meta  = CUP_META[cupId];
    if (!meta) return '';
    const state = cups[cupId];
    const badgeCls = state.status==='winner'?'won':state.status==='eliminated'?'out':'active';
    const badgeTxt = state.status==='winner'?'WON 🏆':state.status==='eliminated'?'OUT':'ACTIVE';

    let progressSection = '';
    let resultsSection  = '';

    // UCL league phase display
    if (cupId === 'ucl' && meta.isGroupStage && !state.leaguePhaseComplete) {
      const lp  = state.leaguePhase ?? {};
      const md  = lp.matchday ?? 0;
      const pts = lp.points  ?? 0;
      progressSection = `
        <div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--tx2);font-family:var(--fm);letter-spacing:1px;margin-bottom:4px">LEAGUE PHASE</div>
          <div style="display:flex;justify-content:space-between;font-size:13px">
            <span>MD ${md}/8</span>
            <span style="font-family:var(--fm);color:var(--acc2)"><strong>${pts}</strong> pts</span>
            <span style="color:var(--tx2);font-size:11px">GD: ${lp.gd >= 0 ? '+' : ''}${lp.gd ?? 0}</span>
          </div>
          <div class="cup-pw" style="margin-top:6px"><div class="cup-pb" style="width:${(md/8)*100}%;background:${meta.color}"></div></div>
          <div style="font-size:10px;color:var(--tx2);margin-top:4px">
            ${pts >= 12 ? '✅ On course to qualify directly' : pts >= 8 ? '🔶 Likely playoff spot' : md < 4 ? 'Season underway' : '⚠ Need points to qualify'}
          </div>
        </div>`;
    } else {
      const roundIdx  = state.roundIndex ?? 0;
      const roundName = state.status === 'winner' ? 'Trophy Won!' : state.status === 'eliminated' ? `Out (${meta.rounds[Math.max(0,roundIdx-1)]??'Early'})` : (meta.rounds[roundIdx] ?? 'Final');
      const progress  = Math.round((roundIdx / meta.rounds.length) * 100);
      progressSection = `
        <div class="cup-pw"><div class="cup-pb" style="width:${progress}%;background:${meta.color}"></div></div>
        <div class="cup-round">📍 ${roundName}</div>`;
    }

    const results = state.results ?? [];
    if (results.length) {
      resultsSection = `<div class="cup-results">
        ${results.slice(-4).map(r => {
          const isUCLMD = r.isUCLMatchday;
          const won = isUCLMD ? r.result === 'W' : r.userWon;
          const lbl = isUCLMD ? `MD${r.matchday}: ${r.result} vs ${r.opponentName} (${r.userGoals}-${r.oppGoals}) [${r.points} pts]`
                               : `${r.roundName}: ${won ? '✅' : '❌'} vs ${r.opponentName} (${r.userGoals}-${r.oppGoals})`;
          return `<div class="cup-res-row ${won?'won':'lost'}">${lbl}</div>`;
        }).join('')}
      </div>`;
    }

    return `<div class="cup-card cup-${cupId}">
      <div class="cup-bdg ${badgeCls}">${badgeTxt}</div>
      <div class="cup-icon">${meta.icon}</div>
      <div class="cup-name">${meta.name}</div>
      <div class="cup-desc">${meta.description}</div>
      ${progressSection}
      ${resultsSection}
    </div>`;
  }).join('');
}
