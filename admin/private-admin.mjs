export class SessionPublisher {
  #csrf;
  constructor(csrf, login) { this.#csrf = csrf; this.login = login; }
  static async connect() {
    const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000) }).catch(() => { throw Error('로그인을 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); });
    const session = await response.json().catch(() => ({ error:'로그인을 다시 확인해 주세요. 원고를 보관한 뒤 새로고침해 주세요.' }));
    if (!session.csrf && response.ok) throw Error(session.error);
    if (!response.ok) throw Error(session.error || '로그인을 확인하지 못했습니다.');
    return new SessionPublisher(session.csrf, session.login);
  }
  disconnect() { this.#csrf = ''; }
  async logout() {
    const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Admin-CSRF':this.#csrf},body:'{}'});
    if(!response.ok)throw Error('로그아웃을 완료하지 못했습니다. 원고를 보관한 뒤 다시 시도해 주세요.');
    this.disconnect();
  }
  async request(path, body) {
    const encoded=body?JSON.stringify(body):null;
    if(encoded&&new Blob([encoded]).size>12*1024*1024)throw Error('이번 게시 요청이 큽니다. 새로 첨부한 그림이나 본문 용량을 줄여 주세요.');
    const response = await fetch('/api/' + path, {
      method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
      signal: AbortSignal.timeout(120000),
      headers: body ? { 'Content-Type': 'application/json', 'X-Admin-CSRF': this.#csrf } : {},
      ...(body ? { body: encoded } : {})
    });
    const result = await response.json().catch(() => { throw Error('로그인을 다시 확인해 주세요. 원고를 보관한 뒤 새로고침해 주세요.'); });
    if (!response.ok) throw Error(result.error || '요청을 완료하지 못했습니다. 원고를 보관한 뒤 다시 로그인해 주세요.');
    return result;
  }
  async head() { return (await this.request('head')).sha; }
  async file(path, sha) { return (await this.request('file?path=' + encodeURIComponent(path) + '&ref=' + encodeURIComponent(sha))).text; }
  async publish(draft, html, onProgress = () => {}) {
    if (!this.#csrf) throw Error('다시 로그인해 주세요.');
    onProgress('원고를 확인하고 게시하는 중…');
    return this.request('publish', { draft: { post: draft.post, markdown: draft.markdown, images: (draft.images||[]).filter(image=>!image.published), original: draft.original }, html });
  }
}
