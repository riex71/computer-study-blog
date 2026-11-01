import {SessionPublisher} from './private-admin.mjs';
import {createPostManager} from './manage-posts.mjs';
import {connectMigration} from './migration.mjs';
import {LIVE} from './publisher.mjs';
const $=selector=>document.querySelector(selector);
export function createPrivateAdapter(){
 let manager;
 const adapter={publicBase:LIVE,renderPosts:posts=>manager?.render(posts)};
 adapter.reconnect=async api=>{
  const connected=await SessionPublisher.connect();api.setPublisher(connected);
  $('#connection-state').textContent=connected.login+' · 로그인됨';$('#connect-form').hidden=true;$('#token-help').hidden=true;
 };
 adapter.beforePublish=async api=>{
  let release;
  try{const response=await fetch(new URL('runtime.json?v='+Date.now(),LIVE),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok)release=await response.json();}catch{return;}
  if(release?.runtime&&api.runtime&&release.runtime!==api.runtime)throw Error('관리 화면과 공개 블로그의 버전이 다릅니다. 원고는 보관되어 있습니다. 배포 완료 후 새로고침해 주세요.');
 };
 adapter.initialize=async api=>{
  document.body.dataset.privateAdmin='true';
  const style=document.createElement('link');style.rel='stylesheet';style.href='manage-posts.css';document.head.append(style);
  const logout=document.createElement('button');logout.id='private-logout';logout.type='button';logout.className='writer-back';logout.textContent='로그아웃';$('#draft-status').before(logout);
  const migrate=document.createElement('button');migrate.id='private-migrate';migrate.type='button';migrate.textContent='이전 원고 옮기기';$('.library-footer').prepend(migrate);
  for(const selector of ['#connect-title','#manage-connection'])$(selector).textContent='로그인 정보';
  $('#connect-form').hidden=true;$('#token-help').hidden=true;
  manager=createPostManager({publisher:api.getPublisher,edit:api.edit,isBusy:api.isBusy,begin:api.beginManagement,end:api.endManagement,changed:api.applyPostState});
  connectMigration({button:migrate,store:api.store,publicURL:LIVE,authorize:async()=>{const session=await SessionPublisher.connect();session.disconnect();},beforeImport:async()=>{if(api.isBusy())throw Error('현재 작업이 끝난 뒤 원고를 옮겨 주세요.');await api.save();},onImport:api.imported,onError:error=>api.message(error.message)});
  addEventListener('pageshow',event=>{if(event.persisted)adapter.reconnect(api).catch(error=>api.message(error.message));});
  logout.addEventListener('click',async()=>{if(api.isBusy())return;try{await api.save();await api.getPublisher().logout();location.assign('/write.html');}catch(error){api.message(error.message);}});
  try{await adapter.reconnect(api);}catch(error){api.message(error.message+' 원고를 보관한 뒤 새로고침해 다시 로그인해 주세요.');throw error;}
 };
 return adapter;
}
