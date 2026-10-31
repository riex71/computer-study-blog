# 본인 전용 GitHub 관리 화면

공개 글은 기존 GitHub Pages 주소에서 제공하고, 작성·수정·게시 화면은 본인의 Cloudflare Workers 계정에 별도로 배포합니다. Sites와 Cloudflare Access를 사용하지 않습니다. 도메인을 구매하거나 Cloudflare Access의 결제수단을 등록하지 않고 `workers.dev` 주소와 GitHub 앱 로그인을 사용합니다.

## 접근과 게시 권한

- 로그인 시 계정 이름뿐 아니라 GitHub 사용자 ID `103800312`가 `riex71`과 일치하는지 확인합니다.
- GitHub 앱은 본인에게만 공개하며 설치할 때 `computer-study-blog` 저장소 하나만 선택합니다. 콘텐츠 읽기·쓰기와 기본 메타데이터 읽기만 요청합니다. 사용자 토큰도 해당 저장소 ID로 제한합니다.
- OAuth는 임의의 state, 브라우저 쿠키, S256 PKCE를 함께 검사합니다. 다른 브라우저의 콜백과 완료한 코드의 재사용을 거부합니다.
- 브라우저 쿠키에는 임의의 세션 ID만 들어갑니다. `Secure`, `HttpOnly`, `SameSite=Lax`, `__Host-` 제한을 사용합니다. GitHub 토큰은 서버의 KV에 암호화해서 보관하고 4시간 이내에 세션을 만료합니다. GitHub가 발급하는 갱신 토큰은 보관하지 않습니다.
- 모든 편집 HTML·JS·그림과 API에서 세션을 검사합니다. 정적 파일이 인증보다 먼저 나가지 않도록 `run_worker_first: true`를 사용합니다. 별도 배포 미리보기 주소는 끕니다.
- 게시 전에는 같은 출처, 세션별 CSRF, 현재 GitHub 사용자와 저장소 쓰기 권한을 다시 확인합니다. 기존 게시기의 원고 충돌 검사와 non-force 커밋을 사용합니다.
- Cloudflare Workers Secret에는 `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`을 저장합니다. 소스·채팅·배포 설정에 비밀 값을 넣지 않습니다.

## 최초 연결

1. 본인 Cloudflare 계정을 만들고 Wrangler를 연결합니다. 기존 `workers.dev` 주소와 세션 저장용 KV 네임스페이스를 준비합니다. `wrangler.jsonc`에는 실제 `ADMIN_ORIGIN`과 `SESSIONS` 바인딩의 네임스페이스 ID를 넣습니다. OAuth 설정이 빠져 있으면 화면과 API 모두 차단됩니다.
2. 이 폴더에서 `npm ci --ignore-scripts`, `python3 build.py`, `npm test`, `npm run check:bundle`을 실행합니다. Node.js 24.15+가 필요합니다.
3. `python3 setup.py --account-id <본인 Cloudflare 계정 ID>`를 실행하고 `http://127.0.0.1:8768/`을 엽니다. `STUDYBASE_NODE`로 Node 실행 파일을 지정할 수 있습니다. 이 로컬 연결 도구는 GitHub에서 받은 비밀 값을 메모리에서 Cloudflare Secret으로 전달하고 소스나 로그에 남기지 않습니다.
4. `riex71` 계정으로 GitHub 앱을 등록하고, 설치 화면에서 `Only select repositories` → `computer-study-blog` 하나만 선택합니다. GitHub 등록·설치·로그인은 본인이 직접 승인합니다.
5. 설치가 끝나면 GitHub로 로그인하고 ‘연결 확인’을 누릅니다. 서버는 현재 글을 바꾸지 않고 참조되지 않는 검사 blob 하나를 만들어 실제 콘텐츠 쓰기 권한을 확인합니다. 브랜치나 공개 글은 갱신하지 않습니다. ‘설정 완료 알리기’를 눌러 로컬 도구에 서명된 확인 결과를 전달합니다. 이 결과에는 GitHub 토큰이 들어 있지 않습니다.
6. 확인이 끝나면 임시 확인용 `SETUP_NONCE` Secret을 제거합니다. 공개 블로그의 작성 주소는 아직 전환하지 않습니다.

로컬 연결 도구는 `127.0.0.1`에서만 열립니다. GitHub 콜백의 state와 로컬 브라우저 쿠키를 검사하며 요청 URL의 코드나 확인 결과를 로그에 남기지 않습니다. GitHub 앱의 개인 키와 웹훅 비밀은 사용하지 않고 버립니다. 실행 중인 로컬 도구를 종료하면 전달 중인 비밀 값도 메모리에서 사라집니다.

## 기존 원고 보존과 공개 작성 주소 전환

기존 브라우저 원고는 GitHub Pages 주소의 IndexedDB에 있습니다. 새 관리 화면의 ‘내 글’ → ‘이전 원고 옮기기’에서 별도 창을 열고 사본을 가져옵니다. 두 창은 고정된 출처·창 참조·임의 nonce를 확인하고, 현재 관리자 로그인까지 다시 확인한 뒤에만 원고를 전달합니다. 본문과 그림은 브라우저의 두 창 사이에서만 이동하며 서버로 올리지 않습니다. 원본은 지우지 않고, 이미 가져온 원고를 다시 가져와도 수정 중인 사본을 덮어쓰지 않습니다. JSON으로 내려받은 개별 원고는 기존 ‘원고 가져오기’도 사용할 수 있습니다.

실제 로그인과 게시 권한 및 사본 이전 기능의 원본 보존을 확인한 뒤 GitHub 저장소 Actions Variables에 `BLOG_ADMIN_URL`을 실제 Worker 기본 주소로 등록하고 Pages 워크플로를 실행합니다. 공개 `write.html`은 편집 기능 없이 비공개 관리 화면으로 안내하는 페이지가 됩니다. 글의 기존 수정 링크는 유지합니다. 문제가 있으면 변수를 비우고 재배포해 기존 편집기를 복원할 수 있습니다.

이 패키지는 인증과 작성·수정·게시를 위한 것입니다. 공개 글 삭제 기능을 새로 추가한 변경은 아닙니다. 공개 GitHub 저장소에 커밋한 내용은 Git 이력에도 남습니다.

## 검증

```
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
python3 build.py
npm run check:bundle
```

브라우저 검사는 별도 프로필과 로컬 모의 GitHub API만 사용합니다. `node tests/browser-server.mjs`로 격리된 서버를 띄우고 `node tests/browser.cjs`로 검사합니다. Playwright 경로는 `PLAYWRIGHT_MODULE`로 지정합니다. 실제 사용자의 초안과 공개 글은 바꾸지 않습니다. 테스트 인증 우회 옵션은 운영 Worker에 없습니다.

`dist/`, `.bundle/`, `.wrangler/`, `.dev.vars*`는 Git과 공개 Pages 배포에서 제외합니다. GitHub 앱 ID와 클라이언트 ID, KV 네임스페이스 ID는 비밀 값이 아닙니다.

공식 문서: [GitHub 앱 매니페스트](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest), [사용자 OAuth 토큰과 PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [Workers 기본 주소](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
