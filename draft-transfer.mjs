/* The old origin releases its local drafts only to the fixed, authenticated admin opener. */
import { DraftStore } from './draft-store.mjs';
const origin=document.body.dataset.adminOrigin,nonce=new URLSearchParams(location.search).get('nonce'),peer=window.opener;
const button=document.getElementById('transfer-drafts'),status=document.getElementById('transfer-status');
let authorized=false,sending=false;
if(!peer||!/^[a-f0-9]{64}$/.test(nonce||''))status.textContent='로그인한 관리 화면의 ‘이전 원고 옮기기’에서 열어 주세요.';
else{
 addEventListener('message',event=>{
  if(event.origin!==origin||event.source!==peer||event.data?.nonce!==nonce)return;
  if(event.data.type==='studybase-migration-authorized'){authorized=true;button.disabled=false;status.textContent='본인 로그인을 확인했습니다. 원본을 남기고 사본을 보냅니다.';}
  if(event.data.type==='studybase-migration-complete'){status.textContent=event.data.count+'개 원고를 확인했습니다. 원본은 이 브라우저에 그대로 남아 있습니다.';button.disabled=true;}
  if(event.data.type==='studybase-migration-error'){status.textContent='사본을 가져오지 못했습니다. 원본은 그대로 남아 있습니다. 관리 화면에서 다시 시도해 주세요.';button.disabled=false;sending=false;}
 });
 peer.postMessage({type:'studybase-migration-ready',nonce},origin);
}
button.addEventListener('click',async()=>{
 if(!authorized||sending)return;sending=true;button.disabled=true;
 try{const records=await new DraftStore().list();status.textContent=records.length+'개 원고의 사본을 보내는 중입니다…';peer.postMessage({type:'studybase-drafts-transfer',nonce,records},origin);}
 catch{status.textContent='원고 저장소를 열지 못했습니다. 원본은 변경하지 않았습니다.';sending=false;button.disabled=false;}
});
