import { getAllFixtures, getAllTeams, getFixturesByGW, getPlayersByTeam, getSave } from '../modules/db.js';
import { selectEleven } from '../modules/matchEngine.js';
import { CUP_META } from '../modules/cups.js';
import { injuryDurationLabel } from '../modules/injuries.js';
import { POSITIONS } from '../modules/youthAcademy.js';
import { advanceOneFixture, getNextMatchEvent } from '../modules/gameweek.js';
import { flagEmoji, fmt, formLabel, hideLoader, posGroup, showLoader, showModal, toast } from './helpers.js';
import { renderHome, showMatchReport } from './home_transfers.js';
import { newsAIBid, newsInjury } from './inbox.js';
import { showWatchMatchModal } from './watchmatch.js';

/** ui/prematch.js — Pre-match briefing modal, handleAdvanceOneFixture, _launchWatchMatch, _generateStubPlayers */

// ─── Get last N results for any team ─────────────────────────
export async function getTeamRecentForm(teamId, n = 5) {
  const all = await getAllFixtures();
  return all
    .filter(f => f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, n)
    .reverse()
    .map(f => {
      const isH = f.homeTeamId === teamId;
      const gf  = isH ? f.homeGoals : f.awayGoals;
      const ga  = isH ? f.awayGoals : f.homeGoals;
      return { result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', gf, ga, gameweek: f.gameweek };
    });
}

// ─── Get most in-form player for a team ──────────────────────
export async function getInFormPlayer(teamId) {
  const players = await getPlayersByTeam(teamId);
  return players
    .filter(p => !p.injured)
    .sort((a, b) => {
      const sa = (a.goals??0)*8 + (a.assists??0)*5 + (a.cleanSheets??0)*6;
      const sb = (b.goals??0)*8 + (b.assists??0)*5 + (b.cleanSheets??0)*6;
      return sb - sa;
    })[0] ?? null;
}

// ─── Show pre-match modal ─────────────────────────────────────
export async function showPreMatchModal() {
  const save  = await getSave();
  const event = await getNextMatchEvent();

  if (!event || event.type === 'no_user_event') {
    // Nothing to show — just advance silently
    await handleAdvanceOneFixture(null);
    return;
  }

  const allTeams  = await getAllTeams();
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const userTeam  = teamsById.get(save.userTeamId) ?? { name:'Your Team', crest:'⚽' };

  // ── Determine opponent based on event type ──────────────────
  let oppId, oppTeam, oppForm = [], oppInForm = null;
  let matchTitle = '', matchSubtitle = '', compBadge = '', isLeague = false;
  let userIsHome = true; // default user on left

  if (event.type === 'league') {
    const fix  = (await getFixturesByGW(event.gw)).find(f => f.id === event.fixtureId);
    if (!fix) { await handleAdvanceOneFixture(null); return; }
    userIsHome   = fix.homeTeamId === save.userTeamId;
    oppId        = userIsHome ? fix.awayTeamId : fix.homeTeamId;
    oppTeam      = teamsById.get(oppId) ?? { id:oppId, name:oppId, crest:'⚽', reputation:70 };
    [oppForm, oppInForm] = await Promise.all([getTeamRecentForm(oppId,5), getInFormPlayer(oppId)]);
    matchTitle   = `${userIsHome?'🏠 Home':'✈️ Away'} · GW${event.gw}`;
    compBadge    = `<span class="pm-comp-badge" style="background:rgba(18,168,100,.15);color:var(--acc)">${save.userLeague ?? 'League'}</span>`;
    isLeague     = true;
  } else if (event.type === 'ucl_md') {
    oppTeam      = { name: event.oppName, crest: event.oppNation ?? '🌍', reputation: event.oppStrength ?? 72 };
    userIsHome   = event.userIsHome ?? true;
    matchTitle   = `⭐ UCL League Phase — Matchday ${event.matchday}`;
    compBadge    = `<span class="pm-comp-badge" style="background:rgba(59,130,246,.15);color:#3b82f6">Champions League</span>`;
  } else if (event.type === 'cup') {
    const meta   = CUP_META[event.cupId] ?? {};
    // Look up opponent from last cup result if available, else use event data
    const cupState   = save.cups?.[event.cupId];
    const lastResult = cupState?.results?.slice(-1)[0];
    const oppName    = event.opponentName ?? lastResult?.opponentName ?? 'TBD';
    const oppCrest   = event.opponentCrest ?? lastResult?.opponentCrest ?? '⚽';
    oppTeam          = { name: oppName, crest: oppCrest, reputation: event.opponentRep ?? 70 };
    userIsHome       = event.userIsHome ?? true;
    matchTitle       = `${meta.icon ?? '🏆'} ${meta.name ?? event.cupId} · ${event.roundName}`;
    const metaColor  = meta.color ?? 'var(--acc2)';
    compBadge        = `<span class="pm-comp-badge" style="background:rgba(245,200,66,.15);color:${metaColor}">${meta.name ?? event.cupId}</span>`;
  }

  const rep     = oppTeam.reputation ?? 70;
  const diffLbl = rep >= 90 ? '🔴 Very Strong' : rep >= 82 ? '🟠 Strong' : rep >= 74 ? '🟡 Even' : rep >= 66 ? '🟢 Favourable' : '🔵 Underdog';

  // Form pills
  const formPills = oppForm.length
    ? oppForm.map(r => `<span class="pm-form-pill ${r.result}">${r.result}</span>`).join('')
    : `<span style="color:var(--txd);font-size:11px">${event.type==='league'?'No results yet':'European opposition'}</span>`;

  // In-form player
  let inFormHtml = '<div style="font-size:12px;color:var(--txd)">No data available</div>';
  if (oppInForm) {
    const g  = posGroup(oppInForm.position);
    const fl = formLabel(oppInForm);
    const stats = [
      oppInForm.goals       > 0 ? `⚽ ${oppInForm.goals}` : '',
      oppInForm.assists     > 0 ? `🎯 ${oppInForm.assists}` : '',
      oppInForm.cleanSheets > 0 ? `🧤 ${oppInForm.cleanSheets}` : '',
    ].filter(Boolean).join('  ');
    inFormHtml = `<div class="pm-inform-card">
      <div class="pm-inform-av">${flagEmoji(oppInForm.name)}</div>
      <div>
        <div style="font-weight:600;font-size:13px">${oppInForm.name}</div>
        <div style="font-size:11px;display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
          <span class="pos ${g}">${oppInForm.position}</span>
          <span class="fb ${fl.cls}">${fl.text}</span>
          ${stats ? `<span style="color:var(--tx2)">${stats}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── Pending events counter ───────────────────────────────────
  const pendingCount = (save.pendingEvents?.length ?? 1);
  const pendingBadge = pendingCount > 1
    ? `<div style="font-size:11px;color:var(--acc2);font-family:var(--fm);margin-top:4px">📅 ${pendingCount} events remaining this gameweek</div>`
    : '';

  const modalHtml = `
  <div class="pm-wrap">
    <!-- Competition badge + title -->
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${compBadge}
      ${pendingBadge}
    </div>

    <!-- Matchup header -->
    <div class="pm-matchup">
      <div class="pm-team ${userIsHome ? 'pm-team-home' : ''}">
        <div class="pm-crest">${userIsHome ? userTeam.crest : oppTeam.crest}</div>
        <div class="pm-tname">${userIsHome ? userTeam.name : oppTeam.name}</div>
        <div style="font-size:9px;font-family:var(--fm);color:${userIsHome ? 'var(--acc)' : 'var(--tx2)'};letter-spacing:1px;margin-top:2px">HOME</div>
      </div>
      <div class="pm-vs-block">
        <div class="pm-vs">VS</div>
        <div class="pm-gw">${matchTitle}</div>
        <div class="pm-diff">${diffLbl}</div>
      </div>
      <div class="pm-team ${!userIsHome ? 'pm-team-home' : ''}">
        <div class="pm-crest">${userIsHome ? oppTeam.crest : userTeam.crest}</div>
        <div class="pm-tname">${userIsHome ? oppTeam.name : userTeam.name}</div>
        <div style="font-size:9px;font-family:var(--fm);color:${!userIsHome ? 'var(--acc)' : 'var(--tx2)'};letter-spacing:1px;margin-top:2px">AWAY</div>
      </div>
    </div>

    <!-- Opponent form -->
    <div class="pm-section">
      <div class="pm-section-title">${oppTeam.crest} ${oppTeam.name} — Last 5</div>
      <div class="pm-form-row">${formPills}</div>
      ${oppForm.length ? `<div style="font-size:10px;color:var(--txd);margin-top:4px">${oppForm.map(r=>`GW${r.gameweek}: ${r.gf}-${r.ga}`).join(' · ')}</div>` : ''}
    </div>

    <!-- In-form player -->
    <div class="pm-section">
      <div class="pm-section-title">⚡ Their Key Player</div>
      ${inFormHtml}
    </div>

    <!-- Tactics -->
    <div class="pm-section">
      <div class="pm-section-title">🗂 Your Formation</div>
      <div>
        <div style="font-family:var(--fd);font-size:20px;color:var(--acc)" id="pm-fm-display">${save.formation ?? '4-3-3'}</div>
        <div style="font-size:10px;color:var(--tx2);margin-top:2px">Set formation and lineup in the Tactics screen</div>
      </div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
        ${{ defensive:'🛡️', balanced:'⚖️', possession:'🎯', attacking:'⚡' }[save.mentality ?? 'balanced']}
        <span style="font-size:12px;font-weight:600;color:var(--acc2)">${(save.mentality ?? 'balanced').charAt(0).toUpperCase() + (save.mentality ?? 'balanced').slice(1)}</span>
        <span style="font-size:10px;color:var(--tx2)">mentality</span>
      </div>
      <div id="pm-xi-preview" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px"></div>
    </div>
  </div>`;

  const userFormation = save.formation ?? '4-3-3';
  const userLineup    = save.lineup ?? null;
  const userPlayers   = await getPlayersByTeam(save.userTeamId);

  // Check if any injured player is in the saved lineup
  const injuredInLineup = userLineup
    ? userPlayers.filter(p => p.injured && userLineup.includes(p.id))
    : [];

  // Check if lineup is incomplete (null, wrong length, or contains players no longer on team)
  const lineupIncomplete = !userLineup || userLineup.length !== 11
    || userLineup.some(pid => !userPlayers.find(p => p.id === pid));

  // Combined block condition
  const lineupBlocked = injuredInLineup.length > 0 || lineupIncomplete;

  const updateXIPreview = () => {
    const el = document.getElementById('pm-xi-preview');
    if (!el) return;
    const xi = selectEleven(userPlayers.map(p => ({...p,fitness:p.fitness??90,inSquad:p.inSquad!==false})), userFormation, userLineup);
    el.innerHTML = xi.map(p => {
      const isInj = p.injured;
      return `<span class="pm-xi-name${isInj ? ' pm-xi-inj' : ''}">${p.name.split(' ').slice(-1)[0]}${isInj ? ' 🚑' : ''}</span>`;
    }).join('');
  };

  // Warning block for pre-match
  let warningHtml = '';
  if (injuredInLineup.length) {
    warningHtml += `<div class="pm-section" style="border:1px solid var(--acc3)40;border-radius:8px;padding:10px;background:var(--acc3)0d">
        <div class="pm-section-title" style="color:var(--acc3)">🚑 Injured Players in Lineup</div>
        ${injuredInLineup.map(p => `<div style="font-size:12px;margin-top:4px"><strong>${p.name}</strong> — ${p.injuryName||'Injured'} <span style="color:var(--txd)">(${injuryDurationLabel(p.injuryGWsLeft)} remaining)</span></div>`).join('')}
        <div style="font-size:11px;color:var(--acc3);margin-top:6px;font-family:var(--fm)">Go to Tactics to fix your lineup before playing.</div>
      </div>`;
  }
  if (lineupIncomplete) {
    warningHtml += `<div class="pm-section" style="border:1px solid var(--acc2)40;border-radius:8px;padding:10px;background:var(--acc2)0d;${injuredInLineup.length ? 'margin-top:8px' : ''}">
        <div class="pm-section-title" style="color:var(--acc2)">⚠️ Lineup Incomplete</div>
        <div style="font-size:11px;color:var(--acc2);margin-top:4px;font-family:var(--fm)">You must set a full starting XI in the Tactics screen before playing.</div>
      </div>`;
  }

  // Inject warning into modal if needed
  const finalModalHtml = warningHtml ? modalHtml.replace('</div>', warningHtml + '</div>') : modalHtml;

  const blockMsg = injuredInLineup.length > 0
    ? '🚑 Fix your lineup — injured players selected. Go to Tactics.'
    : '⚠️ Set a full starting XI in Tactics before playing.';

  showModal('Pre-Match Briefing', finalModalHtml, [
    {
      id: 'quick-sim',
      label: '⚡ Quick Sim',
      cls: 'btn-s',
      disabled: lineupBlocked,
      handler: async () => {
        if (lineupBlocked) {
          toast(blockMsg, 'error', 5000);
          return;
        }
        await handleAdvanceOneFixture(userFormation);
      },
    },
    {
      id: 'watch-match',
      label: '👁 Watch Match',
      cls: 'btn-p',
      disabled: lineupBlocked,
      handler: async () => {
        if (lineupBlocked) {
          toast(blockMsg, 'error', 5000);
          return;
        }
        await _launchWatchMatch(event, save, userTeam, oppTeam, userFormation);
      },
    },
    { id: 'cancel', label: 'Cancel', cls: 'btn-s' },
  ]);

  // Wire after modal renders
  setTimeout(() => {
    updateXIPreview();
    // Visually disable buttons if lineup is blocked
    if (lineupBlocked) {
      const qsBtn = document.getElementById('quick-sim');
      const wmBtn = document.getElementById('watch-match');
      if (qsBtn) { qsBtn.disabled = true; qsBtn.style.opacity = '0.4'; qsBtn.style.cursor = 'not-allowed'; }
      if (wmBtn) { wmBtn.disabled = true; wmBtn.style.opacity = '0.4'; wmBtn.style.cursor = 'not-allowed'; }
    }
  }, 30);
}

// ─── Pop next event, simulate, show report ────────────────────
export async function handleAdvanceOneFixture(overrideFormation) {
  const hdrBtn = document.getElementById('btn-adv-header');
  if (hdrBtn) hdrBtn.disabled = true;

  // Show in-modal spinner if modal is open, otherwise fall back to full-screen loader
  const modalFoot = document.querySelector('.modal-foot');
  const modalBody = document.getElementById('modal-bd');
  let usingModalSpinner = false;

  if (modalFoot && modalBody) {
    usingModalSpinner = true;
    // Replace footer buttons with spinner
    modalFoot.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;width:100%;justify-content:center;padding:4px 0">
        <div class="loader-spin" style="width:24px;height:24px;border-width:2px;margin:0"></div>
        <div style="font-family:var(--fm);font-size:11px;color:var(--tx2);letter-spacing:2px">SIMULATING MATCH…</div>
      </div>`;
    // Fade out modal body content
    const mBody = modalBody.querySelector('.modal-body');
    if (mBody) mBody.style.opacity = '0.4';
  } else {
    showLoader('Simulating…');
  }

  try {
    const save = await getSave();
    const res  = await advanceOneFixture(overrideFormation ?? null);

    if (usingModalSpinner) {
      const mBody = modalBody?.querySelector('.modal-body');
      if (mBody) mBody.style.opacity = '';
      // Close and immediately remove the pre-match modal before anything else
      // (no setTimeout — a delayed remove would destroy the match report modal)
      const existingModal = document.querySelector('.modal-bd');
      if (existingModal) {
        existingModal.classList.remove('open');
        existingModal.remove();
      }
    } else {
      hideLoader();
    }

    if (res.finished) { await renderHome(); return; }
    if (res.skipped)  { await renderHome(); return; }

    // Render home page first so the UI is up to date, THEN show match report on top
    await renderHome();

    const r = res.singleResult;
    if (r) showMatchReport(r, save);

    // Cup toasts
    for (const cr of res.cupResults ?? []) {
      if (cr.isUCLMatchday) {
        toast(`⭐ UCL MD${cr.matchday}: ${cr.result} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals}) +${cr.points}pts`,
          cr.result==='W'?'success':cr.result==='D'?'info':'error', 6000);
      } else if (!cr.eliminated && cr.opponentName) {
        const meta = CUP_META[cr.cupId];
        const isFirstLeg = (cr.roundName||'').includes('1st leg');
        const lossLabel = isFirstLeg ? '❌ Lost' : '❌ Out';
        toast(`${meta?.icon||'🏆'} ${meta?.name} ${cr.roundName}: ${cr.userWon?'✅ Won':lossLabel} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals})`,
          cr.userWon?'success':'error', 6000);
      }
    }

    if (res.eventsLeft > 0) {
      toast(`📅 ${res.eventsLeft} more event${res.eventsLeft>1?'s':''} to play this gameweek`, 'info', 3000);
    }

    if (res.newOffers?.length) {
      for (const o of res.newOffers) {
        toast(`📨 ${o.clubName} bid ${fmt.money(o.fee)} for ${o.playerName}`, 'info', 5000);
        if(typeof newsAIBid==='function') newsAIBid({name:o.playerName,id:o.playerId},o.fee,o.clubName,save).catch(()=>{});
      }
    }

    // Injury toasts — new injuries from the match result
    if (res.singleResult?.events) {
      const injEvts = res.singleResult.events.filter(e => e.type === 'injury' && e.teamId === save.userTeamId);
      for (const inj of injEvts) {
        const wks = inj.injuryGWsLeft ?? 1;
        const dur = typeof injuryDurationLabel === 'function' ? injuryDurationLabel(wks) : `${wks} week${wks!==1?'s':''}`;
        toast(`🚑 ${inj.playerName} — ${inj.injuryName} (${dur})`, 'error', 8000);
        if(typeof newsInjury==='function') newsInjury({name:inj.playerName,id:inj.playerId},inj.injuryName,wks,save).catch(()=>{});
      }
    }

    // Recovery toasts — players returning from injury
    for (const p of res.recoveredPlayers ?? []) {
      toast(`✅ ${p.name} is fit and available again!`, 'success', 6000);
    }
  } catch (err) {
    if (usingModalSpinner) {
      const mBody = modalBody?.querySelector('.modal-body');
      if (mBody) mBody.style.opacity = '';
    } else {
      hideLoader();
    }
    toast(`Error: ${err.message}`, 'error');
    console.error(err);
    if (hdrBtn) hdrBtn.disabled = false;
    await renderHome();
  }
}

// ─── Launch Watch Match — load data then open live viewer ─────
export async function _launchWatchMatch(event, save, userTeam, oppTeam, selectedFormation) {
  showLoader('Preparing match…');
  try {
    const allTeams2  = await getAllTeams();
    const teamsById2 = new Map(allTeams2.map(t => [t.id, t]));

    let homeTeam, awayTeam, homePlayers, awayPlayers, patchedEvent;

    if (event.type === 'league') {
      const fix2 = (await getFixturesByGW(event.gw)).find(f => f.id === event.fixtureId);
      if (!fix2) { hideLoader(); await handleAdvanceOneFixture(selectedFormation); return; }
      const userIsHome2 = fix2.homeTeamId === save.userTeamId;
      const oppId2      = userIsHome2 ? fix2.awayTeamId : fix2.homeTeamId;
      const realOpp     = teamsById2.get(oppId2) ?? oppTeam;
      homeTeam   = userIsHome2 ? userTeam : realOpp;
      awayTeam   = userIsHome2 ? realOpp  : userTeam;
      homePlayers = await getPlayersByTeam(homeTeam.id);
      awayPlayers = await getPlayersByTeam(awayTeam.id);
      patchedEvent = { ...event, userIsHome: userIsHome2 };

    } else {
      // Cup / UCL — opponent may not be in DB
      const userIsHomeC = event.userIsHome ?? true;
      const realOpp     = teamsById2.get(event.opponentId) ?? oppTeam;
      homeTeam   = userIsHomeC ? userTeam : realOpp;
      awayTeam   = userIsHomeC ? realOpp  : userTeam;
      homePlayers = await getPlayersByTeam(homeTeam.id);
      awayPlayers = (event.opponentId && teamsById2.has(event.opponentId))
        ? await getPlayersByTeam(event.opponentId).catch(() => [])
        : [];
      if (!awayPlayers.length) {
        const strength = event.opponentRep ?? event.oppStrength ?? 72;
        awayPlayers = _generateStubPlayers(realOpp, strength);
      }
      // Swap if user is away
      if (!userIsHomeC) {
        [homePlayers, awayPlayers] = [awayPlayers, homePlayers];
      }
      patchedEvent = { ...event, userIsHome: userIsHomeC };
    }

    hideLoader();
    const isUserHome = patchedEvent.userIsHome;
    const userPl = isUserHome ? homePlayers : awayPlayers;
    const oppPl  = isUserHome ? awayPlayers : homePlayers;
    const opp    = isUserHome ? awayTeam    : homeTeam;
    await showWatchMatchModal(patchedEvent, userTeam, opp, userPl, oppPl, save, selectedFormation);
  } catch(err) {
    hideLoader();
    toast('Could not start live match: ' + err.message, 'error');
    console.error(err);
    await handleAdvanceOneFixture(selectedFormation);
  }
}

// ─── Generate stub players for AI opponents not in DB ─────────
// Used for UCL/European opponents who have a strength rating but
// no actual players stored in IndexedDB.
export function _generateStubPlayers(team, strength) {
  const s = Math.max(40, Math.min(95, strength));
  const v = (base, spread) => Math.round(base + (Math.random() - 0.5) * spread);
  const POSITIONS = [
    'GK',
    'CB','CB','RB','LB',
    'CM','CM','CDM',
    'RW','LW','ST',
    // bench
    'GK','CB','CM','ST','LW',
  ];
  const STUB_NAMES = [
    'M. Kovačević','L. Fernández','A. Müller','D. Santos','J. Andersen',
    'R. Silva','K. Traoré','P. Johansson','N. Popescu','T. García',
    'S. Eriksen','C. Moretti','H. Yamamoto','B. Olsen','F. Laurent',
    'O. Novak',
  ];
  return POSITIONS.map((pos, i) => ({
    id:          `${team.id}_stub_${i}`,
    name:        STUB_NAMES[i] ?? `Player ${i+1}`,
    position:    pos,
    teamId:      team.id,
    attack:      pos==='GK' ? 20 : v(s,14),
    midfield:    v(s - (pos==='GK'?30:0), 14),
    defence:     v(s - (['ST','RW','LW'].includes(pos)?20:0), 14),
    goalkeeping: pos==='GK' ? v(s,10) : 20,
    fitness:     90,
    inSquad:     true,
    injured:     false,
    suspended:   false,
  }));
}

