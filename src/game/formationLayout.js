/**
 * src/game/formationLayout.js — Pitch-slot x/y coordinates (% of pitch) for
 * every formation in modules/matchEngine.js's FORMATIONS. Layout data, not
 * simulation math, but shared verbatim between SquadScreen.svelte (R4's
 * Chalk lineup editor) and MatchScreen.svelte (Phase 5's Team News beat) — kept
 * in one place so the two pitch views can't drift out of sync.
 */
export const SLOT_LAYOUT = {
  '3-4-3':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:54},{p:'CM',x:62,y:54},{p:'CM',x:38,y:54},{p:'LM',x:15,y:54},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
  '3-5-2':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:88,y:52},{p:'CM',x:67,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:33,y:52},{p:'LM',x:12,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
  '3-4-1-2': [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:56},{p:'CM',x:62,y:56},{p:'CM',x:38,y:56},{p:'LM',x:15,y:56},{p:'CAM',x:50,y:38},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
  '4-3-3':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:73,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:27,y:52},{p:'RW',x:82,y:28},{p:'ST',x:50,y:20},{p:'LW',x:18,y:28}],
  '4-2-3-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:63,y:58},{p:'CDM',x:37,y:58},{p:'RW',x:80,y:38},{p:'CAM',x:50,y:38},{p:'LW',x:20,y:38},{p:'ST',x:50,y:18}],
  '4-4-2':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
  '4-1-2-1-2':[{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'CM',x:70,y:46},{p:'CM',x:30,y:46},{p:'CAM',x:50,y:34},{p:'ST',x:65,y:20},{p:'ST',x:35,y:20}],
  '4-3-2-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:70,y:55},{p:'CDM',x:50,y:58},{p:'CM',x:30,y:55},{p:'RW',x:72,y:35},{p:'LW',x:28,y:35},{p:'ST',x:50,y:20}],
  '4-5-1':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:66,y:52},{p:'CM',x:50,y:52},{p:'CM',x:34,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
  '4-4-1-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'CAM',x:50,y:34},{p:'ST',x:50,y:20}],
  '4-1-4-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'RM',x:82,y:44},{p:'CM',x:63,y:44},{p:'CM',x:37,y:44},{p:'LM',x:18,y:44},{p:'ST',x:50,y:20}],
  '5-3-2':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:68,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:32,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
  '5-4-1':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
  '5-2-3':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
};

export const SLOT_POS_MAP = { GK:['GK'], RB:['RB'], LB:['LB'], CB:['CB'], RM:['RM','CM'], LM:['LM','CM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW'] };
