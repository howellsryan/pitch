import { getAllTeams, getSave, getTeam, resetForNewCareer } from '../modules/db.js';
import { CUP_META } from '../modules/cups.js';
import { processEndOfSeason } from '../modules/season.js';
import { fmt, hideLoader, showLoader, showModal, toast } from './helpers.js';
import { newsPromotion, newsRelegation, newsSeasonEnd, newsYouthIntake } from './inbox.js';
import { screenTicks } from '../lib/state/screens.svelte.js';

// ══════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════
// The screen itself is src/lib/ui/HomeScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — real Svelte markup, data-fetching
// and the deadline-day/end-of-season flow all live there now. renderHome()
// survives as a thin bridge because it's still called imperatively from
// src/lib/ui/MatchScreen.svelte (Phase 5) and squad_tactics_offers.js after
// a match, squad change, etc.; it just bumps the tick HomeScreen.svelte
// watches, regardless of whether Home is the currently visible screen.
//
// TRANSFERS — moved to src/lib/ui/TransfersScreen.svelte in Phase 4. This
// file's renderTransfers/_renderAdvancedFilters/_applyAndRenderBuyList/
// renderBuyList/renderPlayerDetail/renderLoanMarket/_renderLoanInList/
// _renderLoanOutList/_showLoanInDetail/_showLoanOutDetail/renderSellList and
// their module-level state (_buyTargets/_selPid/_trFilters/_loanMode/etc.)
// were deleted, not carried forward — the new component owns that state
// as real Svelte $state instead. squad_tactics_offers.js's
// openSquadPlayerModal lost its only caller (the desktop-width branch in the
// old renderBuyList row click) and was deleted too — TransfersScreen.svelte
// uses its own bottom sheet on every viewport instead of that split.
//
// MATCH REPORT — showMatchReport() and the dead _handleAdvanceOneFixtureStub
// (never wired to anything — it disabled a #btn-adv id that hasn't existed
// since Home's own migration) were deleted in Phase 5
// (docs/plan/04-migration-phases.md): MatchScreen.svelte's Full Time/After
// beats now own that content, built as real Svelte markup instead of a
// showModal() HTML-string template.
export async function renderHome(){
  screenTicks.home++;
}

function eosIcon(kind){
  const paths={
    trophy:'<path d="M8 4h8v4c0 4-1.5 7-4 7s-4-3-4-7z"/><path d="M8 7H4c0 4 2 6 5 6M16 7h4c0 4-2 6-5 6M12 15v4M8 21h8"/>',
    up:'<path d="M12 20V5M6 11l6-6 6 6"/>',
    down:'<path d="M12 4v15M6 13l6 6 6-6"/>',
    pitch:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="3"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m15 9 5-5M17 4h3v3"/>',
    money:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.9-1-3.1-1-1.8 0-3 .8-3 2 0 3.2 6.2 1.3 6.2 4.7 0 1.3-1.2 2.3-3.2 2.3-1.5 0-2.8-.5-3.8-1.4M12 5.5v13"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/>',
  };
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:5px">${paths[kind]||paths.trophy}</svg>`;
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
    if(leagueWinner?.teamId===newSave.userTeamId) trophies.push('League Champions!');
    if(summary.cups) for(const[cid,st]of Object.entries(summary.cups)){
      if(st.status==='winner') trophies.push(`${CUP_META[cid]?.name||cid} Winners!`);
    }
    const tHtml=trophies.length?`<div style="background:rgba(245,200,66,.1);border:1px solid rgba(245,200,66,.3);border-radius:8px;padding:12px;margin-bottom:12px">${trophies.map(t=>`<div style="color:var(--acc2);font-size:14px;font-weight:600">${eosIcon('trophy')}${t}</div>`).join('')}</div>`:'';
    const ord=n=>n+(['st','nd','rd'][n-1]||'th');

    // Build league changes HTML (promotion/relegation/playoffs)
    let lcHtml='';
    if(leagueChanges){
      const uri=leagueChanges.userRelInfo||{};
      if(uri.promoted&&uri.promotedViaPlayoff){
        lcHtml+=`<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#3b82f6">${eosIcon('up')}PROMOTED via Play-offs!</div>
          <div style="font-size:11px;color:var(--tx2);margin-top:4px">Your team won the play-off final and earned promotion!</div>
        </div>`;
      } else if(uri.promoted){
        lcHtml+=`<div style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#3b82f6">${eosIcon('up')}PROMOTED! Automatic promotion secured!</div>
        </div>`;
      } else if(uri.relegated){
        lcHtml+=`<div style="background:rgba(232,72,85,.1);border:1px solid rgba(232,72,85,.3);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:var(--acc3)">${eosIcon('down')}RELEGATED</div>
          <div style="font-size:11px;color:var(--tx2);margin-top:4px">Your team has been relegated to the division below.</div>
        </div>`;
      }

      // Show playoff results for the user's league
      const userLeague=summary.userLeague||(await getSave())?.userLeague||'';
      const po=leagueChanges.playoffResults?.[userLeague];
      if(po){
        const sf1=po.semi1, sf2=po.semi2, fin=po.final;
        lcHtml+=`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:6px">${eosIcon('pitch')}Play-off Results</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:4px"><strong>Semi-Final 1:</strong> ${sf1.team1.name} vs ${sf1.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:2px;padding-left:8px">Leg 1: ${sf1.team1.name} ${sf1.leg1.home}-${sf1.leg1.away} ${sf1.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:4px;padding-left:8px">Leg 2: ${sf1.team2.name} ${sf1.leg2.home}-${sf1.leg2.away} ${sf1.team1.name} (Agg: ${sf1.agg.team1}-${sf1.agg.team2}${sf1.penalties?' pens':''})</div>
          <div style="font-size:11px;color:var(--tx2);margin-bottom:4px"><strong>Semi-Final 2:</strong> ${sf2.team1.name} vs ${sf2.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:2px;padding-left:8px">Leg 1: ${sf2.team1.name} ${sf2.leg1.home}-${sf2.leg1.away} ${sf2.team2.name}</div>
          <div style="font-size:10px;color:var(--txd);margin-bottom:4px;padding-left:8px">Leg 2: ${sf2.team2.name} ${sf2.leg2.home}-${sf2.leg2.away} ${sf2.team1.name} (Agg: ${sf2.agg.team1}-${sf2.agg.team2}${sf2.penalties?' pens':''})</div>
          <div style="font-size:11px;color:var(--acc);margin-top:4px"><strong>Final:</strong> ${fin.team1.name} ${fin.score.team1}-${fin.score.team2} ${fin.team2.name}${fin.penalties?' (pens)':''}</div>
          <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-top:4px">${eosIcon('trophy')}${(fin.winnerId===fin.team1.id?fin.team1.name:fin.team2.name)} promoted!</div>
        </div>`;
      }

      // Show movements summary
      const mvs=(leagueChanges.movements||[]).filter(m=>m.teamId!==newSave.userTeamId);
      if(mvs.length>0){
        const promos=mvs.filter(m=>m.reason.includes('Promoted')||m.reason.includes('Playoff'));
        const rels=mvs.filter(m=>m.reason==='Relegated');
        let mvHtml='';
        if(promos.length) mvHtml+=`<div style="margin-bottom:4px"><span style="color:#3b82f6;font-weight:600;font-size:10px">${eosIcon('up')}PROMOTED:</span> <span style="font-size:10px;color:var(--tx2)">${promos.map(m=>{const allT=typeof getAllTeams==='function';return m.teamId;}).join(', ')}</span></div>`;
        if(rels.length) mvHtml+=`<div><span style="color:var(--acc3);font-weight:600;font-size:10px">${eosIcon('down')}RELEGATED:</span> <span style="font-size:10px;color:var(--tx2)">${rels.map(m=>m.teamId).join(', ')}</span></div>`;
        if(mvHtml) lcHtml+=`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:8px;margin-bottom:8px">${mvHtml}</div>`;
      }
    }

    // ── Board objective outcome ──────────────────────────────
    let boardHtml='';
    if(summary.boardObjective){
      const metColor=summary.objectiveMet?'var(--acc)':'var(--acc3)';
      const metLabel=summary.objectiveMet?'MET':'MISSED';
      // P7 WP7: the sporting MET/MISSED line above is the pre-P7 contract,
      // kept byte-identical for saves without a board contract yet. Below it,
      // a compact 3-objective breakdown from the new multi-objective board
      // contract (WP4) — sporting/financial/youth — using the real semantic
      // status colors (--color-live/--acc2/--acc3), not the club accent.
      const statusColor={ok:'var(--color-live)',warning:'var(--acc2)',review:'var(--acc3)'};
      const statusLabel={ok:'On track',warning:'Under review',review:'At risk'};
      const objectives=summary.boardContract?.objectives||[];
      const financialObj=objectives.find(o=>o.kind==='financial');
      const youthObj=objectives.find(o=>o.kind==='youth');
      const row=(label,status,detail)=>{
        if(!status) return '';
        return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;padding:3px 0">
          <span style="color:var(--tx2)">${label}${detail?` — ${detail}`:''}</span>
          <span style="color:${statusColor[status]||'var(--tx2)'};font-weight:600;white-space:nowrap">${statusLabel[status]||status}</span>
        </div>`;
      };
      const breakdownHtml=objectives.length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr)">
        ${row(summary.boardObjective.label,objectives.find(o=>o.kind==='sporting')?.status)}
        ${row('Financial stability',financialObj?.status,financialObj?.pressure)}
        ${row('Youth development',youthObj?.status,youthObj?`${youthObj.progress??0}/${youthObj.target} U21 appearances`:'')}
      </div>`:'';
      const concernHtml=(summary.dismissalRecommended&&!summary.sacked)?`<div style="font-size:11px;color:var(--acc3);margin-top:6px">The board is unhappy with the season overall — results and finances are both under scrutiny.</div>`:'';
      boardHtml=`<div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:4px">${eosIcon('target')}Board Objective</div>
        <div style="font-size:12px;color:var(--tx2)">${summary.boardObjective.label}</div>
        <div style="font-size:12px;margin-top:4px;color:${metColor};font-weight:600">${metLabel} — ${summary.objectiveMet?'Objective met':'Objective missed'}</div>
        ${breakdownHtml}
        ${concernHtml}
      </div>`;
    }

    if(summary.sacked){
      showModal('You Were Sacked',`<div>${tHtml}
        <div style="font-size:13px;color:var(--tx2);margin-bottom:8px">Finished <strong style="color:var(--tx)">${ord(summary.userFinish)}</strong> in the league.</div>
        ${boardHtml}
        <div style="font-size:13px;color:var(--acc3);font-weight:600">The board has run out of patience and relieved you of your duties.</div>
        <div style="font-size:12px;color:var(--tx2);margin-top:6px">Your honors and career history are kept — starting a new career picks a fresh club to manage.</div>
      </div>`,
      [{id:'newcareer',label:'Start New Career',cls:'btn-p',handler:async()=>{ await resetForNewCareer(); window.location.reload(); }}]);
      return;
    }

    showModal('Season Complete!',`<div>${tHtml}
      <div style="font-size:13px;color:var(--tx2);margin-bottom:8px">Finished <strong style="color:var(--tx)">${ord(summary.userFinish)}</strong> in the league.</div>
      ${prizeMoney?`<div style="font-size:13px;color:var(--acc);margin-bottom:8px">${eosIcon('money')}Prize money: <strong>${fmt.money(prizeMoney)}</strong></div>`:''}
      ${boardHtml}
      ${lcHtml}
      ${summary.retirements&&summary.retirements.length?`<div style="background:rgba(232,72,85,.08);border:1px solid rgba(232,72,85,.2);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;color:var(--acc3);margin-bottom:4px">${eosIcon('user')}Retirements</div>
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