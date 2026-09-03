import { getAllPlayers, getSave, putPlayersBulk, putSave } from './db.js';
import { selectEleven } from './matchEngine.js';

/**
 * Senior free agents verified for September 2026. Fresh careers only apply
 * this list to names already present in Pitch's canonical player dataset, so
 * Pitch remains the source of truth for IDs, ratings, wages and potential.
 */
export const STARTING_FREE_AGENT_NAMES = Object.freeze([
  'Mohamed Salah','Marcelo Brozovic','Dušan Vlahović','John Stones','Manuel Akanji',
  'Ander Astralaga','Idrissa Gueye','Tijjani Reijnders','Anthony Dos Santos','Filip Kostić',
  'Nathan Aké','Leandro Trossard','James Milner','Rasmus Højlund','Bertrand Traoré',
  'Felipe','Thomas Partey','Vicente Guaita','Jean-Philippe Gbamin','Mason Greenwood',
  'Douglas Luiz','Allan Saint-Maximin','Jonjo Shelvey','Neto','Miguel Almirón',
  'Lloyd Kelly','Mason Holgate','Fraser Forster','Ghislain Konan','Kevin Mbabu',
  'Giovani Lo Celso','Michail Antonio','Nathaniel Clyne','Angelo Ogbonna','Ben Godfrey',
  'Davinson Sánchez','Sven Ulreich','Brandon Williams','Moise Kean','Cheikhou Kouyaté',
  'Nayef Aguerd','Moussa Niakhaté','Adrian','Ryan Fraser','Lutsharel Geertruida',
  'Zach Steffen','Daniel Podence','Saïd Benrahma','Jakub Kiwior','Carlos Vinicius',
  'Nicolo Zaniolo','Adam Webster','Mohamed Elneny','Yves Bissouma','Ben Mee',
  'Aaron Cresswell','Vladimír Coufal','Isaac Hayden','Calum Chambers','Jeffrey Schlupp',
  'Jeff Hendrick','Willy Boly','Jamal Lewis','Robin Olsen','Sergio Gómez',
  'Sèrge Aurier','James Tomkins','Solly March','Bilal El Khannouss','Pascal Groß',
  'Łukasz Fabiański','Neal Maupay','Harvey Elliott','John Lundstram','Fábio Vieira',
  'Mario Lemina','Mattia Perin','Willian','Craig Dawson','David Ospina',
  'Mattia De Sciglio','Matt Ritchie','Abdullah Otayf','Remo Freuler','Tariq Lamptey',
  'Bruno Jordão','Ciaran Clark','Ezgjan Alioski','Darren Randolph','Nathan Redmond',
  'Wout Weghorst','Javier Manquillo','Joshua King','Harry Arter','Gabriel Slonina',
  'Josh Brownhill','Bryan Gil','Emerson Royal','Paul Dummett','Hwang Ui-Jo',
]);

export function normalizeFreeAgentName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STARTING_FREE_AGENT_KEYS = new Set(STARTING_FREE_AGENT_NAMES.map(normalizeFreeAgentName));

export function isVerifiedStartingFreeAgent(playerOrName) {
  const name = typeof playerOrName === 'string' ? playerOrName : playerOrName?.name;
  return STARTING_FREE_AGENT_KEYS.has(normalizeFreeAgentName(name));
}

export function prepareStartingFreeAgent(player) {
  return {
    ...player,
    teamId:'free_agents',
    contractExpiry:null,
    signedThisSeason:false,
    transferListed:false,
    inSquad:false,
    onLoan:false,
    loanedFrom:null,
    loanOriginalTeamId:null,
    loanSeason:null,
    squadRole:null,
    squadRoleSource:null,
    squadRoleTeamId:null,
    playingTimeAgreement:null,
  };
}

/**
 * Run exactly once from startNewGame after the canonical player rows exist.
 * Returns the actual intersection count, which is intentionally data-driven:
 * names absent from Pitch are ignored rather than synthesised.
 */
export async function seedVerifiedStartingFreeAgents() {
  const [save, players] = await Promise.all([getSave(), getAllPlayers()]);
  if (!save || !players.length) return { moved:0, playerIds:[] };

  const moved = players.filter(player => player.teamId !== 'free_agents' && isVerifiedStartingFreeAgent(player));
  if (!moved.length) return { moved:0, playerIds:[] };

  const movedIds = new Set(moved.map(player => String(player.id)));
  const preparedById = new Map(moved.map(player => [String(player.id), prepareStartingFreeAgent(player)]));
  await putPlayersBulk(moved.map(player => preparedById.get(String(player.id))));

  const nextRoles = { ...(save.playerRoles ?? {}) };
  for (const id of movedIds) delete nextRoles[id];

  const userPlayers = players
    .filter(player => String(player.teamId) === String(save.userTeamId) && !movedIds.has(String(player.id)))
    .map(player => preparedById.get(String(player.id)) ?? player);
  const nextXi = selectEleven(userPlayers, save.formation ?? '4-3-3', null).map(player => player.id);
  const lineupWasAffected = Array.isArray(save.lineup) && save.lineup.some(id => movedIds.has(String(id)));

  await putSave({
    ...save,
    playerRoles:nextRoles,
    lineup:lineupWasAffected ? (nextXi.length === 11 ? nextXi : null) : save.lineup,
    startingFreeAgentsSeeded:true,
  });

  return { moved:moved.length, playerIds:[...movedIds] };
}
