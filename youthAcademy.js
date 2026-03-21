/** modules/youthAcademy.js — Youth cohort intake, development, promotion/release */
import { getSave, putSave, getTeam, getAllTeams, putTeamsBulk, putPlayer, putPlayersBulk } from './db.js';

// ─── Position pool for youth generation ──────────────────────
const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RM','LM','ST','ST','CF','RW','LW'];

// ─── First name / last name pools for generated youth ─────────
const FIRST_NAMES = [
  'Luca','Mason','Noah','Ethan','Oliver','Jack','Theo','Kai','Zion','Tyler',
  'Marcus','Jayden','Elias','Oscar','Hugo','Finn','Leo','Kian','Ryo','Mateo',
  'Enzo','Jude','Soren','Axel','Caden','Niko','Ruben','Felix','Dante','Aryan',
  'Ibrahim','Yousef','Tariq','Samuel','Isaiah','Kwame','Emeka','Adil','Hamza','Yusuf',
  'Aleksei','Matias','Cristian','Eduardo','Diego','Rodrigo','Thiago','Andres','Pablo','Luis',
];

const LAST_NAMES = [
  'Silva','Santos','Müller','García','Martinez','Diallo','Traoré','Osei','Kofi','Addo',
  'Walker','Taylor','Brown','Jones','Williams','Smith','Davies','Evans','Hughes','Thomas',
  'Ferreira','Oliveira','Costa','Pereira','Lima','Alves','Sousa','Mendes','Carvalho','Nunes',
  'Becker','Wagner','Hoffmann','Schneider','Fischer','Weber','Richter','Klein','Wolf','Zimmermann',
  'Dupont','Laurent','Bernard','Petit','Martin','Leroy','Moreau','Simon','Michel','Lefebvre',
  'Romano','Ferrari','Ricci','Russo','Esposito','Colombo','Bruno','Greco','Marino','Gallo',
];

function randName() {
  const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${fn} ${ln}`;
}

// ─── Academy quality tier by reputation ───────────────────────
function academyTier(reputation) {
  if (reputation >= 93) return 'elite';      // Man City, Real Madrid level
  if (reputation >= 85) return 'top';        // Top half PL / big clubs
  if (reputation >= 75) return 'good';       // Mid-table PL / solid clubs
  if (reputation >= 65) return 'average';    // Lower-league / smaller clubs
  return 'poor';
}

// ─── Generate a single youth prospect ─────────────────────────
function generateYouthPlayer(teamId, reputation, season, index) {
  const tier  = academyTier(reputation);
  const age   = 15 + Math.floor(Math.random() * 4); // 15-18
  const pos   = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

  // Base rating scaled by academy tier — all youth are raw
  const baseRating = {
    elite:   42 + Math.floor(Math.random() * 18), // 42-59
    top:     38 + Math.floor(Math.random() * 16), // 38-53
    good:    34 + Math.floor(Math.random() * 14), // 34-47
    average: 30 + Math.floor(Math.random() * 12), // 30-41
    poor:    26 + Math.floor(Math.random() * 10), // 26-35
  }[tier];

  // Potential ceiling — occasional wonderkid for elite academies
  const potentialBonus = {
    elite:   30 + Math.floor(Math.random() * 35), // +30 to +64 → can reach ~88-99
    top:     24 + Math.floor(Math.random() * 28), // +24 to +51
    good:    18 + Math.floor(Math.random() * 22), // +18 to +39
    average: 12 + Math.floor(Math.random() * 16), // +12 to +27
    poor:    8  + Math.floor(Math.random() * 10), // +8 to +17
  }[tier];

  const potentialRating = Math.min(99, baseRating + potentialBonus);

  // Rare wonderkid event: ~4% for elite, ~1% for top, never for lower
  const isWonderkid = (tier === 'elite' && Math.random() < 0.04) ||
                      (tier === 'top'   && Math.random() < 0.01);
  const finalPot    = isWonderkid ? Math.max(88, potentialRating) : potentialRating;

  // Distribute base rating across attributes by position
  const spread = distributeAttributes(pos, baseRating);

  // Unique youth ID: team + season + index
  const seasonStr = String(season).replace('/', '_');
  const id = `youth_${teamId}_${seasonStr}_${index}_${Date.now()}_${Math.floor(Math.random()*1000)}`;

  return {
    id,
    name:            randName(),
    position:        pos,
    age,
    attack:          spread.attack,
    midfield:        spread.midfield,
    defence:         spread.defence,
    goalkeeping:     spread.goalkeeping,
    potentialRating: finalPot,
    growthPoints:    0,
    peakAge:         calcYouthPeakAge(pos),
    value:           youthValue(baseRating, age, finalPot),
    wage:            50_000 + Math.floor(Math.random() * 50_000), // £50k-100k/yr — academy wages
    teamId:          null, // not yet in first team
    youthTeamId:     teamId,
    isYouth:         true,
    isWonderkid,
    season,          // intake season
    fitness:         100,
    injured:         false,
    suspended:       false,
    inSquad:         false,
    goals:           0,
    assists:         0,
    cleanSheets:     0,
    form:            50,
    transferListed:  false,
  };
}

function distributeAttributes(pos, base) {
  // Spread ratings around base ± a small jitter per attribute
  const jitter = () => Math.floor(Math.random() * 8) - 4; // -4 to +3
  const clamp  = (v) => Math.max(10, Math.min(99, v));
  if (pos === 'GK') return {
    goalkeeping: clamp(base + jitter() + 4),
    defence:     clamp(base + jitter() - 4),
    midfield:    clamp(base + jitter() - 8),
    attack:      clamp(base + jitter() - 12),
  };
  if (['ST','CF'].includes(pos)) return {
    attack:      clamp(base + jitter() + 4),
    midfield:    clamp(base + jitter() - 2),
    defence:     clamp(base + jitter() - 8),
    goalkeeping: clamp(base + jitter() - 16),
  };
  if (['RW','LW','CAM'].includes(pos)) return {
    attack:      clamp(base + jitter() + 2),
    midfield:    clamp(base + jitter() + 2),
    defence:     clamp(base + jitter() - 8),
    goalkeeping: clamp(base + jitter() - 16),
  };
  if (['CM','CDM','RM','LM'].includes(pos)) return {
    midfield:    clamp(base + jitter() + 4),
    attack:      clamp(base + jitter() - 2),
    defence:     clamp(base + jitter() - 2),
    goalkeeping: clamp(base + jitter() - 16),
  };
  // Defenders (CB, RB, LB)
  return {
    defence:     clamp(base + jitter() + 4),
    midfield:    clamp(base + jitter() - 2),
    attack:      clamp(base + jitter() - 8),
    goalkeeping: clamp(base + jitter() - 16),
  };
}

function calcYouthPeakAge(pos) {
  if (['GK','CB'].includes(pos))             return 29 + Math.floor(Math.random() * 3);
  if (['RB','LB','CDM'].includes(pos))       return 28 + Math.floor(Math.random() * 3);
  if (['CM','CAM','RM','LM'].includes(pos))  return 27 + Math.floor(Math.random() * 3);
  if (['ST','CF'].includes(pos))             return 27 + Math.floor(Math.random() * 2);
  if (['RW','LW'].includes(pos))             return 26 + Math.floor(Math.random() * 3);
  return 28;
}

function youthValue(base, age, potential) {
  // Youth value is low now but reflects potential ceiling
  const potFactor = Math.pow((potential - 50) / 49, 1.8) * 0.25; // fraction of future value
  const ageFactor = age <= 16 ? 0.6 : age <= 17 ? 0.7 : age <= 18 ? 0.8 : 0.9;
  return Math.max(100_000, Math.round(potFactor * 40_000_000 * ageFactor));
}

// ─── Generate a full cohort for one team ──────────────────────
function generateCohort(teamId, reputation, season) {
  const tier  = academyTier(reputation);
  const size  = {
    elite:   5 + Math.floor(Math.random() * 2), // 5-6
    top:     4 + Math.floor(Math.random() * 2), // 4-5
    good:    3 + Math.floor(Math.random() * 2), // 3-4
    average: 3 + Math.floor(Math.random() * 2), // 3-4
    poor:    2 + Math.floor(Math.random() * 2), // 2-3
  }[tier];

  return Array.from({ length: size }, (_, i) =>
    generateYouthPlayer(teamId, reputation, season, i)
  );
}

// ─── Run yearly intake for ALL teams ──────────────────────────
/**
 * Called at end of season. Generates new youth cohort for every team.
 * User's cohort is stored in save.youthCohort (replaces previous).
 * AI teams get youthPlayers stored on their team record.
 */
export async function runYouthIntake(save, allTeams) {
  const season = save.season; // e.g. "2025/26"

  // Age existing youth by 1 year; remove anyone who's turned 20 without being promoted
  const agedUserYouth = (save.youthCohort ?? [])
    .map(p => ({ ...p, age: p.age + 1 }))
    .filter(p => p.age <= 19); // 20 = must decide or they leave

  // Generate new intake for this season
  const userTeam    = allTeams.find(t => t.id === save.userTeamId);
  const userRep     = userTeam?.reputation ?? 70;
  const newCohort   = generateCohort(save.userTeamId, userRep, season);

  // Combined: aged returning youth + new intake
  const updatedCohort = [...agedUserYouth, ...newCohort];

  // AI teams: auto-promote top prospects + add new intake
  const aiTeamUpdates = [];
  for (const team of allTeams) {
    if (team.id === save.userTeamId) continue;
    const existing  = (team.youthPlayers ?? [])
      .map(p => ({ ...p, age: p.age + 1 }))
      .filter(p => p.age <= 19);

    const newAI     = generateCohort(team.id, team.reputation ?? 70, season);
    const combined  = [...existing, ...newAI];

    // AI auto-promotes youth with potential ≥ 70 and age ≥ 18
    const toPromote = combined.filter(p => p.age >= 18 && p.potentialRating >= 70);
    const remaining = combined.filter(p => !(p.age >= 18 && p.potentialRating >= 70));

    if (toPromote.length > 0) {
      const promoted = toPromote.map(p => ({
        ...p,
        isYouth: false,
        teamId:  team.id,
        inSquad: true,
        wage:    Math.round(p.value * 0.05 / 52), // ~5% value/yr weekly
      }));
      await putPlayersBulk(promoted);
    }

    aiTeamUpdates.push({ ...team, youthPlayers: remaining });
  }

  // Batch-update AI teams
  if (aiTeamUpdates.length > 0) {
    await putTeamsBulk(aiTeamUpdates);
  }

  return updatedCohort;
}

// ─── User promotes a youth player to first team ───────────────
export async function promoteYouthPlayer(playerId) {
  const save = await getSave();
  const youth = (save.youthCohort ?? []).find(p => p.id === playerId);
  if (!youth) throw new Error('Youth player not found');

  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('Team not found');

  // Weekly wage: 5% of value / 52 weeks, min £1k/week
  const weeklyWage = Math.max(1_000, Math.round(youth.value * 0.05 / 52));

  const promoted = {
    ...youth,
    isYouth:  false,
    teamId:   save.userTeamId,
    inSquad:  true,
    wage:     weeklyWage,
  };

  // putPlayer is available globally after bundle (import stripped at build time)
  await putPlayer(promoted);

  // Remove from cohort
  const newCohort = save.youthCohort.filter(p => p.id !== playerId);
  await putSave({ ...save, youthCohort: newCohort });

  return promoted;
}

// ─── User releases a youth player ─────────────────────────────
export async function releaseYouthPlayer(playerId) {
  const save     = await getSave();
  const newCohort = (save.youthCohort ?? []).filter(p => p.id !== playerId);
  await putSave({ ...save, youthCohort: newCohort });
}

// ─── Get academy info for display ─────────────────────────────
export function getAcademyInfo(reputation) {
  const tier = academyTier(reputation);
  return {
    tier,
    label: {
      elite:   'Elite Academy',
      top:     'Top Academy',
      good:    'Good Academy',
      average: 'Average Academy',
      poor:    'Basic Academy',
    }[tier],
    stars: { elite: 5, top: 4, good: 3, average: 2, poor: 1 }[tier],
    description: {
      elite:   'World-class facilities. Regular wonderkid breakthroughs possible.',
      top:     'Excellent development pathway. Consistently produces quality prospects.',
      good:    'Solid youth setup. A reliable pipeline for squad depth.',
      average: 'Modest facilities. Occasional gems can be found.',
      poor:    'Limited resources. Youth intake quality is variable.',
    }[tier],
  };
}
