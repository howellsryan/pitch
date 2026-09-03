import { describe, expect, it, vi } from 'vitest';

import worker from '../_worker.js';
import { signJWT } from '../_lib/jwt.js';
import { onRequestDelete } from './save.js';

const JWT_SECRET = 'career-delete-test-secret';

async function authenticatedRequest(url, method = 'DELETE') {
  const token = await signJWT({ sub:42, provider:'google' }, JWT_SECRET, 3600);
  return new Request(url, {
    method,
    headers:{ Authorization:`Bearer ${token}` },
  });
}

function deleteEnv(changes = 1) {
  const statements = [];
  return {
    statements,
    env:{
      JWT_SECRET,
      DB:{
        prepare:vi.fn(sql => {
          const statement = { sql, bindings:[] };
          statements.push(statement);
          return {
            bind(...bindings) {
              statement.bindings = bindings;
              return this;
            },
            run:vi.fn(async () => ({ meta:{ changes } })),
          };
        }),
      },
      ASSETS:{ fetch:vi.fn() },
    },
  };
}

describe('DELETE /api/save', () => {
  it('deletes only the authenticated user and requested career slot', async () => {
    const { env, statements } = deleteEnv();
    const request = await authenticatedRequest('https://pitch.test/api/save?slotId=career_alpha');

    const response = await onRequestDelete({ request, env });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok:true, slotId:'career_alpha', deleted:true });
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('DELETE FROM saves WHERE user_id = ? AND slot_id = ?');
    expect(statements[0].bindings).toEqual([42, 'career_alpha']);
  });

  it('rejects an invalid slot without touching D1', async () => {
    const { env } = deleteEnv();
    const request = await authenticatedRequest('https://pitch.test/api/save?slotId=not%20safe');

    const response = await onRequestDelete({ request, env });

    expect(response.status).toBe(400);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('is routed by the Worker entry point instead of falling through to assets', async () => {
    const { env } = deleteEnv(0);
    const request = await authenticatedRequest('https://pitch.test/api/save?slotId=legacy');

    const response = await worker.fetch(request, env, {});

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok:true, slotId:'legacy', deleted:false });
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
