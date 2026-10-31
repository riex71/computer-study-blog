import { HttpError } from './auth.mjs';
import { GitHubPublisher, base64, LIVE } from '../src/js/publisher.mjs';
const REGISTRY = 'content/deleted-posts.json';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fingerprint = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2,'0')).join('');
export class ManagedPublisher extends GitHubPublisher {
  async state() {
    const sha = await this.head();
    const [posts, deleted] = await Promise.all(['content/posts.json',REGISTRY].map(async path => JSON.parse(await this.file(path,sha))));
    if (!Array.isArray(posts) || !Array.isArray(deleted)) throw new HttpError(409,'글 목록을 읽지 못했습니다.');
    return { sha, posts, deleted };
  }
  async snapshot(slug) {
    this.validateSlug(slug);
    const state = await this.state(), post = state.posts.find(p => p.slug === slug);
    if (!post) throw new HttpError(409,'이미 삭제되었거나 없는 글입니다. 내 글 목록을 새로 열어 주세요.');
    const markdown = await this.file(post.sourceMarkdown, state.sha);
    return { post, fingerprint: await fingerprint([post,markdown]) };
  }
  validateSlug(slug) { if(typeof slug !== 'string' || slug.length > 100 || !slugPattern.test(slug)) throw new HttpError(409,'글 주소를 확인해 주세요.'); }
  async verifyPublicationAt(sha,draft) {
    const deleted = JSON.parse(await this.file(REGISTRY,sha));
    if (deleted.some(p => p.post.slug === draft.post.slug)) throw new HttpError(409,'휴지통에 있는 글 주소입니다. 내 글에서 먼저 복원하거나 새 글 주소를 사용해 주세요.');
  }
  async commitState(state, posts, deleted, message) {
    const parent = await this.request('git/commits/' + state.sha), tree = [];
    for(const [path,value] of [['content/posts.json',posts],[REGISTRY,deleted]]) {
      const blob = await this.request('git/blobs','POST',{encoding:'base64',content:base64(JSON.stringify(value,null,2)+'\n')});
      tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
    }
    const nextTree = await this.request('git/trees','POST',{base_tree:parent.tree.sha,tree});
    const next = await this.request('git/commits','POST',{message,tree:nextTree.sha,parents:[state.sha]});
    if(await this.head() !== state.sha) throw new HttpError(409,'작업 중 다른 변경이 생겼습니다. 목록을 새로 열어 다시 확인해 주세요.');
    try { await this.request('git/refs/heads/'+encodeURIComponent(this.branch),'PATCH',{sha:next.sha,force:false}); }
    catch(error) { if(await this.head().catch(()=>null) !== next.sha) throw error; }
    return next.sha;
  }
  async deletePost(body) {
    this.validateSlug(body?.slug);
    if(!/^[a-f0-9-]{36}$/.test(body.operationId || '') || !/^[a-f0-9]{64}$/.test(body.fingerprint || '')) throw new HttpError(409,'삭제 확인 화면을 다시 열어 주세요.');
    const state = await this.state(), previous = state.deleted.find(p => p.id === body.operationId && p.post.slug === body.slug);
    if(previous && body.title === previous.post.title && body.fingerprint === previous.fingerprint) return {sha:state.sha,posts:state.posts,deleted:state.deleted,slug:body.slug};
    const post = state.posts.find(p => p.slug === body.slug);
    if(!post || body.title !== post.title) throw new HttpError(409,'글 제목을 정확히 입력해 주세요. 이미 삭제된 글이라면 목록을 새로 열어 주세요.');
    if(await fingerprint([post,await this.file(post.sourceMarkdown,state.sha)]) !== body.fingerprint) throw new HttpError(409,'확인하는 동안 글이 변경되었습니다. 삭제 화면을 다시 열어 최신 글을 확인해 주세요.');
    const deleted = [...state.deleted,{id:body.operationId,post,deletedAt:new Date().toISOString(),fingerprint:body.fingerprint}];
    const posts = state.posts.filter(p => p.slug !== post.slug);
    const sha = await this.commitState(state,posts,deleted,'Move to trash: '+post.title);
    return {sha,posts,deleted,slug:post.slug,url:LIVE+'posts/'+post.slug+'.html'};
  }
  async restorePost(body) {
    this.validateSlug(body?.slug);
    const state = await this.state(), entry = state.deleted.find(p => p.post.slug === body.slug && p.id === body.id);
    if(!entry || entry.post.title !== body.title) throw new HttpError(409,'휴지통 목록이 변경되었습니다. 다시 열어 확인해 주세요.');
    if(state.posts.some(p => p.slug === body.slug)) throw new HttpError(409,'같은 주소의 공개 글이 있어 복원할 수 없습니다.');
    // Verify the preserved source exists before making the post public again.
    await this.file(entry.post.sourceMarkdown,state.sha);
    const posts = [...state.posts,entry.post].sort((a,b)=>b.date.localeCompare(a.date)), deleted = state.deleted.filter(p => p.id !== entry.id);
    const sha = await this.commitState(state,posts,deleted,'Restore: '+entry.post.title);
    return {sha,posts,deleted,slug:body.slug,url:LIVE+'posts/'+body.slug+'.html'};
  }
}
