const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.argv[2]||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],passed=[];
 page.on('pageerror',e=>errors.push(e.message));const ok=(name,value)=>{assert(value,name);passed.push(name);console.log('PASS',name)};
 try{
  await page.goto(base+'write.html?edit=engram-conditional-memory');await page.waitForFunction(()=>document.querySelector('#post-title').value.includes('Engram')&&!document.querySelector('#new-post').disabled);
  const existing=await page.evaluate(async()=>{
   const original=await fetch('content/articles/engram-conditional-memory.html').then(r=>r.text()),md=document.querySelector('#markdown-editor').value;
   const a=document.createElement('div'),b=document.createElement('div');a.innerHTML=original;b.innerHTML=EditorContent.compile(md,original);
   const plain=n=>n.textContent.replace(/\s/g,''),images=n=>[...n.querySelectorAll('img')].map(i=>[i.getAttribute('src'),i.getAttribute('alt')]),ids=n=>[...n.querySelectorAll('h2')].map(h=>h.id),links=n=>[...n.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).sort();
   return {plain:plain(a)===plain(b),images:JSON.stringify(images(a))===JSON.stringify(images(b)),ids:JSON.stringify(ids(a))===JSON.stringify(ids(b)),links:JSON.stringify(links(a))===JSON.stringify(links(b)),raw:/<(?:h2|figure|section|table)\b/i.test(md),tables:b.querySelectorAll('table').length,originalTables:a.querySelectorAll('table').length,rowHeaders:b.querySelectorAll('th[scope="row"]').length,originalRowHeaders:a.querySelectorAll('th[scope="row"]').length,figures:b.querySelectorAll('figure').length};
  });
  console.log('Existing conversion:',existing);ok('Existing article is editable Markdown',!existing.raw);ok('Original text and numeric ranges survive conversion',existing.plain);ok('Original figure sources and descriptions survive conversion',existing.images&&existing.figures===6);ok('Existing heading anchors and source links survive conversion',existing.ids&&existing.links);ok('Existing benchmark table survives conversion',existing.tables===existing.originalTables&&existing.rowHeaders===existing.originalRowHeaders);
  ok('Long document has a bounded editor',await page.locator('.editor-panes').evaluate(e=>e.offsetHeight<900));
  await page.locator('#open-library').click();await page.locator('#new-post').click();await page.locator('#post-title').fill('Markdown과 수식');
  const md=String.raw`## 수식을 적어보기

상태는 $h_t$이며, $x_{t-1}^2 + \alpha$를 문장 안에서 읽습니다.

$$
\begin{aligned}
h_t &= \bar{A}h_{t-1} + \bar{B}x_t \\
y_t &= C h_t
\end{aligned}
$$

\(a_i + b_i\)

\[
\frac{1}{n}\sum_{i=1}^{n} x_i
\]

| 항목 | 값 |
| --- | --- |
| 범위 | 75~80% |

~~~python
cost = "$5 and $10"
formula = "$x_1$"
~~~

백틱 안은 ${String.fromCharCode(96)}$x_2$${String.fromCharCode(96)} 그대로입니다. 가격은 $5 and $10입니다.
`;
  await page.locator('#markdown-editor').fill(md);await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===5);
  ok('Inline, block and bracket math render in preview',await page.locator('#preview-body .katex').count()===5);ok('Code and prices remain literal',await page.locator('#preview-body pre').textContent().then(s=>s.includes('$x_1$')&&s.includes('$5 and $10'))&&await page.locator('#preview-body code').last().textContent()==='$x_2$');
  const canonical=await page.evaluate(()=>EditorContent.compile(document.querySelector('#markdown-editor').value));ok('Published source retains TeX, not generated MathML',canonical.includes('class="math-display"')&&canonical.includes('\\bar{A}')&&!canonical.includes('<math')&&!canonical.includes('class="katex"'));
  const deployed=await context.newPage();await deployed.goto(base+'posts/mamba-selective-ssm.html');const publicResult=await deployed.evaluate(html=>{const root=document.querySelector('.public-article');root.innerHTML=html;return StudyMath.render(root)},canonical);ok('Same canonical source renders on the public article',publicResult.count===5&&publicResult.errors===0);
  await page.locator('#markdown-editor').fill(String.raw`## 오류 확인

$\frac{a}{$

<script>window.injected=true</script>

$\htmlClass{bad}{x}$`);await page.waitForFunction(()=>document.querySelector('#math-status').textContent.includes('수식'));ok('Invalid TeX reports an error without breaking writing',await page.locator('#post-title').isEditable()&&!await page.evaluate(()=>window.injected));ok('Untrusted math commands cannot inject HTML',await page.locator('#preview-body .bad').count()===0);await page.locator('#review-button').click();await page.waitForFunction(()=>document.querySelector('#writer-message').textContent.includes('수식 문법'));ok('Invalid formula is caught before publishing',!await page.locator('#review-dialog').evaluate(e=>e.open));
  await page.locator('button[data-mode="edit"]').click();await page.locator('#markdown-editor').fill('수식: ');await page.locator('#markdown-editor').focus();await page.keyboard.press('End');await page.locator('button[data-mode="edit"]').click();await page.locator('.more-tools summary').click();await page.locator('[data-insert="inlineMath"]').click();await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===1);ok('Math toolbar inserts valid Markdown',await page.locator('#markdown-editor').inputValue().then(s=>s.includes('$x_t$')));
  await page.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('저장됨'));await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===1);ok('TeX draft survives refresh',await page.locator('#markdown-editor').inputValue().then(s=>s.includes('$x_t$')));
  await page.locator('#markdown-editor').fill(md);await page.waitForFunction(()=>document.querySelectorAll('#preview-body .katex').length===5);
  const output=process.env.BLOG_TEST_OUTPUT;if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'quiet-math-editor.png')});}
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});for(const mode of ['edit','preview']){await page.locator('button[data-mode="'+mode+'"]').click();ok('No overflow '+width+' '+mode,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}}
  ok('No browser exceptions',errors.length===0);
  if(output)fs.writeFileSync(path.join(output,'quiet-math-verification.json'),JSON.stringify({base,passed,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
