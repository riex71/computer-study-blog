/* Cross-origin transfer stays in the browser; no draft body is sent to a server. */
export function validateRecords(records){
 if(!Array.isArray(records)||records.length>500)throw Error('가져올 원고 목록을 확인해 주세요.');
 if(JSON.stringify(records).length>80*1024*1024)throw Error('원고 용량이 큽니다. 기존 원고를 파일로 내려받아 하나씩 가져와 주세요.');
 for(const record of records){
  const post=record?.post;
  if(typeof record?.id!=='string'||record.id.length>200||typeof record.markdown!=='string'||!post||!Array.isArray(post.topics)||!Array.isArray(post.tags)||!Array.isArray(record.images))throw Error('원고 형식을 확인하지 못했습니다. 원본은 변경하지 않았습니다.');
  for(const key of ['title','description','slug','date','category','thumbnail'])if(typeof post[key]!=='string')throw Error('원고 정보가 올바르지 않습니다.');
  for(const image of record.images)if(typeof image.path!=='string'||typeof image.base64!=='string'||!['image/png','image/jpeg','image/webp'].includes(image.type)||!/^[a-zA-Z0-9+/=]+$/.test(image.base64))throw Error('첨부 그림 정보를 확인하지 못했습니다.');
 }
 return records;
}
export async function importRecords(records,store,storage){
 validateRecords(records);const key='studybase.public-draft-copies';let receipts={};
 try{const value=JSON.parse(storage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))receipts=value;}catch{}
 const existing=new Set((await store.list()).map(r=>r.id));let imported=0,skipped=0;
 for(const original of records){
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(original)))),v=>v.toString(16).padStart(2,'0')).join('');
  if(existing.has(receipts[digest])){skipped++;continue;}
  const record=structuredClone(original);record.id=crypto.randomUUID();delete record.revision;delete record.recoveredFrom;delete record.deployment;record.savedAt=new Date().toISOString();
  const result=await store.save(record,null,{checkpoint:'이전 블로그에서 가져온 원고'});receipts[digest]=result.record.id;existing.add(result.record.id);imported++;
  try{storage.setItem(key,JSON.stringify(receipts));}catch{}
 }
 return {imported,skipped,total:records.length};
}
export function connectMigration({button,store,publicURL,authorize,beforeImport,onImport,onError}){
 const sourceOrigin=new URL(publicURL).origin;let popup,nonce,processing=false;
 button.addEventListener('click',()=>{
  nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  popup=window.open(new URL('draft-migration.html?nonce='+nonce,publicURL).href,'studybase-draft-migration');
  if(!popup)onError(Error('이전 원고 창을 열지 못했습니다. 팝업 설정을 확인해 주세요.'));
 });
 addEventListener('message',async event=>{
  if(!popup||event.source!==popup||event.origin!==sourceOrigin||event.data?.nonce!==nonce)return;
  if(event.data.type==='studybase-migration-ready'){
   try{await authorize();popup.postMessage({type:'studybase-migration-authorized',nonce},sourceOrigin);}catch(error){onError(error);}return;
  }
  if(event.data.type!=='studybase-drafts-transfer'||processing)return;processing=true;
  try{await authorize();validateRecords(event.data.records);await beforeImport();const result=await importRecords(event.data.records,store,localStorage);popup.postMessage({type:'studybase-migration-complete',nonce,count:result.total},sourceOrigin);await onImport(result);}
  catch(error){popup.postMessage({type:'studybase-migration-error',nonce},sourceOrigin);onError(error);}finally{processing=false;}
 });
}
