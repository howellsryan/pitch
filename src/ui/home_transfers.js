import { getAllTeams, getSave, getTeam } from '../modules/db.js';
import { CUP_META } from '../modules/cups.js';
import { injuryDurationLabel } from '../modules/injuries.js';
import { processEndOfSeason } from '../modules/season.js';
import { advanceOneFixture } from '../modules/gameweek.js';
import { fmt, hideLoader, showLoader, showModal, toast } from './helpers.js';
import { newsMatchResult, newsPromotion, newsRelegation, newsSeasonEnd, newsYouthIntake } from './inbox.js';
import { screenTicks } from '../lib/state/screens.svelte.js';

// ══════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════
// The screen itself is src/lib/ui/HomeScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — real Svelte markup, data-fetching
// and the deadline-day/end-of-season flow all live there now. renderHome()
// survives as a thin bridge because it's still called imperatively from
// prematch.js, watchmatch.js and squad_tactics_offers.js after a match,
// squad change, etc.; it just bumps the tick HomeScreen.svelte watches,
// regardless of whether Home is the currently visible screen.
//
// TRANSFERS — moved to src/lib/ui/TransfersScreen.svelte in the same phase.
// This file's renderTransfers/_renderAdvancedFilters/_applyAndRenderBuyList/
// renderBuyList/renderPlayerDetail/renderLoanMarket/_renderLoanInList/
// _renderLoanOutList/_showLoanInDetail/_showLoanOutDetail/renderSellList and
// their module-level state (_buyTargets/_selPid/_trFilters/_loanMode/etc.)
// are all deleted, not carried forward — the new component owns that state
// as real Svelte $state instead. squad_tactics_offers.js's
// openSquadPlayerModal lost its only caller (the desktop-width branch in the
// old renderBuyList row click) and is deleted too — TransfersScreen.svelte
// uses its own bottom sheet on every viewport instead of that split.
export async function renderHome(){
  screenTicks.home++;
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
    screenTicks.settings++;
  }catch(err){
    hideLoader(); toast(`Error: ${err.message}`,'error'); console.error(err);
    const b=document.getElementById('btn-eoy'); if(b) b.disabled=false;
  }
}

