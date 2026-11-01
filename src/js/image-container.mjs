/* PNG and RIFF/WebP chunk headers, not byte-string searches through image data. */
const text=(bytes,offset)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
export function imageContainer(bytes,type){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(type==='image/jpeg')return {animated:false};
 if(type==='image/png'){
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value))throw Error('PNG 헤더를 확인해 주세요.');
  let offset=8,animated=false,bitDepth;
  while(offset+12<=bytes.length){
   const length=view.getUint32(offset),name=text(bytes,offset+4),end=offset+12+length;
   if(end>bytes.length)throw Error('PNG 청크 길이가 올바르지 않습니다.');
   if(offset===8&&(name!=='IHDR'||length!==13))throw Error('PNG 이미지 정보가 없습니다.');
   if(name==='IHDR')bitDepth=bytes[offset+16];
   if(name==='acTL'){if(length!==8)throw Error('PNG 애니메이션 정보가 올바르지 않습니다.');animated=true;}
   if(name==='IEND')return {animated,bitDepth};
   offset=end;
  }
  throw Error('PNG 파일이 완전하지 않습니다.');
 }
 if(type==='image/webp'){
  if(bytes.length<20||text(bytes,0)!=='RIFF'||text(bytes,8)!=='WEBP')throw Error('WebP 헤더를 확인해 주세요.');
  const end=view.getUint32(4,true)+8;if(end>bytes.length||end<20)throw Error('WebP 파일 길이가 올바르지 않습니다.');
  let offset=12,animated=false;
  while(offset+8<=end){
   const name=text(bytes,offset),length=view.getUint32(offset+4,true),next=offset+8+length+(length&1);
   if(next>end)throw Error('WebP 청크 길이가 올바르지 않습니다.');
   if(name==='ANIM'){if(length!==6)throw Error('WebP 애니메이션 정보가 올바르지 않습니다.');animated=true;}
   if(name==='ANMF')animated=true;
   if(name==='VP8X'&&length>=10&&(bytes[offset+8]&2))animated=true;
   offset=next;
  }
  if(offset!==end)throw Error('WebP 파일이 완전하지 않습니다.');
  return {animated};
 }
 throw Error('지원하지 않는 이미지 형식입니다.');
}
