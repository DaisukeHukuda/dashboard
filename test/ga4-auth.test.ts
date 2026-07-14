import { describe, it, expect, vi } from 'vitest';
import { getAccessToken } from '../src/ga4/auth.js';
import type { Env } from '../src/index.js';

function fakeKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}
function envWith(dash = fakeKV()): Env {
  const saJson = JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n' });
  return { DATA: fakeKV(), DASH: dash, ADMIN_USER: 'a', ADMIN_PASSWORD: 'b', SESSION_SECRET: 's', GA4_PROPERTY_ID: '312598868', GA4_SA_JSON_B64: btoa(saJson) } as Env;
}

describe('getAccessToken', () => {
  it('fetches token and caches it (2nd call hits cache, no fetch)', async () => {
    const dash = fakeKV();
    // makeAssertion 実行のため署名可能なPEMが要る→実PEMを生成して差し込む
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g,'$1\n')}\n-----END PRIVATE KEY-----\n`;
    const env = { ...envWith(dash), GA4_SA_JSON_B64: btoa(JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: pem })) } as Env;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'TOK', expires_in: 3600 }) });
    const t1 = await getAccessToken(env, fetchMock as unknown as typeof fetch, () => 1000);
    expect(t1).toBe('TOK');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(String(init.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(String(init.body)).toContain('assertion=');

    const fetch2 = vi.fn();
    const t2 = await getAccessToken(env, fetch2 as unknown as typeof fetch, () => 1000);
    expect(t2).toBe('TOK');
    expect(fetch2).not.toHaveBeenCalled();
  });
  it('throws on non-ok token response', async () => {
    const env = envWith();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(getAccessToken(env, fetchMock as unknown as typeof fetch, () => 1000)).rejects.toThrow();
  });
});
