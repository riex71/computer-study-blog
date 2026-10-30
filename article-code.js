/* Highlight only displayed code. The editable Markdown and canonical HTML stay plain. */
(() => {
  const aliases={py:'python',js:'javascript',ts:'typescript',sh:'bash',shell:'bash',zsh:'bash',html:'markup',xml:'markup',svg:'markup','c++':'cpp',yml:'yaml',md:'markdown',tex:'latex',text:'plain',txt:'plain',plaintext:'plain'};
  const names={python:'Python',javascript:'JavaScript',typescript:'TypeScript',jsx:'JSX',tsx:'TSX',bash:'Bash',markup:'HTML / XML',css:'CSS',json:'JSON',sql:'SQL',c:'C',cpp:'C++',java:'Java',go:'Go',rust:'Rust',yaml:'YAML',diff:'Diff',markdown:'Markdown',latex:'LaTeX',plain:'Text'};
  function mount(root=document){
    root.querySelectorAll('pre').forEach(pre=>{
      if(pre.closest('.code-wrap'))return;
      const code=pre.querySelector('code'),raw=(code?.className.match(/(?:^|\s)language-([^\s]+)/)||[])[1]||'plain',language=aliases[raw.toLowerCase()]||raw.toLowerCase();
      const wrapper=document.createElement('div');wrapper.className='code-wrap';pre.before(wrapper);
      const head=document.createElement('div');head.className='code-heading';
      const label=document.createElement('span');label.className='code-language';label.textContent=names[language]||raw;
      const copy=document.createElement('button');copy.type='button';copy.className='copy-code';copy.textContent='복사';copy.setAttribute('aria-label',(names[language]||raw)+' 코드 복사');
      copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code?.textContent??pre.textContent);copy.textContent='복사됨';setTimeout(()=>copy.textContent='복사',1500);}catch{copy.textContent='선택해서 복사';}});
      head.append(label,copy);wrapper.append(head,pre);
      if(code&&window.Prism?.languages[language]&&code.textContent.length<=100000){
        code.className='language-'+language;code.innerHTML=Prism.highlight(code.textContent,Prism.languages[language],language);
      }
    });
  }
  window.StudyCode={mount};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{const article=document.querySelector('body[data-page="article"] .public-article');if(article)mount(article);},{once:true});
  else{const article=document.querySelector('body[data-page="article"] .public-article');if(article)mount(article);}
})();
