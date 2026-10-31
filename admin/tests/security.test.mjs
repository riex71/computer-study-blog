import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createHandler } from '../worker.mjs';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const keySet = createLocalJWKSet({ keys: [jwk] });
const origin = 'https://admin.example.test', issuer = 'https://studybase-test.cloudflareaccess.com';
const sha = 'a'.repeat(40), secret = 'server-only-test-credential';
const baseEnv = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'studybase-audience', OWNER_EMAIL: 'owner@example.test', ADMIN_ORIGIN: origin, GITHUB_TOKEN: secret };
async function token(claims = {}, signingKey = privateKey) {
  return new SignJWT({ email: baseEnv.OWNER_EMAIL, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(claims.iss || issuer).setAudience(claims.aud || baseEnv.ACCESS_AUD).setSubject('owner-id').setIssuedAt().setExpirationTime(claims.exp || '1h').sign(signingKey);
}
function setup(options = {}) {
  const calls = [], publisher = {
    connect: async () => { calls.push('connect'); return {}; },
    head: async () => { calls.push('head'); return sha; },
    file: async path => { calls.push(path); return path.endsWith('.json') ? '[]' : 'original'; },
    publish: async draft => { calls.push(draft); return { sha: 'b'.repeat(40), post: draft.post, markdown: draft.markdown, html: '<p>본문</p>' }; }
  };
  const handler = createHandler({ keySet, publisherFor: () => publisher, fetchImpl: async () => new Response(JSON.stringify({ login: options.login || 'riex71' })) });
  const env = { ...baseEnv, ASSETS: { fetch: async () => { calls.push('asset'); return new Response('private editor'); } } };
  const request = async (path, { jwt, body, origin: from = origin, headers = {}, method = body ? 'POST' : 'GET', ...other } = {}) => {
    jwt ??= await token();
    return handler(new Request(origin + path, { method, headers: { 'Cf-Access-Jwt-Assertion': jwt, ...(body ? { Origin: from, 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ...env, ...other.env });
  };
  return { calls, handler, env, request };
}
const publication = () => ({ draft: { post: { slug:'sample-note', title:'원고', date:'2026-10-31', description:'설명', topics:[], tags:[] }, markdown:'## 제목\n\n본문', images:[], original:null }, html:'<h2>제목</h2><p>본문</p>' });

test('missing Access configuration fails closed even for static assets', async () => {
  const s = setup(); const r = await s.handler(new Request(origin + '/write.html'), { ASSETS: s.env.ASSETS });
  assert.equal(r.status, 503); assert.deepEqual(s.calls, []);
});
test('no assertion, fabricated identity headers and unsigned tokens never expose editor assets', async () => {
  const s = setup();
  for (const jwt of ['', 'header.payload.signature', 'eyJhbGciOiJub25lIn0.eyJlbWFpbCI6Im93bmVyQGV4YW1wbGUudGVzdCJ9.']) {
    assert.equal((await s.request('/write.html', { jwt, headers: { 'Cf-Access-Authenticated-User-Email': baseEnv.OWNER_EMAIL } })).status, 401);
  }
  assert.deepEqual(s.calls, []);
});
test('expired tokens, wrong audience, wrong issuer and another signing key are rejected', async () => {
  const s = setup(), other = await generateKeyPair('RS256');
  for (const jwt of [await token({ exp: 1 }), await token({ aud:'another-app' }), await token({ iss:'https://other.cloudflareaccess.com' }), await token({}, other.privateKey)]) {
    assert.equal((await s.request('/write.html', { jwt })).status, 401);
  }
  assert.deepEqual(s.calls, []);
});
test('a valid Access token for another person is denied on pages and APIs', async () => {
  const s = setup(), jwt = await token({ email:'somebody@example.test' });
  for (const path of ['/write.html','/writer.mjs','/api/session','/api/head']) assert.equal((await s.request(path, { jwt })).status, 403);
  assert.deepEqual(s.calls, []);
});
test('the registered owner receives private assets with no-store and no CORS access', async () => {
  const s = setup(), r = await s.request('/write.html');
  assert.equal(r.status, 200); assert.equal(await r.text(), 'private editor');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store'); assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(r.headers.get('X-Frame-Options'), 'DENY'); assert.equal(r.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
test('alternate deployment hosts cannot bypass the registered host boundary', async () => {
  const s = setup(), jwt = await token();
  const r = await s.handler(new Request('https://preview.example.test/write.html', { headers:{ 'Cf-Access-Jwt-Assertion':jwt } }), s.env);
  assert.equal(r.status, 403); assert.deepEqual(s.calls, []);
});
test('session verifies the GitHub account and exposes no server credential', async () => {
  const s = setup(), r = await s.request('/api/session'), text = await r.text();
  assert.equal(r.status, 200); assert.ok(!text.includes(secret));
  const data = JSON.parse(text); assert.equal(data.email, baseEnv.OWNER_EMAIL); assert.match(data.csrf, /^[a-f0-9]{64}$/);
  assert.deepEqual(s.calls, ['connect']);
});
test('another GitHub account is rejected even if its repository permissions would allow push', async () => {
  const s = setup({ login:'collaborator' }); assert.equal((await s.request('/api/session')).status, 503); assert.deepEqual(s.calls, []);
});
test('CSRF is bound to the authenticated identity and external origins cannot publish', async () => {
  const s = setup(), jwt = await token(), csrf = (await (await s.request('/api/session',{jwt})).json()).csrf;
  for (const options of [{}, { headers:{'X-Admin-CSRF':csrf}, origin:'https://evil.example' }, {headers:{'X-Admin-CSRF':csrf,'Sec-Fetch-Site':'cross-site'}}]) {
    assert.equal((await s.request('/api/publish', { jwt, body:publication(), ...options })).status, 403);
  }
  assert.equal(s.calls.filter(v=>typeof v==='object').length, 0);
});
test('authorized publication uses the fixed repository publisher and returns no token', async () => {
  const s = setup(), jwt = await token(), csrf = (await (await s.request('/api/session',{jwt})).json()).csrf;
  const r = await s.request('/api/publish', { jwt, body:publication(), headers:{'X-Admin-CSRF':csrf} });
  assert.equal(r.status, 200); assert.ok(!(await r.text()).includes(secret)); assert.equal(s.calls.filter(v=>typeof v==='object').length,1);
});
test('invalid source paths, arbitrary refs and unknown write endpoints cannot reach GitHub', async () => {
  const s = setup();
  for (const path of ['/api/file?path=.github/workflows/pages.yml&ref='+sha, '/api/file?path=content/articles/../../secrets.md&ref='+sha, '/api/file?path=content/posts.json&ref=other-branch']) assert.equal((await s.request(path)).status,400);
  assert.equal((await s.request('/api/git/refs/heads/main',{body:{}})).status,404); assert.deepEqual(s.calls,[]);
});
test('oversize requests, path escapes, invalid metadata and cross-post uploads fail before mutation', async () => {
  const s = setup(), jwt = await token(), csrf = (await (await s.request('/api/session',{jwt})).json()).csrf;
  const bad = [publication(), publication(), publication()];
  bad[0].draft.post.slug='../escape';bad[1].draft.post.topics=['x'.repeat(201)];bad[2].draft.images=[{path:'assets/uploads/other-note/a.png',base64:'AQID',type:'image/png'}];
  for(const body of bad) assert.equal((await s.request('/api/publish',{jwt,body,headers:{'X-Admin-CSRF':csrf}})).status,400);
  assert.equal((await s.request('/api/publish',{jwt,body:publication(),headers:{'X-Admin-CSRF':csrf,'Content-Length':String(13*1024*1024)}})).status,413);
  assert.equal(s.calls.filter(v=>typeof v==='object').length,0);
});
test('server GitHub transport has the required User-Agent and a fixed API host', async () => {
  const seen=[];
  const handler=createHandler({keySet,fetchImpl:async(url,init)=>{seen.push([url,init.headers]);return new Response(JSON.stringify(url.endsWith('/user')?{login:'riex71'}:{permissions:{push:true}}));}});
  const r=await handler(new Request(origin+'/api/session',{headers:{'Cf-Access-Jwt-Assertion':await token()}}),baseEnv);
  assert.equal(r.status,200);assert.equal(seen.length,2);
  for(const [url,headers] of seen){assert.equal(new URL(url).hostname,'api.github.com');assert.equal(headers['User-Agent'],'Studybase-Private-Admin');assert.equal(headers.Authorization,'Bearer '+secret);}
});
