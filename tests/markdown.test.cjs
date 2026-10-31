const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),sandbox={window:{},document:{readyState:'loading',addEventListener(){}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'assets/vendor/marked.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(root,'src/js/article-math.js'),'utf8'),sandbox);sandbox.marked.use({extensions:sandbox.window.StudyMath.extensions});
const parse=source=>sandbox.marked.parse(source,{gfm:true}),katex=require('../assets/vendor/katex/katex.min.js');
test('inline math preserves subscripts and TeX commands before Markdown tokenization',()=>{
 const html=parse(String.raw`state $h_{t-1} + \alpha$ remains inline`);assert.match(html,/<span class="math-inline">h_\{t-1\} \+ \\alpha<\/span>/);assert.ok(!html.includes('<em>'));
});
test('display equations retain matrices, alignment rows and backslashes',()=>{
 const tex=String.raw`\begin{aligned} h_t &= \bar{A}h_{t-1} \\ y_t &= C h_t \end{aligned}`;
 const html=parse('$$\n'+tex+'\n$$\n');assert.ok(html.includes('class="math-display"'));assert.ok(html.includes(tex.replaceAll('&','&amp;')));
});
test('bracket delimiters work without Markdown stripping their backslashes',()=>{
 assert.match(parse(String.raw`\(x_i\)`),/class="math-inline"/);assert.match(parse(String.raw`\[x_i\]`),/class="math-display"/);
});
test('fenced and inline code keep math syntax literal',()=>{
 const fence=String.fromCharCode(96).repeat(3),tick=String.fromCharCode(96);const html=parse(fence+'tex\n$x_1$\n$$x$$\n'+fence+'\n\n'+tick+'$x_2$'+tick);assert.ok(!html.includes('class="math-'));assert.ok(html.includes('$x_1$')&&html.includes('$x_2$'));
});
test('prices and escaped dollar signs stay ordinary text',()=>{
 const html=parse(String.raw`prices $5 and $10; a literal \$x\$`);assert.ok(!html.includes('class="math-'));assert.ok(html.includes('$5 and $10'));
});
test('HTML inside a math token cannot become an executable element',()=>{
 const html=parse('$\\text{<img src=x onerror=alert(1)>}$');assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});
test('KaTeX renders accessible math and refuses trusted HTML commands',()=>{
 const html=katex.renderToString(String.raw`\frac{1}{n}\sum_{i=1}^{n} x_i`,{trust:false,throwOnError:true,output:'htmlAndMathml'});assert.ok(html.includes('katex-mathml')&&html.includes('application/x-tex'));assert.throws(()=>katex.renderToString(String.raw`\htmlClass{evil}{x}`,{trust:false,throwOnError:true,strict:'error'}));
});
