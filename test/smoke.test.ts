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

describe('favicon', () => {
  it('serves /favicon.svg without auth', async () => {
    const res = await worker.fetch(new Request('https://x/favicon.svg'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('cache-control')).toContain('max-age');
    expect(await res.text()).toContain('<svg');
  });
  it('redirects /favicon.ico to /favicon.svg', async () => {
    const res = await worker.fetch(new Request('https://x/favicon.ico'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/favicon.svg');
  });
  it('links the icon from the login page', async () => {
    const res = await worker.fetch(new Request('https://x/'), env);
    expect(await res.text()).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
  });
});
