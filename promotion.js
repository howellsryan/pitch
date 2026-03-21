/** modules/promotion.js — End-of-season promotion/relegation and European qualification */

import {
  getSave, putSave, getAllTeams, getTeam, putTeam, putTeamsBulk,
  getAllPlayers, putPlayersBulk, getAllStandings,
  replaceAllFixtures, replaceAllStandings,
} from './db.js';
import { generateLeagueFixtures } from './fixtures.js';
import { blankStandingRow }       from './standings.js';
import { reputationBudget }        from './season.js';

// ─── Determine European qualification from PL table ──────────
export function getEuropeanQualifiers(sortedStandings) {
  return {
    ucl:   sortedStandings.slice(0, 4).map(r => r.teamId),  // Top 4
    uel:   sortedStandings.slice(4, 6).map(r => r.teamId),  // 5th-6th
    uecl: [sortedStandings[6]?.teamId].filter(Boolean),     // 7th
    relegated: sortedStandings.slice(-3).map(r => r.teamId), // Bottom 3
  };
}

// ─── Determine Championship outcome ──────────────────────────
export function getChampionshipOutcome(sortedStandings) {
  return {
    promoted:  sortedStandings.slice(0, 3).map(r => r.teamId),  // 1st, 2nd auto + 3rd play-off
    relegated: sortedStandings.slice(-3).map(r => r.teamId),    // Bottom 3 to League One
  };
}

// ─── Process promotion/relegation between PL and Championship ─
export async function processLeagueChanges(plStandings, champStandings, userTeamId) {
  const plQual    = getEuropeanQualifiers(plStandings);
  const champOut  = getChampionshipOutcome(champStandings);
  const allTeams  = await getAllTeams();
  const byId      = new Map(allTeams.map(t => [t.id, t]));

  const relegatedPL  = plQual.relegated;    // 3 PL teams go down
  const promotedChamp = champOut.promoted;   // 3 Championship teams go up

  // Update team leagues
  for (const tid of relegatedPL) {
    const t = byId.get(tid);
    if (t) await putTeam({ ...t, league: 'Championship', reputation: Math.max(60, (t.reputation ?? 70) - 3) });
  }
  for (const tid of promotedChamp) {
    const t = byId.get(tid);
    if (t) await putTeam({ ...t, league: 'Premier League', reputation: Math.min(82, (t.reputation ?? 65) + 4) });
  }

  return {
    relegated:   relegatedPL,
    promoted:    promotedChamp,
    ucl:         plQual.ucl,
    uel:         plQual.uel,
    uecl:        plQual.uecl,
    userRelInfo: {
      relegated: relegatedPL.includes(userTeamId),
      promoted:  promotedChamp.includes(userTeamId),
      ucl:       plQual.ucl.includes(userTeamId),
      uel:       plQual.uel.includes(userTeamId),
      uecl:      plQual.uecl.includes(userTeamId),
    },
  };
}

// ─── Get user's European cup for next season ─────────────────
export function assignCupsFromPosition(position, userLeague, cupState) {
  const cups = [];

  if (userLeague === 'Championship') {
    // No European football in the Championship
    cups.push('fa_cup', 'league_cup');
    return cups;
  }

  // PL cups
  cups.push('fa_cup', 'league_cup');

  if      (position <= 4) cups.push('ucl');
  else if (position <= 6) cups.push('uel');
  else if (position === 7) cups.push('uecl');

  return cups;
}

// ─── Relegation zone helper for UI ───────────────────────────
export function getZoneInfo(position, totalTeams = 20) {
  if (totalTeams === 20) { // PL
    if (position <= 4)  return { zone: 'ucl',   color: '#3b82f6', label: 'Champions League' };
    if (position <= 6)  return { zone: 'uel',   color: '#f97316', label: 'Europa League' };
    if (position === 7) return { zone: 'uecl',  color: '#22c55e', label: 'Conference League' };
    if (position >= 18) return { zone: 'rel',   color: '#e84855', label: 'Relegation' };
    if (position >= 15) return { zone: 'risk',  color: '#f5c842', label: 'Danger Zone' };
  } else if (totalTeams === 24) { // Championship
    if (position <= 2)  return { zone: 'auto',  color: '#3b82f6', label: 'Automatic Promotion' };
    if (position <= 6)  return { zone: 'playoff',color: '#22c55e', label: 'Play-off Place' };
    if (position >= 22) return { zone: 'rel',   color: '#e84855', label: 'Relegation' };
  }
  return { zone: 'mid', color: 'transparent', label: '' };
}
