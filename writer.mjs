const { GitHubPublisher, LIVE } = await import('./publisher.mjs' + new URL(import.meta.url).search);
const $ = s => document.querySelector(s);
const fields = ['title','description','slug','date','category','topics','tags','thumbnail','thumbnail-alt','thumbnail-credit','thumbnail-source'];
const initialParams = new URLSearchParams(location.search);
const requestedEdit = initialParams.get('edit'), requestedDraft = initialParams.get('draft');
let draft, drafts = [], posts = [], publisher, busy = false, pending = 0, storageFailed = false, pollTimer;
const message = text => { $('#writer-message').textContent = text; };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('studybase.writer.v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(Error('브라우저 저장소를 열 수 없습니다.'));
});
async function dbOperation(mode, action) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode), req = action(tx.objectStore('drafts'));
    tx.oncomplete = () => resolve(req?.result); tx.onerror = tx.onabort = () => reject(Error('임시 글을 저장하지 못했습니다.'));
  });
}
const split = value => [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 20);
function blank() {
  return { id: crypto.randomUUID(), post: { title:'', description:'', deck:'', shortTitle:'', slug:'', date:today(), category:'논문 리뷰', topics:[], tags:[], thumbnail:'assets/social-cover.png', thumbnailAlt:'', thumbnailCredit:'', thumbnailSource:'' }, markdown:'', images:[], original:null, savedAt:new Date().toISOString() };
}
function collect() {
  if (!draft) return;
  const p = draft.post;
  for (const key of ['title','description','slug','date','category','thumbnail']) p[key] = $('#post-' + key).value.trim();
  p.shortTitle = p.title; p.deck = p.description;
  p.topics = split($('#post-topics').value); p.tags = split($('#post-tags').value);
  for (const [key, id] of [['thumbnailAlt','thumbnail-alt'],['thumbnailCredit','thumbnail-credit'],['thumbnailSource','thumbnail-source']]) p[key] = $('#post-' + id).value.trim();
  draft.markdown = $('#markdown-editor').value;
  draft.savedAt = new Date().toISOString();
}
function renderPreview() {
  if (!draft) return;
  const previewPane=$('.preview-pane'),scroll=previewPane.scrollTop;
  $('#preview-title').textContent = draft.post.title || '제목 미리보기';
  $('#preview-description').textContent = draft.post.description;
  $('#preview-body').innerHTML = EditorContent.preview(EditorContent.compile(draft.markdown, draft.original?.html), draft.images);
  const math = StudyMath.render($('#preview-body'));
  $('#math-status').textContent = math.errors ? `${math.errors}개 수식의 문법을 확인해 주세요. 입력한 식은 그대로 보관됩니다.` : '';
  previewPane.scrollTop=scroll;
  $('#word-count').textContent = draft.markdown.replace(/\s/g, '').length.toLocaleString() + '자';
}
async function save() {
  if (!draft) return;
  collect();
  if (!draft.original && !draft.post.title && !draft.post.description && !draft.post.slug && !draft.markdown && !draft.images.length) return;
  const snapshot = structuredClone(draft); pending++;
  $('#draft-status').textContent = '임시 저장 중…';
  try {
    await dbOperation('readwrite', store => store.put(snapshot));
    const index = drafts.findIndex(d => d.id === snapshot.id);
    if (index < 0) drafts.push(snapshot); else drafts[index] = snapshot;
    storageFailed = false;
    $('#draft-status').textContent = '이 브라우저에 저장됨 · ' + new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    renderDrafts();
  } catch {
    storageFailed = true; $('#draft-status').textContent = '저장 실패 · 원고를 내려받아 주세요.';
  } finally { pending--; }
}
function fill(next) {
  draft = structuredClone(next); const p = draft.post;
  draft.markdown = EditorContent.normalizeLegacy(draft.markdown, draft.original?.html);
  if (location.protocol !== 'file:') history.replaceState(null, '', location.pathname + '?draft=' + encodeURIComponent(draft.id));
  for (const key of ['title','description','slug','date','category','thumbnail']) $('#post-' + key).value = p[key] || '';
  $('#post-topics').value = p.topics.join(', '); $('#post-tags').value = p.tags.join(', ');
  for (const [key, id] of [['thumbnailAlt','thumbnail-alt'],['thumbnailCredit','thumbnail-credit'],['thumbnailSource','thumbnail-source']]) $('#post-' + id).value = p[key] || '';
  $('#post-slug').disabled = !!draft.original || !!draft.images.length;
  $('#markdown-editor').value = draft.markdown; renderPreview(); renderDrafts(); message('');
}
function renderDrafts() {
  const list = $('#draft-list'); list.replaceChildren();
  for (const entry of [...drafts].sort((a,b) => b.savedAt.localeCompare(a.savedAt))) {
    const row = document.createElement('div'); row.className = 'draft-item' + (entry.id === draft?.id ? ' active' : '');
    const open = document.createElement('button'); open.type = 'button'; open.textContent = entry.post.title || '제목 없는 글'; open.title = open.textContent;
    open.addEventListener('click', () => { if (busy || draft?.id === entry.id) return; save(); fill(entry); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', open.textContent + ' 임시 글 삭제');
    remove.addEventListener('click', async () => {
      if (busy || !confirm('이 브라우저의 임시 글을 삭제할까요? 공개된 글은 유지됩니다.')) return;
      try { await dbOperation('readwrite', store => store.delete(entry.id)); drafts = drafts.filter(d => d.id !== entry.id); if (draft?.id === entry.id) fill(blank()); else renderDrafts(); }
      catch { message('임시 글을 삭제하지 못했습니다.'); }
    }); row.append(open, remove); list.append(row);
  }
  if (!drafts.length) { const empty = document.createElement('p'); empty.className = 'help'; empty.textContent = '아직 저장한 글이 없어요.'; list.append(empty); }
}
async function publicFile(path) {
  const url = new URL(path, location.href); url.searchParams.set('v', Date.now());
  const res = await fetch(url, { cache:'no-store' }); if (!res.ok) throw Error('공개 원고를 불러오지 못했습니다. 배포가 끝난 뒤 다시 시도해 주세요.'); return res.text();
}
function populatePosts() {
  const select = $('#published-post'); const selected = select.value; select.replaceChildren(new Option('수정할 글 선택', ''));
  for (const post of posts) select.add(new Option(post.title, post.slug)); select.value = selected;
}
async function loadPost(slug, force = false) {
  if (!slug || busy) return;
  const existing = drafts.find(d => d.original?.post.slug === slug);
  if (existing && !force) { if (draft?.id !== existing.id) { save(); fill(existing); } message('이 글의 임시 원고를 이어 씁니다. 최신 공개 원고로 다시 시작하려면 임시 글을 먼저 내려받고 삭제해 주세요.'); return; }
  busy = true; $('#load-post').disabled = true; $('#new-post').disabled = true; $('.writing-desk').inert = true;
  try {
    await save();
    let post, markdown, html;
    if (publisher) {
      const sha = await publisher.head(); posts = JSON.parse(await publisher.file('content/posts.json', sha)); populatePosts(); post = posts.find(p => p.slug === slug);
      if (!post) throw Error('공개 글을 찾을 수 없습니다.');
      [markdown, html] = await Promise.all([publisher.file(post.sourceMarkdown, sha), publisher.file(post.sourceHtml, sha)]);
    } else {
      post = posts.find(p => p.slug === slug); if (!post) throw Error('공개 글을 찾을 수 없습니다.');
      [markdown, html] = await Promise.all([publicFile(post.sourceMarkdown), publicFile(post.sourceHtml)]);
    }
    const next = blank(); next.post = structuredClone(post); next.markdown = markdown.trim(); next.original = { post:structuredClone(post), markdown, html };
    fill(next); await save(); message('공개 원고를 불러왔습니다. 수정 사항은 게시 전까지 이 브라우저에만 저장됩니다.');
  } catch (error) { message(error.message); } finally { busy = false; $('#load-post').disabled = false; $('#new-post').disabled = false; $('.writing-desk').inert = false; }
}
function validate() {
  collect(); const p = draft.post;
  if (!p.title) throw Error('글 제목을 적어주세요.');
  if (!p.description) throw Error('목록에 표시할 소개를 적어주세요.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > 100) throw Error('글 정보에서 주소를 정해 주세요. 영문 소문자, 숫자, 하이픈을 쓸 수 있습니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(p.date))) throw Error('작성일을 확인해 주세요.');
  if (!draft.markdown.trim()) throw Error('본문을 작성해 주세요.');
  const asset = /^(?:assets\/[a-zA-Z0-9_./-]+|https:\/\/[^\s<>"']+)$/;
  if (!p.thumbnail) p.thumbnail = 'assets/social-cover.png';
  if (!asset.test(p.thumbnail) || p.thumbnail.includes('..')) throw Error('대표 이미지에는 assets/ 경로 또는 https 주소를 써주세요.');
  if (p.thumbnailSource && !/^https:\/\/[^\s<>"']+$/.test(p.thumbnailSource)) throw Error('이미지 출처 링크는 https 주소를 써주세요.');
  p.category ||= '공부 기록';
  const html=EditorContent.compile(draft.markdown, draft.original?.html),probe=document.createElement('div');probe.innerHTML=html;
  if(StudyMath.render(probe).errors)throw Error('수식 문법을 확인해 주세요. 미리보기에서 오류가 있는 식을 고친 뒤 게시할 수 있습니다.');
  return html;
}
for (const key of fields) $('#post-' + key).addEventListener('input', () => { collect(); renderPreview(); save(); });
$('#post-title').addEventListener('change', () => {
  if (!$('#post-slug').value && !draft.original && !draft.images.length && $('#post-title').value.trim()) {
    $('#post-slug').value = $('#post-title').value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '') || 'note-' + today().replace(/-/g, '') + '-' + draft.id.slice(0, 6);
    save();
  }
});
let previewTimer;
$('#markdown-editor').addEventListener('input', () => { collect();clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,100);save(); });
$('#new-post').addEventListener('click', () => { if (busy) return; save(); fill(blank()); $('#post-title').focus(); });
$('#load-post').addEventListener('click', () => loadPost($('#published-post').value));
for (const button of document.querySelectorAll('button[data-mode]')) button.addEventListener('click', () => {
  document.querySelector('.editor-panes').dataset.mode = button.dataset.mode;
  document.querySelectorAll('button[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
});
if (matchMedia('(max-width:800px)').matches) document.querySelector('button[data-mode="edit"]').click();
document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  const editor=$('#markdown-editor'), start=editor.selectionStart, end=editor.selectionEnd, selected=editor.value.slice(start,end);
  const snippets={heading:'\n\n## '+(selected||'소제목')+'\n\n',link:'['+(selected||'링크 설명')+'](https://example.com)',code:'\n\n```python\n'+(selected||'print("hello")')+'\n```\n\n',inlineMath:'$'+(selected||'x_t')+'$',blockMath:'\n\n$$\n'+(selected||'h_t = \\bar{A}h_{t-1} + \\bar{B}x_t')+'\n$$\n\n',table:'\n\n| 항목 | 값 |\n| --- | --- |\n| 예시 | 1 |\n\n'};
  if(document.querySelector('.editor-panes').dataset.mode==='preview')document.querySelector('button[data-mode="edit"]').click();
  editor.setRangeText(snippets[button.dataset.insert],start,end,'end');editor.focus();collect();renderPreview();save();
}));
$('#open-markdown-help').addEventListener('click',()=>{$('#markdown-help').open=true;});
$('#image-upload').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy) return; collect();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.post.slug)) { message('그림을 넣기 전에 ‘글 정보’에서 글 주소를 정해 주세요.'); $('.metadata-panel').open = true; $('#post-slug').focus(); return; }
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { message('PNG, JPG, WebP 그림을 5MB 이하로 첨부해 주세요.'); return; }
  if (draft.images.reduce((n,i) => n + i.base64.length, 0) > 24 * 1024 * 1024) { message('이 원고의 그림 용량이 큽니다. 먼저 게시한 뒤 이어서 첨부해 주세요.'); return; }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpg || file.type === 'image/webp' && webp)) throw Error('이미지 파일 형식을 확인해 주세요.');
    const bitmap = await createImageBitmap(file); bitmap.close();
    let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = 'assets/uploads/' + draft.post.slug + '/' + Date.now() + '-' + crypto.randomUUID().slice(0,8) + '.' + ext;
    draft.images.push({path,type:file.type,base64:btoa(binary)});
    const editor = $('#markdown-editor'), insert = '\n\n![그림 설명을 적어주세요](../' + path + ')\n\n그림 설명: 설명과 출처를 적어주세요.\n';
    editor.setRangeText(insert, editor.selectionStart, editor.selectionEnd, 'end');
    $('#post-slug').disabled = true; collect(); renderPreview(); await save(); message('그림을 첨부했습니다. 그림 설명과 출처를 함께 적어주세요. 게시하면 이미지도 업로드됩니다.');
  } catch (error) { message(error.message || '그림을 불러오지 못했습니다.'); }
});
function download() {
  collect(); const blob = new Blob([JSON.stringify({format:'studybase-draft-v1',draft},null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = (draft.post.slug || 'studybase-draft') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#download-draft').addEventListener('click', download);
$('#import-draft').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy) return;
  try {
    if (file.size > 40 * 1024 * 1024) throw Error('40MB 이하의 원고 파일을 선택해 주세요.');
    const data = JSON.parse(await file.text()), d = data.draft;
    if (data.format !== 'studybase-draft-v1' || !d?.post || typeof d.markdown !== 'string' || !Array.isArray(d.images) || !Array.isArray(d.post.topics) || !Array.isArray(d.post.tags)) throw Error('Studybase에서 내려받은 원고 파일을 선택해 주세요.');
    for (const key of ['title','description','slug','date','category','thumbnail']) if (typeof d.post[key] !== 'string') throw Error('원고 정보가 올바르지 않습니다.');
    for (const image of d.images) if (typeof image.path !== 'string' || typeof image.base64 !== 'string' || !['image/png','image/jpeg','image/webp'].includes(image.type) || !/^[a-zA-Z0-9+/=]+$/.test(image.base64)) throw Error('첨부 그림 정보가 올바르지 않습니다.');
    await save(); d.id = crypto.randomUUID(); fill(d); await save(); message('원고와 첨부 그림을 불러왔습니다.');
  } catch (error) { message(error.message); }
});
$('#connect-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const token = $('#github-token').value.trim(); $('#github-token').value = '';
  if (!token) { message('GitHub 토큰을 입력해 주세요.'); return; }
  const candidate = new GitHubPublisher(token); const button = $('#connect-form button'); button.disabled = true;
  try {
    await candidate.connect(); publisher?.disconnect(); publisher = candidate;
    $('#connection-state').textContent = '연결됨'; $('#connect-form').hidden = true; $('#disconnect').hidden = false; $('#token-help').open = false;
    message('GitHub 저장소에 연결했습니다. 게시 준비에서 최종 내용을 확인해 주세요.');
  } catch (error) { candidate.disconnect(); message(error.message); } finally { button.disabled = false; }
});
function disconnect() { publisher?.disconnect(); publisher = undefined; $('#github-token').value = ''; $('#connection-state').textContent = '연결 전'; $('#connect-form').hidden = false; $('#disconnect').hidden = true; }
$('#disconnect').addEventListener('click', disconnect); addEventListener('pagehide', disconnect);
$('#review-button').addEventListener('click', async () => {
  if (busy) return;
  try {
    validate(); await save();
    $('#review-post-title').textContent = draft.post.title; $('#review-url').textContent = LIVE + 'posts/' + draft.post.slug + '.html';
    $('#publish-status').textContent = publisher ? '게시할 준비가 되었습니다.' : 'GitHub 연결을 먼저 완료해 주세요. 작성한 원고는 임시 저장되어 있습니다.';
    $('#review-connect').hidden = !!publisher;
    $('#publish-button').disabled = !publisher; $('#published-link').hidden = true; $('#deployment-link').hidden = true;
    $('#publish-button').hidden = false; $('#review-dialog').showModal();
  } catch (error) { message(error.message); $('.metadata-panel').open = true; }
});
$('#close-review').addEventListener('click', () => { if (!busy) $('#review-dialog').close(); });
$('#review-connect').addEventListener('click', () => { $('#review-dialog').close(); $('#token-help').open = true; $('.connection-panel').scrollIntoView({block:'center'}); $('#github-token').focus({preventScroll:true}); });
$('#review-dialog').addEventListener('cancel', e => { if (busy) e.preventDefault(); });
async function watchDeployment(result, attempt = 0) {
  clearTimeout(pollTimer);
  try {
    const response = await fetch(new URL('build.json?v=' + Date.now(), LIVE), {cache:'no-store'});
    if (response.ok && (await response.json()).commit === result.sha) {
      $('#publish-status').textContent = '블로그 배포가 완료되었습니다.'; $('#published-link').href = result.url; $('#published-link').hidden = false; return;
    }
  } catch { /* The accepted commit is durable even if live verification is temporarily unavailable. */ }
  if (attempt >= 30) { $('#publish-status').textContent = '원고는 GitHub에 저장됐습니다. 배포 완료를 아직 확인하지 못했습니다. 배포 상태 링크에서 진행 상황을 확인해 주세요.'; return; }
  pollTimer = setTimeout(() => watchDeployment(result, attempt + 1), 10000);
}
$('#publish-button').addEventListener('click', async () => {
  if (busy || !publisher) return;
  let html; try { html = validate(); } catch (error) { $('#publish-status').textContent = error.message; return; }
  busy = true; $('#publish-button').disabled = true; $('#close-review').disabled = true;
  // Freeze the submitted snapshot; edits remain disabled until the ref update completes.
  const controls = [...document.querySelectorAll('.writing-desk input,.writing-desk textarea,.writing-desk button,.writer-sidebar button,.writer-sidebar select,.writer-sidebar input')];
  const previous = controls.map(c => c.disabled); controls.forEach(c => c.disabled = true);
  try {
    await save(); const submitted = structuredClone(draft);
    const result = await publisher.publish(submitted, html, text => $('#publish-status').textContent = text);
    draft.post = result.post; draft.original = {post:structuredClone(result.post),markdown:result.markdown,html:result.html}; draft.images = [];
    await save(); $('#publish-status').textContent = '원고를 GitHub에 저장했습니다. 블로그를 배포하는 중입니다…';
    $('#publish-button').hidden = true; $('#deployment-link').href = 'https://github.com/riex71/computer-study-blog/actions'; $('#deployment-link').hidden = false;
    posts = posts.filter(p => p.slug !== result.post.slug); posts.unshift(result.post); populatePosts(); watchDeployment(result);
  } catch (error) { $('#publish-status').textContent = error.message + '\n원고와 그림은 이 브라우저에 남아 있습니다.'; }
  finally { busy = false; controls.forEach((c,i) => c.disabled = previous[i]); $('#post-slug').disabled = !!draft.original || !!draft.images.length; $('#publish-button').disabled = false; $('#close-review').disabled = false; }
});
addEventListener('beforeunload', event => { if (busy || pending || storageFailed) { event.preventDefault(); event.returnValue = ''; } });
try { drafts = await dbOperation('readonly', store => store.getAll()); } catch { storageFailed = true; message('브라우저 저장소를 사용할 수 없습니다. 원고 내려받기로 보관해 주세요.'); }
fill(drafts.find(d => d.id === requestedDraft) || drafts.sort((a,b) => b.savedAt.localeCompare(a.savedAt))[0] || blank());
try {
  posts = JSON.parse(await publicFile('content/posts.json')); populatePosts();
  if (requestedEdit) { $('#published-post').value = requestedEdit; await loadPost(requestedEdit); }
} catch (error) { message(error.message); }
