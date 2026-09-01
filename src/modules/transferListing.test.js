import { describe, expect, it } from 'vitest';

import { transferListingEligibility } from './transfers.js';

describe('transfer listing eligibility', () => {
  it('allows existing fresh-save squad players to be listed', () => {
    expect(transferListingEligibility({ id:'existing', signedThisSeason:false, onLoan:false })).toEqual({ ok:true, reason:null });
  });

  it('blocks players who joined any club during the current season', () => {
    expect(transferListingEligibility({ id:'new-signing', signedThisSeason:true })).toEqual({ ok:false, reason:'SIGNED_THIS_SEASON' });
  });
});
