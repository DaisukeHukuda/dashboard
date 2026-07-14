const enc = new TextEncoder();

export interface SaCreds { client_email: string; private_key: string; }

export function b64url(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(s: string): string { return b64url(enc.encode(s)); }

export function parseSaJsonB64(b64: string): SaCreds {
  const o = JSON.parse(atob(b64)) as { client_email: string; private_key: string };
  return { client_email: o.client_email, private_key: o.private_key };
}

export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signRs256(signingInput: string, privateKeyPem: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));
  return b64url(new Uint8Array(sig));
}

export async function makeAssertion(sa: SaCreds, scope: string, now: number): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlStr(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const sig = await signRs256(signingInput, sa.private_key);
  return `${signingInput}.${sig}`;
}
