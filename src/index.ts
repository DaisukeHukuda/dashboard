import type { KV } from './kv.js';

export interface Env {
  DATA: KV;
  DASH: KV;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

async function handle(req: Request, _env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response('not found', { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await handle(req, env);
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
