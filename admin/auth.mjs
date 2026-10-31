import { EncryptJWT, jwtDecrypt, SignJWT, base64url } from 'jose';
import { OWNER_ID, OWNER_LOGIN, REPOSITORY_ID, verifyGitHubOwner } from './github.mjs';
const encoder = new TextEncoder();
export const SESSION_COOKIE = '__Host-studybase-session', OAUTH_COOKIE = '__Host-studybase-oauth';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function configuration(env) {
  if (!env.ADMIN_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_APP_ID || !env.SESSION_SECRET || !env.SESSIONS)
    throw new HttpError(503, '관리자 인증 설정이 아직 완료되지 않았습니다.');
  let origin,key;
  try { origin=new URL(env.ADMIN_ORIGIN);key=base64url.decode(env.SESSION_SECRET); } catch { throw new HttpError(503, '관리자 인증 설정을 확인해 주세요.'); }
  if(origin.protocol!=='https:'||origin.origin!==env.ADMIN_ORIGIN||key.length!==32)throw new HttpError(503,'관리자 주소와 보안 키 설정을 확인해 주세요.');
  return {origin:origin.origin,key};
}
const random = () => base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
const digest = async text => base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))));
const cookie = (name,value,age) => name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
function readCookie(request,name) {
  const values=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
  if(values.length!==1)return '';
  const value=values[0].slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
async function seal(payload,env,purpose,age) {
  return new EncryptJWT(payload).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer(env.ADMIN_ORIGIN).setAudience(purpose).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+age).encrypt(configuration(env).key);
}
async function unseal(value,env,purpose) {
  const {payload}=await jwtDecrypt(value,configuration(env).key,{issuer:env.ADMIN_ORIGIN,audience:purpose,keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM'],requiredClaims:['iat','exp'],clockTolerance:5});return payload;
}
export function safeReturn(value) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/write.html';
  const u=new URL(value,'https://return.invalid');
  return ['/write.html','/write','/setup/complete'].includes(u.pathname)?u.pathname+u.search:'/write.html';
}
function requireOrigin(request,env) {
  if(new URL(request.url).origin!==env.ADMIN_ORIGIN)throw new HttpError(403,'등록한 관리자 주소로 접속해 주세요.');
}
export async function beginOAuth(request,env) {
  configuration(env);requireOrigin(request,env);
  const state=random(),browser=random(),verifier=random(),returnTo=safeReturn(new URL(request.url).searchParams.get('returnTo'));
  const record=await seal({browser:await digest(browser),verifier,returnTo},env,'studybase-oauth',600);
  await env.SESSIONS.put('oauth:'+await digest(state),record,{expirationTtl:600});
  const target=new URL('https://github.com/login/oauth/authorize');
  for(const [key,value] of Object.entries({client_id:env.GITHUB_CLIENT_ID,redirect_uri:env.ADMIN_ORIGIN+'/auth/github/callback',state,code_challenge:await digest(verifier),code_challenge_method:'S256',login:OWNER_LOGIN,allow_signup:'false',repository_id:String(REPOSITORY_ID),scope:'offline_access'}))target.searchParams.set(key,value);
  return new Response(null,{status:302,headers:{Location:target.href,'Set-Cookie':cookie(OAUTH_COOKIE,browser,600)}});
}
export async function finishOAuth(request,env,fetchImpl=fetch) {
  configuration(env);requireOrigin(request,env);
  const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code'),browser=readCookie(request,OAUTH_COOKIE);
  if(!/^[A-Za-z0-9_-]{43}$/.test(state||'')||!browser||!code||code.length>512)throw new HttpError(400,'로그인 요청이 일치하지 않습니다. 처음부터 다시 로그인해 주세요.');
  const key='oauth:'+await digest(state),record=await env.SESSIONS.get(key);let flow;
  try{flow=await unseal(record,env,'studybase-oauth');}catch{throw new HttpError(400,'로그인 요청이 만료됐습니다. 다시 로그인해 주세요.');}
  if(flow.browser!==await digest(browser))throw new HttpError(400,'이 브라우저에서 시작한 로그인만 사용할 수 있습니다.');
  await env.SESSIONS.delete(key);
  let response;
  try{response=await fetchImpl('https://github.com/login/oauth/access_token',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'Studybase-Private-Admin'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,code_verifier:flow.verifier,redirect_uri:env.ADMIN_ORIGIN+'/auth/github/callback',repository_id:REPOSITORY_ID})});}catch{throw new HttpError(502,'GitHub 로그인에 연결하지 못했습니다. 다시 시도해 주세요.');}
  const grant=await response.json().catch(()=>({}));
  if(!response.ok||typeof grant.access_token!=='string'||grant.error)throw new HttpError(401,'GitHub 로그인을 완료하지 못했습니다. 다시 로그인해 주세요.');
  const user=await verifyGitHubOwner(grant.access_token,env,fetchImpl,true);
  const age=Math.min(4*3600,Number(grant.expires_in||8*3600)-60);
  if(!Number.isFinite(age)||age<60)throw new HttpError(401,'로그인이 만료됐습니다. 다시 로그인해 주세요.');
  const id=random(),csrf=random(),payload={sub:String(user.id),login:user.login,csrf,token:grant.access_token};
  await env.SESSIONS.put('session:'+await digest(id),await seal(payload,env,'studybase-session',age),{expirationTtl:age});
  const headers=new Headers({Location:env.ADMIN_ORIGIN+safeReturn(flow.returnTo)});
  headers.append('Set-Cookie',cookie(OAUTH_COOKIE,'',0));headers.append('Set-Cookie',cookie(SESSION_COOKIE,id,age));
  return new Response(null,{status:302,headers});
}
export async function verifyOwner(request,env) {
  configuration(env);requireOrigin(request,env);
  const id=readCookie(request,SESSION_COOKIE);
  if(!id)throw new HttpError(401,'GitHub 로그인이 필요합니다.');
  const key='session:'+await digest(id);let payload;
  try{payload=await unseal(await env.SESSIONS.get(key),env,'studybase-session');}catch{throw new HttpError(401,'로그인이 만료됐습니다. 원고를 보관한 뒤 다시 로그인해 주세요.');}
  if(payload.sub!==String(OWNER_ID)||payload.login?.toLowerCase()!==OWNER_LOGIN||typeof payload.token!=='string'||typeof payload.csrf!=='string')throw new HttpError(403,'블로그 소유자만 사용할 수 있습니다.');
  return {...payload,sessionKey:key};
}
export const csrfToken = async identity => identity.csrf;
export async function verifyMutation(request,identity,env) {
  if(request.headers.get('Origin')!==env.ADMIN_ORIGIN||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HttpError(403,'관리 화면에서 다시 요청해 주세요.');
  const actual=request.headers.get('X-Admin-CSRF')||'',expected=identity.csrf;
  let difference=actual.length^expected.length;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);
  if(difference)throw new HttpError(403,'로그인을 새로 확인한 뒤 다시 시도해 주세요. 원고는 그대로 남아 있습니다.');
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new HttpError(415,'JSON 요청만 사용할 수 있습니다.');
}
export async function logout(request,identity,env) {
  await verifyMutation(request,identity,env);await env.SESSIONS.delete(identity.sessionKey);
  return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie(SESSION_COOKIE,'',0)}});
}
export async function setupProof(identity,env) {
  const master=await crypto.subtle.importKey('raw',configuration(env).key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const key=new Uint8Array(await crypto.subtle.sign('HMAC',master,encoder.encode('studybase-local-setup-proof-v1')));
  return new SignJWT({sub:identity.sub,login:identity.login,nonce:env.SETUP_NONCE,repository:REPOSITORY_ID,canWrite:true}).setProtectedHeader({alg:'HS256'}).setIssuer(env.ADMIN_ORIGIN).setAudience('studybase-local-setup').setIssuedAt().setExpirationTime('2m').sign(key);
}
export function loginPage(request,message='') {
  const returnTo=safeReturn(new URL(request.url).pathname+new URL(request.url).search),target='/auth/github/start?returnTo='+encodeURIComponent(returnTo);
  const escape=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>블로그 관리 로그인</title><style>body{max-width:480px;margin:15vh auto;padding:24px;font:16px/1.9 system-ui;color:#243329;background:#fafbf9}h1{font-size:25px;font-weight:400}a{color:#275b41}p{margin:22px 0}.login{display:inline-block;padding:10px 20px;border:1px solid #c8d4cb;border-radius:5px;text-decoration:none}</style><h1>블로그 관리</h1><p>riex71 계정으로 로그인해 주세요.</p>'+(message?'<p>'+escape(message)+'</p>':'')+'<a class="login" href="'+escape(target)+'">GitHub로 로그인</a><p><a href="https://riex71.github.io/computer-study-blog/">블로그로 돌아가기</a></p></html>',{status:message?401:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
}
