# Studybase

원 논문의 구조와 실험 조건을 읽고 정리하는 한국어 AI 공부 블로그입니다.

[공개 블로그](https://riex71.github.io/computer-study-blog/) · [글쓰기](https://riex71.github.io/computer-study-blog/write.html)

## 읽기

홈은 최근 글 목록과 짧은 소개로 구성합니다. 별도 아카이브에서 본문 검색·주제 필터·정렬·저장한 글을 제공합니다. 읽기 가이드는 소개의 ‘논문 이어 읽기’로 엽니다. 공개 페이지 어디에서든 Ctrl/Command K로 검색합니다. 글에는 목차·진행률·그림 확대·글자 크기·링크 및 코드 복사가 있습니다. 공개 본문은 JavaScript 없이 읽을 수 있습니다. RSS, 사이트맵, canonical, Open Graph, BlogPosting 메타데이터를 생성합니다.

## 브라우저에서 작성하고 수정하기

1. 블로그 아래의 ‘글쓰기’로 새 글을 시작합니다. 기존 글은 글 상단의 ‘수정’을 누르거나 작성 화면의 ‘내 글’에서 공개 글을 선택합니다. 이전에 수정하던 원고가 있으면 이어서 엽니다.
2. 제목과 본문을 씁니다. 소개와 주소는 자동으로 채워지며, 필요하면 ‘설정’에서 소개·주소·날짜·주제·태그를 조정합니다. Markdown으로 작성합니다. `##`로 소제목, `![설명](주소)`로 그림, 파이프(`|`)로 표를 넣습니다. 기존 HTML 원고는 불러올 때 내용·그림·표·목차 주소를 보존하면서 편집 가능한 Markdown으로 정리합니다. 볼드 강조는 출력하지 않습니다.
3. 도구 모음의 ‘그림’으로 PNG/JPG/WebP를 넣습니다. 그림 설명과 출처를 작성합니다. 파일당 5MB까지 지원합니다. 글 주소가 비어 있으면 첨부할 때 자동으로 정하고, 첨부 후 주소는 고정됩니다.
4. 임시 원고와 그림은 이 브라우저의 IndexedDB에 자동 저장합니다. ‘내 글’의 ‘현재 원고 내려받기’로 저장한 JSON 파일을 다른 기기에서 불러올 수 있습니다. 임시 글이 서버에 동기화되는 것은 아닙니다. 같은 임시 글을 여러 탭에서 수정하면 저장 시 충돌을 확인해 별도 복사본을 남깁니다. 저장소가 차단되거나 저장에 실패하면 해당 원고를 현재 화면의 목록에 유지하고 내려받기를 안내합니다. 이 경우 새로고침 전에는 원고 파일을 내려받아 보관하세요.
5. 게시하려면 GitHub fine-grained 토큰으로 연결합니다. Resource owner는 riex71, 저장소는 computer-study-blog 하나만 선택하고 Contents를 Read and write로 설정합니다. 토큰은 페이지 메모리에만 보관합니다. 새로고침하거나 연결을 해제하면 지워집니다. 토큰을 채팅·원고·커밋에 넣지 않습니다.
6. ‘게시’ 또는 ‘수정 반영’을 눌러 제목과 공개 주소를 확인한 뒤 최종 게시합니다. 연결이 필요하면 같은 흐름에서 연결하고 게시 확인 화면으로 돌아옵니다. 원고·그림·메타데이터를 하나의 커밋으로 저장합니다. GitHub Actions가 블로그를 생성·검증·배포합니다. 화면에 원고 저장과 실제 배포 완료를 구분해 표시합니다. 이 상태는 새로고침 후에도 복원합니다. 후속 커밋이 먼저 배포된 경우에도 원고와 메타데이터를 대조해 공개 반영을 확인합니다. 원본 그림 데이터는 게시 후에도 임시 글과 내보내기 파일에 보관합니다.

기존 글은 주소를 유지합니다. 다른 곳에서 본문이나 글 정보가 바뀌면 게시를 중단하고 충돌을 알립니다. 이 경우 원고를 내려받아 보관하고 ‘설정’의 ‘공개본을 새 원고로 불러오기’로 최신 원고를 열어 변경을 옮깁니다. 기존 수정본은 임시 글 목록에 보관됩니다. 브랜치를 강제로 갱신하지 않습니다.

브라우저 편집기는 GitHub API를 사용하고, 공개 글은 GitHub Pages의 정적 HTML로 배포하는 구조입니다. 별도 서버 프로그램이나 토큰 없는 소셜 로그인은 포함하지 않습니다. 세션이 끝나면 GitHub에 다시 연결해야 합니다.

## 수식과 미리보기

문장 안 수식은 `$x_t^2$`, 독립 수식은 아래처럼 작성합니다. `\(...\)`과 `\[...\]` 구분자도 지원합니다.

```text
$$
h_t = \bar{A}h_{t-1} + \bar{B}x_t
$$
```

KaTeX 0.19.1과 폰트를 저장소에 포함해 미리보기와 공개 글에서 같은 방식으로 렌더링합니다. TeX를 Markdown 처리 전에 분리하므로 밑줄·백슬래시·정렬 문법이 손상되지 않습니다. 백틱과 코드 블록 안의 수식은 입력 그대로 표시합니다. 잘못된 수식은 원문을 남기고 오류를 안내합니다. KaTeX의 `trust` 옵션은 끄고 매크로 확장과 크기를 제한합니다.

저장하는 HTML에는 정제된 수식 표식과 원본 TeX만 포함합니다. 생성된 MathML·스타일·SVG를 원고로 다시 저장하지 않습니다. `article-math.js`가 공개 본문과 편집기에서 동일하게 표시합니다. JavaScript를 꺼도 수식의 TeX 원문을 읽을 수 있습니다.

작성 화면은 Markdown 한 칸으로 시작하고 ‘미리보기’ 탭에서 실제 글 모양과 수식을 확인합니다. 도구 모음의 ‘···’에서 소제목·링크·코드·표·문장 안 수식과 작성법을 엽니다. Ctrl/Command S로 현재 원고를 임시 저장합니다. 초안 목록·글 설정·GitHub 연결은 별도 대화상자로 엽니다.

선택 사항인 브라우저 회귀 검사는 Playwright가 준비된 환경에서 미리보기 서버를 연 뒤 `node tests/editor.cjs http://localhost:8000/`로 실행합니다. Playwright 위치는 `PLAYWRIGHT_MODULE` 환경 변수로 지정할 수 있습니다. 배포 빌드에는 Playwright를 설치할 필요가 없습니다.

## 소스와 자동 배포

- `content/posts.json`: 글 메타데이터
- `content/articles/<slug>.md`: 편집할 Markdown 원고
- `content/articles/<slug>.html`: 동일 원고의 정제된 HTML. Python 빌드는 이 파일을 사용합니다.
- `posts/<slug>.html`, `index.html`, `archive.html`, `series.html`: 생성된 공개 화면
- `templates/home.html`, `templates/article.html`, `blog.css`, `reader.css`, `blog.js`: 공통 디자인과 읽기 기능
- `write.html`, `writer.mjs`, `writer.css`, `editor-content.js`, `draft-store.mjs`, `publisher.mjs`: 브라우저 편집기
- `.github/workflows/pages.yml`: main 변경 시 빌드·검증 후 Pages 배포

브라우저 편집기를 사용하면 Markdown과 HTML을 함께 저장합니다. 소스를 직접 고칠 때도 두 파일을 함께 갱신해야 다음 편집에서 변경을 잃지 않습니다. 생성된 `posts/*.html`을 원본으로 편집하지 않습니다.

```sh
python3 scripts/build.py
python3 scripts/check.py
python3 scripts/package.py
node --test tests/*.test.*
```

빌드에는 Python 표준 라이브러리만 필요합니다. 게시 API 회귀 검사는 Node.js 22 이상에서 실행합니다. `package.py`는 공개 파일만 `_site/`에 모읍니다. 배포 시 `build.json`에 원본 커밋을 기록해 작성 화면에서 배포 완료를 확인합니다. 워크플로에는 Pages 쓰기·OIDC 권한과 Contents 읽기 권한만 부여합니다.

로컬에서는 저장소 루트에서 `python3 -m http.server 8000`을 실행해 http://localhost:8000/ 을 엽니다. GitHub 쓰기 테스트는 별도 브랜치에서 진행하세요.

## 개인 공부 노트와 저장소

기존 노트 앱은 `notes.html`에서 계속 사용합니다. 저장 키 `studybase.notes.v1`을 유지합니다. 테마는 `studybase.theme`, 읽기 목록은 `studybase.reading.v1`이며, 임시 글의 IndexedDB `studybase.writer.v1`과 별개입니다. 개인 노트·읽기 목록·임시 글은 해당 브라우저에 저장되므로 기기 간 이전 시 내보내기/가져오기를 사용합니다.

## 그림과 외부 라이브러리

Engram 원본 그림은 CC BY 4.0에 따라 출처를 표시했습니다. `assets/engram/ATTRIBUTION.md`와 각 그림 캡션에 세부 정보가 있습니다. `assets/mamba-state.svg`는 직접 작성한 개념도입니다.

브라우저 편집기의 marked와 DOMPurify는 `assets/vendor/`에 버전을 고정해 포함했습니다. 외부 CDN에서 실행 코드를 가져오지 않습니다. Turndown은 기존 원고를 편집 가능한 Markdown으로 변환하는 데 사용합니다. KaTeX와 폰트도 같은 위치에 포함하며 공식 npm 배포본의 SHA-512 무결성을 확인했습니다. 라이선스와 버전은 `assets/vendor/THIRD_PARTY.md`에 있습니다.

## 품질 검사

`node tests/quality.cjs http://localhost:8000/`는 Playwright 환경에서 여러 탭의 임시 글 충돌, 저장 실패 시 복원과 내보내기, 첨부 도중 원고 전환, 게시 후 그림 보존, 배포 확인 복원, 읽기 목록 동기화, 키보드 그림 확대를 검사합니다. `PLAYWRIGHT_MODULE`로 Playwright 위치를 지정할 수 있습니다. 검사에는 별도 브라우저 프로필과 모의 게시 API를 사용합니다. 실제 공개 글을 게시하거나 사용자의 브라우저 저장소를 수정하지 않습니다.

`node tests/quiet.cjs http://localhost:8000/`는 단일 작성 화면, 공개 글 직접 수정, 자동 소개·주소, 초안 전환 시 선택 영역 보존, 모바일 읽기 도구 배치를 검사합니다. `node tests/startup.cjs http://localhost:8000/`는 느린 초기화에서 입력 보존을 검사합니다.

빌드 검사는 공개 링크와 목차 주소뿐 아니라 CSS가 참조하는 폰트 파일도 확인합니다. 개인 노트와 글쓰기 화면은 검색 색인에서 제외합니다.
