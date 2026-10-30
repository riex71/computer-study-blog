/* Link reading positions by Markdown headings, including wrapped source lines. */
(() => {
  function interpolate(value,points,from=0,to=1){
    if(value<=points[0][from])return points[0][to];
    for(let i=1;i<points.length;i++)if(value<=points[i][from]){
      const a=points[i-1],b=points[i],distance=b[from]-a[from];
      return distance>0?a[to]+(value-a[from])/distance*(b[to]-a[to]):b[to];
    }
    return points.at(-1)[to];
  }
  function connect(editor,pane){
    const mirror=document.createElement('div');mirror.setAttribute('aria-hidden','true');
    mirror.style.cssText='position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;height:auto';document.body.append(mirror);
    let points=[[0,0],[1,1]],active=editor,scheduled=false;
    const expected=new WeakMap(),enabled=()=>document.querySelector('.editor-panes')?.dataset.mode==='split';
    function move(source){
      if(!enabled())return;
      const target=source===editor?pane:editor,index=source===editor?0:1;
      const top=interpolate(source.scrollTop,points,index,1-index);
      if(Math.abs(target.scrollTop-top)>.5){target.scrollTop=top;expected.set(target,target.scrollTop);}
    }
    function rebuild(){
      scheduled=false;if(!enabled()||!editor.clientHeight||!pane.clientHeight)return;
      const sourceMax=Math.max(0,editor.scrollHeight-editor.clientHeight),previewMax=Math.max(0,pane.scrollHeight-pane.clientHeight);
      points=[[0,0]];
      const css=getComputedStyle(editor);
      for(const property of ['font','lineHeight','letterSpacing','padding','tabSize','wordBreak','overflowWrap'])mirror.style[property]=css[property];
      mirror.style.width=editor.clientWidth+'px';mirror.textContent=editor.value+'\u200b';
      const text=mirror.firstChild,range=document.createRange(),top=mirror.getBoundingClientRect().top,headings=[...pane.querySelectorAll('.public-article h2,.public-article h3')];
      let offset=0,index=0;
      for(const token of marked.lexer(editor.value)){
        const positions=token.type==='heading'&&[2,3].includes(token.depth)?[0]:token.type==='html'?[...token.raw.matchAll(/<h[23]\b/gi)].map(match=>match.index):[];
        for(const position of positions){
          const heading=headings[index++];if(!heading)continue;
          const start=Math.min(offset+position,editor.value.length);range.setStart(text,start);range.setEnd(text,Math.min(start+1,text.length));
          const sourceY=range.getBoundingClientRect().top-top;
          const previewY=heading.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop;
          const last=points.at(-1);
          if(sourceY>last[0]+1&&previewY>last[1]+1&&sourceY<sourceMax&&previewY<previewMax)points.push([sourceY,previewY]);
        }
        offset+=(token.raw||'').length;
      }
      points.push([sourceMax,previewMax]);move(active);
    }
    function refresh(){if(!scheduled){scheduled=true;requestAnimationFrame(rebuild);}}
    for(const source of [editor,pane]){
      source.addEventListener('scroll',()=>{
        if(expected.has(source)&&Math.abs(source.scrollTop-expected.get(source))<1){expected.delete(source);return;}
        expected.delete(source);active=source;move(source);
      },{passive:true});
      for(const event of ['pointerdown','wheel','touchstart','keydown'])source.addEventListener(event,()=>{expected.delete(source);active=source;},{passive:true});
    }
    editor.addEventListener('input',()=>{active=editor;refresh();});
    const resize=new ResizeObserver(refresh);resize.observe(editor);resize.observe(pane);resize.observe(pane.querySelector('.public-article'));
    document.fonts?.ready.then(refresh);addEventListener('resize',refresh);refresh();
    return {refresh,reset(){expected.delete(editor);expected.delete(pane);active=editor;refresh();}};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={interpolate};
  if(typeof window!=='undefined')window.EditorScroll={connect};
})();
