#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatchBalanceReport } from './lib/matchBalance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const FROZEN_T0_PATH = path.join(REPO_ROOT, 'docs/benchmarks/match-engine-v1-baseline.md');
const CURRENT_T3_PATH = path.join(REPO_ROOT, 'docs/benchmarks/match-engine-t3-current.md');

const T0_REFERENCE = Object.freeze({
  goalsPerMatch:2.718,
  homeGoalEdge:.058,
  homePointsPerMatch:1.392,
  homePossession:49.888,
  shotsPerMatch:11.815,
  shotsOnTargetPerMatch:5.067,
  xGPerMatch:1.477,
  yellowCardsPerMatch:.435,
  forwardScorerShare:78.72,
});

function hasArg(name) {
  return process.argv.includes(name);
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function signed(value) {
  const numeric = round(value);
  return `${numeric > 0 ? '+' : ''}${numeric}`;
}

function currentMetrics(report) {
  const neutral = report.neutralBaseline;
  return {
    goalsPerMatch:neutral.goalsPerMatch,
    homeGoalEdge:neutral.homeGoalEdge,
    homePointsPerMatch:neutral.homePointsPerMatch,
    homePossession:neutral.possessionPercent.home,
    shotsPerMatch:neutral.shotsPerMatch.total,
    shotsOnTargetPerMatch:neutral.shotsOnTargetPerMatch.total,
    xGPerMatch:neutral.xGPerMatch.total,
    yellowCardsPerMatch:neutral.yellowCardsPerMatch,
    forwardScorerShare:neutral.scorerSharePercent.forward,
    goalkeeperScorerShare:neutral.scorerSharePercent.goalkeeper,
  };
}

function inRange(value, min, max) {
  return Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
}

function evaluateT3Guardrails(report) {
  const metrics = currentMetrics(report);
  const failures = [];
  const expectRange = (label, value, min, max) => {
    if (!inRange(value, min, max)) failures.push(`${label}: ${value} not in [${min}, ${max}]`);
  };

  expectRange('goals/match', metrics.goalsPerMatch, 1.8, 3.8);
  expectRange('home goal edge', metrics.homeGoalEdge, -.25, .45);
  expectRange('home points/match', metrics.homePointsPerMatch, 1.1, 1.8);
  expectRange('home possession %', metrics.homePossession, 45, 55);
  expectRange('shots/match', metrics.shotsPerMatch, 7, 20);
  expectRange('shots on target/match', metrics.shotsOnTargetPerMatch, 2.5, 10);
  expectRange('xG/match', metrics.xGPerMatch, .9, 3.5);
  expectRange('yellow cards/match', metrics.yellowCardsPerMatch, .15, 1.5);
  expectRange('forward scorer share %', metrics.forwardScorerShare, 50, 92);
  expectRange('goalkeeper scorer share %', metrics.goalkeeperScorerShare, 0, .1);

  for (const matchup of report.tacticMatchups ?? []) {
    if (matchup.seedMismatches !== 0) failures.push(`${matchup.id}: ${matchup.seedMismatches} paired-seed mismatches`);
    expectRange(`${matchup.id} Δ goals for`, matchup.delta.goalsForPerMatch, -1.2, 1.2);
    expectRange(`${matchup.id} Δ goals against`, matchup.delta.goalsAgainstPerMatch, -1.2, 1.2);
    expectRange(`${matchup.id} Δ possession`, matchup.delta.possessionPercent, -15, 15);
    expectRange(`${matchup.id} Δ shots`, matchup.delta.shotsPerMatch, -4, 4);
    expectRange(`${matchup.id} Δ xG`, matchup.delta.xGPerMatch, -1, 1);
  }
  return { metrics, failures };
}

function renderT3Comparison(report) {
  const { metrics, failures } = evaluateT3Guardrails(report);
  const lines = [
    '# Pitch Match Engine T3 Balance Comparison',
    '',
    '> Current deterministic Attribute-to-Tactics action-ledger distribution compared with the frozen T0 aggregate-engine snapshot.',
    '',
    `**Samples:** ${report.samples.baselineMatches} neutral matches + ${report.samples.matchupPairs} paired seeds per matchup (${report.samples.totalSimulations} simulations total)`,
    '',
    'The historical T0 file remains unchanged. T3 intentionally changes football outcomes; this gate checks a reviewed football-like envelope and reports movement from T0 rather than overwriting the old evidence.',
    '',
    '## Neutral distribution vs T0',
    '',
    '| Metric | T0 | T3 current | Δ |',
    '|---|---:|---:|---:|',
    `| Goals / match | ${T0_REFERENCE.goalsPerMatch} | ${metrics.goalsPerMatch} | ${signed(metrics.goalsPerMatch - T0_REFERENCE.goalsPerMatch)} |`,
    `| Home goal edge | ${T0_REFERENCE.homeGoalEdge} | ${metrics.homeGoalEdge} | ${signed(metrics.homeGoalEdge - T0_REFERENCE.homeGoalEdge)} |`,
    `| Home points / match | ${T0_REFERENCE.homePointsPerMatch} | ${metrics.homePointsPerMatch} | ${signed(metrics.homePointsPerMatch - T0_REFERENCE.homePointsPerMatch)} |`,
    `| Home possession % | ${T0_REFERENCE.homePossession} | ${metrics.homePossession} | ${signed(metrics.homePossession - T0_REFERENCE.homePossession)} |`,
    `| Shots / match | ${T0_REFERENCE.shotsPerMatch} | ${metrics.shotsPerMatch} | ${signed(metrics.shotsPerMatch - T0_REFERENCE.shotsPerMatch)} |`,
    `| Shots on target / match | ${T0_REFERENCE.shotsOnTargetPerMatch} | ${metrics.shotsOnTargetPerMatch} | ${signed(metrics.shotsOnTargetPerMatch - T0_REFERENCE.shotsOnTargetPerMatch)} |`,
    `| xG / match | ${T0_REFERENCE.xGPerMatch} | ${metrics.xGPerMatch} | ${signed(metrics.xGPerMatch - T0_REFERENCE.xGPerMatch)} |`,
    `| Yellow cards / match | ${T0_REFERENCE.yellowCardsPerMatch} | ${metrics.yellowCardsPerMatch} | ${signed(metrics.yellowCardsPerMatch - T0_REFERENCE.yellowCardsPerMatch)} |`,
    `| Forward scorer share % | ${T0_REFERENCE.forwardScorerShare} | ${metrics.forwardScorerShare} | ${signed(metrics.forwardScorerShare - T0_REFERENCE.forwardScorerShare)} |`,
    '',
    '## Tactical paired-seed movement',
    '',
    '| Matchup | Δ GF | Δ GA | Δ pts | Δ possession | Δ shots | Δ xG | Better / same / worse |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const matchup of report.tacticMatchups ?? []) {
    lines.push(`| ${matchup.label} | ${signed(matchup.delta.goalsForPerMatch)} | ${signed(matchup.delta.goalsAgainstPerMatch)} | ${signed(matchup.delta.pointsPerMatch)} | ${signed(matchup.delta.possessionPercent)}pp | ${signed(matchup.delta.shotsPerMatch)} | ${signed(matchup.delta.xGPerMatch)} | ${matchup.pairedOutcomes.improved} / ${matchup.pairedOutcomes.same} / ${matchup.pairedOutcomes.worse} |`);
  }

  lines.push('', '## T3 guardrail result', '');
  if (failures.length) {
    lines.push('**FAIL**', '', ...failures.map(failure => `- ${failure}`));
  } else {
    lines.push('**PASS** — current T3 output remains inside the reviewed broad football-like envelope.');
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(FROZEN_T0_PATH)) {
    console.error(`Missing frozen T0 reference ${path.relative(REPO_ROOT, FROZEN_T0_PATH)}.`);
    process.exitCode = 1;
    return;
  }

  const report = createMatchBalanceReport();
  const markdown = renderT3Comparison(report);
  const { failures } = evaluateT3Guardrails(report);

  if (hasArg('--write')) {
    fs.mkdirSync(path.dirname(CURRENT_T3_PATH), { recursive: true });
    fs.writeFileSync(CURRENT_T3_PATH, `${markdown}\n`, 'utf8');
    console.log(`Updated ${path.relative(REPO_ROOT, CURRENT_T3_PATH)}; frozen T0 reference left untouched.`);
    return;
  }

  if (hasArg('--check')) {
    process.stdout.write(`${markdown}\n`);
    if (failures.length) process.exitCode = 1;
    return;
  }

  process.stdout.write(`${markdown}\n`);
}

main();