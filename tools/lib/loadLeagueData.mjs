// tools/lib/loadLeagueData.mjs
// Loads a previously-generated src/data/<league>.js file via a real ESM
// dynamic import (these are plain data modules - no DOM, no bundler
// needed) so csv-to-league.mjs can diff against "what was there before"
// the same way footy-sim's generator did with vm.runInContext, just without
// needing a sandbox since there's nothing browser-specific to shim.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function loadTeamsArray(dataFilePath, arrayName) {
  if (!fs.existsSync(dataFilePath)) return null;
  const mod = await import(pathToFileURL(path.resolve(dataFilePath)).href + `?t=${Date.now()}`);
  return mod[arrayName] || null;
}
