import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubPublisher, base64, unbase64 } from '../src/js/publisher.mjs';
const post = { slug:'sample-note', title:'한글 원고', date:'2026-10-30', topics:['메모리'], tags:['AI'], sourceHtml:'content/articles/sample-note.html', sourceMarkdown:'content/articles/sample-note.md' };
function server({ posts = [], files = {}, race = false, rejectRef = false, loseRefResponse = false } = {}) {
  const original = globalThis.fetch, calls = []; let head = 'base', heads = 0;
  globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith('https://api.github.com/repos/riex71/computer-study-blog'));
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const path = new URL(url).pathname.replace(/^\/repos\/riex71\/computer-study-blog\/?/, '');
    const body = init.body ? JSON.parse(init.body) : null; calls.push({path,method:init.method,body});
    let result;
    if (path==='') result={permissions:{push:true}};
    else if (path==='git/ref/heads/main') { heads++; result={object:{sha:race && heads>1 ? 'concurrent' : head}}; }
    else if (path==='git/commits/base') result={tree:{sha:'old-tree'}};
    else if (path==='contents/content/posts.json') result={encoding:'base64',content:base64(JSON.stringify(posts))};
    else if (path.startsWith('contents/')) result={encoding:'base64',content:base64(files[path.slice(9)] || '')};
    else if (path==='git/blobs') result={sha:'blob-'+calls.length};
    else if (path==='git/trees') result={sha:'new-tree'};
    else if (path==='git/commits') result={sha:'new-commit'};
    else if (path==='git/refs/heads/main') {
      assert.equal(body.force,false);
      if(rejectRef) return new Response('{}',{status:422});
      head=body.sha;
      if(loseRefResponse) throw Error('connection lost after accept');
      result={object:{sha:head}};
    } else throw Error('Unexpected endpoint '+path);
    return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {calls,restore:()=>{globalThis.fetch=original},head:()=>head};
}
test('UTF-8 source round-trips without changing Korean or math',()=>assert.equal(unbase64(base64('기억 ∑ α 🙂')),'기억 ∑ α 🙂'));
test('connects to the repository URL without a trailing slash and disconnects',async()=>{
 const api=server();try{
  const publisher=new GitHubPublisher('test-token');await publisher.connect();publisher.disconnect();
  await assert.rejects(()=>publisher.head(),/먼저 연결/);assert.equal(api.calls.length,1);
 }finally{api.restore()}
});
test('publishes sources, metadata and raster image atomically',async()=>{
 const api=server();try{
  await new GitHubPublisher('test-token').publish({post,markdown:'## 기억\n\n본문',images:[{path:'assets/uploads/sample-note/figure.png',base64:'AQID'}]},'<h2>기억</h2><p>본문</p>');
  const tree=api.calls.find(c=>c.path==='git/trees').body;
  assert.ok(!tree.tree.some(file=>file.path.endsWith('.html')));assert.equal(tree.base_tree,'old-tree');assert.equal(tree.tree.length,3);assert.equal(api.head(),'new-commit');
  assert.deepEqual(api.calls.find(c=>c.path==='git/commits').body.parents,['base']);
 }finally{api.restore()}
});
test('refuses a newer version of the same article before creating blobs',async()=>{
 const api=server({posts:[post],files:{[post.sourceMarkdown]:'new remote text',[post.sourceHtml]:'<p>old</p>'}});try{
  await assert.rejects(()=>new GitHubPublisher('test-token').publish({post,markdown:'local edit',images:[],original:{post,markdown:'old text',html:'<p>old</p>'}},'<p>edit</p>'),/본문/);
  assert.equal(api.calls.filter(c=>c.method==='POST'||c.method==='PATCH').length,0);
 }finally{api.restore()}
});
test('a branch advance during preparation never updates the ref',async()=>{
 const api=server({race:true});try{
  await assert.rejects(()=>new GitHubPublisher('test-token').publish({post,markdown:'text',images:[]},'<p>text</p>'),/새 변경/);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,0);assert.equal(api.head(),'base');
 }finally{api.restore()}
});
test('Markdown-only repository edits can be published without depending on a stale HTML cache',async()=>{
 const api=server({posts:[post],files:{[post.sourceMarkdown]:'latest Markdown',[post.sourceHtml]:'<p>stale generated cache</p>'}});try{
  const result=await new GitHubPublisher('test-token').publish({post,markdown:'next Markdown',images:[],original:{post,markdown:'latest Markdown',html:'<p>current rendered Markdown</p>'}},'<p>next Markdown</p>');
  assert.equal(result.sha,'new-commit');assert.equal(api.calls.some(c=>c.path.startsWith('contents/'+post.sourceHtml)),false);
 }finally{api.restore()}
});
test('a race after the last check is rejected with no force update',async()=>{
 const api=server({rejectRef:true});try{
  await assert.rejects(()=>new GitHubPublisher('test-token').publish({post,markdown:'text',images:[]},'<p>text</p>'),/변경/);
  assert.equal(api.head(),'base');assert.equal(api.calls.find(c=>c.method==='PATCH').body.force,false);
 }finally{api.restore()}
});
test('recovers an accepted commit when the update response is lost',async()=>{
 const api=server({loseRefResponse:true});try{
  const result=await new GitHubPublisher('test-token').publish({post,markdown:'text',images:[]},'<p>text</p>');
  assert.equal(result.sha,'new-commit');assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);
 }finally{api.restore()}
});

test('already-published image bytes are not uploaded again',async()=>{
 const api=server();try{await new GitHubPublisher('test-token').publish({post,markdown:'본문',images:[{path:'assets/uploads/sample-note/old.png',base64:'AQID',published:'old-commit'}]},'<p>본문</p>');const tree=api.calls.find(c=>c.path==='git/trees').body.tree;assert.deepEqual(tree.map(f=>f.path).sort(),['content/articles/sample-note.md','content/posts.json']);}finally{api.restore()}
});
