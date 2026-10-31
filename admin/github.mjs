import { HttpError } from './auth.mjs';
export const OWNER_ID = 103800312;
export const OWNER_LOGIN = 'riex71';
export const REPOSITORY_ID = 1397071826;
export const REPOSITORY = 'riex71/computer-study-blog';
export async function github(path, token, fetchImpl = fetch, body, method = body ? 'POST' : 'GET') {
  if (!path.startsWith('/') || path.startsWith('//')) throw new HttpError(400, '잘못된 GitHub 요청입니다.');
  let response;
  try { response = await fetchImpl('https://api.github.com' + path, {
    method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'Studybase-Private-Admin', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? {body:JSON.stringify(body)} : {})
  }); } catch { throw new HttpError(502, 'GitHub에 연결하지 못했습니다. 원고를 보관하고 다시 시도해 주세요.'); }
  if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 502, 'GitHub 로그인을 다시 확인해 주세요. 원고는 그대로 남아 있습니다.');
  return response.status === 204 ? null : response.json();
}
export async function verifyGitHubOwner(token, env, fetchImpl = fetch, installation = false) {
  const user = await github('/user', token, fetchImpl);
  if (user.id !== OWNER_ID || user.login?.toLowerCase() !== OWNER_LOGIN) throw new HttpError(403, 'riex71 계정만 관리 화면을 사용할 수 있습니다.');
  if (installation) {
    const {installations=[]} = await github('/user/installations', token, fetchImpl);
    const app = installations.find(i => String(i.app_id) === String(env.GITHUB_APP_ID) && i.account?.id === OWNER_ID && i.permissions?.contents === 'write');
    if (!app) throw new HttpError(403, 'GitHub 앱을 computer-study-blog 저장소에 먼저 설치해 주세요.');
    const {repositories=[]} = await github('/user/installations/' + app.id + '/repositories', token, fetchImpl);
    if (!repositories.some(repo => repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY)) throw new HttpError(403, 'GitHub 앱에 블로그 저장소를 선택해 주세요.');
  }
  return {id:user.id,login:user.login};
}
