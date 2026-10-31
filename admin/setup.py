"""One-time localhost GitHub App manifest setup. Secrets are never printed or saved."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlsplit, parse_qs, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import argparse, base64, hashlib, hmac, html, json, os, secrets, shutil, subprocess, time

HERE = Path(__file__).resolve().parent
OWNER_ID = 103800312
REPOSITORY_ID = 1397071826


def encode(value):
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def decode(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def build_manifest(origin, nonce, port=8768):
    return {
        'name': 'Studybase-riex71-admin', 'url': origin, 'public': False,
        'description': 'Private Markdown administration for riex71/computer-study-blog.',
        'hook_attributes': {'url': origin + '/github/webhook', 'active': False},
        'redirect_url': f'http://127.0.0.1:{port}/github/manifest',
        'callback_urls': [origin + '/auth/github/callback'],
        'setup_url': origin + '/auth/github/start?returnTo=' + quote('/setup/complete?nonce=' + nonce, safe=''),
        'request_oauth_on_install': False,
        'default_permissions': {'contents': 'write', 'metadata': 'read'},
        'default_events': []
    }


def verify_proof(proof, master, origin, nonce, now=None):
    head, body, signature = proof.split('.')
    header, payload = json.loads(decode(head)), json.loads(decode(body))
    key = hmac.new(decode(master), b'studybase-local-setup-proof-v1', hashlib.sha256).digest()
    expected = hmac.new(key, (head + '.' + body).encode(), hashlib.sha256).digest()
    stamp = time.time() if now is None else now
    if (header.get('alg') != 'HS256' or not hmac.compare_digest(expected, decode(signature))
            or payload.get('iss') != origin or payload.get('aud') != 'studybase-local-setup'
            or payload.get('nonce') != nonce or payload.get('sub') != str(OWNER_ID)
            or payload.get('login', '').lower() != 'riex71' or payload.get('repository') != REPOSITORY_ID
            or payload.get('canWrite') is not True or not isinstance(payload.get('exp'), int)
            or payload['exp'] < stamp or payload['exp'] > stamp + 180):
        raise ValueError('Invalid setup confirmation')
    return payload


class Cloudflare:
    def __init__(self, account, node):
        self.account, self.node = account, node
        env = os.environ.copy(); env['WRANGLER_SEND_METRICS'] = 'false'
        output = subprocess.run([node, 'node_modules/wrangler/bin/wrangler.js', 'auth', 'token', '--json'], cwd=HERE, env=env, capture_output=True, text=True, timeout=45)
        if output.returncode:
            raise RuntimeError('Cloudflare tool is not connected')
        try:
            token = json.loads(output.stdout)['token']
        except Exception:
            raise RuntimeError('Cloudflare authentication is unavailable') from None
        self.headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'Studybase-Admin-Setup'}

    def request(self, suffix, data=None, method=None):
        request = Request('https://api.cloudflare.com/client/v4/accounts/' + self.account + '/' + suffix,
                          data=json.dumps(data).encode() if data is not None else None, headers=self.headers, method=method)
        try:
            with urlopen(request, timeout=45) as response:
                result = json.load(response)
        except HTTPError as error:
            raise RuntimeError('Cloudflare API returned HTTP ' + str(error.code)) from None
        if not result.get('success'):
            raise RuntimeError('Cloudflare did not accept the configuration')
        return result.get('result')

    def secret(self, name, value):
        self.request('workers/scripts/studybase-admin/secrets', {'name': name, 'text': value, 'type': 'secret_text'}, 'PUT')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--account-id', required=True)
    parser.add_argument('--state-file', type=Path, default=HERE / '.wrangler/setup-state.json')
    args = parser.parse_args()
    node = os.environ.get('STUDYBASE_NODE') or shutil.which('node') or shutil.which('node.exe')
    if not node:
        raise RuntimeError('Node.js 24 is required')
    cfg_path = HERE / 'wrangler.jsonc'
    cfg = json.loads(cfg_path.read_text())
    origin = cfg['vars']['ADMIN_ORIGIN']
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or parsed.netloc != 'studybase-admin.dmcydh1804.workers.dev' or parsed.path:
        raise RuntimeError('Unexpected deployment origin')
    if not any(binding.get('binding') == 'SESSIONS' for binding in cfg.get('kv_namespaces', [])):
        raise RuntimeError('Session storage is not configured')
    cloud = Cloudflare(args.account_id, node)
    nonce, session_key, local_cookie = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    manifest = build_manifest(origin, nonce)
    progress = {'phase': 'ready', 'origin': origin, 'loginVerified': False, 'writePermissionVerified': False}
    registered = {}

    def save_state():
        state = json.loads(args.state_file.read_text()) if args.state_file.exists() else {}
        state['githubSetup'] = {**progress}
        if registered:
            state['githubApp'] = {key: registered[key] for key in ['id', 'slug', 'client_id', 'name']}
        args.state_file.parent.mkdir(parents=True, exist_ok=True)
        args.state_file.write_text(json.dumps(state, indent=2))

    def deploy_app():
        cloud.secret('SESSION_SECRET', session_key)
        cloud.secret('SETUP_NONCE', nonce)
        cloud.secret('GITHUB_CLIENT_SECRET', registered['client_secret'])
        cfg['vars']['GITHUB_CLIENT_ID'] = registered['client_id']
        cfg['vars']['GITHUB_APP_ID'] = str(registered['id'])
        cfg_path.write_text(json.dumps(cfg, indent=2) + '\n')
        env = os.environ.copy(); env.update(WRANGLER_SEND_METRICS='false', CLOUDFLARE_ACCOUNT_ID=args.account_id)
        result = subprocess.run([node, 'node_modules/wrangler/bin/wrangler.js', 'deploy'], cwd=HERE, env=env, capture_output=True, text=True, timeout=180)
        if result.returncode:
            raise RuntimeError('Deployment could not be completed')
        progress['phase'] = 'installed-credentials'
        save_state()
        print('GitHub App configuration deployed. Waiting for repository installation and owner login.', flush=True)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Callback codes and proofs must not enter request logs.

        def send(self, text, status=200, cookie=False):
            self.send_response(status)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Referrer-Policy', 'no-referrer')
            if cookie:
                self.send_header('Set-Cookie', 'studybase-setup=' + local_cookie + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600')
            self.end_headers()
            self.wfile.write(('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>블로그 GitHub 연결</title><style>body{max-width:620px;margin:10vh auto;padding:24px;font:16px/1.9 system-ui;color:#243329}h1{font-size:25px;font-weight:400}button,a{color:#275b41}button{padding:12px 18px;font:inherit;cursor:pointer}li{margin:8px 0}</style>' + text + '</html>').encode())

        def local_browser(self):
            try:
                jar = SimpleCookie(self.headers.get('Cookie', ''))
                value = jar.get('studybase-setup')
                return value is not None and hmac.compare_digest(value.value, local_cookie)
            except Exception:
                return False

        def installation(self):
            slug = registered['slug']
            address = 'https://github.com/apps/' + quote(slug, safe='') + '/installations/new?suggested_target_id=' + str(OWNER_ID)
            self.send('<h1>앱 등록이 완료됐습니다</h1><ol><li>아래에서 앱을 설치합니다.</li><li>Only select repositories를 고르고 <code>computer-study-blog</code> 하나만 선택합니다.</li><li>설치 후 GitHub 로그인을 승인합니다.</li><li>연결 확인 화면에서 확인을 누른 뒤 ‘설정 완료 알리기’를 누릅니다.</li></ol><p><a href="' + html.escape(address, quote=True) + '">GitHub에서 저장소 하나에 설치하기 ↗</a></p>')

        def do_GET(self):
            path = urlsplit(self.path); query = parse_qs(path.query)
            try:
                if self.headers.get('Host') != '127.0.0.1:8768':
                    self.send('<p>등록한 로컬 주소로 접속해 주세요.</p>', 403); return
                if path.path == '/':
                    if registered and progress['phase'] == 'installed-credentials':
                        self.installation(); return
                    if registered:
                        self.send('<p>등록 정보가 처리 중입니다. 잠시 뒤 새로고침해 주세요.</p>'); return
                    action = 'https://github.com/settings/apps/new?state=' + nonce
                    self.send('<h1>블로그 GitHub 연결</h1><p>riex71 계정에 본인 전용 앱을 등록합니다.</p><p>앱 권한은 저장소 콘텐츠 읽기·쓰기와 기본 메타데이터 읽기입니다. 다음 설치 화면에서 블로그 저장소 하나만 선택합니다.</p><form action="' + action + '" method="post"><input type="hidden" name="manifest" value="' + html.escape(json.dumps(manifest), quote=True) + '"><button type="submit">GitHub에서 앱 등록하기</button></form><p>비밀번호나 토큰을 이 화면이나 채팅에 입력할 필요가 없습니다.</p>', cookie=True)
                elif path.path == '/github/manifest':
                    if not self.local_browser() or not hmac.compare_digest(query.get('state', [''])[0], nonce):
                        self.send('<p>이 브라우저에서 연결을 다시 시작해 주세요.</p>', 403); return
                    if registered and progress['phase'] == 'installed-credentials':
                        self.installation(); return
                    code = query.get('code', [''])[0]
                    if not code or len(code) > 512:
                        self.send('<p>GitHub 등록 코드를 확인하지 못했습니다.</p>', 400); return
                    progress['phase'] = 'registering'; save_state()
                    request = Request('https://api.github.com/app-manifests/' + quote(code, safe='') + '/conversions', method='POST', headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'Studybase-Admin-Setup'})
                    with urlopen(request, timeout=30) as response:
                        data = json.load(response)
                    if data.get('owner', {}).get('id') != OWNER_ID or data.get('permissions', {}).get('contents') != 'write' or set(data.get('permissions', {})) - {'contents', 'metadata'}:
                        raise RuntimeError('Only the expected owner and permissions are accepted')
                    for key in ['pem', 'webhook_secret']:
                        data.pop(key, None)
                    registered.update({key: data[key] for key in ['id', 'slug', 'client_id', 'client_secret', 'name']})
                    progress['phase'] = 'registered'; save_state()
                    deploy_app()
                    self.installation()
                elif path.path == '/verified':
                    if not self.local_browser():
                        self.send('<p>이 브라우저에서 연결을 다시 시작해 주세요.</p>', 403); return
                    verify_proof(query.get('proof', [''])[0], session_key, origin, nonce)
                    progress.update(phase='verified', loginVerified=True, writePermissionVerified=True)
                    save_state()
                    try:
                        cloud.request('workers/scripts/studybase-admin/secrets/SETUP_NONCE', method='DELETE')
                    except Exception:
                        progress['temporaryNonceCleanupPending'] = True
                        save_state()
                    self.send('<h1>연결을 확인했습니다</h1><p>riex71 로그인과 블로그 저장소의 쓰기 권한을 확인했습니다. 공개 글은 변경하지 않았습니다.</p><p><a href="' + origin + '/write.html">관리 화면 열기 ↗</a></p><p>채팅으로 돌아가 연결 확인이 완료됐다고 알려주세요.</p>')
                    print('Verified: owner GitHub login and repository Contents write. No public article was changed.', flush=True)
                elif path.path == '/progress':
                    self.send('<pre>' + html.escape(json.dumps(progress, ensure_ascii=False, indent=2)) + '</pre>')
                else:
                    self.send('<p>페이지를 찾을 수 없습니다.</p>', 404)
            except Exception:
                progress['phase'] = 'needs-attention'; save_state()
                self.send('<h1>연결을 완료하지 못했습니다</h1><p>채팅에 오류 화면이 나왔다고 알려주세요. 비밀 값은 표시하거나 저장하지 않았습니다.</p>', 500)
                print('Setup needs attention; no credential details were logged.', flush=True)

    save_state()
    print('GitHub App setup is ready at http://127.0.0.1:8768/ . Awaiting user registration.', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8768), Handler).serve_forever()


if __name__ == '__main__':
    main()
