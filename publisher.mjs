/* GitHub is the authenticated content store. Credentials stay in this instance's memory. */
const REPO = 'riex71/computer-study-blog';
export const LIVE = 'https://riex71.github.io/computer-study-blog/';
const enc = new TextEncoder(), dec = new TextDecoder();
export function base64(text) {
  const bytes = enc.encode(text); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function unbase64(value) { return dec.decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0))); }
export class GitHubPublisher {
  #token;
  constructor(token, branch = 'main') { this.#token = token; this.branch = branch; }
  disconnect() { this.#token = ''; }
  async request(path, method = 'GET', body) {
    if (!this.#token) throw Error('GitHub에 먼저 연결해 주세요.');
    let response;
    try {
      response = await fetch('https://api.github.com/repos/' + REPO + (path ? '/' + path : ''), {
        method, cache: 'no-store', signal: AbortSignal.timeout(30000),
        headers: { Authorization: 'Bearer ' + this.#token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw Error('GitHub에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); }
    if (!response.ok) {
      if (response.status === 401) throw Error('토큰이 만료됐거나 올바르지 않습니다. 다시 연결해 주세요.');
      if (response.status === 403) throw Error('저장소 쓰기 권한이 없습니다. 이 저장소의 Contents 읽기·쓰기 권한을 확인해 주세요.');
      if (response.status === 409 || response.status === 422) throw Error('저장소가 변경되었습니다. 원고를 내려받은 뒤 최신 글을 다시 불러와 주세요.');
      if (response.status === 404) throw Error('파일 또는 저장소에 접근할 수 없습니다. 토큰의 저장소 선택을 확인해 주세요.');
      throw Error('GitHub 요청에 실패했습니다 (' + response.status + '). 원고는 임시 저장되어 있습니다.');
    }
    return response.status === 204 ? null : response.json();
  }
  async connect() {
    const repo = await this.request('');
    if (!repo.permissions?.push) throw Error('이 계정에 블로그 저장소 쓰기 권한이 없습니다.');
    return repo;
  }
  async head() { return (await this.request('git/ref/heads/' + encodeURIComponent(this.branch))).object.sha; }
  async file(path, sha) {
    const result = await this.request('contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(sha));
    if (result.encoding !== 'base64' || typeof result.content !== 'string') throw Error('원고 파일을 읽을 수 없습니다.');
    return unbase64(result.content);
  }
  async publish(draft, html, onProgress = () => {}) {
    const slug = draft.post.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error('글 주소에는 영문 소문자, 숫자, 하이픈을 사용해 주세요.');
    onProgress('최신 원고 확인 중…');
    const base = await this.head();
    const commit = await this.request('git/commits/' + base);
    const posts = JSON.parse(await this.file('content/posts.json', base));
    const index = posts.findIndex(p => p.slug === slug), remote = posts[index];
    if (draft.original) {
      if (!remote || JSON.stringify(remote) !== JSON.stringify(draft.original.post)) throw Error('다른 곳에서 이 글의 정보가 수정되었습니다. 원고를 내려받고 최신 글을 다시 불러와 주세요.');
      const md = await this.file(remote.sourceMarkdown, base);
      if (md.trim() !== draft.original.markdown.trim()) throw Error('다른 곳에서 이 글의 본문이 수정되었습니다. 원고를 내려받고 최신 글을 다시 불러와 주세요.');
    } else if (remote) throw Error('이미 같은 주소의 글이 있습니다. 다른 글 주소를 정해 주세요.');
    const post = { ...draft.post, sourceHtml: 'content/articles/' + slug + '.html', sourceMarkdown: 'content/articles/' + slug + '.md' };
    if (remote) post.updated = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    if (index >= 0) posts[index] = post; else posts.push(post);
    posts.sort((a, b) => b.date.localeCompare(a.date));
    const files = [
      { path: post.sourceHtml, text: html + '\n' },
      { path: post.sourceMarkdown, text: draft.markdown + '\n' },
      { path: 'content/posts.json', text: JSON.stringify(posts, null, 2) + '\n' }
    ];
    onProgress('원고와 이미지 저장 중…');
    const tree = [];
    for (const file of files) {
      const blob = await this.request('git/blobs', 'POST', { content: base64(file.text), encoding: 'base64' });
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const image of draft.images || []) {
      if (!image.path.startsWith('assets/uploads/' + slug + '/') || !/^assets\/uploads\/[a-z0-9-]+\/[a-z0-9.-]+\.(?:png|jpg|webp)$/.test(image.path)) throw Error('첨부 이미지 경로가 올바르지 않습니다.');
      const blob = await this.request('git/blobs', 'POST', { content: image.base64, encoding: 'base64' });
      tree.push({ path: image.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.request('git/trees', 'POST', { base_tree: commit.tree.sha, tree });
    const next = await this.request('git/commits', 'POST', { message: (remote ? 'Update: ' : 'Publish: ') + post.title, tree: newTree.sha, parents: [base] });
    if (await this.head() !== base) throw Error('게시 준비 중 저장소에 새 변경이 생겼습니다. 다시 게시하면 최신 상태를 확인합니다.');
    onProgress('게시 요청 중…');
    // A non-force ref update rejects any concurrent branch advance.
    try {
      await this.request('git/refs/heads/' + encodeURIComponent(this.branch), 'PATCH', { sha: next.sha, force: false });
    } catch (error) {
      // A response can be lost after GitHub has accepted the update.
      if (await this.head().catch(() => null) !== next.sha) throw error;
    }
    return { sha: next.sha, post, html, markdown: draft.markdown, url: LIVE + 'posts/' + slug + '.html' };
  }
}
