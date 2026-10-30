/* A small explanatory model, not Engram's tokenizer or production hash. */
(() => {
  function address(tokens,head,buckets){
    let value=(2166136261^Math.imul(head+1,2654435761))>>>0;
    for(const token of tokens){value=Math.imul(value^token,16777619)>>>0;value=(value^(value>>>13))>>>0;}
    return value%buckets;
  }
  function analyse(sequences,heads,buckets){
    const rows=sequences.map(tokens=>({tokens,addresses:Array.from({length:heads},(_,head)=>address(tokens,head,buckets))}));
    let firstHead=0,allHeads=0;
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      if(rows[i].addresses[0]===rows[j].addresses[0])firstHead++;
      if(rows[i].addresses.every((value,k)=>value===rows[j].addresses[k]))allHeads++;
    }
    return {rows,firstHead,allHeads};
  }
  function mount(root=document){
    root.querySelectorAll('.engram-hash-demo:not([data-ready])').forEach(host=>{
      host.dataset.ready='true';
      host.replaceChildren();
      const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
      host.append(el('p','같은 주소로 가는 토큰 묶음 살펴보기'));
      const controls=el('div');controls.className='lab-controls';
      const select=(title,values,initial)=>{const label=el('label',title+' '),input=el('select');for(const value of values){const option=el('option',String(value));option.value=value;option.selected=value===initial;input.append(option);}label.append(input);controls.append(label);return input;};
      const buckets=select('테이블의 행 수',[4,8,16,32],4),heads=select('해시 head 수',[1,2,4],2);
      const label=el('label','토큰 ID 묶음 · |로 구분'),input=el('input');input.type='text';input.value='7 11 5 | 3 8 2 | 7 1 5 | 2 6 9 | 4 8 3 | 9 2 6';input.maxLength=240;input.spellcheck=false;label.className='lab-input';label.append(input);
      const status=el('p');status.className='lab-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const wrap=el('div');wrap.className='lab-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','토큰 묶음별 조회 주소');
      const table=el('table');wrap.append(table);
      host.append(controls,label,status,wrap,el('p','단순화한 32비트 해시의 주소만 비교합니다. 실제 Engram의 해시·토큰화·학습 임베딩과 다르며, 여러 head도 충돌을 완전히 없애지는 않습니다. 중복 입력은 하나로 셉니다.'));
      function render(){
        const parts=input.value.split('|').map(value=>value.trim()).filter(Boolean);
        if(parts.length<2||parts.length>12||parts.some(value=>!/^\d+(?:\s+\d+){1,3}$/.test(value)||value.split(/\s+/).some(token=>Number(token)>1000000))){status.textContent='0~1000000 사이의 ID 2~4개를 묶어 주세요. 서로 다른 묶음 2~12개를 |로 구분합니다.';table.replaceChildren();return;}
        const sequences=[...new Map(parts.map(value=>{const tokens=value.split(/\s+/).map(Number);return [tokens.join(','),tokens];})).values()];
        const result=analyse(sequences,Number(heads.value),Number(buckets.value));
        status.textContent=`${sequences.length}개 묶음 중 첫 head에서 주소가 같은 쌍 ${result.firstHead}개 · 모든 head의 주소가 같은 쌍 ${result.allHeads}개`;
        table.replaceChildren();const caption=el('caption','주소는 0부터 시작합니다. 행 수나 head 수를 바꿔 비교해 보세요.');table.append(caption);
        const thead=el('thead'),header=el('tr');
        for(const title of ['토큰 묶음',...Array.from({length:Number(heads.value)},(_,i)=>'head '+(i+1))]){const th=el('th',title);th.scope='col';header.append(th);}thead.append(header);table.append(thead);
        const tbody=el('tbody');for(const row of result.rows){const tr=el('tr'),th=el('th',row.tokens.join(', '));th.scope='row';tr.append(th);for(const value of row.addresses)tr.append(el('td',String(value)));tbody.append(tr);}table.append(tbody);
      }
      input.addEventListener('input',render);heads.addEventListener('change',render);buckets.addEventListener('change',render);render();
    });
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={address,analyse};
  if(typeof window!=='undefined'){window.StudyLabs={mount};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount(),{once:true});else mount();}
})();
