// tools/lib/leagueSchema.mjs
// Central registry of the 7 leagues footy-sim has CSVs for, and where each
// side's files live. Serie A and Eredivisie are deliberately absent - they
// stay on pitch's own data per docs/plan/06-data-reconciliation.md
// ("footy-sim has no CSVs for either").

export const VALID_POSITIONS = new Set([
  'GK', 'RB', 'LB', 'CB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'RW', 'LW', 'CF', 'ST',
]);

export const POSITION_ORDER = {
  GK: 0, RB: 1, CB: 2, LB: 3, CDM: 4, CM: 5, CAM: 6, RM: 7, LM: 8, RW: 9, LW: 10, CF: 11, ST: 12,
};

export const LEAGUES = [
  {
    key: 'prem', label: 'Premier League',
    footySimCsv: 'prem-players.csv',
    pitchPlayersCsv: 'pl_players.csv', pitchTeamsCsv: 'pl_teams.csv',
    dataFile: 'plTeams.js', arrayName: 'PL_TEAMS', helperName: 'plp',
  },
  {
    key: 'championship', label: 'Championship',
    footySimCsv: 'championship-players.csv',
    pitchPlayersCsv: 'championship_players.csv', pitchTeamsCsv: 'championship_teams.csv',
    dataFile: 'championship.js', arrayName: 'CHAMPIONSHIP_TEAMS', helperName: 'cp',
  },
  {
    key: 'league_one', label: 'League One',
    footySimCsv: 'league1-players.csv',
    pitchPlayersCsv: 'league_one_players.csv', pitchTeamsCsv: 'league_one_teams.csv',
    dataFile: 'leagueOne.js', arrayName: 'LEAGUE_ONE_TEAMS', helperName: 'l1p',
  },
  {
    key: 'league_two', label: 'League Two',
    footySimCsv: 'league2-players.csv',
    pitchPlayersCsv: 'league_two_players.csv', pitchTeamsCsv: 'league_two_teams.csv',
    dataFile: 'leagueTwo.js', arrayName: 'LEAGUE_TWO_TEAMS', helperName: 'l2p',
  },
  {
    key: 'bundesliga', label: 'Bundesliga',
    footySimCsv: 'bundesliga-players.csv',
    pitchPlayersCsv: 'bundesliga_players.csv', pitchTeamsCsv: 'bundesliga_teams.csv',
    dataFile: 'bundesliga.js', arrayName: 'BUNDESLIGA_TEAMS', helperName: 'blp',
  },
  {
    key: 'la_liga', label: 'La Liga',
    footySimCsv: 'laliga-players.csv',
    pitchPlayersCsv: 'la_liga_players.csv', pitchTeamsCsv: 'la_liga_teams.csv',
    dataFile: 'laLiga.js', arrayName: 'LA_LIGA_TEAMS', helperName: 'llp',
  },
  {
    key: 'ligue_1', label: 'Ligue 1',
    footySimCsv: 'ligue1-players.csv',
    pitchPlayersCsv: 'ligue_1_players.csv', pitchTeamsCsv: 'ligue_1_teams.csv',
    dataFile: 'ligue1.js', arrayName: 'LIGUE_1_TEAMS', helperName: 'lg1p',
  },
];

// Leagues that stay on pitch's own data - footy-sim has no CSV for either.
export const PITCH_NATIVE_LEAGUES = [
  {
    key: 'serie_a', label: 'Serie A', dataFile: 'serieA.js', arrayName: 'SERIE_A_TEAMS',
    pitchPlayersCsv: 'serie_a_players.csv', pitchTeamsCsv: 'serie_a_teams.csv',
  },
  {
    key: 'eredivisie', label: 'Eredivisie', dataFile: 'eredivisie.js', arrayName: 'EREDIVISIE_TEAMS',
    pitchPlayersCsv: 'eredivisie_players.csv', pitchTeamsCsv: 'eredivisie_teams.csv',
  },
];

export function allTrackedLeagueKeys() {
  return [...LEAGUES.map((l) => l.key), ...PITCH_NATIVE_LEAGUES.map((l) => l.key)];
}
