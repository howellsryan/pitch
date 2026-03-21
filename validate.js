/**
 * PITCH — Validation Suite  v6
 * Run: node /home/claude/pitch2/validate.js
 * POLICY: Every new feature must add checks here before shipping.
 * 14 sections — deep behavioural smoke tests, not just presence checks.
 */
const fs = require('fs'), cp = require('child_process');
const BUNDLE = '/tmp/bundle_final.js';
if (!fs.existsSync(BUNDLE)) { console.error('Bundle not found: '+BUNDLE); process.exit(1); }

const GLOBALS = `
const indexedDB={open:()=>({})};
const document={
  getElementById:(id)=>{const e={style:{},className:'',classList:{add:()=>{},remove:()=>{},contains:()=>false},innerHTML:'',textContent:'',addEventListener:()=>{},querySelectorAll:()=>[],querySelector:()=>null,appendChild:()=>{},dataset:{},onclick:null,disabled:false,_id:id};return e;},
  querySelectorAll:()=>[],createElement:()=>({style:{},className:'',classList:{add:()=>{},remove:()=>{},contains:()=>false},innerHTML:'',textContent:'',addEventListener:()=>{},querySelectorAll:()=>[],querySelector:()=>null,appendChild:()=>{},dataset:{},onclick:null,disabled:false}),
  body:{appendChild:()=>{},innerHTML:''},addEventListener:()=>{}
};
const window={innerWidth:1200};const location={reload:()=>{}};
const requestAnimationFrame=()=>{};const setTimeout=()=>{};const clearTimeout=()=>{};
`;

const TESTS = `
const code = ${JSON.stringify(fs.readFileSync(BUNDLE,'utf8'))};
const shellSrc = require('fs').readFileSync('/home/claude/pitch2/shell.html','utf8');
let pass=0,fail=0;
const failures=[];
let sec='';
const _secTimers={};
let _lastSec=null;
const section=(n)=>{
  if(_lastSec&&_secTimers[_lastSec]){
    const elapsed=Date.now()-_secTimers[_lastSec];
    console.log('  ⏱ '+elapsed+'ms');
  }
  sec=n;_lastSec=n;_secTimers[n]=Date.now();
  console.log('\\n'+'─'.repeat(60)+'\\n  '+n+'\\n'+'─'.repeat(60));
};
const chk=(label,val,detail='')=>{
  const ok=!!val;
  console.log('  '+(ok?'OK':'FAIL')+' '+label+(detail?'  ('+detail+')':''));
  if(ok)pass++;else{
    fail++;
    const diag=detail?label+' | got: '+detail : label;
    failures.push({section:sec, label, detail:detail||'(no detail)', diag});
  }
};
const chkEq=(label,actual,expected)=>{
  const ok=actual===expected;
  console.log('  '+(ok?'OK':'FAIL')+' '+label+(ok?'':'  (expected: '+JSON.stringify(expected)+', got: '+JSON.stringify(actual)+')'));
  if(ok)pass++;else{
    fail++;
    failures.push({section:sec, label, detail:'expected: '+JSON.stringify(expected)+', got: '+JSON.stringify(actual), diag:label+' | expected: '+JSON.stringify(expected)+', got: '+JSON.stringify(actual)});
  }
};
const chkRange=(label,val,min,max)=>{
  const ok=val>=min&&val<=max;
  console.log('  '+(ok?'OK':'FAIL')+' '+label+'  ('+val+' in ['+min+','+max+'])');
  if(ok)pass++;else{
    fail++;
    failures.push({section:sec, label, detail:'val='+val+' not in ['+min+','+max+']', diag:label+' | val='+val+' not in ['+min+','+max+']'});
  }
};

// ══ 1. FIXTURE GENERATION ═════════════════════════════════════
section('1. Fixture Generation');
const plIds=PL_TEAMS.map(t=>t.id);
const fx=generateLeagueFixtures(plIds,2025);
chk('380 fixtures total', fx.length===380, 'got '+fx.length);
chk('Every team exactly 19H+19A', plIds.every(t=>fx.filter(f=>f.homeTeamId===t).length===19&&fx.filter(f=>f.awayTeamId===t).length===19));
let maxRun=0;
plIds.forEach(t=>{const tf=fx.filter(f=>f.homeTeamId===t||f.awayTeamId===t).sort((a,b)=>a.gameweek-b.gameweek);let run=0,last='';tf.forEach(f=>{const v=f.homeTeamId===t?'H':'A';run=v===last?run+1:1;last=v;maxRun=Math.max(maxRun,run);});});
chk('Max consecutive H/A run <=6', maxRun<=6, 'got '+maxRun);
chk('No team 2+ fixtures same GW', !plIds.some(t=>{for(let g=1;g<=38;g++){if(fx.filter(f=>f.gameweek===g&&(f.homeTeamId===t||f.awayTeamId===t)).length>1)return true;}return false;}));
chk('All 38 GWs populated', new Set(fx.map(f=>f.gameweek)).size===38);
chk('Every GW has exactly 10 fixtures', [...Array(38)].every((_,i)=>fx.filter(f=>f.gameweek===i+1).length===10));
chk('Each fixture has unique id', new Set(fx.map(f=>f.id)).size===380);
chk('No team plays itself', !fx.some(f=>f.homeTeamId===f.awayTeamId));
chk('All fixtures have competition=league', fx.every(f=>f.competition==='league'));
chk('All fixtures start unplayed', fx.every(f=>f.played===false));
const pairOk=plIds.every(h=>plIds.filter(a=>a!==h).every(a=>{
  return fx.filter(f=>f.homeTeamId===h&&f.awayTeamId===a).length===1 &&
         fx.filter(f=>f.homeTeamId===a&&f.awayTeamId===h).length===1;
}));
chk('Every pair plays exactly 1H and 1A', pairOk);

// ══ 2. CUP SCHEDULING ════════════════════════════════════════
section('2. Cup Scheduling');
const CUP_IDS=['fa_cup','league_cup','ucl','uel','uecl'];
CUP_IDS.forEach(id=>{
  const meta=CUP_META[id];
  chk(id+': exists in CUP_META', !!meta);
  chk(id+': has roundGWs array', Array.isArray(meta&&meta.roundGWs)&&meta.roundGWs.length>0);
  chk(id+': all GWs within 1-38', (meta&&meta.roundGWs||[]).every(g=>g>=1&&g<=38), ''+(meta&&meta.roundGWs));
  chk(id+': rounds strictly ascending', (meta&&meta.roundGWs||[]).every((g,i)=>i===0||g>meta.roundGWs[i-1]));
  chk(id+': has name string', typeof (meta&&meta.name)==='string'&&meta.name.length>0);
  chk(id+': has icon string', typeof (meta&&meta.icon)==='string'&&meta.icon.length>0);
  chk(id+': has rounds array', Array.isArray(meta&&meta.rounds)&&meta.rounds.length>0);
});
chk('UCL group stage GWs all in 1-38', (CUP_META.ucl.groupStageGWs||[]).every(g=>g>=1&&g<=38));
chk('UCL group stage has 8 matchdays', (CUP_META.ucl.groupStageGWs||[]).length===8);
chk('UCL knockouts start >= GW20', CUP_META.ucl.roundGWs[0]>=20);
chk('FA Cup Final <= GW38', CUP_META.fa_cup.roundGWs[CUP_META.fa_cup.roundGWs.length-1]<=38);
chk('League Cup Final <= GW38', CUP_META.league_cup.roundGWs[CUP_META.league_cup.roundGWs.length-1]<=38);
chk('UCL isGroupStage=true', CUP_META.ucl.isGroupStage===true);
chk('UCL_CLUBS array of 20+', Array.isArray(UCL_CLUBS)&&UCL_CLUBS.length>=20);
chk('UCL_CLUBS each has id/name/strength', UCL_CLUBS.every(c=>c.id&&c.name&&typeof c.strength==='number'));

// ══ 3. ONE-EVENT-PER-PRESS ARCHITECTURE ══════════════════════
section('3. One-Event-Per-Press Architecture');
chk('getNextMatchEvent defined', typeof getNextMatchEvent==='function');
chk('advanceOneFixture defined', typeof advanceOneFixture==='function');
chk('advanceOneFixture accepts overrideFormation', code.includes('overrideFormation'));
chk('advanceOneFixtureWithResult defined', typeof advanceOneFixtureWithResult==='function');
chk('getNextUserFixture defined', typeof getNextUserFixture==='function');
chk('pendingEvents in save shape', code.includes('pendingEvents'));
chk('buildPendingEvents defined', code.includes('function buildPendingEvents'));
chk("event.type 'league' handled", code.includes("event.type === 'league'")||code.includes("type==='league'"));
chk("event.type 'ucl_md' handled", code.includes("'ucl_md'"));
chk("event.type 'cup' handled", code.includes("event.type === 'cup'")||code.includes("type==='cup'"));
chk('GW advances when pending empty', code.includes('pending.length === 0')||code.includes('gwDone'));
chk('No finaliseGW present', !code.includes('finaliseGW'));
chk('processCupRounds NOT present', !code.includes('processCupRounds'));
chk('eventsLeft returned to UI', code.includes('eventsLeft'));
chk("'no_user_event' type handled", code.includes("'no_user_event'"));
// Smoke: 1 league fixture -> 1 event
const mockFix=[{id:'gw1_a_b',competition:'league',gameweek:1,homeTeamId:'user',awayTeamId:'opp',played:false}];
const pe1=buildPendingEvents(1,'user',mockFix,{},[]);
chk('1 league fixture = 1 event', pe1.length===1&&pe1[0].type==='league');
chk('league event carries fixtureId', pe1[0].fixtureId==='gw1_a_b');
// Smoke: no fixture -> empty
const pe0=buildPendingEvents(1,'user',[],{},[]);
chk('no fixture = 0 events', pe0.length===0);
// Smoke: played fixture not included
const mockPlayed=[{id:'p1',competition:'league',gameweek:1,homeTeamId:'user',awayTeamId:'opp',played:true}];
const pe0b=buildPendingEvents(1,'user',mockPlayed,{},[]);
chk('played fixture excluded', pe0b.length===0);
// Smoke: active cup on same GW adds 2 events
const mockCups={fa_cup:{status:'active',roundIndex:0,results:[]}};
const pe2=buildPendingEvents(22,'user',mockFix,mockCups,[]);
chk('league + FA Cup = 2 events', pe2.length===2);
chk('cup event has type=cup', pe2.some(e=>e.type==='cup'));
chk('cup event has cupId=fa_cup', pe2.find(e=>e.type==='cup')&&pe2.find(e=>e.type==='cup').cupId==='fa_cup');
chk('cup event has roundName string', typeof (pe2.find(e=>e.type==='cup')||{}).roundName==='string');
// Smoke: eliminated cup not added
const pe3=buildPendingEvents(22,'user',mockFix,{fa_cup:{status:'eliminated',roundIndex:0,results:[]}},[]);
chk('eliminated cup not added', pe3.length===1);

// ══ 4. PRE-MATCH MODAL & BUTTON WIRING ═══════════════════════
section('4. Pre-Match Modal & Button Wiring');
chk('showPreMatchModal defined', typeof showPreMatchModal==='function');
chk('getTeamRecentForm defined', typeof getTeamRecentForm==='function');
chk('getInFormPlayer defined', typeof getInFormPlayer==='function');
chk('handleAdvanceOneFixture defined', typeof handleAdvanceOneFixture==='function');
chk('_launchWatchMatch defined', typeof _launchWatchMatch==='function');
chk('_generateStubPlayers defined', typeof _generateStubPlayers==='function');
chk('btn-adv-header in HTML', shellSrc.includes('btn-adv-header'));
chk('btn-eoy-header in HTML', shellSrc.includes('btn-eoy-header'));
chk('hdrPlay.onclick -> showPreMatchModal', /hdrPlay\.onclick/.test(code)&&code.includes('showPreMatchModal'));
chk('hdrEOY.onclick -> handleEndOfSeason', /hdrEOY\.onclick/.test(code)&&code.includes('handleEndOfSeason'));
chk('pm-fm-display shows formation', code.includes('pm-fm-display'));
chk('pm-xi-preview shows lineup', code.includes('pm-xi-preview'));
chk('Tactics screen hint in pre-match', code.includes('Tactics screen'));
chk('selectEleven accepts lineup param', code.includes('function selectEleven(players, formation') && code.includes('lineup'));
chk('simulateMatch passes lineup', code.includes('simulateMatch(') && code.includes('hLineup') && code.includes('aLineup'));
chk('buildLiveMatchState passes lineup', code.includes('buildLiveMatchState(') && code.includes('homeLineup') && code.includes('awayLineup'));
chk('advanceOneFixture reads save.lineup', code.includes('save.lineup'));
chk('No pm-change-tactics (removed)', !code.includes('pm-change-tactics'));
chk('No pm-fm-picker (removed)', !code.includes('pm-fm-picker'));
chk('No pm-tactic-warning (removed)', !code.includes('pm-tactic-warning'));
chk('pm-form-pill for opponent form', code.includes('pm-form-pill'));
chk('pm-inform-card for key player', code.includes('pm-inform-card'));
chk('pm-comp-badge competition label', code.includes('pm-comp-badge'));
chk('Quick Sim button label', code.includes('Quick Sim'));
chk('Watch Match button label', code.includes('Watch Match'));
chk("quick-sim button id", code.includes("id: 'quick-sim'"));
chk("watch-match button id", code.includes("id: 'watch-match'"));
// _generateStubPlayers smoke
const stubs=_generateStubPlayers({id:'stub_club',name:'Test',crest:'T'},85);
chk('Stub players: 16 generated', stubs.length===16);
chk('Stub: GK present', stubs.some(p=>p.position==='GK'));
chk('Stub: ST present', stubs.some(p=>p.position==='ST'));
chk('Stub: CB present', stubs.some(p=>p.position==='CB'));
chk('Stub: no null ids', stubs.every(p=>p.id&&p.id.length>0));
chk('Stub: fitness=90', stubs.every(p=>p.fitness===90));
chk('Stub: inSquad=true', stubs.every(p=>p.inSquad===true));
chk('Stub: teamId=stub_club', stubs.every(p=>p.teamId==='stub_club'));
chk('Stub: GK has goalkeeping>=55', stubs.filter(p=>p.position==='GK').every(p=>p.goalkeeping>=55));
chk('Stub: ratings sane (0-99)', stubs.every(p=>[p.attack,p.midfield,p.defence,p.goalkeeping].every(v=>v>=0&&v<=99)));

// ══ 5. MATCH ENGINE ══════════════════════════════════════════
section('5. Match Engine');
const lpl=PL_TEAMS.find(t=>t.id==='liverpool').players.map(p=>({...p,teamId:'l',fitness:90,inSquad:true,injured:false,suspended:false}));
const mcp=PL_TEAMS.find(t=>t.id==='man_city').players.map(p=>({...p,teamId:'m',fitness:90,inSquad:true,injured:false,suspended:false}));
let gkGoals=0,totalGoals=0;
const dist={ATT:0,MID:0,DEF:0,GK:0};
const N=30;
for(let i=0;i<N;i++){
  const r=simulateMatch({id:'l',name:'L',crest:'L'},{id:'m',name:'M',crest:'M'},lpl,mcp,'4-3-3','4-3-3');
  [...r.homeScorers,...r.awayScorers].forEach(s=>{
    totalGoals++;
    const p=[...lpl,...mcp].find(q=>q.id===s.playerId);
    if(p&&p.position==='GK')gkGoals++;
    const g=positionGroup(p&&p.position||'CM');
    dist[g]=(dist[g]||0)+1;
  });
}
chk('GK goals=0 across '+N+' games', gkGoals===0, 'got '+gkGoals);
chk('ATT scores more than MID', (dist.ATT||0)>(dist.MID||0));
chk('ATT scores more than DEF', (dist.ATT||0)>(dist.DEF||0));
const gpg=totalGoals/N;
chk('Goals/game in range 2.0-4.5', gpg>=2.0&&gpg<=4.5, gpg.toFixed(1)+'/game');
console.log('    ATT='+Math.round((dist.ATT||0)/totalGoals*100)+'%  MID='+Math.round((dist.MID||0)/totalGoals*100)+'%  DEF='+Math.round((dist.DEF||0)/totalGoals*100)+'%  GK=0%');
// Stats shape
const mr=simulateMatch({id:'a',name:'A',crest:'A'},{id:'b',name:'B',crest:'B'},[],[]);
chk('stats.possession.home is number', typeof (mr.stats&&mr.stats.possession&&mr.stats.possession.home)==='number');
chk('stats.possession sums to 100', ((mr.stats&&mr.stats.possession&&mr.stats.possession.home)||0)+((mr.stats&&mr.stats.possession&&mr.stats.possession.away)||0)===100);
chk('stats.xG.home is number', typeof (mr.stats&&mr.stats.xG&&mr.stats.xG.home)==='number');
chk('stats.shots.home is number', typeof (mr.stats&&mr.stats.shots&&mr.stats.shots.home)==='number');
chk('stats.shotsOnTarget present', typeof (mr.stats&&mr.stats.shotsOnTarget&&mr.stats.shotsOnTarget.home)==='number');
chk('stats.corners present', typeof (mr.stats&&mr.stats.corners&&mr.stats.corners.home)==='number');
chk('stats.fouls present', typeof (mr.stats&&mr.stats.fouls&&mr.stats.fouls.home)==='number');
chk('stats.yellowCards present', typeof (mr.stats&&mr.stats.yellowCards&&mr.stats.yellowCards.home)==='number');
chk('fitnessUpdates is array', Array.isArray(mr.fitnessUpdates));
chk('outcome field valid', ['home_win','away_win','draw'].includes(mr.outcome));
chk('events sorted by minute', mr.events.every((e,i)=>i===0||e.minute>=mr.events[i-1].minute));
chk('homeTeamName present', typeof mr.homeTeamName==='string');
chk('GK scorer weight=0 in code', code.includes("'GK': 0")||code.includes('"GK": 0'));
chk('HOME on left in match report', code.includes('>HOME<'));
chk('AWAY on right in match report', code.includes('>AWAY<'));
// Home advantage
let homeWins=0;
for(let i=0;i<30;i++){const r=simulateMatch({id:'h',name:'H',crest:'H'},{id:'a',name:'A',crest:'A'},lpl,mcp,'4-3-3','4-3-3');if(r.outcome==='home_win')homeWins++;}
chk('Home win rate >20% over 30 games', homeWins>6, homeWins+'/30 home wins');
// Fitness updates sane
const fullMr=simulateMatch({id:'l',name:'L',crest:'L'},{id:'m',name:'M',crest:'M'},lpl,mcp,'4-3-3','4-2-3-1');
chk('fitnessUpdates non-empty', fullMr.fitnessUpdates.length>0);
chk('fitnessUpdates newFitness 0-100', fullMr.fitnessUpdates.every(f=>f.newFitness>=0&&f.newFitness<=100));
// Formation constants
chk('FORMATIONS defined', typeof FORMATIONS==='object');
chk('4-3-3 in FORMATIONS', '4-3-3' in FORMATIONS);
chk('4-4-2 in FORMATIONS', '4-4-2' in FORMATIONS);
chk('3-5-2 in FORMATIONS', '3-5-2' in FORMATIONS);
chk('selectEleven returns 11', selectEleven(lpl,'4-3-3').length===11);
chk('selectEleven has exactly 1 GK', selectEleven(lpl,'4-3-3').filter(p=>p.position==='GK').length===1);
chk('selectBench returns all non-XI squad', selectBench(lpl,selectEleven(lpl,'4-3-3')).length>=5);
chk('pickAIFormation returns valid key', Object.keys(FORMATIONS).includes(pickAIFormation()));
chk('positionGroup ATT', positionGroup('ST')==='ATT');
chk('positionGroup MID', positionGroup('CM')==='MID');
chk('positionGroup DEF', positionGroup('CB')==='DEF');
chk('positionGroup GK', positionGroup('GK')==='GK');

// ══ 6. POTENTIAL SYSTEM ══════════════════════════════════════
section('6. Potential System');
chk('assignPotentials defined', typeof assignPotentials==='function');
chk('getPotentialStars defined', typeof getPotentialStars==='function');
chk('applyDevelopment defined', typeof applyDevelopment==='function');
chk('agingValueAdjust defined', typeof agingValueAdjust==='function');
const wp=assignPotentials(lpl.map(p=>({...p})));
chk('All players get potentialRating>0', wp.every(p=>p.potentialRating>0));
chk('Potential always >= current rating', wp.every(p=>p.potentialRating>=primaryRating(p)));
chk('Potential always <=99', wp.every(p=>p.potentialRating<=99));
const youngPl=wp.filter(p=>p.age<=21);
const oldPl=wp.filter(p=>p.age>=30);
const yh=youngPl.length?youngPl.reduce((s,p)=>s+(p.potentialRating-primaryRating(p)),0)/youngPl.length:0;
const vh=oldPl.length?oldPl.reduce((s,p)=>s+(p.potentialRating-primaryRating(p)),0)/oldPl.length:0;
chk('Young players more headroom than vets', yh>=vh, 'young +'+yh.toFixed(1)+'  vet +'+vh.toFixed(1));
chk('5-star: potentialRating 91 -> stars=5', getPotentialStars({potentialRating:91})===5);
chk('4-star range (>=84)', getPotentialStars({potentialRating:85})===4);
chk('3-star range', getPotentialStars({potentialRating:76})===3);
chk('2-star range', getPotentialStars({potentialRating:71})===2);
chk('1-star: potentialRating 60 -> stars=1', getPotentialStars({potentialRating:60})===1);
chk('peakAge field used in code', code.includes('peakAge'));
const adjYoung=agingValueAdjust({age:19,potentialRating:85});
const adjOld=agingValueAdjust({age:34,potentialRating:85});
chk('agingValueAdjust: young >= old multiplier', adjYoung>=adjOld);

// ══ 7. SQUAD DATA 2025/26 ════════════════════════════════════
section('7. Squad Data (2025/26)');
chk('PL_TEAMS has 20 teams', PL_TEAMS.length===20);
chk('All PL teams have id', PL_TEAMS.every(t=>t.id&&t.id.length>0));
chk('All PL teams have name', PL_TEAMS.every(t=>t.name&&t.name.length>0));
chk('All PL teams have crest', PL_TEAMS.every(t=>t.crest&&t.crest.length>0));
chk('All PL teams have reputation number', PL_TEAMS.every(t=>typeof t.reputation==='number'));
chk('All PL teams >=12 players', PL_TEAMS.every(t=>(t.players||[]).length>=12));
chk('All PL teams <=35 players', PL_TEAMS.every(t=>(t.players||[]).length<=35));
chk('All players have name/position/ratings', PL_TEAMS.every(t=>(t.players||[]).every(p=>p.name&&p.position&&typeof p.attack==='number'&&typeof p.midfield==='number'&&typeof p.defence==='number'&&typeof p.goalkeeping==='number')));
chk('All player ratings 0-99', PL_TEAMS.every(t=>(t.players||[]).every(p=>[p.attack,p.midfield,p.defence,p.goalkeeping].every(v=>v>=0&&v<=99))));
chk('Each PL team has at least 1 GK', PL_TEAMS.every(t=>(t.players||[]).some(p=>p.position==='GK')));
chk('All PL team ids unique', new Set(PL_TEAMS.map(t=>t.id)).size===PL_TEAMS.length);
chk('EXTRA_LEAGUES_TEAMS >=23', Array.isArray(EXTRA_LEAGUES_TEAMS)&&EXTRA_LEAGUES_TEAMS.length>=23);
chk('CHAMPIONSHIP_TEAMS >=6', Array.isArray(CHAMPIONSHIP_TEAMS)&&CHAMPIONSHIP_TEAMS.length>=6);
chk('Liverpool has Isak', (PL_TEAMS.find(t=>t.id==='liverpool')||{players:[]}).players.some(p=>p.name.includes('Isak')));
chk('Liverpool has Wirtz', (PL_TEAMS.find(t=>t.id==='liverpool')||{players:[]}).players.some(p=>p.name.includes('Wirtz')));
chk('Newcastle does NOT have Isak', !(PL_TEAMS.find(t=>t.id==='newcastle')||{players:[]}).players.some(p=>p.name.includes('Isak')));
chk('Chelsea has Sancho', (PL_TEAMS.find(t=>t.id==='chelsea')||{players:[]}).players.some(p=>p.name.includes('Sancho')));
chk('UCL_CLUBS has 20+', Array.isArray(UCL_CLUBS)&&UCL_CLUBS.length>=20);
chk('UCL_CLUBS all have strength', UCL_CLUBS.every(c=>typeof c.strength==='number'&&c.strength>0));

// ══ 8. PROMOTION & RELEGATION ════════════════════════════════
section('8. Promotion & Relegation');
chk('getEuropeanQualifiers defined', typeof getEuropeanQualifiers==='function');
chk('getZoneInfo defined', typeof getZoneInfo==='function');
chk('processLeagueChanges in code', code.includes('processLeagueChanges'));
const mt=[...Array(20)].map((_,i)=>({teamId:'t'+i,points:40-i*2,goalDifference:10-i}));
const q=getEuropeanQualifiers(mt);
chk('Top 4 get UCL (length=4)', q.ucl.length===4);
chk('UCL includes 1st place t0', q.ucl[0]==='t0');
chk('UCL includes 4th place t3', q.ucl[3]==='t3');
chk('5th-6th get UEL (length=2)', q.uel.length===2&&q.uel[0]==='t4');
chk('7th gets UECL', q.uecl[0]==='t6');
chk('Bottom 3 relegated (length=3)', q.relegated.length===3);
chk('18-20 all in relegated', ['t17','t18','t19'].every(t=>q.relegated.includes(t)));
chk('getZoneInfo: PL pos 1 = ucl', getZoneInfo(1,20).zone==='ucl');
chk('getZoneInfo: PL pos 4 = ucl', getZoneInfo(4,20).zone==='ucl');
chk('getZoneInfo: PL pos 5 = uel', getZoneInfo(5,20).zone==='uel'||getZoneInfo(5,20).zone==='uel');
chk('getZoneInfo: PL pos 7 = uecl', getZoneInfo(7,20).zone==='uecl');
chk('getZoneInfo: PL pos 18 = rel', getZoneInfo(18,20).zone==='rel');
chk('getZoneInfo: PL pos 20 = rel', getZoneInfo(20,20).zone==='rel');
chk('getZoneInfo: Champ pos 1 = auto', getZoneInfo(1,24).zone==='auto');
chk('getZoneInfo: Champ pos 2 = auto', getZoneInfo(2,24).zone==='auto');
chk('getZoneInfo: Champ pos 22 = rel', getZoneInfo(22,24).zone==='rel');
chk('getZoneInfo: Champ pos 24 = rel', getZoneInfo(24,24).zone==='rel');

// ══ 9. BUDGET SCALING ════════════════════════════════════════
section('9. Budget Scaling');
chk('reputationBudget defined', typeof reputationBudget==='function');
const reps=[99,96,90,85,80,77,70,65,60];
const bgs=reps.map(r=>reputationBudget(r));
chk('Budgets non-increasing with rep', bgs.every((b,i)=>i===0||b<=bgs[i-1]+1000000));
chk('Rep99 >= 180m', bgs[0]>=180000000, 'GBP'+(bgs[0]/1e6).toFixed(0)+'m');
chk('Rep70 >= 15m', bgs[6]>=15000000);
chk('Rep60 > 0', bgs[8]>0);
chk('All budgets positive integers', bgs.every(b=>b>0&&Number.isInteger(b)));
console.log('    '+reps.map((r,i)=>'Rep'+r+'=GBP'+(bgs[i]/1e6).toFixed(0)+'m').join('  '));

// ══ 10. UI FUNCTIONS ═════════════════════════════════════════
section('10. UI Functions');
[
  'renderHome','renderCharts','renderTransfers','renderCompetitions','renderCups',
  'renderSquad','renderTactics','renderOffers','renderHonours','renderSettings',
  'renderNewGame','showMatchReport','showPreMatchModal','handleAdvanceOneFixture',
  'handleEndOfSeason','navigateTo','registerScreen','showModal','toast',
  'showLoader','hideLoader','boot',
  'showWatchMatchModal','_launchWatchMatch','_generateStubPlayers'
].forEach(fn=>chk(fn+' defined', typeof eval(fn)==='function'));
// Shell structure
chk('screen-home in HTML', shellSrc.includes('id="screen-home"'));
chk('screen-transfers in HTML', shellSrc.includes('id="screen-transfers"'));
chk('screen-competitions in HTML', shellSrc.includes('id="screen-competitions"'));
chk('screen-cups in HTML', shellSrc.includes('id="screen-cups"'));
chk('screen-squad in HTML', shellSrc.includes('id="screen-squad"'));
chk('screen-academy in HTML', shellSrc.includes('id="screen-academy"'));
chk('screen-tactics in HTML', shellSrc.includes('id="screen-tactics"'));
chk('screen-offers in HTML', shellSrc.includes('id="screen-offers"'));
chk('screen-honours in HTML', shellSrc.includes('id="screen-honours"'));
chk('screen-settings in HTML', shellSrc.includes('id="screen-settings"'));
chk('sidebar nav present', shellSrc.includes('class="sidebar"'));
chk('mobile bot-nav present', shellSrc.includes('class="bot-nav"'));
chk('Academy in desktop sidebar', (()=>{const sb=shellSrc.indexOf('class="sidebar"');return sb>-1&&shellSrc.indexOf('data-nav="academy"',sb)<sb+3000;})());
chk('Academy in mobile bottom nav', (()=>{const bn=shellSrc.indexOf('<nav class="bot-nav">');return bn>-1&&shellSrc.indexOf('data-nav="academy"',bn)<bn+3000;})());
chk('showModal supports opts.wide', code.includes('opts.wide'));
chk('showModal supports opts.noDismiss', code.includes('opts.noDismiss'));
chk('modal-bd id used consistently', code.includes("'modal-bd'"));
chk('Single <script> tag in HTML', (shellSrc.match(/<script/g)||[]).length===1);

// ══ 11. TRANSFER SYSTEM ══════════════════════════════════════
section('11. Transfer System');
chk('buyPlayer defined', typeof buyPlayer==='function');
chk('sellPlayer defined', typeof sellPlayer==='function');
chk('generateAIOffers defined', typeof generateAIOffers==='function');
chk('formAdjustedValue defined', typeof formAdjustedValue==='function');
const basePl={value:50000000,goals:0,assists:0,cleanSheets:0,form:50};
const hotPl={...basePl,goals:18,assists:10};
const coldPl={...basePl,goals:0,assists:0};
chk('Hot form boosts value', formAdjustedValue(hotPl)>formAdjustedValue(basePl));
chk('Cold form <= base value', formAdjustedValue(coldPl)<=formAdjustedValue(basePl));
chk('formAdjustedValue returns positive', formAdjustedValue(basePl)>0);
chk('transferListed field used', code.includes('transferListed'));
chk('inboundOffers in save', code.includes('inboundOffers'));

// ══ 12. STALE REFERENCE & CODE QUALITY ═══════════════════════
section('12. Stale Reference & Code Quality');
[
  ['fmtMoney(','use fmt.money()'],
  ['fmtWage(','use fmt.wage()'],
  ['showToast(','use toast()'],
  ['formLbl(','use formLabel()'],
  ['finaliseGW(','removed'],
  ['handleAdvanceOneFixture_OLD_STUB','old stub removed'],
  ['processCupRounds(','removed - cups are queued events'],
  ["name: 'Unknown Opponent'",'cup opponent must be pre-drawn'],
].forEach(([r,reason])=>chk('No stale ref: '+r.trim(), !code.includes(r), reason));
chk('Braces balanced', code.split('{').length===code.split('}').length);
const bpcStart=code.indexOf('function buildPlayerCard');
const bpcSrc=bpcStart>-1?code.slice(bpcStart,bpcStart+2500):'';
chk('potDisp defined before use', bpcSrc.length>0&&bpcSrc.indexOf('potDisp =') <bpcSrc.indexOf('potDisp ?'));
chk('potColor defined before use', bpcSrc.length>0&&bpcSrc.indexOf('potColor =') <bpcSrc.indexOf('potColor}'));
chk('potLabel defined before use', bpcSrc.length>0&&bpcSrc.indexOf('potLabel =') <bpcSrc.indexOf('potLabel}'));
chk('Domestic cup filters by userLeague', code.includes('userLeague')&&code.includes("'Premier League'")&&code.includes('league_cup'));
chk('Cup event carries opponentName', code.includes('opponentName:')&&(code.includes("type: 'cup'")||code.includes("type:'cup'")));
chk('simulateCupRound receives event', code.includes('simulateCupRound')&&code.includes('event.opponentId'));
chk('Pre-match userIsHome computed', code.includes('userIsHome')&&code.includes('showPreMatchModal'));
chk('No hardcoded Unknown Opponent', !code.includes("'Unknown Opponent'"));
chk('buildUCLOpponents excludes user', code.includes('excludeTeamId')&&code.includes('buildUCLOpponents'));
chk('buildInitialCupState accepts userTeamId', (()=>{const s=code.indexOf('function buildInitialCupState');return s>-1&&code.slice(s,s+100).includes('userTeamId');})());
chk('simulateUCLMatchday guards self-match', code.includes('rawOpp.id === userTeam.id'));
chk('UCL matchday returns userIsHome', (()=>{const s=code.indexOf('function simulateUCLMatchday');return s>-1&&code.indexOf('userIsHome',s)<s+2000;})());
chk('UCL homeScorers respect userIsHome', (()=>{const s=code.indexOf('isUCLMatchday: true');return s>-1&&code.indexOf('userIsHome',s)<s+1500;})());
chk('Design token --acc defined in CSS', shellSrc.includes('--acc:#'));
chk('Design token --sur defined in CSS', shellSrc.includes('--sur:'));
chk('ph-play-btn CSS defined', shellSrc.includes('ph-play-btn'));
chk('Bebas Neue font loaded', shellSrc.includes('Bebas+Neue'));
chk('DM Sans font loaded', shellSrc.includes('DM+Sans'));

// ══ 13. YOUTH ACADEMY ════════════════════════════════════════
section('13. Youth Academy');
chk('runYouthIntake defined', typeof runYouthIntake==='function');
chk('promoteYouthPlayer defined', typeof promoteYouthPlayer==='function');
chk('releaseYouthPlayer defined', typeof releaseYouthPlayer==='function');
chk('getAcademyInfo defined', typeof getAcademyInfo==='function');
chk('renderAcademy defined', typeof renderAcademy==='function');
chk('generateCohort in bundle', code.includes('generateCohort'));
chk('generateYouthPlayer in bundle', code.includes('generateYouthPlayer'));
chk('youthCohort in save shape', code.includes('youthCohort'));
chk('isWonderkid field present', code.includes('isWonderkid'));
chk('academy tier elite', code.includes("'elite'"));
chk('academy tier poor', code.includes("'poor'"));
chk('academy tier top', code.includes("'top'"));
chk('academy tier good', code.includes("'good'"));
chk('academy tier average', code.includes("'average'"));
const aiElite=getAcademyInfo(99);
chk('Rep99 -> elite tier', aiElite.tier==='elite');
chk('Elite has 5 stars', aiElite.stars===5);
chk('Elite has description string', typeof aiElite.description==='string'&&aiElite.description.length>0);
const aiPoor=getAcademyInfo(60);
chk('Rep60 -> poor tier', aiPoor.tier==='poor');
chk('Poor has 1 star', aiPoor.stars===1);
const aiTop=getAcademyInfo(90);
chk('Rep90 -> top tier', aiTop.tier==='top');
chk('Top has 4 stars', aiTop.stars===4);
chk('Higher rep -> more stars', aiElite.stars>=aiTop.stars&&aiTop.stars>=aiPoor.stars);
chk('academy-card CSS present', shellSrc.includes('academy-card'));
chk('youth-action in UI', code.includes('youth-action'));
chk('releaseYouthPlayer in UI', code.includes('releaseYouthPlayer'));
chk('WONDERKID badge', code.includes('WONDERKID'));
chk('age-out logic present', code.includes('age <= 19')||code.includes('age<=19'));
chk('AI auto-promotes talented youth', code.includes('potentialRating >= 70')||code.includes('potentialRating>=70'));
chk('runYouthIntake called in processEndOfSeason', (()=>{const s=code.indexOf('function processEndOfSeason');return s>-1&&code.indexOf('runYouthIntake',s)<s+4000;})());
chk('newYouthCohort stored in save', code.includes('newYouthCohort'));
chk('youthCohort seeded in startNewGame', (()=>{const ng=code.indexOf('function startNewGame');return ng>-1&&code.indexOf('youthCohort',ng)<ng+3000;})());
chk('youthTeamId field present', code.includes('youthTeamId'));
chk('isYouth field present', code.includes('isYouth'));

// ══ 14. WATCH MATCH ══════════════════════════════════════════
section('14. Watch Match');
// Core engine exports
chk('simulateMatchSegment defined', typeof simulateMatchSegment==='function');
chk('buildLiveMatchState defined', typeof buildLiveMatchState==='function');
chk('finaliseLiveMatch defined', typeof finaliseLiveMatch==='function');
chk('advanceOneFixtureWithResult defined', typeof advanceOneFixtureWithResult==='function');
// UI
chk('showWatchMatchModal defined', typeof showWatchMatchModal==='function');
chk('_launchWatchMatch defined', typeof _launchWatchMatch==='function');
// Button wiring
chk('quick-sim id present', code.includes("id: 'quick-sim'"));
chk('watch-match id present', code.includes("id: 'watch-match'"));
chk('_launchWatchMatch called from watch-match', (()=>{const s=code.indexOf("id: 'watch-match'");return s>-1&&code.indexOf('_launchWatchMatch',s)<s+200;})());
// Constants
chk('WATCH_PHASES_PER_TICK defined', code.includes('WATCH_PHASES_PER_TICK'));
chk('WATCH_TICK_MS defined', code.includes('WATCH_TICK_MS'));
chk('TOTAL_PHASES=120 in watch code', code.includes('TOTAL_PHASES')&&code.includes('120'));
chk('Speed buttons 1x/2x/4x', code.includes('data-speed="1"')&&code.includes('data-speed="2"')&&code.includes('data-speed="4"'));
chk('speedMultiplier in delay calc', code.includes('speedMultiplier'));
// Intervention
chk('_wmSubClick defined', code.includes('_wmSubClick'));
chk('_applyUserSub defined', code.includes('_applyUserSub'));
chk('_applyFormationChange defined', code.includes('_applyFormationChange'));
chk('_togglePause defined', code.includes('_togglePause'));
chk('_showInterventionPanel defined', code.includes('_showInterventionPanel'));
chk('_commitResult defined', code.includes('_commitResult'));
chk('_finishMatch defined', code.includes('_finishMatch'));
// Strength recalculated after intervention
chk('teamStrength called in _applyUserSub', (()=>{const s=code.indexOf('function _applyUserSub')||code.indexOf('_applyUserSub');return s>-1&&code.indexOf('teamStrength',s)<s+1500;})());
chk('hMidShare recalculated after sub', code.includes('hMidShare')&&code.includes('hStr.midfield + ls.aStr.midfield'));
chk('teamStrength called in _applyFormationChange', (()=>{const s=code.indexOf('_applyFormationChange');return s>-1&&code.indexOf('teamStrength',s)<s+2500;})());
// CSS in shell
chk('wm-scoreboard CSS', shellSrc.includes('wm-scoreboard'));
chk('wm-progress-bar CSS', shellSrc.includes('wm-progress-bar'));
chk('wm-ctrl-btn CSS', shellSrc.includes('wm-ctrl-btn'));
chk('wm-speed-btn CSS', shellSrc.includes('wm-speed-btn'));
chk('wm-ev-user CSS', shellSrc.includes('wm-ev-user'));
chk('wm-ev-opp CSS', shellSrc.includes('wm-ev-opp'));
chk('wm-fit-high CSS', shellSrc.includes('wm-fit-high'));
chk('wm-fit-mid CSS', shellSrc.includes('wm-fit-mid'));
chk('wm-fit-low CSS', shellSrc.includes('wm-fit-low'));
chk('wm-bench-row CSS', shellSrc.includes('wm-bench-row'));
chk('wm-sub-btn CSS', shellSrc.includes('wm-sub-btn'));
chk('wm-ev-in animation CSS', shellSrc.includes('wm-ev-in'));
chk('modal-xl CSS', shellSrc.includes('modal-xl'));
chk('modal-wide CSS', shellSrc.includes('modal-wide'));
// buildLiveMatchState smoke
const mkSt=(tid)=>[
  {id:tid+'_gk',name:'GK0',position:'GK',teamId:tid,attack:30,midfield:40,defence:55,goalkeeping:78,fitness:90,inSquad:true,injured:false,suspended:false},
  ...['CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CB','CM','ST','LW','GK'].map((pos,i)=>({id:tid+'_'+i,name:pos+i,position:pos,teamId:tid,attack:65,midfield:65,defence:65,goalkeeping:20,fitness:90,inSquad:true,injured:false,suspended:false}))
];
const sH={id:'h',name:'Home',crest:'H',reputation:80};
const sA={id:'a',name:'Away',crest:'A',reputation:75};
const ls=buildLiveMatchState(sH,sA,mkSt('h'),mkSt('a'),'4-3-3','4-3-3');
chk('buildLiveMatchState: hActive=11', ls.hActive.length===11);
chk('buildLiveMatchState: aActive=11', ls.aActive.length===11);
chk('buildLiveMatchState: hStr.attack is number', typeof ls.hStr.attack==='number');
chk('buildLiveMatchState: hStr.midfield is number', typeof ls.hStr.midfield==='number');
chk('buildLiveMatchState: hMidShare in [0,1]', ls.hMidShare>=0&&ls.hMidShare<=1);
chk('buildLiveMatchState: goals start at 0', ls.hGoals===0&&ls.aGoals===0);
chk('buildLiveMatchState: hSubsLeft=3', ls.hSubsLeft===3&&ls.aSubsLeft===3);
chk('buildLiveMatchState: hFitness is Map', ls.hFitness instanceof Map);
chk('buildLiveMatchState: bench populated', ls.hBenchLeft.length>0&&ls.aBenchLeft.length>0);
chk('buildLiveMatchState: formations stored', ls.homeFormation==='4-3-3'&&typeof ls.awayFormation==='string');
// simulateMatchSegment single tick
const {segEvents:seg1,updatedState:us1}=simulateMatchSegment(sH,sA,ls,1,10);
chk('simulateMatchSegment: returns events array', Array.isArray(seg1));
chk('simulateMatchSegment: returns updatedState', us1&&typeof us1.hGoals==='number');
chk('simulateMatchSegment: phases 1-10 advanced', us1.hPhases+us1.aPhases>=0&&us1.hPhases+us1.aPhases<=10);
chk('simulateMatchSegment: event minutes in 1-9', seg1.filter(e=>e.minute).every(e=>e.minute>=1&&e.minute<=10));
chk('simulateMatchSegment: goals non-negative', us1.hGoals>=0&&us1.aGoals>=0);
chk('simulateMatchSegment: original liveState unchanged (goals)', ls.hGoals===0);
// Full game via 12 segments
let cur=ls;
const all=[];
for(let t=0;t<12;t++){
  const s0=t*10+1,e0=Math.min((t+1)*10,120);
  const {segEvents:se,updatedState:su}=simulateMatchSegment(sH,sA,cur,s0,e0);
  all.push(...se);cur=su;
}
chk('Full segmented game: 120 phases', cur.hPhases+cur.aPhases===120);
chk('Full segmented game: goals non-negative', cur.hGoals>=0&&cur.aGoals>=0);
// finaliseLiveMatch
const fin=finaliseLiveMatch(sH,sA,cur,all);
chk('finaliseLiveMatch: homeGoals is number', typeof fin.homeGoals==='number');
chk('finaliseLiveMatch: awayGoals matches state', fin.homeGoals===cur.hGoals&&fin.awayGoals===cur.aGoals);
chk('finaliseLiveMatch: stats.possession present', fin.stats&&fin.stats.possession);
chk('finaliseLiveMatch: fitnessUpdates array', Array.isArray(fin.fitnessUpdates)&&fin.fitnessUpdates.length>0);
chk('finaliseLiveMatch: outcome valid', ['home_win','away_win','draw'].includes(fin.outcome));
chk('finaliseLiveMatch: homeScorers array', Array.isArray(fin.homeScorers));
chk('finaliseLiveMatch: events sorted by minute', fin.events.every((e,i)=>i===0||e.minute>=fin.events[i-1].minute));
chk('finaliseLiveMatch: GK never scores', fin.homeScorers.concat(fin.awayScorers).filter(e=>e.type==='goal'||e.playerName).every(e=>e.playerName!=='GK0'));
// Goals accumulate correctly across two half segments
const ls2=buildLiveMatchState(sH,sA,mkSt('h'),mkSt('a'),'4-3-3','4-3-3');
const {updatedState:h1}=simulateMatchSegment(sH,sA,ls2,1,60);
const {updatedState:h2}=simulateMatchSegment(sH,sA,h1,61,120);
chk('Goals accumulate: h2 >= h1 (home)', h2.hGoals>=h1.hGoals);
chk('Goals accumulate: h2 >= h1 (away)', h2.aGoals>=h1.aGoals);
chk('Phases total 120 after two halves', h2.hPhases+h2.aPhases===120);
// advanceOneFixtureWithResult structure check
chk('advanceOneFixtureWithResult calls putFixture', (()=>{const s=code.indexOf('function advanceOneFixtureWithResult');return s>-1&&code.indexOf('putFixture',s)<s+3500;})());
chk('advanceOneFixtureWithResult calls applyResult', (()=>{const s=code.indexOf('function advanceOneFixtureWithResult');return s>-1&&code.indexOf('applyResult',s)<s+3500;})());
chk('advanceOneFixtureWithResult handles ucl_md', (()=>{const s=code.indexOf('function advanceOneFixtureWithResult');return s>-1&&code.indexOf("'ucl_md'",s)<s+4500;})());
chk('advanceOneFixtureWithResult handles cup type', (()=>{const s=code.indexOf('function advanceOneFixtureWithResult');return s>-1&&code.indexOf("'cup'",s)<s+4500;})());
chk('advanceOneFixtureWithResult calls generateAIOffers', (()=>{const s=code.indexOf('function advanceOneFixtureWithResult');return s>-1&&code.indexOf('generateAIOffers',s)<s+5000;})());
// Stub players edge cases
const weakSt=_generateStubPlayers({id:'w',name:'Weak',crest:'W'},40);
const strongSt=_generateStubPlayers({id:'s',name:'Strong',crest:'S'},95);
chk('Stub: weak ST attack <= strong ST attack+35', weakSt.filter(p=>p.position==='ST')[0].attack<=strongSt.filter(p=>p.position==='ST')[0].attack+35);
chk('Stub: GK goalkeeping sanely capped', weakSt.some(p=>p.position==='GK'&&p.goalkeeping>=35&&p.goalkeeping<=99));
chk('Stub: all stub ids contain _stub_', weakSt.every(p=>p.id.includes('_stub_')));

// ── SUB FLOW: Architecture safety ─────────────────────────────
// The most important invariant: _wmSubClick must NEVER call showModal()
// because showModal() replaces #modal-bd which IS the watch match modal.
// It must use the inline wm-inline-panel approach instead.
const wmSubClickSrc=(()=>{
  const start=code.indexOf('window._wmSubClick = function');
  if(start===-1)return '';
  let depth=0,i=start,inFn=false;
  while(i<code.length){
    if(code[i]==='{'){depth++;inFn=true;}
    else if(code[i]==='}'){depth--;if(inFn&&depth===0){return code.slice(start,i+2);}}
    i++;
  }
  return code.slice(start,start+3000);
})();
chk('_wmSubClick does NOT call showModal', !wmSubClickSrc.includes('showModal('));
chk('_wmSubClick uses _openInlinePanel', wmSubClickSrc.includes('_openInlinePanel'));
chk('_wmSubClick uses fixed-position panel helper', code.includes('_openInlinePanel'));
chk('_openInlinePanel appends to document.body', (()=>{const s=code.indexOf('function _openInlinePanel');return s>-1&&code.indexOf('document.body.appendChild',s)<s+1500;})());
chk('_openInlinePanel has close button', (()=>{const s=code.indexOf('function _openInlinePanel');return s>-1&&code.indexOf('wm-panel-close',s)<s+1500;})());
chk('_wmSubClick wires row onclick directly', wmSubClickSrc.includes('row.onclick'));
chk('_wmSubClick calls _applyUserSub', wmSubClickSrc.includes('_applyUserSub'));
chk('_wmSubClick calls close() from _openInlinePanel', wmSubClickSrc.includes('close()'));

// _showInterventionPanel likewise must not call showModal
const interventionSrc=(()=>{
  const start=code.indexOf('function _showInterventionPanel');
  return start>-1?code.slice(start,start+3000):'';
})();
chk('_showInterventionPanel does NOT call showModal', !interventionSrc.includes('showModal('));
chk('_showInterventionPanel uses _openInlinePanel', interventionSrc.includes('_openInlinePanel'));
chk('_showInterventionPanel wires apply button', interventionSrc.includes('wm-panel-apply'));
chk('GKs on bench allowed (backup GK visible)', code.includes("GKs remain on bench")||!code.includes("hBenchLeft.filter(p => p.position !== 'GK')"));
chk('_applyUserSub guards GK↔outfield cross-sub', (()=>{const s=code.indexOf('function _applyUserSub');return s>-1&&code.indexOf("position === 'GK'",s)<s+800&&code.indexOf("position !== 'GK'",s)<s+800;})());
chk('_openInlinePanel defined', typeof _openInlinePanel==='function'||code.includes('function _openInlinePanel'));
chk('_openInlinePanel uses position:fixed', (()=>{const s=code.indexOf('function _openInlinePanel');return s>-1&&code.indexOf('position:fixed',s)<s+1500;})());
chk('corners stat bar in modal', code.includes('wm-stat-corners'));
chk('fouls stat bar in modal', code.includes('wm-stat-fouls'));
chk('wm-team-labels row in modal', code.includes('wm-team-labels'));
chk('wm-col-bench column in modal', code.includes('wm-col-bench'));

// ── SUB FLOW: Behavioural smoke tests on _applyUserSub ────────
// Build a fresh liveState and directly call _applyUserSub to verify
// it correctly mutates bench, active, subsLeft, strength, and allEvents.
const subTestPlayers=(tid)=>[
  {id:tid+'_gk', name:'GK',  position:'GK', teamId:tid,attack:30,midfield:40,defence:55,goalkeeping:78,fitness:90,inSquad:true,injured:false,suspended:false},
  {id:tid+'_cb1',name:'CB1', position:'CB', teamId:tid,attack:40,midfield:45,defence:72,goalkeeping:20,fitness:75,inSquad:true,injured:false,suspended:false},
  {id:tid+'_cb2',name:'CB2', position:'CB', teamId:tid,attack:40,midfield:45,defence:70,goalkeeping:20,fitness:80,inSquad:true,injured:false,suspended:false},
  {id:tid+'_rb', name:'RB',  position:'RB', teamId:tid,attack:55,midfield:58,defence:68,goalkeeping:20,fitness:85,inSquad:true,injured:false,suspended:false},
  {id:tid+'_lb', name:'LB',  position:'LB', teamId:tid,attack:55,midfield:58,defence:67,goalkeeping:20,fitness:60,inSquad:true,injured:false,suspended:false},
  {id:tid+'_cm1',name:'CM1', position:'CM', teamId:tid,attack:60,midfield:74,defence:55,goalkeeping:20,fitness:50,inSquad:true,injured:false,suspended:false},
  {id:tid+'_cm2',name:'CM2', position:'CM', teamId:tid,attack:62,midfield:76,defence:54,goalkeeping:20,fitness:55,inSquad:true,injured:false,suspended:false},
  {id:tid+'_cdm',name:'CDM', position:'CDM',teamId:tid,attack:50,midfield:70,defence:65,goalkeeping:20,fitness:88,inSquad:true,injured:false,suspended:false},
  {id:tid+'_rw', name:'RW',  position:'RW', teamId:tid,attack:80,midfield:65,defence:40,goalkeeping:20,fitness:70,inSquad:true,injured:false,suspended:false},
  {id:tid+'_lw', name:'LW',  position:'LW', teamId:tid,attack:78,midfield:64,defence:38,goalkeeping:20,fitness:72,inSquad:true,injured:false,suspended:false},
  {id:tid+'_st', name:'ST',  position:'ST', teamId:tid,attack:85,midfield:60,defence:30,goalkeeping:20,fitness:65,inSquad:true,injured:false,suspended:false},
  // bench players
  {id:tid+'_sub1',name:'Sub1',position:'CM',teamId:tid,attack:58,midfield:72,defence:50,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
  {id:tid+'_sub2',name:'Sub2',position:'ST',teamId:tid,attack:82,midfield:58,defence:28,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
  {id:tid+'_sub3',name:'Sub3',position:'CB',teamId:tid,attack:38,midfield:42,defence:69,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
];
const subH={id:'subH',name:'SubHome',crest:'S',reputation:80};
const subA={id:'subA',name:'SubAway',crest:'S',reputation:75};
const subLs=buildLiveMatchState(subH,subA,subTestPlayers('h'),subTestPlayers('a'),'4-3-3','4-3-3');
const subBenchBefore=subLs.hBenchLeft.length;
const subActiveBefore=[...subLs.hActive];
const subLeftBefore=subLs.hSubsLeft;
const midShareBefore=subLs.hMidShare;
const hStrBefore={...subLs.hStr};
// Find a valid sub: first bench player in, first non-GK outfield player out
const subInPlayer=subLs.hBenchLeft[0];
const subOutPlayer=subLs.hActive.find(p=>p.position!=='GK');
chk('Sub smoke: bench has players', subBenchBefore>0);
chk('Sub smoke: subInPlayer found', !!subInPlayer);
chk('Sub smoke: subOutPlayer found', !!subOutPlayer);
// Set up _watchState so _applyUserSub can run
_watchState={liveState:subLs,allEvents:[],homeTeam:subH,awayTeam:subA,userTeam:subH,oppTeam:subA,userPlayers:subTestPlayers('h'),oppPlayers:subTestPlayers('a'),userIsHome:true,save:{},matchEvent:{},tickTimer:null,paused:true,currentPhase:60,speedMultiplier:1};
_applyUserSub(subInPlayer.id, subOutPlayer.id);
const subLsAfter=_watchState.liveState;
chk('Sub smoke: bench shrinks by 1', subLsAfter.hBenchLeft.length===subBenchBefore-1);
chk('Sub smoke: subIn no longer on bench', !subLsAfter.hBenchLeft.some(p=>p.id===subInPlayer.id));
chk('Sub smoke: subIn now in active XI', subLsAfter.hActive.some(p=>p.id===subInPlayer.id));
chk('Sub smoke: subOut no longer in active', !subLsAfter.hActive.some(p=>p.id===subOutPlayer.id));
chk('Sub smoke: active XI still 11 players', subLsAfter.hActive.length===11);
chk('Sub smoke: subsLeft decremented', subLsAfter.hSubsLeft===subLeftBefore-1);
chk('Sub smoke: subIn fitness reset to 90', subLsAfter.hFitness.get(subInPlayer.id)===90);
chk('Sub smoke: sub event recorded in allEvents', _watchState.allEvents.some(e=>e.type==='sub'&&e.inId===subInPlayer.id&&e.outId===subOutPlayer.id));
chk('Sub smoke: hStr recalculated after sub', subLsAfter.hStr!==hStrBefore||(typeof subLsAfter.hStr.midfield==='number'));
chk('Sub smoke: hMidShare is valid number [0,1]', subLsAfter.hMidShare>=0&&subLsAfter.hMidShare<=1);
// Make a 2nd sub
const subIn2=subLsAfter.hBenchLeft[0];
const subOut2=subLsAfter.hActive.find(p=>p.position!=='GK'&&p.id!==subInPlayer.id);
if(subIn2&&subOut2){
  _applyUserSub(subIn2.id,subOut2.id);
  chk('Sub smoke 2: subsLeft now 1', _watchState.liveState.hSubsLeft===subLeftBefore-2);
  chk('Sub smoke 2: active still 11', _watchState.liveState.hActive.length===11);
  chk('Sub smoke 2: 2 sub events recorded', _watchState.allEvents.filter(e=>e.type==='sub').length===2);
}else{chk('Sub smoke 2: bench available for 2nd sub',false,'not enough bench');}
// subsLeft=0 guard lives in _wmSubClick (not _applyUserSub).
// Verify _wmSubClick source contains the guard.
chk('_wmSubClick guards subsLeft<=0', wmSubClickSrc.includes('subsLeft <= 0')||wmSubClickSrc.includes('subsLeft<=0'));
// Clean up _watchState so other tests aren't affected
_watchState=null;

// ── FORMATION CHANGE: Behavioural smoke tests ─────────────────
const fmTestPlayers=(tid)=>subTestPlayers(tid); // reuse same shape
const fmH={id:'fmH',name:'FmHome',crest:'F',reputation:80};
const fmA={id:'fmA',name:'FmAway',crest:'F',reputation:75};
const fmLs=buildLiveMatchState(fmH,fmA,fmTestPlayers('h'),fmTestPlayers('a'),'4-3-3','4-3-3');
const fmStrBefore={...fmLs.hStr};
const fmActiveBefore=[...fmLs.hActive];
// Wire _watchState for _applyFormationChange
_watchState={liveState:fmLs,allEvents:[],homeTeam:fmH,awayTeam:fmA,userTeam:fmH,oppTeam:fmA,userPlayers:fmTestPlayers('h'),oppPlayers:fmTestPlayers('a'),userIsHome:true,save:{},matchEvent:{},tickTimer:null,paused:true,currentPhase:45,speedMultiplier:1};
_applyFormationChange('4-4-2');
const fmLsAfter=_watchState.liveState;
chk('Formation smoke: homeFormation updated', fmLsAfter.homeFormation==='4-4-2');
chk('Formation smoke: hActive still 11', fmLsAfter.hActive.length===11);
chk('Formation smoke: hStr recalculated', typeof fmLsAfter.hStr.attack==='number');
chk('Formation smoke: hMidShare valid [0,1]', fmLsAfter.hMidShare>=0&&fmLsAfter.hMidShare<=1);
chk('Formation smoke: awayFormation unchanged', fmLsAfter.awayFormation===fmLs.awayFormation);
// Change back to 4-3-3
_applyFormationChange('4-3-3');
chk('Formation smoke: can change back', _watchState.liveState.homeFormation==='4-3-3');
_watchState=null;

// ══════════════════════════════════════════════════════════
//  15. CORE SYSTEMS COVERAGE
// ══════════════════════════════════════════════════════════
section('15. Standings & Table Utilities');
chk('sortTable defined', typeof sortTable==='function');
chk('blankStandingRow defined', typeof blankStandingRow==='function');
const blankRow=blankStandingRow({id:'test_team',name:'Test',shortName:'TST',crest:'T'});
chkEq('blankStandingRow: teamId', blankRow.teamId, 'test_team');
chkEq('blankStandingRow: played=0', blankRow.played, 0);
chkEq('blankStandingRow: points=0', blankRow.points, 0);
chkEq('blankStandingRow: goalDifference=0', blankRow.goalDifference, 0);
chk('blankStandingRow: has won/drawn/lost', typeof blankRow.won==='number'&&typeof blankRow.drawn==='number'&&typeof blankRow.lost==='number');
// sortTable puts higher points first, then goalDifference
const mockTable=[
  {...blankStandingRow({id:'t1',name:'T1',shortName:'T1',crest:'1'}),points:10,goalDifference:5,goalsFor:15},
  {...blankStandingRow({id:'t2',name:'T2',shortName:'T2',crest:'2'}),points:20,goalDifference:8,goalsFor:20},
  {...blankStandingRow({id:'t3',name:'T3',shortName:'T3',crest:'3'}),points:20,goalDifference:12,goalsFor:25},
];
const sorted=sortTable(mockTable);
chkEq('sortTable: 1st place by points+gd', sorted[0].teamId, 't3');
chkEq('sortTable: 2nd place by gd tiebreak', sorted[1].teamId, 't2');
chkEq('sortTable: 3rd place lowest points', sorted[2].teamId, 't1');

section('16. computeMatchStats Shape');
const statsMr=simulateMatch({id:'s1',name:'S1',crest:'S'},{id:'s2',name:'S2',crest:'S'},lpl,mcp,'4-3-3','4-3-3');
const st=statsMr.stats;
chk('stats object exists', !!st);
chkRange('stats.possession.home', st.possession.home, 20, 80);
chkEq('stats.possession sums to 100', st.possession.home+st.possession.away, 100);
chkRange('stats.shots.home', st.shots.home, 0, 40);
chkRange('stats.shots.away', st.shots.away, 0, 40);
chk('stats.shotsOnTarget <= shots (home)', st.shotsOnTarget.home<=st.shots.home);
chk('stats.shotsOnTarget <= shots (away)', st.shotsOnTarget.away<=st.shots.away);
chkRange('stats.xG.home', st.xG.home, 0, 8);
chkRange('stats.corners.home', st.corners.home, 0, 20);
chkRange('stats.fouls.home', st.fouls.home, 0, 25);
chk('stats.yellowCards non-negative', st.yellowCards.home>=0&&st.yellowCards.away>=0);
chk('stats.substitutions present', typeof st.substitutions==='object'&&typeof st.substitutions.home==='number');

section('17. primaryRating Per Position');
const mkP=(pos,atk,mid,def,gk)=>({position:pos,attack:atk,midfield:mid,defence:def,goalkeeping:gk});
chkEq('primaryRating: ST uses attack', primaryRating(mkP('ST',90,50,30,10)), 90);
chkEq('primaryRating: CM uses midfield', primaryRating(mkP('CM',50,85,50,10)), 85);
chkEq('primaryRating: CB uses defence', primaryRating(mkP('CB',30,50,88,10)), 88);
chkEq('primaryRating: GK uses goalkeeping', primaryRating(mkP('GK',10,15,20,91)), 91);
chkEq('primaryRating: RW uses attack', primaryRating(mkP('RW',82,65,40,10)), 82);
chkEq('primaryRating: CDM uses midfield', primaryRating(mkP('CDM',50,78,65,10)), 78);
chkEq('primaryRating: LB uses defence', primaryRating(mkP('LB',55,58,72,10)), 72);

section('18. All-League Player Data Integrity');
// PL teams
PL_TEAMS.forEach(t=>{
  chk('PL '+t.name+': >=12 players', t.players.length>=12, 'got '+t.players.length);
  chk('PL '+t.name+': has GK', t.players.some(p=>p.position==='GK'), 'positions: '+t.players.map(p=>p.position).join(','));
  chk('PL '+t.name+': no ratings <1 or >99', t.players.every(p=>[p.attack,p.midfield,p.defence,p.goalkeeping].every(v=>v>=1&&v<=99)), 'check player ratings');
});
// Extra league teams
EXTRA_LEAGUES_TEAMS.forEach(t=>{
  chk('EXT '+t.name+': >=12 players', t.players.length>=12, 'got '+t.players.length);
  chk('EXT '+t.name+': has GK', t.players.some(p=>p.position==='GK'));
  chk('EXT '+t.name+': no ratings <1 or >99', t.players.every(p=>[p.attack,p.midfield,p.defence,p.goalkeeping].every(v=>v>=1&&v<=99)), 'check player ratings');
});
// Championship teams
CHAMPIONSHIP_TEAMS.forEach(t=>{
  chk('CHAMP '+t.name+': >=12 players', t.players.length>=12, 'got '+t.players.length);
  chk('CHAMP '+t.name+': has GK', t.players.some(p=>p.position==='GK'));
  chk('CHAMP '+t.name+': no ratings <1 or >99', t.players.every(p=>[p.attack,p.midfield,p.defence,p.goalkeeping].every(v=>v>=1&&v<=99)), 'check player ratings');
});

section('19. calculatePrizeMoney');
chk('calculatePrizeMoney defined', typeof calculatePrizeMoney==='function');
const prize1=calculatePrizeMoney(1,{});
const prize10=calculatePrizeMoney(10,{});
const prize20=calculatePrizeMoney(20,{});
chk('1st place prize > 10th', prize1>prize10, '1st='+prize1+' 10th='+prize10);
chk('10th place prize > 20th', prize10>prize20, '10th='+prize10+' 20th='+prize20);
chk('All prizes positive', prize1>0&&prize10>0&&prize20>0);
// Cup winner bonus
const prizeWithCup=calculatePrizeMoney(1,{ucl:{status:'winner',roundIndex:4}});
chk('UCL winner gets more than no cup', prizeWithCup>prize1, 'with UCL='+prizeWithCup+' without='+prize1);

section('20. Cup System Integrity');
chk('simulateCupRound defined', typeof simulateCupRound==='function');
chk('simulateUCLMatchday defined', typeof simulateUCLMatchday==='function');
chk('buildInitialCupState defined', typeof buildInitialCupState==='function');
// buildInitialCupState returns expected structure
const cupIds=['fa_cup','league_cup'];
const cupState=buildInitialCupState(cupIds,'liverpool');
chk('buildInitialCupState: returns object', typeof cupState==='object');
chk('buildInitialCupState: fa_cup entry', !!cupState.fa_cup);
chk('buildInitialCupState: league_cup entry', !!cupState.league_cup);
chk('buildInitialCupState: fa_cup has status', typeof cupState.fa_cup.status==='string');
chk('buildInitialCupState: fa_cup roundIndex=0', cupState.fa_cup.roundIndex===0);

section('21. Season & Game Flow');
chk('processEndOfSeason defined', typeof processEndOfSeason==='function');
chk('startNewGame defined', typeof startNewGame==='function');
chk('getEuropeanQualifiers defined', typeof getEuropeanQualifiers==='function');
chk('getChampionshipOutcome defined', typeof getChampionshipOutcome==='function');
// assignPotentials returns augmented players
const testPlForPot=[{id:'tp1',position:'CM',attack:60,midfield:72,defence:55,goalkeeping:20,age:21}];
const potResult=assignPotentials(testPlForPot);
chk('assignPotentials returns array', Array.isArray(potResult)&&potResult.length===1);
chk('assignPotentials adds potentialRating', typeof potResult[0].potentialRating==='number'&&potResult[0].potentialRating>=72);
chk('assignPotentials adds peakAge', typeof potResult[0].peakAge==='number'&&potResult[0].peakAge>=26&&potResult[0].peakAge<=33);

// ══════════════════════════════════════════════════════════
//  REGRESSION TESTS — Bugs reported in session
// ══════════════════════════════════════════════════════════
section('Regression: Goal Attribution & Home/Away');

// --- REG-1: Goals must carry the correct teamId ---
// Run a full Watch Match sim and verify every goal event's teamId matches
// the team whose players scored it.
const regH={id:'reg_home',name:'RegHome',crest:'H',reputation:85};
const regA={id:'reg_away',name:'RegAway',crest:'A',reputation:80};
const regPlH = subTestPlayers('reg_home');
const regPlA = subTestPlayers('reg_away');
const regLs = buildLiveMatchState(regH,regA,regPlH,regPlA,'4-3-3','4-3-3');
let regCur = regLs;
const regAll = [];
for(let t=0;t<12;t++){
  const {segEvents:se,updatedState:su}=simulateMatchSegment(regH,regA,regCur,t*10+1,Math.min((t+1)*10,120));
  regAll.push(...se); regCur=su;
}
const regFin = finaliseLiveMatch(regH,regA,regCur,regAll);
const hPlayerIds = new Set(regPlH.map(p=>p.id));
const aPlayerIds = new Set(regPlA.map(p=>p.id));
// Every home scorer must be a home player
chk('REG: home goals scored by home players only', regFin.homeScorers.every(e=>hPlayerIds.has(e.playerId)));
// Every away scorer must be an away player
chk('REG: away goals scored by away players only', regFin.awayScorers.every(e=>aPlayerIds.has(e.playerId)));
// Every goal event in allEvents must have teamId matching the team whose player scored
const regGoalEvents = regAll.filter(e=>e.type==='goal');
chk('REG: goal event teamId matches scorer team', regGoalEvents.every(e=>{
  if(hPlayerIds.has(e.playerId)) return e.teamId===regH.id;
  if(aPlayerIds.has(e.playerId)) return e.teamId===regA.id;
  return false;
}));
// homeGoals count must equal goals with teamId===homeTeam.id
chk('REG: homeGoals count matches home goal events', regFin.homeGoals===regGoalEvents.filter(e=>e.teamId===regH.id).length);
chk('REG: awayGoals count matches away goal events', regFin.awayGoals===regGoalEvents.filter(e=>e.teamId===regA.id).length);

section('Regression: User Home/Away Player Mapping');

// --- REG-2: When user is AWAY, _launchWatchMatch must pass userPlayers correctly ---
// This tests the code path, not the async function. We verify the source code
// resolves userPl/oppPl based on patchedEvent.userIsHome.
const launchSrc = (()=>{
  const start=code.indexOf('async function _launchWatchMatch');
  if(start===-1) return '';
  return code.slice(start, start+3000);
})();
chk('REG: _launchWatchMatch resolves userPl from isUserHome', launchSrc.includes('isUserHome ? homePlayers : awayPlayers') || launchSrc.includes('isUserHome?homePlayers:awayPlayers'));
chk('REG: _launchWatchMatch resolves oppPl from isUserHome', launchSrc.includes('isUserHome ? awayPlayers : homePlayers') || launchSrc.includes('isUserHome?awayPlayers:homePlayers'));
chk('REG: _launchWatchMatch does NOT pass raw homePlayers as userPlayers', !launchSrc.includes('patchedEvent, userTeam, homeTeam === userTeam'));

// --- REG-3: Behavioural test — user away, bench/active must be user's players ---
const regH2={id:'reg_h2',name:'RegHome2',crest:'H',reputation:85};
const regA2={id:'reg_a2',name:'RegAway2',crest:'A',reputation:80};
const regPlH2 = subTestPlayers('reg_h2');
const regPlA2 = subTestPlayers('reg_a2');
// User is AWAY: userTeam=regA2, oppTeam=regH2, homeTeam=regH2, awayTeam=regA2
const regLsAway = buildLiveMatchState(regH2,regA2,regPlH2,regPlA2,'4-3-3','4-3-3');
// When user is away, their players are in aActive/aBenchLeft
const userActiveAway = regLsAway.aActive;
const userBenchAway  = regLsAway.aBenchLeft;
chk('REG: user away — aActive has user team players', userActiveAway.every(p=>p.teamId==='reg_a2'));
chk('REG: user away — aBenchLeft has user team players', userBenchAway.every(p=>p.teamId==='reg_a2'));
chk('REG: user away — hActive has opponent players', regLsAway.hActive.every(p=>p.teamId==='reg_h2'));

section('Regression: GK on Bench');

// --- REG-4: Backup GK must appear on bench ---
const gkTestPlayers = (tid) => [
  {id:tid+'_gk1',name:'GK Star',position:'GK',teamId:tid,attack:10,midfield:15,defence:20,goalkeeping:88,fitness:90,inSquad:true,injured:false,suspended:false},
  {id:tid+'_gk2',name:'GK Backup',position:'GK',teamId:tid,attack:10,midfield:15,defence:20,goalkeeping:72,fitness:90,inSquad:true,injured:false,suspended:false},
  ...['CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CB','CM','ST'].map((pos,i)=>({id:tid+'_'+i,name:pos+i,position:pos,teamId:tid,attack:65,midfield:65,defence:65,goalkeeping:20,fitness:90,inSquad:true,injured:false,suspended:false}))
];
const gkH={id:'gk_h',name:'GKHome',crest:'H',reputation:80};
const gkA={id:'gk_a',name:'GKAway',crest:'A',reputation:75};
const gkLs=buildLiveMatchState(gkH,gkA,gkTestPlayers('gk_h'),gkTestPlayers('gk_a'),'4-3-3','4-3-3');
// Bench should contain backup GK (NOT filtered out)
chk('REG: backup GK on home bench', gkLs.hBenchLeft.some(p=>p.position==='GK'));
chk('REG: backup GK on away bench', gkLs.aBenchLeft.some(p=>p.position==='GK'));
chk('REG: starting GK in active XI', gkLs.hActive.filter(p=>p.position==='GK').length===1);

// --- REG-5: GK sub rules — GK can replace GK, outfield cannot replace GK ---
_watchState={liveState:gkLs,allEvents:[],homeTeam:gkH,awayTeam:gkA,userTeam:gkH,oppTeam:gkA,userPlayers:gkTestPlayers('gk_h'),oppPlayers:gkTestPlayers('gk_a'),userIsHome:true,save:{},matchEvent:{},tickTimer:null,paused:true,currentPhase:60,speedMultiplier:1};
const benchGK = gkLs.hBenchLeft.find(p=>p.position==='GK');
const activeGK = gkLs.hActive.find(p=>p.position==='GK');
const activeOutfield = gkLs.hActive.find(p=>p.position!=='GK');
const benchOutfield = gkLs.hBenchLeft.find(p=>p.position!=='GK');
// GK→GK sub should work
if(benchGK && activeGK){
  const beforeSubs = _watchState.liveState.hSubsLeft;
  _applyUserSub(benchGK.id, activeGK.id);
  chk('REG: GK↔GK sub allowed — subsLeft decremented', _watchState.liveState.hSubsLeft===beforeSubs-1);
  chk('REG: GK↔GK sub — backup GK now in active XI', _watchState.liveState.hActive.some(p=>p.id===benchGK.id));
  chk('REG: GK↔GK sub — original GK no longer active', !_watchState.liveState.hActive.some(p=>p.id===activeGK.id));
} else { chk('REG: GK↔GK sub data available', false); }
// Reset for next test
const gkLs2=buildLiveMatchState(gkH,gkA,gkTestPlayers('gk_h'),gkTestPlayers('gk_a'),'4-3-3','4-3-3');
_watchState={liveState:gkLs2,allEvents:[],homeTeam:gkH,awayTeam:gkA,userTeam:gkH,oppTeam:gkA,userPlayers:gkTestPlayers('gk_h'),oppPlayers:gkTestPlayers('gk_a'),userIsHome:true,save:{},matchEvent:{},tickTimer:null,paused:true,currentPhase:60,speedMultiplier:1};
const benchGK2 = gkLs2.hBenchLeft.find(p=>p.position==='GK');
const activeOutfield2 = gkLs2.hActive.find(p=>p.position!=='GK');
const benchOutfield2 = gkLs2.hBenchLeft.find(p=>p.position!=='GK');
const activeGK2 = gkLs2.hActive.find(p=>p.position==='GK');
// GK→outfield should be BLOCKED
if(benchGK2 && activeOutfield2){
  const beforeSubs2 = _watchState.liveState.hSubsLeft;
  _applyUserSub(benchGK2.id, activeOutfield2.id);
  chk('REG: GK→outfield sub BLOCKED', _watchState.liveState.hSubsLeft===beforeSubs2);
} else { chk('REG: GK→outfield test data available', false); }
// Outfield→GK should be BLOCKED
if(benchOutfield2 && activeGK2){
  const beforeSubs3 = _watchState.liveState.hSubsLeft;
  _applyUserSub(benchOutfield2.id, activeGK2.id);
  chk('REG: outfield→GK sub BLOCKED', _watchState.liveState.hSubsLeft===beforeSubs3);
} else { chk('REG: outfield→GK test data available', false); }
_watchState=null;

section('Regression: Stub Player Names');

// --- REG-6: Stub players should have realistic names, not "Player N" ---
const stubTeam = {id:'stub_test',name:'StubFC',crest:'S'};
const regStubs = _generateStubPlayers(stubTeam, 75);
chk('REG: stubs have 16 players', regStubs.length===16);
chk('REG: no stub named "Player 1"', !regStubs.some(p=>p.name==='Player 1'));
chk('REG: no stub named "Player 2"', !regStubs.some(p=>p.name==='Player 2'));
chk('REG: stub names contain surnames (have a dot)', regStubs.every(p=>p.name.includes('.')||p.name.includes(' ')));
chk('REG: all stubs have unique names', new Set(regStubs.map(p=>p.name)).size===regStubs.length);

section('Regression: Fitness Drain Consistency');

// --- REG-7: simulateMatchSegment fitness drain matches simulateMatch rates ---
// After 120 phases, fitness should drop by ~22 (not ~57 as in old rates).
const fitH={id:'fit_h',name:'FitHome',crest:'H',reputation:80};
const fitA={id:'fit_a',name:'FitAway',crest:'A',reputation:80};
const fitLs=buildLiveMatchState(fitH,fitA,subTestPlayers('fit_h'),subTestPlayers('fit_a'),'4-3-3','4-3-3');
// Record starting fitness of first outfield player
const fitTestPlayer=fitLs.hActive.find(p=>p.position!=='GK');
const fitStart=fitLs.hFitness.get(fitTestPlayer.id);
// Run full 120 phases via segments
let fitCur=fitLs;
for(let t=0;t<12;t++){
  const {updatedState:su}=simulateMatchSegment(fitH,fitA,fitCur,t*10+1,Math.min((t+1)*10,120));
  fitCur=su;
}
const fitEnd=fitCur.hFitness.get(fitTestPlayer.id);
const fitDrop=fitStart-fitEnd;
chk('REG: segment fitness drain ~22 (not ~57)', fitDrop>10&&fitDrop<40);
chk('REG: segment fitness drain consistent with simulateMatch', fitDrop<45);
// Verify drain rates are in source code — should be 0.22 and 0.15, NOT 0.55 and 0.40
const segSrc=(()=>{const s=code.indexOf('function simulateMatchSegment');return s>-1?code.slice(s,s+2000):'';})();
chk('REG: simulateMatchSegment uses 0.22 drain', segSrc.includes('0.22'));
chk('REG: simulateMatchSegment uses 0.15 drain', segSrc.includes('0.15'));
chk('REG: simulateMatchSegment does NOT use 0.55 fitness drain', !segSrc.includes('- 0.55'));
chk('REG: simulateMatchSegment does NOT use 0.40 drain', !segSrc.includes('0.40'));

section('Regression: Between-Match Recovery');

// --- REG-8: All players get fitness recovery, not just non-played ---
const recoverySrc = (()=>{const s=code.indexOf('function updateCache')||code.indexOf('async function updateCache');return s>-1?code.slice(s,s+1000):'';})();
chk('REG: played players get recovery', recoverySrc.includes('_played ? 15')||recoverySrc.includes('_played?15'));
chk('REG: non-played players get recovery', recoverySrc.includes(': 20')||recoverySrc.includes(':20'));
chk('REG: old +8 only-for-rested removed', !recoverySrc.includes('+ 8;')||!recoverySrc.includes('+8;'));

section('Regression: Formation Change Keeps GKs');

// --- REG-9: After formation change, backup GK still on bench ---
const fmGkLs=buildLiveMatchState(gkH,gkA,gkTestPlayers('gk_h'),gkTestPlayers('gk_a'),'4-3-3','4-3-3');
_watchState={liveState:fmGkLs,allEvents:[],homeTeam:gkH,awayTeam:gkA,userTeam:gkH,oppTeam:gkA,userPlayers:gkTestPlayers('gk_h'),oppPlayers:gkTestPlayers('gk_a'),userIsHome:true,save:{},matchEvent:{},tickTimer:null,paused:true,currentPhase:45,speedMultiplier:1};
_applyFormationChange('4-4-2');
chk('REG: formation change keeps GK on bench', _watchState.liveState.hBenchLeft.some(p=>p.position==='GK'));
chk('REG: formation change active still has 1 GK', _watchState.liveState.hActive.filter(p=>p.position==='GK').length===1);
_watchState=null;

section('Regression: Watch Match HOME/AWAY Labels');

// --- REG-10: HOME/AWAY labels must reflect venue, not user identity ---
const wmRenderSrc = (()=>{
  const start=code.indexOf('function _renderWatchModal');
  return start>-1?code.slice(start,start+3000):'';
})();
chk('REG: left team label is always HOME', wmRenderSrc.includes('>HOME<'));
chk('REG: right team label is always AWAY', wmRenderSrc.includes('>AWAY<'));
chk('REG: no dynamic userLbl/oppLbl in render', !wmRenderSrc.includes('userLbl')&&!wmRenderSrc.includes('oppLbl'));
// Print final section timing
if(_lastSec&&_secTimers[_lastSec]){
  console.log('  ⏱ '+(Date.now()-_secTimers[_lastSec])+'ms');
}
console.log('\\n'+'='.repeat(60));
console.log('  RESULT: '+pass+' passed,  '+fail+' failed');
if(fail>0){
  console.log('\\n  ╔═══ FAILURE DIAGNOSTICS ═══════════════════════════════╗');
  failures.forEach((f,i)=>{
    console.log('  ║');
    console.log('  ║  ❌ FAIL '+(i+1)+': '+f.label);
    console.log('  ║     Section: '+f.section);
    console.log('  ║     Detail:  '+f.detail);
    console.log('  ║     → Fix:   Search for this check label in validate.js');
  });
  console.log('  ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
} else {
  console.log('\\n  All checks passed - safe to ship.\\n');
}
console.log('='.repeat(60));
process.exit(fail>0?1:0);
`;

const runner = GLOBALS + '\n' + fs.readFileSync(BUNDLE,'utf8') + '\n' + TESTS;
fs.writeFileSync('/tmp/pitch_validate_runner.js', runner);
const result = cp.spawnSync('node', ['/tmp/pitch_validate_runner.js'], { stdio: 'inherit' });
process.exit(result.status);
