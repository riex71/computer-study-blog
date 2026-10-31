const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createCompiler}=require('../scripts/markdown.cjs');
const compiler=createCompiler(),{window}=compiler;
test.after(()=>compiler.close());
const root=html=>{const node=window.document.createElement('div');node.innerHTML=html;return node;};
const compile=md=>root(compiler.compile(md)),round=md=>compile(window.EditorContent.toMarkdown(compiler.compile(md)));
for(const [index,source] of ['', '###', '#### ', '```python\ndef unfinished(', '$$', '$\\frac{', '[미완성 링크](', '![미완성 그림](', '| 표 |\n| ---', '- [', '>\n>', '<details><summary>열린 태그'].entries()){
 test('partially typed Markdown remains editable without compiler errors '+(index+1),()=>assert.doesNotThrow(()=>{const html=compiler.compile(source);compiler.compile(window.EditorContent.toMarkdown(html));}));
}
test('all six Markdown heading levels remain section headings with stable addresses',()=>{
 const md=Array.from({length:6},(_,i)=>'#'.repeat(i+1)+' 단계 '+(i+1)+' {#heading-'+(i+1)+'}').join('\n\n');
 for(const node of [compile(md),round(md)]){assert.deepEqual([...node.children].map(h=>h.tagName),['H2','H2','H3','H4','H5','H6']);assert.equal(node.querySelectorAll('[id]').length,6);}
});
test('duplicate, skipped, empty, Korean, code and math headings do not lose text or collide',()=>{
 const md='#### 건너뛴 절\n\n## 같은 제목\n\n## 같은 제목\n\n###\n\n##### 한글 🙂 {#한국어}\n\n###### $x_i$와 `code`';
 const node=round(md),ids=[...node.querySelectorAll('[id]')].map(h=>h.id);assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.ok(node.querySelector('#한국어'));assert.equal(node.querySelectorAll('.math-inline').length,1);assert.equal(node.querySelector('h6 code').textContent,'code');
});
test('checked and unchecked nested tasks survive publishing and remain disabled',()=>{
 const md='- [x] 완료\n- [ ] 미완료\n  - [x] 하위';
 for(const node of [compile(md),round(md)]){assert.deepEqual([...node.querySelectorAll('input')].map(n=>[n.type,n.checked,n.disabled]),[['checkbox',true,true],['checkbox',false,true],['checkbox',true,true]]);}
});
test('strikethrough survives while numeric ranges and literal inline code remain intact',()=>{
 const node=round('~~취소선~~ 75~80%와 20~25% `~~literal~~`');assert.equal(node.querySelector('del').textContent,'취소선');assert.equal(node.querySelectorAll('del').length,1);assert.equal(node.querySelector('code').textContent,'~~literal~~');assert.match(node.textContent,/75~80%와 20~25%/);
});
test('table alignment, escaped pipes, inline code, math and line breaks survive publishing',()=>{
 const md='| 왼쪽 | 가운데 | 오른쪽 |\n| :--- | :---: | ---: |\n| a\\|b | $x_i$ | `a\\|b` |\n| a<br>b | center | 1 |';
 const a=compile(md),b=round(md);for(const node of [a,b]){assert.deepEqual([...node.querySelectorAll('thead th')].map(n=>n.className),['align-left','align-center','align-right']);assert.equal(node.querySelector('.math-inline').textContent,'x_i');assert.equal(node.querySelector('code').textContent,'a|b');assert.equal(node.querySelectorAll('br').length,1);}
});
test('merged table cells, disclosure sections and HTML subscripts retain their structure',()=>{
 const md='<table><tr><th colspan="2">합침</th></tr><tr><td rowspan="2">행</td><td>A</td></tr><tr><td>B</td></tr></table>\n\n<details open><summary>설명</summary><p>H<sub>2</sub>O와 x<sup>2</sup></p></details>';
 const node=round(md);assert.equal(node.querySelector('[colspan]').getAttribute('colspan'),'2');assert.equal(node.querySelector('[rowspan]').getAttribute('rowspan'),'2');assert.equal(node.querySelector('details').open,true);assert.equal(node.querySelector('summary').textContent,'설명');assert.equal(node.querySelector('sub').textContent,'2');assert.equal(node.querySelector('sup').textContent,'2');
});
test('ordered list starts, nested lists, multi-paragraph quotes and hard breaks survive',()=>{
 const node=round('3. 셋\n4. 넷\n   - 하위\n\n> 첫 문단\n>\n> 다음 문단\n\n첫 줄  \n다음 줄');assert.equal(node.querySelector('ol').start,3);assert.equal(node.querySelectorAll('ol ul li').length,1);assert.equal(node.querySelectorAll('blockquote p').length,2);assert.equal(node.querySelectorAll('br').length,1);
});
test('nested code fences and unusual language names preserve exact code text',()=>{
 const md='````markdown\n```python\nprint("hi")\n```\n````\n\n```c++\nint x = 1;\n```';assert.deepEqual([...compile(md).querySelectorAll('code')].map(n=>[n.className,n.textContent]),[...round(md).querySelectorAll('code')].map(n=>[n.className,n.textContent]));
});
test('preview keeps internal anchors without creating duplicate document IDs or opening a new tab',()=>{
  const node=root(window.EditorContent.preview(compiler.compile('#### 목적지 {#target}\n\n[이동](#target)')));assert.equal(node.querySelectorAll('[id]').length,0);assert.equal('#'+node.querySelector('[data-preview-anchor]').dataset.previewAnchor,node.querySelector('a').getAttribute('href'));assert.equal(node.querySelector('a').target,'');
});
test('raw inputs are limited to inert checkboxes and event handlers remain forbidden',()=>{
 const node=compile('<input type="text" autofocus onfocus="alert(1)"><input type="checkbox" onclick="alert(1)">');assert.equal(node.querySelectorAll('input').length,1);assert.equal(node.querySelector('input').disabled,true);assert.ok(!node.innerHTML.includes('onclick')&&!node.innerHTML.includes('onfocus'));
});
test('relative links with query strings and project-root links retain their destinations',()=>{
 const md='[다른 글](mamba-selective-ssm.html?v=1#section-03)\n\n[현재 글](?view=plain)\n\n[목록](/computer-study-blog/archive.html?q=AI)';
 assert.deepEqual([...round(md).querySelectorAll('a')].map(a=>a.getAttribute('href')),['mamba-selective-ssm.html?v=1#section-03','?view=plain','/computer-study-blog/archive.html?q=AI']);
 const preview=root(window.EditorContent.preview(compiler.compile(md),[],'sample'));
 assert.equal(preview.querySelectorAll('a')[1].href,'https://riex71.github.io/computer-study-blog/posts/sample.html?view=plain');
});
test('script and unsupported URL schemes remain blocked after relative-link fixes',()=>{
 const node=compile('[bad](javascript:alert%281%29)\n\n[custom](custom:payload)\n\n[protocol-relative](//example.com)');assert.equal(node.querySelectorAll('a[href]').length,0);
});
test('a references section does not absorb the next top-level section',()=>{
 const md='## 참고 자료 {#refs}\n\n참고 링크\n\n### 세부 출처\n\n자료 설명\n\n## 부록 {#appendix}\n\n일반 본문';
 for(const node of [compile(md),round(md)]){assert.ok(node.querySelector('#refs').closest('.article-sources'));assert.equal(node.querySelector('#appendix').closest('.article-sources'),null);assert.equal(node.querySelector('.article-sources h2').id,'refs');}
});
test('stress fixture retains every supported structure through a publication round trip',()=>{
 const md=fs.readFileSync(path.join(__dirname,'fixtures/markdown-stress.md'),'utf8');
 const signature=n=>({headings:[...n.querySelectorAll('h2,h3,h4,h5,h6')].map(h=>[h.tagName,h.id,h.textContent]),checks:[...n.querySelectorAll('input')].map(i=>i.checked),code:[...n.querySelectorAll('pre code')].map(i=>[i.className,i.textContent]),math:[...n.querySelectorAll('.math-inline,.math-display')].map(i=>i.textContent),tables:n.querySelectorAll('table').length,merged:[...n.querySelectorAll('[rowspan],[colspan]')].map(i=>i.outerHTML),links:[...n.querySelectorAll('a')].map(i=>i.getAttribute('href')),figures:n.querySelectorAll('figure').length,del:[...n.querySelectorAll('del')].map(i=>i.textContent),details:n.querySelectorAll('details').length,labs:n.querySelectorAll('.hash-demo').length});
 assert.deepEqual(signature(round(md)),signature(compile(md)));assert.equal(window.StudyMath.render(round(md)).errors,0);
});
