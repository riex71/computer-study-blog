# 별도 비공개 관리 화면

이 패키지는 Sites를 사용하지 않고 본인의 Cloudflare Workers 계정에 배포합니다. 공개 블로그 주소와 글 원본 저장소는 그대로 둡니다. 아직 Cloudflare 계정이 연결되지 않았으므로 현재 공개 작성 화면에는 적용되지 않았습니다.

관리 화면의 모든 HTML·JS·그림·API 요청은 Cloudflare Access JWT의 서명, 발급자, 앱 대상, 만료 시각과 소유자 이메일을 검사합니다. 설정이 빠져 있으면 화면도 제공하지 않습니다. 정적 파일도 Worker보다 먼저 응답하지 않도록 `run_worker_first: true`를 사용합니다. 별도 배포 미리보기 주소는 끕니다.

GitHub 게시 토큰은 Worker Secret에만 저장합니다. 브라우저에는 전달하거나 저장하지 않습니다. 서버에서 GitHub 계정이 `riex71`인지와 저장소 쓰기 권한을 확인하고, 기존 게시기의 충돌 검사와 non-force 커밋을 사용합니다. 요청은 같은 출처와 세션에 묶인 CSRF 검사를 통과해야 합니다.

## 계정 생성 후 연결 순서

1. [Cloudflare 계정](https://dash.cloudflare.com/sign-up)을 만듭니다. 개인 도메인은 구매하지 않아도 됩니다. 개인 관리 용도로는 기본 `workers.dev` 주소에서 시작할 수 있습니다. 요금제와 가입 화면의 조건은 계정 생성 시 확인합니다.
2. Node.js 24.15+ 환경에서 이 폴더에서 `npm ci --ignore-scripts`, `python3 build.py`, `npx wrangler login`을 실행합니다. 첫 `npx wrangler deploy`는 인증 값이 비어 있으므로 모든 화면과 API가 503으로 차단됩니다. 배포된 `https://studybase-admin.<계정>.workers.dev` 주소를 기록합니다.
3. Cloudflare 대시보드의 Worker Settings → Domains & Routes에서 해당 `workers.dev` 주소에 Cloudflare Access를 설정합니다. Cloudflare One 팀을 만들고, 앱 전체 경로에 Allow 정책을 적용하며 Include → Emails에는 본인 이메일 한 개만 넣습니다. Everyone, Bypass 정책은 넣지 않습니다. 기본 One-time PIN 로그인으로 시작할 수 있습니다. 본인 이메일로 받은 코드로 로그인합니다. GitHub 로그인은 나중에 연결할 수 있습니다.
4. Access 앱의 Application Audience (AUD)와 팀 도메인 `https://<team>.cloudflareaccess.com`, 실제 Worker 기본 주소를 `wrangler.jsonc`의 `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `ADMIN_ORIGIN`에 넣습니다. `ADMIN_ORIGIN`에는 뒤의 `/`나 경로를 넣지 않습니다. 이메일은 `npx wrangler secret put OWNER_EMAIL`로 등록합니다. 위 Access 정책의 이메일과 같아야 합니다.
5. GitHub에서 [fine-grained 토큰](https://github.com/settings/personal-access-tokens/new)을 만듭니다. Resource owner는 riex71, 저장소는 computer-study-blog 하나, Contents는 Read and write로 제한합니다. `npx wrangler secret put GITHUB_TOKEN`의 비공개 입력란에 등록하고 다시 `npx wrangler deploy`를 실행합니다. 토큰을 채팅이나 원고, Git 파일에 붙여넣지 않습니다.
6. 로그아웃한 창에서는 작성 화면과 API에 접근하지 못하고, 본인 로그인 후에는 작성·미리보기·저장·게시가 되는지 실제 주소에서 확인합니다. 만료·권한 실패 때는 원고가 그대로 남습니다. 연결 정보가 유효해지기 전에는 공개 작성 주소를 전환하지 않습니다.

## 기존 임시 원고를 보존하고 공개 작성 주소 전환하기

브라우저 임시 원고는 주소별 IndexedDB에 있습니다. 공개 블로그의 초안이 새 관리 주소로 자동 이동하지 않습니다.

1. 기존 작성 화면의 ‘내 글’에서 보관할 원고마다 ‘현재 원고 내려받기’로 JSON을 보관합니다. 새 관리 화면의 ‘내 글’ → ‘원고 가져오기’로 불러와 본문·그림·미리보기와 저장 후 새로고침을 확인합니다. 원래 브라우저의 원고는 자동 삭제하지 않습니다.
2. 비공개 관리 주소의 실제 인증·게시와 원고 보존을 확인한 뒤 GitHub 저장소 Settings → Secrets and variables → Actions → Variables에 `BLOG_ADMIN_URL`을 추가합니다. 값은 확인한 Worker 기본 주소입니다. 이것은 비밀 값이 아닙니다.
3. ‘Build and deploy blog’ 워크플로를 다시 실행합니다. 기존 공개 `write.html`은 편집 기능 없이 비공개 관리 화면으로 안내하는 페이지가 됩니다. 공개 글의 수정 링크는 그대로 쓰며 대상 글 주소를 넘깁니다. 이전 초안 ID는 다른 주소로 넘기지 않습니다.
4. 문제가 있으면 `BLOG_ADMIN_URL`을 비우고 워크플로를 다시 실행해 기존 편집기를 복원할 수 있습니다. GitHub의 글 원본과 기존 브라우저 초안은 유지됩니다.

이 연결 패키지는 인증과 작성·수정·게시를 위한 것입니다. 공개 글을 삭제하는 새 기능은 포함하지 않습니다. 원고의 기준은 여전히 GitHub의 Markdown이며, 공개 저장소에 커밋한 내용은 Git 이력에도 남습니다.

## 개발 및 검증

```
npm ci --ignore-scripts
python3 build.py
npm test
npm run check:bundle
```

`dist/`, `.bundle/`, `.wrangler/`, `.dev.vars*`는 Git과 공개 Pages 배포에서 제외합니다. 테스트는 실제 RSA 서명 토큰과 별도 로컬 키를 사용하며, GitHub 게시 API는 모의 응답으로만 검사합니다. 테스트용 인증 우회 옵션은 운영 Worker에 없습니다.

공식 문서: [workers.dev와 접근 제한](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Access JWT 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [이메일 일회용 코드](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
