/*
 * modules/coaching.js — pure P5 coaching department contract.
 *
 * Coaching belongs to the club, not the manager. The four departments expose
 * bounded assessment/development/recovery effects and never write player
 * attributes directly.
 */

export const COACHING_VERSION = 1;
export const COACHING_DEPARTMENTS = Object.freeze(['goalkeeping', 'defence', 'midfield', 'attack']);
export const COACHING_SPECIALISMS = Object.freeze(['balanced', 'assessment', 'development', 'recovery']);

const COACHING_LABELS = Object.freeze({
  goalkeeping:'Goalkeeping',
  defence:'Defence',
  midfield:'Midfield',
  attack:'Attack',
});

function coachingClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function coachingRound2(value) { return Math.round(value * 100) / 100; }
function coachingStableHash(value) {
  let h = 2166136261;
  for (const ch of String(value ?? '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function coachingUnit(seed) {
  let t = (coachingStableHash(seed) + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function coachingDepartmentLabel(id) {
  return COACHING_LABELS[id] ?? id;
}

export function coachingDepartmentForPosition(position) {
  if (position === 'GK') return 'goalkeeping';
  if (['CB','RB','LB'].includes(position)) return 'defence';
  if (['CM','CDM','CAM','RM','LM'].includes(position)) return 'midfield';
  return 'attack';
}

function defaultCoachQuality(team, department) {
  const reputation = coachingClamp(Number(team?.reputation ?? 60), 40, 99);
  const baseline = 1 + Math.round((reputation - 45) / 14);
  const nudge = (coachingStableHash(`${team?.id}:${department}:quality`) % 3) - 1;
  return coachingClamp(baseline + nudge, 1, 5);
}

function defaultSpecialism(team, department) {
  const pool = ['balanced', 'assessment', 'development', 'recovery'];
  return pool[coachingStableHash(`${team?.id}:${department}:specialism`) % pool.length];
}

function coachName(team, department, index = 0) {
  const first = ['Alex','Jamie','Sam','Morgan','Jordan','Taylor','Casey','Robin','Cameron','Drew'];
  const last = ['Bennett','Clarke','Dawson','Foster','Hayes','Morgan','Price','Reed','Shaw','Turner'];
  const seed = coachingStableHash(`${team?.id}:${department}:${index}:name`);
  return `${first[seed % first.length]} ${last[Math.floor(seed / first.length) % last.length]}`;
}

export function createDefaultCoach(team, department) {
  const quality = defaultCoachQuality(team, department);
  const specialism = defaultSpecialism(team, department);
  const reputation = coachingClamp(Number(team?.reputation ?? 60), 40, 99);
  const wage = Math.round((1_500 + quality * 1_850 + Math.max(0, reputation - 65) * 110) / 250) * 250;
  return {
    version:COACHING_VERSION,
    id:`coach:${team?.id ?? 'club'}:${department}:default`,
    name:coachName(team, department),
    department,
    quality,
    specialism,
    wage,
    contractYears:2 + (coachingStableHash(`${team?.id}:${department}:contract`) % 3),
    status:'active',
  };
}

export function normalizeCoach(coach, team, department) {
  if (!coach || typeof coach !== 'object' || Array.isArray(coach)) return createDefaultCoach(team, department);
  const quality = coachingClamp(Math.round(Number(coach.quality) || defaultCoachQuality(team, department)), 1, 5);
  const specialism = COACHING_SPECIALISMS.includes(coach.specialism) ? coach.specialism : 'balanced';
  return {
    version:COACHING_VERSION,
    id:String(coach.id ?? `coach:${team?.id ?? 'club'}:${department}:legacy`),
    name:String(coach.name ?? coachName(team, department)),
    department,
    quality,
    specialism,
    wage:Math.max(0, Math.round(Number(coach.wage) || createDefaultCoach(team, department).wage)),
    contractYears:coachingClamp(Math.round(Number(coach.contractYears) || 2), 1, 5),
    status:coach.status === 'expiring' ? 'expiring' : 'active',
  };
}

export function buildDefaultCoachingDepartments(team) {
  return Object.fromEntries(COACHING_DEPARTMENTS.map(department => [department, createDefaultCoach(team, department)]));
}

export function normalizeCoachingDepartments(coaching, team) {
  const source = coaching && typeof coaching === 'object' && !Array.isArray(coaching) ? coaching : {};
  return Object.fromEntries(COACHING_DEPARTMENTS.map(department => [department, normalizeCoach(source[department], team, department)]));
}

export function coachingNeedsBackfill(team) {
  if (!team) return false;
  if (Number(team.coachingVersion ?? 0) < COACHING_VERSION) return true;
  return COACHING_DEPARTMENTS.some(department => !team.coaching?.[department]);
}

export function withDefaultCoaching(team) {
  if (!team) return team;
  return {
    ...team,
    coachingVersion:COACHING_VERSION,
    coaching:normalizeCoachingDepartments(team.coaching, team),
  };
}

/**
 * Capped effects consumed by other P5/P3 domains. Quality contributes at most
 * +/-6%, and a matching specialism adds at most another 3% to that one effect.
 */
export function coachingEffects(team, playerOrPosition) {
  const position = typeof playerOrPosition === 'string' ? playerOrPosition : playerOrPosition?.position;
  const department = coachingDepartmentForPosition(position);
  // Only this player's own department is needed. Normalising all four on every
  // call was the single most expensive step in building a scouting report, and
  // recruitment surfaces build one per player.
  const source = team?.coaching && typeof team.coaching === 'object' && !Array.isArray(team.coaching) ? team.coaching : {};
  const coach = normalizeCoach(source[department], team, department);
  const qualityDelta = (coach.quality - 3) * .03;
  const assessment = coachingClamp(1 + qualityDelta + (coach.specialism === 'assessment' ? .03 : 0), .91, 1.09);
  const development = coachingClamp(1 + qualityDelta + (coach.specialism === 'development' ? .03 : 0), .91, 1.09);
  const recovery = coachingClamp(1 + qualityDelta + (coach.specialism === 'recovery' ? .03 : 0), .91, 1.09);
  return {
    department,
    coach,
    assessment:coachingRound2(assessment),
    development:coachingRound2(development),
    recovery:coachingRound2(recovery),
  };
}

export function coachingWeeklyCost(team) {
  const departments = normalizeCoachingDepartments(team?.coaching, team);
  return Object.values(departments).reduce((sum, coach) => sum + Math.max(0, Number(coach.wage) || 0), 0);
}

/** Deterministic three-person market; rebuilding the same week does not reroll. */
export function buildCoachCandidates(team, department, season = 'unknown', gameweek = 0) {
  if (!COACHING_DEPARTMENTS.includes(department)) return [];
  const current = normalizeCoachingDepartments(team?.coaching, team)[department];
  const reputation = coachingClamp(Number(team?.reputation ?? 60), 40, 99);
  return [0,1,2].map(index => {
    const seed = `${team?.id}:${department}:${season}:${gameweek}:${index}`;
    const roll = coachingUnit(seed);
    const quality = coachingClamp(Math.round(2 + (reputation - 55) / 18 + roll * 2.4), 1, 5);
    const specialismPool = ['balanced','assessment','development','recovery'];
    const specialism = specialismPool[coachingStableHash(`${seed}:specialism`) % specialismPool.length];
    const wage = Math.round((1_750 + quality * 2_100 + reputation * 70 + roll * 1_250) / 250) * 250;
    const signingCost = Math.round(wage * (6 + quality * 2) / 1_000) * 1_000;
    return {
      version:COACHING_VERSION,
      id:`coach:${team?.id}:${department}:${season}:${gameweek}:${index}`,
      name:coachName({ id:`${team?.id}:${season}:${gameweek}` }, department, index + 1),
      department,
      quality,
      specialism,
      wage,
      signingCost,
      contractYears:2 + (coachingStableHash(`${seed}:contract`) % 3),
      status:'active',
      improvement:quality - current.quality,
    };
  }).sort((a,b) => b.quality - a.quality || a.wage - b.wage || a.id.localeCompare(b.id));
}
