// ── ACADEMY SCREEN — compact tabular layout

async function renderAcademy() {
  const save = await getSave();
  const team = await getTeam(save.userTeamId);
  const el   = document.getElementById('academy-content');
  if (!el) return;

  const cohort = save.youthCohort ?? [];
  const info   = getAcademyInfo(team?.reputation ?? 70);
  const stars  = '★'.repeat(info.stars) + '☆'.repeat(5 - info.stars);

  const hdrEl = document.getElementById('academy-hdr');
  if (hdrEl) {
    hdrEl.innerHTML = `
      <div style="text-align:right">
        <div style="color:var(--acc2);font-size:16px;letter-spacing:2px">${stars}</div>
        <div style="font-size:12px;font-weight:600;margin-top:1px">${info.label}</div>
      </div>`;
  }

  const tierColor = { elite:'#f5c842', top:'#3b82f6', good:'#22c55e', average:'#f97316', poor:'#8a9ab0' }[info.tier];
  const intakeSize = '10';
  const wonderkidChance = { elite:'25%', top:'10%', good:'5%', average:'1%', poor:'1%' }[info.tier];

  const infoBar = `
    <div class="academy-info-bar">
      <div class="academy-info-brand">
        <div style="font-size:22px">🏫</div>
        <div>
          <div style="font-family:var(--fd);font-size:17px;letter-spacing:.5px;color:${tierColor}">${info.label}</div>
          <div style="font-size:9px;color:var(--tx2);font-family:var(--fm);letter-spacing:1px">${stars}</div>
        </div>
      </div>
      <div class="academy-info-desc">${info.description}</div>
      <div class="academy-info-stat">
        <div class="academy-info-stat-lbl">Intake</div>
        <div class="academy-info-stat-val" style="color:var(--acc)">${intakeSize}</div>
      </div>
      <div class="academy-info-stat">
        <div class="academy-info-stat-lbl">Wonderkid</div>
        <div class="academy-info-stat-val" style="color:${info.stars >= 3 ? 'var(--acc2)' : 'var(--txd)'}">${wonderkidChance}</div>
      </div>
      <div class="academy-info-stat">
        <div class="academy-info-stat-lbl">In Academy</div>
        <div class="academy-info-stat-val">${cohort.length}</div>
      </div>
    </div>`;

  if (!cohort.length) {
    el.innerHTML = `<div class="academy-layout">
      ${infoBar}
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--tx2)">
        <div style="font-size:36px">🗓️</div>
        <div style="font-family:var(--fd);font-size:20px;letter-spacing:1px;color:var(--tx)">First intake arriving end of season</div>
        <div style="font-size:12px;max-width:420px;text-align:center;line-height:1.7">
          Your academy runs automatically. At the end of every season, a new cohort of
          <strong style="color:var(--tx)">10 youth players</strong> aged 15–18 will arrive for you to promote or release.
        </div>
      </div>
    </div>`;
    return;
  }

  const sorted = [...cohort].sort((a, b) => {
    if (b.isWonderkid !== a.isWonderkid) return b.isWonderkid ? 1 : -1;
    return b.potentialRating - a.potentialRating;
  });

  const lastWarning = cohort.filter(p => p.age >= 19).length;

  const tableRows = sorted.map(p => {
    const stars    = getPotentialStars(p);
    const potLabel = getPotentialLabel(p);
    const potColor = ['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][stars] ?? '#8a9ab0';
    const posG     = posGroup(p.position);
    const primary  = primaryRating(p);
    const fit      = Math.round(p.fitness ?? 100);
    const fitCol   = fit >= 75 ? 'var(--acc)' : fit >= 50 ? 'var(--acc2)' : 'var(--acc3)';
    const wkBadge  = p.isWonderkid
      ? `<span style="background:linear-gradient(135deg,#f5c842,#f97316);color:#000;font-size:7px;font-weight:700;padding:1px 4px;border-radius:3px;letter-spacing:.5px;font-family:var(--fm)">WK</span>`
      : '';
    const ageWarn  = p.age >= 19 ? `<span style="color:var(--acc3);font-size:9px">⚠</span>` : '';
    const potStars = '★'.repeat(stars) + '☆'.repeat(5 - stars);

    return `<div class="academy-row ${p.isWonderkid ? 'academy-row-wk' : ''} ${p.age >= 19 ? 'academy-row-warn' : ''}" data-pid="${p.id}">
      <div style="font-family:var(--fd);font-size:15px;color:var(--acc2);text-align:center">${primary}</div>
      <div><span class="pos ${posG}" style="font-size:9px">${p.position}</span></div>
      <div style="display:flex;align-items:center;gap:5px;min-width:0">
        <span style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</span>
        ${wkBadge}${ageWarn}
      </div>
      <div style="font-size:11px;color:var(--tx2);text-align:center">Age ${p.age}</div>
      <div style="color:${potColor};font-size:10px;font-family:var(--fm);white-space:nowrap" title="${potLabel}">${potStars}</div>
      <div style="font-family:var(--fm);font-size:10px;color:var(--acc2)">${fmt.money(p.value)}</div>
      <div class="academy-row-btns">
        <button class="sq-btn-sm sq-btn-in" style="padding:3px 8px;font-size:10px"
          data-youth-action="promote" data-pid="${p.id}">↑ Promote</button>
      </div>
      <div class="academy-row-btns">
        <button class="sq-btn-sm sq-btn-unlist" style="padding:3px 8px;font-size:10px;opacity:.7"
          data-youth-action="release" data-pid="${p.id}">Release</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="academy-layout">
    ${infoBar}
    ${lastWarning > 0 ? `
      <div class="academy-warning">
        <span>⚠️</span>
        <span><strong>${lastWarning} player${lastWarning > 1 ? 's' : ''}</strong> will be released at season end — promote or lose them</span>
      </div>` : ''}
    <div class="academy-table-hdr">
      <div>RTG</div><div>POS</div><div>NAME</div><div>AGE</div>
      <div>POTENTIAL</div><div>VALUE</div><div></div><div></div>
    </div>
    <div class="academy-rows">${tableRows}</div>
  </div>`;

  el.querySelectorAll('[data-youth-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleYouthAction(btn.dataset.youthAction, btn.dataset.pid, cohort);
    };
  });
}

async function handleYouthAction(action, playerId, cohort) {
  if (action === 'promote') {
    const p = cohort.find(y => y.id === playerId);
    if (!p) return;
    showModal(
      `Promote ${p.name}?`,
      `<div style="color:var(--tx2);line-height:1.8;font-size:14px">
        <div><strong style="color:var(--tx)">${p.name}</strong> · Age ${p.age} · ${p.position}</div>
        <div>Value: <strong style="color:var(--acc2)">${fmt.money(p.value)}</strong></div>
        <div>Potential: <strong style="color:var(--acc)">${getPotentialLabel(p)}</strong> ${getPotentialStars(p) >= 4 ? '⭐' : ''}</div>
        <div style="margin-top:8px;color:var(--tx2);font-size:12px">Promoting adds them to your first team squad. Their wage will be <strong>${fmt.wage(Math.max(1000, Math.round(p.value * 0.05 / 52)))}</strong>/week.</div>
      </div>`,
      [
        { id: 'confirm-promote', label: 'Promote to First Team', cls: 'btn-s', handler: async () => {
          try {
            await promoteYouthPlayer(playerId);
            toast(`${p.name} promoted to first team! 🎉`, 'success');
            if(typeof newsYouthPromotion==='function'){const _sv=await getSave();newsYouthPromotion(p,_sv).catch(()=>{});}
            await navigateTo('academy');
          } catch (err) {
            toast(err.message, 'error');
          }
        }},
        { id: 'cancel-promote', label: 'Cancel', cls: 'btn-s' },
      ]
    );
  } else if (action === 'release') {
    const p = cohort.find(y => y.id === playerId);
    if (!p) return;
    showModal(
      `Release ${p.name}?`,
      `<div style="color:var(--tx2);line-height:1.8;font-size:14px">
        <div>Release <strong style="color:var(--tx)">${p.name}</strong> from the academy?</div>
        <div style="margin-top:6px;color:var(--acc3);font-size:12px">This cannot be undone. They will leave the club permanently.</div>
      </div>`,
      [
        { id: 'confirm-release', label: 'Release Player', cls: 'btn-d', handler: async () => {
          await releaseYouthPlayer(playerId);
          toast(`${p.name} has been released.`, 'info');
          await navigateTo('academy');
        }},
        { id: 'cancel-release', label: 'Keep', cls: 'btn-s' },
      ]
    );
  }
}

