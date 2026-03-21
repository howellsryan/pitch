// ── ACADEMY SCREEN — Youth intake + promote/release

async function renderAcademy() {
  const save = await getSave();
  const team = await getTeam(save.userTeamId);
  const el   = document.getElementById('academy-content');
  if (!el) return;

  const cohort  = save.youthCohort ?? [];
  const info    = getAcademyInfo(team?.reputation ?? 70);
  const stars   = '★'.repeat(info.stars) + '☆'.repeat(5 - info.stars);

  // ── Header ─────────────────────────────────────────────────
  const hdrEl = document.getElementById('academy-hdr');
  if (hdrEl) {
    hdrEl.innerHTML = `
      <div style="text-align:right">
        <div style="color:var(--acc2);font-size:16px;letter-spacing:2px">${stars}</div>
        <div style="font-size:12px;font-weight:600;margin-top:1px">${info.label}</div>
      </div>`;
  }

  // ── Academy info panel (always shown) ──────────────────────
  const tierColor = { elite:'#f5c842', top:'#3b82f6', good:'#22c55e', average:'#f97316', poor:'#8a9ab0' }[info.tier];
  const intakeSize = { elite:'5–6', top:'4–5', good:'3–4', average:'3–4', poor:'2–3' }[info.tier];
  const wonderkidChance = { elite:'~4%', top:'~1%', good:'None', average:'None', poor:'None' }[info.tier];

  const infoPanel = `
    <div style="margin:0 16px 16px;background:var(--sur);border:1px solid var(--bdr);border-radius:14px;overflow:hidden">
      <div style="background:var(--sur2);padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:12px">
        <div style="font-size:28px">🏫</div>
        <div>
          <div style="font-family:var(--fd);font-size:22px;letter-spacing:1px;color:${tierColor}">${info.label}</div>
          <div style="font-size:12px;color:var(--tx2);margin-top:2px">${info.description}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0">
        <div style="padding:14px 16px;border-right:1px solid var(--bdr)">
          <div style="font-family:var(--fm);font-size:9px;color:var(--tx2);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Annual Intake</div>
          <div style="font-family:var(--fd);font-size:20px;color:var(--acc)">${intakeSize}</div>
          <div style="font-size:10px;color:var(--tx2)">players/season</div>
        </div>
        <div style="padding:14px 16px;border-right:1px solid var(--bdr)">
          <div style="font-family:var(--fm);font-size:9px;color:var(--tx2);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Wonderkid Odds</div>
          <div style="font-family:var(--fd);font-size:20px;color:${info.stars >= 4 ? 'var(--acc2)' : 'var(--txd)'}">${wonderkidChance}</div>
          <div style="font-size:10px;color:var(--tx2)">per intake</div>
        </div>
        <div style="padding:14px 16px">
          <div style="font-family:var(--fm);font-size:9px;color:var(--tx2);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">In Academy</div>
          <div style="font-family:var(--fd);font-size:20px;color:var(--tx)">${cohort.length}</div>
          <div style="font-size:10px;color:var(--tx2)">prospect${cohort.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>`;

  // ── Empty state ─────────────────────────────────────────────
  if (!cohort.length) {
    el.innerHTML = infoPanel + `
      <div style="margin:0 16px 16px;background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:32px 24px;text-align:center">
        <div style="font-size:32px;margin-bottom:10px">🗓️</div>
        <div style="font-weight:600;font-size:15px;margin-bottom:6px">First intake arriving end of season</div>
        <div style="color:var(--tx2);font-size:13px;line-height:1.7;max-width:340px;margin:0 auto">
          Your academy runs automatically in the background. At the end of every season, a new cohort of
          <strong style="color:var(--tx)">${intakeSize} youth players</strong> aged 15–18 will arrive.
          You can then promote them to your first team or release them.
        </div>
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:8px;align-items:center">
          <div style="font-family:var(--fm);font-size:10px;color:var(--tx2);letter-spacing:1px">HOW IT WORKS</div>
          ${[
            ['🌱', 'Season ends → new youth cohort generated'],
            ['⭐', 'View each prospect\'s potential rating (1–5 stars)'],
            ['↑',  'Promote to first team when ready (age 16–19)'],
            ['🚪', 'Release prospects you don\'t want to keep'],
            ['⚠️', 'Players aged 20+ are automatically released'],
          ].map(([icon, text]) => `
            <div style="display:flex;align-items:center;gap:10px;font-size:12px;color:var(--tx2);max-width:300px;text-align:left">
              <span style="font-size:16px;min-width:24px;text-align:center">${icon}</span>
              <span>${text}</span>
            </div>`).join('')}
        </div>
      </div>`;
    return;
  }

  // ── Prospect list ───────────────────────────────────────────
  const sorted = [...cohort].sort((a, b) => {
    if (b.isWonderkid !== a.isWonderkid) return b.isWonderkid ? 1 : -1;
    return b.potentialRating - a.potentialRating;
  });

  const lastWarning = cohort.filter(p => p.age >= 19).length;

  el.innerHTML = infoPanel + `
    <div style="padding:0 16px 16px">
      ${lastWarning > 0 ? `
        <div style="background:rgba(232,72,85,.1);border:1px solid rgba(232,72,85,.3);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--acc3);display:flex;align-items:center;gap:8px">
          <span>⚠️</span>
          <span><strong>${lastWarning} player${lastWarning > 1 ? 's' : ''}</strong> will be released at season end — promote or lose them</span>
        </div>` : ''}
      <div style="font-family:var(--fm);font-size:10px;color:var(--tx2);margin-bottom:10px;letter-spacing:1px">
        PROSPECTS · SEASON ${save.season} · ${cohort.length} PLAYERS
      </div>
      <div class="academy-list">
        ${sorted.map(p => buildYouthCard(p)).join('')}
      </div>
    </div>`;

  // Wire buttons
  el.querySelectorAll('[data-youth-action]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      handleYouthAction(btn.dataset.youthAction, btn.dataset.pid, cohort);
    };
  });
}

function buildYouthCard(p) {
  const stars    = getPotentialStars(p);
  const potLabel = getPotentialLabel(p);
  const potColor = ['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][stars] ?? '#8a9ab0';
  const posG     = posGroup(p.position);
  const primary  = primaryRating(p);

  const ageWarning = p.age >= 19
    ? `<span style="color:var(--acc3);font-size:10px;font-family:var(--fm)">⚠ Last season</span>`
    : '';

  const wonderkidBadge = p.isWonderkid
    ? `<span style="background:linear-gradient(135deg,#f5c842,#f97316);color:#000;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:1px;font-family:var(--fm)">WONDERKID</span>`
    : '';

  // Attribute bars (compact, 3 shown)
  const bars = p.position === 'GK'
    ? `${attrBar('GK', p.goalkeeping, true)}${attrBar('DEF', p.defence, false)}`
    : `${attrBar('ATK', p.attack, posG==='ATT')}${attrBar('MID', p.midfield, posG==='MID')}${attrBar('DEF', p.defence, posG==='DEF')}`;

  return `
    <div class="academy-card ${p.isWonderkid ? 'academy-card-wk' : ''}">
      <div class="academy-card-left">
        <div style="font-size:22px;font-family:var(--fm);font-weight:700;color:var(--tx)">${primary}</div>
        <div class="pos ${posG}" style="font-size:10px;margin-top:3px">${p.position}</div>
      </div>
      <div class="academy-card-mid">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">
          <span style="font-weight:600;font-size:14px">${p.name}</span>
          ${wonderkidBadge}
          ${ageWarning}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-size:11px;color:var(--tx2)">Age ${p.age}</span>
          <span style="color:${potColor};font-size:11px;font-family:var(--fm)" title="Potential: ${potLabel}">
            ${'★'.repeat(stars)}${'☆'.repeat(5-stars)} ${potLabel}
          </span>
          <span style="font-size:11px;color:var(--tx2)">📅 ${p.season}</span>
        </div>
        <div class="sq-card-bars" style="max-width:200px">${bars}</div>
      </div>
      <div class="academy-card-right">
        <div style="font-family:var(--fm);font-size:11px;color:var(--acc2);margin-bottom:6px">${fmt.money(p.value)}</div>
        <button class="btn-s" style="font-size:11px;padding:5px 10px;margin-bottom:5px;width:100%"
          data-youth-action="promote" data-pid="${p.id}">
          ↑ Promote
        </button>
        <button class="btn-d" style="font-size:10px;padding:4px 8px;width:100%;opacity:0.7"
          data-youth-action="release" data-pid="${p.id}">
          Release
        </button>
      </div>
    </div>`;
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
