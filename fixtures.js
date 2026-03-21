/** modules/fixtures.js — Circle-method round-robin fixture generation with H/A optimization */

import { getAllFixtures, putFixture } from './db.js';

export function generateLeagueFixtures(teamIds, seasonYear) {
  // 1. Shuffle to prevent any team always being "pinned" at index 0
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const teams    = [...shuffled];
  if (teams.length % 2 !== 0) teams.push('BYE');
  const n = teams.length;

  // 2. First half: circle-method round-robin
  const firstHalf = [];
  const wt = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      if (wt[i] !== 'BYE' && wt[n-1-i] !== 'BYE')
        pairs.push({ home: wt[i], away: wt[n-1-i] });
    }
    firstHalf.push(pairs);
    wt.splice(1, 0, wt.pop());
  }

  // 3. Second half: swap H/A, shuffle round order independently
  const secondHalf = firstHalf
    .map(r => r.map(({ home, away }) => ({ home: away, away: home })))
    .sort(() => Math.random() - 0.5);

  // 4. Greedy optimisation: swap adjacent rounds to reduce long consecutive runs
  let allRounds = [...firstHalf, ...secondHalf];

  function countBadRuns(rounds) {
    const tms = new Set(rounds.flatMap(r => r.flatMap(p => [p.home, p.away])));
    let bad = 0;
    for (const t of tms) {
      let run = 0, last = '';
      for (const r of rounds) {
        const m = r.find(p => p.home === t || p.away === t);
        if (!m) continue;
        const v = m.home === t ? 'H' : 'A';
        run = v === last ? run + 1 : 1;
        last = v;
        if (run >= 4) bad += run - 3; // Penalise runs > 3
      }
    }
    return bad;
  }

  let score = countBadRuns(allRounds);
  for (let iter = 0; iter < 300 && score > 0; iter++) {
    const i = Math.floor(Math.random() * allRounds.length);
    const j = Math.floor(Math.random() * allRounds.length);
    if (i === j) continue;
    [allRounds[i], allRounds[j]] = [allRounds[j], allRounds[i]];
    const newScore = countBadRuns(allRounds);
    if (newScore > score) [allRounds[i], allRounds[j]] = [allRounds[j], allRounds[i]];
    else score = newScore;
  }

  // 5. Convert to fixture objects
  const startDate = new Date(seasonYear, 7, 9); // Aug 9
  return allRounds.flatMap((round, gwIdx) =>
    round.map(({ home, away }) => ({
      id:          `gw${gwIdx+1}_${home}_${away}`,
      competition: 'league',
      gameweek:    gwIdx + 1,
      homeTeamId:  home,
      awayTeamId:  away,
      date:        new Date(startDate.getTime() + gwIdx * 7 * 86400000).toISOString(),
      played:      false,
      homeGoals:   null,
      awayGoals:   null,
      homeScorers: [],
      awayScorers: [],
      events:      [],
    }))
  );
}

// ─── Query helpers ──────────────────────────────────────────

export async function getUpcomingForTeam(teamId) {
  const all = await getAllFixtures();
  return all
    .filter(f => !f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => a.gameweek - b.gameweek);
}

export async function getLastResultForTeam(teamId) {
  const all = await getAllFixtures();
  return all
    .filter(f => f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => b.gameweek - a.gameweek)[0] ?? null;
}

export async function getNextFixtureForTeam(teamId) {
  const upcoming = await getUpcomingForTeam(teamId);
  return upcoming[0] ?? null;
}

export async function getRecentResults(limit = 30) {
  const all = await getAllFixtures();
  return all
    .filter(f => f.played)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, limit);
}
