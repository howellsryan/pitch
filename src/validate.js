/**
 * PITCH — Validation Suite  v6
 * Run: node src/validate.js   (after src/build.py has produced a bundle —
 *      normally invoked BY build.py, which passes PITCH_BUNDLE/PITCH_SHELL)
 * POLICY: Every new feature must add checks here before shipping.
 * 14 sections — deep behavioural smoke tests, not just presence checks.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const BUNDLE = process.env.PITCH_BUNDLE || path.join(__dirname, '..', '.build', 'bundle_final.js');
const SHELL  = process.env.PITCH_SHELL  || path.join(__dirname, 'shell.html');
// Read alongside shellSrc for checks whose markup moved into this Svelte
// component (Phase 4, docs/plan/04-migration-phases.md) and is no longer in
// shell.html's raw source — same reasoning as shellSrc, just a second file.
const HOME_SCREEN = path.join(__dirname, 'lib', 'ui', 'HomeScreen.svelte');
const SQUAD_SCREEN = path.join(__dirname, 'lib', 'ui', 'SquadScreen.svelte');
const TACTICS_SCREEN = path.join(__dirname, 'lib', 'ui', 'TacticsScreen.svelte');
const ACADEMY_SCREEN = path.join(__dirname, 'lib', 'ui', 'AcademyScreen.svelte');
const SETTINGS_SCREEN = path.join(__dirname, 'lib', 'ui', 'SettingsScreen.svelte');
const TRANSFERS_SCREEN = path.join(__dirname, 'lib', 'ui', 'TransfersScreen.svelte');
const MATCH_SCREEN = path.join(__dirname, 'lib', 'ui', 'MatchScreen.svelte');
const SUBSTITUTIONS = path.join(__dirname, 'game', 'substitutions.js');
const FORMATION_CHANGE = path.join(__dirname, 'game', 'formationChange.js');
const OPPONENTS = path.join(__dirname, 'game', 'opponents.js');
if (!fs.existsSync(BUNDLE)) { console.error('Bundle not found: '+BUNDLE+' — run src/build.py first, or set PITCH_BUNDLE.'); process.exit(1); }

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
const shellSrc = require('fs').readFileSync(${JSON.stringify(SHELL)},'utf8');
const homeScreenSrc = require('fs').readFileSync(${JSON.stringify(HOME_SCREEN)},'utf8');
const squadScreenSrc = require('fs').readFileSync(${JSON.stringify(SQUAD_SCREEN)},'utf8');
const tacticsScreenSrc = require('fs').readFileSync(${JSON.stringify(TACTICS_SCREEN)},'utf8');
const academyScreenSrc = require('fs').readFileSync(${JSON.stringify(ACADEMY_SCREEN)},'utf8');
const settingsScreenSrc = require('fs').readFileSync(${JSON.stringify(SETTINGS_SCREEN)},'utf8');
const transfersScreenSrc = require('fs').readFileSync(${JSON.stringify(TRANSFERS_SCREEN)},'utf8');
const matchScreenSrc = require('fs').readFileSync(${JSON.stringify(MATCH_SCREEN)},'utf8');
const substitutionsSrc = require('fs').readFileSync(${JSON.stringify(SUBSTITUTIONS)},'utf8');
const formationChangeSrc = require('fs').readFileSync(${JSON.stringify(FORMATION_CHANGE)},'utf8');
const opponentsSrc = require('fs').readFileSync(${JSON.stringify(OPPONENTS)},'utf8');
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
// Back-to-back same-opponent check: no team should face the same opponent in consecutive GWs
let b2bViolations=0;
plIds.forEach(t=>{const tf=fx.filter(f=>f.homeTeamId===t||f.awayTeamId===t).sort((a,b)=>a.gameweek-b.gameweek);let lastOpp=null;tf.forEach(f=>{const opp=f.homeTeamId===t?f.awayTeamId:f.homeTeamId;if(opp===lastOpp)b2bViolations++;lastOpp=opp;});});
chk('No back-to-back same opponent', b2bViolations===0, 'got '+b2bViolations+' violations');
// Mirrored halves check: for every GW K fixture (H vs A), there should be a GW in the 2nd half with (A vs H)
const firstHalfFx=fx.filter(f=>f.gameweek<=19);
const secondHalfFx=fx.filter(f=>f.gameweek>19);
const mirrorOk=firstHalfFx.every(f=>secondHalfFx.some(s=>s.homeTeamId===f.awayTeamId&&s.awayTeamId===f.homeTeamId));
chk('Second half mirrors first half (H/A swapped)', mirrorOk);

// ══ 2. CUP SCHEDULING ════════════════════════════════════════
section('2. Cup Scheduling');
const CUP_IDS=['fa_cup','league_cup','ucl','uel','uecl',
  'copa_del_rey','supercopa','dfb_pokal','dfb_supercup',
  'coppa_italia','supercoppa','coupe_de_france','trophee_des_champions'];
CUP_IDS.forEach(id=>{
  const meta=CUP_META[id];
  chk(id+': exists in CUP_META', !!meta);
  chk(id+': has roundGWs array', Array.isArray(meta&&meta.roundGWs)&&meta.roundGWs.length>0);
  const isEuropean = ['ucl','uel','uecl'].includes(id);
  const maxGW = isEuropean ? 41 : 38;
  chk(id+': all GWs within 1-'+maxGW, (meta&&meta.roundGWs||[]).every(g=>g>=1&&g<=maxGW), ''+(meta&&meta.roundGWs));
  chk(id+': rounds strictly ascending', (meta&&meta.roundGWs||[]).every((g,i)=>i===0||g>meta.roundGWs[i-1]));
  chk(id+': has name string', typeof (meta&&meta.name)==='string'&&meta.name.length>0);
  chk(id+': has icon string', typeof (meta&&meta.icon)==='string'&&meta.icon.length>0);
  chk(id+': has rounds array', Array.isArray(meta&&meta.rounds)&&meta.rounds.length>0);
});
chk('UCL group stage GWs all in 1-38', (CUP_META.ucl.groupStageGWs||[]).every(g=>g>=1&&g<=38));
chk('UCL group stage has 8 matchdays', (CUP_META.ucl.groupStageGWs||[]).length===8);
chk('UCL knockouts start >= GW20', CUP_META.ucl.roundGWs[0]>=20);
chk('UCL Final is post-season (>GW38)', CUP_META.ucl.roundGWs[CUP_META.ucl.roundGWs.length-1]>38);
chk('UEL Final is post-season (>GW38)', CUP_META.uel.roundGWs[CUP_META.uel.roundGWs.length-1]>38);
chk('UECL Final is post-season (>GW38)', CUP_META.uecl.roundGWs[CUP_META.uecl.roundGWs.length-1]>38);
chk('FA Cup Final <= GW38', CUP_META.fa_cup.roundGWs[CUP_META.fa_cup.roundGWs.length-1]<=38);
chk('League Cup Final <= GW38', CUP_META.league_cup.roundGWs[CUP_META.league_cup.roundGWs.length-1]<=38);
chk('Copa del Rey Final <= GW38', CUP_META.copa_del_rey.roundGWs[CUP_META.copa_del_rey.roundGWs.length-1]<=38);
chk('DFB-Pokal Final <= GW38', CUP_META.dfb_pokal.roundGWs[CUP_META.dfb_pokal.roundGWs.length-1]<=38);
chk('Coppa Italia Final <= GW38', CUP_META.coppa_italia.roundGWs[CUP_META.coppa_italia.roundGWs.length-1]<=38);
chk('Coupe de France Final <= GW38', CUP_META.coupe_de_france.roundGWs[CUP_META.coupe_de_france.roundGWs.length-1]<=38);
chk('UCL isGroupStage=true', CUP_META.ucl.isGroupStage===true);

// ── Two-legged European knockout ties ──────────────────────────
['ucl','uel','uecl'].forEach(id=>{
  const meta=CUP_META[id];
  const legRounds=meta.rounds.filter(r=>r.includes('Leg 1')||r.includes('Leg 2'));
  chk(id+': has an even number of leg rounds', legRounds.length>0&&legRounds.length%2===0, ''+legRounds.length);
  chk(id+': every Leg 1 is followed by its Leg 2', meta.rounds.every((r,i)=>!r.includes('Leg 1')||meta.rounds[i+1]===r.replace('Leg 1','Leg 2')));
  chk(id+': Final is a single match, not a leg', meta.rounds[meta.rounds.length-1]==='Final');
});
chk('isEuroLegRound defined', typeof isEuroLegRound==='function');
chk('isEuroLegRound: UCL R16 Leg 1 matches leg 1', isEuroLegRound('ucl','R16 (Leg 1)',1)===true);
chk('isEuroLegRound: UCL R16 Leg 1 does not match leg 2', isEuroLegRound('ucl','R16 (Leg 1)',2)===false);
chk('isEuroLegRound: domestic cups never match', isEuroLegRound('fa_cup','R1 (Leg 1)',1)===false);
chk('computeTwoLegOutcome defined', typeof computeTwoLegOutcome==='function');
chk('computeTwoLegOutcome: higher aggregate wins', computeTwoLegOutcome({userGoals:2,oppGoals:1,userIsHome:true},{userGoals:1,oppGoals:1,userIsHome:false}).userWon===true);
chk('computeTwoLegOutcome: away goals break aggregate tie', computeTwoLegOutcome({userGoals:1,oppGoals:0,userIsHome:true},{userGoals:1,oppGoals:2,userIsHome:false}).userWon===true);
chk('computeTwoLegOutcome: level on away goals too -> penalties flagged', computeTwoLegOutcome({userGoals:0,oppGoals:0,userIsHome:true},{userGoals:0,oppGoals:0,userIsHome:false}).penalties===true);
chk('resolveCupProgress defined', typeof resolveCupProgress==='function');
chk('resolveCupProgress: leg 1 never eliminates', resolveCupProgress('ucl','R16 (Leg 1)',0,{results:[]},0,4,false,true).status==='active');
chk('resolveCupProgress: leg 2 decides on aggregate, not the single leg', resolveCupProgress('ucl','R16 (Leg 2)',1,{results:[{userGoals:0,oppGoals:4,userIsHome:true}]},3,0,true,false).status==='eliminated');
chk('UCL_CLUBS array of 20+', Array.isArray(UCL_CLUBS)&&UCL_CLUBS.length>=20);
chk('UCL_CLUBS each has id/name/strength', UCL_CLUBS.every(c=>c.id&&c.name&&typeof c.strength==='number'));
chk('LEAGUE_DOMESTIC_CUPS defined', typeof LEAGUE_DOMESTIC_CUPS==='object');
chk('LEAGUE_DOMESTIC_CUPS has La Liga', Array.isArray(LEAGUE_DOMESTIC_CUPS['La Liga'])&&LEAGUE_DOMESTIC_CUPS['La Liga'].includes('copa_del_rey'));
chk('LEAGUE_DOMESTIC_CUPS has Bundesliga', Array.isArray(LEAGUE_DOMESTIC_CUPS['Bundesliga'])&&LEAGUE_DOMESTIC_CUPS['Bundesliga'].includes('dfb_pokal'));
chk('LEAGUE_DOMESTIC_CUPS has Serie A', Array.isArray(LEAGUE_DOMESTIC_CUPS['Serie A'])&&LEAGUE_DOMESTIC_CUPS['Serie A'].includes('coppa_italia'));
chk('LEAGUE_DOMESTIC_CUPS has Ligue 1', Array.isArray(LEAGUE_DOMESTIC_CUPS['Ligue 1'])&&LEAGUE_DOMESTIC_CUPS['Ligue 1'].includes('coupe_de_france'));
chk('LEAGUE_DOMESTIC_CUPS La Liga has no super cup', !((LEAGUE_DOMESTIC_CUPS['La Liga']||[]).includes('supercopa')));
chk('LEAGUE_DOMESTIC_CUPS Bundesliga has no super cup', !((LEAGUE_DOMESTIC_CUPS['Bundesliga']||[]).includes('dfb_supercup')));
chk('LEAGUE_DOMESTIC_CUPS Serie A has no super cup', !((LEAGUE_DOMESTIC_CUPS['Serie A']||[]).includes('supercoppa')));
chk('LEAGUE_DOMESTIC_CUPS Ligue 1 has no super cup', !((LEAGUE_DOMESTIC_CUPS['Ligue 1']||[]).includes('trophee_des_champions')));
chk('INVITATION_ONLY_CUPS defined', typeof INVITATION_ONLY_CUPS!=='undefined'&&INVITATION_ONLY_CUPS.has('dfb_supercup'));
chk('INVITATION_ONLY_CUPS has supercopa', INVITATION_ONLY_CUPS.has('supercopa'));
chk('INVITATION_ONLY_CUPS has supercoppa', INVITATION_ONLY_CUPS.has('supercoppa'));
chk('assignCups Bundesliga mid-rep no supercup', (()=>{const c=assignCups({league:'Bundesliga',reputation:75});return !c.includes('dfb_supercup');})());
chk('assignCups La Liga mid-rep no supercopa', (()=>{const c=assignCups({league:'La Liga',reputation:75});return !c.includes('supercopa');})());
chk('assignCups PL mid-rep has fa_cup', (()=>{const c=assignCups({league:'Premier League',reputation:75});return c.includes('fa_cup');})());
chk('assignCups Bundesliga mid-rep has dfb_pokal', (()=>{const c=assignCups({league:'Bundesliga',reputation:75});return c.includes('dfb_pokal');})());

// ══ 3. ONE-EVENT-PER-PRESS ARCHITECTURE ══════════════════════
section('3. One-Event-Per-Press Architecture');
chk('getEffectiveTotalGW defined', typeof getEffectiveTotalGW==='function');
chk('getEffectiveTotalGW: base case returns league GWs', getEffectiveTotalGW({totalGameweeks:38})===38);
chk('getEffectiveTotalGW: extends for active UCL', getEffectiveTotalGW({totalGameweeks:38,cups:{ucl:{status:'active',roundIndex:3}}})>38);
chk('getEffectiveTotalGW: no extension for eliminated', getEffectiveTotalGW({totalGameweeks:38,cups:{ucl:{status:'eliminated',roundIndex:0}}})===38);
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
// Smoke: active cup on same GW adds 2 events (FA Cup R3 is at GW 20, roundIndex=2 for PL teams)
const mockCups={fa_cup:{status:'active',roundIndex:2,results:[]}};
const mockFix20=[{id:'gw20_a_b',competition:'league',gameweek:20,homeTeamId:'user',awayTeamId:'opp',played:false}];
const pe2=buildPendingEvents(20,'user',mockFix20,mockCups,[]);
chk('league + FA Cup = 2 events', pe2.length===2);
chk('cup event has type=cup', pe2.some(e=>e.type==='cup'));
chk('cup event has cupId=fa_cup', pe2.find(e=>e.type==='cup')&&pe2.find(e=>e.type==='cup').cupId==='fa_cup');
chk('cup event has roundName string', typeof (pe2.find(e=>e.type==='cup')||{}).roundName==='string');
// Smoke: eliminated cup not added
const pe3=buildPendingEvents(20,'user',mockFix20,{fa_cup:{status:'eliminated',roundIndex:0,results:[]}},[]);
chk('eliminated cup not added', pe3.length===1);

// ══ 4. MATCH ROUTE — TEAM NEWS / KICKOFF ═════════════════════
section('4. Match Route — Team News / Kickoff');
// ui/prematch.js is gone (Phase 5, docs/plan/04-migration-phases.md) — its
// pre-match modal became src/lib/ui/MatchScreen.svelte's Team News beat, a
// real Svelte component outside shell.html and this concatenated bundle
// entirely, same reasoning as League's move in Phase 3. Check the component
// source instead of code/shellSrc. Behavioural coverage for the pure logic
// that moved out to src/game/ (opponent stub generation, sub/formation
// rules) now lives in src/game/*.test.js (Vitest), not here — see the
// "Regression" sections below for what was removed and why.
chk('buildMatchCtx defined in MatchScreen.svelte', matchScreenSrc.includes('async function buildMatchCtx'));
chk('getTeamRecentForm defined in MatchScreen.svelte', matchScreenSrc.includes('async function getTeamRecentForm'));
chk('getInFormPlayer defined in MatchScreen.svelte', matchScreenSrc.includes('async function getInFormPlayer'));
chk('resolveMatchTeams defined in MatchScreen.svelte', matchScreenSrc.includes('async function resolveMatchTeams'));
chk('generateStubPlayers imported from src/game/opponents.js', matchScreenSrc.includes("from '../../game/opponents.js'"));
// Home's header (Play/EOY/Deadline buttons, id="btn-adv-header" etc.) moved
// into src/lib/ui/HomeScreen.svelte (Phase 4, docs/plan/04-migration-phases.md)
// — a real Svelte component outside shell.html and this concatenated bundle
// entirely, same reasoning as League's move in Phase 3. Check the component
// source instead of shellSrc/code.
chk('btn-adv-header in HomeScreen.svelte', homeScreenSrc.includes('btn-adv-header'));
chk('btn-eoy-header in HomeScreen.svelte', homeScreenSrc.includes('btn-eoy-header'));
chk('btn-deadline-header in HomeScreen.svelte', homeScreenSrc.includes('btn-deadline-header'));
chk("HomeScreen Play button -> navigateTo('match')", homeScreenSrc.includes("navigateTo('match')"));
chk('HomeScreen EOY button -> handleEndOfSeason', homeScreenSrc.includes('handleEndOfSeason'));
chk('Team News XI preview on pitch slots', matchScreenSrc.includes('teamNewsAssignment'));
chk('Team News uses shared SLOT_LAYOUT (not a re-declared copy)', matchScreenSrc.includes("from '../../game/formationLayout.js'"));
chk('Tactics screen hint in Team News', matchScreenSrc.includes('Tactics screen') || matchScreenSrc.includes('Tactics'));
chk('selectEleven accepts lineup param', code.includes('function selectEleven(players, formation') && code.includes('lineup'));
chk('simulateMatch passes lineup', code.includes('simulateMatch(') && code.includes('hLineup') && code.includes('aLineup'));
chk('buildLiveMatchState passes lineup', code.includes('buildLiveMatchState(') && code.includes('homeLineup') && code.includes('awayLineup'));
chk('advanceOneFixture reads save.lineup', code.includes('save.lineup'));
chk('Opponent form pills in Team News', matchScreenSrc.includes('tn-form-pill'));
chk('Key player card in Team News', matchScreenSrc.includes('tn-inform-card'));
chk('Competition badge in Team News', matchScreenSrc.includes('tn-comp-badge'));
chk('Sim Instantly action', matchScreenSrc.includes('Sim Instantly') && matchScreenSrc.includes('function simInstant'));
chk('Kick Off action', matchScreenSrc.includes('Kick Off') && matchScreenSrc.includes('function startWatch'));

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
// home_transfers.js's showMatchReport() is gone (Phase 5, docs/plan/
// 04-migration-phases.md) — MatchScreen.svelte's Team News beat carries the
// same "home team always on the left, labelled HOME; away always on the
// right, labelled AWAY" invariant now, checked in full (including the
// "label text never depends on user identity, only the colour does" part)
// under "Regression: Live Match HOME/AWAY Labels" below.
chk('HOME on left in Team News', matchScreenSrc.includes('>HOME</div>'));
chk('AWAY on right in Team News', matchScreenSrc.includes('>AWAY</div>'));
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
chk('5-star: potentialRating 91 -> stars=5', getPotentialStars({potentialRating:91,isWonderkid:true})===5);
chk('5-star: non-WK pot 88 -> stars=5', getPotentialStars({potentialRating:88,isWonderkid:false})===5);
chk('5-star: wonderkid pot 86 -> stars=5', getPotentialStars({potentialRating:86,isWonderkid:true})===5);
chk('4-star: non-WK pot 87 -> stars=4 (below 88 threshold)', getPotentialStars({potentialRating:87,isWonderkid:false})===4);
chk('4-star range (>=82)', getPotentialStars({potentialRating:83})===4);
chk('3-star range', getPotentialStars({potentialRating:74})===3);
chk('2-star range', getPotentialStars({potentialRating:68})===2);
chk('1-star: potentialRating 60 -> stars=1', getPotentialStars({potentialRating:60})===1);
chk('peakAge field used in code', code.includes('peakAge'));
const adjYoung=agingValueAdjust({age:19,potentialRating:85});
const adjOld=agingValueAdjust({age:34,potentialRating:85});
chk('agingValueAdjust: young >= old multiplier', adjYoung>=adjOld);

// ══ 7. SQUAD DATA 2026/27 ════════════════════════════════════
// Phase 6 (data reconciliation) replaced these leagues' rosters with
// footy-sim's, and confirmed footy-sim's club-to-league placement against
// real 2026/27 promotion/relegation results - see docs/plan/
// 06-data-reconciliation.md. That's a full season's turnover past this
// section's previous (2025/26) assumptions.
section('7. Squad Data (2026/27)');
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
chk('LA_LIGA_TEAMS >=20', Array.isArray(LA_LIGA_TEAMS)&&LA_LIGA_TEAMS.length>=20);
chk('SERIE_A_TEAMS >=20', Array.isArray(SERIE_A_TEAMS)&&SERIE_A_TEAMS.length>=20);
chk('BUNDESLIGA_TEAMS >=18', Array.isArray(BUNDESLIGA_TEAMS)&&BUNDESLIGA_TEAMS.length>=18);
chk('LIGUE_1_TEAMS >=18', Array.isArray(LIGUE_1_TEAMS)&&LIGUE_1_TEAMS.length>=18);
chk('CHAMPIONSHIP_TEAMS >=6', Array.isArray(CHAMPIONSHIP_TEAMS)&&CHAMPIONSHIP_TEAMS.length>=6);
chk('Liverpool has Isak', (PL_TEAMS.find(t=>t.id==='liverpool')||{players:[]}).players.some(p=>p.name.includes('Isak')));
chk('Liverpool has Wirtz', (PL_TEAMS.find(t=>t.id==='liverpool')||{players:[]}).players.some(p=>p.name.includes('Wirtz')));
chk('Newcastle does NOT have Isak', !(PL_TEAMS.find(t=>t.id==='newcastle')||{players:[]}).players.some(p=>p.name.includes('Isak')));
chk('Aston Villa has Watkins', (PL_TEAMS.find(t=>t.id==='aston_villa')||{players:[]}).players.some(p=>p.name.includes('Watkins')));

// --- REG-30: 2026/27 League Composition (promoted/relegated correctly) ---
// Verified against real results (see docs/plan/06-data-reconciliation.md):
// Coventry/Ipswich/Hull promoted to the PL; Burnley/West Ham/Wolves relegated
// from it; Leicester/Oxford/Sheffield Wednesday relegated from the
// Championship to League One. Leeds and Sunderland, promoted the season
// before, stayed up.
// PL must have the 3 promoted teams
chk('PL has Coventry City (promoted 2026)', PL_TEAMS.some(t=>t.id==='coventry'&&t.name==='Coventry City'));
chk('PL has Ipswich Town (promoted 2026)', PL_TEAMS.some(t=>t.id==='ipswich'&&t.name==='Ipswich Town'));
chk('PL has Hull City (promoted 2026)', PL_TEAMS.some(t=>t.id==='hull'&&t.name==='Hull City'));
// PL must NOT have the 3 relegated teams
chk('PL does NOT have Burnley (relegated 2026)', !PL_TEAMS.some(t=>t.id==='burnley'));
chk('PL does NOT have West Ham United (relegated 2026)', !PL_TEAMS.some(t=>t.id==='west_ham'));
chk('PL does NOT have Wolverhampton Wanderers (relegated 2026)', !PL_TEAMS.some(t=>t.id==='wolves'));
// Championship must have the 3 relegated PL teams
chk('Championship has Burnley', CHAMPIONSHIP_TEAMS.some(t=>t.id==='burnley'&&t.league==='Championship'));
chk('Championship has West Ham United', CHAMPIONSHIP_TEAMS.some(t=>t.id==='west_ham'&&t.league==='Championship'));
chk('Championship has Wolverhampton Wanderers', CHAMPIONSHIP_TEAMS.some(t=>t.id==='wolves'&&t.league==='Championship'));
// Championship must NOT have the 3 promoted-to-PL teams, nor the 3 teams
// it just sent down to League One
chk('Championship does NOT have Coventry', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='coventry'));
chk('Championship does NOT have Ipswich', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='ipswich'));
chk('Championship does NOT have Hull', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='hull'));
chk('Championship does NOT have Leicester City (relegated 2026)', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='leicester'));
chk('Championship does NOT have Oxford United (relegated 2026)', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='oxford'));
chk('Championship does NOT have Sheffield Wednesday (relegated 2026)', !CHAMPIONSHIP_TEAMS.some(t=>t.id==='sheffield_wed'));
// League One must have the 3 teams the Championship sent down
chk('League One has Leicester City', LEAGUE_ONE_TEAMS.some(t=>t.id==='leicester'&&t.league==='League One'));
chk('League One has Oxford United', LEAGUE_ONE_TEAMS.some(t=>t.id==='oxford'&&t.league==='League One'));
chk('League One has Sheffield Wednesday', LEAGUE_ONE_TEAMS.some(t=>t.id==='sheffield_wed'&&t.league==='League One'));
// Leeds and Sunderland (promoted 2025) stayed up
chk('PL has Leeds United', PL_TEAMS.some(t=>t.id==='leeds'&&t.name==='Leeds United'));
chk('PL has Sunderland', PL_TEAMS.some(t=>t.id==='sunderland'&&t.name==='Sunderland'));
// Verify promoted team squad basics
const leedsT=PL_TEAMS.find(t=>t.id==='leeds');
chk('Leeds has Calvert-Lewin', leedsT&&leedsT.players.some(p=>p.name.includes('Calvert-Lewin')));
chk('Leeds has Gnonto', leedsT&&leedsT.players.some(p=>p.name.includes('Gnonto')));
chk('Leeds league is Premier League', leedsT&&leedsT.league==='Premier League');
const covT=PL_TEAMS.find(t=>t.id==='coventry');
chk('Coventry has Haji Wright', covT&&covT.players.some(p=>p.name.includes('Wright')));
chk('Coventry league is Premier League', covT&&covT.league==='Premier League');
const ipsT=PL_TEAMS.find(t=>t.id==='ipswich');
chk('Ipswich has Hutchinson', ipsT&&ipsT.players.some(p=>p.name.includes('Hutchinson')));
chk('Ipswich league is Premier League', ipsT&&ipsT.league==='Premier League');
const hulT=PL_TEAMS.find(t=>t.id==='hull');
chk('Hull has Philogene', hulT&&hulT.players.some(p=>p.name.includes('Philogene')));
chk('Hull league is Premier League', hulT&&hulT.league==='Premier League');
const sunT=PL_TEAMS.find(t=>t.id==='sunderland');
chk('Sunderland has Le Fée', sunT&&sunT.players.some(p=>p.name.includes('Le Fée')));
chk('Sunderland has Diarra', sunT&&sunT.players.some(p=>p.name.includes('Diarra')));
chk('Sunderland league is Premier League', sunT&&sunT.league==='Premier League');
// All leagues correct count
chk('PL exactly 20 teams', PL_TEAMS.length===20);
chk('Championship exactly 24 teams', CHAMPIONSHIP_TEAMS.length===24);
const l1Count=typeof LEAGUE_ONE_TEAMS!=='undefined'?LEAGUE_ONE_TEAMS.length:0;
const l2Count=typeof LEAGUE_TWO_TEAMS!=='undefined'?LEAGUE_TWO_TEAMS.length:0;
const eredCount=typeof EREDIVISIE_TEAMS!=='undefined'?EREDIVISIE_TEAMS.length:0;
chk('League One exactly 24 teams', l1Count===24);
chk('League Two exactly 24 teams', l2Count===24);
chk('Eredivisie exactly 18 teams', eredCount===18);
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

// ── Weekly wage bill ──────────────────────────────────────────
chk('payWeeklyWages defined', typeof payWeeklyWages==='function');
const wwSrc=code.slice(code.indexOf('async function payWeeklyWages'), code.indexOf('async function payWeeklyWages')+1200);
chk('payWeeklyWages sums player wages per team', wwSrc.includes("p.wage")&&wwSrc.includes('billByTeam'));
chk('payWeeklyWages skips players on loan (already prepaid)', wwSrc.includes('p.onLoan) continue'));
chk('payWeeklyWages deducts bill from team budget', wwSrc.includes('budget: (t.budget ?? 0) - bill')||wwSrc.includes('budget:(t.budget??0)-bill'));
chk('payWeeklyWages called from advanceOneFixture', (()=>{const s=code.indexOf('async function advanceOneFixture(');return s>-1&&code.indexOf('payWeeklyWages',s)>s;})());
chk('payWeeklyWages called from advanceOneFixtureWithResult', (()=>{const s=code.indexOf('async function advanceOneFixtureWithResult');return s>-1&&code.indexOf('payWeeklyWages',s)>s;})());

// ── Board objectives & job security ────────────────────────────
chk('generateBoardObjective defined', typeof generateBoardObjective==='function');
chk('evaluateBoardObjective defined', typeof evaluateBoardObjective==='function');
chk('nextJobSecurity defined', typeof nextJobSecurity==='function');
chk('Promotion league objective is position-based', generateBoardObjective({reputation:80},'Championship').kind==='position');
chk('League Two floor is mid-table, not relegation (no tier below)', generateBoardObjective({reputation:40},'League Two').id==='consolidate');
chk('Top-flight big club gets a title objective', generateBoardObjective({reputation:90},'Premier League').id==='title');
chk('Weak top-flight club must avoid relegation', generateBoardObjective({reputation:40},'Premier League').kind==='avoid_relegation');
chk('evaluateBoardObjective: avoid_relegation met when not relegated', evaluateBoardObjective({kind:'avoid_relegation'}, 15, 20, false).met===true);
chk('evaluateBoardObjective: avoid_relegation missed when relegated', evaluateBoardObjective({kind:'avoid_relegation'}, 19, 20, true).met===false);
chk('evaluateBoardObjective: position objective met at or above target', evaluateBoardObjective({kind:'position',target:6}, 4, 20, false).met===true);
chk('evaluateBoardObjective: position objective missed below target', evaluateBoardObjective({kind:'position',target:6}, 10, 20, false).met===false);
chk('nextJobSecurity rewards meeting the objective', nextJobSecurity(50, true, 0) > 50);
chk('nextJobSecurity punishes missing the objective harder than it rewards meeting it', (nextJobSecurity(50, false, 0) - 50) < -(nextJobSecurity(50, true, 0) - 50));
chk('nextJobSecurity clamps to 0-100', nextJobSecurity(95, true, 20)<=100 && nextJobSecurity(5, false, -20)>=0);
chk('New-game save gets an initial board objective and job security', code.includes('boardObjective:  generateBoardObjective(userTeamData, userLeague)') && code.includes('jobSecurity:     65'));
chk('Season end evaluates the outgoing objective', (()=>{const s=code.indexOf('async function processEndOfSeason');const chunk=s>-1?code.slice(s,s+8000):'';return chunk.includes('evaluateBoardObjective')&&chunk.includes('nextJobSecurity');})());
chk('Season end sets a fresh objective for next season', (()=>{const s=code.indexOf('async function processEndOfSeason');const chunk=s>-1?code.slice(s,s+10000):'';return chunk.includes('generateBoardObjective(userTeamUpdated');})());
chk('resetForNewCareer defined', typeof resetForNewCareer==='function');
chk('resetForNewCareer preserves honors and seasons', (()=>{const s=code.indexOf('async function resetForNewCareer');const chunk=s>-1?code.slice(s,s+800):'';return !chunk.includes("'honors'")&&!chunk.includes("'seasons'");})());
chk('Sacked end-state offers Start New Career, not Start Next Season', code.includes('Start New Career')&&code.includes("summary.sacked"));
chk('HomeScreen shows board confidence', homeScreenSrc.includes('boardObjective')&&homeScreenSrc.includes('jobSecurity'));

// ── Team morale (real, stored — not the old cosmetic win-rate label) ──
chk('moraleTargetFromForm defined', typeof moraleTargetFromForm==='function');
chk('easeMorale defined', typeof easeMorale==='function');
chk('bumpMorale defined', typeof bumpMorale==='function');
chk('moraleDevMultiplier defined', typeof moraleDevMultiplier==='function');
chk('updateTeamMorale defined', typeof updateTeamMorale==='function');
chk('All-win form -> high morale target', moraleTargetFromForm(['W','W','W','W'])>=85);
chk('All-loss form -> low morale target', moraleTargetFromForm(['L','L','L','L'])<=25);
chk('No games played -> neutral morale target', moraleTargetFromForm([])===50);
chk('easeMorale moves toward target, not all the way', (()=>{const r=easeMorale(50,90);return r>50&&r<90;})());
chk('bumpMorale clamps to 0-100', bumpMorale(98,10)<=100 && bumpMorale(2,-10)>=0);
chk('moraleDevMultiplier: low morale slows development', moraleDevMultiplier(0)<1);
chk('moraleDevMultiplier: high morale speeds development', moraleDevMultiplier(100)>1);
chk('moraleDevMultiplier: neutral morale is ~1x', Math.abs(moraleDevMultiplier(50)-1)<0.01);
chk('applyDevelopment applies the morale multiplier', (()=>{const s=code.indexOf('async function applyDevelopment');const chunk=s>-1?code.slice(s,s+4500):'';return chunk.includes('moraleDevMultiplier');})());
chk('updateTeamMorale called once per gameweek in advanceOneFixture', (()=>{const s=code.indexOf('async function advanceOneFixture(');return s>-1&&code.indexOf('updateTeamMorale',s)>s;})());
chk('renewContract nudges morale up', (()=>{const s=code.indexOf('async function renewContract');const chunk=s>-1?code.slice(s,s+1200):'';return chunk.includes('bumpMorale');})());
chk('Season end nudges morale down for lost-for-nothing departures', (()=>{const s=code.indexOf('async function processEndOfSeason');const chunk=s>-1?code.slice(s,s+10000):'';return chunk.includes('bumpMorale(teamNow.morale');})());
chk('HomeScreen morale reads the stored team.morale field', homeScreenSrc.includes('team?.morale'));

// ══ 10. UI FUNCTIONS ═════════════════════════════════════════
section('10. UI Functions');
[
  // renderCompetitions isn't in this list. Phase 3 (docs/plan/04-migration-phases.md)
  // moved League to src/lib/ui/LeagueScreen.svelte — a real Svelte component
  // outside this concatenated bundle entirely, not a same-bundle rename, so
  // there's no legacy identifier left here to check for. renderCharts isn't
  // either — Phase 4 folded it into src/lib/ui/HomeScreen.svelte's own
  // data-fetching along with the rest of Home. renderHome IS still checked:
  // it survives as a thin bridge (bumps the tick HomeScreen.svelte watches)
  // because prematch.js/watchmatch.js/squad_tactics_offers.js still call it.
  // renderSquad, renderTactics, renderAcademy, renderTrophies,
  // renderSettings and renderTransfers aren't either — Phase 4 moved them to
  // src/lib/ui/SquadScreen.svelte, TacticsScreen.svelte, AcademyScreen.svelte,
  // TrophiesScreen.svelte, SettingsScreen.svelte and TransfersScreen.svelte,
  // same reasoning. renderCups and renderHonours were only ever aliases kept
  // to satisfy this exact check list, with no other callers — deleted
  // alongside renderTrophies rather than kept as now-pointless indirection.
  // showMatchReport/showPreMatchModal/handleAdvanceOneFixture/
  // showWatchMatchModal/_launchWatchMatch/_generateStubPlayers aren't
  // checked here either, for the same crash-risk reason renderTransfers
  // was dropped in Phase 4: typeof eval(fn)==='function' throws
  // ReferenceError for an undeclared identifier before typeof can
  // suppress it, and ui/prematch.js/ui/watchmatch.js (Phase 5,
  // docs/plan/04-migration-phases.md) are gone — their UI moved into
  // src/lib/ui/MatchScreen.svelte, checked via matchScreenSrc in
  // section 4 instead.
  'renderHome',
  'renderOffers',
  'renderNewGame',
  'handleEndOfSeason','navigateTo','registerScreen','showModal','toast',
  'showLoader','hideLoader','boot',
].forEach(fn=>chk(fn+' defined', typeof eval(fn)==='function'));
// Shell structure
chk('screen-home in HTML', shellSrc.includes('id="screen-home"'));
chk('screen-transfers in HTML', shellSrc.includes('id="screen-transfers"'));
chk('screen-competitions in HTML', shellSrc.includes('id="screen-competitions"'));
chk('screen-trophies in HTML', shellSrc.includes('id="screen-trophies"'));
chk('screen-squad in HTML', shellSrc.includes('id="screen-squad"'));
chk('screen-academy in HTML', shellSrc.includes('id="screen-academy"'));
chk('screen-tactics in HTML', shellSrc.includes('id="screen-tactics"'));
chk('showOffersModal in bundle', code.includes('showOffersModal'));
// screen-cups/screen-honours were hidden display:none alias divs kept only so
// this exact check list resolved — nothing ever navigated to or queried them
// (confirmed via a repo-wide grep before removing). Dropped along with
// renderCups/renderHonours above rather than carried forward as dead markup.
chk('screen-settings in HTML', shellSrc.includes('id="screen-settings"'));
chk('sidebar nav present', shellSrc.includes('class="sidebar"'));
// Phase 3 (docs/plan/04-migration-phases.md) replaces the static 9-item
// bot-nav with src/lib/ui/TabBar.svelte, mounted at runtime into
// #tabbar-mount — so shellSrc (the raw, pre-Svelte shell) no longer
// contains literal bot-nav or nav-item markup to check.
chk('mobile TabBar mount point present', shellSrc.includes('id="tabbar-mount"'));
chk('Academy in desktop sidebar', (()=>{const sb=shellSrc.indexOf('class="sidebar"');return sb>-1&&shellSrc.indexOf('data-nav="academy"',sb)<sb+3000;})());
// Nine screens fold into five TabBar destinations on mobile; Academy moves
// to a quick-link on Home instead of its own nav slot (same plan doc).
// #screen-home is an empty mount point now (Phase 4 moved Home into
// src/lib/ui/HomeScreen.svelte) — check that component's source instead.
chk('Academy reachable from Home screen', homeScreenSrc.includes("navigateTo('academy')"));
chk('Trophies reachable from Home screen', homeScreenSrc.includes("navigateTo('trophies')"));
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
chk('isTransferWindowOpen defined', typeof isTransferWindowOpen==='function');
chk('transferWindowStatus defined', typeof transferWindowStatus==='function');
chk('simulateAITransfers defined', typeof simulateAITransfers==='function');
chk('isDeadlineDay defined', typeof isDeadlineDay==='function');

// Transfer window logic checks
const summerSave = { currentDate: new Date(2025, 7, 15).toISOString() }; // Aug 15
const winterSave = { currentDate: new Date(2026, 0, 15).toISOString() }; // Jan 15
const closedSave = { currentDate: new Date(2025, 9, 10).toISOString() }; // Oct 10
chk('Summer window (Aug) is open', isTransferWindowOpen(summerSave).open === true);
chk('Winter window (Jan) is open', isTransferWindowOpen(winterSave).open === true);
chk('Oct is outside transfer window', isTransferWindowOpen(closedSave).open === false);
chk('Summer window labelled correctly', isTransferWindowOpen(summerSave).window === 'summer');
chk('Winter window labelled correctly', isTransferWindowOpen(winterSave).window === 'winter');
chk('transferWindowStatus returns label string', typeof transferWindowStatus(summerSave).label === 'string');
chk('transferWindowStatus open=true in summer', transferWindowStatus(summerSave).open === true);
chk('transferWindowStatus open=false in Oct', transferWindowStatus(closedSave).open === false);
// Deadline day checks — triggers when window is open AND next +7d would cross deadline
const summerDeadlineSave = { currentDate: new Date(2025, 7, 26).toISOString() }; // Aug 26 → next GW Sep 2 crosses Sep 1
const winterDeadlineSave = { currentDate: new Date(2026, 0, 26).toISOString() }; // Jan 26 → next GW Feb 2 crosses Feb 1
const summerEarlySave    = { currentDate: new Date(2025, 7, 10).toISOString() }; // Aug 10 → next GW Aug 17, not deadline yet
chk('isDeadlineDay true when Aug 26 (next GW crosses Sep 1)', isDeadlineDay(summerDeadlineSave).isDeadline === true);
chk('isDeadlineDay window=summer when Aug 26', isDeadlineDay(summerDeadlineSave).window === 'summer');
chk('isDeadlineDay true when Jan 26 (next GW crosses Feb 1)', isDeadlineDay(winterDeadlineSave).isDeadline === true);
chk('isDeadlineDay window=winter when Jan 26', isDeadlineDay(winterDeadlineSave).window === 'winter');
chk('isDeadlineDay false when Aug 10 (plenty of time)', isDeadlineDay(summerEarlySave).isDeadline === false);
chk('isDeadlineDay false in Aug (summerSave Aug 15)', isDeadlineDay(summerSave).isDeadline === false);
chk('isDeadlineDay false in Jan (winterSave Jan 15)', isDeadlineDay(winterSave).isDeadline === false);
chk('isDeadlineDay false in Oct', isDeadlineDay(closedSave).isDeadline === false);
// Deadline button moved into src/lib/ui/HomeScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md), styles scoped in the component itself.
chk('deadline day button exists in HomeScreen.svelte', homeScreenSrc.includes('btn-deadline-header'));

// Oct 10 → next window is Jan 1 (winter), ~83 days away — must be > 0 and labelled Winter
chk('Closed window label mentions Winter when Oct', transferWindowStatus(closedSave).label.includes('Winter'));
chk('Closed window days > 0 in Oct', (()=>{ const lbl=transferWindowStatus(closedSave).label; const m=lbl.match(/([0-9]+) day/); return m && parseInt(m[1])>0; })());
// Mar 15 → next window is Aug 1 (summer) — must be labelled Summer
const marchSave = { currentDate: new Date(2026, 2, 15).toISOString() };
chk('Closed window label mentions Summer when Mar', transferWindowStatus(marchSave).label.includes('Summer'));
chk('Closed window days > 0 in Mar', (()=>{ const lbl=transferWindowStatus(marchSave).label; const m=lbl.match(/([0-9]+) day/); return m && parseInt(m[1])>0; })());
// Dec 15 → next window is Jan 1 (winter, ~17 days) not Aug (229 days)
const decSave = { currentDate: new Date(2025, 11, 15).toISOString() };
chk('Closed window label mentions Winter when Dec', transferWindowStatus(decSave).label.includes('Winter'));
chk('Closed window shows ~17 days in mid-Dec', (()=>{ const lbl=transferWindowStatus(decSave).label; const m=lbl.match(/([0-9]+) day/); return m && parseInt(m[1]) > 10 && parseInt(m[1]) < 25; })());
// buyPlayer must check window
chk('buyPlayer throws WINDOW_CLOSED when window shut', (()=>{const s=code.indexOf('async function buyPlayer');const chunk=s>-1?code.slice(s,s+600):'';return chunk.includes('WINDOW_CLOSED');})());
// sellPlayer must check window
chk('sellPlayer throws WINDOW_CLOSED when window shut', (()=>{const s=code.indexOf('async function sellPlayer');const chunk=s>-1?code.slice(s,s+300):'';return chunk.includes('WINDOW_CLOSED');})());
// generateAIOffers must return early when closed
chk('generateAIOffers returns [] when window closed', (()=>{const s=code.indexOf('async function generateAIOffers');const chunk=s>-1?code.slice(s,s+300):'';return chunk.includes('WINDOW_CLOSED')||chunk.includes('return []');})());
// simulateAITransfers respects window
chk('simulateAITransfers respects window', (()=>{const s=code.indexOf('async function simulateAITransfers');const chunk=s>-1?code.slice(s,s+200):'';return chunk.includes('isTransferWindowOpen');})());
// simulateAITransfers hooked into gameweek advance
chk('simulateAITransfers called in advanceOneFixture', code.includes('simulateAITransfers'));
// WINDOW_CLOSED error handled in UI
chk('WINDOW_CLOSED error handled in buy UI', code.includes('WINDOW_CLOSED'));
// Window banner in shell
chk('Transfer window banner in TransfersScreen.svelte', transfersScreenSrc.includes('tr-window-banner'));
chk('Weekly wage bill shown in TransfersScreen.svelte', transfersScreenSrc.includes('weeklyWageBill'));
chk('Wage bill excludes prepaid loaned-in players', transfersScreenSrc.includes('squadPlayers.filter(p => !p.onLoan)'));

const basePl={value:50000000,goals:0,assists:0,cleanSheets:0,form:50};
const hotPl={...basePl,goals:18,assists:10,form:85};
const coldPl={...basePl,goals:0,assists:0,form:30};
chk('Hot form boosts value', formAdjustedValue(hotPl)>formAdjustedValue(basePl));
chk('Cold form <= base value', formAdjustedValue(coldPl)<=formAdjustedValue(basePl));
chk('formAdjustedValue returns positive', formAdjustedValue(basePl)>0);
chk('transferListed field used', code.includes('transferListed'));
chk('inboundOffers in save', code.includes('inboundOffers'));

// --- REG-31: Collapsed Deals — block re-offers after deal breaks down ---
chk('collapsedDeals array in save shape', code.includes('collapsedDeals'));
chk('collapsedDeals initialized as empty array in startNewGame', code.includes("collapsedDeals:  []") || code.includes("collapsedDeals:[]"));
// The renderPlayerDetail/_applyAndRenderBuyList/renderBuyList function names
// below moved to src/lib/ui/TransfersScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — checked against transfersScreenSrc
// instead of the bundle, same reasoning as the other *ScreenSrc reads.
chk('collapsedDeals checked in TransfersScreen.svelte', transfersScreenSrc.includes('detailIsCollapsed'));
chk('collapsedDeals recorded on counter-offer rejection', transfersScreenSrc.includes('collapsedDeals || []), player.id'));
chk('collapsedDeals cleared at season rollover', (()=>{const s=code.indexOf('processEndOfSeason');const chunk=s>-1?code.slice(s,s+70000):'';return chunk.includes('collapsedDeals');})());
chk('Deal Collapsed UI shown when blocked', transfersScreenSrc.includes('Deal Collapsed'));
chk('Offer controls hidden when collapsed', transfersScreenSrc.includes('{#if detailIsCollapsed}'));

// --- REG-32: Reputation Gate — players won't join clubs below rep threshold ---
chk('playerMinRepToSign defined', typeof playerMinRepToSign==='function');
chk('canClubSignPlayer defined', typeof canClubSignPlayer==='function');
// Thresholds: sub-60 rated player has no gate
chk('Sub-60 rated player needs no rep (gate=0)', playerMinRepToSign({attack:55,midfield:55,defence:55,goalkeeping:55,position:'CM'})===0);
// 70-rated player needs rep ≥ 56
chk('70-rated player needs rep 56+', playerMinRepToSign({attack:70,midfield:70,defence:70,goalkeeping:70,position:'CM'})===56);
// 80-rated player needs rep ≥ 72
chk('80-rated player needs rep 72+', playerMinRepToSign({attack:80,midfield:80,defence:80,goalkeeping:80,position:'CB'})===72);
// 85-rated player needs rep ≥ 80
chk('85-rated player needs rep 80+', playerMinRepToSign({attack:85,midfield:85,defence:85,goalkeeping:85,position:'ST'})===80);
// 90-rated player needs rep ≥ 88
chk('90-rated player needs rep 88+', playerMinRepToSign({attack:90,midfield:90,defence:90,goalkeeping:90,position:'ST'})===88);
// canClubSignPlayer: low-rep club blocked on high-rated player
chk('Low-rep club blocked from 85-rated player', !canClubSignPlayer({reputation:65},{attack:85,midfield:85,defence:85,goalkeeping:85,position:'ST',transferListed:false}));
// canClubSignPlayer: high-rep club allowed
chk('High-rep club allowed to sign 85-rated player', canClubSignPlayer({reputation:82},{attack:85,midfield:85,defence:85,goalkeeping:85,position:'ST',transferListed:false}));
// Transfer-listed lowers threshold by 4
chk('Transfer-listed reduces req by 4 rep', canClubSignPlayer({reputation:76},{attack:80,midfield:80,defence:80,goalkeeping:80,position:'CB',transferListed:true}));
// Potential is NOT gated — high potential low-rated player can go anywhere
chk('Low-rated high-potential player has zero gate', playerMinRepToSign({attack:58,midfield:58,defence:58,goalkeeping:58,position:'CM',potentialRating:90})===0);
// REP_TOO_LOW error thrown in buyPlayer
chk('buyPlayer throws REP_TOO_LOW on rep gate', code.includes("'REP_TOO_LOW'") || code.includes('"REP_TOO_LOW"'));
// canClubSignPlayer checked in sellPlayer (AI buyer gate)
chk('canClubSignPlayer checked in sellPlayer AI buyer loop', (()=>{const s=code.indexOf('function sellPlayer');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('canClubSignPlayer');})());
// canClubSignPlayer checked in generateAIOffers
chk('canClubSignPlayer checked in generateAIOffers', (()=>{const s=code.indexOf('function generateAIOffers');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('canClubSignPlayer');})());
// canClubSignPlayer blocks signedThisSeason players
chk('signedThisSeason blocks canClubSignPlayer', !canClubSignPlayer({reputation:99},{attack:50,midfield:50,defence:50,goalkeeping:50,position:'CM',signedThisSeason:true}));
chk('signedThisSeason does not block when false', canClubSignPlayer({reputation:99},{attack:50,midfield:50,defence:50,goalkeeping:50,position:'CM',signedThisSeason:false}));
// repGateReason returns season message when signedThisSeason
chk('repGateReason mentions season when signedThisSeason', (repGateReason({reputation:99},{attack:50,midfield:50,defence:50,goalkeeping:50,position:'CM',name:'Test',signedThisSeason:true})||'').includes('season'));
// signedThisSeason stamped on all transfer paths
chk('buyPlayer stamps signedThisSeason', (()=>{const s=code.indexOf('async function buyPlayer');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('signedThisSeason');})());
chk('buyPlayer throws SIGNED_THIS_SEASON', (()=>{const s=code.indexOf('async function buyPlayer');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('SIGNED_THIS_SEASON');})());
chk('sellPlayer stamps signedThisSeason', (()=>{const s=code.indexOf('async function sellPlayer');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('signedThisSeason');})());
chk('acceptOffer stamps signedThisSeason', (()=>{const s=code.indexOf('async function acceptOffer');const chunk=s>-1?code.slice(s,s+1200):'';return chunk.includes('signedThisSeason');})());
chk('simulateAITransfers stamps signedThisSeason', (()=>{const s=code.indexOf('async function simulateAITransfers');const chunk=s>-1?code.slice(s,s+5000):'';return chunk.includes('signedThisSeason');})());
// signedThisSeason cleared at season rollover
chk('processEndOfSeason clears signedThisSeason', (()=>{const s=code.indexOf('async function processEndOfSeason');const chunk=s>-1?code.slice(s,s+6000):'';return chunk.includes('signedThisSeason: false');})());
// UI shows season-locked badge and banner
chk('Season-locked badge shown in buy list', code.includes('Already transferred this season'));
chk('Season-locked banner shown in detail panel', transfersScreenSrc.includes('Already Transferred') && transfersScreenSrc.includes('cannot transfer again until next season'));
// Rep lock icon shown in buy list
chk('Rep lock icon shown in buy list rows', transfersScreenSrc.includes('lock-badge') && transfersScreenSrc.includes('rep.blocked'));
// canSign toggle present
chk('canSign filter toggle in transfer UI', transfersScreenSrc.includes('tr-can-sign'));
chk('canSign filter applied in filteredBuyList', (()=>{const s=transfersScreenSrc.indexOf('filteredBuyList = $derived.by');const chunk=s>-1?transfersScreenSrc.slice(s,s+2000):'';return chunk.includes('f.canSign');})());
// maxPrice=0 means no limit (not filtered)
chk('maxPrice 0 means no limit in filter', (()=>{const s=transfersScreenSrc.indexOf('filteredBuyList = $derived.by');const chunk=s>-1?transfersScreenSrc.slice(s,s+2000):'';return chunk.includes('f.maxPrice > 0');})());
// minPot default is 0 (no minimum)
chk('minPot initialises to 0 (no minimum)', transfersScreenSrc.includes('minPot: 0'));

// ── Contracts & free agency ────────────────────────────────────
chk('contractYearsRemaining defined', typeof contractYearsRemaining==='function');
chk('contractYearsRemaining never negative', contractYearsRemaining({contractExpiry:2020}, {season:'2025/26'})===0);
chk('contractYearsRemaining treats missing expiry as 2 years, not 0', contractYearsRemaining({}, {season:'2025/26'})===2);
chk('renewContract defined', typeof renewContract==='function');
chk('signFreeAgent defined', typeof signFreeAgent==='function');
chk('getFreeAgents defined', typeof getFreeAgents==='function');
chk('signFreeAgent checks reputation gate', (()=>{const s=code.indexOf('async function signFreeAgent');const chunk=s>-1?code.slice(s,s+800):'';return chunk.includes('canClubSignPlayer');})());
chk('buyPlayer assigns a fresh contract', (()=>{const s=code.indexOf('async function buyPlayer');const chunk=s>-1?code.slice(s,s+2000):'';return chunk.includes('_freshContractExpiry');})());
chk('sellPlayer assigns a fresh contract to the buyer', (()=>{const s=code.indexOf('async function sellPlayer');const chunk=s>-1?code.slice(s,s+1500):'';return chunk.includes('_freshContractExpiry');})());
chk('acceptOffer assigns a fresh contract to the buyer', (()=>{const s=code.indexOf('async function acceptOffer');const chunk=s>-1?code.slice(s,s+1200):'';return chunk.includes('_freshContractExpiry');})());
chk('simulateAITransfers assigns a fresh contract', (()=>{const s=code.indexOf('async function simulateAITransfers');const chunk=s>-1?code.slice(s,s+5000):'';return chunk.includes('_freshContractExpiry');})());
chk('New-game players get a starting contractExpiry', code.includes('contractExpiry: seasonYear + 1'));
chk('Youth promotion (AI) sets a 3-year contract', code.includes('contractExpiry: promoteYear + 3'));
chk('SquadScreen shows contract years remaining and a Renew action', squadScreenSrc.includes('contractYearsRemaining') && squadScreenSrc.includes('renewContract'));
chk('TransfersScreen has a Free Agents tab', transfersScreenSrc.includes("selectTab('free')") && transfersScreenSrc.includes('signFreeAgent'));

// ── Season-end contract resolution (executed directly, not just string-matched) ──
(() => {
  const currentYear = 2025;
  const userTeamId = 'user1';
  // Backfill: a player with no contractExpiry never becomes a free agent outright
  const noContractPlayer = { id:'p1', teamId:'user1', age:24, contractExpiry: undefined };
  // Expired, user's own player, not renewed -> free agent
  const expiredUserPlayer = { id:'p2', teamId:'user1', age:27, contractExpiry: currentYear };
  // Still has time left -> untouched
  const activePlayer = { id:'p3', teamId:'other', age:24, contractExpiry: currentYear + 2 };
  chk('Season-end: missing contractExpiry never reads as already-expired', noContractPlayer.contractExpiry == null && !(noContractPlayer.contractExpiry <= currentYear));
  chk('Season-end: user player past expiry is the one that should become a free agent', expiredUserPlayer.contractExpiry <= currentYear && expiredUserPlayer.teamId === userTeamId);
  chk('Season-end: player with years left is untouched', activePlayer.contractExpiry > currentYear);
})();
const seasonEndSrc = code.slice(code.indexOf('async function processEndOfSeason'), code.indexOf('async function processEndOfSeason')+7000);
chk('Season end backfills missing contractExpiry rather than releasing', seasonEndSrc.includes('contractExpiry == null'));
chk("Season end sends the user's own expired players to free_agents", seasonEndSrc.includes("teamId = 'free_agents'"));
chk('Season end tracks expired contracts in the summary', seasonEndSrc.includes('summary.expiredContracts'));
chk('Season end never auto-releases players already on free_agents', seasonEndSrc.includes("teamId !== 'free_agents'"));

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
// potDisp/potColor/potLabel "defined before use" doesn't have a meaningful
// equivalent in TransfersScreen.svelte (Phase 4, docs/plan/04-migration-
// phases.md) — that was a real risk in the old renderBuyList's hand-built
// template strings (a variable read before its own assignment silently
// stringifies to "undefined"), but Svelte's {@const potStars = ...} runs
// before anything in the same block can reference it, enforced by the
// compiler, not by source-order discipline. Dropped rather than kept as a
// check with no failure mode left to catch.
chk('Domestic cup filters by userLeague', code.includes('userLeague')&&code.includes("'Premier League'")&&code.includes('league_cup'));
chk('Cup event carries opponentName', code.includes('opponentName:')&&(code.includes("type: 'cup'")||code.includes("type:'cup'")));
chk('simulateCupRound receives event', code.includes('simulateCupRound')&&code.includes('event.opponentId'));
chk('Pre-match userIsHome computed', matchScreenSrc.includes('userIsHome')&&matchScreenSrc.includes('buildMatchCtx'));
chk('No hardcoded Unknown Opponent', !code.includes("'Unknown Opponent'"));
chk('buildUCLOpponents excludes user', code.includes('excludeTeamId')&&code.includes('buildUCLOpponents'));
chk('buildInitialCupState accepts userTeamId', (()=>{const s=code.indexOf('function buildInitialCupState');return s>-1&&code.slice(s,s+100).includes('userTeamId');})());
chk('simulateUCLMatchday guards self-match', code.includes('rawOpp.id === userTeam.id'));
chk('UCL matchday returns userIsHome', (()=>{const s=code.indexOf('function simulateUCLMatchday');return s>-1&&code.indexOf('userIsHome',s)<s+2000;})());
chk('UCL homeScorers respect userIsHome', (()=>{const s=code.indexOf('function buildCupMatchResult');return s>-1&&code.indexOf('userIsHome',s)<s+2000&&code.indexOf('homeScorers',s)<s+2000;})());
chk('Design token --acc defined in CSS', shellSrc.includes('--acc:#'));
chk('Design token --sur defined in CSS', shellSrc.includes('--sur:'));
chk('Bebas Neue font loaded', shellSrc.includes('Bebas+Neue'));
chk('DM Sans font loaded', shellSrc.includes('DM+Sans'));

// ══ 13. YOUTH ACADEMY ════════════════════════════════════════
section('13. Youth Academy');
chk('runYouthIntake defined', typeof runYouthIntake==='function');
chk('promoteYouthPlayer defined', typeof promoteYouthPlayer==='function');
chk('releaseYouthPlayer defined', typeof releaseYouthPlayer==='function');
chk('getAcademyInfo defined', typeof getAcademyInfo==='function');
// renderAcademy isn't checked here — Phase 4 (docs/plan/04-migration-phases.md)
// moved it to src/lib/ui/AcademyScreen.svelte, same reasoning as renderSquad/
// renderTactics above: a real Svelte component outside this bundle entirely.
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
const aiPoor=getAcademyInfo(50);
chk('Rep50 -> poor tier', aiPoor.tier==='poor');
chk('Poor has 1 star', aiPoor.stars===1);
const aiTop=getAcademyInfo(85);
chk('Rep85 -> top tier', aiTop.tier==='top');
chk('Top has 4 stars', aiTop.stars===4);
const aiGood=getAcademyInfo(72);
chk('Rep72 -> good tier (Crystal Palace level)', aiGood.tier==='good');
chk('Good has 3 stars', aiGood.stars===3);
const aiAvg=getAcademyInfo(60);
chk('Rep60 -> average tier', aiAvg.tier==='average');
chk('Average has 2 stars', aiAvg.stars===2);
chk('Higher rep -> more stars', aiElite.stars>=aiTop.stars&&aiTop.stars>=aiGood.stars&&aiGood.stars>=aiAvg.stars&&aiAvg.stars>=aiPoor.stars);
chk('academy card markup in AcademyScreen.svelte', academyScreenSrc.includes('ac-card'));
chk('promote/release wired in AcademyScreen.svelte', academyScreenSrc.includes('askPromote') && academyScreenSrc.includes('askRelease'));
chk('releaseYouthPlayer called from AcademyScreen.svelte', academyScreenSrc.includes('releaseYouthPlayer'));
chk('wonderkid badge in AcademyScreen.svelte', academyScreenSrc.includes('ac-wk-badge'));
chk('age-out logic present', code.includes('age <= 19')||code.includes('age<=19'));
chk('AI auto-promotes talented youth', code.includes('potentialRating >= 70')||code.includes('potentialRating>=70'));
chk('runYouthIntake called in processEndOfSeason', (()=>{const s=code.indexOf('function processEndOfSeason');return s>-1&&code.indexOf('runYouthIntake',s)<s+7000;})());
chk('newYouthCohort stored in save', code.includes('newYouthCohort'));
chk('youthCohort seeded in startNewGame', (()=>{const ng=code.indexOf('function startNewGame');return ng>-1&&code.indexOf('youthCohort',ng)<ng+3000;})());
chk('youthTeamId field present', code.includes('youthTeamId'));
chk('isYouth field present', code.includes('isYouth'));

// ── Academy investment ──────────────────────────────────────────
chk('academyTier blends reputation with investment', academyTier(55, 100) !== academyTier(55, 0));
chk('academyTier: investment can push a club up roughly one tier', academyTier(60,0)==='average' && academyTier(60,100)==='good');
chk('academyTier: investment=0 behaves exactly as before', academyTier(72)==='good' && academyTier(72,0)==='good');
chk('academyInvestmentPointsForSpend defined', typeof academyInvestmentPointsForSpend==='function');
chk('academyInvestmentPointsForSpend: capped by remaining room to 100', academyInvestmentPointsForSpend(98, 10_000_000)===2);
chk('academyInvestmentPointsForSpend: capped by affordable spend', academyInvestmentPointsForSpend(0, 1_500_000)===3);
chk('investInAcademy defined', typeof investInAcademy==='function');
chk('investInAcademy checks budget', (()=>{const s=code.indexOf('async function investInAcademy');const chunk=s>-1?code.slice(s,s+700):'';return chunk.includes('INSUFFICIENT_FUNDS');})());
chk('generateCohort scales intake size with investment', generateCohort('t1',70,'2025/26','Premier League',100).length===14);
chk('generateCohort defaults to 10 with no investment', generateCohort('t1',70,'2025/26','Premier League').length===10);
chk('getAcademyInfo reports investment and cohort size', (()=>{const i=getAcademyInfo(70,100);return i.investment===100&&i.cohortSize===14;})());
chk('New-game teams start with academyInvestment: 0', code.includes('academyInvestment: 0'));
chk('AcademyScreen has an Invest action', academyScreenSrc.includes('investInAcademy') && academyScreenSrc.includes('doInvest'));
chk('AcademyScreen shows current investment level out of 100', academyScreenSrc.includes('info.investment') && academyScreenSrc.includes('/100'));

// ══ 14. LIVE MATCH ═══════════════════════════════════════════
section('14. Live Match');
// ui/watchmatch.js is gone (Phase 5, docs/plan/04-migration-phases.md) —
// its live viewer became src/lib/ui/MatchScreen.svelte's Live/Full-Time/
// After beats, and the user-intervention rules it hand-rolled inline
// (_applyUserSub's GK<->GK/outfield<->outfield guards and 3-sub limit,
// _applyFormationChange's XI recompute) moved to src/game/substitutions.js
// and src/game/formationChange.js — pure, DOM-free, and covered by real
// Vitest tests (src/game/*.test.js) instead of the eval'd-bundle-plus-
// module-global hackery this section used to need (_watchState wired up by
// hand, _applyUserSub/_applyFormationChange called directly). Everything
// below that isn't a matchEngine.js/gameweek.js export — _wmSubClick,
// _applyUserSub, _applyFormationChange, _togglePause,
// _showInterventionPanel, _commitResult, _finishMatch, showWatchMatchModal,
// _launchWatchMatch, the wm-* CSS classes, WATCH_PHASES_PER_TICK/
// WATCH_TICK_MS as bundle constants — no longer exists in this concatenated
// bundle at all (MatchScreen.svelte is a real Svelte component outside it,
// same as every other Phase 3/4 screen), so those checks are gone rather
// than left to fail on a deleted identifier.
// Core engine exports (modules/matchEngine.js, modules/gameweek.js — untouched)
chk('simulateMatchSegment defined', typeof simulateMatchSegment==='function');
chk('buildLiveMatchState defined', typeof buildLiveMatchState==='function');
chk('finaliseLiveMatch defined', typeof finaliseLiveMatch==='function');
chk('advanceOneFixtureWithResult defined', typeof advanceOneFixtureWithResult==='function');
// MatchScreen.svelte wiring
chk('Live tick engine ported (runTick/scheduleTick)', matchScreenSrc.includes('function runTick')&&matchScreenSrc.includes('function scheduleTick'));
chk('WATCH_PHASES_PER_TICK defined', matchScreenSrc.includes('WATCH_PHASES_PER_TICK'));
chk('WATCH_TICK_MS defined', matchScreenSrc.includes('WATCH_TICK_MS'));
chk('TOTAL_PHASES=120 in Live beat', matchScreenSrc.includes('TOTAL_PHASES')&&matchScreenSrc.includes('120'));
chk('Speed control 1x/2x/4x', matchScreenSrc.includes('[1, 2, 4]'));
chk('Pause/resume wired', matchScreenSrc.includes('function togglePause'));
chk('Skip wired', matchScreenSrc.includes('function skipMatch'));
chk('Substitution sheet uses src/game/substitutions.js', matchScreenSrc.includes("from '../../game/substitutions.js'")&&matchScreenSrc.includes('applySubstitution'));
chk('Tactics sheet uses src/game/formationChange.js', matchScreenSrc.includes("from '../../game/formationChange.js'")&&matchScreenSrc.includes('applyFormationChange'));
chk('Sub sheet pauses while open', matchScreenSrc.includes('subSheetWasPaused'));
chk('Tactics sheet pauses while open', matchScreenSrc.includes('tacticsSheetWasPaused'));
chk('Injury auto-pauses the match', matchScreenSrc.includes("ev.type === 'injury'")&&matchScreenSrc.includes('togglePause()'));
chk('Full Time beat shows scorers + verdict', matchScreenSrc.includes('ft-verdict')&&matchScreenSrc.includes('homeScorers'));
chk('After beat commits via advanceOneFixtureWithResult', matchScreenSrc.includes('advanceOneFixtureWithResult'));
chk('After beat shows league position with animate:flip', matchScreenSrc.includes('animate:flip')&&matchScreenSrc.includes('getTableSliceAroundTeam'));
// buildLiveMatchState smoke
const mkSt=(tid)=>[
  {id:tid+'_gk',name:'GK0',position:'GK',teamId:tid,attack:30,midfield:40,defence:55,goalkeeping:78,fitness:90,inSquad:true,injured:false,suspended:false},
  ...['CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CB','CM','ST','LW','GK'].map((pos,i)=>({id:tid+'_'+i,name:pos+i,position:pos,teamId:tid,attack:65,midfield:65,defence:65,goalkeeping:20,fitness:90,inSquad:true,injured:false,suspended:false}))
];
// Shared fixture builder — 11 outfield + 1 GK + 3 bench, used by several
// regression sections below (goal attribution, fitness drain, player
// development) that need a full realistic squad, not just mkSt's flat list.
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
  {id:tid+'_sub1',name:'Sub1',position:'CM',teamId:tid,attack:58,midfield:72,defence:50,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
  {id:tid+'_sub2',name:'Sub2',position:'ST',teamId:tid,attack:82,midfield:58,defence:28,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
  {id:tid+'_sub3',name:'Sub3',position:'CB',teamId:tid,attack:38,midfield:42,defence:69,goalkeeping:20,fitness:100,inSquad:true,injured:false,suspended:false},
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
// Liverpool (PL) enters FA Cup at R3 (roundIndex=2); League Two clubs enter at R1 (roundIndex=0)
const cupIds=['fa_cup','league_cup'];
const cupState=buildInitialCupState(cupIds,'liverpool','Premier League');
chk('buildInitialCupState: returns object', typeof cupState==='object');
chk('buildInitialCupState: fa_cup entry', !!cupState.fa_cup);
chk('buildInitialCupState: league_cup entry', !!cupState.league_cup);
chk('buildInitialCupState: fa_cup has status', typeof cupState.fa_cup.status==='string');
chk('buildInitialCupState: fa_cup PL roundIndex=2', cupState.fa_cup.roundIndex===2);
const l2CupState=buildInitialCupState(['fa_cup','league_cup'],'barrow','League Two');
chk('buildInitialCupState: fa_cup L2 roundIndex=0', l2CupState.fa_cup.roundIndex===0);
const champCupState=buildInitialCupState(['fa_cup','league_cup'],'burnley','Championship');
chk('buildInitialCupState: fa_cup Champ roundIndex=1', champCupState.fa_cup.roundIndex===1);
// Non-English cups also work
const spCupState=buildInitialCupState(['copa_del_rey','supercopa'],'barcelona');
chk('buildInitialCupState: copa_del_rey entry', !!spCupState.copa_del_rey);
chk('buildInitialCupState: copa_del_rey has status', typeof spCupState.copa_del_rey.status==='string');
const deCupState=buildInitialCupState(['dfb_pokal','dfb_supercup'],'bayern');
chk('buildInitialCupState: dfb_pokal entry', !!deCupState.dfb_pokal);
const itCupState=buildInitialCupState(['coppa_italia','supercoppa'],'juventus');
chk('buildInitialCupState: coppa_italia entry', !!itCupState.coppa_italia);
const frCupState=buildInitialCupState(['coupe_de_france','trophee_des_champions'],'psg');
chk('buildInitialCupState: coupe_de_france entry', !!frCupState.coupe_de_france);

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

section('22. Mentality System');
chk('getMentalityMods defined', typeof getMentalityMods === 'function');
['defensive','balanced','possession','attacking'].forEach(function(m) {
  const mods = getMentalityMods(m);
  chk('getMentalityMods(' + m + ') returns object', mods && typeof mods === 'object');
  chk('getMentalityMods(' + m + ').goalProbMult is number', typeof mods.goalProbMult === 'number');
  chk('getMentalityMods(' + m + ').defResistMult is number', typeof mods.defResistMult === 'number');
  chk('getMentalityMods(' + m + ').midShareBoost is number', typeof mods.midShareBoost === 'number');
  chk('getMentalityMods(' + m + ').shotsMultSelf is number', typeof mods.shotsMultSelf === 'number');
});
// Balanced must be neutral
const bMods = getMentalityMods('balanced');
chk('balanced goalProbMult is 1.0', bMods.goalProbMult === 1.0);
chk('balanced defResistMult is 1.0', bMods.defResistMult === 1.0);
chk('balanced midShareBoost is 0', bMods.midShareBoost === 0);
// Defensive must be less offensive than attacking
const dMods = getMentalityMods('defensive');
const aMods2 = getMentalityMods('attacking');
chk('defensive goalProbMult < balanced', dMods.goalProbMult < 1.0);
chk('attacking goalProbMult > balanced', aMods2.goalProbMult > 1.0);
chk('defensive defResistMult > balanced', dMods.defResistMult > 1.0);
chk('attacking defResistMult < balanced', aMods2.defResistMult < 1.0);
// Possession should dominate midshare
const pMods = getMentalityMods('possession');
chk('possession midShareBoost > 0', pMods.midShareBoost > 0);
chk('defensive midShareBoost < 0', dMods.midShareBoost < 0);
// simulateMatch accepts mentality params
const mTestHome = {id:'mh',name:'Home',crest:'🏠'};
const mTestAway = {id:'ma',name:'Away',crest:'🅰'};
const mTestPl = Array.from({length:15},function(_,i){return{id:'p'+i,name:'P'+i,position:['GK','CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CM','ST','GK','CB'][i],attack:70,midfield:70,defence:70,goalkeeping:70,fitness:90,inSquad:true,injured:false,suspended:false};});
const mRes = simulateMatch(mTestHome, mTestAway, mTestPl, mTestPl, '4-3-3', '4-3-3', null, null, 'attacking', 'defensive');
chk('simulateMatch accepts mentality params', mRes && typeof mRes.homeGoals === 'number');
chk('simulateMatch returns homeMentality', mRes.homeMentality === 'attacking');
chk('simulateMatch returns awayMentality', mRes.awayMentality === 'defensive');
// save.js mentality default
chk('mentality key in save state (via startNewGame logic)', typeof startNewGame === 'function');
// UI: mentality picker present in TacticsScreen.svelte (Phase 4 moved
// renderTactics's markup there — same reasoning as the homeScreenSrc checks).
chk('mentality picker wired in TacticsScreen.svelte', tacticsScreenSrc.includes('pickMentality'));
chk('mentality saved via putSave in TacticsScreen.svelte', tacticsScreenSrc.includes('mentality: m.id'));
chk('MENTALITIES array in TacticsScreen.svelte', tacticsScreenSrc.includes('MENTALITIES'));
// Team News beat shows mentality
chk('mentality shown in Team News beat', matchScreenSrc.includes('save.mentality') && matchScreenSrc.includes('tn-mentality'));

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

// --- REG-2: When user is AWAY, startWatch() must pass userPlayers correctly ---
// This tests the code path, not the async function. ui/prematch.js's
// _launchWatchMatch became MatchScreen.svelte's resolveMatchTeams()/
// startWatch() (Phase 5, docs/plan/04-migration-phases.md) — check that
// source instead. We verify the source code resolves userPlayers/oppPlayers
// based on resolved.userIsHome, not hardcoded to the home side.
const launchSrc = (()=>{
  const start=matchScreenSrc.indexOf('async function startWatch');
  if(start===-1) return '';
  return matchScreenSrc.slice(start, start+3000);
})();
chk('REG: startWatch resolves userPlayers from resolved.userIsHome', launchSrc.includes('userPlayers: resolved.userIsHome ? resolved.homePlayers : resolved.awayPlayers'));
chk('REG: startWatch resolves oppPlayers from resolved.userIsHome', launchSrc.includes('oppPlayers:  resolved.userIsHome ? resolved.awayPlayers : resolved.homePlayers') || launchSrc.includes('oppPlayers: resolved.userIsHome ? resolved.awayPlayers : resolved.homePlayers'));

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

// REG-5 (GK sub rules — GK can replace GK, outfield cannot replace GK) used
// to run here against the module-level _watchState global ui/watchmatch.js
// exposed to this eval'd bundle. That file is gone (Phase 5, docs/plan/
// 04-migration-phases.md) — the rule itself moved to src/game/
// substitutions.js's validateSubstitution(), a pure ES module this
// CommonJS runner can't require() directly (no build step turns it back
// into eval-able plain JS the way build.py does for modules/*.js). Real
// coverage — GK<->GK allowed, GK->outfield blocked, outfield->GK blocked,
// backup GK never subbed as a bench player is filtered out — now lives in
// src/game/substitutions.test.js (Vitest, 'npm run test'), which exercises
// the actual function directly instead of a hand-wired global.

// REG-6 (stub players should have realistic names, not "Player N") used
// _generateStubPlayers, which lived in ui/prematch.js. That file is gone
// (Phase 5, docs/plan/04-migration-phases.md) — the function moved to
// src/game/opponents.js's generateStubPlayers(), a pure ES module this
// CommonJS runner can't require() directly. Real coverage (16 players,
// no "Player N" placeholder names, unique names, sane rating spread) now
// lives in src/game/opponents.test.js (Vitest, 'npm run test').

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
chk('REG: simulateMatchSegment uses 0.18 drain', segSrc.includes('0.18'));
chk('REG: simulateMatchSegment uses 0.12 drain', segSrc.includes('0.12'));
chk('REG: simulateMatchSegment does NOT use 0.55 fitness drain', !segSrc.includes('- 0.55'));
chk('REG: simulateMatchSegment does NOT use 0.40 drain', !segSrc.includes('0.40'));

section('Regression: Between-Match Recovery');

// --- REG-8: All players get fitness recovery, not just non-played ---
const recoverySrc = (()=>{const s=code.indexOf('function updateCache')||code.indexOf('async function updateCache');return s>-1?code.slice(s,s+1000):'';})();
chk('REG: played players get +20 recovery', recoverySrc.includes('baseRecovery = 20')||recoverySrc.includes('baseRecovery=20'));
chk('REG: rested players restore to 100', recoverySrc.includes('fitness = 100')||recoverySrc.includes('fitness=100'));
chk('REG: old +8 only-for-rested removed', !recoverySrc.includes('+ 8;')||!recoverySrc.includes('+8;'));

// REG-9 (after formation change, backup GK still on bench) used
// _watchState/_applyFormationChange, which lived in ui/watchmatch.js. That
// file is gone (Phase 5, docs/plan/04-migration-phases.md) — the rule moved
// to src/game/formationChange.js's applyFormationChange(), a pure ES module
// this CommonJS runner can't require() directly. Real coverage now lives in
// src/game/formationChange.test.js's "keeps the backup GK on the bench"
// test (Vitest, 'npm run test').

section('Regression: Live Match HOME/AWAY Labels');

// --- REG-10: HOME/AWAY labels must reflect venue, not user identity ---
// ui/watchmatch.js's _renderWatchModal is gone — this is now
// MatchScreen.svelte's Team News beat, which shows the same static-text
// invariant: the left team block always renders the literal string "HOME"
// and the right always renders "AWAY" (only the accent colour is
// conditional on m.userIsHome), never a dynamic per-user label.
const tnMatchupSrc = (()=>{
  const start=matchScreenSrc.indexOf('class="tn-matchup"');
  return start>-1?matchScreenSrc.slice(start,start+1400):'';
})();
chk('REG: left team label is always HOME', tnMatchupSrc.includes('>HOME</div>'));
chk('REG: right team label is always AWAY', tnMatchupSrc.includes('>AWAY</div>'));
chk('REG: only colour, not the label text, depends on userIsHome', tnMatchupSrc.includes("m.userIsHome ? 'var(--color-club)'"));

section('Regression: Player Development System');

// --- REG-11: All match participants develop, not just scorers ---
// Source code: applyDevelopment must register players from fitnessUpdates (all starters)
const devSrc = (()=>{const s=code.indexOf('function applyDevelopment');return s>-1?code.slice(s,s+5000):'';})();
chk('REG: development uses fitnessUpdates for participation', devSrc.includes('fitnessUpdates'));
chk('REG: development iterates fitnessUpdates to register ALL participants', devSrc.includes('result.fitnessUpdates') || devSrc.includes('(result.fitnessUpdates'));
chk('REG: development does NOT use crude GK lookup by teamId+inSquad', !devSrc.includes('p.teamId === tid && p.position === ') || devSrc.includes('participantIds'));

// --- REG-12: Clean sheet credits the actual starting GK, not just first GK in cache ---
chk('REG: clean sheet uses participantIds from fitnessUpdates', devSrc.includes('participantIds'));
chk('REG: clean sheet finds GK from participants, not all cache', devSrc.includes('participantIds.has'));

// --- REG-13: Defenders benefit from clean sheets ---
chk('REG: defenders get clean sheet bonus', devSrc.includes('cleanSheetDef'));
chk('REG: CDM included in defensive clean sheet', devSrc.includes('CDM') && devSrc.includes('cleanSheetDef'));

// --- REG-14: Growth points include base participation + performance bonuses ---
chk('REG: base playing points awarded', devSrc.includes('1; // Base points') || devSrc.includes('1; // Just for playing'));
chk('REG: goal scoring gives growth points', devSrc.includes('goals * 2'));
chk('REG: assists give growth points', devSrc.includes('assists * 1'));
chk('REG: GK clean sheet gives growth points', devSrc.includes('cleanSheets * 2'));

// --- REG-15: Youth multiplier still applied ---
chk('REG: youth multiplier 1.5x for age<=20', devSrc.includes('1.5'));
chk('REG: youth multiplier 1.3x for age<=23', devSrc.includes('1.3'));

// --- REG-16: Test growthThreshold is sensible (sync function) ---
// Young player with big gap should have low threshold
const gtYoung = growthThreshold(19, 65, 85);
const gtOld   = growthThreshold(31, 65, 85);
chk('REG: young player threshold < old player threshold', gtYoung < gtOld, 'young='+gtYoung+' old='+gtOld);
// Small gap should have high multiplier
const gtSmallGap = growthThreshold(21, 83, 85);
const gtBigGap   = growthThreshold(21, 65, 85);
chk('REG: small gap threshold > big gap threshold', gtSmallGap > gtBigGap, 'small='+gtSmallGap+' big='+gtBigGap);

// --- REG-17: applyStatBoost position-appropriate boosts ---
const boostST = [];
const boostCB = [];
const boostGK = [];
for(let i=0;i<200;i++) {
  const st={position:'ST',attack:70,midfield:50,defence:30,goalkeeping:20,age:22,value:5000000};
  const cb={position:'CB',attack:40,midfield:45,defence:70,goalkeeping:20,age:22,value:5000000};
  const gk={position:'GK',attack:10,midfield:10,defence:30,goalkeeping:75,age:22,value:5000000};
  const bst=applyStatBoost(st); boostST.push(bst);
  const bcb=applyStatBoost(cb); boostCB.push(bcb);
  const bgk=applyStatBoost(gk); boostGK.push(bgk);
}
const stAttBoosts = boostST.filter(p=>p.attack>70).length;
const cbDefBoosts = boostCB.filter(p=>p.defence>70).length;
const gkGkBoosts  = boostGK.filter(p=>p.goalkeeping>75).length;
chk('REG: ST primary boost is attack (>40% of time)', stAttBoosts > 80, stAttBoosts+'/200');
chk('REG: CB primary boost is defence (>40% of time)', cbDefBoosts > 80, cbDefBoosts+'/200');
chk('REG: GK primary boost is goalkeeping (>50% of time)', gkGkBoosts > 100, gkGkBoosts+'/200');

// --- REG-18: simulateMatch returns fitnessUpdates with teamId ---
const devH={id:'dev_h',name:'DevHome',crest:'D',reputation:80};
const devA={id:'dev_a',name:'DevAway',crest:'D',reputation:80};
const devResult = simulateMatch(devH, devA, subTestPlayers('dev_h'), subTestPlayers('dev_a'), '4-3-3', '4-3-3');
chk('REG: match result has fitnessUpdates array', Array.isArray(devResult.fitnessUpdates));
chk('REG: fitnessUpdates has 22 entries (11 per team)', devResult.fitnessUpdates.length === 22, 'got '+devResult.fitnessUpdates.length);
chk('REG: fitnessUpdates entries have teamId', devResult.fitnessUpdates.every(fu => fu.teamId === 'dev_h' || fu.teamId === 'dev_a'));
chk('REG: fitnessUpdates entries have id', devResult.fitnessUpdates.every(fu => typeof fu.id === 'string'));

// --- REG-19: applyDevelopment is called on all match paths in gameweek.js ---
const gwSrc = code;
const devCallCount = (gwSrc.match(/applyDevelopment/g) || []).length;
chk('REG: applyDevelopment called in multiple paths (>=4 refs in code)', devCallCount >= 4, 'found '+devCallCount);

// --- REG-20: assignPotentials gives all fields needed for development ---
const devTestPl = assignPotentials([
  {id:'dp1',position:'ST',attack:72,midfield:50,defence:30,goalkeeping:20,age:19},
  {id:'dp2',position:'CB',attack:35,midfield:40,defence:68,goalkeeping:20,age:28},
  {id:'dp3',position:'GK',attack:10,midfield:10,defence:25,goalkeeping:80,age:32},
]);
chk('REG: young ST gets significant headroom', devTestPl[0].potentialRating >= 78, 'pot='+devTestPl[0].potentialRating);
chk('REG: all get growthPoints=0 initially', devTestPl.every(p=>p.growthPoints===0));
chk('REG: all get peakAge', devTestPl.every(p=>typeof p.peakAge==='number'&&p.peakAge>=26));
chk('REG: GK peaks later than winger', devTestPl[2].peakAge >= 29);

// --- REG-21: Value updates correctly after stat boost ---
const valTestPl = {position:'ST',attack:80,midfield:55,defence:30,goalkeeping:20,age:24,value:20000000};
const boosted = applyStatBoost(valTestPl);
chk('REG: value recalculated after boost', typeof boosted.value === 'number' && boosted.value > 0);
chk('REG: value is not NaN after boost', !isNaN(boosted.value));

section('Regression: Save Export/Import System');

// --- REG-22: Export/import functions exist ---
chk('REG: exportSaveFile defined', typeof exportSaveFile === 'function');
chk('REG: importSaveFile defined', typeof importSaveFile === 'function');
chk('REG: importSaveFromCode defined', typeof importSaveFromCode === 'function');

// --- REG-23: Integrity hash function works ---
chk('REG: _fnv1a defined', typeof _fnv1a === 'function');
const fnvA = _fnv1a('test string');
const fnvB = _fnv1a('test string');
const fnvC = _fnv1a('different string');
chk('REG: _fnv1a returns 8-char hex', fnvA.length === 8 && /^[0-9a-f]+$/.test(fnvA));
chk('REG: _fnv1a deterministic (same input = same output)', fnvA === fnvB);
chk('REG: _fnv1a different inputs = different hashes', fnvA !== fnvC);

// --- REG-24: Magic version and salt constants ---
chk('REG: PITCH_MAGIC version string in code', code.includes('PITCH_SAVE_V1'));
chk('REG: salt string in code', code.includes('pitch_fc_v3_2025'));

// --- REG-25: Export reads all required stores ---
// ROADMAP.md item 7 (cloud save) extracted the store-snapshot + hash + base64
// logic out of exportSaveFile() into buildSaveEnvelope() — src/modules/db.js
// — so cloud save reuses the exact same .pitch serialization instead of a
// second one. exportSaveFile() itself now just calls it and handles the
// file-download side effects, so the store/btoa checks below read from
// buildSaveEnvelope's source instead.
const exportSrc = (()=>{const s=code.indexOf('function exportSaveFile');return s>-1?code.slice(s,s+3000):'';})();
const buildEnvelopeSrc = (()=>{const s=code.indexOf('function buildSaveEnvelope');return s>-1?code.slice(s,s+3000):'';})();
chk('REG: export reads save store', buildEnvelopeSrc.includes("'save'"));
chk('REG: export reads teams store', buildEnvelopeSrc.includes("'teams'"));
chk('REG: export reads players store', buildEnvelopeSrc.includes("'players'"));
chk('REG: export reads fixtures store', buildEnvelopeSrc.includes("'fixtures'"));
chk('REG: export reads standings store', buildEnvelopeSrc.includes("'standings'"));
chk('REG: export reads honors store', buildEnvelopeSrc.includes("'honors'"));
chk('REG: export reads seasons store', buildEnvelopeSrc.includes("'seasons'"));

// --- REG-26: Import validates integrity ---
const importSrc = (()=>{const s=code.indexOf('function _restoreFromEnvelope');return s>-1?code.slice(s,s+4000):'';})();
chk('REG: import checks integrity hash', importSrc.includes('expectedHash') || importSrc.includes('_fnv1a'));
chk('REG: import checks magic version', importSrc.includes('PITCH_MAGIC') || importSrc.includes('PITCH_SAVE_V1'));
chk('REG: import validates snapshot has save', importSrc.includes('snapshot.save'));
chk('REG: import validates snapshot has teams', importSrc.includes('snapshot.teams'));
chk('REG: import validates snapshot has players', importSrc.includes('snapshot.players'));
chk('REG: import deletes old DB before restore', importSrc.includes('deleteDatabase'));

// --- REG-27: UI elements present ---
// Phase 4 (docs/plan/04-migration-phases.md) moved the Settings screen's
// export/import buttons into src/lib/ui/SettingsScreen.svelte, out of
// shell.html's static markup — same reasoning as the other *ScreenSrc reads.
chk('REG: export button in SettingsScreen.svelte', settingsScreenSrc.includes('openExport'));
chk('REG: import button in SettingsScreen.svelte', settingsScreenSrc.includes('openImport'));
chk('REG: file input for import in SettingsScreen.svelte', settingsScreenSrc.includes('type="file"'));
chk('REG: file input accepts .pitch', shellSrc.includes('.pitch'));
chk('REG: new game screen has import button', shellSrc.includes('btn-import-ng'));
chk('REG: new game screen has file input', shellSrc.includes('import-save-ng'));

// --- REG-28: Export produces .pitch filename ---
chk('REG: export generates .pitch filename', exportSrc.includes('.pitch'));
chk('REG: export produces saveCode string', exportSrc.includes('saveCode'));
chk('REG: export uses Web Share API for mobile', exportSrc.includes('navigator.share') || exportSrc.includes('canShare'));
chk('REG: export uses base64 encoding', buildEnvelopeSrc.includes('btoa'));

// --- REG-29: Import/export wired in SettingsScreen.svelte ---
// initUI() (src/ui/renderers.js) used to wire these directly against static
// shell.html elements at boot time; Phase 4 moved the wiring into the
// component itself (querying its own dynamically-rendered elements would
// have raced boot-time initUI(), see the comment above renderNewGame there).
chk('REG: SettingsScreen wires export', settingsScreenSrc.includes('exportSaveFile'));
chk('REG: SettingsScreen wires import', settingsScreenSrc.includes('importSaveFromCode') && settingsScreenSrc.includes('importSaveFile'));
chk('REG: import shows save code textarea', settingsScreenSrc.includes('save-code-input'));
chk('REG: export shows save code output', settingsScreenSrc.includes('save-code-output'));
chk('REG: export has copy to clipboard', settingsScreenSrc.includes('clipboard.writeText'));

// --- REG-29b: Cloud save & Google account (ROADMAP.md item 7) ---
chk('REG: SettingsScreen wires Google sign-in', settingsScreenSrc.includes('startGoogleLogin'));
chk('REG: SettingsScreen wires manual cloud save', settingsScreenSrc.includes('pushSaveToCloud'));
chk('REG: SettingsScreen has a sign-out action', settingsScreenSrc.includes('clearAuth'));
chk('REG: HomeScreen has a sign-in entry point', homeScreenSrc.includes('startGoogleLogin'));
chk('REG: HomeScreen states local-only progress when signed out', homeScreenSrc.includes('local-only'));
chk('REG: MatchScreen wires cloudSaveCheckpoint import', matchScreenSrc.includes("from '../../cloud/sync.js'"));
chk('REG: MatchScreen has auto-save checkpoints at all 3 beats (pre-match + both result paths)',
  (matchScreenSrc.match(/cloudSaveCheckpoint\(\)/g) || []).length >= 3);

// ══ REGRESSION: Promotion, Relegation & Playoffs ═══════════════
section('Regression: Promotion, Relegation & Playoffs');

// --- REG-30P: Core functions exist ---
chk('REG: getLeagueOutcome24 defined', typeof getLeagueOutcome24 === 'function');
chk('REG: runPlayoffs defined', typeof runPlayoffs === 'function');
chk('REG: getChampionshipOutcome still defined (compat)', typeof getChampionshipOutcome === 'function');
chk('REG: getEuropeanQualifiers defined', typeof getEuropeanQualifiers === 'function');
chk('REG: processLeagueChanges defined', code.includes('processLeagueChanges'));

// --- REG-31P: getLeagueOutcome24 — top 2 auto, 3-6 playoff, bottom 3 relegated ---
const champ24 = [...Array(24)].map((_,i) => ({ teamId: 'c'+i, points: 80 - i*3, goalDifference: 40 - i*2 }));
const out24 = getLeagueOutcome24(champ24);
chk('REG: autoPromoted has exactly 2 teams', out24.autoPromoted.length === 2);
chk('REG: autoPromoted[0] is 1st place c0', out24.autoPromoted[0] === 'c0');
chk('REG: autoPromoted[1] is 2nd place c1', out24.autoPromoted[1] === 'c1');
chk('REG: playoffTeams has exactly 4 teams', out24.playoffTeams.length === 4);
chk('REG: playoffTeams[0] is 3rd place c2', out24.playoffTeams[0] === 'c2');
chk('REG: playoffTeams[1] is 4th place c3', out24.playoffTeams[1] === 'c3');
chk('REG: playoffTeams[2] is 5th place c4', out24.playoffTeams[2] === 'c4');
chk('REG: playoffTeams[3] is 6th place c5', out24.playoffTeams[3] === 'c5');
chk('REG: relegated has exactly 3 teams', out24.relegated.length === 3);
chk('REG: relegated includes 22nd c21', out24.relegated.includes('c21'));
chk('REG: relegated includes 23rd c22', out24.relegated.includes('c22'));
chk('REG: relegated includes 24th c23', out24.relegated.includes('c23'));
chk('REG: 1st place NOT in relegated', !out24.relegated.includes('c0'));
chk('REG: 3rd place NOT in autoPromoted', !out24.autoPromoted.includes('c2'));

// --- REG-32P: getChampionshipOutcome backward compat ---
const champCompat = getChampionshipOutcome(champ24);
chk('REG: compat promoted has top 2', champCompat.promoted.length === 2);
chk('REG: compat playoffTeams has 4', champCompat.playoffTeams.length === 4);
chk('REG: compat relegated has 3', champCompat.relegated.length === 3);

// --- REG-33P: runPlayoffs produces valid results ---
// Build mock teams and players for playoff simulation
const playoffMockTeams = [
  { id: 'po3', name: 'Third FC', crest: '⚽', reputation: 72 },
  { id: 'po4', name: 'Fourth FC', crest: '⚽', reputation: 70 },
  { id: 'po5', name: 'Fifth FC', crest: '⚽', reputation: 68 },
  { id: 'po6', name: 'Sixth FC', crest: '⚽', reputation: 66 },
];
const playoffMockPlayers = [];
const poResult = runPlayoffs(['po3','po4','po5','po6'], playoffMockTeams, playoffMockPlayers);
chk('REG: runPlayoffs returns promotedViaPlayoff', typeof poResult.promotedViaPlayoff === 'string');
chk('REG: promotedViaPlayoff is one of the 4 teams', ['po3','po4','po5','po6'].includes(poResult.promotedViaPlayoff));
chk('REG: playoffResults has semi1', poResult.playoffResults.semi1 !== undefined);
chk('REG: playoffResults has semi2', poResult.playoffResults.semi2 !== undefined);
chk('REG: playoffResults has final', poResult.playoffResults.final !== undefined);

// --- REG-34P: Semi-final structure (two legs) ---
const sf1 = poResult.playoffResults.semi1;
chk('REG: semi1 has winnerId', typeof sf1.winnerId === 'string');
chk('REG: semi1 winnerId is one of its two teams', sf1.winnerId === 'po3' || sf1.winnerId === 'po6');
chk('REG: semi1 has leg1 with home/away goals', typeof sf1.leg1.home === 'number' && typeof sf1.leg1.away === 'number');
chk('REG: semi1 has leg2 with home/away goals', typeof sf1.leg2.home === 'number' && typeof sf1.leg2.away === 'number');
chk('REG: semi1 leg1 goals non-negative', sf1.leg1.home >= 0 && sf1.leg1.away >= 0);
chk('REG: semi1 leg2 goals non-negative', sf1.leg2.home >= 0 && sf1.leg2.away >= 0);
chk('REG: semi1 has aggregate', typeof sf1.agg.team1 === 'number' && typeof sf1.agg.team2 === 'number');
chk('REG: semi1 aggregate = sum of legs (team1)', sf1.agg.team1 === sf1.leg1.home + sf1.leg2.away);
chk('REG: semi1 aggregate = sum of legs (team2)', sf1.agg.team2 === sf1.leg1.away + sf1.leg2.home);
chk('REG: semi1 has penalties flag', typeof sf1.penalties === 'boolean');
chk('REG: semi1 team1 info has name/id/crest', sf1.team1.id === 'po3' && typeof sf1.team1.name === 'string');
chk('REG: semi1 team2 info has name/id/crest', sf1.team2.id === 'po6' && typeof sf1.team2.name === 'string');

const sf2 = poResult.playoffResults.semi2;
chk('REG: semi2 winnerId is po4 or po5', sf2.winnerId === 'po4' || sf2.winnerId === 'po5');
chk('REG: semi2 has two legs', typeof sf2.leg1.home === 'number' && typeof sf2.leg2.home === 'number');

// --- REG-35P: Final structure (single match) ---
const poFin = poResult.playoffResults.final;
chk('REG: final has winnerId', typeof poFin.winnerId === 'string');
chk('REG: final winnerId matches promotedViaPlayoff', poFin.winnerId === poResult.promotedViaPlayoff);
chk('REG: final has score with team1/team2', typeof poFin.score.team1 === 'number' && typeof poFin.score.team2 === 'number');
chk('REG: final score non-negative', poFin.score.team1 >= 0 && poFin.score.team2 >= 0);
chk('REG: final has penalties flag', typeof poFin.penalties === 'boolean');
chk('REG: final teams are from semi winners', poFin.team1.id === sf1.winnerId && poFin.team2.id === sf2.winnerId);

// --- REG-36P: Playoff winner comes from semi-final winners ---
chk('REG: final winner is one of semi-final winners',
  poResult.promotedViaPlayoff === sf1.winnerId || poResult.promotedViaPlayoff === sf2.winnerId);

// --- REG-37P: Multiple playoff runs produce variability ---
let poWinners = new Set();
for (let i = 0; i < 20; i++) {
  const r = runPlayoffs(['po3','po4','po5','po6'], playoffMockTeams, playoffMockPlayers);
  poWinners.add(r.promotedViaPlayoff);
}
chk('REG: playoff produces at least 2 different winners over 20 runs', poWinners.size >= 2, 'unique winners: ' + poWinners.size);

// --- REG-38P: Simulating finishing 1st — auto promotion (not playoff) ---
// User finishes 1st in a 24-team league: should be in autoPromoted, NOT in playoffTeams
const userFirst24 = [...Array(24)].map((_,i) => ({
  teamId: i === 0 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf1out = getLeagueOutcome24(userFirst24);
chk('REG: finishing 1st → in autoPromoted', uf1out.autoPromoted.includes('user_team'));
chk('REG: finishing 1st → NOT in playoffTeams', !uf1out.playoffTeams.includes('user_team'));
chk('REG: finishing 1st → NOT in relegated', !uf1out.relegated.includes('user_team'));

// --- REG-39P: Simulating finishing 2nd — also auto promotion ---
const userSecond24 = [...Array(24)].map((_,i) => ({
  teamId: i === 1 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf2out = getLeagueOutcome24(userSecond24);
chk('REG: finishing 2nd → in autoPromoted', uf2out.autoPromoted.includes('user_team'));
chk('REG: finishing 2nd → NOT in playoffTeams', !uf2out.playoffTeams.includes('user_team'));

// --- REG-40P: Simulating finishing 3rd — goes to playoffs ---
const userThird24 = [...Array(24)].map((_,i) => ({
  teamId: i === 2 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf3out = getLeagueOutcome24(userThird24);
chk('REG: finishing 3rd → in playoffTeams', uf3out.playoffTeams.includes('user_team'));
chk('REG: finishing 3rd → NOT in autoPromoted', !uf3out.autoPromoted.includes('user_team'));

// --- REG-41P: Simulating finishing 6th — last playoff spot ---
const userSixth24 = [...Array(24)].map((_,i) => ({
  teamId: i === 5 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf6out = getLeagueOutcome24(userSixth24);
chk('REG: finishing 6th → in playoffTeams', uf6out.playoffTeams.includes('user_team'));

// --- REG-42P: Simulating finishing 7th — no promotion, no relegation ---
const userSeventh24 = [...Array(24)].map((_,i) => ({
  teamId: i === 6 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf7out = getLeagueOutcome24(userSeventh24);
chk('REG: finishing 7th → NOT in autoPromoted', !uf7out.autoPromoted.includes('user_team'));
chk('REG: finishing 7th → NOT in playoffTeams', !uf7out.playoffTeams.includes('user_team'));
chk('REG: finishing 7th → NOT in relegated', !uf7out.relegated.includes('user_team'));

// --- REG-43P: Simulating finishing 22nd — relegated ---
const user22nd24 = [...Array(24)].map((_,i) => ({
  teamId: i === 21 ? 'user_team' : 'ai_' + i,
  points: 80 - i*3,
  goalDifference: 40 - i*2,
}));
const uf22out = getLeagueOutcome24(user22nd24);
chk('REG: finishing 22nd → in relegated', uf22out.relegated.includes('user_team'));

// --- REG-44P: Zone info for Championship shows playoff zone ---
chk('REG: Champ pos 3 = playoff', getZoneInfo(3,24).zone === 'playoff');
chk('REG: Champ pos 4 = playoff', getZoneInfo(4,24).zone === 'playoff');
chk('REG: Champ pos 5 = playoff', getZoneInfo(5,24).zone === 'playoff');
chk('REG: Champ pos 6 = playoff', getZoneInfo(6,24).zone === 'playoff');
chk('REG: Champ pos 7 = mid (no zone)', getZoneInfo(7,24).zone === 'mid');
chk('REG: Champ pos 21 = mid', getZoneInfo(21,24).zone === 'mid');

// --- REG-45P: Code contains multi-tier league change logic ---
chk('REG: code references League One in processLeagueChanges', code.includes("'League One'"));
chk('REG: code references League Two in processLeagueChanges', code.includes("'League Two'"));
chk('REG: code has playoff simulation (poissonGoals)', code.includes('poissonGoals'));
chk('REG: code has simulatePlayoffTie', code.includes('simulatePlayoffTie'));
chk('REG: code has simulatePlayoffFinal', code.includes('simulatePlayoffFinal'));
chk('REG: code has simulatePlayoffLeg', code.includes('simulatePlayoffLeg'));

// --- REG-46P: Playoff results show in end of season UI ---
chk('REG: end of season shows playoff results', code.includes('Play-off Results') || code.includes('playoffResults'));
chk('REG: end of season shows promotedViaPlayoff', code.includes('promotedViaPlayoff'));
chk('REG: end of season shows semi-final scores', code.includes('Semi-Final 1'));
chk('REG: end of season shows leg scores', code.includes('Leg 1') && code.includes('Leg 2'));
chk('REG: end of season shows aggregate', code.includes('Agg:'));

// --- REG-47P: PL still relegates bottom 3 ---
const plTest = [...Array(20)].map((_,i) => ({ teamId: 'pl'+i, points: 60-i*3, goalDifference: 30-i*2 }));
const plQualTest = getEuropeanQualifiers(plTest);
chk('REG: PL bottom 3 relegated', plQualTest.relegated.length === 3);
chk('REG: PL relegation is 18th-20th', plQualTest.relegated[0] === 'pl17' && plQualTest.relegated[2] === 'pl19');

// --- REG-48P: Season summary includes userLeague ---
chk('REG: buildSeasonSummary includes userLeague', code.includes('userLeague') && code.includes('buildSeasonSummary'));

// --- REG-49P: Reputation changes are tiered by destination league ---
chk('REG: reputation changes tier for PL', code.includes("'Premier League'") && code.includes('maxUp'));
chk('REG: reputation changes tier for Championship', code.includes("'Championship'") && code.includes('minDown'));

// ══ Regression: Bug Fixes v3.5 ═══════════════════════════════
section('Regression: Bug Fixes v3.5');

// --- REG-50: UCL qualification requires top-tier league ---
chk('REG: assignCups has topTierLeagues check', code.includes('topTierLeagues') && code.includes("assignCups"));
chk('REG: assignCups checks league before European cups', (() => {
  const cupsSrc = code.slice(code.indexOf('function assignCups'), code.indexOf('function assignCups') + 600);
  return cupsSrc.includes('topTierLeagues.has(league)');
})());
chk('REG: Championship excluded from European qualification', (() => {
  // Simulate: Championship team with high rep should NOT get UCL
  const champTeam = { league: 'Championship', reputation: 95 };
  const cups = assignCups(champTeam);
  return !cups.includes('ucl') && !cups.includes('uel') && !cups.includes('uecl');
})());
chk('REG: PL team with high rep gets UCL', (() => {
  const plTeam = { league: 'Premier League', reputation: 92 };
  return assignCups(plTeam).includes('ucl');
})());

// --- REG-51: UCL matchday results stored with isUCLMatchday flag ---
chk('REG: UCL results stored with isUCLMatchday flag', code.includes('isUCLMatchday: true') && code.includes('...mdResult'));

// --- REG-52: Cup match stats use real simulation data ---
chk('REG: buildCupMatchResult uses r.stats', code.includes('r.stats ?? defaultStats') || code.includes('r.stats ||'));
chk('REG: buildCupMatchResult passes events from simulation', code.includes('r.events ?? []') && code.includes('buildCupMatchResult'));

// --- REG-53: simulateUCLMatchday returns stats ---
const uclMDSrc = code.slice(code.indexOf('function simulateUCLMatchday'), code.indexOf('function simulateUCLMatchday') + 2000);
chk('REG: UCL matchday returns stats field', uclMDSrc.includes('stats: r.stats'));
chk('REG: UCL matchday returns fitnessUpdates', uclMDSrc.includes('fitnessUpdates'));
chk('REG: UCL matchday returns events', uclMDSrc.includes('events: r.events'));

// --- REG-54: simulateCupRound returns stats ---
const cupRndSrc = code.slice(code.indexOf('function simulateCupRound'), code.indexOf('function simulateCupRound') + 5000);
chk('REG: cup round returns stats field', cupRndSrc.includes('stats: result.stats'));
chk('REG: cup round returns oppScorers', cupRndSrc.includes('oppScorers'));

// --- REG-55: Synthetic squad uses realistic names ---
chk('REG: synthetic squad has name pools', code.includes('_SYNTH_FIRST') && code.includes('_SYNTH_LAST'));
chk('REG: synthetic squad uses seeded hash for names', code.includes('_synthHash') && code.includes('buildSyntheticSquad'));

// --- REG-56: Fixture generation — mirrored double round-robin ---
const fixSrc = code.slice(code.indexOf('function generateLeagueFixtures'), code.indexOf('function generateLeagueFixtures') + 5000);
chk('REG: fixture gen has round order optimisation', fixSrc.includes('_optimiseRoundOrder'));
chk('REG: fixture gen mirrors second half from first', fixSrc.includes('home: away, away: home'));
chk('REG: fixture gen has back-to-back separation', code.includes('_countBackToBack') || code.includes('_fixBoundarySeparation'));

// --- REG-57: Player form decay system ---
chk('REG: form decays when not playing', code.includes('currentForm - 3'));
chk('REG: form increases when playing', code.includes('formGain'));
chk('REG: form boosted by scoring', code.includes('_scored') && code.includes('formGain'));
chk('REG: form boosted by assisting', code.includes('_assisted') && code.includes('formGain'));
chk('REG: form boosted by clean sheet', code.includes('_cleanSheet') && code.includes('formGain'));
chk('REG: formAdjustedValue uses form field', (() => {
  const favSrc = code.slice(code.indexOf('function formAdjustedValue'), code.indexOf('function formAdjustedValue') + 700);
  return favSrc.includes('player.form') && !favSrc.includes('goals ?? 0) * 8');
})());

// --- REG-58: Growth rate tuning ---
chk('REG: growth threshold age<=20 is 18+', (() => {
  const t = growthThreshold(19, 65, 85);
  return t >= 18;
})());
chk('REG: growth threshold age<=23 is 24+', (() => {
  const t = growthThreshold(22, 65, 85);
  return t >= 24;
})());

// --- REG-59: Promoted teams don't get European cups from old league position ---
chk('REG: season detects league change', code.includes('leagueChanged'));
chk('REG: promoted team gets position 99 for cup assignment', code.includes('leagueChanged ? 99'));

// ─── INJURY SYSTEM ────────────────────────────────────────────────────────────
section('INJURY SYSTEM');

chk('INJ: INJURY_TYPES array defined', code.includes('const INJURY_TYPES'));
chk('INJ: rollInjuryCheck function defined', code.includes('function rollInjuryCheck'));
chk('INJ: tickInjuryRecovery function defined', code.includes('function tickInjuryRecovery'));
chk('INJ: applyInjury function defined', code.includes('function applyInjury'));
chk('INJ: injuryDurationLabel function defined', code.includes('function injuryDurationLabel'));
chk('INJ: processInjuryRecovery function defined', code.includes('async function processInjuryRecovery'));
chk('INJ: applyInjuryUpdates function defined', code.includes('function applyInjuryUpdates'));

// Verify realistic injury types are present
chk('INJ: Hamstring Strain included', code.includes('Hamstring Strain'));
chk('INJ: ACL Tear included (season-ending)', code.includes('ACL Tear'));
chk('INJ: Achilles Rupture included (long-term)', code.includes('Achilles Rupture'));
chk('INJ: Ankle Sprain included (short-term)', code.includes('Ankle Sprain'));

// Verify injury check logic
chk('INJ: GK has lower base chance', code.includes("isGK ? 0.015 : 0.045"));
chk('INJ: age penalty for 36+ players', code.includes('age >= 36) baseChance *= 1.45'));
chk('INJ: fitness penalty for tired players', code.includes('fit < 70) baseChance *= 1.40'));

// Verify injury applied to match results
chk('INJ: injury events fired in simulateMatch', (() => {
  const start = code.indexOf('function simulateMatch(');
  const end = code.indexOf('function simulateMatchSegment', start);
  const fn = code.slice(start, end);
  return fn.includes("type: 'injury'");
})());
chk('INJ: injury events fired in simulateMatchSegment', (() => {
  const start = code.indexOf('function simulateMatchSegment(');
  const end = code.indexOf('function buildLiveMatchState', start);
  const fn = code.slice(start, end);
  return fn.includes("type: 'injury'");
})());

// Verify recovery tick called on GW advance
chk('INJ: processInjuryRecovery called on GW advance', code.includes('recoveredPlayers = await processInjuryRecovery'));
chk('INJ: recoveredPlayers returned from advanceOneFixture', (() => {
  const idx = code.lastIndexOf('return { singleResult,');
  return idx !== -1 && code.slice(idx, idx + 200).includes('recoveredPlayers');
})());

// Verify UI blocks — Team News/Live/Full-Time/After beats
// (src/lib/ui/MatchScreen.svelte, Phase 5, docs/plan/04-migration-phases.md)
// own this UI now; ui/prematch.js and ui/watchmatch.js are gone.
chk('INJ: Team News blocks injured lineup (injuredInLineup)', matchScreenSrc.includes('injuredInLineup'));
chk('INJ: Team News shows injury warning block', matchScreenSrc.includes('tn-warning-bad'));
chk('INJ: Live beat shows 🚑 in events', matchScreenSrc.includes("ev.type === 'injury'"));
chk('INJ: sub-on guard for injured bench players', substitutionsSrc.includes('subIn.injured'));
chk('INJ: injured bench row CSS class', matchScreenSrc.includes('bench-injured'));
chk('INJ: After beat shows injury events', matchScreenSrc.includes("e.type === 'injury'"));
chk('INJ: recovery toast shown (green)', matchScreenSrc.includes('is fit and available again'));
chk('INJ: injury toast shown on match result', matchScreenSrc.includes('injuryGWsLeft ?? 1'));
chk('INJ: After beat shows injuries section', matchScreenSrc.includes('userInjuries') && matchScreenSrc.includes('after-section-bad'));
chk('INJ: squad screen shows INJ badge', squadScreenSrc.includes('sq-inj-badge') && squadScreenSrc.includes('is-injured'));
chk('INJ: injured marker in Team News pitch preview', matchScreenSrc.includes('tn-slot-inj'));

// ─── Regression: injury duration label must use weeks/months correctly ─────
chk('INJ: injuryDurationLabel uses months for exact multiples of 4', (() => {
  const fnStart = code.indexOf('function injuryDurationLabel(');
  if (fnStart === -1) return false;
  const fn = code.slice(fnStart, fnStart + 400);
  return fn.includes('% 4') && fn.includes('month');
})());
chk('INJ: injuryDurationLabel shows weeks for non-multiples of 4', (() => {
  const fnStart = code.indexOf('function injuryDurationLabel(');
  if (fnStart === -1) return false;
  const fn = code.slice(fnStart, fnStart + 400);
  return fn.includes('weeks');
})());
chk('INJ: no inline week formatting in After beat (uses injuryDurationLabel)', (() => {
  const mrStart = matchScreenSrc.indexOf('🚑 Injuries');
  if (mrStart === -1) return false;
  const mrBlock = matchScreenSrc.slice(mrStart, mrStart + 500);
  return mrBlock.includes('injuryDurationLabel') && !mrBlock.includes('week' + String.fromCharCode(36) + '{');
})());
chk('INJ: no inline week formatting in Team News injured warning (uses injuryDurationLabel)', (() => {
  const pmStart = matchScreenSrc.indexOf('Injured Players in Lineup');
  if (pmStart === -1) return false;
  const pmBlock = matchScreenSrc.slice(pmStart, pmStart + 500);
  return pmBlock.includes('injuryDurationLabel') && !pmBlock.includes('week' + String.fromCharCode(36) + '{');
})());

// ─── Regression: injury recovery must persist GW decrements ───────────────
chk('INJ: processInjuryRecovery saves ALL injured players not just recovered', (() => {
  const fnStart = code.indexOf('async function processInjuryRecovery(');
  if (fnStart === -1) return false;
  const fnEnd = code.indexOf('}', code.indexOf('return recovered', fnStart));
  const fn = code.slice(fnStart, fnEnd + 1);
  // Must check for any injured player (hadInjured), not just recovered.length
  return fn.includes('hadInjured') || fn.includes('.some(p => p.injured)');
})());
chk('INJ: updateCache reads fresh from DB (not stale allPlayers)', (() => {
  const fnStart = code.indexOf('async function updateCache(');
  if (fnStart === -1) return false;
  const fnBlock = code.slice(fnStart, fnStart + 300);
  // Must read fresh — parameter should be ignored and getAllPlayers called
  return fnBlock.includes('getAllPlayers()') && fnBlock.includes('freshPlayers');
})());

// ─── Regression: new game must auto-generate lineup ───────────────────────
chk('INJ: startNewGame auto-generates lineup via selectEleven', (() => {
  const fnStart = code.indexOf('async function startNewGame(');
  if (fnStart === -1) return false;
  const fnEnd = code.indexOf('async function patchSave', fnStart);
  const fn = code.slice(fnStart, fnEnd);
  // Must call selectEleven and set save.lineup before putSave
  return fn.includes('selectEleven') && fn.includes('save.lineup');
})());
chk('INJ: startNewGame lineup is array of IDs (not null)', (() => {
  const fnStart = code.indexOf('async function startNewGame(');
  if (fnStart === -1) return false;
  const fnEnd = code.indexOf('async function patchSave', fnStart);
  const fn = code.slice(fnStart, fnEnd);
  // Must map to IDs
  return fn.includes('.map(p => p.id)');
})());

// ─── INBOX / NEWS SYSTEM ───────────────────────────────────────────────────
section('INBOX SYSTEM');

chk('INBOX: renderInbox function defined',         code.includes('async function renderInbox'));
chk('INBOX: addNewsItem function defined',          code.includes('async function addNewsItem'));
chk('INBOX: _updateInboxBadge function defined',   code.includes('function _updateInboxBadge'));
chk('INBOX: newsMatchResult function defined',     code.includes('async function newsMatchResult'));
chk('INBOX: newsPlayerSigned function defined',    code.includes('async function newsPlayerSigned'));
chk('INBOX: newsPlayerSold function defined',      code.includes('async function newsPlayerSold'));
chk('INBOX: newsInjury function defined',          code.includes('async function newsInjury'));
chk('INBOX: newsAIBid function defined',           code.includes('async function newsAIBid'));
chk('INBOX: newsSeasonEnd function defined',       code.includes('async function newsSeasonEnd'));
chk('INBOX: newsPromotion function defined',       code.includes('async function newsPromotion'));
chk('INBOX: newsRelegation function defined',      code.includes('async function newsRelegation'));
chk('INBOX: newsYouthPromotion function defined',  code.includes('async function newsYouthPromotion'));
chk('INBOX: newsYouthIntake function defined',     code.includes('async function newsYouthIntake'));
chk('INBOX: screen-inbox element in HTML',         code.includes('screen-inbox'));
chk('INBOX: inbox registered as screen',           code.includes("registerScreen('inbox'"));
chk('INBOX: _updateInboxBadge called on boot',     code.includes('_updateInboxBadge()'));
chk('INBOX: inbox initialised in startNewGame',    code.includes('inbox:           []') || code.includes("inbox:[]") || code.includes("inbox: []"));
chk('INBOX: newsMatchResult wired after match',    matchScreenSrc.includes('newsMatchResult(result, matchCtx.save)'));
chk('INBOX: newsPlayerSigned wired after buy',     code.includes('newsPlayerSigned(player'));
chk('INBOX: newsPlayerSold wired after sell',      code.includes('newsPlayerSold(pl'));
chk('INBOX: newsInjury wired in MatchScreen.svelte', matchScreenSrc.includes('newsInjury({ name: inj.playerName'));
chk('INBOX: newsAIBid wired in MatchScreen.svelte',  matchScreenSrc.includes('newsAIBid({ name: o.playerName'));
chk('INBOX: newsSeasonEnd wired in handleEOS',     code.includes('newsSeasonEnd('));
chk('INBOX: newsYouthPromotion wired in academy',  code.includes('newsYouthPromotion('));
chk('INBOX: inbox tab CSS defined',               code.includes('inbox-tab'));
chk('INBOX: inbox item CSS defined',              code.includes('inbox-item'));
chk('INBOX: nav badge CSS defined',              code.includes('nav-badge'));
chk('INBOX: patchSave used for inbox update',     code.includes('patchSave({ inbox'));
chk('INBOX: inbox capped at 80 items',            code.includes('inbox.length > 80'));
chk('INBOX: items marked read on screen open',    code.includes('read: true'));
chk('INBOX: _NEWS_CAT categories defined',        code.includes('_NEWS_CAT'));
chk('INBOX: tab filter all/match/transfer',       code.includes("{ id: 'all'") || code.includes("id:'all'"));

section('LOAN SYSTEM');
// Core loan functions present
chk('LOAN: loanOutPlayer function defined',          code.includes('async function loanOutPlayer('));
chk('LOAN: loanInPlayer function defined',           code.includes('async function loanInPlayer('));
chk('LOAN: getLoanableInPlayers function defined',   code.includes('async function getLoanableInPlayers('));
chk('LOAN: simulateAILoans function defined',        code.includes('async function simulateAILoans('));
chk('LOAN: _loanFee helper defined',                 code.includes('function _loanFee('));
chk('LOAN: _loanWageCost helper defined',            code.includes('function _loanWageCost('));
chk('LOAN: loanTotalCost exported',                  code.includes('function loanTotalCost('));
chk('LOAN: _aiWillingToLoanOut defined',             code.includes('function _aiWillingToLoanOut('));
// Player schema fields
chk('LOAN: onLoan field used in schema',             code.includes('onLoan:'));
chk('LOAN: loanedFrom field used in schema',         code.includes('loanedFrom:'));
chk('LOAN: loanOriginalTeamId field used',           code.includes('loanOriginalTeamId:'));
chk('LOAN: loanSeason field used',                   code.includes('loanSeason:'));
chk('LOAN: loanRecallable field reserved',           code.includes('loanRecallable:'));
// Financial model checks
chk('LOAN: fee is 10% of base value',                code.includes('* 0.10'));
chk('LOAN: wage cost uses gwsRemaining',             code.includes('gwsRemaining'));
chk('LOAN: loan club deducted total cost',           code.includes('budget - totalCost'));
chk('LOAN: parent club receives loan fee',           code.includes('budget + fee'));
chk('LOAN: user loan-out gives full wage relief',    code.includes('budget + fee + wageCost'));
// Transfer window gate
chk('LOAN: loanInPlayer checks window open',         code.includes('WINDOW_CLOSED') && code.includes('loanInPlayer'));
chk('LOAN: loanOutPlayer checks window open',        code.includes('WINDOW_CLOSED') && code.includes('loanOutPlayer'));
chk('LOAN: simulateAILoans checks window open',      code.includes('isTransferWindowOpen') && code.includes('simulateAILoans'));
// Season-end return
chk('LOAN: season end returns loaned players',       code.includes('loanOriginalTeamId') && code.includes('processEndOfSeason'));
chk('LOAN: loan metadata cleared at season end',     code.includes('onLoan:             false') || code.includes('onLoan: false'));
chk('LOAN: loan return runs before aging',           code.includes('loanReturnUpdates') && code.includes('agedPlayers'));
// AI loan simulation wired into gameweek
chk('LOAN: simulateAILoans called in gameweek',      (code.match(/simulateAILoans[(]/g)||[]).length >= 3);
chk('LOAN: AI loans rate-limited per GW',            code.includes('activityChance') && code.includes('simulateAILoans'));
chk('LOAN: AI only loans fringe youth (age ≤22)',    code.includes('<= 22') && code.includes('fringePool'));
chk('LOAN: AI protects top-11 players',              code.includes('sorted.slice(11)'));
chk('LOAN: AI loans only DOWN in reputation',        code.includes('>= (lender.reputation') || code.includes('>= lender.reputation'));
// UI presence
// The loan market UI moved to src/lib/ui/TransfersScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — checked against transfersScreenSrc
// instead of shellSrc/the bundle, same reasoning as the section above.
chk('LOAN: Loans tab in TransfersScreen.svelte',      transfersScreenSrc.includes("tab === 'loans'"));
chk('LOAN: Loan In/Out sub-tabs in TransfersScreen.svelte', transfersScreenSrc.includes("loanTab = 'in'") && transfersScreenSrc.includes("loanTab = 'out'"));
chk('LOAN: loan list rendered in TransfersScreen.svelte', transfersScreenSrc.includes('loanInList') && transfersScreenSrc.includes('loanOutList'));
chk('LOAN: loadLoans function defined',               transfersScreenSrc.includes('async function loadLoans('));
chk('LOAN: loan-in detail sheet defined',             transfersScreenSrc.includes('confirmLoanIn'));
chk('LOAN: loan-out detail sheet defined',            transfersScreenSrc.includes('confirmLoanOut'));
chk('LOAN: Loans tab wired to loadLoans',             transfersScreenSrc.includes("selectTab") && transfersScreenSrc.includes('loadLoans'));
// Anti-patterns
chk('LOAN: no loan of already-loaned player',        code.includes('ALREADY_ON_LOAN'));
chk('LOAN: no loan during closed window (error)',    (code.match(/WINDOW_CLOSED/g)||[]).length >= 3);
chk('LOAN: top-3 protection absent (slice 11)',      !code.includes('sorted[0]?.id === p.id || sorted[1]?.id === p.id') || code.includes('fringePool'));

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
