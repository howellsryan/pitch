import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { signJWT } from '../_lib/jwt.js';
import { onRequestDelete, onRequestGet, onRequestPut } from './save.js';

const JWT_SECRET = 'save-capacity-contract';
let sql;
let env;
let token;
let failChunk = false;
async function request(method, slotId = 'career_alpha', blob, userToken = token) {
  return new Request(`https://pitch.test/api/save?slotId=${slotId}`, {
    method, headers:{ Authorization:`Bearer ${userToken}`, 'Content-Type':'application/json' },
    ...(blob === undefined ? {} : { body:JSON.stringify({ slot_id:slotId, save_blob:blob, metadata:{ season:'2038/39' } }) }),
  });
}
function statement(query) {
  let bindings = [];
  return {
    bind(...values) { bindings = values; return this; },
    async first() { return sql.prepare(query).get(...bindings) ?? null; },
    async all() { return { results:sql.prepare(query).all(...bindings) }; },
    async run() {
      if (failChunk && query.startsWith('INSERT') && String(bindings[1]).endsWith('.chunk.1')) throw Error('Injected chunk write failure');
      return { meta:sql.prepare(query).run(...bindings) };
    },
  };
}
beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE saves (user_id INTEGER, slot_id TEXT, save_blob TEXT, metadata_json TEXT, save_revision INTEGER, updated_at INTEGER, PRIMARY KEY(user_id,slot_id))');
  env = { JWT_SECRET, DB:{ prepare:statement, async batch(statements) {
    sql.exec('BEGIN');
    try { const results = []; for (const item of statements) results.push(await item.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } };
  token = await signJWT({ sub:42, provider:'google' }, JWT_SECRET, 3600);
  failChunk = false;
});
afterEach(() => sql.close());

describe('long-career cloud capacity', () => {
  it('round-trips a real-career-sized opaque blob through bounded D1 rows and lists one slot', async () => {
    const blob = 'aB9/'.repeat(2_400_000);
    const put = await onRequestPut({ request:await request('PUT', 'career_alpha', blob), env });
    expect(put.status).toBe(200);
    const get = await onRequestGet({ request:await request('GET'), env });
    expect((await get.json()).save.save_blob).toBe(blob);
    expect(sql.prepare('SELECT max(length(save_blob)) AS size FROM saves').get().size).toBeLessThan(1_800_000);
    const list = await onRequestGet({ request:await request('GET', 'career_alpha&list=1'), env });
    expect((await list.json()).slots.map(row => row.slotId)).toEqual(['career_alpha']);
  });

  it('preserves the previous backup if any chunk write fails', async () => {
    await onRequestPut({ request:await request('PUT', 'career_alpha', 'previous-backup'), env });
    failChunk = true;
    await expect(onRequestPut({ request:await request('PUT', 'career_alpha', 'x'.repeat(2_000_000)), env })).rejects.toThrow('Injected chunk write failure');
    const get = await onRequestGet({ request:await request('GET'), env });
    expect((await get.json()).save).toMatchObject({ save_blob:'previous-backup', save_revision:1 });
    expect(sql.prepare('SELECT count(*) AS count FROM saves').get().count).toBe(1);
  });

  it('cleans chunks on replacement and deletion while isolating similar slots and other users', async () => {
    const blob = 'x'.repeat(2_000_000);
    const otherToken = await signJWT({ sub:84, provider:'google' }, JWT_SECRET, 3600);
    for (const [slot, jwt] of [['career_alpha', token], ['career_alpha_two', token], ['career_alpha', otherToken]]) {
      await onRequestPut({ request:await request('PUT', slot, blob, jwt), env });
    }
    await onRequestPut({ request:await request('PUT', 'career_alpha', 'small'), env });
    expect(sql.prepare("SELECT count(*) AS count FROM saves WHERE user_id=42 AND slot_id GLOB 'career_alpha.chunk.*'").get().count).toBe(0);
    await onRequestDelete({ request:await request('DELETE'), env });
    for (const [slot, jwt] of [['career_alpha_two', token], ['career_alpha', otherToken]]) {
      const get = await onRequestGet({ request:await request('GET', slot, undefined, jwt), env });
      expect((await get.json()).save.save_blob).toBe(blob);
    }
  });

  it('rejects direct access to internal chunk IDs and reports incomplete backups safely', async () => {
    const invalid = await onRequestGet({ request:await request('GET', 'career_alpha.chunk.0'), env });
    expect(invalid.status).toBe(400);
    await onRequestPut({ request:await request('PUT', 'career_alpha', 'x'.repeat(2_000_000)), env });
    sql.exec("DELETE FROM saves WHERE slot_id='career_alpha.chunk.1'");
    const get = await onRequestGet({ request:await request('GET'), env });
    expect(get.status).toBe(503);
    expect((await get.json()).error).toContain('incomplete');
  });
});
