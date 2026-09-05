#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createT7CalibrationReport,
  renderT7CalibrationMarkdown,
} from './lib/matchBalanceT7.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'docs/benchmarks/match-engine-t7-calibration.md');

function hasArg(name) {
  return process.argv.includes(name);
}

function valueArg(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find(argument => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function main() {
  const matchesPerScenario = Number(valueArg('--matches', 100));
  const scenarioArg = valueArg('--scenarios', '');
  const scenarioIds = scenarioArg ? scenarioArg.split(',').map(value => value.trim()).filter(Boolean) : undefined;
  const report = createT7CalibrationReport({ matchesPerScenario, scenarioIds });
  const markdown = renderT7CalibrationMarkdown(report);

  if (hasArg('--write')) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive:true });
    fs.writeFileSync(OUTPUT_PATH, `${markdown}\n`, 'utf8');
    console.log(`Updated ${path.relative(REPO_ROOT, OUTPUT_PATH)}.`);
    return;
  }

  process.stdout.write(`${markdown}\n`);
}

main();
