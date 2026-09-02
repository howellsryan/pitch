import { getSave, getTeam, putPlayer, putPlayersBulk, putSave, putTeam, putTeamsBulk } from './db.js';
import { normalizePlayerModel } from './playerModel.js';
import { applyLedgerMovement } from './clubFinance.js';

/** modules/youthAcademy.js -- Youth cohort intake, development, promotion/release */
export const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RM','LM','ST','ST','CF','RW','LW'];

// Nation-aware name pools
export const NAMES_BY_NATION = {
  english: {
    first: ['Jack','Harry','George','Oliver','Charlie','James','Thomas','Alfie','Freddie','Archie',
            'Joshua','William','Ethan','Mason','Logan','Liam','Noah','Theo','Finley','Sebastian',
            'Oscar','Henry','Isaac','Daniel','Samuel','Joseph','Leon','Elliot','Ryan','Tyler'],
    last:  ['Smith','Jones','Williams','Taylor','Brown','Davies','Evans','Wilson','Thomas','Roberts',
            'Walker','Wright','Robinson','Thompson','White','Hughes','Edwards','Green','Hall','Lewis',
            'Harris','Clarke','Patel','Jackson','Wood','Turner','Martin','Cooper','Hill','Morris'],
  },
  spanish: {
    first: ['Alejandro','Pablo','Diego','Carlos','Sergio','Adrian','Alvaro','Marcos','Javier','Fernando',
            'Rodrigo','Ruben','Miguel','Iker','Jesus','Raul','David','Ivan','Borja','Unai',
            'Oscar','Luis','Victor','Aitor','Gonzalo','Dani','Mateo','Andres','Nacho','Santi'],
    last:  ['Garcia','Martinez','Lopez','Sanchez','Gonzalez','Fernandez','Perez','Rodriguez','Jimenez','Ruiz',
            'Hernandez','Diaz','Moreno','Alvarez','Romero','Alonso','Torres','Navarro','Dominguez','Ramos',
            'Vazquez','Gil','Serrano','Blanco','Molina','Castro','Ortega','Delgado','Ortiz','Ibanez'],
  },
  german: {
    first: ['Lukas','Jonas','Leon','Niklas','Maximilian','Florian','Moritz','Felix','Tobias','Julian',
            'Luca','Tim','Fabian','Patrick','Dominik','Kai','Marc','Stefan','Simon','Alexander',
            'Erik','Nico','Henrik','Lars','Soren','Philipp','Robin','Sebastian','Manuel','Kevin'],
    last:  ['Muller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann',
            'Schafer','Koch','Richter','Bauer','Klein','Wolf','Schroder','Neumann','Schwarz','Zimmermann',
            'Braun','Kruger','Hartmann','Lange','Werner','Schmitt','Weiss','Krause','Maier','Lehmann'],
  },
  italian: {
    first: ['Lorenzo','Matteo','Leonardo','Francesco','Alessandro','Luca','Marco','Andrea','Davide','Simone',
            'Federico','Riccardo','Giovanni','Antonio','Stefano','Niccolo','Jacopo','Emanuele','Daniele','Filippo',
            'Samuele','Edoardo','Pietro','Gabriele','Cristian','Alessio','Gianluca','Salvatore','Fabrizio','Roberto'],
    last:  ['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco',
            'Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti',
            'Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli','Martini','Leone'],
  },
  french: {
    first: ['Lucas','Hugo','Nathan','Tom','Theo','Enzo','Mathis','Maxime','Romain','Antoine',
            'Alexis','Baptiste','Clement','Florian','Guillaume','Kevin','Nicolas','Pierre','Quentin','Raphael',
            'Adrien','Benjamin','Charles','Dylan','Ethan','Gauthier','Jules','Louis','Mehdi','Sofiane'],
    last:  ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
            'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
            'Morel','Girard','Andre','Mercier','Dupont','Lambert','Bonnet','Francois','Martinez','Legrand'],
  },
  dutch: {
    first: ['Lars','Daan','Sem','Luuk','Thijs','Ruben','Bram','Jesse','Jasper','Jordi',
            'Milan','Sander','Wouter','Niels','Tim','Bas','Rick','Robin','Stefan','Kevin',
            'Dylan','Joey','Finn','Levi','Julian','Thomas','Matthijs','Owen','Teun','Quinten'],
    last:  ['De Jong','Van Dijk','Bakker','Visser','Smit','Meijer','De Vries','Peters','Mulder','Hendriks',
            'Kuiper','Vermeer','Postma','Janssen','Willems','Van den Berg','Bosman','Hoekstra','Dijkstra','Brouwer',
            'Kok','Dekker','Lammers','Schouten','Berghuis','Koopmeiners','Wijnaldum','Timber','Gravenberch','Gakpo'],
  },
};

export const LEAGUE_NATION = {
  'Premier League': 'english',
  'Championship':   'english',
  'League One':     'english',
  'League Two':     'english',
  'La Liga':        'spanish',
  'Bundesliga':     'german',
  'Serie A':        'italian',
  'Ligue 1':        'french',
  'Eredivisie':     'dutch',
};

export function randName(league) {
  const nation = LEAGUE_NATION[league] ?? 'english';
  const pool   = NAMES_BY_NATION[nation];
  const fn = pool.first[Math.floor(Math.random() * pool.first.length)];
  const ln = pool.last [Math.floor(Math.random() * pool.last.length)];
  return `${fn} ${ln}`;
}

// Academy quality tier by reputation, blended with academy investment — a
// club that spends can out-develop its station by up to roughly one tier
// (100 investment = +15 effective reputation), without needing a full
// staff/scouting system to make that spend feel worthwhile.
export function academyTier(reputation, investment = 0) {
  const effectiveRep = reputation + Math.min(100, Math.max(0, investment)) * 0.15;
  if (effectiveRep >= 90) return 'elite';
  if (effectiveRep >= 80) return 'top';
  if (effectiveRep >= 68) return 'good';
  if (effectiveRep >= 55) return 'average';
  return 'poor';
}

// £500k of investment buys one point, up to a cap of 100. Returns the
// actual points bought (capped by both the spend and the remaining room),
// so the caller knows how much budget to actually deduct.
export const ACADEMY_INVESTMENT_COST_PER_POINT = 500_000;
export function academyInvestmentPointsForSpend(currentInvestment, spend) {
  const room = 100 - Math.min(100, Math.max(0, currentInvestment ?? 0));
  const affordablePoints = Math.floor(Math.max(0, spend) / ACADEMY_INVESTMENT_COST_PER_POINT);
  return Math.max(0, Math.min(room, affordablePoints));
}

export async function investInAcademy(amount) {
  const save = await getSave();
  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('TEAM_NOT_FOUND');
  if ((team.budget ?? 0) < amount) throw new Error('INSUFFICIENT_FUNDS');

  const points = academyInvestmentPointsForSpend(team.academyInvestment, amount);
  if (points <= 0) throw new Error('NOTHING_TO_INVEST');
  const cost = points * ACADEMY_INVESTMENT_COST_PER_POINT;

  const newInvestment = Math.min(100, (team.academyInvestment ?? 0) + points);
  await putTeamsBulk([{ ...applyLedgerMovement(team, { category:'academy_investment', amount:-cost, description:`Academy investment (+${points} pts)` }), academyInvestment: newInvestment }]);
  return { success: true, pointsGained: points, cost, newInvestment };
}

// Potential star bands:
//   5* = 88-99  (wonderkid only)
//   4* = 76-87
//   3* = 62-75
//   2* = 48-61
//   1* = < 48
export const POT_4STAR_CAP = 87; // non-wonderkid ceiling

// Generate a single youth prospect.
// league param is needed for nation-aware naming and is passed from generateCohort.
// isWonderkid is pre-determined at cohort level and passed in.
export function generateYouthPlayer(teamId, reputation, season, index, league, isWonderkid, investment = 0) {
  const tier = academyTier(reputation, investment);
  const age  = 15 + Math.floor(Math.random() * 4); // 15-18
  const pos  = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];

  // Each tier has a typical (low) range and a tail (high) range.
  // tailChance = probability of rolling in the high range instead of the typical one.
  // Within each range, the value is uniformly distributed.
  // This means all tiers can hit 4★ (84-87) but poor does so rarely,
  // and elite hits it much more consistently.
  const cfg = {
  //           typicalMin  typicalMax  tailMin  tailMax  tailChance
    elite:   { lo:67, hi:84, tlo:85, thi:87, tail:0.22 },
    top:     { lo:63, hi:82, tlo:83, thi:87, tail:0.13 },
    good:    { lo:59, hi:79, tlo:80, thi:87, tail:0.08 },
    average: { lo:56, hi:76, tlo:77, thi:87, tail:0.05 },
    poor:    { lo:53, hi:73, tlo:74, thi:87, tail:0.03 },
  }[tier];

  const inTail = Math.random() < cfg.tail;
  const rawPot = inTail
    ? cfg.tlo + Math.floor(Math.random() * (cfg.thi - cfg.tlo + 1))
    : cfg.lo  + Math.floor(Math.random() * (cfg.hi  - cfg.lo  + 1));

  // Base rating: always well below potential (they're raw youth prospects)
  const baseRating = Math.max(26, Math.round(rawPot * 0.52 + Math.random() * 10));

  let finalPot;
  if (isWonderkid) {
    // Wonderkid: guaranteed 5★ potential (88+)
    finalPot = Math.max(88, rawPot);
  } else {
    // Non-wonderkid: capped at 4★ ceiling (87)
    finalPot = Math.min(POT_4STAR_CAP, rawPot);
  }

  const spread = distributeAttributes(pos, baseRating);

  const seasonStr = String(season).replace('/', '_');
  const id = `youth_${teamId}_${seasonStr}_${index}_${Date.now()}_${Math.floor(Math.random()*1000)}`;

  return normalizePlayerModel({
    id,
    name:            randName(league),
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
    wage:            50_000 + Math.floor(Math.random() * 50_000),
    teamId:          null,
    youthTeamId:     teamId,
    isYouth:         true,
    isWonderkid,
    season,
    fitness:         100,
    injured:         false,
    suspended:       false,
    inSquad:         false,
    goals:           0,
    assists:         0,
    cleanSheets:     0,
    form:            50,
    transferListed:  false,
  });
}

export function distributeAttributes(pos, base) {
  const jitter = () => Math.floor(Math.random() * 8) - 4;
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
  return {
    defence:     clamp(base + jitter() + 4),
    midfield:    clamp(base + jitter() - 2),
    attack:      clamp(base + jitter() - 8),
    goalkeeping: clamp(base + jitter() - 16),
  };
}

export function calcYouthPeakAge(pos) {
  if (['GK','CB'].includes(pos))             return 29 + Math.floor(Math.random() * 3);
  if (['RB','LB','CDM'].includes(pos))       return 28 + Math.floor(Math.random() * 3);
  if (['CM','CAM','RM','LM'].includes(pos))  return 27 + Math.floor(Math.random() * 3);
  if (['ST','CF'].includes(pos))             return 27 + Math.floor(Math.random() * 2);
  if (['RW','LW'].includes(pos))             return 26 + Math.floor(Math.random() * 3);
  return 28;
}

export function youthValue(base, age, potential) {
  const ageFactor = age <= 16 ? 0.6 : age <= 17 ? 0.7 : age <= 18 ? 0.8 : 0.9;
  if (potential < 55) {
    return Math.round((250_000 + Math.max(0, potential - 30) * 20_000) * ageFactor);
  }
  const potNorm = (potential - 55) / 44;
  const baseVal = 500_000 + Math.pow(potNorm, 1.8) * 9_500_000;
  return Math.round(baseVal * ageFactor);
}

// Generate a full cohort for one team.
// Wonderkid chance applies per cohort (not per player) so at most one wonderkid per intake.
// Chances: elite 25%, top 10%, good 5%, average/poor 1%.
export function generateCohort(teamId, reputation, season, league, investment = 0) {
  const tier = academyTier(reputation, investment);
  // Base intake of 10, up to +4 more at full investment (100) — a spend
  // that widens the net as well as raising the average, without needing
  // a full scouting-network system to justify it.
  const size = 10 + Math.round(Math.min(100, Math.max(0, investment)) / 100 * 4);

  // Roll once per cohort to determine if a wonderkid appears
  const wonderkidChance = { elite: 0.20, top: 0.10, good: 0.075, average: 0.05, poor: 0.025 }[tier];
  const cohortHasWonderkid = Math.random() < wonderkidChance;

  // If the cohort gets a wonderkid, one randomly chosen player receives the flag
  const wonderkidSlot = cohortHasWonderkid ? Math.floor(Math.random() * size) : -1;

  return Array.from({ length: size }, (_, i) =>
    generateYouthPlayer(teamId, reputation, season, i, league, i === wonderkidSlot, investment)
  );
}

// Run yearly intake for ALL teams
export async function runYouthIntake(save, allTeams) {
  const season = save.season;

  const agedUserYouth = (save.youthCohort ?? [])
    .map(p => ({ ...p, age: p.age + 1 }))
    .filter(p => p.age <= 19);

  const userTeam  = allTeams.find(t => t.id === save.userTeamId);
  const userRep   = userTeam?.reputation ?? 70;
  const userLeague = userTeam?.league ?? 'Premier League';
  const newCohort = generateCohort(save.userTeamId, userRep, season, userLeague, userTeam?.academyInvestment ?? 0);

  const updatedCohort = [...agedUserYouth, ...newCohort];

  const aiTeamUpdates = [];
  for (const team of allTeams) {
    if (team.id === save.userTeamId) continue;
    const existing = (team.youthPlayers ?? [])
      .map(p => ({ ...p, age: p.age + 1 }))
      .filter(p => p.age <= 19);

    const newAI    = generateCohort(team.id, team.reputation ?? 70, season, team.league ?? 'Premier League');
    const combined = [...existing, ...newAI];

    const toPromote = combined.filter(p => p.age >= 18 && p.potentialRating >= 70);
    const remaining = combined.filter(p => !(p.age >= 18 && p.potentialRating >= 70));

    if (toPromote.length > 0) {
      const promoteYear = parseInt((season || '').split('/')[0]) || 0;
      const promoted = toPromote.map(p => ({
        ...p,
        isYouth: false,
        teamId:  team.id,
        inSquad: true,
        wage:    Math.max(1_000, Math.round((Number(p.value) || 500_000) * 0.05 / 52)),
        contractExpiry: promoteYear + 3, // first pro contract, standard 3 years
      }));
      await putPlayersBulk(promoted);
    }

    aiTeamUpdates.push({ ...team, youthPlayers: remaining });
  }

  if (aiTeamUpdates.length > 0) {
    await putTeamsBulk(aiTeamUpdates);
  }

  return updatedCohort;
}

// User promotes a youth player to first team
export async function promoteYouthPlayer(playerId) {
  const save = await getSave();
  const youth = (save.youthCohort ?? []).find(p => p.id === playerId);
  if (!youth) throw new Error('Youth player not found');

  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('Team not found');

  const weeklyWage = Math.max(1_000, Math.round((Number(youth.value) || 500_000) * 0.05 / 52));
  const promoteYear = parseInt((save.season || '').split('/')[0]) || 0;

  const promoted = {
    ...youth,
    isYouth:  false,
    teamId:   save.userTeamId,
    inSquad:  true,
    wage:     weeklyWage,
    contractExpiry: promoteYear + 3, // first pro contract, standard 3 years
  };

  await putPlayer(promoted);

  const newCohort = save.youthCohort.filter(p => p.id !== playerId);
  await putSave({ ...save, youthCohort: newCohort });

  return promoted;
}

// User releases a youth player
export async function releaseYouthPlayer(playerId) {
  const save      = await getSave();
  const newCohort = (save.youthCohort ?? []).filter(p => p.id !== playerId);
  await putSave({ ...save, youthCohort: newCohort });
}

// Get academy info for display
export function getAcademyInfo(reputation, investment = 0) {
  const tier = academyTier(reputation, investment);
  const inv  = Math.min(100, Math.max(0, investment ?? 0));
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
      elite:   'World-class facilities. 25% chance of a wonderkid breakthrough each season.',
      top:     'Excellent development pathway. Occasionally produces wonderkid talent (10%).',
      good:    'Solid youth setup. Rare wonderkid potential (5%). Reliable squad depth.',
      average: 'Modest facilities. Wonderkid breakthroughs are very rare (1%).',
      poor:    'Limited resources. Youth intake quality is variable. Wonderkids almost unheard of.',
    }[tier],
    investment: inv,
    cohortSize: 10 + Math.round(inv / 100 * 4),
  };
}
