#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMatchBalanceReport,
  renderMatchBalanceMarkdown,
} from './lib/matchBalance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'docs/benchmarks/match-engine-v1-baseline.md');

function hasArg(name) {
  return process.argv.includes(name);
}

function main() {
  const markdown = renderMatchBalanceMarkdown(createMatchBalanceReport());

  if (hasArg('--write')) {
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, markdown, 'utf8');
    console.log(`Updated ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    return;
  }

  if (hasArg('--check')) {
    if (!fs.existsSync(BASELINE_PATH)) {
      console.error(`Missing ${path.relative(REPO_ROOT, BASELINE_PATH)}. Run npm run balance:match:update.`);
      process.exitCode = 1;
      return;
    }
    const committed = fs.readFileSync(BASELINE_PATH, 'utf8').replace(/\r\n/g, '\n');
    if (committed !== markdown) {
      console.error('The committed match-engine baseline is stale. Review the change, then run npm run balance:match:update.');
      process.exitCode = 1;
      return;
    }
    console.log(`Match-engine baseline matches ${path.relative(REPO_ROOT, BASELINE_PATH)}.`);
    return;
  }

  process.stdout.write(markdown);
}

main();
