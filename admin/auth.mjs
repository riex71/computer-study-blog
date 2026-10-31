import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = new Map();
const encoder = new TextEncoder();
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function configuration(env) {
  const issuer = env.ACCESS_TEAM_DOMAIN;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') ||
      !env.ACCESS_AUD || !env.OWNER_EMAIL || !env.GITHUB_TOKEN || !env.ADMIN_ORIGIN)
    throw new HttpError(503, '관리자 인증 설정이 아직 완료되지 않았습니다.');
  let origin;
  try { origin = new URL(env.ADMIN_ORIGIN); } catch { throw new HttpError(503, '관리자 주소 설정을 확인해 주세요.'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.ADMIN_ORIGIN)
    throw new HttpError(503, '관리자 주소는 HTTPS 기본 주소여야 합니다.');
  return { issuer, origin: origin.origin };
}
export async function verifyOwner(request, env, keySet) {
  const { issuer, origin } = configuration(env);
  if (new URL(request.url).origin !== origin) throw new HttpError(403, '등록한 관리자 주소로 접속해 주세요.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new HttpError(401, '로그인이 필요합니다.');
  if (!keySet) {
    if (!keys.has(issuer)) keys.set(issuer, createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs')));
    keySet = keys.get(issuer);
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'email'], clockTolerance: 5
    }));
  } catch { throw new HttpError(401, '로그인이 만료됐거나 올바르지 않습니다. 다시 로그인해 주세요.'); }
  if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase())
    throw new HttpError(403, '블로그 소유자만 사용할 수 있습니다.');
  return payload;
}
export async function csrfToken(identity, env) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.GITHUB_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const value = JSON.stringify(['studybase-admin-csrf-v1', env.ADMIN_ORIGIN, identity.sub, identity.iat, identity.exp]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function verifyMutation(request, identity, env) {
  if (request.headers.get('Origin') !== env.ADMIN_ORIGIN || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    throw new HttpError(403, '관리 화면에서 다시 요청해 주세요.');
  const actual = request.headers.get('X-Admin-CSRF') || '', expected = await csrfToken(identity, env);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  if (difference) throw new HttpError(403, '로그인을 새로 확인한 뒤 다시 시도해 주세요. 원고는 그대로 남아 있습니다.');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || ''))
    throw new HttpError(415, 'JSON 요청만 사용할 수 있습니다.');
}
