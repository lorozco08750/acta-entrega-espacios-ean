import { readSession } from './lib/auth.js';

const PUBLIC_PATHS = new Set([
  '/login',
  '/login.html',
  '/icon.svg',
  '/logo-ean-blanco.png',
  '/logo-ean-blanco-horizontal.png',
  '/logo-ean-negro.png',
  '/logo-ean-negro-horizontal.png',
  '/sw.js',
  '/api/login',
  '/api/logout',
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return context.next();
  const session = await readSession(context.request, context.env.SESSION_SECRET);
  if (!session) {
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const login = new URL('/login', url.origin);
    login.searchParams.set('next', `${url.pathname}${url.search}`);
    return Response.redirect(login, 302);
  }
  const response = await context.next();
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'private, no-store');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'same-origin');
  secured.headers.set('X-Frame-Options', 'DENY');
  return secured;
}
