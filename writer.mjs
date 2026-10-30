const { GitHubPublisher, LIVE } = await import('./publisher.mjs' + new URL(import.meta.url).search);
const { DraftStore, draftVersion } = await import('./draft-store.mjs' + new URL(import.meta.url).search);
const $ = s => document.querySelector(s);
const fields = ['title','description','slug','date','category','topics','tags','thumbnail','thumbnail-alt','thumbnail-credit','thumbnail-source','revision-note'];
const initialParams = new URLSearchParams(location.search);
const requestedEdit=initialParams.get('edit'),requestedDraft=initialParams.get('draft'),requestedNew=initialParams.get('new')==='1';
let returnToReview=false;
let editorReady=false;
let draft, drafts = [], posts = [], publisher, busy = false, pending = 0, storageFailed = false, pollTimer, deploymentEpoch=0, saveQueue=Promise.resolve();
const versions=new Map(),aliases=new Map(),unsaved=new Map(),draftStore=new DraftStore();
const channel=(()=>{try{return typeof BroadcastChannel==='function'?new BroadcastChannel('studybase.writer.updates'):null;}catch{return null;}})();
const message = text => {
  const box=$('#writer-message');box.replaceChildren();if(!text)return;
  const span=document.createElement('span');span.textContent=text;
  const close=document.createElement('button');close.type='button';close.textContent='닫기';close.setAttribute('aria-label','안내 닫기');close.addEventListener('click',()=>box.replaceChildren());box.append(span,close);
};
let previewTimer;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const split = value => [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 20);
const sourceText = value => value.replace(/\r\n?/g,'\n').trim();
function closeDialog(id){const dialog=$('#'+id);if(dialog?.open)dialog.close();}
function openDialog(id){for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!==id)dialog.close();const dialog=$('#'+id);if(!dialog.open)dialog.showModal();}
const splitScreen=matchMedia('(min-width:900px)');
let mobilePreview=false,scrollSync,sourceHighlight;
function setMode(mode){
  if(mode==='preview')mobilePreview=true;else if(mode==='edit')mobilePreview=false;
  mode=splitScreen.matches?'split':mobilePreview?'preview':'edit';
  $('.editor-panes').dataset.mode=mode;$('.writing-desk').dataset.mode=mode;$('.writer-layout').dataset.mode=mode;
  $('#toggle-mobile-preview').textContent=mode==='preview'?'원고로 돌아가기':'미리보기';$('#toggle-mobile-preview').setAttribute('aria-pressed',String(mode==='preview'));
  scrollSync?.refresh();
  sourceHighlight?.refresh();
}
splitScreen.addEventListener('change',()=>setMode());
scrollSync=EditorScroll.connect($('#markdown-editor'),$('.preview-pane'));
sourceHighlight=EditorSource.connect($('#markdown-editor'));
function ensureSlug(force=false){
  if(!$('#post-slug').value&&!draft.original&&!draft.images.length&&($('#post-title').value.trim()||force))$('#post-slug').value=$('#post-title').value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80).replace(/-$/,'')||'note-'+today().replace(/-/g,'')+'-'+draft.id.slice(0,6);
}
function updateContext(){
  const editing=!!draft.original;$('#writer-context').textContent=editing?'공개 글 수정':'새 글';
  $('#review-button').textContent=editing?'수정 반영':'게시';$('#review-title').textContent=editing?'수정 내용 반영':'게시하기';$('#publish-button').textContent=editing?'반영하기':'게시하기';
  $('#writer-return').href=editing?'posts/'+draft.post.slug+'.html':'index.html';$('#writer-return').textContent=editing?'← 글로 돌아가기':'← 블로그';
  $('#reload-published').hidden=!editing;$('#reload-published-note').hidden=!editing;document.title=(draft.post.title||'글쓰기')+' — Studybase';
}
function blank() {
  return { id: crypto.randomUUID(), post: { title:'', description:'', deck:'', shortTitle:'', slug:'', date:today(), category:'논문 리뷰', topics:[], tags:[], thumbnail:'assets/social-cover.png', thumbnailAlt:'', thumbnailCredit:'', thumbnailSource:'' }, markdown:'', images:[], original:null, savedAt:new Date().toISOString() };
}
function collect() {
  if (!draft) return;
  const p = draft.post;
  const oldTitle=p.title,oldDescription=p.description;
  for (const key of ['title','description','slug','date','category','thumbnail']) p[key] = $('#post-' + key).value.trim();
  if(p.title!==oldTitle||!p.shortTitle)p.shortTitle=p.title;
  if(p.description!==oldDescription||!p.deck)p.deck=p.description;
  p.revisionNote=$('#post-revision-note').value.trim();
  p.topics = split($('#post-topics').value); p.tags = split($('#post-tags').value);
  for (const [key, id] of [['thumbnailAlt','thumbnail-alt'],['thumbnailCredit','thumbnail-credit'],['thumbnailSource','thumbnail-source']]) p[key] = $('#post-' + id).value.trim();
  draft.markdown = $('#markdown-editor').value;
  draft.position={start:$('#markdown-editor').selectionStart,end:$('#markdown-editor').selectionEnd,scroll:$('#markdown-editor').scrollTop};
  draft.savedAt = new Date().toISOString();
}
function renderPreview() {
  if (!draft) return;
  const previewPane=$('.preview-pane'),scroll=previewPane.scrollTop;
  $('#preview-title').textContent = draft.post.title || '제목 미리보기';
  $('#preview-description').textContent = draft.post.description;
  $('#preview-body').innerHTML = EditorContent.preview(EditorContent.compile(draft.markdown, draft.original?.html), draft.images);
  $('#preview-body').querySelectorAll('table').forEach(table=>{
    if(table.parentElement.matches('.engram-table-wrap,.table-scroll'))return;
    const wrapper=document.createElement('div');wrapper.className='table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label',(table.querySelector('caption')?.textContent.trim()||'본문 표')+', 가로 스크롤 가능');table.before(wrapper);wrapper.append(table);
  });
  $('.preview-pane').classList.toggle('engram-article-page',draft.post.slug.startsWith('engram'));
  const math = StudyMath.render($('#preview-body'));
  window.StudyLabs?.mount($('#preview-body'));
  window.StudyCode?.mount($('#preview-body'));
  $('#math-status').textContent = math.errors ? `${math.errors}개 수식의 문법을 확인해 주세요. 입력한 식은 그대로 보관됩니다.` : '';
  previewPane.scrollTop=scroll;
  scrollSync.refresh();
  sourceHighlight.refresh();
  $('#word-count').textContent = draft.markdown.replace(/\s/g, '').length.toLocaleString() + '자';
}
function remember(record){
  const index=drafts.findIndex(d=>d.id===record.id);if(index<0)drafts.push(record);else drafts[index]=record;
}
async function refreshDrafts(){
  const list=await draftStore.list();drafts=[...new Map([...list,...unsaved.values()].map(item=>[item.id,item])).values()];
  for(const item of list)if(item.id!==draft?.id&&!unsaved.has(item.id))versions.set(item.id,draftVersion(item));
  renderDrafts();
}
async function save(checkpoint=''){
  if(!draft)return;
  collect();
  if(!draft.original&&!draft.post.title&&!draft.post.description&&!draft.post.slug&&!draft.markdown&&!draft.images.length)return;
  const snapshot=structuredClone(draft);pending++;$('#draft-status').textContent='임시 저장 중…';
  const task=saveQueue.catch(()=>{}).then(async()=>{
    const sourceId=snapshot.id;while(aliases.has(snapshot.id))snapshot.id=aliases.get(snapshot.id);
    try{
      const result=await draftStore.save(snapshot,versions.get(snapshot.id)||null,{checkpoint}),record=result.record;
      if(result.conflict){
        aliases.set(snapshot.id,record.id);
        if(result.previous)remember(result.previous);
        if(draft.id===snapshot.id||draft.id===sourceId){draft.id=record.id;draft.recoveredFrom=record.recoveredFrom;history.replaceState(null,'',location.pathname+'?draft='+encodeURIComponent(record.id));}
        message('다른 탭의 수정과 겹쳐 별도 임시 글로 보관했습니다. 양쪽 원고 모두 임시 글 목록에 남아 있습니다.');
      }
      versions.set(record.id,draftVersion(record));remember(record);
      if(draft.id===record.id)draft.revision=record.revision;
      unsaved.delete(record.id);unsaved.delete(snapshot.id);unsaved.delete(sourceId);storageFailed=unsaved.size>0;
      if(draft.id===record.id)$('#draft-status').textContent=pending===1?'저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'임시 저장 중…';
      renderDrafts();channel?.postMessage({type:'saved',id:record.id});
    }catch{
      unsaved.set(snapshot.id,snapshot);remember(snapshot);storageFailed=true;renderDrafts();$('#draft-status').textContent='저장 실패 · 원고를 내려받아 주세요.';
      message('브라우저에 임시 저장하지 못했습니다. 원고 내려받기로 현재 글과 그림을 보관해 주세요.');
    }finally{pending--;}
  });
  saveQueue=task;return task;
}
function fill(next) {
  clearTimeout(previewTimer);clearTimeout(pollTimer);deploymentEpoch++;draft = structuredClone(next); const p = draft.post;
  const stored=drafts.find(d=>d.id===draft.id);if(stored&&!unsaved.has(draft.id))versions.set(draft.id,draftVersion(next));
  $('#draft-status').textContent=unsaved.has(draft.id)?'저장 실패 · 원고를 내려받아 주세요.':stored?'저장된 원고':'자동 저장';
  draft.markdown = EditorContent.normalizeLegacy(draft.markdown, draft.original?.html);
  if (location.protocol !== 'file:') history.replaceState(null, '', location.pathname + '?draft=' + encodeURIComponent(draft.id));
  for (const key of ['title','description','slug','date','category','thumbnail']) $('#post-' + key).value = p[key] || '';
  $('#post-revision-note').value=p.revisionNote||'';
  $('#post-topics').value = p.topics.join(', '); $('#post-tags').value = p.tags.join(', ');
  for (const [key, id] of [['thumbnailAlt','thumbnail-alt'],['thumbnailCredit','thumbnail-credit'],['thumbnailSource','thumbnail-source']]) $('#post-' + id).value = p[key] || '';
  $('#post-slug').disabled = !!draft.original || !!draft.images.length;
  $('#markdown-editor').value=draft.markdown;setMode();updateContext();closeDialog('library-dialog');$('#previous-edit-note').hidden=true;$('#resume-previous-edit').hidden=false;$('#open-latest-edit').hidden=true;renderPreview();renderDrafts();renderDeployment();message('');
  const position=draft.position||{start:0,end:0,scroll:0};$('#markdown-editor').setSelectionRange(position.start||0,position.end||0);$('#markdown-editor').scrollTop=position.scroll||0;
  scrollSync.reset();
  if(draft.deployment?.status!=='published'&&draft.deployment)watchDeployment({...draft.deployment,draftId:draft.id,post:draft.original?.post,html:draft.original?.html,markdown:draft.original?.markdown},0,deploymentEpoch);
}
function lockEditor(){
  const controls=[...document.querySelectorAll('.writing-desk input,.writing-desk textarea,.writing-desk button,.writer-sidebar input,.writer-sidebar select,.writer-sidebar button,.writer-header button,#settings-dialog input,#settings-dialog textarea')];
  const previous=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  return ()=>controls.forEach((c,i)=>c.disabled=previous[i]);
}
async function activateDraft(next){
  if(busy)return;busy=true;const unlock=lockEditor();
  try{await save();const latest=drafts.find(d=>d.id===next.id)||next;aliases.delete(latest.id);fill(latest);}
  finally{busy=false;unlock();renderDrafts();$('#markdown-editor').focus();}
}
async function removeDraft(id){
  const entry=drafts.find(d=>d.id===id);if(!entry||busy||!confirm('이 브라우저의 임시 글을 삭제할까요? 공개된 글은 유지됩니다.'))return;
  try{
    await saveQueue;const removed=unsaved.has(id)&&!versions.has(id)?true:await draftStore.remove(id,versions.get(id)||null);
    if(!removed){await refreshDrafts();message('다른 탭에서 변경된 임시 글입니다. 최신 내용을 확인한 뒤 다시 삭제해 주세요.');return;}
    versions.delete(id);unsaved.delete(id);storageFailed=unsaved.size>0;drafts=drafts.filter(d=>d.id!==id);
    if(draft?.id===id)fill(blank());else renderDrafts();channel?.postMessage({type:'removed',id});
  }catch{message('임시 글을 삭제하지 못했습니다.');}
}
function renderDrafts(){
  const list=$('#draft-list'),entries=[...drafts].sort((a,b)=>b.savedAt.localeCompare(a.savedAt)),keep=new Set(entries.map(d=>d.id));
  for(const row of [...list.children])if(!row.dataset.draftId||!keep.has(row.dataset.draftId))row.remove();
  entries.forEach((entry,index)=>{
    let row=[...list.children].find(el=>el.dataset.draftId===entry.id);
    if(!row){
      row=document.createElement('div');row.dataset.draftId=entry.id;
      const open=document.createElement('button');open.type='button';
      open.addEventListener('click',()=>{const current=drafts.find(d=>d.id===row.dataset.draftId);if(!current||busy)return;if(draft?.id===current.id&&JSON.stringify(draftVersion(current))===JSON.stringify(draftVersion(draft))){closeDialog('library-dialog');$('#markdown-editor').focus();return;}activateDraft(current);});
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.addEventListener('click',()=>removeDraft(row.dataset.draftId));row.append(open,remove);
    }
    row.className='draft-item'+(entry.id===draft?.id?' active':'');
    const [open,remove]=row.children,label=(entry.post.title||'제목 없는 글')+(entry.recoveredFrom?' · 충돌 복사본':'')+(unsaved.has(entry.id)?' · 저장 대기':'');
    if(open.textContent!==label)open.textContent=label;open.title=label;open.disabled=busy;remove.disabled=busy;remove.setAttribute('aria-label',label+' 임시 글 삭제');
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
  });
  if(!entries.length){const empty=document.createElement('p');empty.className='help';empty.textContent='아직 저장한 글이 없어요.';list.append(empty);}
}
async function publicFile(path) {
  const url = new URL(path, location.href); url.searchParams.set('v', Date.now());
  const res = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)}); if (!res.ok) throw Error('공개 원고를 불러오지 못했습니다. 배포가 끝난 뒤 다시 시도해 주세요.'); return res.text();
}
function populatePosts(){
  const list=$('#published-list');list.replaceChildren();
  for(const post of posts){const button=document.createElement('button');button.type='button';button.className='published-edit-button';button.dataset.editPost=post.slug;button.disabled=busy;const title=document.createElement('span'),label=document.createElement('span');title.textContent=post.title;label.textContent='수정';button.append(title,label);button.addEventListener('click',()=>{closeDialog('library-dialog');loadPost(post.slug)});list.append(button);}
  if(!posts.length){const text=document.createElement('p');text.className='help';text.textContent='공개 글을 불러오는 중입니다.';list.append(text);}
}
async function loadPost(slug, force = false) {
  if (!slug || busy) return;
  const existing=(draft.original?.post.slug===slug?draft:drafts.filter(d=>d.original?.post.slug===slug).sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0]);
  busy=true;const unlock=lockEditor();$('#draft-status').textContent='원고 불러오는 중…';
  try {
    await save();
    let post, markdown, html;
    if (publisher) {
      const sha = await publisher.head(); posts = JSON.parse(await publisher.file('content/posts.json', sha)); populatePosts(); post = posts.find(p => p.slug === slug);
      if (!post) throw Error('공개 글을 찾을 수 없습니다.');
      markdown = await publisher.file(post.sourceMarkdown, sha);html=EditorContent.compile(markdown);
    } else {
      post = posts.find(p => p.slug === slug); if (!post) throw Error('공개 글을 찾을 수 없습니다.');
      [markdown, html] = await Promise.all([publicFile(post.sourceMarkdown), publicFile(post.sourceHtml)]);
    }
    const clean=existing&&sourceText(existing.markdown)===sourceText(EditorContent.normalizeLegacy(existing.original.markdown,existing.original.html))&&JSON.stringify(existing.post)===JSON.stringify(existing.original.post);
    const next = clean&&!force?{...structuredClone(existing),position:undefined,deployment:undefined}:blank(); next.post = structuredClone(post); next.markdown = markdown.trim(); next.original = { post:structuredClone(post), markdown, html };
    fill(next); await save(); message('');
    if(existing&&!clean){$('#previous-edit-text').textContent='이전에 작성하던 수정본도 임시 글에 보관되어 있습니다. 지금은 최신 공개본을 편집하고 있습니다.';$('#previous-edit-note').hidden=false;$('#resume-previous-edit').dataset.draftId=existing.id;}
  } catch (error) { message(error.message); } finally { busy=false;unlock();renderDrafts();populatePosts();$('#markdown-editor').focus();}
}
function validate() {
  collect(); const p = draft.post;
  if (!p.title) throw Error('글 제목을 적어주세요.');
  if(!draft.markdown.trim())throw Error('본문을 작성해 주세요.');
  ensureSlug(true);p.slug=$('#post-slug').value.trim();
  if(!p.description){const root=document.createElement('div');root.innerHTML=EditorContent.compile(draft.markdown,draft.original?.html);const first=[...root.querySelectorAll('p')].find(p=>p.textContent.trim()&&!p.closest('figcaption,.article-sources'));p.description=(first?.textContent||root.textContent).replace(/\s+/g,' ').trim().slice(0,160);p.deck=p.description;$('#post-description').value=p.description;}
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
$('#post-title').addEventListener('change',()=>{ensureSlug();save();updateContext();});
$('#markdown-editor').addEventListener('input', () => { collect();clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,100);save(); });
$('#new-post').addEventListener('click',async()=>{if(busy)return;closeDialog('library-dialog');await activateDraft(blank());$('#post-title').focus();});
$('#open-library').addEventListener('click',()=>{if(!busy)openDialog('library-dialog')});
$('#open-settings').addEventListener('click',()=>{if(!busy)openDialog('settings-dialog')});
$('#manage-connection').addEventListener('click',()=>{returnToReview=false;openDialog('connect-dialog')});
$('#pick-image').addEventListener('click',()=>$('#image-upload').click());
$('#pick-import').addEventListener('click',()=>$('#import-draft').click());
$('#reload-published').addEventListener('click',()=>{if(draft.original){closeDialog('settings-dialog');loadPost(draft.post.slug,true)}});
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.dataset.closeDialog)));
$('#open-latest-edit').addEventListener('click',()=>{if(draft.original&&!busy)loadPost(draft.original.post.slug,true);});
$('#resume-previous-edit').addEventListener('click',()=>{const previous=drafts.find(entry=>entry.id===$('#resume-previous-edit').dataset.draftId);if(previous&&!busy)activateDraft(previous);});

$('#toggle-mobile-preview').addEventListener('click',()=>{collect();renderPreview();setMode(mobilePreview?'edit':'preview');});
document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  const editor=$('#markdown-editor'), start=editor.selectionStart, end=editor.selectionEnd, selected=editor.value.slice(start,end);
  const snippets={heading:'\n\n## '+(selected||'소제목')+'\n\n',link:'['+(selected||'링크 설명')+'](https://example.com)',code:'\n\n```python\n'+(selected||'print("hello")')+'\n```\n\n',inlineMath:'$'+(selected||'x_t')+'$',blockMath:'\n\n$$\n'+(selected||'h_t = \\bar{A}h_{t-1} + \\bar{B}x_t')+'\n$$\n\n',table:'\n\n| 항목 | 값 |\n| --- | --- |\n| 예시 | 1 |\n\n'};
  if($('.editor-panes').dataset.mode==='preview')setMode('edit',{remember:true});document.querySelector('.more-tools').open=false;
  editor.setRangeText(snippets[button.dataset.insert],start,end,'end');editor.focus();collect();renderPreview();save();
}));
$('#open-markdown-help').addEventListener('click',()=>{document.querySelector('.more-tools').open=false;openDialog('help-dialog')});
async function attachImages(files){
  if(!files.length||busy)return;ensureSlug(true);collect();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.post.slug)) { message('그림을 넣기 전에 ‘글 정보’에서 글 주소를 정해 주세요.'); openDialog('settings-dialog');$('#post-slug').focus(); return; }
  if (files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)) { message('PNG, JPG, WebP 그림을 5MB 이하로 첨부해 주세요.'); return; }
  if (draft.images.reduce((n,i) => n + i.base64.length, 0)+files.reduce((n,f)=>n+Math.ceil(f.size/3)*4,0) > 32 * 1024 * 1024) { message('이 원고의 그림 용량이 큽니다. 먼저 게시한 뒤 이어서 첨부해 주세요.'); return; }
  busy=true;const unlock=lockEditor();message('그림을 읽는 중입니다…');
  try {
    await save();
    const staged=[];
    for(const file of files){
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpg || file.type === 'image/webp' && webp)) throw Error('이미지 파일 형식을 확인해 주세요.');
    const bitmap = await createImageBitmap(file),width=bitmap.width,height=bitmap.height; bitmap.close();
    let binary = ''; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = 'assets/uploads/' + draft.post.slug + '/' + Date.now() + '-' + crypto.randomUUID().slice(0,8) + '.' + ext;
    staged.push({path,type:file.type,base64:btoa(binary),width,height});
    }
    draft.images.push(...staged);
    const editor = $('#markdown-editor'), insert = staged.map(image=>'\n\n<img src="../'+image.path+'" width="'+image.width+'" height="'+image.height+'" alt="그림 설명을 적어주세요">\n\n그림 설명: 설명과 출처를 적어주세요.\n').join('');
    editor.setRangeText(insert, editor.selectionStart, editor.selectionEnd, 'end');
    $('#post-slug').disabled = true; collect(); renderPreview(); await save(); message('그림을 첨부했습니다. 설명과 출처를 적어주세요.');
  } catch (error) { message(error.message || '그림을 불러오지 못했습니다.'); }
  finally{busy=false;unlock();$('#post-slug').disabled=!!draft.original||!!draft.images.length;renderDrafts();}
}
$('#image-upload').addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';attachImages(files);});
const markdownEditor=$('#markdown-editor');
markdownEditor.addEventListener('paste',event=>{
  const files=[...(event.clipboardData?.files||[])].filter(file=>file.type.startsWith('image/'));
  if(files.length){event.preventDefault();attachImages(files);}
});
markdownEditor.addEventListener('dragover',event=>{if([...(event.dataTransfer?.types||[])].includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';markdownEditor.classList.add('is-drop-target');}});
markdownEditor.addEventListener('dragleave',()=>markdownEditor.classList.remove('is-drop-target'));
markdownEditor.addEventListener('drop',event=>{
  markdownEditor.classList.remove('is-drop-target');const files=[...(event.dataTransfer?.files||[])];
  if(files.length){event.preventDefault();attachImages(files);}
});
let historyEntries=[],historySelection;
function selectHistory(entry){
  historySelection=entry;$('#history-source').value=entry.draft.markdown;$('#history-selected-title').textContent=entry.draft.post.title||'제목 없는 글';
  const before=entry.draft.markdown.split('\n').length,now=draft.markdown.split('\n').length;
  $('#history-comparison').textContent=`선택한 원고 ${before}줄 · 현재 원고 ${now}줄`;
  $('#restore-version').disabled=false;
  for(const button of $('#history-list').children)button.setAttribute('aria-pressed',String(button.dataset.key===entry.key));
}
$('#checkpoint-draft').addEventListener('click',async()=>{if(busy)return;document.querySelector('.more-tools').open=false;await save('직접 보관');if(!storageFailed)message('현재 원고를 버전으로 보관했습니다.');});
$('#open-history').addEventListener('click',async()=>{
  if(busy)return;document.querySelector('.more-tools').open=false;
  try{
    await save();historyEntries=await draftStore.history(draft.id);historySelection=undefined;$('#history-list').replaceChildren();$('#history-source').value='';$('#history-selected-title').textContent='이전 원고';$('#history-comparison').textContent='';$('#restore-version').disabled=true;
    for(const entry of historyEntries){const button=document.createElement('button');button.type='button';button.dataset.key=entry.key;button.textContent=new Date(entry.recordedAt).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · '+entry.label;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>selectHistory(entry));$('#history-list').append(button);}
    $('#history-empty').hidden=historyEntries.length>0;openDialog('history-dialog');if(historyEntries.length)selectHistory(historyEntries[0]);
  }catch(error){message(error.message);}
});
$('#restore-version').addEventListener('click',async()=>{
  if(busy||!historySelection)return;busy=true;const unlock=lockEditor();$('#restore-version').disabled=true;
  try{
    await save('복원 직전');if(storageFailed)throw Error('현재 원고를 저장하지 못해 복원을 멈췄습니다. 원고를 내려받아 보관해 주세요.');
    const selected=historySelection,latest=structuredClone(draft);
    if(selected.imagePaths.some(path=>!latest.images.some(image=>image.path===path)))throw Error('이 버전의 첨부 그림을 찾지 못했습니다. 현재 원고를 유지합니다.');
    const next={...structuredClone(selected.draft),id:latest.id,revision:latest.revision,savedAt:latest.savedAt,images:latest.images,original:latest.original,deployment:latest.deployment,post:{...selected.draft.post,slug:latest.post.slug}};
    fill(next);await save('복원한 원고');closeDialog('history-dialog');message('선택한 원고를 복원했습니다. 복원 직전 내용도 버전에 남아 있습니다.');
  }catch(error){message(error.message);}
  finally{busy=false;unlock();$('#restore-version').disabled=false;renderDrafts();}
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
    d.id=crypto.randomUUID();delete d.revision;delete d.recoveredFrom;delete d.deployment;await activateDraft(d);await save();closeDialog('library-dialog');message('원고를 불러왔습니다.');
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
    closeDialog('connect-dialog');if(returnToReview){returnToReview=false;$('#review-button').click();}else message('블로그에 연결했습니다.');
  } catch (error) { candidate.disconnect(); message(error.message); } finally { button.disabled = false; }
});
function disconnect() { publisher?.disconnect(); publisher = undefined; $('#github-token').value = ''; $('#connection-state').textContent = '연결 전'; $('#connect-form').hidden = false; $('#disconnect').hidden = true; }
$('#disconnect').addEventListener('click', disconnect); addEventListener('pagehide', disconnect);
$('#review-button').addEventListener('click', async () => {
  if (busy) return;
  try {
    validate(); await save();
    $('#review-post-title').textContent = draft.post.title; $('#review-url').textContent = LIVE + 'posts/' + draft.post.slug + '.html';
    $('#publish-status').textContent = publisher ? '게시할 준비가 되었습니다.' : (unsaved.has(draft.id)?'GitHub 연결이 필요합니다. 임시 저장에도 실패했으니 원고 내려받기로 먼저 보관해 주세요.':'GitHub 연결을 먼저 완료해 주세요. 작성한 원고는 임시 저장되어 있습니다.');
    $('#review-connect').hidden = !!publisher;
    $('#publish-button').disabled = !publisher; $('#published-link').hidden = true; $('#deployment-link').hidden = true;
    $('#publish-button').hidden = false; openDialog('review-dialog');
  }catch(error){message(error.message);if(!$('#post-title').value.trim()){setMode('edit');$('#post-title').focus();}else if(!$('#markdown-editor').value.trim()) {setMode('edit');$('#markdown-editor').focus();}else if($('#math-status').textContent){setMode('preview');}else openDialog('settings-dialog');}
});
$('#close-review').addEventListener('click', () => { if (!busy) $('#review-dialog').close(); });
$('#review-connect').addEventListener('click',()=>{returnToReview=true;openDialog('connect-dialog');$('#github-token').focus()});
$('#review-dialog').addEventListener('cancel', e => { if (busy) e.preventDefault(); });
function renderDeployment(text){
  const deployment=draft?.deployment,note=$('#deployment-note');note.hidden=!deployment;if(!deployment)return;
  const label=text||(deployment.status==='published'?'최근 게시 내용이 공개 블로그에 반영되었습니다.':'원고는 GitHub에 저장됐습니다. 블로그 배포를 확인하는 중입니다…');
  $('#deployment-note-text').textContent=label;$('#deployment-open').href=deployment.url;$('#deployment-open').hidden=deployment.status!=='published';$('#check-deployment').hidden=deployment.status==='published';
  if($('#publish-button').hidden){$('#publish-status').textContent=label;$('#published-link').href=deployment.url;$('#published-link').hidden=deployment.status!=='published';}
}
async function publicSnapshotMatches(result){
  if(!result.post||!result.html||typeof result.markdown!=='string')return false;
  const load=async path=>{const r=await fetch(new URL(path+'?v='+Date.now(),LIVE),{cache:'no-store'});if(!r.ok)throw Error();return r.text();};
  const posts=JSON.parse(await load('content/posts.json')),post=posts.find(p=>p.slug===result.post.slug);
  if(JSON.stringify(post)!==JSON.stringify(result.post))return false;
  const [md,html]=await Promise.all([load(post.sourceMarkdown),load(post.sourceHtml)]);
  return md.trim()===result.markdown.trim()&&html.trim()===result.html.trim();
}
async function watchDeployment(result,attempt=0,epoch=deploymentEpoch){
  clearTimeout(pollTimer);
  const current=()=>epoch===deploymentEpoch&&result.draftId===draft?.id;
  if(!current())return;
  try{
    const response=await fetch(new URL('build.json?v='+Date.now(),LIVE),{cache:'no-store'});
    const exact=response.ok&&(await response.json()).commit===result.sha;
    const visible=exact||(attempt%3===0&&await publicSnapshotMatches(result));
    if(!current())return;
    if(visible){draft.deployment.status='published';renderDeployment();await save();return;}
  }catch{}
  if(!current())return;
  if(attempt>=30){renderDeployment('원고는 GitHub에 저장됐습니다. 아직 공개 반영을 확인하지 못했습니다. 배포 상태를 확인하거나 다시 확인을 눌러주세요.');return;}
  pollTimer=setTimeout(()=>watchDeployment(result,attempt+1,epoch),10000);
}
$('#check-deployment').addEventListener('click',()=>{if(!draft.deployment)return;clearTimeout(pollTimer);deploymentEpoch++;renderDeployment();watchDeployment({...draft.deployment,draftId:draft.id,post:draft.original?.post,html:draft.original?.html,markdown:draft.original?.markdown},0,deploymentEpoch);});
$('#publish-button').addEventListener('click', async () => {
  if (busy || !publisher) return;
  let html; try { html = validate(); } catch (error) { $('#publish-status').textContent = error.message; return; }
  busy=true;clearTimeout(pollTimer);deploymentEpoch++;let accepted=false;$('#publish-button').disabled=true;$('#close-review').disabled=true;
  // Freeze the submitted snapshot; edits remain disabled until the ref update completes.
  const controls = [...document.querySelectorAll('.writing-desk input,.writing-desk textarea,.writing-desk button,.writer-sidebar button,.writer-sidebar select,.writer-sidebar input')];
  const previous = controls.map(c => c.disabled); controls.forEach(c => c.disabled = true);
  try {
    await save('게시 직전'); const submitted = structuredClone(draft);
    submitted.markdown=EditorContent.toMarkdown(html);
    html=EditorContent.compile(submitted.markdown);
    const result = await publisher.publish(submitted, html, text => $('#publish-status').textContent = text);
    accepted=true;
    draft.post = result.post;draft.markdown=result.markdown;$('#markdown-editor').value=result.markdown; draft.original = {post:structuredClone(result.post),markdown:result.markdown,html:result.html};draft.deployment={sha:result.sha,url:result.url,status:'building'};updateContext();renderPreview();
    await save(); $('#publish-status').textContent = '원고를 GitHub에 저장했습니다. 블로그를 배포하는 중입니다…';
    $('#publish-button').hidden = true; $('#deployment-link').href = 'https://github.com/riex71/computer-study-blog/actions'; $('#deployment-link').hidden = false;
    posts = posts.filter(p => p.slug !== result.post.slug); posts.unshift(result.post); populatePosts();renderDeployment();deploymentEpoch++;watchDeployment({...result,draftId:draft.id},0,deploymentEpoch);
  } catch (error) { $('#publish-status').textContent = error.message + '\n'+(storageFailed?'원고와 그림은 현재 화면에 남아 있습니다. 원고 내려받기로 보관해 주세요.':'원고와 그림은 이 브라우저에 남아 있습니다.'); }
  finally {busy=false;controls.forEach((c,i)=>c.disabled=previous[i]);$('#post-slug').disabled=!!draft.original||!!draft.images.length;$('#publish-button').disabled=false;$('#close-review').disabled=false;renderDrafts();populatePosts();if(!accepted&&draft.deployment?.status==='building')watchDeployment({...draft.deployment,draftId:draft.id,post:draft.original?.post,html:draft.original?.html,markdown:draft.original?.markdown},0,deploymentEpoch);}
});
addEventListener('beforeunload', event => { if (busy || pending || unsaved.size) { event.preventDefault(); event.returnValue = ''; } });
try {drafts=await draftStore.list();for(const item of drafts)versions.set(item.id,draftVersion(item));} catch { storageFailed = true; message('브라우저 저장소를 사용할 수 없습니다. 원고 내려받기로 보관해 주세요.'); }
const selectedDraft=requestedNew||requestedEdit?null:requestedDraft?drafts.find(d=>d.id===requestedDraft):drafts.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0];
fill(selectedDraft||blank());
if(requestedDraft&&!selectedDraft&&!storageFailed)message('이 브라우저에 해당 임시 글이 없습니다. 다른 기기에서 작성했다면 내려받은 원고 파일을 불러와 주세요.');
if(storageFailed){$('#draft-status').textContent='임시 저장 불가 · 원고를 내려받아 주세요.';message('브라우저 저장소를 사용할 수 없습니다. 원고 내려받기로 보관해 주세요.');}
channel?.addEventListener('message',async event=>{try{await saveQueue;await refreshDrafts();if(event.data.id===draft?.id)message('다른 탭에서 이 임시 글이 변경되었습니다. 계속 작성하면 복사본으로 보관합니다.');}catch{}});
function readyEditor(){
  if(editorReady)return;editorReady=true;$('#writer-boot-lock').disabled=false;$('#writer-boot-lock').removeAttribute('aria-busy');$('#review-button').disabled=false;$('#open-library').disabled=false;$('#open-settings').disabled=false;
  setMode();
  if(requestedEdit||requestedDraft)$('#markdown-editor').focus();else if(requestedNew)$('#post-title').focus();
}
if(!requestedEdit)readyEditor();else $('#draft-status').textContent='공개 원고를 불러오는 중…';
try {
  posts = JSON.parse(await publicFile('content/posts.json')); populatePosts();
  if(requestedEdit)await loadPost(requestedEdit);
  else if(requestedDraft&&draft.original){
    const currentId=draft.id,latest=posts.find(post=>post.slug===draft.original.post.slug);
    if(latest){const markdown=await publicFile(latest.sourceMarkdown);if(draft.id===currentId&&(sourceText(markdown)!==sourceText(draft.original.markdown)||JSON.stringify(latest)!==JSON.stringify(draft.original.post))){
      $('#previous-edit-text').textContent='이 원고를 만든 뒤 공개 글이 바뀌었습니다. 현재 수정본은 그대로 보관됩니다.';$('#previous-edit-note').hidden=false;$('#resume-previous-edit').hidden=true;$('#open-latest-edit').hidden=false;
    }}
  }
}catch(error){message(error.message);}finally{readyEditor();}

addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&editorReady&&!busy){event.preventDefault();save();}});
