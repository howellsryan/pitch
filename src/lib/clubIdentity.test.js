import { describe, expect, it } from 'vitest';
import { PL_TEAMS } from '../data/plTeams.js';
import { CHAMPIONSHIP_TEAMS } from '../data/championship.js';
import { LEAGUE_ONE_TEAMS } from '../data/leagueOne.js';
import { LEAGUE_TWO_TEAMS } from '../data/leagueTwo.js';
import { LA_LIGA_TEAMS } from '../data/laLiga.js';
import { BUNDESLIGA_TEAMS } from '../data/bundesliga.js';
import { SERIE_A_TEAMS } from '../data/serieA.js';
import { LIGUE_1_TEAMS } from '../data/ligue1.js';
import { EREDIVISIE_TEAMS } from '../data/eredivisie.js';
import { clubBadgeProfile, clubCrestSvg, CURATED_BADGE_PROFILE_COUNT } from './clubIdentity.mjs';

const CLUBS = [
  ...PL_TEAMS,
  ...CHAMPIONSHIP_TEAMS,
  ...LEAGUE_ONE_TEAMS,
  ...LEAGUE_TWO_TEAMS,
  ...LA_LIGA_TEAMS,
  ...BUNDESLIGA_TEAMS,
  ...SERIE_A_TEAMS,
  ...LIGUE_1_TEAMS,
  ...EREDIVISIE_TEAMS,
];

describe('bespoke club identity', () => {
  it('covers all 186 playable clubs with renderable SVG', () => {
    expect(CLUBS).toHaveLength(186);
    for (const team of CLUBS) {
      const svg = clubCrestSvg(team, { size: 32, label: `${team.name} crest` });
      expect(svg, team.name).toContain('<svg');
      expect(svg, team.name).toContain('viewBox="0 0 100 100"');
      expect(svg, team.name).toContain('aria-label=');
      expect(svg, team.name).not.toContain(team.crest ?? '__never__');
    }
  });

  it('keeps every club deterministic and club-specific', () => {
    const rendered = CLUBS.map((team) => clubCrestSvg(team));
    const renderedAgain = CLUBS.map((team) => clubCrestSvg(team));
    expect(renderedAgain).toEqual(rendered);
    // Shared badge families are expected, but ids/initials/colours should make
    // almost every complete SVG distinct rather than one generic shield.
    expect(new Set(rendered).size).toBeGreaterThanOrEqual(180);
  });

  it('uses a curated real-identity profile for every playable club', () => {
    expect(CURATED_BADGE_PROFILE_COUNT).toBeGreaterThan(120);
    const missing = [];
    for (const team of CLUBS) {
      const profile = clubBadgeProfile(team);
      expect(profile.shape, team.name).toBeTruthy();
      expect(profile.primary, team.name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(profile.motif, team.name).toBeTruthy();
      if (profile.motif === 'monogram') missing.push(team.name);
    }
    expect(missing, `Uncurated club identities: ${missing.join(', ')}`).toEqual([]);
  });
});
