import { describe, it, expect } from 'vitest';
import { createSession, verifySession, constantEquals } from '../src/auth.js';

describe('session', () => {
  it('roundtrips a valid session', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    const p = await verifySession(tok, 'secret');
    expect(p?.username).toBe('admin');
  });
  it('rejects a tampered token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    expect(await verifySession(tok + 'x', 'secret')).toBeNull();
  });
  it('rejects wrong secret', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    expect(await verifySession(tok, 'other')).toBeNull();
  });
  it('rejects expired token', async () => {
    const tok = await createSession({ username: 'admin', exp: 1 }, 'secret');
    expect(await verifySession(tok, 'secret')).toBeNull();
  });
});

describe('constantEquals', () => {
  it('true for equal', () => expect(constantEquals('abc', 'abc')).toBe(true));
  it('false for different', () => expect(constantEquals('abc', 'abd')).toBe(false));
  it('false for different length', () => expect(constantEquals('abc', 'ab')).toBe(false));
});
