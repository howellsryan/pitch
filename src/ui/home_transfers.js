import { getAllPlayers, getAllTeams, getPlayer, getPlayersByTeam, getSave, getTeam, putSave } from '../modules/db.js';
import { primaryRating } from '../modules/matchEngine.js';
import { getTableSliceAroundTeam } from '../modules/standings.js';
import { getLastResultForTeam, getNextFixtureForTeam } from '../modules/fixtures.js';
import { CUP_META } from '../modules/cups.js';
import { _loanFee, _loanWageCost, buyPlayer, canClubSignPlayer, formAdjustedValue, generateAIOffers, generateBuyCounter, getLoanableInPlayers, isDeadlineDay, loanInPlayer, loanOutPlayer, playerMinRepToSign, sellPlayer, simulateAITransfers, transferWindowStatus } from '../modules/transfers.js';
import { getPotentialLabel, getPotentialStars } from '../modules/potential.js';
import { injuryDurationLabel } from '../modules/injuries.js';
import { patchSave } from '../modules/save.js';
import { processEndOfSeason } from '../modules/season.js';
import { advanceOneFixture, getEffectiveTotalGW } from '../modules/gameweek.js';
import { fmt, formLabel, hideLoader, playerNationality, posGroup, showLoader, showModal, toast } from './helpers.js';
import { renderSettings } from './renderers.js';
import { _updateOffersBadge, openSquadPlayerModal, showOffersModal } from './squad_tactics_offers.js';
import { _makeNewsItem, addNewsItem, newsMatchResult, newsPlayerSigned, newsPlayerSold, newsPromotion, newsRelegation, newsSeasonEnd, newsYouthIntake } from './inbox.js';
import { showPreMatchModal } from './prematch.js';

// ══════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════

// ─── Close the transfer window after deadline day ─────────────
export async function _closeTransferWindow(ddInfo, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Closing window…'; }
  const save = await getSave();
  const cur = new Date(save.currentDate);
  const afterDeadline = (ddInfo?.window === 'summer')
    ? new Date(cur.getFullYear(), 8, 2)   // Sep 2
    : new Date(cur.getFullYear(), 1, 2);  // Feb 2
  // Decline all pending inbound offers — window is shut
  const expiredOffers = (save.inboundOffers ?? []).map(o =>
    o.status === 'pending' ? { ...o, status: 'expired' } : o
  );
  const expiredCount = expiredOffers.filter(o => o.status === 'expired').length - 
    (save.inboundOffers ?? []).filter(o => o.status === 'expired').length;
  await patchSave({ currentDate: afterDeadline.toISOString(), deadlineHoursUsed: null, inboundOffers: expiredOffers });
  if (expiredCount > 0) {
    toast(`⏰ Transfer window closed — ${expiredCount} pending offer${expiredCount > 1 ? 's' : ''} expired.`, 'info', 5000);
  } else {
    toast('⏰ Transfer window closed. Back to business!', 'info', 4000);
  }
  await renderHome();
}

export async function renderHome(){
  const save=await getSave(), team=await getTeam(save.userTeamId);
  const players=await getPlayersByTeam(save.userTeamId);
  const allTeams=await getAllTeams(), byId=new Map(allTeams.map(t=>[t.id,t]));
  const [prev,next,slice]=await Promise.all([
    getLastResultForTeam(save.userTeamId),
    getNextFixtureForTeam(save.userTeamId),
    getTableSliceAroundTeam(save.userTeamId,2),
  ]);
  const dateEl=document.getElementById('h-date');
  if(dateEl) dateEl.textContent=fmt.date(save.currentDate);
  const seasonEl=document.getElementById('h-season');
  if(seasonEl) seasonEl.textContent=`Season ${save.season}`;
  // Update sidebar avatar initials
  const mgrName = save.managerName || 'The Manager';
  const mgrInitials = mgrName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const mgrAvEl = document.getElementById('mgr-av');
  if(mgrAvEl) mgrAvEl.textContent = mgrInitials;
  const heroEl=document.getElementById('h-hero');
  if(heroEl&&team) heroEl.innerHTML=`
    <div class="hero-crest">${team.crest}</div>
    <div class="hero-info">
      <div class="hero-name">${team.name}</div>
      <div class="hero-sub">
        <span>${team.league||'Premier League'}</span><span class="hero-dot"></span>
        <span>${team.stadium||''}</span>
      </div>
    </div>
    <div class="mgr-card"><div class="mgr-lbl">Manager</div><div class="mgr-name">${mgrName}</div><div class="mgr-since">Season ${save.season}</div></div>`;
  const prevEl=document.getElementById('h-prev');
  if(prevEl){
    if(!prev){prevEl.innerHTML=`<div class="mc-lbl">Previous Result</div><div class="no-data">No matches played yet</div>`;}
    else{
      const ht=byId.get(prev.homeTeamId),at=byId.get(prev.awayTeamId);
      const isHome=prev.homeTeamId===save.userTeamId;
      const ug=isHome?prev.homeGoals:prev.awayGoals,og=isHome?prev.awayGoals:prev.homeGoals;
      const cls=ug>og?'win':ug<og?'loss':'';
      const hs=(prev.homeScorers||[]).map(s=>`${s.playerName||''} ${s.minute}'`).join(', ');
      const as=(prev.awayScorers||[]).map(s=>`${s.playerName||''} ${s.minute}'`).join(', ');
      prevEl.innerHTML=`<div class="mc-lbl">Previous Result</div>
        <div class="mc-fix"><div class="mc-team">${ht?.name||prev.homeTeamId}</div>
        <div class="mc-score ${cls}">${prev.homeGoals}-${prev.awayGoals}</div>
        <div class="mc-team aw">${at?.name||prev.awayTeamId}</div></div>
        <div class="mc-meta"><div class="mc-comp"><span class="mc-dot"></span>GW${prev.gameweek}</div><div>${fmt.dateShort(prev.date)}</div></div>
        ${hs||as?`<div class="mc-scorers"><div>${hs}</div><div class="aw">${as}</div></div>`:''}`;
    }
  }
  const nextEl=document.getElementById('h-next');
  if(nextEl){
    if(!next){nextEl.innerHTML=`<div class="mc-lbl">Next Fixture</div><div class="no-data" style="color:var(--acc2)">Season Complete!</div>`;}
    else{
      const ht=byId.get(next.homeTeamId),at=byId.get(next.awayTeamId);
      nextEl.innerHTML=`<div class="mc-lbl">Next Fixture</div>
        <div class="mc-fix"><div class="mc-team">${ht?.name||next.homeTeamId}</div>
        <div class="mc-score vs">vs</div><div class="mc-team aw">${at?.name||next.awayTeamId}</div></div>
        <div class="mc-meta"><div class="mc-comp"><span class="mc-dot" style="background:var(--acc2)"></span>GW${next.gameweek}</div><div>${fmt.dateShort(next.date)}</div></div>`;
    }
  }
  const tblEl=document.getElementById('h-table');
  if(tblEl) tblEl.innerHTML=slice.map(r=>`
    <div class="tbl-row ${r.isUserTeam?'hl':''}">
      <div class="rc">${r.displayPosition||r.position}</div>
      <div class="tc">${r.teamName}</div>
      <div class="sc">${r.won}</div><div class="sc">${r.drawn}</div><div class="sc">${r.lost}</div>
      <div class="pc">${r.points}</div>
    </div>`).join('');
  const statsEl=document.getElementById('h-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card"><div class="sl">Gameweek</div><div class="sv" style="color:var(--acc)">${save.currentGameweek}</div><div class="ss">of ${getEffectiveTotalGW(save)}</div></div>
    <div class="stat-card"><div class="sl">Budget</div><div class="sv" style="color:#7c83e8">${fmt.money(team?.budget||0)}</div><div class="ss">Transfer funds</div></div>
    <div class="stat-card"><div class="sl">Squad</div><div class="sv" style="color:var(--acc2)">${players.length}</div><div class="ss">players</div></div>
    <div class="stat-card"><div class="sl">Season</div><div class="sv" style="color:var(--acc3)">${save.season}</div><div class="ss">${team?.league||'League'}</div></div>`;
  const formEl=document.getElementById('h-form'),myRow=slice.find(r=>r.isUserTeam);
  if(formEl){
    const form=myRow?.form||[];
    const pills=form.length?form.map(r=>`<div class="fp ${r}">${r}</div>`).join(''):`<span style="color:var(--txd);font-size:12px">No matches played</span>`;
    const wr=myRow?.played>0?myRow.won/myRow.played:0;
    const mt=wr>0.7?'Excellent':wr>0.5?'High':wr>0.35?'Good':myRow?.played>0?'Low':'Neutral';
    const mp=Math.min(100,myRow?.points?myRow.points*3:50);
    formEl.innerHTML=`<div class="fr-title">Recent Form</div><div class="fr-pills">${pills}</div><div class="fr-spc"></div>
      <div class="morale-blk"><div class="morale-lbl">Morale</div>
      <div class="morale-w"><div class="morale-bar" style="width:${mp}%"></div></div>
      <div class="morale-txt">${mt}</div></div>`;
  }
  await renderCharts();
  const isEnd=save.currentGameweek>getEffectiveTotalGW(save);

  // Wire the VISIBLE header buttons (btn-adv-header / btn-eoy-header / btn-deadline-header)
  const hdrPlay     = document.getElementById('btn-adv-header');
  const hdrEOY      = document.getElementById('btn-eoy-header');
  const hdrDeadline = document.getElementById('btn-deadline-header');

  // Deadline day detection
  const ddInfo = typeof isDeadlineDay === 'function' ? isDeadlineDay(save) : { isDeadline: false };
  const onDeadlineDay = !isEnd && ddInfo.isDeadline;
  const windowLabel = ddInfo.window === 'summer' ? 'Summer' : 'Winter';

  // Hide/show play vs deadline vs EOY
  if (hdrPlay)     hdrPlay.style.display     = (!isEnd && !onDeadlineDay) ? 'flex' : 'none';
  if (hdrEOY)      hdrEOY.style.display      = isEnd ? 'flex' : 'none';
  if (hdrDeadline) hdrDeadline.style.display  = onDeadlineDay ? 'flex' : 'none';

  // Wire play button (normal mode only)
  if (hdrPlay && !isEnd && !onDeadlineDay) {
    hdrPlay.disabled = false;
    hdrPlay.textContent = '▶ Play Next Match';
    hdrPlay.onclick = () => showPreMatchModal();
  }
  if (hdrEOY) {
    hdrEOY.disabled = false;
    hdrEOY.onclick = isEnd ? handleEndOfSeason : null;
  }

  // Wire deadline button
  if (hdrDeadline && onDeadlineDay) {
    const hoursUsed = save.deadlineHoursUsed || 0;
    const hoursLeft = 10 - hoursUsed;
    hdrDeadline.disabled = false;
    hdrDeadline.onclick = null;

    if (hoursLeft <= 0) {
      // Already done all 10 — auto-close immediately on next render
      _closeTransferWindow(ddInfo, hdrDeadline);
      return;
    }

    hdrDeadline.textContent = `⏰ Skip One Hour (${hoursLeft} left)`;
    hdrDeadline.onclick = async () => {
      hdrDeadline.disabled = true;
      hdrDeadline.textContent = '⏳ Simulating…';
      try {
        const sv = await getSave();
        const used = sv.deadlineHoursUsed || 0;

        // Run AI-to-AI transfers + generate inbound offers for user
        const [deals, newOffers] = await Promise.all([
          typeof simulateAITransfers === 'function' ? simulateAITransfers(sv) : Promise.resolve([]),
          typeof generateAIOffers === 'function' ? generateAIOffers() : Promise.resolve([]),
        ]);
        const newUsed = used + 1;
        await patchSave({ deadlineHoursUsed: newUsed });

        // Toast summary
        const parts = [];
        if (deals.length)     parts.push(`${deals.length} AI deal${deals.length > 1 ? 's' : ''}`);
        if (newOffers.length) parts.push(`${newOffers.length} offer${newOffers.length > 1 ? 's' : ''} for your players`);
        if (parts.length) {
          toast(`⏰ Hour ${newUsed}: ${parts.join(' · ')}!`, 'success', 5000);
        } else {
          toast(`⏰ Hour ${newUsed}: Quiet on the market. (${10 - newUsed} left)`, 'info', 3500);
        }

        // Inbox entry if deals happened
        if (deals.length && typeof addNewsItem === 'function') {
          const dealList = deals.slice(0, 5).map(d => `${d.playerName}: ${d.fromTeamName} → ${d.toTeamName}`).join('\n');
          const extra = deals.length > 5 ? `\n…and ${deals.length - 5} more` : '';
          await addNewsItem(_makeNewsItem('transfer_in',
            `⏰ Deadline Day — Hour ${newUsed}`,
            `${deals.length} deal${deals.length > 1 ? 's' : ''} completed:\n${dealList}${extra}`,
            { gw: sv.currentGameweek, date: sv.currentDate, icon: '⏰' }));
        }

        if (newUsed >= 10) {
          // All hours done — close the window automatically
          toast('All deadline hours done. Closing transfer window…', 'info', 3000);
          await new Promise(r => setTimeout(r, 1200));
          await _closeTransferWindow(ddInfo, hdrDeadline);
        } else {
          hdrDeadline.disabled = false;
          hdrDeadline.textContent = `⏰ Skip One Hour (${10 - newUsed} left)`;
        }
      } catch (err) {
        console.error('Deadline hour error:', err);
        toast('Error simulating deadline hour.', 'error');
        hdrDeadline.disabled = false;
        const sv2 = await getSave();
        hdrDeadline.textContent = `⏰ Skip One Hour (${10 - (sv2.deadlineHoursUsed || 0)} left)`;
      }
    };
  }

  // ── Deadline day inbox + toast notification (fires once per deadline) ──
  if (onDeadlineDay) {
    const notifyKey = `deadlineDayNotified_${windowLabel}_${save.season}`;
    if (!save[notifyKey]) {
      await patchSave({ [notifyKey]: true, deadlineHoursUsed: save.deadlineHoursUsed || 0 });
      toast(`⏰ Transfer Deadline Day! The ${windowLabel} window closes after 10 hours. Keep pressing "Skip One Hour" to simulate last-minute deals.`, 'info', 7000);
      if (typeof addNewsItem === 'function') {
        await addNewsItem(_makeNewsItem('transfer_in',
          `⏰ ${windowLabel} Transfer Deadline Day`,
          `The ${windowLabel} transfer window is about to close. Press "Skip One Hour" up to 10 times to simulate last-minute AI activity — deals and inbound offers for your players. The window closes automatically after all 10 hours.`,
          { gw: save.currentGameweek, date: save.currentDate, icon: '⏰' }));
      }
    }
  }

  // Keep hidden fallback buttons (used by some paths) in sync too
  const advBtn = document.getElementById('btn-adv');
  const eoyBtn = document.getElementById('btn-eoy');
  if (advBtn) { advBtn.disabled=onDeadlineDay; advBtn.onclick=null; if(!isEnd&&!onDeadlineDay) advBtn.onclick=()=>showPreMatchModal(); }
  if (eoyBtn) { eoyBtn.disabled=false; eoyBtn.onclick=null; if(isEnd) eoyBtn.onclick=handleEndOfSeason; }
}

export async function renderCharts(){
  const el=document.getElementById('h-charts');
  if(!el) return;
  const all=await getAllPlayers();
  const sc=[...all].filter(p=>(p.goals||0)>0).sort((a,b)=>b.goals-a.goals).slice(0,7);
  const as=[...all].filter(p=>(p.assists||0)>0).sort((a,b)=>b.assists-a.assists).slice(0,7);
  const maxG=sc[0]?.goals||1, maxA=as[0]?.assists||1;
  const bars=(arr,attr,color,max)=>arr.length
    ?arr.map(p=>`<div class="cbl-row"><div class="cbl-name">${p.name}</div><div class="cbl-bw"><div class="cbl-b" style="width:${Math.round((p[attr]/max)*100)}%;background:${color}"></div></div><div class="cbl-v">${p[attr]}</div></div>`).join('')
    :`<div class="no-data" style="padding:10px;font-size:11px">Play matches to see stats</div>`;
  el.innerHTML=`
    <div class="chart-card"><div class="chart-title">⚽ Top Scorers</div><div class="cbl">${bars(sc,'goals','linear-gradient(90deg,var(--acc),#7fff9a)',maxG)}</div></div>
    <div class="chart-card"><div class="chart-title">🎯 Top Assists</div><div class="cbl">${bars(as,'assists','linear-gradient(90deg,#7c83e8,#b8bcf7)',maxA)}</div></div>`;
}

// ── SIMULATE ONE FIXTURE
// handleAdvanceOneFixture is defined in prematch.js
export async function _handleAdvanceOneFixtureStub(){
  const btn=document.getElementById('btn-adv');
  if(!btn||btn.disabled) return;
  const save=await getSave();
  btn.disabled=true; btn.textContent='Simulating…';
  showLoader('Simulating match…');
  try{
    const res=await advanceOneFixture();
    hideLoader();
    if(res.finished){await renderHome();return;}
    const r=res.singleResult;
    if(r) { showMatchReport(r,save); if(typeof newsMatchResult==='function') newsMatchResult(r,save).catch(()=>{}); }
    if(res.cupResults?.length){
      for(const cr of res.cupResults){
        if(cr.isUCLMatchday){
          toast(`⭐ UCL MD${cr.matchday}: ${cr.result} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals}) +${cr.points}pts`,cr.result==='W'?'success':cr.result==='D'?'info':'error',6000);
          if(typeof newsMatchResult==='function'){
            const fakeR={homeTeamId:save.userTeamId,homeGoals:cr.userGoals,awayGoals:cr.oppGoals,awayTeamName:cr.opponentName,homeTeamName:(await getTeam(save.userTeamId))?.name||'You',homeScorers:[],awayScorers:[],competition:'UCL',gameweek:save.currentGameweek};
            newsMatchResult(fakeR,save).catch(()=>{});
          }
        } else if(!cr.eliminated){
          const meta=CUP_META[cr.cupId];
          const isFirstLeg=(cr.roundName||'').includes('1st leg');
          const lossLabel=isFirstLeg?'❌ Lost':'❌ Out';
          toast(`${meta?.icon||'🏆'} ${meta?.name} ${cr.roundName}: ${cr.userWon?'✅ Won':lossLabel} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals})`,cr.userWon?'success':'error',6000);
          if(typeof newsMatchResult==='function'){
            const fakeR={homeTeamId:save.userTeamId,homeGoals:cr.userGoals,awayGoals:cr.oppGoals,awayTeamName:cr.opponentName,homeTeamName:(await getTeam(save.userTeamId))?.name||'You',homeScorers:[],awayScorers:[],competition:(meta?.name||cr.cupId),gameweek:save.currentGameweek};
            newsMatchResult(fakeR,save).catch(()=>{});
          }
        }
      }
    }
    await renderHome();
  }catch(err){
    hideLoader(); toast(`Error: ${err.message}`,'error'); console.error(err);
    btn.disabled=false;
    const sv=await getSave();
    btn.textContent=`▶ Play My Match (GW ${sv.currentGameweek})`;
  }
}

// ── MATCH REPORT
// Layout: HOME team always on LEFT, AWAY always on RIGHT (real football convention)
// User's team highlighted. Stats bar: home=left/green, away=right/red.
export function showMatchReport(r,save){
  const isHome = r.homeTeamId === save.userTeamId;
  const userResult = r.homeTeamId===save.userTeamId
    ? (r.homeGoals>r.awayGoals?'WIN':r.homeGoals<r.awayGoals?'LOSS':'DRAW')
    : (r.awayGoals>r.homeGoals?'WIN':r.awayGoals<r.homeGoals?'LOSS':'DRAW');
  const resCol = userResult==='WIN'?'var(--acc)':userResult==='LOSS'?'var(--acc3)':'var(--acc2)';

  // Always home on left, away on right
  const hCrest = r.homeTeamCrest || '⚽';
  const aCrest = r.awayTeamCrest || '⚽';
  const hName  = r.homeTeamName;
  const aName  = r.awayTeamName;
  const hG = r.homeGoals, aG = r.awayGoals;
  const hScorers = r.homeScorers || [];
  const aScorers = r.awayScorers || [];

  const s  = r.stats || {};
  const P  = s.possession    || {home:50,away:50};
  const S  = s.shots         || {home:0,away:0};
  const OT = s.shotsOnTarget || {home:0,away:0};
  const XG = s.xG            || {home:0,away:0};
  const YC = s.yellowCards   || {home:0,away:0};
  const FL = s.fouls         || {home:0,away:0};
  const CO = s.corners       || {home:0,away:0};

  const isUserHome = r.homeTeamId === save.userTeamId;
  const evts = (r.events||[]).sort((a,b)=>a.minute-b.minute);
  const userSubs = evts.filter(e=>e.type==='sub'&&e.teamId===save.userTeamId);

  // Score row badges: show goal scorers under each team
  const scorerBadges = (arr, teamId) => arr.length
    ? arr.map(e=>`<div class="mr-scorer">⚽ <strong>${e.playerName||'?'}</strong> <span style="color:var(--txd)">${e.minute}'</span>${e.assistName?` <span style="opacity:.55;font-size:10px">▸${e.assistName}</span>`:''}</div>`).join('')
    : '';

  // Timeline shows all goal/card/injury events, user events highlighted
  const timeline = evts.filter(e=>e.type==='goal'||e.type==='yellow'||e.type==='injury').map(e=>{
    const isU = e.teamId===save.userTeamId;
    const isH = e.teamId===r.homeTeamId;
    let icon = e.type==='goal' ? '⚽' : e.type==='yellow' ? '🟨' : '🚑';
    return`<div class="mr-ev ${isU?'mr-ev-us':'mr-ev-op'}" style="align-self:${isH?'flex-start':'flex-end'}">
      ${isH?`<span class="mr-ev-min">${e.minute}'</span>`:''}<span>${icon}</span><span class="mr-ev-nm">${e.playerName||'?'}</span>${e.type==='injury'?`<span style="font-size:9px;color:var(--acc3);margin-left:3px">${e.injuryName||'Injury'}</span>`:''}${!isH?`<span class="mr-ev-min">${e.minute}'</span>`:''}
    </div>`;
  }).join('');

  // Injuries this match
  const userInjuries = evts.filter(e => e.type === 'injury' && e.teamId === save.userTeamId);
  const injuryBlock = userInjuries.length
    ? `<div class="mr-subs" style="border-color:var(--acc3)30">
        <div class="mr-subs-title" style="color:var(--acc3)">🚑 Injuries</div>
        ${userInjuries.map(inj => `<div class="mr-sub"><span style="color:var(--acc3);font-weight:700">${inj.playerName||'?'}</span> — ${inj.injuryName||'Injury'} <span style="color:var(--txd)">(${injuryDurationLabel(inj.injuryGWsLeft)})</span></div>`).join('')}
      </div>`
    : '';

  // Stat rows: home stat on LEFT, label in centre, away stat on RIGHT
  const sr = (lbl, hv, av, bar=true) => {
    const tot = (parseFloat(hv)||0)+(parseFloat(av)||0)||1;
    const hp  = Math.round(((parseFloat(hv)||0)/tot)*100);
    const userHighH = isUserHome ? 'color:var(--acc)' : '';
    const userHighA = !isUserHome ? 'color:var(--acc)' : '';
    return`<div class="mr-sr">
      <span class="mr-sv" style="${userHighH}">${hv}</span>
      <div class="mr-sm">
        <span class="mr-sl">${lbl}</span>
        ${bar?`<div class="mr-bw"><div class="mr-bu" style="width:${hp}%"></div><div class="mr-bo" style="width:${100-hp}%"></div></div>`:''}
      </div>
      <span class="mr-sv" style="${userHighA}">${av}</span>
    </div>`;
  };

  // Home/away indicator with user highlight
  const hIsUser = r.homeTeamId===save.userTeamId;
  const aIsUser = r.awayTeamId===save.userTeamId;
  const hBorder = hIsUser?'border-bottom:2px solid var(--acc)':'';
  const aBorder = aIsUser?'border-bottom:2px solid var(--acc)':'';

  showModal(`GW${r.gameweek||''} Match Report`,`
    <div class="mr-wrap">
      <div class="mr-header">
        <div class="mr-side" style="padding-bottom:6px;${hBorder}">
          <div class="mr-crest">${hCrest}</div>
          <div class="mr-tname" style="${hIsUser?'color:var(--acc)':''}">${hName}</div>
          <div style="font-size:10px;color:var(--txd);font-family:var(--fm);margin-bottom:4px">HOME</div>
          <div class="mr-scorers">${scorerBadges(hScorers)}</div>
        </div>
        <div class="mr-centre">
          <div class="mr-result" style="color:${resCol}">${userResult}</div>
          <div class="mr-score">${hG}<span style="opacity:.35;margin:0 8px">–</span>${aG}</div>
        </div>
        <div class="mr-side mr-side-r" style="padding-bottom:6px;${aBorder}">
          <div class="mr-crest">${aCrest}</div>
          <div class="mr-tname" style="${aIsUser?'color:var(--acc)':''}">${aName}</div>
          <div style="font-size:10px;color:var(--txd);font-family:var(--fm);margin-bottom:4px">AWAY</div>
          <div class="mr-scorers">${scorerBadges(aScorers)}</div>
        </div>
      </div>
      ${timeline?`<div class="mr-timeline" style="flex-direction:column;gap:4px">${timeline}</div>`:''}
      <div class="mr-stats-lbl" style="display:flex;justify-content:space-between;font-size:10px;color:var(--txd);font-family:var(--fm);padding:0 2px;margin-bottom:2px">
        <span>${hName.split(' ')[0]}</span><span>${aName.split(' ')[0]}</span>
      </div>
      <div class="mr-stats-grid">
        ${sr('Possession %',P.home,P.away)}
        ${sr('Shots',S.home,S.away)}
        ${sr('On Target',OT.home,OT.away)}
        ${sr('xG',typeof XG.home==='number'?XG.home.toFixed(2):XG.home, typeof XG.away==='number'?XG.away.toFixed(2):XG.away,false)}
        ${sr('Corners',CO.home,CO.away)}
        ${sr('Fouls',FL.home,FL.away)}
        ${sr('Yellow Cards',YC.home,YC.away)}
      </div>
      ${userSubs.length?`<div class="mr-subs"><div class="mr-subs-title">🔄 Your Substitutions</div>${userSubs.map(s=>`<div class="mr-sub">↑ <strong>${s.inName}</strong> ↓ ${s.outName} <span style="color:var(--txd)">(${s.minute}')</span></div>`).join('')}</div>`:''}
      ${injuryBlock}
    </div>`,
    [{id:'close',label:'Continue →',cls:'btn-p'}]
  );
}

// ── END OF SEASON
export async function handleEndOfSeason(){
  const btn=document.getElementById('btn-eoy');
  if(btn) btn.disabled=true;
  showLoader('Processing end of season…');
  try{
    const {summary,leagueWinner,newSave,prizeMoney,leagueChanges,newYouthCohort}=await processEndOfSeason();
    hideLoader();
    const trophies=[];
    if(leagueWinner?.teamId===newSave.userTeamId) trophies.push('🏆 League Champions!');
    if(summary.cups) for(const[cid,st]of Object.entries(summary.cups)){
      if(st.status==='winner') trophies.push(`${CUP_META[cid]?.icon||'🏆'} ${CUP_META[cid]?.name||cid} Winners!`);
    }
    const tHtml=trophies.length?`<div style="background:rgba(245,200,66,.1);border:1px solid rgba(245,200,66,.3);border-radius:8px;padding:12px;margin-bottom:12px">${trophies.map(t=>`<div style="color:var(--acc2);font-size:14px;font-weight:600">${t}</div>`).join('')}</div>`:'';
    const ord=n=>n+(['st','nd','rd'][n-1]||'th');

    // Build league changes HTML (promotion/relegation/playoffs)
    let lcHtml='';
    if(leagueChanges){
      const uri=leagueChanges.userRelInfo||{};
      if(uri.promoted&&uri.promotedViaPlayoff){
        lcHtml+=`<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#3b82f6">🎉 PROMOTED via Play-offs!</div>
          <div style="font-size:11px;color:var(--tx2);margin-top:4px">Your team won the play-off final and earned promotion!</div>
        </div>`;
      } else if(uri.promoted){
        lcHtml+=`<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#3b82f6">⬆️ PROMOTED! Automatic promotion secured!</div>
        </div>`;
      } else if(uri.relegated){
        lcHtml+=`<div style="background:rgba(232,72,85,.1);border:1px solid rgba(232,72,85,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:var(--acc3)">⬇️ RELEGATED</div>
          <div style="font-size:11px;color:var(--tx2);margin-top:4px">Your team has been relegated to the division below.</div>
        </div>`;
      }

      // Show playoff results for the user's league
      const userLeague=summary.userLeague||(await getSave())?.userLeague||'';
      const po=leagueChanges.playoffResults?.[userLeague];
      if(po){
        const sf1=po.semi1, sf2=po.semi2, fin=po.final;
        lcHtml+=`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:6px">🏟️ Play-off Results</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:4px"><strong>Semi-Final 1:</strong> ${sf1.team1.name} vs ${sf1.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:2px;padding-left:8px">Leg 1: ${sf1.team1.name} ${sf1.leg1.home}-${sf1.leg1.away} ${sf1.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:4px;padding-left:8px">Leg 2: ${sf1.team2.name} ${sf1.leg2.home}-${sf1.leg2.away} ${sf1.team1.name} (Agg: ${sf1.agg.team1}-${sf1.agg.team2}${sf1.penalties?' pens':''})</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:4px"><strong>Semi-Final 2:</strong> ${sf2.team1.name} vs ${sf2.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:2px;padding-left:8px">Leg 1: ${sf2.team1.name} ${sf2.leg1.home}-${sf2.leg1.away} ${sf2.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:4px;padding-left:8px">Leg 2: ${sf2.team2.name} ${sf2.leg2.home}-${sf2.leg2.away} ${sf2.team1.name} (Agg: ${sf2.agg.team1}-${sf2.agg.team2}${sf2.penalties?' pens':''})</div>
          <div style="font-size:11px;color:var(--acc);margin-top:4px"><strong>Final:</strong> ${fin.team1.name} ${fin.score.team1}-${fin.score.team2} ${fin.team2.name}${fin.penalties?' (pens)':''}</div>
          <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-top:4px">🏆 ${(fin.winnerId===fin.team1.id?fin.team1.name:fin.team2.name)} promoted!</div>
        </div>`;
      }

      // Show movements summary
      const mvs=(leagueChanges.movements||[]).filter(m=>m.teamId!==newSave.userTeamId);
      if(mvs.length>0){
        const promos=mvs.filter(m=>m.reason.includes('Promoted')||m.reason.includes('Playoff'));
        const rels=mvs.filter(m=>m.reason==='Relegated');
        let mvHtml='';
        if(promos.length) mvHtml+=`<div style="margin-bottom:4px"><span style="color:#3b82f6;font-weight:600;font-size:10px">⬆️ PROMOTED:</span> <span style="font-size:10px;color:var(--tx2)">${promos.map(m=>{const allT=typeof getAllTeams==='function';return m.teamId;}).join(', ')}</span></div>`;
        if(rels.length) mvHtml+=`<div><span style="color:var(--acc3);font-weight:600;font-size:10px">⬇️ RELEGATED:</span> <span style="font-size:10px;color:var(--tx2)">${rels.map(m=>m.teamId).join(', ')}</span></div>`;
        if(mvHtml) lcHtml+=`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:8px;margin-bottom:8px">${mvHtml}</div>`;
      }
    }

    showModal('Season Complete! 🎉',`<div>${tHtml}
      <div style="font-size:13px;color:var(--tx2);margin-bottom:8px">Finished <strong style="color:var(--tx)">${ord(summary.userFinish)}</strong> in the league.</div>
      ${prizeMoney?`<div style="font-size:13px;color:var(--acc);margin-bottom:8px">💰 Prize money: <strong>${fmt.money(prizeMoney)}</strong></div>`:''}
      ${lcHtml}
      ${summary.retirements&&summary.retirements.length?`<div style="background:rgba(232,72,85,.08);border:1px solid rgba(232,72,85,.2);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;color:var(--acc3);margin-bottom:4px">👋 Retirements</div>
        ${summary.retirements.map(r=>`<div style="font-size:12px;color:var(--tx2)">${r.name} (${r.position}, ${r.age}) has retired</div>`).join('')}
      </div>`:''}
      <div style="font-size:12px;color:var(--tx2)">All players aged +1 year. New season fixtures generated.</div>
    </div>`,
    [{id:'ok',label:'Start Next Season →',cls:'btn-p',handler:async()=>{await renderHome();}}]);
    // ── Inbox news ──────────────────────────────────────────
    if(typeof newsSeasonEnd==='function'){
      const _uTeam=await getTeam(newSave.userTeamId);
      newsSeasonEnd(summary.userFinish,newSave.userLeague||_uTeam?.league||'League',trophies,prizeMoney,newSave).catch(()=>{});
    }
    if(typeof newsPromotion==='function'&&leagueChanges?.userRelInfo?.promoted){
      const _uTeam=await getTeam(newSave.userTeamId);
      newsPromotion(_uTeam?.name||'Your club',newSave.userLeague||'the division above',newSave).catch(()=>{});
    }
    if(typeof newsRelegation==='function'&&leagueChanges?.userRelInfo?.relegated){
      const _uTeam=await getTeam(newSave.userTeamId);
      newsRelegation(_uTeam?.name||'Your club',newSave.userLeague||'the division below',newSave).catch(()=>{});
    }
    if(typeof newsYouthIntake==='function'&&newYouthCohort?.length){
      const wks=newYouthCohort.filter(p=>p.isWonderkid).length;
      newsYouthIntake(newYouthCohort.length,wks,newSave).catch(()=>{});
    }
    if(typeof renderSettings==='function') renderSettings().catch(()=>{});
  }catch(err){
    hideLoader(); toast(`Error: ${err.message}`,'error'); console.error(err);
    const b=document.getElementById('btn-eoy'); if(b) b.disabled=false;
  }
}

// ── TRANSFERS
export let _buyTargets=[],_selPid=null,_trByIdCache=null,_trTeamCache=null;
// Active filter state
export const _trFilters = {
  pos:'ALL', league:'ALL', sort:'rating',
  minAge:15, maxAge:40, minRat:40, maxRat:99,
  maxPrice:0,   // 0 = no limit (never filters)
  minPot:0,     // 0 = no minimum (1-5 = star threshold)
  query:'',
  affordable: false,
  canSign: false, // only show players club has rep to sign
  page: 0,       // current page (0-indexed), 100 players per page
};

export async function renderTransfers(){
  const save=await getSave(), team=await getTeam(save.userTeamId);
  const allTeams=await getAllTeams(), byId=new Map(allTeams.map(t=>[t.id,t]));
  const bh=document.getElementById('tr-budget-hdr');

  // ── Transfer window status banner ──
  const winStatus = transferWindowStatus(save);
  const winBanner = document.getElementById('tr-window-banner');
  if (winBanner) {
    const isOpen = winStatus.open;
    winBanner.innerHTML = `<span style="font-size:11px;font-weight:700;letter-spacing:.5px;color:${isOpen?'var(--acc)':'#e55'}">${isOpen?'🟢':'🔴'} ${winStatus.label.toUpperCase()}</span>`;
    winBanner.style.display = 'flex';
  }

  if(bh&&team) bh.innerHTML=`<span style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--tx2)">Budget</span><span style="font-family:var(--fd);font-size:20px;color:var(--acc)">${fmt.money(team.budget)}</span></span>`;

  const allPl=await getAllPlayers();
  _buyTargets=allPl.filter(p=>p.teamId!==save.userTeamId&&p.teamId!=='free_agents');
  // Don't reset maxPrice here — 0 means no limit and is the correct default

  // Gather unique leagues from buy targets
  const leagueSet = [...new Set(allTeams.map(t=>t.league||'Premier League'))].sort();

  _renderAdvancedFilters(byId, team, leagueSet);
  _applyAndRenderBuyList(byId, team);
  await renderSellList(save.userTeamId);

  const tbBuy=document.getElementById('tt-buy'),tbSell=document.getElementById('tt-sell'),tbLoans=document.getElementById('tt-loans');
  const pBuy=document.getElementById('tp-buy'),pSell=document.getElementById('tp-sell'),pLoans=document.getElementById('tp-loans');
  const _showTab=(active)=>{
    [tbBuy,tbSell,tbLoans].forEach(t=>t&&t.classList.remove('on'));
    [pBuy,pSell,pLoans].forEach(p=>p&&p.classList.remove('on'));
    active.tab&&active.tab.classList.add('on');
    active.pnl&&active.pnl.classList.add('on');
  };
  if(tbBuy)   tbBuy.onclick  =()=>{ _showTab({tab:tbBuy,pnl:pBuy}); };
  if(tbSell)  tbSell.onclick =()=>{ _showTab({tab:tbSell,pnl:pSell}); };
  if(tbLoans) tbLoans.onclick=()=>{ _showTab({tab:tbLoans,pnl:pLoans}); renderLoanMarket(); };

  // Wire Offers button → opens modal
  const tbOffers=document.getElementById('tt-offers');
  if(tbOffers) tbOffers.onclick=()=>showOffersModal();
  // Update the badge count
  if(typeof _updateOffersBadge==='function') _updateOffersBadge();
}

export function _renderAdvancedFilters(byId, team, leagueSet){
  // Position tabs
  document.querySelectorAll('#tr-filters .ftab').forEach(tab=>{
    tab.onclick=()=>{
      document.querySelectorAll('#tr-filters .ftab').forEach(t=>t.classList.remove('on'));
      tab.classList.add('on');
      _trFilters.pos=tab.dataset.f||'ALL';
      _applyAndRenderBuyList(byId, team);
    };
  });

  // Search
  const si=document.getElementById('tr-search');
  if(si){ si.oninput=()=>{ _trFilters.query=si.value.toLowerCase(); _applyAndRenderBuyList(byId, team); }; }

  // Build the advanced filter bar if not already built
  const buyPnl=document.getElementById('tp-buy');
  if(!buyPnl||buyPnl.querySelector('#tr-adv-bar')) return;

  // Price slider: 0 = leftmost = No Limit. Slider goes 0 → 300M in steps of 1M.
  // We use value=0 to mean "no cap" — label shows "No limit" at position 0.
  const MAX_PRICE_SLIDER = 300_000_000;

  const leagueOpts=['ALL',...leagueSet].map(l=>`<option value="${l}">${l==='ALL'?'All Leagues':l}</option>`).join('');
  const sortOpts=[
    ['rating','⭐ Rating'],['value','💰 Value'],['age','🎂 Age'],
    ['potential','✨ Potential'],['goals','⚽ Goals'],['assists','🎯 Assists'],
  ].map(([v,l])=>`<option value="${v}">${l}</option>`).join('');

  // Potential stars: 0 = any (no button lit), 1-5 = minimum threshold
  const potStarBtns=[1,2,3,4,5].map(n=>
    `<button class="ftab ${n<=_trFilters.minPot?'on':''}" data-pot="${n}" style="padding:2px 7px;font-size:11px" title="${['Any','Good (2★+)','Great (3★+)','World Class (4★+)','Legendary (5★)'][n-1]}">${'★'.repeat(n)}</button>`
  ).join('');

  const bar=document.createElement('div');
  bar.id='tr-adv-bar';
  bar.style.cssText='padding:8px 14px 10px;border-bottom:1px solid var(--bdr);display:flex;flex-direction:column;gap:7px;background:var(--sur2);flex-shrink:0';
  bar.innerHTML=`
    <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">
      <label style="font-size:10px;color:var(--tx2);font-family:var(--fm);letter-spacing:.5px;white-space:nowrap">SORT</label>
      <select id="tr-sort" style="background:var(--sur3);border:1px solid var(--bdr);color:var(--tx);border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;flex:1;min-width:100px">${sortOpts}</select>
      <select id="tr-league" style="background:var(--sur3);border:1px solid var(--bdr);color:var(--tx);border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;flex:1;min-width:90px">${leagueOpts}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx2);font-family:var(--fm);margin-bottom:3px">
          <span>AGE</span><span id="tr-age-lbl">${_trFilters.minAge}–${_trFilters.maxAge}</span>
        </div>
        <div style="display:flex;gap:5px;align-items:center;padding:10px 0">
          <input type="range" id="tr-age-min" min="15" max="40" value="${_trFilters.minAge}" style="flex:1">
          <input type="range" id="tr-age-max" min="15" max="40" value="${_trFilters.maxAge}" style="flex:1">
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx2);font-family:var(--fm);margin-bottom:3px">
          <span>RATING</span><span id="tr-rat-lbl">${_trFilters.minRat}–${_trFilters.maxRat}</span>
        </div>
        <div style="display:flex;gap:5px;align-items:center;padding:10px 0">
          <input type="range" id="tr-rat-min" min="40" max="99" value="${_trFilters.minRat}" style="flex:1">
          <input type="range" id="tr-rat-max" min="40" max="99" value="${_trFilters.maxRat}" style="flex:1">
        </div>
      </div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx2);font-family:var(--fm);margin-bottom:3px">
        <span>MAX PRICE</span><span id="tr-price-lbl">${_trFilters.maxPrice>0?fmt.money(_trFilters.maxPrice):'No limit'}</span>
      </div>
      <div style="padding:4px 0 2px"><input type="range" id="tr-price" min="0" max="${MAX_PRICE_SLIDER}" step="500000" value="${_trFilters.maxPrice}" style="width:100%"></div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;color:var(--tx2);font-family:var(--fm);letter-spacing:.5px;white-space:nowrap">MIN POT</span>
      <div style="display:flex;gap:3px" id="tr-pot-stars">${potStarBtns}</div>
      <div style="margin-left:auto;display:flex;gap:4px;flex-wrap:wrap">
        <button id="tr-affordable" class="ftab ${_trFilters.affordable?'on':''}" style="padding:3px 8px;font-size:10px;white-space:nowrap" title="Only show players within your budget">💰 Affordable</button>
        <button id="tr-can-sign" class="ftab ${_trFilters.canSign?'on':''}" style="padding:3px 8px;font-size:10px;white-space:nowrap" title="Only show players your club has the reputation to sign">🔓 Can Sign</button>
        <button id="tr-reset" class="ftab" style="padding:3px 8px;font-size:10px;color:var(--acc3);border-color:rgba(232,72,85,.3)">↺ Reset</button>
      </div>
    </div>`;

  // Insert before buy-list
  const buyList=buyPnl.querySelector('.pl-list');
  if(buyList) buyPnl.insertBefore(bar, buyList);

  // Wire controls
  const $d = id => document.getElementById(id);

  $d('tr-sort').value=_trFilters.sort;
  $d('tr-sort').onchange=()=>{ _trFilters.sort=$d('tr-sort').value; _applyAndRenderBuyList(byId,team); };

  $d('tr-league').onchange=()=>{ _trFilters.league=$d('tr-league').value; _applyAndRenderBuyList(byId,team); };

  $d('tr-affordable').onclick=()=>{
    _trFilters.affordable=!_trFilters.affordable;
    $d('tr-affordable').classList.toggle('on',_trFilters.affordable);
    _applyAndRenderBuyList(byId,team);
  };

  $d('tr-can-sign').onclick=()=>{
    _trFilters.canSign=!_trFilters.canSign;
    $d('tr-can-sign').classList.toggle('on',_trFilters.canSign);
    _applyAndRenderBuyList(byId,team);
  };

  const syncAge=()=>{
    let mn=parseInt($d('tr-age-min').value), mx=parseInt($d('tr-age-max').value);
    if(mn>mx)[mn,mx]=[mx,mn];
    _trFilters.minAge=mn; _trFilters.maxAge=mx;
    $d('tr-age-lbl').textContent=mn+'–'+mx;
    _applyAndRenderBuyList(byId,team);
  };
  $d('tr-age-min').oninput=$d('tr-age-max').oninput=syncAge;

  const syncRat=()=>{
    let mn=parseInt($d('tr-rat-min').value), mx=parseInt($d('tr-rat-max').value);
    if(mn>mx)[mn,mx]=[mx,mn];
    _trFilters.minRat=mn; _trFilters.maxRat=mx;
    $d('tr-rat-lbl').textContent=mn+'–'+mx;
    _applyAndRenderBuyList(byId,team);
  };
  $d('tr-rat-min').oninput=$d('tr-rat-max').oninput=syncRat;

  $d('tr-price').oninput=()=>{
    const v=parseInt($d('tr-price').value);
    _trFilters.maxPrice=v; // 0 = no limit
    $d('tr-price-lbl').textContent=v>0?fmt.money(v):'No limit';
    _applyAndRenderBuyList(byId,team);
  };

  // Potential stars: click same star again to clear (toggle off)
  document.querySelectorAll('#tr-pot-stars [data-pot]').forEach(btn=>{
    btn.onclick=()=>{
      const n=parseInt(btn.dataset.pot);
      // Toggle off if already at this level
      _trFilters.minPot = (_trFilters.minPot===n) ? 0 : n;
      document.querySelectorAll('#tr-pot-stars [data-pot]').forEach(b=>
        b.classList.toggle('on', parseInt(b.dataset.pot)<=_trFilters.minPot && _trFilters.minPot>0)
      );
      _applyAndRenderBuyList(byId,team);
    };
  });

  $d('tr-reset').onclick=()=>{
    Object.assign(_trFilters,{pos:'ALL',league:'ALL',sort:'rating',minAge:15,maxAge:40,minRat:40,maxRat:99,maxPrice:0,minPot:0,query:'',affordable:false,canSign:false,page:0});
    $d('tr-sort').value='rating';
    $d('tr-league').value='ALL';
    $d('tr-affordable').classList.remove('on');
    $d('tr-can-sign').classList.remove('on');
    $d('tr-age-min').value=15; $d('tr-age-max').value=40; $d('tr-age-lbl').textContent='15–40';
    $d('tr-rat-min').value=40; $d('tr-rat-max').value=99; $d('tr-rat-lbl').textContent='40–99';
    $d('tr-price').value=0; $d('tr-price-lbl').textContent='No limit';
    document.querySelectorAll('#tr-filters .ftab').forEach(t=>t.classList.remove('on'));
    document.querySelector('#tr-filters .ftab')?.classList.add('on');
    document.querySelectorAll('#tr-pot-stars [data-pot]').forEach(b=>b.classList.remove('on'));
    const si=document.getElementById('tr-search'); if(si) si.value='';
    _applyAndRenderBuyList(byId,team);
  };
}

export function _applyAndRenderBuyList(byId, team, keepPage){
  if(!keepPage) _trFilters.page=0;
  // Cache refs so pagination can re-call without needing them passed in
  if(byId) _trByIdCache=byId;
  if(team) _trTeamCache=team;
  const _byId=_trByIdCache, _team=_trTeamCache;
  const f=_trFilters;
  const allTeams=Array.from(_byId.values());
  const leagueByTeam=new Map(allTeams.map(t=>[t.id, t.league||'Premier League']));
  const budget=_team?.budget||0;
  const userRep=_team?.reputation??60;

  let fil=[..._buyTargets];

  // Position filter
  if(f.pos!=='ALL') fil=fil.filter(p=>posGroup(p.position)===f.pos);
  // League filter
  if(f.league!=='ALL') fil=fil.filter(p=>leagueByTeam.get(p.teamId)===f.league);
  // Age filter
  fil=fil.filter(p=>(p.age||25)>=f.minAge&&(p.age||25)<=f.maxAge);
  // Rating filter
  fil=fil.filter(p=>primaryRating(p)>=f.minRat&&primaryRating(p)<=f.maxRat);
  // Max price: 0 means no limit
  if(f.maxPrice>0) fil=fil.filter(p=>(formAdjustedValue?formAdjustedValue(p):p.value)<=f.maxPrice);
  // Affordable: only players within budget (minimum offer ~88% of value)
  if(f.affordable) fil=fil.filter(p=>{
    const fv=formAdjustedValue?formAdjustedValue(p):p.value;
    return Math.floor(fv*0.88)<=budget;
  });
  // Can Sign: only players club has rep to sign
  if(f.canSign) fil=fil.filter(p=>{
    if(typeof canClubSignPlayer!=='function') return true;
    return canClubSignPlayer({reputation:userRep}, p);
  });
  // Potential filter: 0 = no minimum, 1-5 = minimum stars
  if(f.minPot>0) fil=fil.filter(p=>(typeof getPotentialStars==='function'?getPotentialStars(p):1)>=f.minPot);
  // Text search
  if(f.query) fil=fil.filter(p=>p.name.toLowerCase().includes(f.query)||(_byId.get(p.teamId)?.name||'').toLowerCase().includes(f.query));

  // Sort
  const sortFns={
    rating:(a,b)=>primaryRating(b)-primaryRating(a),
    value:(a,b)=>(formAdjustedValue?formAdjustedValue(b):b.value)-(formAdjustedValue?formAdjustedValue(a):a.value),
    age:(a,b)=>(a.age||25)-(b.age||25),
    potential:(a,b)=>(typeof getPotentialStars==='function'?getPotentialStars(b)-getPotentialStars(a):0),
    goals:(a,b)=>(b.goals||0)-(a.goals||0),
    assists:(a,b)=>(b.assists||0)-(a.assists||0),
  };
  fil.sort(sortFns[f.sort]||sortFns.rating);

  const PAGE_SIZE=100;
  const totalPages=Math.max(1,Math.ceil(fil.length/PAGE_SIZE));
  // Clamp page in case filters reduced total
  if(f.page>=totalPages) f.page=totalPages-1;
  const pageSlice=fil.slice(f.page*PAGE_SIZE, (f.page+1)*PAGE_SIZE);

  // Count badge — show total, not just page slice
  const countEl=document.getElementById('tr-count');
  if(countEl) countEl.textContent=fil.length+' player'+(fil.length!==1?'s':'');

  renderBuyList(_byId, pageSlice, userRep, fil.length, totalPages, f.page);
}

export function renderBuyList(byId, filteredPlayers, userRep, totalCount, totalPages, currentPage){
  const el=document.getElementById('buy-list');
  if(!el) return;
  totalCount=totalCount??filteredPlayers.length;
  totalPages=totalPages??1;
  currentPage=currentPage??0;
  if(!filteredPlayers.length){el.innerHTML='<div class="no-data" style="padding:24px;text-align:center"><div style="font-size:24px;margin-bottom:8px">🔍</div>No players match your filters.<br><span style="font-size:11px;color:var(--txd)">Try adjusting the sliders above.</span></div>';return;}
  const rep=userRep??60;
  el.innerHTML=filteredPlayers.map(p=>{
    const g=posGroup(p.position),r=primaryRating(p);
    const teamRec=byId.get(p.teamId);
    const tn=teamRec?.name||'Unknown';
    const league=teamRec?.league||'';
    const shortName=teamRec?.shortName||tn.slice(0,3).toUpperCase();
    const leagueNation={'Premier League':'ENG','Championship':'ENG','League One':'ENG','League Two':'ENG','La Liga':'ESP','Bundesliga':'GER','Serie A':'ITA','Ligue 1':'FRA','Eredivisie':'NED'}[league]||'INT';
    const natFlag=playerNationality(p,league);
    const fv=formAdjustedValue?formAdjustedValue(p):p.value;
    const potStars=getPotentialStars?getPotentialStars(p):0;
    const potColor=['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars]??'#8a9ab0';
    const potDisp=potStars?'★'.repeat(potStars):'';
    const tag=(txt,col)=>'<span style="background:'+(col||'var(--sur3)')+';border:1px solid var(--bdr);padding:0 4px;border-radius:3px;font-size:9px;font-family:var(--fm);color:var(--tx2)">'+txt+'</span>';
    // Rep gate check (synchronous — rep passed in)
    const minRep=typeof playerMinRepToSign==='function'?playerMinRepToSign(p):0;
    const adjMin=p.transferListed?Math.max(0,minRep-4):minRep;
    const repLocked=adjMin>0&&rep<adjMin;
    const seasonLocked=!!p.signedThisSeason;
    const lockBadge=seasonLocked
      ?'<span title="Already transferred this season" style="font-size:10px;opacity:0.85">📋</span>'
      :repLocked?'<span title="Rep '+adjMin+'+ required" style="font-size:10px;opacity:0.85">🔒</span>':'';
    const rowCls=(p.id===_selPid?'sel ':'')+( seasonLocked?'rep-locked':repLocked?'rep-locked':'');
    return '<div class="pl-row '+rowCls+'" data-pid="'+p.id+'">'
      +'<div class="pl-av" style="font-size:18px;background:none;border:none">'+natFlag+'</div>'
      +'<div class="pl-info">'
        +'<div class="pl-name">'+p.name+' '+lockBadge+'</div>'
        +'<div class="pl-meta"><span class="pos '+g+'">'+p.position+'</span>'+tag(shortName)+' '+tag(leagueNation)+'<span>Age '+p.age+'</span>'+(potDisp?'<span style="color:'+potColor+';font-size:10px">'+potDisp+'</span>':'')+'</div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">'
        +'<div class="pl-val">'+fmt.money(fv)+'</div>'
        +'<div class="pl-rat" style="font-size:12px;background:none;color:var(--acc2)">'+r+'</div>'
      +'</div>'
    +'</div>';
  }).join('');
  el.querySelectorAll('.pl-row').forEach(row=>{
    row.onclick=()=>{
      _selPid=row.dataset.pid;
      el.querySelectorAll('.pl-row').forEach(r=>r.classList.remove('sel'));
      row.classList.add('sel');
      const player=filteredPlayers.find(p=>p.id===_selPid);
      if(player){
        // On mobile show detail panel; on desktop open squad player modal
        if(window.innerWidth>=900){
          openSquadPlayerModal(player,[],null);
        } else {
          renderPlayerDetail(player,byId);
          document.getElementById('tr-layout')?.classList.add('dp-open');
        }
      }
    };
  });

  // Pagination controls (only shown when more than one page)
  let pag=el.parentElement.querySelector('.tr-pagination');
  if(totalPages<=1){
    if(pag) pag.remove();
    return;
  }
  if(!pag){
    pag=document.createElement('div');
    pag.className='tr-pagination';
    pag.style.cssText='display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px;border-top:1px solid var(--bdr);background:var(--sur2);flex-shrink:0';
    el.parentElement.appendChild(pag);
  }
  const pageLabel=`<span style="font-size:11px;color:var(--tx2);font-family:var(--fm);padding:0 4px">Page ${currentPage+1} of ${totalPages}</span>`;
  const btnStyle=(disabled)=>`style="background:var(--sur3);border:1px solid var(--bdr);color:${disabled?'var(--txd)':'var(--tx)'};border-radius:5px;padding:4px 10px;font-size:12px;cursor:${disabled?'default':'pointer'};opacity:${disabled?'0.4':'1'}"`;
  pag.innerHTML=`
    <button id="tr-pg-first" ${btnStyle(currentPage===0)} ${currentPage===0?'disabled':''}>«</button>
    <button id="tr-pg-prev"  ${btnStyle(currentPage===0)} ${currentPage===0?'disabled':''}>‹ Prev</button>
    ${pageLabel}
    <button id="tr-pg-next"  ${btnStyle(currentPage>=totalPages-1)} ${currentPage>=totalPages-1?'disabled':''}>Next ›</button>
    <button id="tr-pg-last"  ${btnStyle(currentPage>=totalPages-1)} ${currentPage>=totalPages-1?'disabled':''}>»</button>
  `;
  const goTo=(n)=>{ _trFilters.page=n; _applyAndRenderBuyList(null, null, true); el.scrollIntoView({behavior:'smooth',block:'start'}); };
  pag.querySelector('#tr-pg-first').onclick=()=>{ if(currentPage>0) goTo(0); };
  pag.querySelector('#tr-pg-prev').onclick=()=>{ if(currentPage>0) goTo(currentPage-1); };
  pag.querySelector('#tr-pg-next').onclick=()=>{ if(currentPage<totalPages-1) goTo(currentPage+1); };
  pag.querySelector('#tr-pg-last').onclick=()=>{ if(currentPage<totalPages-1) goTo(totalPages-1); };
}
export async function renderPlayerDetail(player,byId){
  const el=document.getElementById('det-panel');
  if(!el) return;
  const _sv=await getSave();
  const _winStatus=typeof transferWindowStatus==='function'?transferWindowStatus(_sv):{open:true};
  const _windowClosed=!_winStatus.open;
  const _isCollapsed=(_sv.collapsedDeals||[]).includes(player.id);
  const _userTeam=await getTeam(_sv.userTeamId);
  const _userRep=_userTeam?.reputation??60;
  // Always re-fetch the player from DB so we get the latest flags (e.g. signedThisSeason
  // stamped after a sell in the same session — the closure may hold stale data)
  const _freshPlayer = (typeof getPlayer==='function' ? await getPlayer(player.id) : null) ?? player;
  const _minRep=typeof playerMinRepToSign==='function'?playerMinRepToSign(_freshPlayer):0;
  const _adjMinRep=_freshPlayer.transferListed?Math.max(0,_minRep-4):_minRep;
  const _repBlocked=_adjMinRep>0&&_userRep<_adjMinRep;
  const _seasonLocked=!!_freshPlayer.signedThisSeason;
  // Use fresh player data throughout this render
  player = _freshPlayer;
  const teamRec=byId.get(player.teamId);
  const tn=teamRec?.name||'Unknown';
  const league=teamRec?.league||'';
  const teamShort=teamRec?.shortName||tn.slice(0,3).toUpperCase();
  const g=posGroup(player.position),r=primaryRating(player);
  const fv=formAdjustedValue?formAdjustedValue(player):player.value;
  const minOff=Math.floor(fv*0.88), initOff=Math.floor(fv*0.95);
  const fl=formLabel(player);
  const potStars=getPotentialStars?getPotentialStars(player):0;
  const potLabel=getPotentialLabel?getPotentialLabel(player):'';
  const potColor=['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars]??'#8a9ab0';
  const potDisp=potStars?'★'.repeat(potStars)+'☆'.repeat(5-potStars):'';
  const isWonderkid=player.isWonderkid===true;
  const fitnessColor=(player.fitness??100)>=75?'var(--acc)':(player.fitness??100)>=50?'var(--acc2)':'var(--acc3)';

  const abar=(lbl,val,pri)=>{
    const pct=Math.round((val/99)*100);
    const col=pri?'linear-gradient(90deg,var(--acc),#7fff9a)':'linear-gradient(90deg,#4a6fa5,#6b8ccc)';
    return`<div>
      <div class="attr-n" style="${pri?'color:var(--acc)':''};">${lbl}</div>
      <div class="attr-bw"><div class="attr-b" style="width:${pct}%;background:${col}"></div></div>
      <div class="attr-v" style="${pri?'color:var(--acc)':''}">${val}</div>
    </div>`;
  };

  // Pre-compute offer section HTML to avoid nested backtick issues
  const _offerSectionHtml = _isCollapsed
    ? '<div class="offer-sec" style="opacity:0.6"><div style="background:rgba(232,72,85,0.12);border:1px solid var(--acc3);border-radius:8px;padding:12px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc3);margin-bottom:4px">🚫 Deal Collapsed</div><div style="font-size:11px;color:var(--tx2)">Negotiations broke down earlier this window. You cannot make another offer until the next transfer window.</div></div></div><div class="tr-acts"><button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button></div>'
    : _seasonLocked
      ? '<div class="offer-sec"><div style="background:rgba(245,200,66,0.10);border:1px solid rgba(245,200,66,0.3);border-radius:8px;padding:12px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc2);margin-bottom:4px">📋 Already Transferred</div><div style="font-size:11px;color:var(--tx2)">This player has already moved clubs this season and cannot transfer again until next season.</div></div></div><div class="tr-acts"><button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button></div>'
      : _repBlocked
        ? '<div class="offer-sec"><div style="background:rgba(232,72,85,0.12);border:1px solid rgba(232,72,85,0.35);border-radius:8px;padding:12px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc3);margin-bottom:4px">🔒 Reputation Required: '+_adjMinRep+'+</div><div style="font-size:11px;color:var(--tx2)">Your club (rep '+_userRep+') isn\'t attractive enough for a '+r+'-rated player.'+(player.transferListed?' (Listed — reduced requirement applied.)':'')+'</div></div></div><div class="tr-acts"><button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button></div>'
        : _windowClosed
          ? '<div class="offer-sec"><div style="background:rgba(232,72,85,0.10);border:1px solid rgba(232,72,85,0.3);border-radius:8px;padding:12px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc3);margin-bottom:4px">🔴 Window Closed</div><div style="font-size:11px;color:var(--tx2)">'+(_winStatus.label||'Transfer window is currently closed.')+'</div></div></div><div class="tr-acts"><button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button></div>'
          : '<div class="offer-sec"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px"><div class="offer-lbl">Your Offer</div><div style="font-size:10px;color:var(--txd);font-family:var(--fm)">Min ~'+fmt.money(minOff)+'</div></div><div class="offer-row"><input type="range" id="offer-slider" min="'+Math.floor(minOff*0.7)+'" max="'+Math.floor(fv*1.6)+'" value="'+initOff+'" step="100000"><div id="offer-val" class="offer-v">'+fmt.money(initOff)+'</div></div><div id="offer-likelihood" class="offer-hint" style="margin-top:5px;color:var(--acc)">Likely accepted ✓</div></div><div class="tr-acts"><button class="btn btn-p" id="btn-offer">Make Offer</button><button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button></div>';
  const baseVal=player.value||fv;
  const valChange=fv-baseVal;
  const valPct=Math.round(Math.min(100,(fv/Math.max(fv,baseVal))*100));

  el.innerHTML=`
    <div class="det-hero">
      <div class="det-rat">${r}</div>
      <div class="det-av" style="font-size:28px;background:none;border:none">${playerNationality(player,league)}</div>
      <div class="det-name">${player.name}</div>
      ${isWonderkid?`<div style="background:linear-gradient(135deg,#f5c842,#f97316);color:#000;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:1.5px;font-family:var(--fm);margin:4px auto 0;display:inline-block">WONDERKID ⚡</div>`:''}
      <div class="det-info" style="margin-top:6px"><span style="background:var(--sur3);border:1px solid var(--bdr);padding:1px 5px;border-radius:3px;font-size:9px;font-family:var(--fm);color:var(--tx2)">${teamShort}</span><span>${tn}</span><span class="pos ${g}">${player.position}</span><span>Age ${player.age}</span></div>
      <div style="margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap">
        <span class="fb ${fl.cls}">${fl.text}</span>
        <span style="color:${fitnessColor};font-size:11px;font-family:var(--fm)">🏃 ${Math.round(player.fitness??100)}%</span>
        ${(player.goals||0)>0?`<span style="font-size:11px;color:var(--tx2)">⚽ ${player.goals}</span>`:''}
        ${(player.assists||0)>0?`<span style="font-size:11px;color:var(--tx2)">🎯 ${player.assists}</span>`:''}
        ${(player.cleanSheets||0)>0?`<span style="font-size:11px;color:var(--tx2)">🧤 ${player.cleanSheets}</span>`:''}
      </div>
    </div>

    <!-- Potential -->
    <div class="vrow" style="flex-direction:column;align-items:flex-start;gap:5px">
      <div style="display:flex;justify-content:space-between;width:100%">
        <span class="vlbl">✨ Potential</span>
        <span style="color:${potColor};font-family:var(--fm);font-size:12px;font-weight:700">${potLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <div style="color:${potColor};font-size:18px;letter-spacing:2px">${potDisp}</div>
        <div style="flex:1;height:4px;background:var(--sur3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${(potStars/5)*100}%;background:${potColor};border-radius:2px;transition:width .4s"></div>
        </div>
        <span style="font-family:var(--fm);font-size:10px;color:var(--txd)">${player.potentialRating??r}/99</span>
      </div>
    </div>

    <!-- Value -->
    <div class="vrow">
      <span class="vlbl">Form Value</span>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span class="vamt">${fmt.money(fv)}</span>
        ${valChange!==0?`<span style="font-size:10px;color:${valChange>0?'var(--acc)':'var(--acc3)'};font-family:var(--fm)">${valChange>0?'+':''}${fmt.money(valChange)} vs base</span>`:''}
      </div>
    </div>
    <div class="vrow" style="border-top:none;padding-top:0">
      <span class="vlbl">Weekly Wage</span>
      <span class="vamt" style="font-size:14px;color:var(--tx2)">${fmt.wage(player.wage)}</span>
    </div>
    <div class="vrow" style="border-top:none;padding-top:0">
      <span class="vlbl">Annual Wage</span>
      <span style="font-size:12px;color:var(--txd);font-family:var(--fm)">${fmt.money((player.wage||0)*52)}/yr</span>
    </div>

    <!-- Attributes -->
    <div class="attr-grid">
      ${abar('Attack',player.attack,g==='ATT')}
      ${abar('Midfield',player.midfield,g==='MID')}
      ${abar('Defence',player.defence,g==='DEF')}
      ${abar('GK',player.goalkeeping,g==='GK')}
    </div>

    <!-- Offer -->
    ${_offerSectionHtml}
  `;


  const back=el.querySelector('#btn-det-back');
  if(back&&window.innerWidth<=768){back.style.display='block';back.onclick=()=>document.getElementById('tr-layout')?.classList.remove('dp-open');}

  if(_isCollapsed) return; // No offer controls when deal collapsed
  if(_seasonLocked) return; // Season transfer limit blocks offer controls
  if(_repBlocked) return; // Rep gate blocks offer controls entirely

  const sl=document.getElementById('offer-slider'),dv=document.getElementById('offer-val'),lh=document.getElementById('offer-likelihood');
  const updateOfferHint=()=>{
    const v=Number(sl?.value||fv);
    if(dv) dv.textContent=fmt.money(v);
    if(!lh) return;
    if(v>=fv)          { lh.textContent='🤑 Over value — very likely accepted'; lh.style.color='var(--acc)'; }
    else if(v>=minOff) { lh.textContent='✓ Likely accepted'; lh.style.color='var(--acc)'; }
    else if(v>=minOff*0.88){ lh.textContent='⚠️ May be rejected'; lh.style.color='var(--acc2)'; }
    else               { lh.textContent='✕ Will be rejected'; lh.style.color='var(--acc3)'; }
  };
  if(sl){ sl.oninput=updateOfferHint; updateOfferHint(); }

  const ob=document.getElementById('btn-offer');
  if(ob) ob.onclick=()=>{
    const offer=Number(sl?.value||fv);
    showModal('Confirm Offer',`
      <div class="ctr">
        <div class="ctr-pl"><strong>${player.name}</strong><span class="pos ${g}">${player.position}</span></div>
        <div class="ctr-row"><span>From</span><strong>${teamShort} ${tn}</strong></div>
        <div class="ctr-row"><span>Age</span><strong>${player.age}</strong></div>
        <div class="ctr-row"><span>Rating</span><strong>${r}</strong></div>
        <div class="ctr-row"><span>Potential</span><strong style="color:${potColor}">${potLabel} ${potDisp}</strong></div>
        <div class="ctr-row"><span>Offer</span><strong style="color:var(--acc2)">${fmt.money(offer)}</strong></div>
        <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fv)}</strong></div>
        <div class="ctr-row"><span>Weekly Wage</span><strong>${fmt.wage(player.wage)}</strong></div>
        ${offer<minOff?`<div class="ctr-warn">⚠️ Below min ~${fmt.money(minOff)} — likely rejected</div>`:''}
      </div>`,
      [{id:'c',label:'Send Offer',cls:'btn-p',handler:async()=>{
        try{
          const cardEl=document.querySelector(`[data-pid="${player.id}"]`);
          if(cardEl) cardEl.closest('.pl-item,.pl-row')?.remove();
          await buyPlayer(player.id,offer);
          toast(`✅ ${player.name} signed for ${fmt.money(offer)}!`,'success',5000);
          if(typeof newsPlayerSigned==='function') newsPlayerSigned(player,offer,await getSave()).catch(()=>{});
          _selPid=null; document.getElementById('tr-layout')?.classList.remove('dp-open');
          await renderTransfers();
        }catch(err){
          if(err.message==='OFFER_REJECTED'){
            // Generate an instant counter from the selling club
            const counter=typeof generateBuyCounter==='function'?generateBuyCounter(player,offer):null;
            if(counter){
              const userTeam=await getTeam((await getSave()).userTeamId);
              const budget=userTeam?.budget??0;
              const cMin=Math.floor(offer);
              const cMax=Math.min(budget,Math.floor(counter.fee*1.3));
              const cDef=Math.min(budget,counter.fee);
              showModal(`💬 ${tn} Counter-Offer`,`
                <div class="ctr">
                  <div class="ctr-pl"><strong>${player.name}</strong><span class="pos ${g}">${player.position}</span></div>
                  <div class="ctr-row"><span>Your Offer</span><strong style="color:var(--acc3)">${fmt.money(offer)}</strong></div>
                  <div class="ctr-row"><span>They Want</span><strong style="color:var(--acc2)">${fmt.money(counter.fee)}</strong></div>
                  <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fv)}</strong></div>
                  <div class="ctr-row"><span>Budget</span><strong>${fmt.money(budget)}</strong></div>
                  ${budget<counter.fee?`<div class="ctr-warn">⚠️ Their asking price exceeds your budget</div>`:''}
                  <div style="margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--tx)">Your Revised Offer</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <input type="range" id="buy-counter-slider" min="${cMin}" max="${cMax}" value="${cDef}" step="100000" style="flex:1">
                    <div id="buy-counter-val" style="font-family:var(--fd);font-size:18px;color:var(--acc2);min-width:80px;text-align:right">${fmt.money(cDef)}</div>
                  </div>
                  <div id="buy-counter-hint" style="font-size:11px;margin-top:5px"></div>
                </div>`,
                [{id:'acc',label:'Send Revised Offer',cls:'btn-p',handler:async()=>{
                  const revOffer=Number(document.getElementById('buy-counter-slider')?.value||cDef);
                  try{
                    await buyPlayer(player.id,revOffer);
                    toast(`✅ ${player.name} signed for ${fmt.money(revOffer)}!`,'success',5000);
                    if(typeof newsPlayerSigned==='function') newsPlayerSigned(player,revOffer,await getSave()).catch(()=>{});
                    _selPid=null; document.getElementById('tr-layout')?.classList.remove('dp-open');
                    await renderTransfers();
                  }catch(e2){
                    if(e2.message==='OFFER_REJECTED'){
                      const _s=await getSave(); const _cd=[...(_s.collapsedDeals||[]),player.id]; await putSave({..._s,collapsedDeals:_cd});
                      toast(`❌ ${tn} still not satisfied — deal collapsed`,'error',4000);
                    }
                    else toast(`❌ ${e2.message}`,'error',4000);
                  }
                }},{id:'x',label:'Walk Away',cls:'btn-s'}]
              );
              // Wire slider
              const bsl=document.getElementById('buy-counter-slider'),bvl=document.getElementById('buy-counter-val'),bhn=document.getElementById('buy-counter-hint');
              if(bsl){
                const updateBuyHint=()=>{
                  const v=Number(bsl.value);
                  if(bvl) bvl.textContent=fmt.money(v);
                  if(bhn){
                    if(v>=counter.fee){ bhn.textContent='🤝 Meets their asking price'; bhn.style.color='var(--acc)'; }
                    else if(v>=counter.fee*0.95){ bhn.textContent='✓ Very close — likely accepted'; bhn.style.color='var(--acc)'; }
                    else if(v>=counter.fee*0.85){ bhn.textContent='⚠️ Below asking — they may accept'; bhn.style.color='var(--acc2)'; }
                    else{ bhn.textContent='✕ Too low — will probably be rejected'; bhn.style.color='var(--acc3)'; }
                  }
                };
                bsl.oninput=updateBuyHint; updateBuyHint();
              }
            } else {
              const _s2=await getSave(); const _cd2=[...(_s2.collapsedDeals||[]),player.id]; await putSave({..._s2,collapsedDeals:_cd2});
              toast(`❌ ${tn} rejected and won't negotiate further`,'error',5000);
            }
          } else {
            const msgs={INSUFFICIENT_FUNDS:'Not enough budget.',ALREADY_IN_SQUAD:'Already in your squad.',REP_TOO_LOW:'Your club\'s reputation is too low to attract this calibre of player.',WINDOW_CLOSED:'The transfer window is closed. You can only sign players in the summer (Aug) or winter (Jan) windows.',SIGNED_THIS_SEASON:'This player has already transferred once this season and cannot move again until next season.'};
            toast(`❌ ${msgs[err.message]||err.message}`,'error',6000);
          }
        }
      }},{id:'x',label:'Cancel',cls:'btn-s'}]
    );
  };
}
// ─── Loan Market UI ────────────────────────────────────────────
export let _loanMode='in'; // 'in' | 'out'

export async function renderLoanMarket(){
  const el=document.getElementById('loan-list');
  const countEl=document.getElementById('loan-count');
  if(!el) return;

  const save=await getSave();
  const winStatus=typeof transferWindowStatus==='function'?transferWindowStatus(save):{open:true};
  const winClosed=!winStatus.open;

  // Wire sub-tabs
  document.querySelectorAll('#loan-tabs .ftab').forEach(t=>{
    t.onclick=()=>{
      _loanMode=t.dataset.lt;
      document.querySelectorAll('#loan-tabs .ftab').forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      renderLoanMarket();
    };
  });

  if(winClosed){
    el.innerHTML=`<div style="padding:20px 14px;text-align:center;font-size:12px;color:var(--acc3);font-family:var(--fm)">🔴 Loan market closed — loans can only be arranged during transfer windows</div>`;
    if(countEl) countEl.textContent='';
    return;
  }

  if(_loanMode==='in'){
    await _renderLoanInList(el, countEl, save);
  } else {
    await _renderLoanOutList(el, countEl, save);
  }
}

export async function _renderLoanInList(el, countEl, save){
  const allTeams=await getAllTeams();
  const byId=new Map(allTeams.map(t=>[t.id,t]));
  const userTeam=byId.get(save.userTeamId);
  const userBudget=userTeam?.budget??0;

  const loanable=typeof getLoanableInPlayers==='function'?await getLoanableInPlayers(save):[];
  if(countEl) countEl.textContent=loanable.length+' available';

  if(!loanable.length){
    el.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--tx2)"><div style="font-size:24px;margin-bottom:8px">🤝</div>No loan players available right now.<br><span style="font-size:11px;color:var(--txd)">Check back after the next gameweek as clubs release their fringe youth.</span></div>';
    return;
  }

  el.innerHTML=loanable.sort((a,b)=>(b.age<=22?1:0)-(a.age<=22?1:0)||(b.potentialRating??70)-(a.potentialRating??70)).map(p=>{
    const parentTeam=byId.get(p.teamId);
    const pName=parentTeam?.name??'Unknown';
    const pShort=parentTeam?.shortName??pName.slice(0,3).toUpperCase();
    const g=typeof posGroup==='function'?posGroup(p.position):'MID';
    const r=typeof primaryRating==='function'?primaryRating(p):70;
    const fee=typeof _loanFee==='function'?_loanFee(p):Math.round((p.value??0)*0.1);
    const wageCost=typeof _loanWageCost==='function'?_loanWageCost(p,save):(p.wage??0)*20;
    const total=fee+wageCost;
    const canAfford=userBudget>=total;
    const potStars=typeof getPotentialStars==='function'?getPotentialStars(p):0;
    const potColor=['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars]??'#8a9ab0';
    return`<div class="pl-row${canAfford?'':' rep-locked'}" data-lpid="${p.id}" style="cursor:pointer">
      <div class="pl-av" style="background:var(--sur3);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--tx2);letter-spacing:.5px">${g}</div>
      <div class="pl-info">
        <div class="pl-name">${p.name}${p.isWonderkid?` <span style="font-size:9px;color:#f5c842">⚡</span>`:''}</div>
        <div class="pl-meta"><span class="pos ${g}">${p.position}</span><span style="font-size:9px;font-family:var(--fm);background:var(--sur3);border:1px solid var(--bdr);padding:0 3px;border-radius:3px;color:var(--tx2)">${pShort}</span><span>Age ${p.age}</span>${potStars?`<span style="color:${potColor};font-size:10px">${'★'.repeat(potStars)}</span>`:''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        <div style="font-size:11px;font-weight:700;color:${canAfford?'var(--acc)':'var(--acc3)'};font-family:var(--fm)">${fmt.money(total)}</div>
        <div style="font-size:9px;color:var(--txd);font-family:var(--fm)">Fee+Wages</div>
        <div class="pl-rat" style="font-size:12px;background:none;color:var(--acc2)">${r}</div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-lpid]').forEach(row=>{
    row.onclick=()=>{
      const p=loanable.find(x=>x.id===row.dataset.lpid);
      if(p) _showLoanInDetail(p,byId,save,userBudget);
    };
  });
}

export async function _renderLoanOutList(el, countEl, save){
  const players=await getPlayersByTeam(save.userTeamId);
  const allTeams=await getAllTeams();
  const byId=new Map(allTeams.map(t=>[t.id,t]));

  // Show players who can be loaned out: not already on loan, not signed this season
  const eligible=players.filter(p=>!p.onLoan&&!p.loanedFrom&&!p.signedThisSeason);
  if(countEl) countEl.textContent=eligible.length+' eligible';

  if(!eligible.length){
    el.innerHTML='<div style="padding:24px;text-align:center;font-size:12px;color:var(--tx2)">No players available to loan out.</div>';
    return;
  }

  el.innerHTML=eligible.sort((a,b)=>(typeof primaryRating==='function'?primaryRating(b)-primaryRating(a):0)).map(p=>{
    const g=typeof posGroup==='function'?posGroup(p.position):'MID';
    const r=typeof primaryRating==='function'?primaryRating(p):70;
    const fee=typeof _loanFee==='function'?_loanFee(p):Math.round((p.value??0)*0.1);
    const wageCost=typeof _loanWageCost==='function'?_loanWageCost(p,save):(p.wage??0)*20;
    const relief=fee+wageCost;
    return`<div class="pl-row" data-lop="${p.id}" style="cursor:pointer">
      <div class="pl-av" style="background:var(--sur3);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--tx2);letter-spacing:.5px">${g}</div>
      <div class="pl-info">
        <div class="pl-name">${p.name}</div>
        <div class="pl-meta"><span class="pos ${g}">${p.position}</span><span>Age ${p.age}</span><span style="font-size:9px;color:var(--tx2)">${fmt.wage(p.wage)}/wk</span></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        <div style="font-size:11px;font-weight:700;color:var(--acc);font-family:var(--fm)">+${fmt.money(relief)}</div>
        <div style="font-size:9px;color:var(--txd);font-family:var(--fm)">Budget relief</div>
        <div class="pl-rat" style="font-size:12px;background:none;color:var(--acc2)">${r}</div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-lop]').forEach(row=>{
    row.onclick=()=>{
      const p=eligible.find(x=>x.id===row.dataset.lop);
      if(p) _showLoanOutDetail(p,save);
    };
  });
}

export function _showLoanInDetail(player, byId, save, userBudget){
  const parentTeam=byId.get(player.teamId);
  const pName=parentTeam?.name??'Unknown';
  const g=typeof posGroup==='function'?posGroup(player.position):'MID';
  const r=typeof primaryRating==='function'?primaryRating(player):70;
  const fee=typeof _loanFee==='function'?_loanFee(player):Math.round((player.value??0)*0.1);
  const wageCost=typeof _loanWageCost==='function'?_loanWageCost(player,save):(player.wage??0)*20;
  const total=fee+wageCost;
  const gwsLeft=Math.max(0,(save.totalGameweeks??38)-(save.currentGameweek??1)+1);
  const canAfford=userBudget>=total;
  const potStars=typeof getPotentialStars==='function'?getPotentialStars(player):0;
  const potLabel=typeof getPotentialLabel==='function'?getPotentialLabel(player):'';
  const potColor=['','#8a9ab0','#22c55e','#3b82f6','#f5c842','#e84855'][potStars]??'#8a9ab0';

  showModal(`Loan ${player.name}`,`
    <div class="ctr">
      <div class="ctr-pl"><strong>${player.name}</strong><span class="pos ${g}">${player.position}</span></div>
      <div class="ctr-row"><span>Parent Club</span><strong>${pName}</strong></div>
      <div class="ctr-row"><span>Age</span><strong>${player.age}</strong></div>
      <div class="ctr-row"><span>Rating</span><strong>${r}</strong></div>
      <div class="ctr-row"><span>Potential</span><strong style="color:${potColor}">${potLabel} ${'★'.repeat(potStars)}</strong></div>
      <div class="ctr-row"><span>Weekly Wage</span><strong>${fmt.wage(player.wage)}</strong></div>
      <div style="margin:12px 0 4px;padding:10px;background:var(--sur3);border-radius:8px;border:1px solid var(--bdr)">
        <div style="font-size:10px;font-weight:700;color:var(--tx2);letter-spacing:.5px;margin-bottom:8px">COST BREAKDOWN</div>
        <div class="ctr-row" style="border:none;padding:2px 0"><span>Loan Fee (10% value)</span><strong style="color:var(--acc2)">${fmt.money(fee)}</strong></div>
        <div class="ctr-row" style="border:none;padding:2px 0"><span>Wages × ${gwsLeft} GWs</span><strong style="color:var(--acc2)">${fmt.money(wageCost)}</strong></div>
        <div class="ctr-row" style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px"><span>Total Upfront Cost</span><strong style="color:var(--acc);font-size:14px">${fmt.money(total)}</strong></div>
      </div>
      <div class="ctr-row"><span>Your Budget</span><strong style="color:${canAfford?'var(--acc)':'var(--acc3)'}">${fmt.money(userBudget)}</strong></div>
      ${!canAfford?`<div class="ctr-warn">⚠️ Insufficient budget for this loan</div>`:''}
      <div style="font-size:11px;color:var(--txd);margin-top:8px">Player returns at season end. Loan fee goes to ${pName}.</div>
    </div>`,
    canAfford?[
      {id:'li',label:'Confirm Loan',cls:'btn-p',handler:async()=>{
        try{
          const res=await loanInPlayer(player.id);
          toast(`✅ ${player.name} joined on loan from ${res.parentClubName}!`,'success',5000);
          await renderTransfers();
          renderLoanMarket();
        }catch(err){
          const msgs={WINDOW_CLOSED:'Transfer window is closed.',ALREADY_ON_LOAN:'Player is already out on loan.',SIGNED_THIS_SEASON:'Player already moved this season.',INSUFFICIENT_FUNDS:'Not enough budget.',CLUB_WONT_LOAN:'This club won\'t loan out this player.'};
          toast(`❌ ${msgs[err.message]||err.message}`,'error',5000);
        }
      }},
      {id:'x',label:'Cancel',cls:'btn-s'}
    ]:[{id:'x',label:'Close',cls:'btn-s'}]
  );
}

export function _showLoanOutDetail(player, save){
  const g=typeof posGroup==='function'?posGroup(player.position):'MID';
  const r=typeof primaryRating==='function'?primaryRating(player):70;
  const fee=typeof _loanFee==='function'?_loanFee(player):Math.round((player.value??0)*0.1);
  const wageCost=typeof _loanWageCost==='function'?_loanWageCost(player,save):(player.wage??0)*20;
  const relief=fee+wageCost;
  const gwsLeft=Math.max(0,(save.totalGameweeks??38)-(save.currentGameweek??1)+1);

  showModal(`Loan Out ${player.name}`,`
    <div class="ctr">
      <div class="ctr-pl"><strong>${player.name}</strong><span class="pos ${g}">${player.position}</span></div>
      <div class="ctr-row"><span>Age</span><strong>${player.age}</strong></div>
      <div class="ctr-row"><span>Rating</span><strong>${r}</strong></div>
      <div class="ctr-row"><span>Weekly Wage</span><strong>${fmt.wage(player.wage)}</strong></div>
      <div style="margin:12px 0 4px;padding:10px;background:var(--sur3);border-radius:8px;border:1px solid var(--bdr)">
        <div style="font-size:10px;font-weight:700;color:var(--tx2);letter-spacing:.5px;margin-bottom:8px">BUDGET RELIEF</div>
        <div class="ctr-row" style="border:none;padding:2px 0"><span>Loan Fee received</span><strong style="color:var(--acc)">${fmt.money(fee)}</strong></div>
        <div class="ctr-row" style="border:none;padding:2px 0"><span>Wages saved × ${gwsLeft} GWs</span><strong style="color:var(--acc)">${fmt.money(wageCost)}</strong></div>
        <div class="ctr-row" style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px"><span>Total Budget Gain</span><strong style="color:var(--acc);font-size:14px">+${fmt.money(relief)}</strong></div>
      </div>
      <div style="font-size:11px;color:var(--txd);margin-top:8px">An interested club will be found. Player returns at season end.</div>
    </div>`,
    [{id:'lo',label:'Loan Out',cls:'btn-p',handler:async()=>{
      try{
        const res=await loanOutPlayer(player.id);
        toast(`✅ ${player.name} loaned to ${res.loanClubName}! +${fmt.money(res.totalCost)} received.`,'success',5000);
        await renderTransfers();
        renderLoanMarket();
      }catch(err){
        const msgs={WINDOW_CLOSED:'Transfer window is closed.',ALREADY_ON_LOAN:'Already on loan.',SIGNED_THIS_SEASON:'Already moved this season.',NO_LOAN_TAKERS:'No clubs interested in this player right now.'};
        toast(`❌ ${msgs[err.message]||err.message}`,'error',5000);
      }
    }},{id:'x',label:'Cancel',cls:'btn-s'}]
  );
}

export async function renderSellList(userTeamId){
  const el=document.getElementById('sell-list');
  if(!el) return;
  const save=await getSave();
  const winStatus=typeof transferWindowStatus==='function'?transferWindowStatus(save):{open:true};
  const winClosed=!winStatus.open;
  const players=await getPlayersByTeam(userTeamId);
  el.innerHTML=[...players].sort((a,b)=>primaryRating(b)-primaryRating(a)).map(p=>{
    const g=posGroup(p.position),r=primaryRating(p);
    const fv=typeof formAdjustedValue==='function'?formAdjustedValue(p):p.value;
    const isL=p.transferListed===true;
    return`<div class="pl-row">
      <div class="pl-av" style="background:var(--sur3);font-size:8px;font-family:var(--fm);font-weight:700;color:var(--tx2);letter-spacing:.5px">${posGroup(p.position)}</div>
      <div class="pl-info"><div class="pl-name">${p.name}${isL?` <span class="listed-badge">LISTED</span>`:''}</div><div class="pl-meta"><span class="pos ${g}">${p.position}</span><span>Age ${p.age}</span></div></div>
      <div class="pl-val">${fmt.money(fv)}</div><div class="pl-rat">${r}</div>
      <button class="sell-btn" data-sid="${p.id}" ${winClosed?'disabled title="Transfer window closed" style=\'opacity:0.35;cursor:not-allowed\'':''}>Sell</button>
    </div>`;
  }).join('');
  if(winClosed){
    const notice=document.createElement('div');
    notice.style.cssText='padding:10px 14px;text-align:center;font-size:11px;color:var(--acc3);font-family:var(--fm);border-top:1px solid var(--bdr);background:rgba(232,72,85,0.07)';
    notice.textContent='🔴 Transfer window closed — selling resumes in the next window';
    el.prepend(notice);
  }
  el.querySelectorAll('.sell-btn').forEach(btn=>{
    btn.onclick=async(e)=>{
      e.stopPropagation();
      const pl=players.find(p=>p.id===btn.dataset.sid); if(!pl) return;
      const fv=typeof formAdjustedValue==='function'?formAdjustedValue(pl):pl.value;
      const est=Math.round(fv*(0.92+Math.random()*0.2));
      showModal('Sell Player',`<div class="ctr">
        <div class="ctr-pl"><strong>${pl.name}</strong><span class="pos ${posGroup(pl.position)}">${pl.position}</span></div>
        <div class="ctr-row"><span>Est. Fee</span><strong style="color:var(--acc2)">~${fmt.money(est)}</strong></div>
        <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fv)}</strong></div>
      </div>`,
      [{id:'s',label:'Accept Best Offer',cls:'btn-p',handler:async()=>{
        try{
          // Optimistically dim the row immediately
          const rowEl = el.querySelector(`[data-sid="${pl.id}"]`)?.closest('.pl-row');
          if (rowEl) { rowEl.style.opacity = '0.3'; rowEl.style.pointerEvents = 'none'; }
          const{fee,buyerName}=await sellPlayer(pl.id);
          toast(`✅ ${pl.name} sold to ${buyerName} for ${fmt.money(fee)}!`,'success',5000);
          if(typeof newsPlayerSold==='function') newsPlayerSold(pl,fee,buyerName,await getSave()).catch(()=>{});
          await renderTransfers();
        }
        catch(err){
          const sellMsgs={WINDOW_CLOSED:'The transfer window is closed. You can only sell players in the summer (Aug) or winter (Jan) windows.',NO_BUYERS:'No clubs could be found willing to buy this player right now.',PLAYER_NOT_IN_SQUAD:'Player not found in your squad.'};
          toast(`❌ ${sellMsgs[err.message]||err.message}`,'error',5000);
        }
      }},{id:'x',label:'Cancel',cls:'btn-s'}]);
    };
  });
}

