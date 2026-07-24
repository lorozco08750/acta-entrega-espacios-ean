import { createSession, getUsers, json, sessionCookie, verifyPassword } from '../lib/auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, { Allow: 'POST' });
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Solicitud inválida' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = getUsers(env).find((entry) => entry.email === email);
  const valid = user && password.length <= 256 && await verifyPassword(password, user);
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return json({ error: 'Credenciales inválidas' }, 401);
  }
  const token = await createSession(user, env.SESSION_SECRET);
  return json({ email: user.email, role: user.role }, 200, { 'Set-Cookie': sessionCookie(token) });
}
