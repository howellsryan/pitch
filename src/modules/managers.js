import { LEAGUE_NATION, NAMES_BY_NATION } from './youthAcademy.js';
import { createManagerDNA, stableStringHash } from './tactics.js';

/**
 * modules/managers.js — P6 manager entity schema, deterministic generation and
 * selectors. Pure/DOM-free: no IndexedDB or UI imports. `save.js` owns the
 * store-level backfill orchestration; this module owns the entity shape.
 */

export const MANAGER_MODEL_VERSION = 1;
export const USER_MANAGER_ID = 'mgr_user';
// Shared with managerCareer.js's shouldRetire so a manager row persisted
// before `age` existed (any save already past the WP1 backfill) reads as
// this same neutral age rather than silently computing age 0 forever.
export const DEFAULT_MANAGER_AGE = 45;

export function aiManagerIdForClub(clubId) {
  return `mgr_${clubId}`;
}

const LEAGUE_FLAG = {
  'Premier League':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Championship':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'League One':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'League Two':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'La Liga':'🇪🇸', 'Bundesliga':'🇩🇪', 'Serie A':'🇮🇹', 'Ligue 1':'🇫🇷', 'Eredivisie':'🇳🇱',
};

function seededPick(list, seed) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[seed % list.length];
}

/**
 * Deterministic manager name/nationality from a stable seed string (usually a
 * club ID). Reuses P1's youth-academy nation-aware name pools rather than a
 * second data set; picks are hashed per field so name and surname don't move
 * together when the pool sizes differ.
 */
export function generateManagerIdentity(seedKey, league) {
  const nation = LEAGUE_NATION[league] ?? 'english';
  const pool = NAMES_BY_NATION[nation] ?? NAMES_BY_NATION.english;
  const first = seededPick(pool.first, stableStringHash(`${seedKey}:first`));
  const last = seededPick(pool.last, stableStringHash(`${seedKey}:last`));
  return {
    name:`${first} ${last}`,
    nationality:LEAGUE_FLAG[league] ?? '🌍',
  };
}

export function createManagerRecord(overrides = {}) {
  return {
    matches:0, wins:0, draws:0, losses:0,
    trophies:[], promotions:0, relegations:0,
    sackings:0, resignations:0,
    ...overrides,
  };
}

export function createManagerReputation(overrides = {}) {
  return {
    overall:60, youth:50, tactical:50, financial:50,
    ...overrides,
  };
}

/**
 * Full manager entity. Callers supply identity/employment/reputation; every
 * other field gets a safe default so a partial construction call (tests,
 * future callers) still produces a normalizeable entity.
 */
export function createManager(input = {}) {
  if (!input.id) throw new Error('createManager requires an id');
  const currentClubId = input.currentClubId ?? null;
  return {
    id:input.id,
    version:MANAGER_MODEL_VERSION,
    age:input.age ?? DEFAULT_MANAGER_AGE,
    name:input.name ?? 'The Manager',
    nationality:input.nationality ?? '🌍',
    isUser:Boolean(input.isUser),
    status:input.status ?? (currentClubId ? 'employed' : 'unemployed'),
    currentClubId,
    employment:{
      clubId:currentClubId,
      startDate:input.startDate ?? null,
      contractEndSeason:input.contractEndSeason ?? null,
    },
    record:createManagerRecord(input.record),
    reputation:createManagerReputation(input.reputation),
    dna:input.dna ? { ...createManagerDNA(), ...input.dna } : createManagerDNA(),
    history:Array.isArray(input.history) ? input.history : [],
    availability:{
      retirementAge:input.retirementAge ?? 62,
      caretakerEligible:Boolean(input.caretakerEligible),
    },
  };
}

/** Fill defaults on an entity read from storage so older/partial rows stay safe to use. */
export function normalizeManager(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (Number(raw.version ?? 0) >= MANAGER_MODEL_VERSION
    && raw.record && raw.reputation && raw.employment && raw.availability) {
    return raw;
  }
  return createManager({ ...raw, id:raw.id });
}

/** AI manager reputation is seeded from the club's own reputation with bounded seeded variance. */
export function generateAIManagerForClub(team, { currentDate = null, seasonStartYear = null } = {}) {
  const identity = generateManagerIdentity(team.id, team.league);
  const rep = Number(team.reputation ?? 65);
  const variance = ((stableStringHash(`${team.id}:rep`) % 21) - 10); // -10..+10
  const overall = Math.max(30, Math.min(96, Math.round(rep * 0.85 + variance)));
  const tenureYears = stableStringHash(`${team.id}:tenure`) % 5; // 0..4 seeded years already in post
  let startDate = currentDate;
  if (currentDate) {
    const d = new Date(currentDate);
    d.setFullYear(d.getFullYear() - tenureYears);
    startDate = d.toISOString();
  }
  return createManager({
    id:aiManagerIdForClub(team.id),
    age:36 + (stableStringHash(`${team.id}:age`) % 30), // 36..65
    name:identity.name,
    nationality:identity.nationality,
    isUser:false,
    currentClubId:team.id,
    status:'employed',
    startDate,
    reputation:createManagerReputation({
      overall,
      youth:Math.max(20, Math.min(90, overall - 10 + (stableStringHash(`${team.id}:youth`) % 21) - 10)),
      tactical:Math.max(20, Math.min(90, overall + (stableStringHash(`${team.id}:tac`) % 15) - 7)),
      financial:Math.max(20, Math.min(90, overall - 5 + (stableStringHash(`${team.id}:fin`) % 21) - 10)),
    }),
    retirementAge:58 + (stableStringHash(`${team.id}:retire`) % 12),
    history:seasonStartYear ? [{ clubId:team.id, startSeason:seasonStartYear - tenureYears, endSeason:null, endReason:null }] : [],
  });
}

export function createUserManager({ name, currentClubId, dna = null, currentDate = null } = {}) {
  return createManager({
    id:USER_MANAGER_ID,
    name:name || 'The Manager',
    nationality:'🌍',
    isUser:true,
    currentClubId,
    status:'employed',
    startDate:currentDate ?? null,
    dna,
    reputation:createManagerReputation({ overall:50, youth:50, tactical:50, financial:50 }),
    retirementAge:65,
  });
}

export function managersNeedBackfill(save) {
  return !save || Number(save.managerModelVersion ?? 0) < MANAGER_MODEL_VERSION;
}

/**
 * Pure backfill builder: one manager per club (the user's club gets the user
 * manager, every other club gets a deterministically generated AI manager),
 * plus the team.managerId patches and the save-level version/pointer fields.
 * Idempotent by construction — `save.js` only calls this while
 * `managersNeedBackfill` is true, so a second call never runs against an
 * already-migrated save.
 */
export function buildManagersBackfill(save, teams = []) {
  if (!save) return { save, managers:[], teamPatches:[] };
  const seasonStartYear = Number.parseInt(String(save.season ?? '').split('/')[0], 10) || null;
  const userManager = createUserManager({
    name:save.managerName,
    currentClubId:save.userTeamId,
    dna:save.managerDNA,
    currentDate:save.currentDate,
  });
  const aiManagers = teams
    .filter(team => team.id !== save.userTeamId)
    .map(team => generateAIManagerForClub(team, { currentDate:save.currentDate, seasonStartYear }));
  const managers = [userManager, ...aiManagers];
  const managerIdByClub = new Map(managers.map(manager => [manager.currentClubId, manager.id]));
  const teamPatches = teams
    .filter(team => team.managerId !== managerIdByClub.get(team.id))
    .map(team => ({ ...team, managerId:managerIdByClub.get(team.id) ?? null }));
  return {
    save:{
      ...save,
      managerModelVersion:MANAGER_MODEL_VERSION,
      userManagerId:USER_MANAGER_ID,
      managerMarket:save.managerMarket ?? createEmptyManagerMarket(),
    },
    managers,
    teamPatches,
  };
}

export function currentClub(manager) {
  return manager?.status === 'employed' ? manager.currentClubId : null;
}

/**
 * A caretaker is a normal manager entity — WP2's dismissal transition hands
 * the club to one immediately so no club is ever left without an active
 * manager. WP3/WP4 later replace the caretaker through the real appointment
 * flow; `caretakerEligible` marks it as a natural pick to keep the job. The ID
 * is derived from club + review checkpoint week (unique in practice, since a
 * club can only be dismissed once per checkpoint) rather than a module-level
 * counter, so this stays a pure function of its inputs.
 */
export function createCaretakerManager(team, { weekKey, currentDate = null } = {}) {
  const safeWeekKey = String(weekKey ?? 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
  const identity = generateManagerIdentity(`${team.id}:caretaker:${weekKey}`, team.league);
  const rep = Number(team.reputation ?? 65);
  return createManager({
    id:`mgr_caretaker_${team.id}_${safeWeekKey}`,
    age:38 + (stableStringHash(`${team.id}:caretaker_age:${weekKey}`) % 20), // 38..57
    name:identity.name,
    nationality:identity.nationality,
    isUser:false,
    currentClubId:team.id,
    status:'employed',
    startDate:currentDate,
    reputation:createManagerReputation({ overall:Math.max(30, Math.min(70, Math.round(rep * 0.55))), youth:45, tactical:45, financial:45 }),
    caretakerEligible:true,
    retirementAge:60,
  });
}

// Shared by p6Runtime.js (AI hires) and managerClubHandover.js (the user's
// own hire) so managerMarket.recentAppointments has one cap, not two
// independently-tuned constants.
export const MAX_RECENT_MANAGER_APPOINTMENTS = 40;

export function createEmptyManagerMarket() {
  return {
    version:1, vacancies:[], reviewedCheckpoints:[], processedWeekKeys:[], recentAppointments:[],
    userApproaches:[], pendingUserHandover:null,
  };
}
