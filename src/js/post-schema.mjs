/* Shared by the editor, publication API and production build. */
export const POST_STRING_FIELDS=['slug','title','description','date','category','deck','shortTitle','thumbnail','thumbnailAlt','thumbnailCredit','thumbnailSource','socialImage','revisionNote','updated'];
export class PostValidationError extends Error {}
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function publicationFields(input){
  if(!input||typeof input!=='object'||!slugPattern.test(input.slug||'')||input.slug.length>100||typeof input.title!=='string'||!input.title.trim()||input.title.length>180||!validDate(input.date))throw new PostValidationError('글 제목·주소·작성일을 확인해 주세요.');
  const clean={};
  for(const key of POST_STRING_FIELDS){if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>2000)throw new PostValidationError('글 정보가 올바르지 않습니다: '+key);clean[key]=input[key];}}
  if(clean.updated&&!validDate(clean.updated))throw new PostValidationError('수정일을 확인해 주세요.');
  for(const key of ['topics','tags']){if(!Array.isArray(input[key])||input[key].length>20||input[key].some(value=>typeof value!=='string'||value.length>200))throw new PostValidationError('글의 주제와 태그를 확인해 주세요.');clean[key]=[...new Set(input[key].map(v=>v.trim()).filter(Boolean))];}
  for(const key of ['thumbnail','socialImage'])if(clean[key]&&!/^(?:assets\/[a-zA-Z0-9_./-]+|https:\/\/[^\s<>"']+)$/.test(clean[key]))throw new PostValidationError('이미지에는 assets/ 경로나 https 주소를 사용해 주세요.');
  for(const key of ['thumbnail','socialImage'])if(clean[key]?.includes('..'))throw new PostValidationError('이미지 경로를 확인해 주세요.');
  if(clean.thumbnailSource&&!/^https:\/\/[^\s<>"']+$/.test(clean.thumbnailSource))throw new PostValidationError('이미지 출처는 https 주소를 사용해 주세요.');
  return clean;
}
export function normalizePost(input){
  const clean=publicationFields(input),slug=clean.slug;
  for(const [key,suffix] of [['sourceMarkdown','md'],['sourceHtml','html']])if(input[key]&&input[key]!=='content/articles/'+slug+'.'+suffix)throw new PostValidationError('글 원고 경로를 확인해 주세요.');
  return {...input,...clean,description:clean.description||'',category:clean.category||'공부 노트',socialImage:shareImage({...input,...clean}),sourceMarkdown:'content/articles/'+slug+'.md',sourceHtml:'content/articles/'+slug+'.html'};
}
export function validatePostList(posts){
  if(!Array.isArray(posts))throw new PostValidationError('글 목록 형식이 올바르지 않습니다.');
  const normalized=posts.map(normalizePost);
  if(new Set(normalized.map(post=>post.slug)).size!==normalized.length)throw new PostValidationError('중복된 글 주소가 있습니다.');
  return normalized;
}
export function shareImage(post){
  const image=post.socialImage||post.thumbnail||'assets/social-cover.png';
  return /\.svg(?:[?#]|$)/i.test(image)?'assets/social-cover.png':image;
}
