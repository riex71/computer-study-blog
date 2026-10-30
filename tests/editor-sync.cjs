const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8765/',out=process.env.BLOG_TEST_OUTPUT;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),checks=[],errors=[];
 const ok=(name,value)=>{assert(value,name);checks.push(name);console.log('PASS',name)},ready=p=>p.waitForFunction(()=>document.querySelector('#writer-boot-lock')?.disabled===false),saved=p=>p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('저장됨'));
 const shot=async(p,name)=>{if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,name)})}};
 try{
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);ok('Homepage has no visible personal name',!await p.locator('body').innerText().then(s=>s.includes('윤동현')));
  await p.evaluate(()=>localStorage.setItem('studybase.writer.view','edit'));
  const original=await p.evaluate(async()=>{const posts=await fetch('content/posts.json').then(r=>r.json()),post=posts.find(p=>p.slug==='engram-conditional-memory'),[markdown,html]=await Promise.all([fetch(post.sourceMarkdown).then(r=>r.text()),fetch(post.sourceHtml).then(r=>r.text())]);return {post,markdown,html};});
  await p.goto(base+'write.html?new=1');await ready(p);
  await p.evaluate(async original=>{
   const {DraftStore}=await import('./draft-store.mjs');
   const old={...original,markdown:'## 예전 공개 글\n\n이전 글에는 해시 도구가 없었습니다.',html:'<h2>예전 공개 글</h2>'};
   await new DraftStore().save({id:'retained-local-edit',post:old.post,markdown:old.markdown+'\n\n게시하지 않은 수정 내용\n\n| 복사된 도구 | 값 |\n| --- | --- |\n| head 1 | 3 |',original:old,images:[],savedAt:new Date().toISOString()},null);
  },original);
  await p.goto(base+'write.html?edit=engram-conditional-memory');await ready(p);await p.waitForFunction(()=>document.querySelector('#post-title').value.includes('Engram'));
  ok('Desktop always opens one live editor with two visible panes',await p.locator('.editor-panes').getAttribute('data-mode')==='split'&&await p.locator('#markdown-editor').isVisible()&&await p.locator('.preview-pane').isVisible());
  ok('The three view tabs are removed',await p.locator('button[data-mode]').count()===0&&!await p.locator('#toggle-mobile-preview').isVisible()&&await p.locator('.editor-view-label').textContent().then(s=>s.includes('실시간 편집')&&!s.includes('나란히')));
  ok('Edit link opens the latest published Markdown instead of a stale local draft',await p.locator('#markdown-editor').inputValue().then(s=>s.trim()===original.markdown.replace(/\r\n?/g,'\n').trim()&&s.includes(':::engram-hash-demo')&&!s.includes('복사된 도구')));
  ok('The previous unpublished draft is preserved and can be resumed',await p.locator('#previous-edit-note').isVisible()&&await p.evaluate(async()=>{const {DraftStore}=await import('./draft-store.mjs');return (await new DraftStore().list()).some(d=>d.id==='retained-local-edit'&&d.markdown.includes('게시하지 않은 수정 내용'));}));
  ok('The editor renders the same live hash tool as the published article',await p.locator('#preview-body .engram-hash-demo[data-ready]').count()===1&&await p.locator('#preview-body .lab-controls select').count()===2&&await p.locator('#preview-body .lab-table tbody tr').count()===6);
  const textarea=p.locator('#markdown-editor'),preview=p.locator('.preview-pane');
  await textarea.evaluate(e=>e.scrollTop=(e.scrollHeight-e.clientHeight)*.45);await p.waitForFunction(()=>document.querySelector('.preview-pane').scrollTop>200);
  ok('Scrolling the Markdown pane moves the preview',await preview.evaluate(e=>e.scrollTop>200));
  await textarea.evaluate(e=>e.scrollTop=e.scrollHeight-e.clientHeight);await p.waitForFunction(()=>{const e=document.querySelector('.preview-pane');return Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight))<2;});ok('Dragging to the source end reaches the preview end',true);
  await preview.evaluate(e=>e.scrollTop=0);await p.waitForFunction(()=>document.querySelector('#markdown-editor').scrollTop<2);ok('Preview scrolling synchronizes back to Markdown',true);
  const bar=await textarea.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,gutter:e.offsetWidth-e.clientWidth,thumb:Math.max(18,e.clientHeight*e.clientHeight/e.scrollHeight)};});
  if(bar.gutter>=4){const x=bar.right-bar.gutter/2;await p.mouse.move(x,bar.top+bar.gutter+bar.thumb/2);await p.mouse.down();await p.mouse.move(x,bar.bottom-bar.gutter-8,{steps:18});await p.mouse.up();}
  else{await textarea.hover();await p.mouse.wheel(0,1600);}
  await p.waitForFunction(()=>document.querySelector('#markdown-editor').scrollTop>100&&document.querySelector('.preview-pane').scrollTop>100);ok('Native scrollbar dragging also synchronizes the other pane',true);
  const headingIndex=(await textarea.inputValue()).indexOf('## expert');
  const sourceY=await textarea.evaluate((e,index)=>{const mirror=document.createElement('div'),css=getComputedStyle(e);mirror.style.cssText='position:fixed;left:0;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;';for(const property of ['font','lineHeight','letterSpacing','padding','tabSize','wordBreak','overflowWrap'])mirror.style[property]=css[property];mirror.style.width=e.clientWidth+'px';mirror.textContent=e.value;document.body.append(mirror);const range=document.createRange();range.setStart(mirror.firstChild,index);range.setEnd(mirror.firstChild,index+1);const y=range.getBoundingClientRect().top-mirror.getBoundingClientRect().top;mirror.remove();return y;},headingIndex);
  assert(headingIndex>0);await textarea.evaluate((e,y)=>e.scrollTop=y,sourceY);
  await p.waitForFunction(()=>{const pane=document.querySelector('.preview-pane'),h=pane.querySelector('h2:nth-of-type(2)');return h&&Math.abs(h.getBoundingClientRect().top-pane.getBoundingClientRect().top)<8;});ok('Long figures do not break heading alignment between panes',true);await shot(p,'editor-linked-scroll.png');
  await p.setViewportSize({width:900,height:900});await textarea.evaluate(e=>e.scrollTop=e.scrollHeight-e.clientHeight);await p.waitForFunction(()=>{const e=document.querySelector('.preview-pane');return Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight))<2;});ok('Linked scrolling survives source wrapping after a resize',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.setViewportSize({width:1440,height:1000});await textarea.fill((await textarea.inputValue())+'\n\n추가한 문장');await p.waitForFunction(()=>document.querySelector('#preview-body').textContent.includes('추가한 문장'));
  ok('Typing keeps the interactive block mounted once',await p.locator('#preview-body .engram-hash-demo[data-ready]').count()===1&&await p.locator('#preview-body .lab-controls select').count()===2);
  await saved(p);await p.goto(base+'write.html?draft=retained-local-edit');await ready(p);await p.waitForFunction(()=>!document.querySelector('#open-latest-edit').hidden);
  ok('An explicit old draft remains intact and explains that the public version changed',await textarea.inputValue().then(s=>s.includes('게시하지 않은 수정 내용'))&&await p.locator('#previous-edit-text').textContent().then(s=>s.includes('공개 글이 바뀌')));
  await p.locator('#open-latest-edit').click();await p.waitForFunction(()=>document.querySelector('#markdown-editor').value.includes(':::engram-hash-demo'));ok('Latest-public action restores the real component without deleting the local draft',await p.locator('#preview-body .lab-controls select').count()===2);
  await p.goto(base+'write.html?new=1');await ready(p);await p.locator('#post-title').fill('언어별 코드');
  const source='## 언어별 코드\n\n```python\ndef greet(name):\n    return "hello " + name\n```\n\n```js\nconst n = 42;\n```\n\n```unknown\n<script>window.injected=true</script>\n```\n\n수식 $h_t$';
  await textarea.fill(source);await p.waitForFunction(()=>document.querySelectorAll('#preview-body .code-language').length===3);
  const labels=await p.locator('#preview-body .code-language').allTextContents();ok('Language labels and syntax colors apply in the live preview',JSON.stringify(labels)===JSON.stringify(['Python','JavaScript','unknown'])&&await p.locator('#preview-body .token.keyword').count()>0);
  ok('Source Markdown also has syntax colors',await p.locator('.source-highlight .token').count()>0&&await p.locator('.source-highlight').evaluate(e=>getComputedStyle(e).pointerEvents==='none'));
  ok('Highlighting leaves Markdown and math intact',await textarea.inputValue()===source&&await p.locator('#preview-body .katex').count()===1&&!await p.evaluate(()=>window.injected));
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedCode=text}}));await p.locator('#preview-body .copy-code').first().click();ok('Copying code excludes language labels and button text',await p.evaluate(()=>window.copiedCode)==='def greet(name):\n    return "hello " + name\n');await shot(p,'editor-code-colors.png');
  for(const width of [390,768]){await p.setViewportSize({width,height:900});await p.locator('#toggle-mobile-preview').click();ok('Small screens use one preview toggle at '+width,await preview.isVisible()&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#toggle-mobile-preview').click();ok('Returning to Markdown retains source at '+width,await textarea.isVisible()&&await textarea.inputValue()===source);}
  await p.setViewportSize({width:1440,height:1000});await p.goto(base+'posts/mamba-selective-ssm.html');await p.locator('.code-wrap .token.keyword').first().waitFor();ok('Published code uses the same language label and highlighting',await p.locator('.code-language').textContent()==='Python');await p.locator('.code-wrap').scrollIntoViewIfNeeded();await shot(p,'published-python-colors.png');
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');ok('Code colors adapt to the dark theme',await p.locator('.token.keyword').first().evaluate(e=>getComputedStyle(e).color==='rgb(232, 165, 220)'));await shot(p,'published-python-dark.png');
  ok('No browser exceptions',errors.length===0);if(out)fs.writeFileSync(path.join(out,'editor-sync-verification.json'),JSON.stringify({base,checks,errors},null,2));await c.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
