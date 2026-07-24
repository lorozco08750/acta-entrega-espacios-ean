const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function verifyPassword(password, user) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: fromBase64Url(user.salt),
    iterations: user.iterations,
  }, key, 256));
  return safeEqual(derived, fromBase64Url(user.hash));
}

export function getUsers(env) {
  try { return JSON.parse(env.AUTH_USERS); } catch { return []; }
}

export async function createSession(user, secret) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
  })));
  const signature = toBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function readSession(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('acta_session='))?.slice('acta_session='.length);
  if (!token) return null;
  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) return null;
  try {
    const expected = await hmac(secret, payload);
    if (!safeEqual(expected, fromBase64Url(providedSignature))) return null;
    const session = JSON.parse(decoder.decode(fromBase64Url(payload)));
    if (!session.email || !session.role || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
}

export const sessionCookie = (token) => `acta_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`;
export const expiredSessionCookie = 'acta_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } });
}
