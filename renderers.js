// ── COMPETITIONS ─────────────────────────────────────────────
async function renderCompetitions(){
  const save=await getSave();
  const table=await getLeagueTable();
  const allTeams=await getAllTeams();
  const byId=new Map(allTeams.map(t=>[t.id,t]));
  const fullEl=document.getElementById('full-table');
  const totalTeams = table.length;
  const zoneInfo=(pos)=>{
    if(totalTeams===20){
      if(pos<=4)  return 'border-left:3px solid #3b82f6';
      if(pos<=6)  return 'border-left:3px solid #f97316';
      if(pos===7) return 'border-left:3px solid #22c55e';
      if(pos>=18) return 'border-left:3px solid #e84855';
      if(pos>=15) return 'border-left:3px solid #f5c842';
    } else if(totalTeams===24){
      if(pos<=2)  return 'border-left:3px solid #3b82f6';
      if(pos<=6)  return 'border-left:3px solid #22c55e';
      if(pos>=22) return 'border-left:3px solid #e84855';
    }
    return '';
  };
  if(fullEl) fullEl.innerHTML=table.map(row=>`
    <div class="full-row ${row.teamId===save.userTeamId?'hl':''}" style="${zoneInfo(row.position)}">
      <div class="rc">${row.position}</div>
      <div class="tc">${row.crest||''} ${row.teamName}</div>
      <div class="sc">${row.played}</div><div class="sc">${row.won}</div>
      <div class="sc">${row.drawn}</div><div class="sc">${row.lost}</div>
      <div class="sc">${row.goalsFor}</div><div class="sc">${row.goalsAgainst}</div>
      <div class="sc" style="color:${row.goalDifference>=0?'var(--acc)':'var(--acc3)'}">${row.goalDifference>=0?'+':''}${row.goalDifference}</div>
      <div class="pc">${row.points}</div>
      <div class="form-mini">${(row.form||[]).map(f=>`<span class="fdot fd-${f}">${f}</span>`).join('')}</div>
    </div>`).join('');
  // Add zone legend
  const legendEl = document.getElementById('zone-legend');
  if(legendEl){
    if(totalTeams===20) legendEl.innerHTML=`<div class="zone-legend"><span style="border-left:3px solid #3b82f6;padding-left:6px">UCL (Top 4)</span><span style="border-left:3px solid #f97316;padding-left:6px">UEL (5-6)</span><span style="border-left:3px solid #22c55e;padding-left:6px">UECL (7)</span><span style="border-left:3px solid #e84855;padding-left:6px">Relegated (18-20)</span></div>`;
    else if(totalTeams===24) legendEl.innerHTML=`<div class="zone-legend"><span style="border-left:3px solid #3b82f6;padding-left:6px">Promoted (1-2)</span><span style="border-left:3px solid #22c55e;padding-left:6px">Play-offs (3-6)</span><span style="border-left:3px solid #e84855;padding-left:6px">Relegated (22-24)</span></div>`;
  }
  const fixtures=await getAllFixtures();
  const played=fixtures.filter(f=>f.played&&f.competition==='league').sort((a,b)=>b.gameweek-a.gameweek).slice(0,30);
  const resEl=document.getElementById('recent-res');
  if(resEl){
    if(!played.length){resEl.innerHTML=`<div class="no-data">No matches played yet.</div>`;return;}
    resEl.innerHTML=played.map(f=>`
      <div class="res-row ${f.homeTeamId===save.userTeamId||f.awayTeamId===save.userTeamId?'ur':''}">
        <div class="res-gw">GW${f.gameweek}</div>
        <div class="res-teams">
          <span class="rth">${byId.get(f.homeTeamId)?.name||f.homeTeamId}</span>
          <span class="rsc">${f.homeGoals} – ${f.awayGoals}</span>
          <span class="rta">${byId.get(f.awayTeamId)?.name||f.awayTeamId}</span>
        </div>
        <div class="res-date">${fmt.dateShort(f.date)}</div>
      </div>`).join('');
  }
}

// ── HONOURS ───────────────────────────────────────────────────
async function renderHonours(){
  const save=await getSave();
  const {combined,earned}=await getHonorsForTeam(save.userTeamId);
  const el=document.getElementById('honours-grid');
  if(!el) return;
  const trophies=[
    {key:'premier_league',name:'League Title',icon:'🏆',color:'#3b82f6'},
    {key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},
    {key:'league_cup',name:'League Cup',icon:'🥛',color:'#c084fc'},
    {key:'ucl',name:'Champions League',icon:'⭐',color:'#3b82f6'},
    {key:'uel',name:'Europa League',icon:'🟠',color:'#f97316'},
    {key:'uecl',name:'Conference Lge',icon:'🟢',color:'#22c55e'},
  ];
  el.innerHTML=trophies.map(t=>{
    const total=combined[t.key]||0;
    const myEarned=earned.filter(h=>h.trophy===t.key);
    return`<div class="hon-card">
      <div class="hon-icon">${t.icon}</div>
      <div class="hon-name">${t.name}</div>
      <div class="hon-count" style="color:${t.color}">${total}</div>
      <div class="hon-sub">All-time wins</div>
      ${myEarned.length?`<div class="hon-earned">+${myEarned.length} in your save</div>
        <div class="hon-history">${myEarned.map(h=>`<div class="hon-season">🏆 ${h.season}</div>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}

// ── SETTINGS ──────────────────────────────────────────────────
async function renderSettings(){
  const seasons=await getAllSeasons();
  const el=document.getElementById('season-history');
  if(!el) return;
  if(!seasons.length){el.innerHTML=`<div class="no-data">No completed seasons yet.</div>`;return;}
  el.innerHTML=`<div class="season-hist">${[...seasons].reverse().map(s=>`
    <div class="sh-row">
      <div class="sh-season">Season ${s.season}</div>
      <div class="sh-detail">
        ${s.userFinish}${['st','nd','rd'][s.userFinish-1]||'th'} place ·
        ${s.topScorers?.[0]?`Top scorer: ${s.topScorers[0].name} (${s.topScorers[0].goals}g)`:''}
        ${s.topAssists?.[0]?`· Top assists: ${s.topAssists[0].name} (${s.topAssists[0].assists}a)`:''}
        ${s.prizeMoney?`· Prize: ${fmt.money(s.prizeMoney)}`:''}
      </div>
    </div>`).join('')}</div>`;
}

// ── NEW GAME ───────────────────────────────────────────────────
function renderNewGame(){
  const grid=document.getElementById('team-grid');
  let selId=null,leagueFilter='all';

  const ALL_TEAMS_DATA=[
    ...(typeof PL_TEAMS!=='undefined'?PL_TEAMS:[]),
    ...(typeof EXTRA_LEAGUES_TEAMS!=='undefined'?EXTRA_LEAGUES_TEAMS:[]),
  ];

  const leagues=[...new Set(ALL_TEAMS_DATA.map(t=>t.league||'Premier League'))];

  // Build league filter buttons
  const filterEl=document.getElementById('ng-filters');
  if(filterEl){
    filterEl.innerHTML=`<button class="ng-f on" data-league="all">All (${ALL_TEAMS_DATA.length})</button>`
      +leagues.map(l=>{
        const count=ALL_TEAMS_DATA.filter(t=>(t.league||'Premier League')===l).length;
        const icons={'Premier League':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','La Liga':'🇪🇸','Bundesliga':'🇩🇪','Serie A':'🇮🇹','Ligue 1':'🇫🇷'};
        return `<button class="ng-f" data-league="${l}">${icons[l]||'🌐'} ${l} (${count})</button>`;
      }).join('');
  }

  function buildGrid(){
    const teams=leagueFilter==='all'?ALL_TEAMS_DATA:ALL_TEAMS_DATA.filter(t=>(t.league||'Premier League')===leagueFilter);
    grid.innerHTML=teams.map(t=>`
      <div class="team-card ${t.id===selId?'sel':''}" data-tid="${t.id}">
        <div class="tc-crest">${t.crest}</div>
        <div class="tc-name">${t.name}</div>
        <div class="tc-rep">${t.league||'Premier League'} · Rep ${t.reputation}</div>
        <div class="tc-budget">${fmt.money(t.budget)}</div>
      </div>`).join('');
    grid.querySelectorAll('.team-card').forEach(card=>{
      card.onclick=()=>{
        grid.querySelectorAll('.team-card').forEach(c=>c.classList.remove('sel'));
        card.classList.add('sel');
        selId=card.dataset.tid;
        document.getElementById('btn-start').disabled=false;
      };
    });
  }

  buildGrid();

  document.querySelectorAll('#ng-filters .ng-f').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('#ng-filters .ng-f').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      leagueFilter=btn.dataset.league;
      buildGrid();
    };
  });

  document.getElementById('btn-start').onclick=async()=>{
    if(!selId) return;
    const btn=document.getElementById('btn-start');
    btn.disabled=true; btn.textContent='Setting up…';
    try{
      await startNewGame(selId);
      document.getElementById('ng').style.display='none';
      document.getElementById('app').style.display='flex';
      initUI();
      await navigateTo('home');
    }catch(err){
      btn.disabled=false; btn.textContent='Start Season →';
      toast(err.message,'error');
    }
  };
}

// ── INIT UI ────────────────────────────────────────────────────
function initUI(){
  registerScreen('home',         renderHome);
  registerScreen('transfers',    renderTransfers);
  registerScreen('competitions', renderCompetitions);
  registerScreen('cups',         renderCups);
  registerScreen('squad',        renderSquad);
  registerScreen('academy',      renderAcademy);
  registerScreen('tactics',      renderTactics);
  registerScreen('offers',       renderOffers);
  registerScreen('honours',      renderHonours);
  registerScreen('settings',     renderSettings);

  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click',()=>navigateTo(el.dataset.nav));
  });
  document.getElementById('h-tbl-link')?.addEventListener('click',()=>navigateTo('competitions'));
  document.getElementById('btn-reset')?.addEventListener('click',()=>{
    showModal('Reset Game?',
      '<p style="color:var(--tx2);line-height:1.7">Delete all progress and return to team selection. Cannot be undone.</p>',
      [{id:'reset',label:'Reset',cls:'btn-d',handler:async()=>{await deleteDB();location.reload();}},
       {id:'cancel',label:'Cancel',cls:'btn-s'}]
    );
  });
}

// ── BOOT ──────────────────────────────────────────────────────
async function boot(){
  try{
    await openDB();
    const save=await getSave();
    if(!save||save._deleted){
      document.getElementById('ng').style.display='flex';
      document.getElementById('app').style.display='none';
      renderNewGame();
    } else {
      document.getElementById('ng').style.display='none';
      document.getElementById('app').style.display='flex';
      initUI();
      await navigateTo('home');
    }
  }catch(err){
    console.error('[boot]',err);
    document.body.innerHTML=`<div style="color:var(--acc3);padding:40px;font-family:monospace;background:var(--night)">Fatal error: ${err.message}<br><br><button onclick="location.reload()" style="padding:8px 16px;margin-top:12px;cursor:pointer">Reload</button></div>`;
  }
}

document.addEventListener('DOMContentLoaded',boot);
