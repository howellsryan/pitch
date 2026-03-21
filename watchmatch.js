/** ui/watchmatch.js — Live match viewer. Uses _openInlinePanel for subs/tactics (NOT showModal). GK↔GK only. */

const WATCH_PHASES_PER_TICK = 1;       // 1 phase per tick = ~0.75 match-min
const WATCH_TICK_MS         = 750;     // ms at 1× → full game in ~90s real time
const TOTAL_PHASES          = 120;

let _watchState = null;

// ─── Entry point ──────────────────────────────────────────────
async function showWatchMatchModal(matchEvent, userTeam, oppTeam, userPlayers, oppPlayers, save, overrideFormation) {
  const userIsHome  = matchEvent.userIsHome ?? (matchEvent.type === 'league' ? true : Math.random() < 0.5);
  const homeTeam    = userIsHome ? userTeam : oppTeam;
  const awayTeam    = userIsHome ? oppTeam  : userTeam;
  const homePlayers = userIsHome ? userPlayers : oppPlayers;
  const awayPlayers = userIsHome ? oppPlayers  : userPlayers;
  const formation   = overrideFormation ?? save.formation ?? '4-3-3';
  const aiFormation = pickAIFormation();
  const userLineup  = save.lineup ?? null;
  const homeLineup  = userIsHome ? userLineup : null;
  const awayLineup  = userIsHome ? null : userLineup;

  const liveState = buildLiveMatchState(homeTeam, awayTeam, homePlayers, awayPlayers, formation, aiFormation, homeLineup, awayLineup);

  // GKs remain on bench but can only sub for the starting GK (enforced in _applyUserSub)

  _watchState = {
    liveState,
    allEvents: [],
    homeTeam, awayTeam, userTeam, oppTeam,
    userPlayers, oppPlayers,
    userIsHome, save, matchEvent,
    tickTimer: null,
    paused: false,
    currentPhase: 0,
    speedMultiplier: 1,
  };

  _renderWatchModal();
  _startTick();
}

// ─── Render ───────────────────────────────────────────────────
function _renderWatchModal() {
  const s = _watchState;
  const h = s.homeTeam, a = s.awayTeam;

  const html = `
  <div class="wm-wrap" id="wm-wrap">

    <!-- Scoreboard -->
    <div class="wm-scoreboard">
      <div class="wm-team-blk">
        <div class="wm-crest">${h.crest ?? '⚽'}</div>
        <div class="wm-tname">${h.name}</div>
        <div class="wm-venue-tag" style="color:${s.userIsHome?'var(--acc)':'var(--tx2)'}">HOME</div>
      </div>
      <div class="wm-centre">
        <div class="wm-score-box">
          <span class="wm-goals" id="wm-hgoals">0</span>
          <span class="wm-sep">–</span>
          <span class="wm-goals" id="wm-agoals">0</span>
        </div>
        <div class="wm-clock" id="wm-clock">0'</div>
        <div class="wm-status" id="wm-status">KICK OFF</div>
      </div>
      <div class="wm-team-blk">
        <div class="wm-crest">${a.crest ?? '⚽'}</div>
        <div class="wm-tname">${a.name}</div>
        <div class="wm-venue-tag" style="color:${!s.userIsHome?'var(--acc)':'var(--tx2)'}">AWAY</div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="wm-progress-wrap"><div class="wm-progress-bar" id="wm-progress-bar" style="width:0%"></div></div>

    <!-- Team label row for stats columns -->
    <div class="wm-team-labels">
      <span class="wm-lbl-home" style="color:var(--acc)">${h.name}</span>
      <span></span>
      <span class="wm-lbl-away" style="color:var(--tx2)">${a.name}</span>
    </div>

    <!-- Mobile tab bar (hidden on desktop) -->
    <div class="wm-mob-tabs" id="wm-mob-tabs">
      <button class="wm-mob-tab active" data-wm-tab="events">Events</button>
      <button class="wm-mob-tab" data-wm-tab="stats">Stats</button>
      <button class="wm-mob-tab" data-wm-tab="bench">Bench</button>
    </div>

    <!-- Three-column body -->
    <div class="wm-body">

      <!-- Events timeline -->
      <div class="wm-col wm-col-events wm-tab-active" data-wm-panel="events">
        <div class="wm-col-title">EVENTS</div>
        <div class="wm-events-list" id="wm-events-list">
          <div class="wm-ev-placeholder">Waiting for kick off…</div>
        </div>
      </div>

      <!-- Live stats -->
      <div class="wm-col wm-col-stats" data-wm-panel="stats">
        <div class="wm-col-title">LIVE STATS</div>
        <div id="wm-stats-block">
          ${_statBarHtml('POSSESSION', 50, 50, 'wm-stat-poss')}
          ${_statBarHtml('SHOTS', 0, 0, 'wm-stat-shots')}
          ${_statBarHtml('ON TARGET', 0, 0, 'wm-stat-sot')}
          ${_statBarHtml('xG', 0, 0, 'wm-stat-xg')}
          ${_statBarHtml('CORNERS', 0, 0, 'wm-stat-corners')}
          ${_statBarHtml('FOULS', 0, 0, 'wm-stat-fouls')}
        </div>
      </div>

      <!-- Fitness + Bench -->
      <div class="wm-col wm-col-bench" data-wm-panel="bench">
        <div class="wm-col-title">YOUR XI FITNESS</div>
        <div class="wm-fitness-list" id="wm-fitness-list"></div>
        <div class="wm-col-title" style="margin-top:12px">
          BENCH
          <span id="wm-subs-left" style="color:var(--acc2);font-size:10px;margin-left:6px;font-family:var(--fm)"></span>
        </div>
        <div class="wm-bench-list" id="wm-bench-list"></div>
      </div>
    </div>

    <!-- Controls -->
    <div class="wm-controls">
      <button class="btn btn-s wm-ctrl-btn" id="wm-btn-pause">⏸ Pause</button>
      <div class="wm-speed-wrap">
        <span style="font-size:10px;color:var(--tx2);font-family:var(--fm)">SPEED</span>
        <button class="wm-speed-btn active" data-speed="1">1×</button>
        <button class="wm-speed-btn" data-speed="2">2×</button>
        <button class="wm-speed-btn" data-speed="4">4×</button>
      </div>
      <button class="btn btn-s wm-ctrl-btn" id="wm-btn-skip">⏩ Skip</button>
      <button class="btn btn-s wm-ctrl-btn" id="wm-btn-change">📋 Tactics</button>
    </div>
  </div>`;

  showModal('⚽ Live Match', html, [], { wide: true, noDismiss: true });

  setTimeout(() => {
    const pauseBtn = document.getElementById('wm-btn-pause');
    if (pauseBtn) pauseBtn.onclick = _togglePause;

    const changeBtn = document.getElementById('wm-btn-change');
    if (changeBtn) changeBtn.onclick = _showInterventionPanel;

    const skipBtn = document.getElementById('wm-btn-skip');
    if (skipBtn) skipBtn.onclick = _skipMatch;

    // Mobile tab switching
    document.querySelectorAll('.wm-mob-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.wm-mob-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.wmTab;
        document.querySelectorAll('.wm-col[data-wm-panel]').forEach(col => {
          col.classList.toggle('wm-tab-active', col.dataset.wmPanel === target);
        });
      };
    });

    document.querySelectorAll('.wm-speed-btn').forEach(btn => {
      btn.onclick = () => {
        _watchState.speedMultiplier = parseInt(btn.dataset.speed, 10);
        document.querySelectorAll('.wm-speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (!_watchState.paused && _watchState.currentPhase < TOTAL_PHASES) {
          clearTimeout(_watchState.tickTimer);
          _scheduleTick();
        }
      };
    });

    _updateFitnessList();
    _updateBenchList();
  }, 50);
}

// ─── Tick engine ──────────────────────────────────────────────
function _startTick() { _scheduleTick(); }

function _scheduleTick() {
  const delay = Math.round(WATCH_TICK_MS / (_watchState.speedMultiplier || 1));
  _watchState.tickTimer = setTimeout(_runTick, delay);
}

function _runTick() {
  if (!_watchState || _watchState.paused) return;
  const s = _watchState;
  const startPhase = s.currentPhase + 1;
  const endPhase   = Math.min(s.currentPhase + WATCH_PHASES_PER_TICK, TOTAL_PHASES);

  const { segEvents, updatedState } = simulateMatchSegment(
    s.homeTeam, s.awayTeam, s.liveState, startPhase, endPhase
  );

  s.liveState    = updatedState;
  s.currentPhase = endPhase;
  s.allEvents.push(...segEvents);

  _updateScoreboard();
  _updateEvents(segEvents);
  _updateStats();
  _updateFitnessList();
  _updateBenchList();

  if (s.currentPhase >= TOTAL_PHASES) _finishMatch();
  else _scheduleTick();
}

// ─── Scoreboard ───────────────────────────────────────────────
function _updateScoreboard() {
  const s = _watchState;
  const minute = Math.ceil((s.currentPhase / TOTAL_PHASES) * 90);

  const hEl = document.getElementById('wm-hgoals');
  const aEl = document.getElementById('wm-agoals');
  const clk = document.getElementById('wm-clock');
  const bar = document.getElementById('wm-progress-bar');
  const sts = document.getElementById('wm-status');

  if (hEl) hEl.textContent = s.liveState.hGoals;
  if (aEl) aEl.textContent = s.liveState.aGoals;
  if (clk) clk.textContent = minute + "'";
  if (bar) bar.style.width = ((s.currentPhase / TOTAL_PHASES) * 100) + '%';
  if (sts && s.currentPhase < TOTAL_PHASES) {
    sts.textContent = minute <= 45 ? 'FIRST HALF' : 'SECOND HALF';
  }
}

// ─── Events timeline ──────────────────────────────────────────
function _updateEvents(newEvents) {
  const list = document.getElementById('wm-events-list');
  if (!list) return;
  const s = _watchState;

  const placeholder = list.querySelector('.wm-ev-placeholder');
  if (placeholder && newEvents.length > 0) placeholder.remove();

  for (const ev of newEvents) {
    const isUser = ev.teamId === s.userTeam.id;
    const cls    = isUser ? 'wm-ev-user' : 'wm-ev-opp';
    const item   = document.createElement('div');

    if (ev.type === 'goal') {
      const assist = ev.assistName ? ` <span style="color:var(--txd);font-size:11px">(${ev.assistName})</span>` : '';
      item.className = `wm-ev-item wm-ev-goal ${cls}`;
      item.innerHTML = `<span class="wm-ev-min">${ev.minute}'</span><span class="wm-ev-icon">⚽</span><span class="wm-ev-text"><strong>${ev.playerName}</strong>${assist}</span>`;
    } else if (ev.type === 'yellow') {
      item.className = `wm-ev-item ${cls}`;
      item.innerHTML = `<span class="wm-ev-min">${ev.minute}'</span><span class="wm-ev-icon">🟨</span><span class="wm-ev-text">${ev.playerName}</span>`;
    } else if (ev.type === 'sub') {
      item.className = `wm-ev-item ${cls}`;
      item.innerHTML = `<span class="wm-ev-min">${ev.minute}'</span><span class="wm-ev-icon">🔄</span><span class="wm-ev-text"><span style="color:var(--acc)">${ev.inName}</span> ↔ <span style="color:var(--acc3)">${ev.outName}</span></span>`;
    } else {
      continue;
    }
    list.insertBefore(item, list.firstChild);
  }
}

// ─── Stats bars ───────────────────────────────────────────────
function _statBarHtml(label, hVal, aVal, id) {
  const total = (hVal + aVal) || 1;
  const hPct  = Math.round((hVal / total) * 100);
  return `<div class="wm-stat-row" id="${id}">
    <span class="wm-stat-val wm-stat-home">${hVal}</span>
    <div class="wm-stat-mid">
      <div class="wm-stat-lbl">${label}</div>
      <div class="wm-stat-bar-wrap">
        <div class="wm-stat-bar-h" style="width:${hPct}%"></div>
        <div class="wm-stat-bar-a" style="width:${100-hPct}%"></div>
      </div>
    </div>
    <span class="wm-stat-val wm-stat-away">${aVal}</span>
  </div>`;
}

function _updateStatRow(id, hVal, aVal) {
  const el = document.getElementById(id);
  if (!el) return;
  const total = (hVal + aVal) || 1;
  const hPct  = Math.round((hVal / total) * 100);
  const home  = el.querySelector('.wm-stat-home');
  const away  = el.querySelector('.wm-stat-away');
  const barH  = el.querySelector('.wm-stat-bar-h');
  const barA  = el.querySelector('.wm-stat-bar-a');
  if (home) home.textContent = hVal;
  if (away) away.textContent = aVal;
  if (barH) barH.style.width = hPct + '%';
  if (barA) barA.style.width = (100 - hPct) + '%';
}

function _updateStats() {
  const ls = _watchState.liveState;
  const hp = ls.hPhases, ap = ls.aPhases;
  const total = hp + ap || 1;
  const hPoss = Math.round((hp / total) * 100);

  _updateStatRow('wm-stat-poss', hPoss, 100 - hPoss);

  const hAtt = ls.hStr.attack ?? 65, aAtt = ls.aStr.attack ?? 65;
  const phaseRatio = total / 120;
  const hShots = Math.max(ls.hGoals, Math.round((hp / 12) * (hAtt / 75)));
  const aShots = Math.max(ls.aGoals, Math.round((ap / 12) * (aAtt / 75)));
  const hSOT   = Math.max(ls.hGoals, Math.round(hShots * 0.38));
  const aSOT   = Math.max(ls.aGoals, Math.round(aShots * 0.38));
  const hXG    = parseFloat((hSOT * (0.12 + (hAtt / 99) * 0.06)).toFixed(1));
  const aXG    = parseFloat((aSOT * (0.12 + (aAtt / 99) * 0.06)).toFixed(1));
  // Corners and fouls scale with phases played
  const hCorners = Math.round((2 + (hPoss > 55 ? 1 : 0)) * phaseRatio + (hp / 30));
  const aCorners = Math.round((2 + (hPoss < 45 ? 1 : 0)) * phaseRatio + (ap / 30));
  const hFouls   = Math.round(8 * phaseRatio + (ap / 20));
  const aFouls   = Math.round(8 * phaseRatio + (hp / 20));

  _updateStatRow('wm-stat-shots',   hShots,   aShots);
  _updateStatRow('wm-stat-sot',     hSOT,     aSOT);
  _updateStatRow('wm-stat-xg',      hXG,      aXG);
  _updateStatRow('wm-stat-corners', hCorners, aCorners);
  _updateStatRow('wm-stat-fouls',   hFouls,   aFouls);
}

// ─── Fitness + Bench ──────────────────────────────────────────
function _updateFitnessList() {
  const el = document.getElementById('wm-fitness-list');
  if (!el) return;
  const s = _watchState, ls = s.liveState;
  const active = s.userIsHome ? ls.hActive : ls.aActive;
  const fitMap = s.userIsHome ? ls.hFitness : ls.aFitness;

  el.innerHTML = active.map(p => {
    const fit = Math.round(fitMap.get(p.id) ?? 90);
    const cls = fit >= 70 ? 'wm-fit-high' : fit >= 50 ? 'wm-fit-mid' : 'wm-fit-low';
    const g   = positionGroup(p.position);
    return `<div class="wm-fitness-row">
      <span class="pos ${g}" style="width:30px;text-align:center">${p.position}</span>
      <span class="wm-fit-name">${p.name.split(' ').pop()}</span>
      <div class="wm-fit-bar-wrap"><div class="wm-fit-bar ${cls}" style="width:${fit}%"></div></div>
      <span class="wm-fit-pct">${fit}%</span>
    </div>`;
  }).join('');
}

function _updateBenchList() {
  const el     = document.getElementById('wm-bench-list');
  const subsEl = document.getElementById('wm-subs-left');
  if (!el) return;
  const s = _watchState, ls = s.liveState;
  const bench    = s.userIsHome ? ls.hBenchLeft : ls.aBenchLeft;
  const subsLeft = s.userIsHome ? ls.hSubsLeft  : ls.aSubsLeft;

  if (subsEl) subsEl.textContent = `${subsLeft} sub${subsLeft !== 1 ? 's' : ''} left`;

  if (!bench.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--txd);padding:4px 0">No bench players</div>`;
    return;
  }

  el.innerHTML = bench.map(p => {
    const g   = positionGroup(p.position);
    const rat = primaryRating(p);
    const canSub = s.currentPhase < TOTAL_PHASES && subsLeft > 0;
    return `<div class="wm-bench-row">
      <span class="pos ${g}">${p.position}</span>
      <span class="wm-bench-name">${p.name}</span>
      <span class="wm-bench-rat">${rat}</span>
      ${canSub ? `<button class="wm-sub-btn" onclick="window._wmSubClick('${p.id}')">Sub On</button>` : ''}
    </div>`;
  }).join('');
}

// ─── Inline panel helper ──────────────────────────────────────
// Uses position:fixed so it's never clipped by modal-body overflow:hidden
function _openInlinePanel(titleHtml, bodyHtml, onClose) {
  const existing = document.getElementById('wm-inline-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'wm-inline-panel';
  panel.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:600',  // above modal (500) but below loader (700)
    'background:rgba(8,12,16,0.92)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:20px',
  ].join(';');

  panel.innerHTML = `
    <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:16px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;display:flex;flex-direction:column;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-family:var(--fd);font-size:20px;letter-spacing:1px">${titleHtml}</div>
        <button id="wm-panel-close" style="background:none;border:none;color:var(--txd);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:5px">✕</button>
      </div>
      <div style="padding:16px 20px;flex:1;overflow-y:auto" id="wm-panel-body">
        ${bodyHtml}
      </div>
    </div>`;

  document.body.appendChild(panel);

  const close = () => {
    const p = document.getElementById('wm-inline-panel');
    if (p) p.remove();
    if (onClose) onClose();
  };

  document.getElementById('wm-panel-close').onclick = close;
  // Click backdrop to close
  panel.addEventListener('click', e => { if (e.target === panel) close(); });

  return { close, panel };
}

// ─── Substitution panel ───────────────────────────────────────
window._wmSubClick = function(subInId) {
  if (!_watchState) return;
  const wasPaused = _watchState.paused;
  if (!wasPaused) _togglePause();

  const s  = _watchState;
  const ls = s.liveState;
  const subsLeft = s.userIsHome ? ls.hSubsLeft : ls.aSubsLeft;

  if (subsLeft <= 0) {
    toast('No substitutions remaining', 'error');
    if (!wasPaused) _togglePause();
    return;
  }

  const bench  = s.userIsHome ? ls.hBenchLeft : ls.aBenchLeft;
  const active = s.userIsHome ? ls.hActive    : ls.aActive;
  const subIn  = bench.find(p => p.id === subInId);
  if (!subIn) { if (!wasPaused) _togglePause(); return; }

  // GK bench player can only replace the starting GK; outfield can only replace outfield
  const outOptions = subIn.position === 'GK'
    ? active.filter(p => p.position === 'GK')
    : active.filter(p => p.position !== 'GK');
  const fitMap = s.userIsHome ? ls.hFitness : ls.aFitness;
  outOptions.sort((a, b) => (fitMap.get(a.id) ?? 90) - (fitMap.get(b.id) ?? 90));

  const bodyHtml = `
    <div style="font-size:13px;color:var(--tx2);margin-bottom:14px">
      Bringing on: <strong style="color:var(--acc)">${subIn.name}</strong>
      <span class="pos ${positionGroup(subIn.position)}" style="margin-left:6px">${subIn.position}</span>
    </div>
    <div style="font-size:11px;color:var(--txd);font-family:var(--fm);letter-spacing:1px;margin-bottom:8px">WHO COMES OFF?</div>
    <div id="wm-sub-out-list" style="display:flex;flex-direction:column;gap:6px">
      ${outOptions.map(p => {
        const fit = Math.round(fitMap.get(p.id) ?? 90);
        const fitCls = fit < 50 ? 'wm-fit-low' : fit < 70 ? 'wm-fit-mid' : 'wm-fit-high';
        const g = positionGroup(p.position);
        return `<div class="wm-sub-out-row" data-oid="${p.id}"
          style="display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:9px;cursor:pointer;background:var(--sur2);border:1px solid var(--bdr);transition:all .15s">
          <span class="pos ${g}">${p.position}</span>
          <span style="flex:1;font-size:13px;font-weight:500">${p.name}</span>
          <span class="wm-fit-pct ${fitCls}" style="font-family:var(--fm);font-size:11px">${fit}%</span>
        </div>`;
      }).join('')}
    </div>`;

  const { close } = _openInlinePanel('Make Substitution', bodyHtml, () => {
    if (!wasPaused) _togglePause(); // resume on cancel
  });

  // Wire row clicks — must happen after the panel is in the DOM
  setTimeout(() => {
    document.querySelectorAll('#wm-sub-out-list .wm-sub-out-row').forEach(row => {
      row.onmouseenter = () => { row.style.borderColor = 'var(--bdr-a)'; row.style.background = 'var(--sur3)'; };
      row.onmouseleave = () => { row.style.borderColor = 'var(--bdr)';   row.style.background = 'var(--sur2)'; };
      row.onclick = () => {
        close();          // remove panel (onClose fires _togglePause if not paused)
        _applyUserSub(subInId, row.dataset.oid);
        // Match was paused; _togglePause now resumes it
        if (!wasPaused) _togglePause();
      };
    });
  }, 0);
};

function _applyUserSub(inId, outId) {
  const s  = _watchState;
  const ls = s.liveState;
  const minute = Math.ceil((s.currentPhase / TOTAL_PHASES) * 90);

  const bench  = s.userIsHome ? ls.hBenchLeft : ls.aBenchLeft;
  const active = s.userIsHome ? ls.hActive    : ls.aActive;
  const fitMap = s.userIsHome ? ls.hFitness   : ls.aFitness;

  const subIn  = bench.find(p => p.id === inId);
  const subOut = active.find(p => p.id === outId);
  if (!subIn || !subOut) return;

  // Guard: GK can only replace GK, outfield can only replace outfield
  if (subIn.position === 'GK' && subOut.position !== 'GK') return;
  if (subIn.position !== 'GK' && subOut.position === 'GK') return;

  if (s.userIsHome) {
    ls.hActive    = active.map(p => p.id === outId ? subIn : p);
    ls.hBenchLeft = bench.filter(p => p.id !== inId);
    ls.hSubsLeft  = Math.max(0, ls.hSubsLeft - 1);
  } else {
    ls.aActive    = active.map(p => p.id === outId ? subIn : p);
    ls.aBenchLeft = bench.filter(p => p.id !== inId);
    ls.aSubsLeft  = Math.max(0, ls.aSubsLeft - 1);
  }
  fitMap.set(subIn.id, 90);

  const newStr = teamStrength(s.userIsHome ? ls.hActive : ls.aActive);
  if (s.userIsHome) ls.hStr = newStr;
  else              ls.aStr = newStr;
  ls.hMidShare = (ls.hStr.midfield + ls.aStr.midfield) > 0
    ? ls.hStr.midfield / (ls.hStr.midfield + ls.aStr.midfield) : 0.5;

  const subEvt = { type:'sub', minute, teamId:s.userTeam.id, outId, outName:subOut.name, inId, inName:subIn.name };
  s.allEvents.push(subEvt);

  // DOM updates — guard against Node test environment
  if (typeof document !== 'undefined' && typeof document.createElement === 'function' && document.createElement('div').insertBefore) {
    _updateFitnessList();
    _updateBenchList();
    _updateEvents([subEvt]);
    toast(`${subIn.name} replaces ${subOut.name}`, 'success', 3000);
  }
}

// ─── Tactics / formation panel ────────────────────────────────
function _showInterventionPanel() {
  if (!_watchState) return;
  const wasPaused = _watchState.paused;
  if (!wasPaused) _togglePause();

  const s       = _watchState;
  const ls      = s.liveState;
  const curFm   = s.userIsHome ? ls.homeFormation : ls.awayFormation;
  let pickerFm  = curFm;
  const players = s.userIsHome ? s.userPlayers : s.oppPlayers;

  const fmBtns = Object.keys(FORMATIONS)
    .map(f => `<button class="pm-fm-btn${f === curFm ? ' active' : ''}" data-fm="${f}">${f}</button>`)
    .join('');

  const bodyHtml = `
    <div style="font-size:12px;color:var(--acc2);font-family:var(--fm);margin-bottom:14px">
      CHANGE TAKES EFFECT IMMEDIATELY
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px" id="wm-fm-picker-btns">${fmBtns}</div>
    <div style="font-size:11px;color:var(--tx2);margin-bottom:8px">Best XI preview:</div>
    <div id="wm-fm-picker-xi" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px"></div>
    <div style="display:flex;gap:10px">
      <button id="wm-panel-apply" class="btn btn-p" style="flex:1">Apply Formation</button>
    </div>`;

  const { close } = _openInlinePanel('Tactical Change', bodyHtml, () => {
    if (!wasPaused) _togglePause();
  });

  const updateXI = (fm) => {
    const el = document.getElementById('wm-fm-picker-xi');
    if (!el) return;
    const xi = selectEleven(players.map(p => ({ ...p, fitness: p.fitness ?? 90, inSquad: p.inSquad !== false })), fm);
    el.innerHTML = xi.map(p => `<span class="pm-xi-name">${p.name.split(' ').pop()}</span>`).join('');
  };

  setTimeout(() => {
    updateXI(pickerFm);

    document.querySelectorAll('#wm-fm-picker-btns .pm-fm-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#wm-fm-picker-btns .pm-fm-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pickerFm = btn.dataset.fm;
        updateXI(pickerFm);
      };
    });

    const applyBtn = document.getElementById('wm-panel-apply');
    if (applyBtn) applyBtn.onclick = () => {
      _applyFormationChange(pickerFm);
      close();
    };
  }, 0);
}

function _applyFormationChange(newFormation) {
  const s  = _watchState;
  const ls = s.liveState;

  const currentActive = s.userIsHome ? ls.hActive    : ls.aActive;
  const currentBench  = s.userIsHome ? ls.hBenchLeft : ls.aBenchLeft;
  const fitMap        = s.userIsHome ? ls.hFitness   : ls.aFitness;

  const allAvail = [...currentActive, ...currentBench];
  const newXI    = selectEleven(
    allAvail.map(p => ({ ...p, fitness: fitMap.get(p.id) ?? p.fitness ?? 90, inSquad: true })),
    newFormation
  );
  const usedIds  = new Set(newXI.map(p => p.id));
  const newBench = allAvail.filter(p => !usedIds.has(p.id));
  const newStr   = teamStrength(newXI);

  if (s.userIsHome) {
    ls.hActive      = newXI;
    ls.hBenchLeft   = newBench;
    ls.hStr         = newStr;
    ls.homeFormation = newFormation;
  } else {
    ls.aActive      = newXI;
    ls.aBenchLeft   = newBench;
    ls.aStr         = newStr;
    ls.awayFormation = newFormation;
  }
  ls.hMidShare = (ls.hStr.midfield + ls.aStr.midfield) > 0
    ? ls.hStr.midfield / (ls.hStr.midfield + ls.aStr.midfield) : 0.5;

  toast(`Formation changed to ${newFormation}`, 'info', 3000);
  _updateFitnessList();
  _updateBenchList();
}

// ─── Skip to end ─────────────────────────────────────────────
function _skipMatch() {
  if (!_watchState) return;
  const s = _watchState;
  if (s.currentPhase >= TOTAL_PHASES) return;

  // Stop the tick timer
  clearTimeout(s.tickTimer);
  s.paused = true;

  // Simulate all remaining phases in one batch
  const startPhase = s.currentPhase + 1;
  const { segEvents, updatedState } = simulateMatchSegment(
    s.homeTeam, s.awayTeam, s.liveState, startPhase, TOTAL_PHASES
  );

  s.liveState    = updatedState;
  s.currentPhase = TOTAL_PHASES;
  s.allEvents.push(...segEvents);

  _updateScoreboard();
  _updateEvents(segEvents);
  _updateStats();
  _updateFitnessList();
  _updateBenchList();

  _finishMatch();
}

// ─── Pause / resume ───────────────────────────────────────────
function _togglePause() {
  if (!_watchState) return;
  const s = _watchState;
  s.paused = !s.paused;
  const btn = document.getElementById('wm-btn-pause');
  const sts = document.getElementById('wm-status');
  if (btn) btn.textContent = s.paused ? '▶ Resume' : '⏸ Pause';
  if (sts && s.currentPhase < TOTAL_PHASES) {
    const min = Math.ceil((s.currentPhase / TOTAL_PHASES) * 90);
    sts.textContent = s.paused ? 'PAUSED' : (min <= 45 ? 'FIRST HALF' : 'SECOND HALF');
  }
  if (!s.paused && s.currentPhase < TOTAL_PHASES) _scheduleTick();
}

// ─── Match end ────────────────────────────────────────────────
async function _finishMatch() {
  const s = _watchState;
  clearTimeout(s.tickTimer);

  const sts = document.getElementById('wm-status');
  if (sts) sts.textContent = 'FULL TIME';

  const bar = document.getElementById('wm-progress-bar');
  if (bar) bar.style.width = '100%';

  const controls = document.querySelector('.wm-controls');
  if (controls) {
    controls.innerHTML = `<button class="btn btn-p" id="wm-btn-done" style="min-width:200px;padding:11px 20px">View Full Report →</button>`;
    setTimeout(() => {
      const doneBtn = document.getElementById('wm-btn-done');
      if (doneBtn) doneBtn.onclick = _commitResult;
    }, 0);
  }

  const hg = s.liveState.hGoals, ag = s.liveState.aGoals;
  const won  = s.userIsHome ? hg > ag : ag > hg;
  const drew = hg === ag;
  const col  = won ? 'success' : drew ? 'info' : 'error';
  toast(`Full Time: ${s.homeTeam.name} ${hg}–${ag} ${s.awayTeam.name}`, col, 10000);
}

async function _commitResult() {
  const bd = document.getElementById('modal-bd');
  if (bd) { bd.classList.remove('open'); bd.addEventListener('transitionend', () => bd.remove(), { once: true }); }

  showLoader('Applying result…');
  try {
    const s   = _watchState;
    const res = await advanceOneFixtureWithResult(
      finaliseLiveMatch(s.homeTeam, s.awayTeam, s.liveState, s.allEvents),
      s.matchEvent, s.userIsHome
    );
    hideLoader();
    _watchState = null;
    if (res && res.singleResult) showMatchReport(res.singleResult, s.save);
    await renderHome();
  } catch (err) {
    hideLoader();
    toast('Error saving result: ' + err.message, 'error');
    console.error(err);
    _watchState = null;
    await renderHome();
  }
}
