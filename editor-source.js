/* Paint Markdown underneath the native textarea without changing its selection or text. */
(() => {
  function connect(editor){
    const holder=document.createElement('div');holder.className='source-editor';editor.before(holder);holder.append(editor);
    const layer=document.createElement('pre');layer.className='source-highlight';layer.setAttribute('aria-hidden','true');const code=document.createElement('code');code.className='code-wrap';layer.append(code);holder.prepend(layer);
    let scheduled=false,last='';
    function align(){const css=getComputedStyle(editor);for(const property of ['font','lineHeight','letterSpacing','padding','tabSize','wordBreak','overflowWrap'])layer.style[property]=css[property];layer.style.width=editor.clientWidth+'px';layer.style.height=editor.clientHeight+'px';layer.scrollTop=editor.scrollTop;layer.scrollLeft=editor.scrollLeft;}
    function paint(){scheduled=false;const text=editor.value+'\n';if(text!==last){last=text;if(window.Prism?.languages.markdown&&text.length<=100000)code.innerHTML=Prism.highlight(text,Prism.languages.markdown,'markdown');else code.textContent=text;}align();}
    function refresh(){if(!scheduled){scheduled=true;requestAnimationFrame(paint);}}
    editor.addEventListener('input',refresh);editor.addEventListener('scroll',align,{passive:true});new ResizeObserver(refresh).observe(editor);document.fonts?.ready.then(refresh);refresh();
    return {refresh};
  }
  window.EditorSource={connect};
})();
