import type { KV } from './kv.js';
import { verifySession } from './auth.js';
import { handleLogin, handleLogout, handleHome } from './handlers.js';
import { loginPage } from './pages.js';

export interface Env {
  DATA: KV;
  DASH: KV;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  GA4_PROPERTY_ID?: string;
  GA4_SA_JSON_B64?: string;
  IG_ACCESS_TOKEN?: string;
  IG_USER_ID?: string;
}

const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (path === '/login' && method === 'POST') return handleLogin(req, env);
  if (path === '/logout') return handleLogout();

  const token = getCookie(req, 'sess');
  const user = token ? await verifySession(token, env.SESSION_SECRET) : null;
  if (!user) return html(loginPage());

  if (path === '/' && method === 'GET') return handleHome(url, env, user.username);
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
