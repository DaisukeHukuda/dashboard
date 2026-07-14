import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/index.js';

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ keys: [] }),
  };
}

const env: Env = {
  DATA: fakeKV(), DASH: fakeKV(),
  ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
};

describe('worker smoke', () => {
  it('serves robots.txt without auth', async () => {
    const res = await worker.fetch(new Request('https://x/robots.txt'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Disallow: /');
  });
});
