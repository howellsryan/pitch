import { describe, expect, it } from 'vitest';
import { signJWT, verifyJWT } from './jwt.js';

describe('signJWT / verifyJWT', () => {
  it('round-trips a payload and stamps iat/exp', async () => {
    const token = await signJWT({ sub: 42, provider: 'google', displayName: 'Alex' }, 'test-secret', 3600);
    const payload = await verifyJWT(token, 'test-secret');
    expect(payload).toMatchObject({ sub: 42, provider: 'google', displayName: 'Alex' });
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp).toBe(payload.iat + 3600);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJWT({ sub: 1 }, 'secret-a', 3600);
    expect(await verifyJWT(token, 'secret-b')).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signJWT({ sub: 1 }, 'test-secret', 3600);
    const [header, payload, sig] = token.split('.');
    const tampered = [header, payload.slice(0, -1) + (payload.at(-1) === 'A' ? 'B' : 'A'), sig].join('.');
    expect(await verifyJWT(tampered, 'test-secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJWT({ sub: 1 }, 'test-secret', -1);
    expect(await verifyJWT(token, 'test-secret')).toBeNull();
  });

  it('rejects malformed input', async () => {
    expect(await verifyJWT(null, 'test-secret')).toBeNull();
    expect(await verifyJWT('not-a-jwt', 'test-secret')).toBeNull();
  });
});
