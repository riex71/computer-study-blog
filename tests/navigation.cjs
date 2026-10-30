const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),checks=[],errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 const ok=(name,value)=>{assert(value,name);checks.push(name);console.log('PASS',name)};
 const ready=()=>page.waitForFunction(()=>document.querySelector('#writer-boot-lock')?.disabled===false);
 const output=process.env.BLOG_TEST_OUTPUT;
 const shot=async name=>{if(output)await page.screenshot({path:path.join(output,name)})};
 try{
  await page.goto(base+'posts/engram-conditional-memory.html');
  const sidebar=page.locator('.article-toc'),links=sidebar.locator('[data-toc-link]');
  ok('Desktop contents lists every article section',await sidebar.isVisible()&&await links.count()===await page.locator('.public-article h2[id],.public-article h3[id]').count());
  ok('Contents sits beside the article',await sidebar.evaluate(e=>e.getBoundingClientRect().left>document.querySelector('.article-layout').getBoundingClientRect().right));
  await shot('navigation-article-desktop.png');
  const target=await links.nth(2).getAttribute('href');await links.nth(2).click();
  await page.waitForFunction(hash=>location.hash===hash&&document.querySelector('.article-toc a[aria-current="location"]')?.getAttribute('href')===hash,target);
  ok('Clicking contents scrolls below the header and marks the section',await page.locator(target).evaluate(e=>{const top=e.getBoundingClientRect().top;return top>=75&&top<=150}));
  ok('Contents remains visible while reading',await sidebar.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=72&&r.top<150&&r.bottom<=innerHeight}));
  await links.first().focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.article-toc a:first-child').getAttribute('href')===location.hash);
  ok('Contents supports keyboard navigation',await links.first().getAttribute('href')===new URL(page.url()).hash);
  await page.setViewportSize({width:390,height:844});await page.goto(base+'posts/engram-conditional-memory.html');
  ok('Mobile uses a compact contents menu',!await sidebar.isVisible()&&await page.locator('.mobile-toc summary').isVisible());
  await page.locator('.mobile-toc summary').click();await page.locator('.mobile-toc [data-toc-link]').nth(1).click();
  ok('Mobile contents closes after choosing a section',!await page.locator('.mobile-toc').evaluate(e=>e.open)&&new URL(page.url()).hash.length>1);
  ok('Mobile article fits the screen',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'write.html?new=1');await ready();
  ok('Desktop starts with simultaneous writing and preview',await page.locator('.editor-panes').getAttribute('data-mode')==='split'&&await page.locator('#markdown-editor').isVisible()&&await page.locator('.preview-pane').isVisible());
  ok('The two panes have usable side-by-side widths',await page.evaluate(()=>{const a=document.querySelector('.markdown-pane').getBoundingClientRect(),b=document.querySelector('.preview-pane').getBoundingClientRect();return a.right<=b.left&&a.width>=350&&b.width>=350}));
  await page.locator('#post-title').fill('나란히 보는 원고');
  const source='## 상태 갱신\n\n문장 안 수식 $h_t$와 본문입니다.\n\n$$\nh_t = A h_{t-1} + B x_t\n$$\n\n| 항목 | 값 |\n| --- | --- |\n| 예시 | 3 |\n\n'+Array.from({length:40},(_,i)=>'문단 '+i+'의 내용을 확인합니다.').join('\n\n');
  await page.locator('#markdown-editor').fill(source);await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===2);
  ok('Math and tables update in the adjacent pane',await page.locator('#preview-body table').count()===1&&await page.locator('#preview-body h2').textContent()==='상태 갱신');
  await page.locator('.preview-pane').evaluate(e=>e.scrollTop=320);await page.locator('#markdown-editor').fill(source+'\n\n추가한 문장');
  await page.waitForFunction(()=>document.querySelector('#preview-body').textContent.includes('추가한 문장'));
  ok('Live rendering keeps the linked reading position',await page.locator('.preview-pane').evaluate(e=>e.scrollTop>0));
  await page.locator('.preview-pane').evaluate(e=>e.scrollTop=0);await shot('navigation-split-desktop.png');
  await page.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('저장됨'));await page.reload();await ready();
  ok('The live editor and source survive reload',await page.locator('.editor-panes').getAttribute('data-mode')==='split'&&(await page.locator('#markdown-editor').inputValue()).endsWith('추가한 문장'));

  for(const width of [900,1024,1440]){await page.setViewportSize({width,height:1000});ok('Both panes fit '+width,await page.locator('.editor-panes').getAttribute('data-mode')==='split'&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.editor-panes').dataset.mode==='edit');
  ok('Narrow screens preserve the draft in a single pane',await page.locator('#toggle-mobile-preview').isVisible()&&(await page.locator('#markdown-editor').inputValue()).endsWith('추가한 문장'));
  await page.locator('#toggle-mobile-preview').click();ok('Mobile can still open the full preview',await page.locator('.preview-pane').isVisible()&&await page.locator('#preview-body .katex').count()===2);await shot('navigation-preview-mobile.png');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#markdown-editor').focus();await page.keyboard.press('Control+End');await page.locator('[data-insert="blockMath"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===3);ok('Inserting a formula keeps both panes open',await page.locator('.editor-panes').getAttribute('data-mode')==='split');
  ok('No browser exceptions',errors.length===0);
  if(output)fs.writeFileSync(path.join(output,'navigation-verification.json'),JSON.stringify({base,checks,errors},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error.stack);process.exit(1)});
