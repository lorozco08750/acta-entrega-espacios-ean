import { expiredSessionCookie, json } from '../lib/auth.js';

export function onRequest({ request }) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, { Allow: 'POST' });
  return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie });
}
