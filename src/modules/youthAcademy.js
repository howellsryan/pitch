import { getAllPlayers, getPlayer, getSave, getTeam, putPlayer, putPlayersBulk, putSave, putTeamsBulk } from './db.js';
import { normalizePlayerModel } from './playerModel.js';
import { applyLedgerMovement } from './clubFinance.js';
import {
  ensureOpenRegistrationSpell,
  isAcademyPlayer,
  isSeniorEligiblePlayer,
  normalizePlayerStatus,
  transitionPlayerStatus,
} from './playerStatus.js';

/** modules/youthAcademy.js -- calibrated youth generation plus P9-compatible commands. */
export const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RM','LM','ST','ST','CF','RW','LW'];
export const ACADEMY_ROSTER_CAP = 24;

export const NAMES_BY_NATION = {
  english: {
    first: ['Jack','Harry','George','Oliver','Charlie','James','Thomas','Alfie','Freddie','Archie','Joshua','William','Ethan','Mason','Logan','Liam','Noah','Theo','Finley','Sebastian','Oscar','Henry','Isaac','Daniel','Samuel','Joseph','Leon','Elliot','Ryan','Tyler'],
    last: ['Smith','Jones','Williams','Taylor','Brown','Davies','Evans','Wilson','Thomas','Roberts','Walker','Wright','Robinson','Thompson','White','Hughes','Edwards','Green','Hall','Lewis','Harris','Clarke','Patel','Jackson','Wood','Turner','Martin','Cooper','Hill','Morris'],
  },
  spanish: {
    first: ['Alejandro','Pablo','Diego','Carlos','Sergio','Adrian','Alvaro','Marcos','Javier','Fernando','Rodrigo','Ruben','Miguel','Iker','Jesus','Raul','David','Ivan','Borja','Unai','Oscar','Luis','Victor','Aitor','Gonzalo','Dani','Mateo','Andres','Nacho','Santi'],
    last: ['Garcia','Martinez','Lopez','Sanchez','Gonzalez','Fernandez','Perez','Rodriguez','Jimenez','Ruiz','Hernandez','Diaz','Moreno','Alvarez','Romero','Alonso','Torres','Navarro','Dominguez','Ramos','Vazquez','Gil','Serrano','Blanco','Molina','Castro','Ortega','Delgado','Ortiz','Ibanez'],
  },
  german: {
    first: ['Lukas','Jonas','Leon','Niklas','Maximilian','Florian','Moritz','Felix','Tobias','Julian','Luca','Tim','Fabian','Patrick','Dominik','Kai','Marc','Stefan','Simon','Alexander','Erik','Nico','Henrik','Lars','Soren','Philipp','Robin','Sebastian','Manuel','Kevin'],
    last: ['Muller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Schafer','Koch','Richter','Bauer','Klein','Wolf','Schroder','Neumann','Schwarz','Zimmermann','Braun','Kruger','Hartmann','Lange','Werner','Schmitt','Weiss','Krause','Maier','Lehmann'],
  },
  italian: {
    first: ['Lorenzo','Matteo','Leonardo','Francesco','Alessandro','Luca','Marco','Andrea','Davide','Simone','Federico','Riccardo','Giovanni','Antonio','Stefano','Niccolo','Jacopo','Emanuele','Daniele','Filippo','Samuele','Edoardo','Pietro','Gabriele','Cristian','Alessio','Gianluca','Salvatore','Fabrizio','Roberto'],
    last: ['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti','Barbieri','Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli','Martini','Leone'],
  },
  french: {
    first: ['Lucas','Hugo','Nathan','Tom','Theo','Enzo','Mathis','Maxime','Romain','Antoine','Alexis','Baptiste','Clement','Florian','Guillaume','Kevin','Nicolas','Pierre','Quentin','Raphael','Adrien','Benjamin','Charles','Dylan','Ethan','Gauthier','Jules','Louis','Mehdi','Sofiane'],
    last: ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','Andre','Mercier','Dupont','Lambert','Bonnet','Francois','Martinez','Legrand'],
  },
  dutch: {
    first: ['Lars','Daan','Sem','Luuk','Thijs','Ruben','Bram','Jesse','Jasper','Jordi','Milan','Sander','Wouter','Niels','Tim','Bas','Rick','Robin','Stefan','Kevin','Dylan','Joey','Finn','Levi','Julian','Thomas','Matthijs','Owen','Teun','Quinten'],
    last: ['De Jong','Van Dijk','Bakker','Visser','Smit','Meijer','De Vries','Peters','Mulder','Hendriks','Kuiper','Vermeer','Postma','Janssen','Willems','Van den Berg','Bosman','Hoekstra','Dijkstra','Brouwer','Kok','Dekker','Lammers','Schouten','Berghuis','Koopmeiners','Wijnaldum','Timber','Gravenberch','Gakpo'],
  },
};

export const LEAGUE_NATION = {
  'Premier League':'english', Championship:'english', 'League One':'english', 'League Two':'english',
  'La Liga':'spanish', Bundesliga:'german', 'Serie A':'italian', 'Ligue 1':'french', Eredivisie:'dutch',
};

export function randName(league) {
  const pool = NAMES_BY_NATION[LEAGUE_NATION[league] ?? 'english'];
  return `${pool.first[Math.floor(Math.random() * pool.first.length)]} ${pool.last[Math.floor(Math.random() * pool.last.length)]}`;
}

export function academyTier(reputation, investment = 0) {
  const effectiveRep = reputation + Math.min(100, Math.max(0, investment)) * .15;
  if (effectiveRep >= 90) return 'elite';
  if (effectiveRep >= 80) return 'top';
  if (effectiveRep >= 68) return 'good';
  if (effectiveRep >= 55) return 'average';
  return 'poor';
}

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
  await putTeamsBulk([{
    ...applyLedgerMovement(team, { category:'academy_investment', amount:-cost, description:`Academy investment (+${points} pts)` }),
    academyInvestment:newInvestment,
  }]);
  return { success:true, pointsGained:points, cost, newInvestment };
}

export const POT_4STAR_CAP = 87;

export function generateYouthPlayer(teamId, reputation, season, index, league, isWonderkid, investment = 0) {
  const tier = academyTier(reputation, investment);
  const age = 15 + Math.floor(Math.random() * 4);
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
  const cfg = {
    elite:{ lo:67, hi:84, tlo:85, thi:87, tail:.22 },
    top:{ lo:63, hi:82, tlo:83, thi:87, tail:.13 },
    good:{ lo:59, hi:79, tlo:80, thi:87, tail:.08 },
    average:{ lo:56, hi:76, tlo:77, thi:87, tail:.05 },
    poor:{ lo:53, hi:73, tlo:74, thi:87, tail:.03 },
  }[tier];
  const inTail = Math.random() < cfg.tail;
  const rawPot = inTail
    ? cfg.tlo + Math.floor(Math.random() * (cfg.thi - cfg.tlo + 1))
    : cfg.lo + Math.floor(Math.random() * (cfg.hi - cfg.lo + 1));
  const baseRating = Math.max(26, Math.round(rawPot * .52 + Math.random() * 10));
  const finalPot = isWonderkid ? Math.max(88, rawPot) : Math.min(POT_4STAR_CAP, rawPot);
  const spread = distributeAttributes(pos, baseRating);
  const seasonStr = String(season).replace('/', '_');
  const id = `youth_${teamId}_${seasonStr}_${index}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  return normalizePlayerModel({
    id, name:randName(league), position:pos, age,
    attack:spread.attack, midfield:spread.midfield, defence:spread.defence, goalkeeping:spread.goalkeeping,
    potentialRating:finalPot, growthPoints:0, peakAge:calcYouthPeakAge(pos),
    value:youthValue(baseRating, age, finalPot), wage:50_000 + Math.floor(Math.random() * 50_000),
    teamId:null, youthTeamId:teamId, isYouth:true, isWonderkid, season,
    fitness:100, injured:false, suspended:false, inSquad:false,
    goals:0, assists:0, cleanSheets:0, form:50, transferListed:false,
  });
}

export function distributeAttributes(pos, base) {
  const jitter = () => Math.floor(Math.random() * 8) - 4;
  const youthClamp = value => Math.max(10, Math.min(99, value));
  if (pos === 'GK') return {
    goalkeeping:youthClamp(base + jitter() + 4), defence:youthClamp(base + jitter() - 4),
    midfield:youthClamp(base + jitter() - 8), attack:youthClamp(base + jitter() - 12),
  };
  if (['ST','CF'].includes(pos)) return {
    attack:youthClamp(base + jitter() + 4), midfield:youthClamp(base + jitter() - 2),
    defence:youthClamp(base + jitter() - 8), goalkeeping:youthClamp(base + jitter() - 16),
  };
  if (['RW','LW','CAM'].includes(pos)) return {
    attack:youthClamp(base + jitter() + 2), midfield:youthClamp(base + jitter() + 2),
    defence:youthClamp(base + jitter() - 8), goalkeeping:youthClamp(base + jitter() - 16),
  };
  if (['CM','CDM','RM','LM'].includes(pos)) return {
    midfield:youthClamp(base + jitter() + 4), attack:youthClamp(base + jitter() - 2),
    defence:youthClamp(base + jitter() - 2), goalkeeping:youthClamp(base + jitter() - 16),
  };
  return {
    defence:youthClamp(base + jitter() + 4), midfield:youthClamp(base + jitter() - 2),
    attack:youthClamp(base + jitter() - 8), goalkeeping:youthClamp(base + jitter() - 16),
  };
}

export function calcYouthPeakAge(pos) {
  if (['GK','CB'].includes(pos)) return 29 + Math.floor(Math.random() * 3);
  if (['RB','LB','CDM'].includes(pos)) return 28 + Math.floor(Math.random() * 3);
  if (['CM','CAM','RM','LM'].includes(pos)) return 27 + Math.floor(Math.random() * 3);
  if (['ST','CF'].includes(pos)) return 27 + Math.floor(Math.random() * 2);
  if (['RW','LW'].includes(pos)) return 26 + Math.floor(Math.random() * 3);
  return 28;
}

export function youthValue(base, age, potential) {
  const ageFactor = age <= 16 ? .6 : age <= 17 ? .7 : age <= 18 ? .8 : .9;
  if (potential < 55) return Math.round((250_000 + Math.max(0, potential - 30) * 20_000) * ageFactor);
  const potNorm = (potential - 55) / 44;
  return Math.round((500_000 + Math.pow(potNorm, 1.8) * 9_500_000) * ageFactor);
}

export function generateCohort(teamId, reputation, season, league, investment = 0) {
  const tier = academyTier(reputation, investment);
  const size = 10 + Math.round(Math.min(100, Math.max(0, investment)) / 100 * 4);
  const wonderkidChance = { elite:.20, top:.10, good:.075, average:.05, poor:.025 }[tier];
  const wonderkidSlot = Math.random() < wonderkidChance ? Math.floor(Math.random() * size) : -1;
  return Array.from({ length:size }, (_, index) =>
    generateYouthPlayer(teamId, reputation, season, index, league, index === wonderkidSlot, investment));
}

function youthSeasonAfter(season) {
  const year = Number.parseInt(String(season ?? '').split('/')[0], 10) || 2025;
  const next = year + 1;
  return `${next}/${String(next + 1).slice(2)}`;
}

function youthCanonicalAcademy(raw, teamId, season, gameweek = 1) {
  return ensureOpenRegistrationSpell(normalizePlayerStatus(normalizePlayerModel({
    ...raw,
    teamId,
    youthTeamId:teamId,
    isYouth:true,
    inSquad:false,
    onLoan:false,
    loanedFrom:null,
    loanedTo:null,
    loanOriginalTeamId:null,
    playerStatus:'academy',
    contractTeamId:teamId,
    registeredTeamId:teamId,
    activeAgreementId:null,
    activeLoanAgreement:null,
    contractExpiry:null,
    signedThisSeason:false,
  })), { season, gameweek });
}

/**
 * P9 season intake. `season.js` has already aged the canonical players before
 * this runs, so this function handles eligibility/promotions/releases and adds
 * the next season's intake directly to the players store. It deliberately
 * returns an empty legacy cohort so `newSave.youthCohort` stays retired.
 */
export async function runYouthIntake(save, allTeams) {
  const nextSeason = youthSeasonAfter(save.season);
  const players = await getAllPlayers();
  const patches = [];
  const normalizedPlayers = players.map(raw => {
    // season.js's legacy return write clears the old loan flags first. Close the
    // canonical loan spell here rather than allowing stale P9 metadata to keep
    // the player registered at the loan club.
    if (raw.playerStatus === 'loan'
      && !raw.onLoan
      && raw.contractTeamId
      && raw.teamId
      && String(raw.teamId) === String(raw.contractTeamId)) {
      const returned = transitionPlayerStatus(raw, {
        status:'first_team', contractTeamId:raw.contractTeamId, registeredTeamId:raw.contractTeamId,
        season:save.season, gameweek:save.currentGameweek,
        reason:'season_loan_return', idempotencyKey:`season-loan-return:${raw.id}:${save.season}`,
        patch:{ inSquad:true },
      });
      patches.push(returned);
      return returned;
    }
    return normalizePlayerStatus(raw);
  });

  const seniorCounts = new Map(allTeams.map(team => [
    team.id,
    normalizedPlayers.filter(player => isSeniorEligiblePlayer(player, team.id)).length,
  ]));
  const academyByTeam = new Map(allTeams.map(team => [team.id, []]));

  for (const player of normalizedPlayers) {
    if (!isAcademyPlayer(player)) continue;
    const teamId = player.contractTeamId;
    const isUser = teamId === save.userTeamId;
    const canPromoteAI = !isUser
      && Number(player.age ?? 0) >= 18
      && Number(player.potentialRating ?? 0) >= 70
      && (seniorCounts.get(teamId) ?? 0) < 30;
    if (canPromoteAI) {
      const year = Number.parseInt(nextSeason.split('/')[0], 10) || 2026;
      const promoted = transitionPlayerStatus(player, {
        status:'first_team', contractTeamId:teamId, registeredTeamId:teamId,
        season:nextSeason, gameweek:1, reason:'ai_academy_promotion',
        idempotencyKey:`ai-academy-promotion:${player.id}:${nextSeason}`,
        patch:{
          inSquad:true,
          wage:Math.max(1_000, Math.round((Number(player.value) || 500_000) * .05 / 52)),
          contractExpiry:year + 3,
          signedThisSeason:false,
          squadRole:'prospect',
        },
      });
      patches.push(promoted);
      seniorCounts.set(teamId, (seniorCounts.get(teamId) ?? 0) + 1);
      continue;
    }
    if (Number(player.age ?? 0) > 19) {
      patches.push(transitionPlayerStatus(player, {
        status:'free_agent', season:nextSeason, gameweek:1,
        reason:'academy_age_release', idempotencyKey:`academy-age-release:${player.id}:${nextSeason}`,
        patch:{ contractExpiry:null, wage:0, inSquad:false, signedThisSeason:false, squadRole:null },
      }));
      continue;
    }
    const retained = normalizePlayerStatus({ ...player, contractExpiry:null, inSquad:false, signedThisSeason:false });
    patches.push(retained);
    if (!academyByTeam.has(teamId)) academyByTeam.set(teamId, []);
    academyByTeam.get(teamId).push(retained);
  }

  const existingIds = new Set(normalizedPlayers.map(player => String(player.id)));
  for (const team of allTeams) {
    const existing = academyByTeam.get(team.id) ?? [];
    const room = Math.max(0, ACADEMY_ROSTER_CAP - existing.length);
    if (!room) continue;
    const generated = generateCohort(
      team.id,
      team.reputation ?? 70,
      nextSeason,
      team.league ?? save.userLeague ?? 'Premier League',
      team.academyInvestment ?? 0,
    ).slice(0, room);
    generated.forEach((raw, index) => {
      const stableId = `academy_${team.id}_${String(nextSeason).replace('/', '_')}_${index}`;
      if (existingIds.has(stableId)) return;
      const canonical = youthCanonicalAcademy({ ...raw, id:stableId, season:nextSeason }, team.id, nextSeason, 1);
      patches.push(canonical);
      existingIds.add(stableId);
    });
  }

  if (patches.length) await putPlayersBulk(patches);
  const legacyTeamPatches = allTeams
    .filter(team => Array.isArray(team.youthPlayers) && team.youthPlayers.length)
    .map(team => ({ ...team, youthPlayers:[] }));
  if (legacyTeamPatches.length) await putTeamsBulk(legacyTeamPatches);
  return [];
}

/** Compatibility command; the P9 Academy surface calls p9Runtime directly. */
export async function promoteYouthPlayer(playerId) {
  const save = await getSave();
  const player = normalizePlayerStatus(await getPlayer(playerId));
  if (!save || !player || !isAcademyPlayer(player, save.userTeamId)) throw new Error('Youth player not found');
  const year = Number.parseInt(String(save.season ?? '').split('/')[0], 10) || 2025;
  const promoted = transitionPlayerStatus(player, {
    status:'first_team', contractTeamId:save.userTeamId, registeredTeamId:save.userTeamId,
    season:save.season, gameweek:save.currentGameweek, reason:'academy_promotion',
    idempotencyKey:`academy-promotion:${player.id}:${save.season}:${save.currentGameweek}`,
    patch:{
      inSquad:true,
      wage:Math.max(1_000, Math.round((Number(player.value) || 500_000) * .05 / 52)),
      contractExpiry:year + 3,
      signedThisSeason:true,
      squadRole:'prospect',
    },
  });
  await putPlayer(promoted);
  return promoted;
}

/** Compatibility command; release means canonical free agency, never deletion. */
export async function releaseYouthPlayer(playerId) {
  const save = await getSave();
  const player = normalizePlayerStatus(await getPlayer(playerId));
  if (!save || !player || !isAcademyPlayer(player, save.userTeamId)) throw new Error('Youth player not found');
  const released = transitionPlayerStatus(player, {
    status:'free_agent', season:save.season, gameweek:save.currentGameweek,
    reason:'academy_release', idempotencyKey:`academy-release:${player.id}:${save.season}:${save.currentGameweek}`,
    patch:{ contractExpiry:null, wage:0, inSquad:false, signedThisSeason:false, squadRole:null },
  });
  await putPlayer(released);
  return released;
}

export function getAcademyInfo(reputation, investment = 0) {
  const tier = academyTier(reputation, investment);
  const inv = Math.min(100, Math.max(0, investment ?? 0));
  return {
    tier,
    label:{ elite:'Elite Academy', top:'Top Academy', good:'Good Academy', average:'Average Academy', poor:'Basic Academy' }[tier],
    stars:{ elite:5, top:4, good:3, average:2, poor:1 }[tier],
    description:{
      elite:'World-class facilities. 20% chance of a wonderkid breakthrough each season.',
      top:'Excellent development pathway. Occasionally produces wonderkid talent (10%).',
      good:'Solid youth setup. Rare wonderkid potential. Reliable squad depth.',
      average:'Modest facilities. Elite breakthroughs are uncommon.',
      poor:'Limited resources. Youth intake quality is variable.',
    }[tier],
    investment:inv,
    cohortSize:10 + Math.round(inv / 100 * 4),
  };
}
