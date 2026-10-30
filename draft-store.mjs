/* Compare and write inside one IndexedDB transaction, including legacy drafts. */
export const draftVersion = record => record ? {revision:Number(record.revision)||0,savedAt:record.savedAt||''} : null;
const sameVersion = (record,expected) => record ? !!expected && (Number(record.revision)||0)===expected.revision && (record.savedAt||'')===expected.savedAt : !expected;
export class DraftStore {
  constructor(){
    this.ready=new Promise((resolve,reject)=>{
      const request=indexedDB.open('studybase.writer.v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
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
  async save(snapshot,expected){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),read=store.get(snapshot.id);let result;
      read.onsuccess=()=>{
        const stored=read.result,conflict=!sameVersion(stored,expected),record=structuredClone(snapshot);
        if(conflict){record.recoveredFrom=snapshot.id;record.id=crypto.randomUUID();}
        record.revision=conflict?1:(Number(stored?.revision)||0)+1;
        store.put(record);result={record,conflict,previous:stored};
      };
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('임시 글을 저장하지 못했습니다.'));
    });
  }
  async remove(id,expected){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),read=store.get(id);let removed=false;
      read.onsuccess=()=>{if(sameVersion(read.result,expected)){store.delete(id);removed=true;}};
      tx.oncomplete=()=>resolve(removed);tx.onerror=tx.onabort=()=>reject(Error('임시 글을 삭제하지 못했습니다.'));
    });
  }
}
