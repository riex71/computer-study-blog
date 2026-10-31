/* One compiler for the browser editor and build. Only repository-owned scripts run. */
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function createCompiler(){
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://riex71.github.io/computer-study-blog/write.html',runScripts:'outside-only'});
  for(const file of ['assets/vendor/marked.js','assets/vendor/purify.js','assets/vendor/turndown.js','assets/vendor/katex/katex.min.js','src/js/article-math.js','src/js/editor-content.js'])dom.window.eval(fs.readFileSync(path.join(root,file),'utf8'));
  return {window:dom.window,compile:(md,reference='')=>dom.window.EditorContent.compile(md,reference),close:()=>dom.window.close()};
}
function compileArticles(contentRoot=root,outputRoot=contentRoot){
  const compiler=createCompiler();
  try{
    const posts=JSON.parse(fs.readFileSync(path.join(contentRoot,'content/posts.json'),'utf8'));
    for(const post of posts){
      const resolveSource=file=>{const result=path.resolve(contentRoot,file);if(!result.startsWith(path.join(contentRoot,'content/articles')+path.sep))throw Error('Article path leaves content/articles');return result;};
      const source=resolveSource(post.sourceMarkdown),output=path.resolve(outputRoot,post.sourceHtml),html=compiler.compile(fs.readFileSync(source,'utf8'));
      const probe=compiler.window.document.createElement('div');probe.innerHTML=html;
      if(compiler.window.StudyMath.render(probe).errors)throw Error('Invalid math in '+post.slug);
      if(!output.startsWith(path.join(outputRoot,'content/articles')+path.sep))throw Error('Output path leaves content/articles');
      fs.mkdirSync(path.dirname(output),{recursive:true});
      fs.writeFileSync(output,html.trim()+'\n');
      if(outputRoot!==contentRoot)fs.copyFileSync(source,path.resolve(outputRoot,post.sourceMarkdown));
    }
    return posts.length;
  }finally{compiler.close();}
}
module.exports={createCompiler,compileArticles};
if(require.main===module)console.log('Compiled '+compileArticles(root,path.join(root,'_site'))+' Markdown articles with the editor renderer.');
