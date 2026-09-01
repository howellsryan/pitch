import { describe, expect, it } from 'vitest';

import {
  SAVE_SCHEMA_VERSION,
  _PITCH_LEGACY_MAGIC,
  _PITCH_MAGIC,
  _PITCH_SALT,
  _fnv1a,
  buildCareerMetadata,
  careerSlotDbName,
  migrateSavePayload,
  parseAndMigrateEnvelope,
} from './db.js';

function legacyPayload() {
  return {
    meta: {
      version: _PITCH_LEGACY_MAGIC,
      exportedAt: '2026-08-01T12:00:00.000Z',
      teamId: 'arsenal',
      season: '2025/26',
      gameweek: 12,
    },
    snapshot: {
      save: [{ id:'active', userTeamId:'arsenal', managerName:'Alex', season:'2025/26', currentGameweek:12 }],
      teams: [{ id:'arsenal', name:'Arsenal' }],
      players: [{ id:'p1', teamId:'arsenal', name:'Player One' }],
      fixtures: [],
      standings: [],
      transfers: [],
      honors: [],
      seasons: [],
    },
  };
}

function envelopeFor(data) {
  const payload = JSON.stringify(data);
  return JSON.stringify({ h:_fnv1a(_PITCH_SALT + payload), d:payload });
}

describe('P0 save migration contract', () => {
  it('migrates a V1 .pitch payload into the selected V2 slot', () => {
    const migrated = migrateSavePayload(legacyPayload(), 'career_test');

    expect(migrated.meta.version).toBe(_PITCH_MAGIC);
    expect(migrated.meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(migrated.meta.slotId).toBe('career_test');
    expect(migrated.meta.migratedFrom).toBe(_PITCH_LEGACY_MAGIC);
    expect(migrated.snapshot.save[0]).toMatchObject({
      slotId:'career_test',
      saveSchemaVersion:SAVE_SCHEMA_VERSION,
      userTeamId:'arsenal',
    });
    expect(migrated.snapshot.players[0].name).toBe('Player One');
  });

  it('parses, integrity-checks and migrates a real legacy envelope', () => {
    const migrated = parseAndMigrateEnvelope(envelopeFor(legacyPayload()), 'career_imported');

    expect(migrated.meta.slotId).toBe('career_imported');
    expect(migrated.snapshot.teams).toHaveLength(1);
    expect(migrated.snapshot.players).toHaveLength(1);
  });

  it('rejects a tampered envelope before migration', () => {
    const data = legacyPayload();
    const envelope = JSON.parse(envelopeFor(data));
    envelope.d = envelope.d.replace('arsenal', 'chelsea');

    expect(() => parseAndMigrateEnvelope(JSON.stringify(envelope), 'career_test'))
      .toThrow(/integrity check failed/i);
  });

  it('rejects future save versions rather than silently downgrading them', () => {
    const future = legacyPayload();
    future.meta = { ...future.meta, version:'PITCH_SAVE_V99', schemaVersion:99 };

    expect(() => migrateSavePayload(future, 'career_test'))
      .toThrow(/newer version/i);
  });

  it('keeps the original browser DB as legacy slot and isolates later slots', () => {
    expect(careerSlotDbName('legacy')).toBe('pitch_fc');
    expect(careerSlotDbName('career_alpha')).toBe('pitch_fc_slot_career_alpha');
    expect(careerSlotDbName('career_beta')).toBe('pitch_fc_slot_career_beta');
    expect(careerSlotDbName('career_alpha')).not.toBe(careerSlotDbName('career_beta'));
  });

  it('uses one stable metadata contract for local cards, exports and cloud rows', () => {
    const metadata = buildCareerMetadata(
      'career_alpha',
      {
        managerName:'Alex', userTeamId:'arsenal', userLeague:'Premier League',
        season:'2026/27', currentGameweek:7, lastPlayedAt:'2026-08-30T18:00:00.000Z',
        saveSchemaVersion:SAVE_SCHEMA_VERSION,
      },
      { id:'arsenal', name:'Arsenal', crest:'crest', primaryColor:'#ff0000' },
      { teamId:'arsenal', position:3 },
    );

    expect(metadata).toEqual({
      slotId:'career_alpha',
      managerName:'Alex',
      teamId:'arsenal',
      clubName:'Arsenal',
      clubCrest:'crest',
      clubColor:'#ff0000',
      season:'2026/27',
      league:'Premier League',
      leaguePosition:3,
      gameweek:7,
      lastPlayedAt:'2026-08-30T18:00:00.000Z',
      saveSchemaVersion:SAVE_SCHEMA_VERSION,
    });
  });
});
