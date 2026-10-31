import test from 'node:test';
import assert from 'node:assert/strict';
import { ManagedPublisher } from '../post-management.mjs';
import { base64,unbase64 } from '../../publisher.mjs';
const post={slug:'test-article',title:'삭제 확인 글',date:'2026-10-31',tags:[],topics:[],sourceMarkdown:'content/articles/test-article.md',sourceHtml:'content/articles/test-article.html'};
function repository(){
 let head='a'.repeat(40),counter=0,heads=0,race=false,lose=false,reject=false;const calls=[],files=new Map([['content/posts.json',JSON.stringify([post])],['content/deleted-posts.json','[]'],[post.sourceMarkdown,'## 제목\n\n원문'],[post.sourceHtml,'<h2>제목</h2><p>원문</p>']]),blobs=new Map(),trees=new Map(),commits=new Map();
 const transport=async(url,init)=>{
  const path=new URL(url).pathname.replace('/repos/riex71/computer-study-blog/',''),body=init.body?JSON.parse(init.body):null;calls.push({path,body,method:init.method});let result;
  if(path==='git/ref/heads/main'){heads++;result={object:{sha:race&&heads>1?'f'.repeat(40):head}};}
  else if(path.startsWith('contents/')){const content=files.get(path.slice(9));if(content===undefined)return new Response('{}',{status:404});result={encoding:'base64',content:base64(content)};}
  else if(path.startsWith('git/commits/'))result={tree:{sha:'base-tree'}};
  else if(path==='git/blobs'){const sha='blob-'+(++counter);blobs.set(sha,unbase64(body.content));result={sha};}
  else if(path==='git/trees'){const sha='tree-'+(++counter);trees.set(sha,body.tree);result={sha};}
  else if(path==='git/commits'){const sha=String(++counter).padStart(40,'0');commits.set(sha,body);result={sha};}
  else if(path==='git/refs/heads/main'){assert.equal(body.force,false);if(reject)return new Response('{}',{status:422});head=body.sha;for(const file of trees.get(commits.get(head).tree))files.set(file.path,blobs.get(file.sha));if(lose)throw Error('lost response');result={object:{sha:head}};}
  else throw Error(path);
  return new Response(JSON.stringify(result));
 };
 return {publisher:new ManagedPublisher('fixture-token','main',transport),files,calls,set race(value){race=value;heads=0;},set lose(value){lose=value;},set reject(value){reject=value;}};
}
async function deletion(repo){const snapshot=await repo.publisher.snapshot(post.slug);return {slug:post.slug,title:post.title,fingerprint:snapshot.fingerprint,operationId:crypto.randomUUID()};}
test('delete is atomic, retains source for recovery, retries safely and restores original metadata',async()=>{const r=repository(),body=await deletion(r),result=await r.publisher.deletePost(body);assert.deepEqual(result.posts,[]);assert.equal(result.deleted.length,1);assert.equal(r.files.get(post.sourceMarkdown),'## 제목\n\n원문');assert.equal(r.calls.filter(c=>c.method==='PATCH').length,1);const retry=await r.publisher.deletePost(body);assert.equal(retry.sha,result.sha);assert.equal(r.calls.filter(c=>c.method==='PATCH').length,1);const restored=await r.publisher.restorePost({slug:post.slug,id:result.deleted[0].id,title:post.title});assert.deepEqual(restored.posts,[post]);assert.deepEqual(restored.deleted,[]);const trees=r.calls.filter(c=>c.path==='git/trees');assert.ok(trees.every(c=>c.body.tree.length===2));});
test('confirmation title and fingerprint prevent stale or altered deletion without any writes',async()=>{for(const mutate of [b=>b.title='잘못된 제목',b=>b.fingerprint='0'.repeat(64),()=>{}]){const r=repository(),body=await deletion(r);mutate(body);if(body.title===post.title&&body.fingerprint!=='0'.repeat(64))r.files.set(post.sourceMarkdown,'새 원문');await assert.rejects(()=>r.publisher.deletePost(body),/제목|변경/);assert.equal(r.calls.filter(c=>c.method!=='GET').length,0);}});
test('unrelated branch updates and non-fast-forward refusals never force a deletion',async()=>{for(const mode of ['race','reject']){const r=repository(),body=await deletion(r);r[mode]=true;await assert.rejects(()=>r.publisher.deletePost(body),/변경/);assert.deepEqual(JSON.parse(r.files.get('content/posts.json')),[post]);if(mode==='race')assert.equal(r.calls.filter(c=>c.method==='PATCH').length,0);}});
test('lost response after an accepted deletion is recovered without duplicate commits',async()=>{const r=repository(),body=await deletion(r);r.lose=true;const result=await r.publisher.deletePost(body);assert.equal(result.posts.length,0);assert.equal((await r.publisher.deletePost(body)).deleted.length,1);assert.equal(r.calls.filter(c=>c.method==='PATCH').length,1);});
test('publication checks the trash at its exact base commit and reserves deleted slugs',async()=>{const r=repository(),body=await deletion(r);await r.publisher.deletePost(body);const writes=r.calls.filter(c=>c.method!=='GET').length;await assert.rejects(()=>r.publisher.publish({post,markdown:'다시 게시',images:[]},'<p>본문</p>'),/휴지통/);assert.equal(r.calls.filter(c=>c.method!=='GET').length,writes);});
test('restore rejects stale trash entries, conflicting slugs and missing sources',async()=>{for(const mode of ['id','conflict','source']){const r=repository(),result=await r.publisher.deletePost(await deletion(r)),body={slug:post.slug,id:result.deleted[0].id,title:post.title};if(mode==='id')body.id='stale';if(mode==='conflict')r.files.set('content/posts.json',JSON.stringify([post]));if(mode==='source')r.files.delete(post.sourceMarkdown);const writes=r.calls.filter(c=>c.method!=='GET').length;await assert.rejects(()=>r.publisher.restorePost(body));assert.equal(r.calls.filter(c=>c.method!=='GET').length,writes);}});
test('invalid slugs and operation IDs cannot request arbitrary repository files',async()=>{const r=repository();for(const slug of ['../secrets','a/b','UPPER',''])await assert.rejects(()=>r.publisher.snapshot(slug));await assert.rejects(()=>r.publisher.deletePost({slug:post.slug,operationId:'x'}));assert.equal(r.calls.length,0);});
