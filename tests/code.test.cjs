const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createCompiler}=require('../scripts/markdown.cjs');
const compiler=createCompiler(),{window}=compiler;
for(const file of ['assets/vendor/prism.js','article-code.js'])window.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
test.after(()=>compiler.close());
function display(md){const root=window.document.createElement('div');root.innerHTML=compiler.compile(md);window.StudyCode.mount(root);return root;}
test('Python and JavaScript aliases get language labels and syntax tokens without changing code',()=>{
 for(const [language,label,code] of [['python','Python','def f(x):\n    return "hello"'],['js','JavaScript','const message = "hello";']]){
  const root=display('```'+language+'\n'+code+'\n```');assert.equal(root.querySelector('.code-language').textContent,label);assert.ok(root.querySelectorAll('.token').length>0);assert.equal(root.querySelector('code').textContent,code+'\n');
  window.StudyCode.mount(root);assert.equal(root.querySelectorAll('.code-wrap').length,1);
 }
});
test('unknown languages remain readable plain code and syntax highlighting cannot execute code',()=>{
 const root=display('```unknown\n<img src=x onerror=alert(1)>\n```');assert.equal(root.querySelectorAll('img').length,0);assert.equal(root.querySelectorAll('.token').length,0);assert.match(root.querySelector('code').textContent,/<img/);
 const html=display('```html\n<script>window.pwned=true</script>\n```');assert.equal(html.querySelectorAll('script').length,0);assert.equal(window.pwned,undefined);
});
test('language markers survive an editor publication round trip',()=>{
 const source='```c++\nint x = 1;\n```',html=compiler.compile(source),md=window.EditorContent.toMarkdown(html);
 assert.match(md,/```c\+\+/);assert.equal(display(md).querySelector('.code-language').textContent,'C++');
});
