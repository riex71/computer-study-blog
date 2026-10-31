const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCompiler,compileArticles}=require('../scripts/markdown.cjs');
const compiler=createCompiler(),document=compiler.window.document,root=html=>{const node=document.createElement('div');node.innerHTML=html;return node;};
test.after(()=>compiler.close());
test('Markdown is authoritative even when the generated HTML is stale',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studybase-build-'));
  try{
    fs.mkdirSync(path.join(dir,'content/articles'),{recursive:true});
    fs.writeFileSync(path.join(dir,'content/posts.json'),JSON.stringify([{slug:'sample',sourceMarkdown:'content/articles/sample.md',sourceHtml:'content/articles/sample.html'}]));
    fs.writeFileSync(path.join(dir,'content/articles/sample.html'),'<p>stale cached HTML</p>');
    fs.writeFileSync(path.join(dir,'content/articles/sample.md'),'## 수정한 제목 {#stable}\n\nMarkdown만 수정한 내용 $h_t$');
    assert.equal(compileArticles(dir),1);const result=fs.readFileSync(path.join(dir,'_site/content/articles/sample.html'),'utf8');assert.equal(fs.readFileSync(path.join(dir,'content/articles/sample.html'),'utf8'),'<p>stale cached HTML</p>');
    assert.match(result,/Markdown만 수정한 내용/);assert.match(result,/id="stable"/);assert.match(result,/math-inline/);assert.ok(!result.includes('stale'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('publication round trips preserve all article anchors, images, captions, tables and TeX',()=>{
  const posts=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/posts.json'),'utf8'));
  for(const post of posts){
    const original=compiler.compile(fs.readFileSync(path.join(__dirname,'..',post.sourceMarkdown),'utf8')),md=compiler.window.EditorContent.toMarkdown(original),again=compiler.compile(md),a=root(original),b=root(again);
    const extract=node=>({text:node.textContent.replace(/\s/g,''),ids:[...node.querySelectorAll('[id]')].map(n=>n.id).sort(),images:[...node.querySelectorAll('img')].map(n=>[n.getAttribute('src'),n.alt,n.width,n.height]),captions:[...node.querySelectorAll('figcaption,caption')].map(n=>n.textContent),tables:node.querySelectorAll('table').length,rowHeaders:node.querySelectorAll('th[scope="row"]').length,links:[...node.querySelectorAll('a[href]')].map(n=>n.getAttribute('href')).sort(),math:[...node.querySelectorAll('.math-inline,.math-display')].map(n=>n.textContent),labs:node.querySelectorAll('.hash-demo').length});
    assert.deepEqual(extract(b),extract(a),post.slug);
    assert.equal(compiler.window.StudyMath.render(b).errors,0);
  }
});
test('explicit heading addresses survive title changes and duplicate IDs are rejected',()=>{
  const node=root(compiler.compile('## 바뀐 제목 {#permanent}\n\n### 하위 {#child}\n\n## 중복 {#permanent}'));
  assert.equal(node.querySelector('h2').id,'permanent');assert.equal(node.querySelector('h3').id,'child');
  assert.equal(node.querySelectorAll('#permanent').length,1);assert.ok(!node.textContent.includes('{#'));
});
test('interactive article placeholders survive Markdown publishing without copying live controls',()=>{
  const html=compiler.compile('<div class="engram-hash-demo"></div>'),md=compiler.window.EditorContent.toMarkdown(html);
  assert.equal(root(compiler.compile(md)).querySelectorAll('.hash-demo').length,1);
  const rendered='<div class="engram-hash-demo"><p>temporary status</p><button>control</button></div>';
  assert.equal(compiler.window.EditorContent.toMarkdown(rendered).trim(),':::hash-demo\n:::');
});
test('hash demo directive is preserved as a component and stays literal inside code fences',()=>{
  const source=':::hash-demo\n:::\n',html=compiler.compile(source);
  assert.equal(root(html).querySelectorAll('.hash-demo').length,1);
  assert.equal(compiler.window.EditorContent.toMarkdown(html).trim(),source.trim());
  const literal=root(compiler.compile('```markdown\n'+source+'```\n'));assert.equal(literal.querySelectorAll('.hash-demo').length,0);assert.match(literal.querySelector('code').textContent,/:::hash-demo/);
  const legacy=root(compiler.compile('<div class="engram-hash-demo"><p>runtime controls 481632</p><table><tr><td>runtime data</td></tr></table></div>'));
  assert.equal(legacy.querySelectorAll('table').length,0);assert.ok(!legacy.textContent.includes('runtime'));
});
test('build compiler never executes source scripts or keeps event handlers',()=>{
  const html=compiler.compile('<script>globalThis.pwned=true</script>\n\n<img src="https://example.com/x.png" onerror="alert(1)">\n\n[bad](javascript:alert(1))');
  assert.ok(!html.includes('<script')&&!html.includes('onerror')&&!html.includes('javascript:'));assert.equal(compiler.window.pwned,undefined);
});
test('preview resolves relative article, figure and example links from the public posts directory',()=>{
  const preview=compiler.window.EditorContent.preview(compiler.compile('[다른 글](engram-conditional-memory.html)\n\n[그림](../assets/engram/engram_arch.svg)\n\n[코드](../examples/state_recurrence.py)'));
  const links=[...root(preview).querySelectorAll('a')].map(a=>a.href);
  assert.deepEqual(links,['https://riex71.github.io/computer-study-blog/posts/engram-conditional-memory.html','https://riex71.github.io/computer-study-blog/assets/engram/engram_arch.svg','https://riex71.github.io/computer-study-blog/examples/state_recurrence.py']);
});


test('private previews resolve published images from the public origin while keeping staged images local',()=>{
 const html=compiler.compile('![새 그림](../assets/uploads/sample/figure.png)\n\n[다른 글](other.html)');
 const base='https://public.example/blog/';
 const published=root(compiler.window.EditorContent.preview(html,[],'sample',base));
 assert.equal(published.querySelector('img').src,'https://public.example/blog/assets/uploads/sample/figure.png');
 assert.equal(published.querySelector('a').href,'https://public.example/blog/posts/other.html');
 const staged=root(compiler.window.EditorContent.preview(html,[{path:'assets/uploads/sample/figure.png',type:'image/png',base64:'AQID'}],'sample',base));
 assert.equal(staged.querySelector('img').src,'data:image/png;base64,AQID');
});
