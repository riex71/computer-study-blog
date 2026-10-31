const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8765/',out=process.env.BLOG_TEST_OUTPUT;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),checks=[],errors=[];
 const ok=(name,value)=>{assert(value,name);checks.push(name);console.log('PASS',name)},monitor=p=>p.on('pageerror',e=>errors.push(e.message));
 const ready=p=>p.waitForFunction(()=>document.querySelector('#writer-boot-lock')?.disabled===false),saved=p=>p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('저장됨'));
 const more=async(p,id)=>{await p.locator('.more-tools summary').click();await p.locator('#'+id).click();};
 const screenshot=async(p,name)=>{if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,name)})}};
 try{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage();monitor(p);
  await p.goto(base);await p.evaluate(async()=>{
   const request=indexedDB.open('studybase.writer.v1',1);await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});request.onsuccess=resolve;request.onerror=reject;});
   const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'legacy-kept',post:{title:'이전 브라우저의 초안',description:'',slug:'legacy-kept',date:'2026-10-30',category:'공부 기록',topics:[],tags:[],thumbnail:'assets/social-cover.png'},markdown:'이전 버전에서 작성한 원고',images:[],original:null,savedAt:new Date().toISOString(),revision:3});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject});db.close();
  });
  await p.goto(base+'write.html?draft=legacy-kept');await ready(p);
  ok('Database upgrade preserves v1 draft text',await p.locator('#markdown-editor').inputValue()==='이전 버전에서 작성한 원고');
  await p.locator('#markdown-editor').fill('처음 보관한 원고 $h_t$');await saved(p);await more(p,'checkpoint-draft');await p.waitForFunction(()=>document.querySelector('#writer-message').textContent.includes('버전으로 보관'));
  await p.locator('#markdown-editor').fill('복원 전의 새 원고');await saved(p);await more(p,'open-history');await p.locator('#history-dialog').waitFor({state:'visible'});
  ok('A saved version can be inspected before restoration',await p.locator('#history-source').inputValue()==='처음 보관한 원고 $h_t$');
  await screenshot(p,'upgrade-history.png');await p.locator('#restore-version').click();await p.waitForFunction(()=>document.querySelector('#writer-message').textContent.includes('복원했습니다'));await saved(p);ok('Restoration keeps the same draft address',new URL(p.url()).searchParams.get('draft')==='legacy-kept');
  await more(p,'open-history');await p.locator('#history-list button').filter({hasText:'복원 직전'}).click();ok('Restoring a version also preserves the replaced current text',await p.locator('#history-source').inputValue()==='복원 전의 새 원고');await p.locator('#history-dialog [data-close-dialog]').click();
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await p.locator('#markdown-editor').evaluate((editor,base64)=>{const file=new File([Uint8Array.from(atob(base64),x=>x.charCodeAt(0))],'clipboard.png',{type:'image/png'}),data=new DataTransfer();data.items.add(file);editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},png);
  await p.waitForFunction(()=>document.querySelectorAll('#preview-body img').length===1);await saved(p);ok('Image paste stages a decodable preview with reserved dimensions',await p.locator('#preview-body img').evaluate(async img=>{await img.decode();return img.width>0&&img.getAttribute('width')==='1'&&img.getAttribute('height')==='1'}));
  await p.locator('#markdown-editor').evaluate((editor,base64)=>{const file=new File([Uint8Array.from(atob(base64),x=>x.charCodeAt(0))],'drop.png',{type:'image/png'}),data=new DataTransfer();data.items.add(file);editor.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));},png);
  await p.waitForFunction(()=>document.querySelectorAll('#preview-body img').length===2);await saved(p);ok('Image drop uses the same attachment flow',await p.locator('#preview-body img[src^="data:"]').count()===2);
  await p.locator('#markdown-editor').evaluate(editor=>{const data=new DataTransfer();data.items.add(new File(['not a png'],'fake.png',{type:'image/png'}));editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await p.waitForFunction(()=>document.querySelector('#writer-message').textContent.includes('이미지 파일 형식'));ok('Invalid pasted bytes leave existing attachments intact',await p.locator('#preview-body img').count()===2);
  await p.reload();await ready(p);ok('Restored Markdown and image attachments survive reload',await p.locator('#markdown-editor').inputValue().then(s=>s.includes('처음 보관한 원고')&&s.includes('width="1"'))&&await p.locator('#preview-body img[src^="data:"]').count()===2);
  const records=await p.evaluate(async()=>{const {DraftStore}=await import('./draft-store.mjs');const store=new DraftStore(),list=await store.history('legacy-kept');return {count:list.length,noDuplicateImageBytes:list.every(entry=>!entry.draft.images)}});ok('Snapshots do not duplicate staged image bytes',records.count>=3&&records.noDuplicateImageBytes);
  await p.goto(base+'write.html?edit=mamba-selective-ssm');await ready(p);await p.waitForFunction(()=>document.querySelector('#post-title').value.includes('Mamba'));if(await p.evaluate(()=>innerWidth<900&&document.querySelector('.editor-panes').dataset.mode!=='preview'))await p.locator('#toggle-mobile-preview').click();await p.evaluate(()=>document.fonts.ready);
  const parity=await p.evaluate(async()=>{
    const posts=await fetch('content/posts.json').then(r=>r.json()),results=[];
    for(const post of posts){const [md,html]=await Promise.all([fetch(post.sourceMarkdown).then(r=>r.text()),fetch(post.sourceHtml).then(r=>r.text())]);results.push(EditorContent.compile(md).trim()===html.trim());}
    return results;
  });ok('Browser and build produce byte-identical canonical article HTML',parity.every(Boolean));
  const preview=await p.locator('#preview-body').evaluate(e=>({width:e.getBoundingClientRect().width,font:getComputedStyle(e.querySelector('p')).fontSize,family:getComputedStyle(e.querySelector('p')).fontFamily,math:e.querySelectorAll('.katex').length}));
  await screenshot(p,'upgrade-public-size-preview.png');const read=await c.newPage();monitor(read);await read.goto(base+'posts/mamba-selective-ssm.html');await read.evaluate(()=>document.fonts.ready);
  const publicMetrics=await read.locator('.public-article').evaluate(e=>({width:e.getBoundingClientRect().width,font:getComputedStyle(e.querySelector('p')).fontSize,family:getComputedStyle(e.querySelector('p')).fontFamily,math:e.querySelectorAll('.katex').length}));
  ok('Live preview matches publication text size and font family',preview.font===publicMetrics.font&&preview.family===publicMetrics.family);
  ok('Published Mamba formulas render with the same compiler as preview',preview.math===publicMetrics.math&&publicMetrics.math>20);
  ok('Mamba images reserve width and height',await read.locator('.public-article img').evaluateAll(images=>images.every(img=>img.hasAttribute('width')&&img.hasAttribute('height'))));
  await read.locator('#section-03').scrollIntoViewIfNeeded();await screenshot(read,'upgrade-mamba-math.png');
  for(const width of [390,1440]){
   await p.setViewportSize({width,height:1000});await read.setViewportSize({width,height:1000});if(await p.evaluate(()=>innerWidth<900&&document.querySelector('.editor-panes').dataset.mode!=='preview'))await p.locator('#toggle-mobile-preview').click();
   const pf=await p.locator('#preview-body p').first().evaluate(e=>getComputedStyle(e).fontSize),rf=await read.locator('.public-article p').first().evaluate(e=>getComputedStyle(e).fontSize);ok('Preview and publication body sizes agree at '+width,pf===rf);
  }
  await read.setViewportSize({width:1440,height:1000});await read.goto(base+'posts/engram-conditional-memory.html');await read.locator('.hash-demo[data-ready]').waitFor();
  const status=await read.locator('.lab-status').textContent();await read.locator('.lab-controls select').first().selectOption('32');ok('Hash demo updates address comparisons without changing pages',await read.locator('.lab-status').textContent()!==status);await read.locator('.lab-input input').fill('invalid <script>');ok('Hash input validation preserves the article',await read.locator('.lab-status').textContent().then(s=>s.includes('구분'))&&await read.locator('.public-article h2').count()===6);await read.locator('.lab-input input').fill('7 11 5 | 3 8 2 | 7 1 5 | 2 6 9');await read.locator('.hash-demo').scrollIntoViewIfNeeded();await screenshot(read,'upgrade-engram-explainer.png');
  ok('Article update date and note are visible',await read.locator('.article-revision').textContent().then(s=>s.includes('2026.10.30')&&s.includes('해시')));
  const engCover=await read.locator('meta[property="og:image"]').getAttribute('content');await read.goto(base+'posts/mamba-selective-ssm.html');ok('Each article has a distinct share image',engCover!==await read.locator('meta[property="og:image"]').getAttribute('content'));
  await read.emulateMedia({media:'print'});ok('Print view hides navigation and editing tools',await read.locator('.site-header').evaluate(e=>getComputedStyle(e).display==='none')&&await read.locator('.article-tools').evaluate(e=>getComputedStyle(e).display==='none'));await read.emulateMedia({media:'screen'});
  await c.close();
  const storage=await browser.newContext(),s=await storage.newPage();monitor(s);await s.goto(base);
  const stored=await s.evaluate(async()=>{
   const {DraftStore,draftVersion}=await import('./draft-store.mjs'),store=new DraftStore();let expected=null,record={id:'retention',post:{title:'retention'},markdown:'start',images:[],savedAt:new Date().toISOString()};
   for(let i=0;i<25;i++){record.markdown='version '+i;record.savedAt=new Date().toISOString();const result=await store.save(record,expected,{checkpoint:'직접 보관'});record=result.record;expected=draftVersion(record);}
   const history=await store.history(record.id),conflict=await store.save({...record,markdown:'stale tab'},null),original=(await store.list()).find(item=>item.id==='retention');
   const removed=await store.remove(record.id,expected),remaining=await store.history(record.id);
   return {count:history.length,latest:history[0].draft.markdown,earliest:history.at(-1).draft.markdown,conflict:conflict.conflict,old:original.markdown,copied:conflict.record.id!==record.id,removed,left:remaining.length};
  });
  ok('History is bounded to the newest 20 snapshots',stored.count===20&&stored.latest==='version 24'&&stored.earliest==='version 5');ok('Version history preserves atomic cross-tab conflict copies',stored.conflict&&stored.copied&&stored.old==='version 24');ok('Deleting a draft also deletes its version history',stored.removed&&stored.left===0);await storage.close();
  ok('No browser exceptions',errors.length===0);if(out)fs.writeFileSync(path.join(out,'upgrade-verification.json'),JSON.stringify({base,checks,errors,preview,publicMetrics},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
