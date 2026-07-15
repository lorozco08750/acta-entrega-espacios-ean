import { json, readSession } from '../lib/auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405, { Allow: 'GET' });
  const session = await readSession(request, env.SESSION_SECRET);
  return session ? json({ email: session.email, role: session.role }) : json({ error: 'No autorizado' }, 401);
}
