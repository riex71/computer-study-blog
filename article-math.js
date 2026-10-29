/* Render only canonical math nodes, after article HTML has been sanitized. */
(() => {
  const escaped = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const inline = {
    name:'studyMathInline', level:'inline',
    start(source) { const index = source.search(/\$|\\\(/); return index < 0 ? undefined : index; },
    tokenizer(source) {
      let raw, tex;
      if (source.startsWith('\\(')) {
        const match = /^\\\(([\s\S]*?)\\\)/.exec(source); if (match) { raw=match[0];tex=match[1]; }
      } else if (source[0]==='$' && source[1]!=='$' && !/\s/.test(source[1] || ' ')) {
        const match = /^\$((?:\\[\s\S]|[^\\$\n])+?)\$(?!\d)/.exec(source);
        if (match && !/\s$/.test(match[1])) { raw=match[0];tex=match[1]; }
      }
      if (raw && tex.trim()) return {type:'studyMathInline',raw,text:tex};
    },
    renderer(token) { return '<span class="math-inline">' + escaped(token.text) + '</span>'; }
  };
  const block = {
    name:'studyMathBlock', level:'block',
    start(source) { const index=source.search(/^(?: {0,3}\$\$| {0,3}\\\[)/m);return index<0?undefined:index; },
    tokenizer(source) {
      const match = /^ {0,3}(?:\$\$([\s\S]*?)(?<!\\)\$\$|\\\[([\s\S]*?)\\\])[^\S\n]*(?:\n|$)/.exec(source);
      if (match && (match[1] || match[2] || '').trim()) return {type:'studyMathBlock',raw:match[0],text:(match[1] ?? match[2]).trim()};
    },
    renderer(token) { return '<div class="math-display">' + escaped(token.text) + '</div>\n'; }
  };
  function render(root) {
    if (!root || !window.katex) return {count:0,errors:0};
    let count=0,errors=0;
    root.querySelectorAll('.math-inline,.math-display').forEach(node => {
      if (node.closest('pre,code') || node.querySelector('.katex')) return;
      const tex=node.textContent;
      try {
        katex.render(tex,node,{displayMode:node.classList.contains('math-display'),throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20,output:'htmlAndMathml'});
        count++;
      } catch {
        node.textContent=tex;node.classList.add('math-error');node.title='수식 문법을 확인해 주세요.';errors++;
      }
    });
    return {count,errors};
  }
  window.StudyMath={extensions:[block,inline],render};
  const start=()=>render(document.querySelector('body[data-page="article"] .public-article'));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
