/**
 * modules/tactics.js — P2 tactical domain contracts.
 *
 * Pure and DOM-free. The match engine, Svelte UI, AI managers and save migration
 * all consume this one schema so instructions/roles cannot drift between paths.
 */

export const P2_TACTICS_VERSION = 1;

export const TEAM_INSTRUCTION_DEFS = Object.freeze([
  { id:'buildUp', label:'Build-up', values:[['patient','Patient'],['balanced','Balanced'],['direct','Direct']] },
  { id:'tempo', label:'Tempo', values:[['slow','Slow'],['balanced','Balanced'],['fast','Fast']] },
  { id:'defensiveLine', label:'Defensive line', values:[['low','Low'],['mid','Mid'],['high','High']] },
  { id:'pressing', label:'Pressing', values:[['passive','Passive'],['standard','Standard'],['aggressive','Aggressive']] },
  { id:'width', label:'Width', values:[['narrow','Narrow'],['balanced','Balanced'],['wide','Wide']] },
  { id:'transition', label:'Transition', values:[['hold_shape','Hold shape'],['balanced','Balanced'],['counter','Counter']] },
  { id:'chanceCreation', label:'Chance creation', values:[['work_ball','Work ball'],['balanced','Balanced'],['early_delivery','Early delivery']] },
  { id:'defensiveApproach', label:'Defensive approach', values:[['compact','Compact'],['balanced','Balanced'],['front_foot','Front-foot']] },
  { id:'setPieces', label:'Set pieces', values:[['secure','Secure'],['balanced','Balanced'],['attack','Attack']] },
]);

export const DEFAULT_TEAM_INSTRUCTIONS = Object.freeze({
  buildUp:'balanced', tempo:'balanced', defensiveLine:'mid', pressing:'standard', width:'balanced',
  transition:'balanced', chanceCreation:'balanced', defensiveApproach:'balanced', setPieces:'balanced',
});

const INSTRUCTION_VALUES = new Map(TEAM_INSTRUCTION_DEFS.map(def => [def.id, new Set(def.values.map(([id]) => id))]));

export function normalizeTeamInstructions(input = {}) {
  const out = { ...DEFAULT_TEAM_INSTRUCTIONS };
  for (const [key, allowed] of INSTRUCTION_VALUES) {
    if (allowed.has(input?.[key])) out[key] = input[key];
  }
  return out;
}

export function createUserTacticalPlan(input = {}) {
  const instructions = normalizeTeamInstructions(input?.instructions ?? input);
  return { version:P2_TACTICS_VERSION, source:'user', instructions };
}

export function normalizeTacticalPlan(plan, source = 'user') {
  return {
    version:P2_TACTICS_VERSION,
    source:plan?.source === 'ai' ? 'ai' : source,
    instructions:normalizeTeamInstructions(plan?.instructions ?? plan),
  };
}

export function isUserTacticalPlan(team) {
  return team?.tacticalPlan?.source === 'user';
}

export const PLAYER_ROLE_DEFS = Object.freeze([
  { id:'goalkeeper', label:'Goalkeeper', short:'GK', positions:['GK'], attrs:{ goalkeeping:1 }, tags:['secure'] },
  { id:'sweeper_keeper', label:'Sweeper keeper', short:'SK', positions:['GK'], attrs:{ goalkeeping:.72, midfield:.28 }, tags:['high_line','patient'] },

  { id:'ball_playing_cb', label:'Ball-playing CB', short:'BPD', positions:['CB'], attrs:{ defence:.62, midfield:.38 }, tags:['patient','direct'] },
  { id:'stopper', label:'Stopper', short:'STP', positions:['CB'], attrs:{ defence:.88, midfield:.12 }, tags:['front_foot','press'] },
  { id:'cover', label:'Cover', short:'COV', positions:['CB'], attrs:{ defence:.82, midfield:.18 }, tags:['high_line','secure'] },

  { id:'full_back', label:'Full-back', short:'FB', positions:['RB','LB'], attrs:{ defence:.64, midfield:.24, attack:.12 }, tags:['balanced'] },
  { id:'overlap', label:'Overlap', short:'OVR', positions:['RB','LB'], attrs:{ defence:.38, midfield:.28, attack:.34 }, tags:['wide','early_delivery'] },
  { id:'inverted_full_back', label:'Inverted full-back', short:'IFB', positions:['RB','LB'], attrs:{ defence:.42, midfield:.46, attack:.12 }, tags:['patient','narrow'] },

  { id:'anchor', label:'Anchor', short:'ANC', positions:['CDM','CM'], attrs:{ defence:.62, midfield:.38 }, tags:['compact','hold_shape'] },
  { id:'ball_winner', label:'Ball winner', short:'BWM', positions:['CDM','CM'], attrs:{ defence:.48, midfield:.52 }, tags:['press','front_foot'] },
  { id:'deep_playmaker', label:'Deep playmaker', short:'DLP', positions:['CDM','CM'], attrs:{ defence:.18, midfield:.72, attack:.10 }, tags:['patient','work_ball'] },
  { id:'box_to_box', label:'Box-to-box', short:'B2B', positions:['CM','CDM'], attrs:{ defence:.28, midfield:.48, attack:.24 }, tags:['fast','press'] },
  { id:'advanced_playmaker', label:'Advanced playmaker', short:'AP', positions:['CAM','CM'], attrs:{ midfield:.58, attack:.42 }, tags:['patient','work_ball'] },

  { id:'wide_creator', label:'Wide creator', short:'WC', positions:['RW','LW','RM','LM','CAM'], attrs:{ midfield:.48, attack:.52 }, tags:['wide','early_delivery'] },
  { id:'inside_forward', label:'Inside forward', short:'IF', positions:['RW','LW','RM','LM'], attrs:{ midfield:.20, attack:.80 }, tags:['narrow','counter'] },
  { id:'winger', label:'Winger', short:'W', positions:['RW','LW','RM','LM'], attrs:{ midfield:.34, attack:.66 }, tags:['wide','fast'] },

  { id:'poacher', label:'Poacher', short:'P', positions:['ST','CF'], attrs:{ attack:1 }, tags:['counter','direct'] },
  { id:'target_forward', label:'Target forward', short:'TF', positions:['ST','CF'], attrs:{ attack:.78, midfield:.22 }, tags:['direct','early_delivery'] },
  { id:'false_nine', label:'False nine', short:'F9', positions:['ST','CF','CAM'], attrs:{ midfield:.48, attack:.52 }, tags:['patient','work_ball'] },
  { id:'complete_forward', label:'Complete forward', short:'CF', positions:['ST','CF'], attrs:{ midfield:.24, attack:.76 }, tags:['balanced'] },
]);

const ROLE_BY_ID = new Map(PLAYER_ROLE_DEFS.map(role => [role.id, role]));

const DEFAULT_ROLE_BY_POSITION = Object.freeze({
  GK:'goalkeeper', CB:'ball_playing_cb', RB:'full_back', LB:'full_back', CDM:'anchor', CM:'box_to_box',
  CAM:'advanced_playmaker', RM:'wide_creator', LM:'wide_creator', RW:'winger', LW:'winger', ST:'complete_forward', CF:'complete_forward',
});

export function getRoleDefinition(roleId) {
  return ROLE_BY_ID.get(roleId) ?? null;
}

export function getCompatibleRoles(playerOrPosition) {
  const position = typeof playerOrPosition === 'string' ? playerOrPosition : playerOrPosition?.position;
  return PLAYER_ROLE_DEFS.filter(role => role.positions.includes(position));
}

export function defaultRoleForPosition(position) {
  const roleId = DEFAULT_ROLE_BY_POSITION[position];
  return ROLE_BY_ID.get(roleId) ?? getCompatibleRoles(position)[0] ?? null;
}

export function resolvePlayerRole(player, requestedRoleId = player?.tacticalRole) {
  const requested = ROLE_BY_ID.get(requestedRoleId);
  if (requested?.positions.includes(player?.position)) return requested;
  return defaultRoleForPosition(player?.position);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function roleSuitability(player, roleId = player?.tacticalRole) {
  const role = resolvePlayerRole(player, roleId);
  if (!role) return 0.8;
  if (roleId && ROLE_BY_ID.has(roleId) && !ROLE_BY_ID.get(roleId).positions.includes(player?.position)) return 0.72;
  let weighted = 0;
  let total = 0;
  for (const [attr, weight] of Object.entries(role.attrs)) {
    weighted += Number(player?.[attr] ?? 50) * weight;
    total += weight;
  }
  const rating = total > 0 ? weighted / total : 50;
  return clamp(0.78 + (rating / 99) * 0.30, 0.78, 1.08);
}

function tacticTags(instructions) {
  const i = normalizeTeamInstructions(instructions);
  const tags = new Set();
  if (i.buildUp === 'patient') tags.add('patient');
  if (i.buildUp === 'direct') tags.add('direct');
  if (i.tempo === 'fast') tags.add('fast');
  if (i.defensiveLine === 'high') tags.add('high_line');
  if (i.pressing === 'aggressive') tags.add('press');
  if (i.width === 'wide') tags.add('wide');
  if (i.width === 'narrow') tags.add('narrow');
  if (i.transition === 'counter') tags.add('counter');
  if (i.transition === 'hold_shape') tags.add('hold_shape');
  if (i.chanceCreation === 'work_ball') tags.add('work_ball');
  if (i.chanceCreation === 'early_delivery') tags.add('early_delivery');
  if (i.defensiveApproach === 'compact') tags.add('compact');
  if (i.defensiveApproach === 'front_foot') tags.add('front_foot');
  if (i.setPieces === 'secure') tags.add('secure');
  if (!tags.size) tags.add('balanced');
  return tags;
}

export function getRoleTeamModifiers(players, rolesById = {}, instructions = DEFAULT_TEAM_INSTRUCTIONS) {
  if (!players?.length) return { attackMult:1, midfieldMult:1, defenceMult:1, roleScore:1 };
  const tags = tacticTags(instructions);
  let attack = 0, midfield = 0, defence = 0, score = 0;
  for (const player of players) {
    const requested = rolesById?.[player.id] ?? player.tacticalRole;
    const role = resolvePlayerRole(player, requested);
    const suitability = roleSuitability(player, requested);
    const aligned = role?.tags?.some(tag => tags.has(tag)) ? 0.014 : 0;
    const delta = (suitability - 0.93) * 0.24 + aligned;
    const groupAttack = role?.attrs?.attack ?? 0;
    const groupMid = role?.attrs?.midfield ?? 0;
    const groupDef = role?.attrs?.defence ?? 0;
    attack += delta * Math.max(.18, groupAttack);
    midfield += delta * Math.max(.18, groupMid);
    defence += delta * Math.max(.18, groupDef + (role?.attrs?.goalkeeping ?? 0));
    score += suitability + aligned;
  }
  const n = players.length;
  return {
    attackMult:clamp(1 + attack / n, .95, 1.05),
    midfieldMult:clamp(1 + midfield / n, .95, 1.05),
    defenceMult:clamp(1 + defence / n, .95, 1.05),
    roleScore:score / n,
  };
}

export function getTacticalModifiers(selfInput, opponentInput = DEFAULT_TEAM_INSTRUCTIONS) {
  const self = normalizeTeamInstructions(selfInput);
  const opponent = normalizeTeamInstructions(opponentInput);
  const mods = {
    goalProbMult:1, defResistMult:1, midShareBoost:0, shotsMult:1,
    fitnessDrainMult:1, yellowRiskMult:1, injuryRiskMult:1, lateDefResistMult:1,
  };

  if (self.buildUp === 'patient') { mods.midShareBoost += .025; mods.goalProbMult *= .98; }
  if (self.buildUp === 'direct') { mods.midShareBoost -= .020; mods.goalProbMult *= 1.025; mods.shotsMult *= 1.03; }

  if (self.tempo === 'slow') { mods.goalProbMult *= .97; mods.fitnessDrainMult *= .92; }
  if (self.tempo === 'fast') { mods.goalProbMult *= 1.04; mods.fitnessDrainMult *= 1.13; mods.yellowRiskMult *= 1.05; }

  if (self.defensiveLine === 'low') { mods.defResistMult *= 1.045; mods.midShareBoost -= .018; }
  if (self.defensiveLine === 'high') { mods.defResistMult *= 1.018; mods.midShareBoost += .025; mods.lateDefResistMult *= .975; }

  if (self.pressing === 'passive') { mods.midShareBoost -= .018; mods.fitnessDrainMult *= .91; mods.yellowRiskMult *= .88; }
  if (self.pressing === 'aggressive') {
    mods.midShareBoost += .040; mods.goalProbMult *= 1.018; mods.fitnessDrainMult *= 1.18;
    mods.yellowRiskMult *= 1.27; mods.injuryRiskMult *= 1.08; mods.lateDefResistMult *= .94;
  }

  if (self.width === 'narrow') { mods.defResistMult *= 1.025; mods.midShareBoost += .008; }
  if (self.width === 'wide') { mods.shotsMult *= 1.04; mods.midShareBoost -= .005; }

  if (self.transition === 'hold_shape') { mods.defResistMult *= 1.025; mods.goalProbMult *= .985; }
  if (self.transition === 'counter') { mods.goalProbMult *= 1.035; mods.midShareBoost -= .014; }

  if (self.chanceCreation === 'work_ball') { mods.shotsMult *= .90; mods.goalProbMult *= 1.035; mods.midShareBoost += .010; }
  if (self.chanceCreation === 'early_delivery') { mods.shotsMult *= 1.12; mods.goalProbMult *= .985; }

  if (self.defensiveApproach === 'compact') { mods.defResistMult *= 1.055; mods.goalProbMult *= .965; }
  if (self.defensiveApproach === 'front_foot') {
    mods.midShareBoost += .028; mods.goalProbMult *= 1.025; mods.defResistMult *= .965; mods.yellowRiskMult *= 1.12;
  }

  if (self.setPieces === 'secure') { mods.defResistMult *= 1.012; mods.shotsMult *= .985; }
  if (self.setPieces === 'attack') { mods.goalProbMult *= 1.012; mods.shotsMult *= 1.025; mods.defResistMult *= .992; }

  // Match-up causality. Every upside has an explicit cost or counter.
  if (opponent.defensiveLine === 'high' && (self.transition === 'counter' || self.buildUp === 'direct')) {
    mods.goalProbMult *= 1.085;
  }
  if (opponent.pressing === 'aggressive' && self.buildUp === 'direct') {
    mods.goalProbMult *= 1.045;
    mods.midShareBoost -= .010;
  }
  if (opponent.width === 'narrow' && (self.width === 'wide' || self.chanceCreation === 'early_delivery')) {
    mods.goalProbMult *= 1.055;
    mods.shotsMult *= 1.07;
  }
  if (self.defensiveLine === 'high' && (opponent.transition === 'counter' || opponent.buildUp === 'direct')) {
    mods.defResistMult *= .915;
    mods.lateDefResistMult *= .965;
  }
  if (self.width === 'narrow' && (opponent.width === 'wide' || opponent.chanceCreation === 'early_delivery')) {
    mods.defResistMult *= .94;
  }
  if (self.pressing === 'aggressive' && opponent.buildUp === 'patient') mods.midShareBoost += .018;
  if (self.pressing === 'aggressive' && opponent.buildUp === 'direct') mods.defResistMult *= .965;

  mods.goalProbMult = clamp(mods.goalProbMult, .78, 1.25);
  mods.defResistMult = clamp(mods.defResistMult, .78, 1.25);
  mods.midShareBoost = clamp(mods.midShareBoost, -.10, .10);
  mods.shotsMult = clamp(mods.shotsMult, .78, 1.25);
  mods.fitnessDrainMult = clamp(mods.fitnessDrainMult, .82, 1.35);
  mods.yellowRiskMult = clamp(mods.yellowRiskMult, .72, 1.45);
  mods.injuryRiskMult = clamp(mods.injuryRiskMult, .85, 1.22);
  mods.lateDefResistMult = clamp(mods.lateDefResistMult, .85, 1.05);
  return mods;
}

export function stableStringHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const AI_TACTICAL_ARCHETYPES = Object.freeze([
  {
    id:'controller', label:'Possession controller', formation:'4-3-3', mentality:'possession',
    instructions:{ buildUp:'patient', tempo:'balanced', defensiveLine:'high', pressing:'standard', width:'wide', transition:'hold_shape', chanceCreation:'work_ball', defensiveApproach:'front_foot', setPieces:'balanced' },
  },
  {
    id:'vertical_press', label:'Vertical press', formation:'4-2-3-1', mentality:'attacking',
    instructions:{ buildUp:'direct', tempo:'fast', defensiveLine:'high', pressing:'aggressive', width:'balanced', transition:'counter', chanceCreation:'balanced', defensiveApproach:'front_foot', setPieces:'attack' },
  },
  {
    id:'compact_counter', label:'Compact counter', formation:'4-4-2', mentality:'defensive',
    instructions:{ buildUp:'direct', tempo:'fast', defensiveLine:'low', pressing:'passive', width:'narrow', transition:'counter', chanceCreation:'early_delivery', defensiveApproach:'compact', setPieces:'secure' },
  },
  {
    id:'wing_overload', label:'Wide overload', formation:'4-3-3', mentality:'balanced',
    instructions:{ buildUp:'balanced', tempo:'fast', defensiveLine:'mid', pressing:'standard', width:'wide', transition:'balanced', chanceCreation:'early_delivery', defensiveApproach:'balanced', setPieces:'attack' },
  },
  {
    id:'balanced_block', label:'Balanced block', formation:'4-1-4-1', mentality:'balanced',
    instructions:{ ...DEFAULT_TEAM_INSTRUCTIONS },
  },
]);

export function getAITacticalProfile(team, opponent = null, isHome = true) {
  const seed = stableStringHash(`${team?.id ?? team?.name ?? 'team'}:${team?.league ?? ''}`);
  const base = AI_TACTICAL_ARCHETYPES[seed % AI_TACTICAL_ARCHETYPES.length];
  const instructions = normalizeTeamInstructions(base.instructions);
  const teamRep = Number(team?.reputation ?? team?.strength ?? 70);
  const oppRep = Number(opponent?.reputation ?? opponent?.strength ?? teamRep);
  let formation = base.formation;
  let mentality = base.mentality;
  const adapted = { ...instructions };

  if (!isHome && oppRep - teamRep >= 8) {
    adapted.defensiveLine = 'low';
    adapted.defensiveApproach = 'compact';
    adapted.transition = 'counter';
    mentality = 'defensive';
    formation = seed % 2 ? '5-4-1' : '4-1-4-1';
  } else if (isHome && teamRep - oppRep >= 8) {
    adapted.defensiveLine = 'high';
    adapted.defensiveApproach = 'front_foot';
    adapted.pressing = base.id === 'compact_counter' ? 'standard' : 'aggressive';
    mentality = base.id === 'controller' ? 'possession' : 'attacking';
  }

  return {
    id:base.id, label:base.label, formation, mentality,
    instructions:normalizeTeamInstructions(adapted), source:'ai', version:P2_TACTICS_VERSION,
  };
}

export function chooseAIRole(player, profile) {
  const compatible = getCompatibleRoles(player);
  if (!compatible.length) return null;
  const tags = tacticTags(profile?.instructions);
  let best = compatible[0];
  let bestScore = -Infinity;
  for (const role of compatible) {
    const alignment = role.tags.some(tag => tags.has(tag)) ? .06 : 0;
    const score = roleSuitability(player, role.id) + alignment;
    if (score > bestScore) { bestScore = score; best = role; }
  }
  return best.id;
}

export function buildOppositionInsight({ team, profile, form = [], keyPlayer = null } = {}) {
  const p = profile ?? getAITacticalProfile(team);
  const i = normalizeTeamInstructions(p.instructions);
  const formText = form.length ? form.map(item => item?.result ?? item).filter(Boolean).slice(-5).join('') : 'No recent form';
  const threat = i.transition === 'counter'
    ? 'Breaks quickly when space opens behind the line.'
    : i.width === 'wide' || i.chanceCreation === 'early_delivery'
      ? 'Creates danger from wide areas and early service.'
      : i.buildUp === 'patient'
        ? 'Looks to control territory and work high-quality chances.'
        : 'Uses balanced progression and changes tempo when space appears.';
  const weakness = i.defensiveLine === 'high'
    ? 'Space can appear behind their high defensive line.'
    : i.pressing === 'aggressive'
      ? 'Their press can leave gaps if the first wave is bypassed.'
      : i.width === 'narrow'
        ? 'Switches of play can stretch their narrow block.'
        : 'Few structural extremes — execution quality matters.';
  return {
    style:p.label,
    shape:p.formation,
    mentality:p.mentality,
    formText,
    threat,
    weakness,
    keyPlayer:keyPlayer ? `${keyPlayer.name} · ${keyPlayer.position}` : null,
  };
}

export function createManagerDNA() {
  return {
    version:1, matches:0, wins:0, draws:0, losses:0,
    formations:{}, mentalities:{},
    pressTotal:0, directnessTotal:0, possessionTotal:0, riskTotal:0,
    youthStarts:0, possessionObservedTotal:0,
    lastFingerprint:null,
  };
}

function bump(map, key) { return { ...map, [key]:(map?.[key] ?? 0) + 1 }; }
function resultForUser(result, userTeamId) {
  if (!result || !userTeamId) return 'draw';
  const home = result.homeTeamId === userTeamId;
  const gf = home ? result.homeGoals : result.awayGoals;
  const ga = home ? result.awayGoals : result.homeGoals;
  return gf > ga ? 'win' : gf < ga ? 'loss' : 'draw';
}

export function updateManagerDNA(current, sample = {}) {
  const dna = { ...createManagerDNA(), ...(current ?? {}) };
  if (sample.fingerprint && sample.fingerprint === dna.lastFingerprint) return dna;
  const instructions = normalizeTeamInstructions(sample.instructions);
  const outcome = sample.outcome ?? resultForUser(sample.result, sample.userTeamId);
  const possession = Number(sample.possession ?? (sample.result?.stats?.possession?.home ?? 50));
  const directness = instructions.buildUp === 'direct' ? 1 : instructions.buildUp === 'patient' ? -1 : 0;
  const press = instructions.pressing === 'aggressive' ? 1 : instructions.pressing === 'passive' ? -1 : 0;
  const possessionIntent = instructions.buildUp === 'patient' || instructions.chanceCreation === 'work_ball' ? 1 : instructions.buildUp === 'direct' ? -1 : 0;
  const risk = (instructions.defensiveLine === 'high' ? .35 : instructions.defensiveLine === 'low' ? -.2 : 0)
    + (instructions.pressing === 'aggressive' ? .35 : 0)
    + (instructions.defensiveApproach === 'front_foot' ? .3 : instructions.defensiveApproach === 'compact' ? -.2 : 0);
  const matches = dna.matches + 1;
  return {
    ...dna,
    matches,
    wins:dna.wins + (outcome === 'win' ? 1 : 0),
    draws:dna.draws + (outcome === 'draw' ? 1 : 0),
    losses:dna.losses + (outcome === 'loss' ? 1 : 0),
    formations:bump(dna.formations, sample.formation ?? '4-3-3'),
    mentalities:bump(dna.mentalities, sample.mentality ?? 'balanced'),
    pressTotal:dna.pressTotal + press,
    directnessTotal:dna.directnessTotal + directness,
    possessionTotal:dna.possessionTotal + possessionIntent,
    riskTotal:dna.riskTotal + risk,
    youthStarts:dna.youthStarts + Number(sample.youthStarts ?? 0),
    possessionObservedTotal:dna.possessionObservedTotal + (Number.isFinite(possession) ? possession : 50),
    lastFingerprint:sample.fingerprint ?? dna.lastFingerprint,
  };
}

function topKey(map, fallback) {
  const entries = Object.entries(map ?? {});
  if (!entries.length) return fallback;
  entries.sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0][0];
}

export function summarizeManagerDNA(current) {
  const dna = { ...createManagerDNA(), ...(current ?? {}) };
  const n = Math.max(1, dna.matches);
  const directness = dna.directnessTotal / n;
  const pressing = dna.pressTotal / n;
  const risk = dna.riskTotal / n;
  const intent = dna.possessionTotal / n;
  const style = directness > .25 ? 'Direct' : intent > .25 ? 'Possession' : 'Adaptive';
  const pressLabel = pressing > .25 ? 'Aggressive press' : pressing < -.25 ? 'Measured press' : 'Standard press';
  const riskLabel = risk > .28 ? 'Front-foot' : risk < -.12 ? 'Risk-controlled' : 'Balanced risk';
  return {
    matches:dna.matches,
    style,
    pressing:pressLabel,
    risk:riskLabel,
    preferredFormation:topKey(dna.formations, '4-3-3'),
    preferredMentality:topKey(dna.mentalities, 'balanced'),
    winRate:dna.matches ? Math.round((dna.wins / dna.matches) * 100) : 0,
    averagePossession:dna.matches ? Math.round(dna.possessionObservedTotal / dna.matches) : 50,
    youthStarts:dna.youthStarts,
  };
}
