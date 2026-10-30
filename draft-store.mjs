/* Compare and write inside one IndexedDB transaction, including legacy drafts. */
export const draftVersion = record => record ? {revision:Number(record.revision)||0,savedAt:record.savedAt||''} : null;
const sameVersion = (record,expected) => record ? !!expected && (Number(record.revision)||0)===expected.revision && (record.savedAt||'')===expected.savedAt : !expected;
export class DraftStore {
  constructor(){
    this.ready=new Promise((resolve,reject)=>{
      const request=indexedDB.open('studybase.writer.v1',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
        if(!db.objectStoreNames.contains('history'))db.createObjectStore('history',{keyPath:'key'}).createIndex('draftId','draftId');
      };
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
      request.onblocked=()=>reject(Error('다른 글쓰기 탭을 닫고 새로고침해 주세요. 기존 원고는 그대로 보관되어 있습니다.'));
      request.onerror=()=>reject(Error('브라우저 저장소를 열 수 없습니다.'));
    });
  }
  async list(){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').getAll();
      tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(Error('임시 글 목록을 불러오지 못했습니다.'));
    });
  }
  async save(snapshot,expected,{checkpoint=''}={}){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['drafts','history'],'readwrite'),store=tx.objectStore('drafts'),history=tx.objectStore('history'),read=store.get(snapshot.id);let result;
      read.onsuccess=()=>{
        const stored=read.result,conflict=!sameVersion(stored,expected),record=structuredClone(snapshot);
        if(conflict){record.recoveredFrom=snapshot.id;record.id=crypto.randomUUID();}
        record.revision=conflict?1:(Number(stored?.revision)||0)+1;
        store.put(record);result={record,conflict,previous:stored};
        const versions=history.index('draftId').getAll(record.id);
        versions.onsuccess=()=>{
          const entries=versions.result.sort((a,b)=>a.revision-b.revision),last=entries.at(-1);
          const signature=r=>JSON.stringify({post:r.post,markdown:r.markdown,images:(r.images||[]).map(i=>i.path)});
          const remember=(source,label)=>{
            const copy=structuredClone(source),imagePaths=(copy.images||[]).map(i=>i.path);delete copy.images;delete copy.position;
            const entry={key:crypto.randomUUID(),draftId:record.id,revision:source.revision||0,recordedAt:new Date().toISOString(),label,signature:signature(source),imagePaths,draft:copy};
            history.put(entry);entries.push(entry);
          };
          if(!last&&stored&&!conflict)remember(stored,'이전 원고');
          if(checkpoint||!last||last.signature!==signature(record)&&Date.now()-Date.parse(last.recordedAt)>=180000)remember(record,checkpoint||'자동 보관');
          for(const old of entries.slice(0,Math.max(0,entries.length-20)))history.delete(old.key);
        };
      };
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('임시 글을 저장하지 못했습니다.'));
    });
  }
  async history(id){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('history','readonly'),request=tx.objectStore('history').index('draftId').getAll(id);
      tx.oncomplete=()=>resolve(request.result.sort((a,b)=>b.revision-a.revision||b.recordedAt.localeCompare(a.recordedAt)));tx.onerror=tx.onabort=()=>reject(Error('이전 원고를 불러오지 못했습니다.'));
    });
  }
  async remove(id,expected){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['drafts','history'],'readwrite'),store=tx.objectStore('drafts'),read=store.get(id);let removed=false;
      read.onsuccess=()=>{if(sameVersion(read.result,expected)){store.delete(id);removed=true;const history=tx.objectStore('history'),entries=history.index('draftId').getAll(id);entries.onsuccess=()=>entries.result.forEach(entry=>history.delete(entry.key));}};
      tx.oncomplete=()=>resolve(removed);tx.onerror=tx.onabort=()=>reject(Error('임시 글을 삭제하지 못했습니다.'));
    });
  }
}
