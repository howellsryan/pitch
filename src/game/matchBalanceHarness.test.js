import { describe, expect, it } from 'vitest';
import {
  createMatchBalanceReport,
  renderMatchBalanceMarkdown,
} from '../../tools/lib/matchBalance.mjs';

describe('T0 match balance harness', () => {
  it('is deterministic and truly pairs the initial seed stream', () => {
    const config = { baselineMatches: 12, matchupMatches: 8, teamRating: 77 };
    const first = createMatchBalanceReport(config);
    const second = createMatchBalanceReport(config);

    expect(second).toEqual(first);
    expect(first.tacticMatchups).toHaveLength(4);
    expect(first.tacticMatchups.every((matchup) => matchup.seedMismatches === 0)).toBe(true);
    expect(first.tacticMatchups.every((matchup) => (
      matchup.pairedOutcomes.improved + matchup.pairedOutcomes.same + matchup.pairedOutcomes.worse
    ) === config.matchupMatches)).toBe(true);
  });

  it('renders every required baseline section from a compact sample', () => {
    const report = createMatchBalanceReport({ baselineMatches: 12, matchupMatches: 8 });
    const markdown = renderMatchBalanceMarkdown(report);

    expect(markdown).toContain('## Neutral equal-team distribution');
    expect(markdown).toContain('### Scorer distribution');
    expect(markdown).toContain('## Paired tactic matchups');
    expect(markdown).toContain('## Frozen action/event vocabulary');
    expect(markdown).toContain('Direct counter vs high line');
  });
});
