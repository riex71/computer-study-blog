/* Keep editable Markdown separate from safe canonical HTML and rendered math. */
(() => {
  marked.use({extensions:StudyMath.extensions,tokenizer:{del(source){return source.startsWith('~~')?false:undefined;}},renderer:{heading({tokens,depth}){
    let title=this.parser.parseInline(tokens);const match=/\s*\{#([\w가-힣-]+)\}$/.exec(title),id=match?match[1]:'';
    if(match)title=title.slice(0,match.index);
    return '<h'+depth+(id?' id="'+id+'"':'')+'>'+title+'</h'+depth+'>\n';
  }}});
  const tags=['p','br','h2','h3','h4','ul','ol','li','a','img','figure','figcaption','table','thead','tbody','tfoot','tr','th','td','caption','pre','code','blockquote','hr','em','s','del','sub','sup','span','div','section','dl','dt','dd','details','summary'];
  const policy={ALLOWED_TAGS:tags,ALLOWED_ATTR:['href','src','alt','title','id','class','colspan','rowspan','scope','width','height','start','open','aria-labelledby'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,FORBID_ATTR:['style'],ALLOW_UNKNOWN_PROTOCOLS:false};
  const classes=/^(?:note-figure|paper-figure|figure-note|article-sources|source-list|formula|equation|table-wrap|table-caption|note|callout|language-[a-z0-9-]+|source-note|figure-grid|reference-list|engram-editor-note|engram-equation|engram-image-link|engram-paper-figure|engram-table|engram-table-wrap|engram-hash-demo|math-inline|math-display)$/;
  const textKey=node=>node.textContent.replace(/\s+/g,' ').trim();
  function documentOf(html){const root=document.createElement('div');root.innerHTML=DOMPurify.sanitize(html,policy);return root;}
  function compile(markdown,referenceHTML='') {
    const root=documentOf(marked.parse(markdown,{breaks:false,gfm:true})),reference=documentOf(referenceHTML);
    const used=new Set(['main','global-search','global-search-title']),reserved=new Set([...reference.querySelectorAll('[id]')].map(n=>n.id));
    root.querySelectorAll('[id]').forEach(el=>{const id=el.id;if(!/^[\w가-힣-]+$/.test(id)||used.has(id))el.removeAttribute('id');else used.add(id);});
    root.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href')||'';if(!/^(?:https?:\/\/|mailto:|#|\.\.\/|\.\/|[^:/?#]+(?:\/|$))/i.test(href))a.removeAttribute('href');a.removeAttribute('class');});
    root.querySelectorAll('img').forEach(img=>{
      const src=img.getAttribute('src')||'';
      if(/^https:\/\//i.test(src)){}
      else if(/^(?:\.\.\/)?assets\/[a-zA-Z0-9_./-]+$/.test(src)&&!src.includes('/../'))img.setAttribute('src','../'+src.replace(/^\.\.\//,''));
      else img.removeAttribute('src');
      img.setAttribute('loading','lazy');img.setAttribute('decoding','async');
    });
    root.querySelectorAll('[class]').forEach(el=>{const allowed=el.className.split(/\s+/).filter(c=>classes.test(c));if(allowed.length)el.className=allowed.join(' ');else el.removeAttribute('class');});
    const priorImages=new Map([...reference.querySelectorAll('figure img')].map(img=>[img.getAttribute('src'),img]));
    for(const node of [...root.children])if(node.tagName==='IMG'||node.tagName==='A'&&node.querySelectorAll('img').length===1&&!node.textContent.trim()){
      const paragraph=document.createElement('p');node.before(paragraph);paragraph.append(node);
    }
    root.querySelectorAll('p').forEach(p=>{
      const img=p.querySelector('img');if(!img||p.querySelectorAll('img').length!==1||p.textContent.trim())return;
      const figure=document.createElement('figure'),prior=priorImages.get(img.getAttribute('src'))?.closest('figure');figure.className=prior?.className.split(/\s+/).filter(c=>classes.test(c)).join(' ')||'note-figure';
      if(prior?.id&&!used.has(prior.id)){figure.id=prior.id;used.add(prior.id);}
      while(p.firstChild)figure.append(p.firstChild);
      const next=p.nextElementSibling;
      if(next?.tagName==='P'&&/^그림 설명:\s*/.test(next.textContent)){
        const caption=document.createElement('figcaption');caption.innerHTML=next.innerHTML.replace(/^그림 설명:\s*/,'');figure.append(caption);next.remove();
      }
      p.replaceWith(figure);
    });
    root.querySelectorAll('img').forEach(img=>{
      const prior=priorImages.get(img.getAttribute('src'));
      for(const attr of ['width','height'])if(!img.hasAttribute(attr)&&prior?.hasAttribute(attr))img.setAttribute(attr,prior.getAttribute(attr));
    });
    root.querySelectorAll('table').forEach((table,index)=>{
      table.classList.add('article-table');
      const prev=table.previousElementSibling;
      if(prev?.tagName==='P'&&/^표 설명:\s*/.test(prev.textContent)){
        const caption=document.createElement('caption');caption.innerHTML=prev.innerHTML.replace(/^표 설명:\s*/,'');table.prepend(caption);prev.remove();
      }
      if(reference.querySelectorAll('table')[index]?.classList.contains('engram-table'))table.classList.add('engram-table');
      const oldRows=reference.querySelectorAll('table')[index]?.querySelectorAll('tbody tr');
      table.querySelectorAll('thead th').forEach(th=>th.scope='col');
      table.querySelectorAll('tbody tr').forEach((row,i)=>{if((oldRows?.[i]?.firstElementChild?.tagName==='TH'||!oldRows)&&row.firstElementChild?.tagName==='TD'){const th=document.createElement('th');th.scope='row';while(row.firstElementChild.firstChild)th.append(row.firstElementChild.firstChild);row.firstElementChild.replaceWith(th);}});
    });
    const counts={H2:0,H3:0};
    const priorHeadings=[...reference.querySelectorAll('h2[id],h3[id]')];
    root.querySelectorAll('h2,h3').forEach(h=>{
      if(h.id)return;
      const prior=priorHeadings.find(old=>textKey(old)===textKey(h)&&!used.has(old.id));
      if(prior&&/^[\w가-힣-]+$/.test(prior.id))h.id=prior.id;
      else{let id;const prefix=h.tagName==='H3'?'subsection-':'section-';do{id=prefix+String(++counts[h.tagName]).padStart(2,'0');}while(used.has(id)||reserved.has(id));h.id=id;}
      used.add(h.id);
    });
    const sources=[...root.querySelectorAll('h2')].find(h=>/^(?:참고 자료|참고 자료와 그림 출처)$/.test(textKey(h)));
    if(sources&&!sources.closest('.article-sources')){const section=document.createElement('section');section.className='article-sources';sources.before(section);let node=sources;while(node){const next=node.nextSibling;section.append(node);node=next;}}
    return root.innerHTML;
  }
  function toMarkdown(html){
    const source=documentOf(html);
    source.querySelectorAll('span[id]:empty').forEach(node=>{node.textContent='\u200b';node.setAttribute('data-study-anchor','true');});
    source.querySelectorAll('.engram-hash-demo').forEach(node=>node.textContent='\u200b');
    source.querySelectorAll('.math-inline,.math-display').forEach(node=>node.setAttribute('data-study-tex',node.textContent));
    const td=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-',emDelimiter:'_',blankReplacement:(_content,node)=>node.nodeName==='SPAN'&&node.id?node.outerHTML:node.isBlock?'\n\n':''});
    td.addRule('article-labs',{filter:node=>node.classList?.contains('engram-hash-demo'),replacement:()=> '\n\n<div class="engram-hash-demo"></div>\n\n'});
    td.addRule('anchor-spans',{filter:node=>node.nodeName==='SPAN'&&!!node.id,replacement:(_content,node)=>node.hasAttribute('data-study-anchor')?'<span id="'+node.id+'"></span>':node.outerHTML});
    td.addRule('anchored-headings',{filter:['h2','h3'],replacement:(content,node)=>'\n\n'+'#'.repeat(Number(node.tagName.slice(1)))+' '+content.trim()+(node.id?' {#'+node.id+'}':'')+'\n\n'});
    td.addRule('math',{filter:node=>node.classList?.contains('math-inline')||node.classList?.contains('math-display'),replacement:(_content,node)=>{const tex=node.getAttribute('data-study-tex')??node.textContent;return node.classList.contains('math-display')?'\n\n$$\n'+tex.trim()+'\n$$\n\n':'$'+tex+'$';}});
    td.addRule('figures',{filter:'figure',replacement:(_content,node)=>{const img=node.querySelector('img');if(!img)return '\n\n'+td.turndown(node.innerHTML)+'\n\n';const caption=node.querySelector('figcaption'),copy=img.cloneNode(false);
      if(node.id&&!copy.id)copy.id=node.id;
      for(const attr of [...copy.attributes])if(!['src','alt','width','height','id'].includes(attr.name))copy.removeAttribute(attr.name);
      const image=copy.hasAttribute('width')||copy.hasAttribute('height')||copy.id?(img.closest('a')?'['+copy.outerHTML+']('+img.closest('a').getAttribute('href')+')':copy.outerHTML):td.turndown((img.closest('a')||img).outerHTML);
      return '\n\n'+image+(caption?'\n\n그림 설명: '+td.turndown(caption.innerHTML):'')+'\n\n';}});
    td.addRule('tables',{filter:'table',replacement:(_content,node)=>{const rows=[...node.querySelectorAll('tr')].map(tr=>[...tr.children].map(cell=>td.turndown(cell.innerHTML).replace(/\|/g,'\\|').replace(/\n/g,'<br>')));if(!rows.length)return '';const line=cells=>'| '+cells.join(' | ')+' |';const caption=node.querySelector('caption');return '\n\n'+(caption?'표 설명: '+td.turndown(caption.innerHTML)+'\n\n':'')+line(rows[0])+'\n'+line(rows[0].map(()=>'---'))+'\n'+rows.slice(1).map(line).join('\n')+'\n\n';}});
    return td.turndown(source.innerHTML);
  }
  function normalizeLegacy(markdown,referenceHTML=''){
    if(!/<(?:h2|figure|section|table)\b/i.test(markdown))return markdown;
    const before=compile(markdown,referenceHTML),next=toMarkdown(before),after=compile(next,referenceHTML);
    const a=documentOf(before),b=documentOf(after),plain=node=>node.textContent.replace(/\s/g,'');
    if(a.querySelector('table [rowspan],table [colspan]'))return markdown;
    const assets=node=>[...node.querySelectorAll('img')].map(img=>[img.getAttribute('src'),img.getAttribute('alt')]);
    return plain(a)===plain(b)&&JSON.stringify(assets(a))===JSON.stringify(assets(b))&&a.querySelectorAll('table').length===b.querySelectorAll('table').length?next:markdown;
  }
  function preview(html,images=[]){
    const root=document.createElement('div');root.innerHTML=html;root.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    root.querySelectorAll('img').forEach(img=>{const src=img.getAttribute('src')||'',local=src.replace(/^\.\.\//,'');const staged=images.find(i=>i.path===local);if(src)img.src=staged?'data:'+staged.type+';base64,'+staged.base64:new URL(src,new URL('posts/',location.href)).href;});
    root.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href');if(href&&!href.startsWith('#'))a.href=new URL(href,new URL('posts/',location.href)).href;a.target='_blank';a.rel='noopener noreferrer';});return root.innerHTML;
  }
  window.EditorContent={compile,preview,toMarkdown,normalizeLegacy};
})();
