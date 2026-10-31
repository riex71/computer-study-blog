import { GitHubPublisher, LIVE } from '../publisher.mjs';
import { configuration, verifyOwner, verifyMutation, csrfToken, HttpError, beginOAuth, finishOAuth, loginPage, logout, setupProof } from './auth.mjs';
import { verifyGitHubOwner, REPOSITORY_ID } from './github.mjs';

const MAX_BODY = 12 * 1024 * 1024;
const safeSource = /^content\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:md|html)$/;
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  headers.delete('Access-Control-Allow-Origin');
  return new Response(response.body, { status: response.status, headers });
}
async function bodyOf(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new HttpError(413, '한 번에 게시할 원고와 그림의 용량을 줄여 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '원고가 비어 있습니다.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); throw new HttpError(413, '한 번에 게시할 원고와 그림의 용량을 줄여 주세요.'); }
    chunks.push(value);
  }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new HttpError(400, '원고 요청을 읽을 수 없습니다.'); }
}
export function validatePublication(body) {
  const draft = body?.draft, post = draft?.post;
  if (!post || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug || '') || post.slug.length > 100 ||
      typeof post.title !== 'string' || !post.title.trim() || post.title.length > 180 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(post.date || '') || Number.isNaN(Date.parse(post.date)) ||
      typeof draft.markdown !== 'string' || !draft.markdown.trim() || draft.markdown.length > 1000000 ||
      typeof body.html !== 'string' || !body.html.trim() || body.html.length > 2000000)
    throw new HttpError(400, '글 제목·주소·작성일·본문을 확인해 주세요.');
  for (const name of ['topics', 'tags']) if (!Array.isArray(post[name]) || post[name].length > 20 || post[name].some(v => typeof v !== 'string' || v.length > 200))
    throw new HttpError(400, '글의 주제와 태그를 확인해 주세요.');
  const cleanPost = {};
  for (const name of ['slug','title','description','date','category','deck','shortTitle','thumbnail','thumbnailAlt','thumbnailCredit','thumbnailSource','revisionNote']) {
    if (post[name] !== undefined && (typeof post[name] !== 'string' || post[name].length > 2000)) throw new HttpError(400, '글 정보가 올바르지 않습니다.');
    if (post[name] !== undefined) cleanPost[name] = post[name];
  }
  cleanPost.topics = post.topics; cleanPost.tags = post.tags;
  const images = draft.images || [];
  if (!Array.isArray(images) || images.length > 30) throw new HttpError(400, '첨부 그림 수를 확인해 주세요.');
  for (const image of images) {
    if (!new RegExp('^assets/uploads/' + post.slug + '/[a-z0-9.-]+\\.(?:png|jpg|webp)$').test(image?.path || '') ||
        typeof image.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) || image.base64.length % 4 ||
        !['image/png','image/jpeg','image/webp'].includes(image.type)) throw new HttpError(400, '첨부 그림 경로와 형식을 확인해 주세요.');
  }
  const original = draft.original;
  if (original && (!original.post || original.post.slug !== post.slug || typeof original.markdown !== 'string')) throw new HttpError(400, '수정할 원본 글을 다시 불러와 주세요.');
  return { post: cleanPost, markdown: draft.markdown, images, original: original || null };
}
export function createHandler({ fetchImpl = fetch, publisherFor } = {}) {
  publisherFor ||= token => new GitHubPublisher(token, 'main', (url, init) => fetchImpl(url, { ...init, headers: { ...init.headers, 'User-Agent': 'Studybase-Private-Admin' } }));
  return async function handle(request, env) {
    try {
      configuration(env);
      const url = new URL(request.url);
      if (url.origin !== env.ADMIN_ORIGIN) throw new HttpError(403, '등록한 관리자 주소로 접속해 주세요.');
      if (request.method === 'GET' && url.pathname === '/auth/github/start') return privateResponse(await beginOAuth(request, env));
      if (request.method === 'GET' && url.pathname === '/auth/github/callback') return privateResponse(await finishOAuth(request, env, fetchImpl));
      let identity;
      try { identity = await verifyOwner(request, env); }
      catch (error) {
        if (error.status === 401 && request.method === 'GET' && ['/','/index.html','/write.html'].includes(url.pathname)) return privateResponse(loginPage(request));
        throw error;
      }
      if (!['GET','HEAD','POST'].includes(request.method)) throw new HttpError(405, '지원하지 않는 요청입니다.');
      if (request.method === 'POST' && url.pathname === '/auth/logout') return privateResponse(await logout(request, identity, env));
      const publisher = publisherFor(identity.token);
      if (url.pathname.startsWith('/api/')) {
        let response;
        if (request.method === 'GET' && url.pathname === '/api/session') {
          await verifyGitHubOwner(identity.token, env, fetchImpl);
          await publisher.connect();
          response = json({ login: identity.login, csrf: await csrfToken(identity, env) });
        } else if (request.method === 'GET' && url.pathname === '/api/head') {
          response = json({ sha: await publisher.head() });
        } else if (request.method === 'GET' && url.pathname === '/api/file') {
          const path = url.searchParams.get('path'), ref = url.searchParams.get('ref');
          if (path !== 'content/posts.json' && !safeSource.test(path || '')) throw new HttpError(400, '허용하지 않는 원고 경로입니다.');
          if (!/^[a-f0-9]{40}$/.test(ref || '')) throw new HttpError(400, '원고 버전을 다시 확인해 주세요.');
          response = json({ text: await publisher.file(path, ref) });
        } else if (request.method === 'POST' && url.pathname === '/api/publish') {
          await verifyMutation(request, identity, env);
          const body = await bodyOf(request), draft = validatePublication(body);
          await verifyGitHubOwner(identity.token, env, fetchImpl);
          await publisher.connect();
          response = json(await publisher.publish(draft, body.html));
        } else if (request.method === 'POST' && url.pathname === '/api/setup/verify') {
          await verifyMutation(request, identity, env);
          const body = await bodyOf(request);
          if (!env.SETUP_NONCE || body.nonce !== env.SETUP_NONCE) throw new HttpError(404, '연결 확인 요청이 만료됐습니다.');
          await verifyGitHubOwner(identity.token, env, fetchImpl, true);
          await publisher.connect();
          await publisher.request('git/blobs', 'POST', { content: btoa('Studybase admin permission check\n'), encoding: 'base64' });
          response = json({ proof: await setupProof(identity, env), repository: REPOSITORY_ID });
        } else throw new HttpError(404, '관리 요청을 찾을 수 없습니다.');
        return privateResponse(response);
      }
      if (!['GET','HEAD'].includes(request.method)) throw new HttpError(405, '지원하지 않는 요청입니다.');
      if (url.pathname === '/setup/complete') {
        if (!env.SETUP_NONCE || url.searchParams.get('nonce') !== env.SETUP_NONCE) throw new HttpError(404, '연결 확인 요청이 만료됐습니다.');
        const nonce = JSON.stringify(env.SETUP_NONCE).replace(/</g,'\\u003c'), csrf = JSON.stringify(identity.csrf);
        return privateResponse(new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>블로그 연결 확인</title><style>body{max-width:560px;margin:12vh auto;padding:25px;font:16px/1.9 system-ui}h1{font-size:25px;font-weight:400}button,a{padding:10px 15px;color:#275b41}button{cursor:pointer}</style><h1>GitHub 로그인 완료</h1><p>riex71 · computer-study-blog</p><p>저장소 쓰기 권한을 확인합니다. 현재 공개 글은 변경하지 않습니다.</p><button id="verify">연결 확인</button><p id="status"></p><a id="complete" hidden>설정 완료 알리기</a><script>document.getElementById("verify").onclick=async()=>{const button=document.getElementById("verify"),status=document.getElementById("status");button.disabled=true;try{const r=await fetch("/api/setup/verify",{method:"POST",headers:{"Content-Type":"application/json","X-Admin-CSRF":'+csrf+'},body:JSON.stringify({nonce:'+nonce+'})}),d=await r.json();if(!r.ok)throw Error(d.error);status.textContent="로그인과 게시 권한이 확인됐습니다.";const link=document.getElementById("complete");link.href="http://127.0.0.1:8768/verified?proof="+encodeURIComponent(d.proof);link.hidden=false;}catch(e){status.textContent=e.message;button.disabled=false;}};</script></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}));
      }
      if (url.pathname === '/content/posts.json' || safeSource.test(url.pathname.slice(1))) {
        const sha = await publisher.head(), path = url.pathname.slice(1);
        return privateResponse(new Response(request.method === 'HEAD' ? null : await publisher.file(path, sha), { headers: { 'Content-Type': path.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' } }));
      }
      if (url.pathname === '/' || url.pathname === '/index.html') return privateResponse(Response.redirect(new URL('/write.html' + url.search, url.origin), 302));
      if (/^\/(?:posts\/[^/]+\.html|examples\/|archive\.html|series\.html)/.test(url.pathname)) return privateResponse(Response.redirect(new URL(url.pathname.slice(1) + url.search, LIVE), 302));
      if (!env.ASSETS) throw new HttpError(503, '관리 화면 파일이 준비되지 않았습니다.');
      return privateResponse(await env.ASSETS.fetch(request));
    } catch (error) {
      const conflict = /^(?:다른 곳에서|게시 준비 중|저장소가 변경되었습니다|이미 같은 주소의 글)/.test(error?.message || '');
      const status = error instanceof HttpError ? error.status : conflict ? 409 : 502;
      const message = error instanceof HttpError || conflict ? error.message : '저장소 연결 또는 게시에 실패했습니다. 원고는 그대로 남아 있습니다. 다시 시도해 주세요.';
      if (new URL(request.url).pathname === '/auth/github/callback') return privateResponse(loginPage(request, message));
      return privateResponse(json({ error: message }, status));
    }
  };
}
export default { fetch: createHandler() };
