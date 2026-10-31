/* Owner-only publication controls. Draft deletion remains a separate local action. */
export function createPostManager({publisher,edit,isBusy,begin,end,changed}) {
  const library=document.querySelector('#library-dialog'),list=document.querySelector('#published-list');
  const section=document.createElement('section'),heading=document.createElement('h3'),trash=document.createElement('div'),status=document.createElement('p');
  heading.textContent='휴지통';status.className='help';status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(heading,trash);list.after(status);list.closest('section').after(section);
  const dialog=document.createElement('dialog');dialog.className='writer-dialog';dialog.id='delete-post-dialog';dialog.setAttribute('aria-labelledby','delete-post-title');
  dialog.innerHTML='<header class="dialog-top"><h2 id="delete-post-title">공개 글 삭제</h2><button type="button" data-cancel>취소</button></header><p data-title></p><p class="help" data-url></p><p class="help">홈·검색·RSS에서 제외하고 기존 주소에는 삭제 안내를 표시합니다. 휴지통에서 복원할 수 있습니다. 브라우저 초안과 GitHub 기록은 남습니다.</p><label class="help" for="delete-post-confirm">삭제할 글의 제목을 그대로 입력해 주세요.</label><input id="delete-post-confirm" autocomplete="off"><p class="help" data-error role="status"></p><div class="review-actions"><button type="button" data-confirm disabled>휴지통으로 이동</button></div>';
  document.body.append(dialog);
  const input=dialog.querySelector('input'),confirm=dialog.querySelector('[data-confirm]'),error=dialog.querySelector('[data-error]');
  let rows=[],deleted=[],pending=null,working=false,refreshEpoch=0;
  const button=(label,fn)=>{const el=document.createElement('button');el.type='button';el.textContent=label;el.disabled=working||isBusy();el.addEventListener('click',fn);return el;};
  dialog.querySelector('[data-cancel]').onclick=()=>{if(!working)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});
  input.addEventListener('input',()=>{confirm.disabled=working||!pending||input.value!==pending.post.title;});
  function render(posts=rows) {
    rows=posts;list.replaceChildren();trash.replaceChildren();
    for(const post of rows) {
      const row=document.createElement('div');row.className='managed-post-row';row.dataset.managedPost=post.slug;
      const open=button('',()=>edit(post.slug));open.className='published-edit-button';open.dataset.editPost=post.slug;
      const title=document.createElement('span'),label=document.createElement('span');title.textContent=post.title;label.textContent='수정';open.append(title,label);
      const remove=button('삭제',()=>prepare(post.slug));remove.className='post-remove';remove.setAttribute('aria-label',post.title+' 삭제');row.append(open,remove);list.append(row);
    }
    if(!rows.length){const p=document.createElement('p');p.className='help';p.textContent='공개된 글이 없습니다.';list.append(p);}
    for(const entry of deleted) {
      const row=document.createElement('div');row.className='managed-post-row';const title=document.createElement('span');title.textContent=entry.post.title;
      const restore=button('복원',()=>restorePost(entry));restore.setAttribute('aria-label',entry.post.title+' 복원');row.append(title,restore);trash.append(row);
    }
    if(!deleted.length){const p=document.createElement('p');p.className='help';p.textContent='삭제한 글이 없습니다.';trash.append(p);}
  }
  async function refresh(){if(working||isBusy())return;const epoch=++refreshEpoch;status.textContent='최신 글 목록 확인 중…';try{const state=await publisher().request('posts');if(epoch!==refreshEpoch||working)return;deleted=state.deleted;changed(state);render(state.posts);status.textContent='';}catch(e){if(epoch===refreshEpoch)status.textContent=e.message;}}
  async function prepare(slug){
    if(working||isBusy())return;
    status.textContent='삭제할 글의 최신 내용 확인 중…';
    try{const snapshot=await publisher().request('post-snapshot?slug='+encodeURIComponent(slug));pending={...snapshot,operationId:crypto.randomUUID()};dialog.querySelector('[data-title]').textContent=snapshot.post.title;dialog.querySelector('[data-url]').textContent=new URL('posts/'+slug+'.html','https://riex71.github.io/computer-study-blog/').href;input.value='';confirm.disabled=true;error.textContent='';status.textContent='';dialog.showModal();input.focus();}catch(e){status.textContent=e.message;}
  }
  async function mutate(path,body){
    if(working||isBusy())return;
    working=true;refreshEpoch++;confirm.disabled=true;input.disabled=true;dialog.querySelector('[data-cancel]').disabled=true;render();
    let finish;
    try{finish=await begin();const result=await publisher().request(path,body);deleted=result.deleted;changed(result,path==='delete-post'?body.slug:null);render(result.posts);dialog.close();if(!library.open)library.showModal();status.textContent=(path==='delete-post'?'휴지통으로 이동했습니다.':'복원했습니다.')+' 공개 블로그 반영까지 몇 분 걸릴 수 있습니다.';error.textContent='';}
    catch(e){error.textContent=e.message;status.textContent=e.message;}
    finally{working=false;input.disabled=false;dialog.querySelector('[data-cancel]').disabled=false;finish?.();end();render();confirm.disabled=!pending||input.value!==pending.post.title;}
  }
  confirm.addEventListener('click',()=>{if(!pending||input.value!==pending.post.title)return;mutate('delete-post',{slug:pending.post.slug,title:input.value,fingerprint:pending.fingerprint,operationId:pending.operationId});});
  async function restorePost(entry){if(working||isBusy()||!window.confirm('“'+entry.post.title+'” 글을 다시 공개할까요?'))return;await mutate('restore-post',{slug:entry.post.slug,id:entry.id,title:entry.post.title});}
  document.querySelector('#open-library').addEventListener('click',refresh);
  render();return {render,refresh};
}
