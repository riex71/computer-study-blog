const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8766/',out=process.env.BLOG_TEST_OUTPUT,source=fs.readFileSync(path.join(__dirname,'fixtures/markdown-stress.md'),'utf8').replace(/\r\n?/g,'\n');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),checks=[],errors=[];
 const ok=(name,value)=>{assert(value,name);checks.push(name);console.log('PASS',name)},monitor=p=>p.on('pageerror',e=>errors.push(e.message));
 const shot=async(p,name)=>{if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,name)})}};
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();monitor(p);await p.goto(base+'posts/markdown-stress.html');await p.locator('.hash-demo[data-ready]').waitFor();
  const visibleHeadings=await p.locator('.public-article h2,.public-article h3,.public-article h4,.public-article h5,.public-article h6').evaluateAll(nodes=>nodes.filter(h=>h.textContent.trim()).length);
  ok('Every non-empty heading through H6 is included in the generated TOC',await p.locator('.article-toc [data-toc-link]').count()===visibleHeadings);
  ok('Deep headings have matching five-level numbered navigation',await p.locator('.article-toc a[href="#deep-six"] .toc-number').textContent()==='2.1.1.1.1.');
  ok('Skipped H3 levels do not produce phantom TOC rows',await p.locator('.article-toc a[href="#skip-four"] .toc-number').textContent()==='3.1.');
  const ids=await p.locator('.public-article [id]').evaluateAll(nodes=>nodes.map(n=>n.id));ok('Repeated titles and explicit anchors never duplicate IDs',ids.length===new Set(ids).size);
  ok('Empty headings do not produce empty TOC labels',await p.locator('.article-toc .toc-title').evaluateAll(nodes=>nodes.every(n=>n.textContent.trim())));
  await p.locator('.article-toc a[href="#deep-six"]').click();await p.waitForFunction(()=>document.querySelector('.article-toc [aria-current="location"]')?.getAttribute('href')==='#deep-six');
  ok('An H6 TOC link reaches the correct heading below the site header',await p.locator('#deep-six').evaluate(e=>e.getBoundingClientRect().top>=75&&e.getBoundingClientRect().top<160));
  ok('Deep TOC numbers and labels never overlap',await p.locator('.article-toc a').evaluateAll(links=>links.filter(a=>a.querySelector('.toc-number')).every(a=>a.querySelector('.toc-number').getBoundingClientRect().right<=a.querySelector('.toc-title').getBoundingClientRect().left)));
  ok('Deep headings keep the article centered and the TOC in the right margin',await p.locator('.public-article').evaluate(e=>{const r=e.getBoundingClientRect(),toc=document.querySelector('.article-toc').getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<1&&toc.left-r.right>=71;}));await shot(p,'deep-toc-desktop.png');
  ok('Task completion states are visible and read-only',await p.locator('.public-article input[type=checkbox]').evaluateAll(nodes=>JSON.stringify(nodes.map(n=>[n.checked,n.disabled]))===JSON.stringify([[true,true],[false,true],[true,true]])));
  ok('Table alignment matches the Markdown separators',await p.locator('.public-article table').first().locator('thead th').evaluateAll(nodes=>JSON.stringify(nodes.map(n=>getComputedStyle(n).textAlign))===JSON.stringify(['left','center','right'])));
  ok('Merged table cells retain row and column spans',await p.locator('[colspan="2"]').count()===1&&await p.locator('[rowspan="2"]').count()===1);
  ok('Strikethrough does not consume numeric ranges',await p.locator('.public-article del').textContent()==='취소한 문장'&&await p.locator('.public-article').textContent().then(s=>s.includes('75~80%')&&s.includes('20~25%')));
  ok('Inline and block math render, including math inside a heading and table',await p.locator('.public-article .katex').count()===6&&await p.locator('.math-error').count()===0);
  ok('Code fences keep dollars and embedded fences literal',await p.locator('pre code').allTextContents().then(codes=>codes.some(code=>code.includes('formula = "$x_1$"'))&&codes.some(code=>code.includes('```python'))));
  ok('Known and unknown code languages remain readable',await p.locator('.code-language').allTextContents().then(labels=>labels.includes('Python')&&labels.includes('JavaScript')&&labels.includes('unknown-language')));
  ok('A section after references keeps ordinary body styling',await p.locator('#appendix').evaluate(e=>!e.closest('.article-sources'))&&await p.locator('#appendix+p').evaluate(e=>getComputedStyle(e).fontSize==='16px'));
  await p.locator('details:not(.reader-popover) summary').click();ok('Disclosure sections, subscripts and superscripts remain functional',await p.locator('.public-article details').evaluate(e=>e.open)&&await p.locator('.public-article sub').count()===1&&await p.locator('.public-article sup').count()===1);
  await p.locator('a[href="#%ED%95%9C%EA%B8%80-%EC%A3%BC%EC%86%8C"]').first().click();ok('Percent-encoded Korean links reach their original anchor',await p.locator('#한글-주소').evaluate(e=>e.getBoundingClientRect().top>=75&&e.getBoundingClientRect().top<180));
  for(const width of [360,390,768,900,1440,1920]){
   await p.setViewportSize({width,height:900});await p.goto(base+'posts/markdown-stress.html');ok('Mixed content stays inside the viewport at '+width,await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await p.setViewportSize({width:390,height:844});await p.goto(base+'posts/markdown-stress.html');await p.locator('.mobile-toc summary').click();await p.locator('.mobile-toc a[href="#deep-six"]').click();ok('Mobile TOC reaches H6 and closes after navigation',!await p.locator('.mobile-toc').evaluate(e=>e.open)&&await p.locator('#deep-six').evaluate(e=>e.getBoundingClientRect().top>=75&&e.getBoundingClientRect().top<180));await shot(p,'deep-toc-mobile.png');
  await p.setViewportSize({width:1440,height:1000});await p.goto(base+'write.html?new=1');await p.waitForFunction(()=>document.querySelector('#writer-boot-lock')?.disabled===false);await p.locator('#post-title').fill('Markdown matrix publication');await p.locator('#markdown-editor').fill(source);await p.waitForFunction(()=>document.querySelectorAll('#preview-body h6').length===1&&document.querySelectorAll('#preview-body .katex').length===6);
  ok('Editor source remains unchanged while rendering the whole stress fixture',(await p.locator('#markdown-editor').inputValue())===source);
  ok('Preview renders all H2–H6 headings and the interactive component',await p.locator('#preview-body h4').count()===2&&await p.locator('#preview-body h5').count()===1&&await p.locator('#preview-body .hash-demo[data-ready]').count()===1);
  await p.locator('.preview-pane').evaluate(e=>e.scrollTop=0);const beforeURL=p.url();await p.locator('#preview-body a[href="#deep-four"]').first().click();await p.waitForFunction(()=>{const pane=document.querySelector('.preview-pane'),h=pane.querySelector('[data-preview-anchor="deep-four"]');return Math.abs(h.getBoundingClientRect().top-pane.getBoundingClientRect().top-12)<5;});
  ok('Preview internal links scroll locally without opening another tab',p.url()===beforeURL&&context.pages().length===1);
  for(const id of ['deep-five','deep-six']){
   const expected=await p.locator('#markdown-editor').evaluate((editor,id)=>{const match=editor.value.indexOf('{#'+id+'}'),index=editor.value.lastIndexOf('\n',match)+1,mirror=document.createElement('div'),css=getComputedStyle(editor);mirror.style.cssText='position:fixed;left:0;top:0;visibility:hidden;white-space:pre-wrap;box-sizing:border-box';for(const name of ['font','lineHeight','letterSpacing','padding','tabSize','wordBreak','overflowWrap'])mirror.style[name]=css[name];mirror.style.width=editor.clientWidth+'px';mirror.textContent=editor.value;document.body.append(mirror);const range=document.createRange();range.setStart(mirror.firstChild,index);range.setEnd(mirror.firstChild,index+1);const y=Math.min(editor.scrollHeight-editor.clientHeight,range.getBoundingClientRect().top-mirror.getBoundingClientRect().top);mirror.remove();return y;},id);
   await p.locator('.preview-pane').evaluate((pane,id)=>{const target=pane.querySelector('[data-preview-anchor="'+id+'"]');pane.scrollTop+=target.getBoundingClientRect().top-pane.getBoundingClientRect().top;},id);
   await p.waitForFunction(expected=>Math.abs(document.querySelector('#markdown-editor').scrollTop-expected)<8,expected);ok('Deep heading scroll synchronization reaches the matching source line for '+id,true);
  }
  const html=await p.evaluate(source=>EditorContent.compile(source),source);const canonical=await p.evaluate(html=>EditorContent.toMarkdown(html),html);
  await p.locator('#markdown-editor').fill(canonical);await p.waitForFunction(()=>document.querySelectorAll('#preview-body h6').length===1);ok('Publish-format Markdown retains task states and table alignment',await p.locator('#preview-body input[type=checkbox]').evaluateAll(nodes=>nodes.filter(n=>n.checked).length===2)&&await p.locator('#preview-body .align-right').count()===4);
  await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('저장됨'));await p.reload();await p.waitForFunction(()=>document.querySelectorAll('#preview-body h6').length===1);ok('Saved drafts retain all deep headings, tasks and the disclosure',await p.locator('#preview-body input[type=checkbox]').count()===3&&await p.locator('#preview-body details').count()===1);
  await p.setViewportSize({width:390,height:900});await p.locator('#toggle-mobile-preview').click();await p.locator('#preview-body a[href="#deep-four"]').first().click();ok('Mobile preview anchor links scroll within the current page',await p.locator('#preview-body [data-preview-anchor="deep-four"]').evaluate(e=>Math.abs(e.getBoundingClientRect().top-120)<10));await shot(p,'markdown-editor-mobile.png');await context.close();
  const publish=await browser.newContext({viewport:{width:1440,height:1000}}),q=await publish.newPage();monitor(q);let head='base',next=0;const blobs=new Map(),files={};
  await publish.route('https://api.github.com/**',async route=>{
   const req=route.request(),endpoint=new URL(req.url()).pathname.replace('/repos/riex71/computer-study-blog/',''),data=req.postData()?req.postDataJSON():null;let result;
   if(new URL(req.url()).pathname==='/repos/riex71/computer-study-blog')result={permissions:{push:true}};
   else if(endpoint==='git/ref/heads/main')result={object:{sha:head}};
   else if(endpoint==='git/commits/base')result={tree:{sha:'tree'}};
   else if(endpoint==='contents/content/posts.json')result={encoding:'base64',content:Buffer.from('[]').toString('base64')};
   else if(endpoint==='git/blobs'){const sha='blob'+(++next);blobs.set(sha,data.content);result={sha};}
   else if(endpoint==='git/trees'){for(const file of data.tree)files[file.path]=Buffer.from(blobs.get(file.sha),'base64').toString('utf8');result={sha:'new-tree'};}
   else if(endpoint==='git/commits')result={sha:'matrix-published'};
   else if(endpoint==='git/refs/heads/main'){assert.equal(data.force,false);head=data.sha;result={object:{sha:head}};}
   else return route.fulfill({status:404,body:'{}'});
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
  });
  await publish.route('https://riex71.github.io/computer-study-blog/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({commit:'matrix-published'})}));
  await q.goto(base+'write.html?new=1');await q.waitForFunction(()=>document.querySelector('#writer-boot-lock')?.disabled===false);await q.locator('#post-title').fill('Markdown matrix publication');await q.locator('#markdown-editor').fill(source);await q.locator('#review-button').click();await q.locator('#review-connect').click();await q.locator('#github-token').fill('mock-token');await q.locator('#connect-form button').click();await q.locator('#review-dialog').waitFor({state:'visible'});await q.locator('#publish-button').click();await q.waitForFunction(()=>document.querySelector('#publish-button').hidden);
  const savedMD=Object.entries(files).find(([name])=>name.endsWith('.md'))?.[1],savedHTML=Object.entries(files).find(([name])=>name.endsWith('.html'))?.[1];
  ok('The complete publish flow saves deep anchors, checked tasks, alignment and the widget directive',savedMD.includes('{#deep-six}')&&savedMD.includes('[x]')&&savedMD.includes(':---:')&&savedMD.includes(':::engram-hash-demo'));
  ok('Published HTML retains H6, checkbox states, merged cells and strikethrough',savedHTML.includes('<h6')&&savedHTML.includes('checked')&&savedHTML.includes('colspan="2"')&&savedHTML.includes('<del>'));
  ok('Publishing uses the same canonical compiler as preview',await q.evaluate(({md,html})=>EditorContent.compile(md).trim()===html.trim(),{md:savedMD,html:savedHTML}));
  if(out){fs.writeFileSync(path.join(out,'mock-published.md'),savedMD);fs.writeFileSync(path.join(out,'mock-published.html'),savedHTML);}
  await q.locator('#close-review').click();await q.locator('#open-library').click();await q.locator('#new-post').click();await q.locator('#post-title').fill('빈 문서 방지');await q.locator('#markdown-editor').fill('####');await q.locator('#review-button').click();await q.waitForFunction(()=>document.querySelector('#writer-message').textContent.includes('표시할 내용'));
  ok('A document containing only an empty heading cannot accidentally publish a blank article',!await q.locator('#review-dialog').evaluate(e=>e.open)&&await q.locator('#markdown-editor').evaluate(e=>e===document.activeElement)&&!await q.locator('#settings-dialog').evaluate(e=>e.open));
  await publish.close();ok('No browser errors during mixed Markdown editing or publishing',errors.length===0);if(out)fs.writeFileSync(path.join(out,'markdown-browser-verification.json'),JSON.stringify({base,checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
