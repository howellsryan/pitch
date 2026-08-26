// tools/lib/fieldGeneration.mjs
// Generates potential/wage/value for a converted player who has no matching
// pitch row to inherit those fields from (a footy-sim player pitch never
// carried before). Per docs/plan/06-data-reconciliation.md Step 2: "Fit the
// curves against pitch's own rows rather than inventing them."

export function overallOf(player) {
  return player.position === 'GK' ? player.goalkeeping : Math.max(player.attack, player.midfield, player.defence);
}

// potential: doc gives the shape directly rather than asking for a fit -
// under ~21, headroom of +6 (high rating) to +15 (low rating) scaled by
// rating; past ~28, potential converges on current rating.
export function generatePotential(rating, age) {
  const baseHeadroom = Math.max(6, Math.min(15, 15 - ((rating - 50) / 40) * 9));
  const ageFactor = age <= 21 ? 1 : age >= 28 ? 0 : (28 - age) / 7;
  const potential = Math.round(rating + baseHeadroom * ageFactor);
  return Math.max(rating, Math.min(99, potential));
}

function leastSquares(X, y) {
  const n = X[0].length;
  const XtX = Array.from({ length: n }, () => new Array(n).fill(0));
  const Xty = new Array(n).fill(0);
  for (let s = 0; s < X.length; s++) {
    for (let i = 0; i < n; i++) {
      Xty[i] += X[s][i] * y[s];
      for (let j = 0; j < n; j++) XtX[i][j] += X[s][i] * X[s][j];
    }
  }
  for (let i = 0; i < n; i++) XtX[i][i] += 1e-3;
  const M = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-9) M[col][col] = 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Fits log(wage_thousands) ~ a + b*overall on pitch's existing players in
// this league, so a generated wage lands on the same curve as native ones.
export function fitWageModel(existingLeaguePlayers) {
  const X = [];
  const y = [];
  for (const p of existingLeaguePlayers) {
    const overall = overallOf(p);
    const wage = Number(p.wage_thousands);
    if (Number.isFinite(overall) && Number.isFinite(wage) && wage > 0) {
      X.push([1, overall]);
      y.push(Math.log(wage));
    }
  }
  if (X.length < 10) return (overall) => Math.max(1, Math.round(overall * 2));
  const [a, b] = leastSquares(X, y);
  return (overall) => Math.max(1, Math.round(Math.exp(a + b * overall)));
}

// Fits log(value_millions) ~ a + b*overall + c*age + d*age^2.
export function fitValueModel(existingLeaguePlayers) {
  const X = [];
  const y = [];
  for (const p of existingLeaguePlayers) {
    const overall = overallOf(p);
    const age = Number(p.age);
    const value = Number(p.value_millions);
    if (Number.isFinite(overall) && Number.isFinite(age) && Number.isFinite(value) && value > 0) {
      X.push([1, overall, age, age * age]);
      y.push(Math.log(value));
    }
  }
  if (X.length < 10) return (overall) => Math.max(0.1, Math.round((overall / 10) * 10) / 10);
  const [a, b, c, d] = leastSquares(X, y);
  return (overall, age) => Math.max(0.1, Math.round(Math.exp(a + b * overall + c * age + d * age * age) * 10) / 10);
}
