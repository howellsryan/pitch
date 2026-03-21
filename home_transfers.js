// ══════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════
async function renderHome(){
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
    <div class="mgr-card"><div class="mgr-lbl">Manager</div><div class="mgr-name">J. Smith</div><div class="mgr-since">Season ${save.season}</div></div>`;
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
    <div class="stat-card"><div class="sl">Gameweek</div><div class="sv" style="color:var(--acc)">${save.currentGameweek}</div><div class="ss">of ${save.totalGameweeks}</div></div>
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
  const isEnd=save.currentGameweek>save.totalGameweeks;

  // Wire the VISIBLE header buttons (btn-adv-header / btn-eoy-header)
  const hdrPlay = document.getElementById('btn-adv-header');
  const hdrEOY  = document.getElementById('btn-eoy-header');
  if (hdrPlay) {
    hdrPlay.disabled = false;
    hdrPlay.onclick  = null;
    hdrPlay.style.display = isEnd ? 'none' : 'flex';
    if (!isEnd) hdrPlay.onclick = () => showPreMatchModal();
  }
  if (hdrEOY) {
    hdrEOY.disabled = false;
    hdrEOY.onclick  = null;
    hdrEOY.style.display = isEnd ? 'flex' : 'none';
    if (isEnd) hdrEOY.onclick = handleEndOfSeason;
  }

  // Keep hidden fallback buttons (used by some paths) in sync too
  const advBtn = document.getElementById('btn-adv');
  const eoyBtn = document.getElementById('btn-eoy');
  if (advBtn) { advBtn.disabled=false; advBtn.onclick=null; if(!isEnd) advBtn.onclick=()=>showPreMatchModal(); }
  if (eoyBtn) { eoyBtn.disabled=false; eoyBtn.onclick=null; if(isEnd)  eoyBtn.onclick=handleEndOfSeason; }
}

async function renderCharts(){
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
async function _handleAdvanceOneFixtureStub(){
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
    if(r) showMatchReport(r,save);
    if(res.cupResults?.length){
      for(const cr of res.cupResults){
        if(cr.isUCLMatchday){
          toast(`⭐ UCL MD${cr.matchday}: ${cr.result} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals}) +${cr.points}pts`,cr.result==='W'?'success':cr.result==='D'?'info':'error',6000);
        } else if(!cr.eliminated){
          const meta=CUP_META[cr.cupId];
          toast(`${meta?.icon||'🏆'} ${meta?.name} ${cr.roundName}: ${cr.userWon?'✅ Won':'❌ Out'} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals})`,cr.userWon?'success':'error',6000);
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
function showMatchReport(r,save){
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

  // Timeline shows all goal/card events, user events highlighted
  const timeline = evts.filter(e=>e.type==='goal'||e.type==='yellow').map(e=>{
    const isU = e.teamId===save.userTeamId;
    const isH = e.teamId===r.homeTeamId;
    return`<div class="mr-ev ${isU?'mr-ev-us':'mr-ev-op'}" style="align-self:${isH?'flex-start':'flex-end'}">
      ${isH?`<span class="mr-ev-min">${e.minute}'</span>`:''}<span>${e.type==='goal'?'⚽':'🟨'}</span><span class="mr-ev-nm">${e.playerName||'?'}</span>${!isH?`<span class="mr-ev-min">${e.minute}'</span>`:''}
    </div>`;
  }).join('');

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
    </div>`,
    [{id:'close',label:'Continue →',cls:'btn-p'}]
  );
}

// ── END OF SEASON
async function handleEndOfSeason(){
  const btn=document.getElementById('btn-eoy');
  if(btn) btn.disabled=true;
  showLoader('Processing end of season…');
  try{
    const {summary,leagueWinner,newSave,prizeMoney}=await processEndOfSeason();
    hideLoader();
    const trophies=[];
    if(leagueWinner?.teamId===newSave.userTeamId) trophies.push('🏆 League Champions!');
    if(summary.cups) for(const[cid,st]of Object.entries(summary.cups)){
      if(st.status==='winner') trophies.push(`${CUP_META[cid]?.icon||'🏆'} ${CUP_META[cid]?.name||cid} Winners!`);
    }
    const tHtml=trophies.length?`<div style="background:rgba(245,200,66,.1);border:1px solid rgba(245,200,66,.3);border-radius:8px;padding:12px;margin-bottom:12px">${trophies.map(t=>`<div style="color:var(--acc2);font-size:14px;font-weight:600">${t}</div>`).join('')}</div>`:'';
    const ord=n=>n+(['st','nd','rd'][n-1]||'th');
    showModal('Season Complete! 🎉',`<div>${tHtml}
      <div style="font-size:13px;color:var(--tx2);margin-bottom:8px">Finished <strong style="color:var(--tx)">${ord(summary.userFinish)}</strong> in the league.</div>
      ${prizeMoney?`<div style="font-size:13px;color:var(--acc);margin-bottom:8px">💰 Prize money: <strong>${fmt.money(prizeMoney)}</strong></div>`:''}
      <div style="font-size:12px;color:var(--tx2)">All players aged +1 year. New season fixtures generated.</div>
    </div>`,
    [{id:'ok',label:'Start Next Season →',cls:'btn-p',handler:async()=>{await renderHome();}}]);
    if(typeof renderSettings==='function') renderSettings().catch(()=>{});
  }catch(err){
    hideLoader(); toast(`Error: ${err.message}`,'error'); console.error(err);
    const b=document.getElementById('btn-eoy'); if(b) b.disabled=false;
  }
}

// ── TRANSFERS
let _buyTargets=[],_buyFilter='ALL',_selPid=null;
async function renderTransfers(){
  const save=await getSave(), team=await getTeam(save.userTeamId);
  const allTeams=await getAllTeams(), byId=new Map(allTeams.map(t=>[t.id,t]));
  const bh=document.getElementById('tr-budget-hdr');
  if(bh&&team) bh.innerHTML=`<span style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--tx2)">Budget</span><span style="font-family:var(--fd);font-size:20px;color:var(--acc)">${fmt.money(team.budget)}</span></span>`;
  const allPl=await getAllPlayers();
  _buyTargets=allPl.filter(p=>p.teamId!==save.userTeamId&&p.teamId!=='free_agents').sort((a,b)=>primaryRating(b)-primaryRating(a));
  renderBuyList(byId);
  await renderSellList(save.userTeamId);
  const tbBuy=document.getElementById('tt-buy'),tbSell=document.getElementById('tt-sell');
  const pBuy=document.getElementById('tp-buy'),pSell=document.getElementById('tp-sell');
  if(tbBuy) tbBuy.onclick=()=>{tbBuy.classList.add('on');tbSell.classList.remove('on');pBuy.classList.add('on');pSell.classList.remove('on')};
  if(tbSell) tbSell.onclick=()=>{tbSell.classList.add('on');tbBuy.classList.remove('on');pSell.classList.add('on');pBuy.classList.remove('on')};
  document.querySelectorAll('#tr-filters .ftab').forEach(tab=>{
    tab.onclick=()=>{document.querySelectorAll('#tr-filters .ftab').forEach(t=>t.classList.remove('on'));tab.classList.add('on');_buyFilter=tab.dataset.f||'ALL';renderBuyList(byId);};
  });
  const si=document.getElementById('tr-search');
  if(si){si.value='';si.oninput=()=>renderBuyList(byId,si.value.toLowerCase());}
}
function renderBuyList(byId,query=''){
  const el=document.getElementById('buy-list');
  if(!el) return;
  let fil=_buyFilter==='ALL'?_buyTargets:_buyTargets.filter(p=>posGroup(p.position)===_buyFilter);
  if(query) fil=fil.filter(p=>p.name.toLowerCase().includes(query));
  if(!fil.length){el.innerHTML=`<div class="no-data">No players found.</div>`;return;}
  el.innerHTML=fil.slice(0,80).map(p=>{
    const g=posGroup(p.position),r=primaryRating(p),tn=byId.get(p.teamId)?.name||'Unknown';
    const fv=typeof formAdjustedValue==='function'?formAdjustedValue(p):p.value;
    return`<div class="pl-row ${p.id===_selPid?'sel':''}" data-pid="${p.id}">
      <div class="pl-av">${flagEmoji(p.name)}</div>
      <div class="pl-info"><div class="pl-name">${p.name}</div><div class="pl-meta"><span class="pos ${g}">${p.position}</span><span>${tn}</span><span>Age ${p.age}</span></div></div>
      <div class="pl-val">${fmt.money(fv)}</div><div class="pl-rat">${r}</div></div>`;
  }).join('');
  el.querySelectorAll('.pl-row').forEach(row=>{
    row.onclick=()=>{
      _selPid=row.dataset.pid;
      el.querySelectorAll('.pl-row').forEach(r=>r.classList.remove('sel'));
      row.classList.add('sel');
      const player=fil.find(p=>p.id===_selPid);
      if(player) renderPlayerDetail(player,byId);
      document.getElementById('tr-layout')?.classList.add('dp-open');
    };
  });
}
function renderPlayerDetail(player,byId){
  const el=document.getElementById('det-panel');
  if(!el) return;
  const tn=byId.get(player.teamId)?.name||'Unknown';
  const g=posGroup(player.position),r=primaryRating(player);
  const fv=typeof formAdjustedValue==='function'?formAdjustedValue(player):player.value;
  const minOff=Math.floor(fv*0.88), initOff=Math.floor(fv*0.95);
  const fl=formLabel(player);
  const abar=(lbl,val,pri)=>{const pct=Math.round((val/99)*100);const col=pri?'linear-gradient(90deg,var(--acc),#7fff9a)':'linear-gradient(90deg,#4a6fa5,#6b8ccc)';return`<div><div class="attr-n" style="${pri?'color:var(--acc)':''}">${lbl}</div><div class="attr-bw"><div class="attr-b" style="width:${pct}%;background:${col}"></div></div><div class="attr-v">${val}</div></div>`;};
  el.innerHTML=`
    <div class="det-hero">
      <div class="det-rat">${r}</div><div class="det-av">${flagEmoji(player.name)}</div>
      <div class="det-name">${player.name}</div>
      <div class="det-info"><span>⚽</span><span>${tn}</span><span class="pos ${g}">${player.position}</span><span>Age ${player.age}</span></div>
      <div style="margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap">
        <span class="fb ${fl.cls}">${fl.text}</span>
        ${(player.goals||0)>0?`<span style="font-size:11px;color:var(--tx2)">⚽${player.goals}</span>`:''}
        ${(player.assists||0)>0?`<span style="font-size:11px;color:var(--tx2)">🎯${player.assists}</span>`:''}
      </div>
    </div>
    <div class="vrow"><span class="vlbl">Form Value</span><span class="vamt">${fmt.money(fv)}</span></div>
    <div class="vrow" style="border-top:none;padding-top:0"><span class="vlbl">Wage</span><span class="vamt" style="font-size:14px;color:var(--tx2)">${fmt.wage(player.wage)}</span></div>
    <div class="attr-grid">${abar('Attack',player.attack,g==='ATT')}${abar('Midfield',player.midfield,g==='MID')}${abar('Defence',player.defence,g==='DEF')}${abar('GK',player.goalkeeping,g==='GK')}</div>
    <div class="offer-sec">
      <div class="offer-lbl">Your Offer</div>
      <div class="offer-row">
        <input type="range" id="offer-slider" min="${Math.floor(minOff*0.7)}" max="${Math.floor(fv*1.5)}" value="${initOff}" step="500000">
        <div id="offer-val" class="offer-v">${fmt.money(initOff)}</div>
      </div>
      <div class="offer-hint">Min accepted: ~${fmt.money(minOff)}</div>
    </div>
    <div class="tr-acts">
      <button class="btn btn-p" id="btn-offer">Make Offer</button>
      <button class="btn btn-s" id="btn-det-back" style="display:none">← Back</button>
    </div>`;
  const back=el.querySelector('#btn-det-back');
  if(back&&window.innerWidth<=768){back.style.display='block';back.onclick=()=>document.getElementById('tr-layout')?.classList.remove('dp-open');}
  const sl=document.getElementById('offer-slider'),dv=document.getElementById('offer-val');
  if(sl) sl.oninput=()=>{if(dv) dv.textContent=fmt.money(Number(sl.value));};
  const ob=document.getElementById('btn-offer');
  if(ob) ob.onclick=()=>{
    const offer=Number(sl?.value||fv);
    showModal('Confirm Offer',`
      <div class="ctr">
        <div class="ctr-pl"><strong>${player.name}</strong><span class="pos ${g}">${player.position}</span></div>
        <div class="ctr-row"><span>From</span><strong>${tn}</strong></div>
        <div class="ctr-row"><span>Offer</span><strong style="color:var(--acc2)">${fmt.money(offer)}</strong></div>
        <div class="ctr-row"><span>Form Value</span><strong>${fmt.money(fv)}</strong></div>
        ${offer<minOff?`<div class="ctr-warn">⚠️ Below ~${fmt.money(minOff)} — likely rejected</div>`:''}
      </div>`,
      [{id:'c',label:'Send Offer',cls:'btn-p',handler:async()=>{
        try{
          // Optimistically remove card from list immediately
          const cardEl = document.querySelector(`[data-pid="${player.id}"]`);
          if (cardEl) cardEl.closest('.pl-item,.pl-row')?.remove();
          await buyPlayer(player.id,offer);
          toast(`✅ ${player.name} signed for ${fmt.money(offer)}!`,'success',5000);
          _selPid=null; document.getElementById('tr-layout')?.classList.remove('dp-open');
          await renderTransfers();
        }catch(err){
          const msgs={INSUFFICIENT_FUNDS:'Not enough budget.',OFFER_REJECTED:`${tn} rejected — try more.`,ALREADY_IN_SQUAD:'Already in your squad.'};
          toast(`❌ ${msgs[err.message]||err.message}`,'error',5000);
        }
      }},{id:'x',label:'Cancel',cls:'btn-s'}]
    );
  };
}
async function renderSellList(userTeamId){
  const el=document.getElementById('sell-list');
  if(!el) return;
  const players=await getPlayersByTeam(userTeamId);
  el.innerHTML=[...players].sort((a,b)=>primaryRating(b)-primaryRating(a)).map(p=>{
    const g=posGroup(p.position),r=primaryRating(p);
    const fv=typeof formAdjustedValue==='function'?formAdjustedValue(p):p.value;
    const isL=p.transferListed===true;
    return`<div class="pl-row">
      <div class="pl-av">${flagEmoji(p.name)}</div>
      <div class="pl-info"><div class="pl-name">${p.name}${isL?` <span class="listed-badge">LISTED</span>`:''}</div><div class="pl-meta"><span class="pos ${g}">${p.position}</span><span>Age ${p.age}</span></div></div>
      <div class="pl-val">${fmt.money(fv)}</div><div class="pl-rat">${r}</div>
      <button class="sell-btn" data-sid="${p.id}">Sell</button>
    </div>`;
  }).join('');
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
          await renderTransfers();
        }
        catch(err){toast(`❌ ${err.message}`,'error',5000);}
      }},{id:'x',label:'Cancel',cls:'btn-s'}]);
    };
  });
}
