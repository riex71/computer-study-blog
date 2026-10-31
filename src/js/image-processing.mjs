/* Optimize before upload; every article uses the same explicit image policy. */
const TYPES=['image/png','image/jpeg','image/webp'];
export const MAX_IMAGE_BYTES=5*1024*1024;
export async function processImage(file,{mode='lossless',maxEdge=2400}={}) {
  if(!TYPES.includes(file.type)||file.size>20*1024*1024)throw Error('PNG·JPG·WebP 그림을 20MB 이하로 선택해 주세요.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!valid)throw Error('이미지 파일 형식을 확인해 주세요.');
  const animated=file.type==='image/png'?new TextDecoder('latin1').decode(bytes).includes('acTL'):file.type==='image/webp'&&new TextDecoder('latin1').decode(bytes).includes('ANIM');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw Error('손상되었거나 지원하지 않는 이미지입니다.');}
  try{
    const {width,height}=bitmap;
    if(!width||!height||width*height>40_000_000)throw Error('그림 해상도를 줄여 주세요. 최대 4천만 화소까지 처리합니다.');
    let blob=file,outWidth=width,outHeight=height;
    const lossless=mode==='lossless'&&file.type==='image/png'&&bytes[24]!==16&&file.size>128*1024;
    if(!animated&&(lossless||mode==='webp')){
      const ratio=mode==='webp'?Math.min(1,maxEdge/Math.max(width,height)):1;
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const context=canvas.getContext('2d');
      if(!context)throw Error('이 브라우저에서는 그림을 최적화할 수 없습니다. 원본 유지로 첨부해 주세요.');
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const candidate=await new Promise(resolve=>canvas.toBlob(resolve,lossless?'image/png':'image/webp',.88));
      if(candidate&&candidate.size<file.size&&candidate.type===(lossless?'image/png':'image/webp')){blob=candidate;outWidth=canvas.width;outHeight=canvas.height;}
      canvas.width=canvas.height=0;
    }
    if(blob.size>MAX_IMAGE_BYTES)throw Error('저장할 그림은 5MB 이하여야 합니다. 설정에서 ‘사진·용량 우선’을 선택하거나 그림 크기를 줄여 주세요.');
    return {blob,width:outWidth,height:outHeight,originalBytes:file.size,outputBytes:blob.size,optimized:blob!==file};
  }finally{bitmap.close();}
}
export async function encodeImage(result,slug){
  const bytes=new Uint8Array(await result.blob.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const ext=result.blob.type==='image/jpeg'?'jpg':result.blob.type.split('/')[1];
  return {path:'assets/uploads/'+slug+'/'+hash+'.'+ext,type:result.blob.type,base64:btoa(binary),width:result.width,height:result.height};
}
