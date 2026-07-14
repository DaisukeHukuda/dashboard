import { describe, it, expect } from 'vitest';
import { parseSaJsonB64, b64url, makeAssertion, type SaCreds } from '../src/ga4/jwt.js';

// テスト用のRSA鍵をその場で生成し、pkcs8(PEM)を作る
async function genPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...pkcs8));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

describe('parseSaJsonB64', () => {
  it('decodes base64 SA JSON to creds', () => {
    const json = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'PK', extra: 1 });
    const b64 = btoa(json);
    const c = parseSaJsonB64(b64);
    expect(c.client_email).toBe('a@b.iam.gserviceaccount.com');
    expect(c.private_key).toBe('PK');
  });
});

describe('b64url', () => {
  it('is url-safe and unpadded', () => {
    const out = b64url(new Uint8Array([251, 255, 191]));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe('makeAssertion', () => {
  it('produces a verifiable RS256 JWT with correct claims', async () => {
    const { pem, publicKey } = await genPem();
    const sa: SaCreds = { client_email: 'svc@p.iam.gserviceaccount.com', private_key: pem };
    const jwt = await makeAssertion(sa, 'https://www.googleapis.com/auth/analytics.readonly', 1000);
    const [h, p, s] = jwt.split('.');
    expect(h && p && s).toBeTruthy();
    // ヘッダ・クレーム検証（base64url → JSON）
    const dec = (seg: string) => JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(seg.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))),
    );
    const header = dec(h);
    const claims = dec(p);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(claims.iss).toBe('svc@p.iam.gserviceaccount.com');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/analytics.readonly');
    expect(claims.iat).toBe(1000);
    expect(claims.exp).toBe(4600);
    // 署名を公開鍵で検証（改ざんされていない）
    const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
