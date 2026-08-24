/** modules/fixtures.js — Mirrored double round-robin fixture generation
 *
 * How real leagues do it:
 *   1. Circle-method generates N-1 rounds (first half) — every pair meets once.
 *   2. Second half is the exact mirror: same round order, home/away swapped.
 *   3. Within each half, rounds are shuffled to minimise long H/A runs,
 *      but the two halves stay aligned so the second half is always the
 *      mirror of the first.
 *   4. A final pass shuffles the second half's round order to ensure no
 *      team plays the same opponent in consecutive gameweeks — especially
 *      at the half-boundary (GW19 → GW20).
 */

function generateLeagueFixtures(teamIds, seasonYear) {
  // 1. Shuffle teams so the "pinned" team varies each new game
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const teams    = [...shuffled];
  if (teams.length % 2 !== 0) teams.push('BYE');
  const n = teams.length;
  const halfLen = n - 1; // rounds per half

  // 2. Circle-method: generate first half (N-1 rounds, each team plays once per round)
  const wt = [...teams];
  const firstHalf = [];
  for (let r = 0; r < halfLen; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      if (wt[i] !== 'BYE' && wt[n - 1 - i] !== 'BYE') {
        // Randomly assign home/away for each pair
        if (Math.random() < 0.5) pairs.push({ home: wt[i], away: wt[n - 1 - i] });
        else pairs.push({ home: wt[n - 1 - i], away: wt[i] });
      }
    }
    firstHalf.push(pairs);
    wt.splice(1, 0, wt.pop());
  }

  // 3. Balance H/A in first half — each team should have ~half home games
  _balanceHomeAway(firstHalf, halfLen);

  // 4. Optimise round order within first half to reduce consecutive H/A runs
  const optFirst = _optimiseRoundOrder(firstHalf);

  // 5. Second half is the MIRROR: same pairings, home/away swapped.
  //    We then shuffle the second half's round order to avoid back-to-back
  //    same-opponent matchups (especially at the half boundary).
  const secondHalf = optFirst.map(round =>
    round.map(({ home, away }) => ({ home: away, away: home }))
  );
  let allRounds = _fixBoundarySeparation(optFirst, secondHalf);

  // 6. Final global optimisation pass (swap within same half only)
  allRounds = _globalOptimise(allRounds, halfLen);

  // 7. Convert to fixture objects
  const startDate = new Date(seasonYear, 7, 9); // Aug 9
  return allRounds.flatMap((round, gwIdx) =>
    round.map(({ home, away }) => ({
      id:          `gw${gwIdx + 1}_${home}_${away}`,
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

// ─── Balance H/A counts in the first half ──────────────────────────
function _balanceHomeAway(rounds, halfLen) {
  const maxHome = Math.ceil(halfLen / 2);
  const homeCount = new Map();
  for (const round of rounds) {
    for (const p of round) {
      homeCount.set(p.home, (homeCount.get(p.home) ?? 0) + 1);
      if (!homeCount.has(p.away)) homeCount.set(p.away, 0);
    }
  }
  for (const round of rounds) {
    for (let i = 0; i < round.length; i++) {
      const p = round[i];
      const hc = homeCount.get(p.home) ?? 0;
      const ac = homeCount.get(p.away) ?? 0;
      if (hc > maxHome && ac < maxHome) {
        homeCount.set(p.home, hc - 1);
        homeCount.set(p.away, ac + 1);
        round[i] = { home: p.away, away: p.home };
      }
    }
  }
}

// ─── H/A run scoring — penalise 3+ consecutive H or A ─────────────
function _countBadRuns(rounds) {
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
      if (run >= 3) bad += run - 2;
    }
  }
  return bad;
}

// ─── Count back-to-back same-opponent violations ───────────────────
function _countBackToBack(rounds) {
  const tms = new Set(rounds.flatMap(r => r.flatMap(p => [p.home, p.away])));
  let violations = 0;
  for (const t of tms) {
    let lastOpp = null;
    for (const r of rounds) {
      const m = r.find(p => p.home === t || p.away === t);
      if (!m) continue;
      const opp = m.home === t ? m.away : m.home;
      if (opp === lastOpp) violations++;
      lastOpp = opp;
    }
  }
  return violations;
}

// ─── Optimise round order within a single half ─────────────────────
function _optimiseRoundOrder(rounds) {
  let best = [...rounds];
  let bestScore = _countBadRuns(best);
  for (let iter = 0; iter < 400 && bestScore > 0; iter++) {
    const i = Math.floor(Math.random() * best.length);
    const j = Math.floor(Math.random() * best.length);
    if (i === j) continue;
    [best[i], best[j]] = [best[j], best[i]];
    const s = _countBadRuns(best);
    if (s > bestScore) [best[i], best[j]] = [best[j], best[i]];
    else bestScore = s;
  }
  return best;
}

// ─── Shuffle second half round order to avoid back-to-back opponents
function _fixBoundarySeparation(firstHalf, secondHalf) {
  let bestSecond = [...secondHalf];
  let combined = [...firstHalf, ...bestSecond];
  let bestB2B  = _countBackToBack(combined);
  let bestRuns = _countBadRuns(combined);

  for (let iter = 0; iter < 800; iter++) {
    const i = Math.floor(Math.random() * bestSecond.length);
    const j = Math.floor(Math.random() * bestSecond.length);
    if (i === j) continue;
    [bestSecond[i], bestSecond[j]] = [bestSecond[j], bestSecond[i]];
    combined = [...firstHalf, ...bestSecond];
    const b2b  = _countBackToBack(combined);
    const runs = _countBadRuns(combined);
    // Prioritise eliminating back-to-back, then reduce H/A runs
    if (b2b > bestB2B || (b2b === bestB2B && runs > bestRuns)) {
      [bestSecond[i], bestSecond[j]] = [bestSecond[j], bestSecond[i]];
    } else {
      bestB2B  = b2b;
      bestRuns = runs;
    }
  }
  return [...firstHalf, ...bestSecond];
}

// ─── Global optimisation: swap rounds within same half only ────────
function _globalOptimise(allRounds, halfLen) {
  let best = [...allRounds];
  let bestB2B  = _countBackToBack(best);
  let bestRuns = _countBadRuns(best);

  for (let iter = 0; iter < 600; iter++) {
    const half = Math.random() < 0.5 ? 0 : halfLen;
    const i = half + Math.floor(Math.random() * halfLen);
    const j = half + Math.floor(Math.random() * halfLen);
    if (i === j) continue;
    [best[i], best[j]] = [best[j], best[i]];
    const b2b  = _countBackToBack(best);
    const runs = _countBadRuns(best);
    if (b2b > bestB2B || (b2b === bestB2B && runs > bestRuns)) {
      [best[i], best[j]] = [best[j], best[i]];
    } else {
      bestB2B  = b2b;
      bestRuns = runs;
    }
  }
  return best;
}

// ─── Query helpers ──────────────────────────────────────────

async function getUpcomingForTeam(teamId) {
  const all = await getAllFixtures();
  return all
    .filter(f => !f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => a.gameweek - b.gameweek);
}

async function getLastResultForTeam(teamId) {
  const all = await getAllFixtures();
  return all
    .filter(f => f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
    .sort((a, b) => b.gameweek - a.gameweek)[0] ?? null;
}

async function getNextFixtureForTeam(teamId) {
  const upcoming = await getUpcomingForTeam(teamId);
  return upcoming[0] ?? null;
}

async function getRecentResults(limit = 30) {
  const all = await getAllFixtures();
  return all
    .filter(f => f.played)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, limit);
}

