const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8765/';
(async()=>{const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),checks=[],errors=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));const ok=(name,value)=>{assert(value,name);checks.push(name);console.log('PASS',name)},shot=async name=>{if(process.env.BLOG_TEST_OUTPUT)await p.screenshot({path:path.join(process.env.BLOG_TEST_OUTPUT,name)})},current=hash=>p.waitForFunction(h=>document.querySelector('.article-toc [aria-current="location"]')?.getAttribute('href')===h,hash);try{
 await p.goto(base+'posts/engram-conditional-memory.html');await p.waitForFunction(()=>document.querySelector('.article-toc .toc-track').hasAttribute('data-toc-ready'));
 const count=await p.locator('.public-article h2[id],.public-article h3[id]').count(),links=p.locator('.article-toc [data-toc-link]');
 ok('Contents is an ordered list of all source sections',await p.locator('.article-toc ol>li').count()===count&&await links.count()===count);
 ok('Chapter numbers are aligned independently of their titles',await links.first().locator('.toc-number').textContent()==='1.'&&await links.last().locator('.toc-number').textContent()===String(await p.locator('.article-toc .toc-track>.toc-list>li').count())+'.');
 await shot('toc-refined-desktop.png');
 const third=await links.nth(2).getAttribute('href');await links.nth(2).click();await current(third);
 ok('Current position counter follows section navigation',(await p.locator('.article-toc [data-toc-position]').textContent()).startsWith('03 /'));
 ok('The moving rail is aligned with the active row',await p.locator('.article-toc .toc-track').evaluate(e=>{const marker=e.querySelector('.toc-active-marker').getBoundingClientRect(),active=e.querySelector('[aria-current]').getBoundingClientRect();return Math.abs(marker.top-active.top-6)<2&&Math.abs(marker.height-(active.height-12))<2}));
 ok('Reading progress advances with the document',await p.locator('[data-toc-progress]').evaluate(e=>getComputedStyle(e).transform!=='matrix(0, 0, 0, 1, 0, 0)'));
 await shot('toc-refined-current.png');
 await p.evaluate(()=>document.documentElement.dataset.theme='dark');await shot('toc-refined-dark.png');await p.evaluate(()=>delete document.documentElement.dataset.theme);
 await p.setViewportSize({width:1440,height:650});await links.last().click();const last=await links.last().getAttribute('href');await current(last);
 ok('Long contents scrolls inside its panel on shorter screens',await p.locator('.article-toc-nav').evaluate(e=>e.scrollTop>0&&e.getBoundingClientRect().bottom<innerHeight));
 await links.first().click();await current(await links.first().getAttribute('href'));await p.mouse.move(0,0);await p.evaluate(()=>document.activeElement.blur());await p.locator(last).evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await current(last);
 await p.waitForFunction(()=>{const nav=document.querySelector('.article-toc-nav').getBoundingClientRect(),row=document.querySelector('.article-toc [aria-current]').getBoundingClientRect();return row.top>=nav.top&&row.bottom<=nav.bottom});
 ok('Reading further automatically keeps the active item visible',await p.locator('.article-toc-nav').evaluate(e=>e.scrollTop>0));
 ok('The last item retains the correct counter',(await p.locator('.article-toc [data-toc-position]').textContent())===String(count).padStart(2,'0')+' / '+String(count).padStart(2,'0'));
 await p.locator('.toc-top').click();await current(await links.first().getAttribute('href'));ok('Back to top returns to the article opening',await p.locator('.article-header').evaluate(e=>e.getBoundingClientRect().top>=70&&e.getBoundingClientRect().top<150));
 for(const width of [360,390,768,1280,1399]){
  await p.setViewportSize({width,height:650});await p.goto(base+'posts/engram-conditional-memory.html');await p.locator('.mobile-toc summary').click();
  ok('Compact contents fits '+width,await p.locator('.mobile-toc .toc-nav').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth}));

 }
 await p.setViewportSize({width:390,height:844});await p.goto(base+'posts/mamba-selective-ssm.html');await p.locator('.mobile-toc summary').click();await shot('toc-refined-mobile.png');
 ok('Existing chapter numbers are not repeated in the contents',await p.locator('.mobile-toc .toc-title').nth(1).textContent().then(t=>!/^1[.)]/.test(t)));
 ok('Second article also receives the generated numbered contents',await p.locator('.mobile-toc ol>li').count()===await p.locator('.public-article h2[id],.public-article h3[id]').count());
 ok('Reduced motion disables marker animation',await p.locator('.mobile-toc .toc-active-marker').evaluate(e=>getComputedStyle(e).transitionDuration==='0s'));
 ok('No browser exceptions',errors.length===0);if(process.env.BLOG_TEST_OUTPUT)fs.writeFileSync(path.join(process.env.BLOG_TEST_OUTPUT,'toc-verification.json'),JSON.stringify({base,checks,errors},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e.stack);process.exit(1)});
