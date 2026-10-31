# Studybase

컴퓨터 과학 전반의 공부 기록을 담는 한국어 블로그입니다.

[공개 블로그](https://riex71.github.io/computer-study-blog/) · [관리 화면](https://studybase-admin.dmcydh1804.workers.dev/write)

## 저장소 구성

```text
content/
  articles/*.md        글 원본
  posts.json           제목·날짜·주제·태그·원고 경로
  deleted-posts.json   휴지통 목록, 공개 배포에서 제외
src/
  css/                 공통 스타일과 편집기 스타일
  js/                  읽기 기능, Markdown 편집기, 게시·그림 처리
assets/                그림·출처·외부 라이브러리
examples/              글에서 참조하는 실행 예제
templates/             페이지 틀
scripts/               빌드와 검사
admin/                 GitHub 로그인 기반 비공개 관리 서버
tests/                 원고·게시·범용 빌드 검사
_site/                 자동 생성 배포물, Git 제외
```

Markdown만 글 원본으로 관리합니다. `sourceHtml`은 빌드 시 생성하는 공개 본문 파일의 경로이며 저장소에 HTML 사본을 커밋하지 않습니다. 게시하면 Markdown·글 정보·새 그림을 한 커밋으로 저장하고 GitHub Actions가 `_site/`를 새로 만듭니다. `_site/`만 GitHub Pages에 배포합니다. 소스 폴더를 옮겨도 기존 공개 글·그림·CSS·JS 주소는 유지합니다.

## 모든 글에 공통인 기능

글 주소·제목·주제와 관계없이 같은 템플릿과 스타일을 적용합니다. 목차는 본문의 제목 계층에서, 검색·주제 링크·관련 글은 공개 글 정보에서 만듭니다. 제목이 없는 짧은 글은 목차를 숨깁니다. 수식, 코드 언어별 색상, 표 스크롤, 그림 설명·확대, 읽기 목록, RSS를 공통으로 제공합니다.

- 수식: `$x_i$` 또는 별도 줄의 `$$ ... $$`
- 코드: 언어를 지정한 Markdown 코드 블록
- 그림: Markdown 이미지 또는 크기·대체 설명을 넣은 `<img>`
- 그림 설명: 그림 다음 단락에 `그림 설명: ...`
- 표 설명: 표 앞 단락에 `표 설명: ...`
- 고정 제목 주소: `## 소제목 {#stable-id}`

어떤 글에서든 아래 실험 도구를 사용할 수 있습니다.

```markdown
:::hash-demo
:::
```

이전 초안의 `:::engram-hash-demo`와 HTML 클래스는 일반 구성 요소로 변환해 읽습니다. 특정 글 주소를 검사해서 기능을 켜는 분기는 없습니다. 개별 글의 그림·출처·실행 예제는 해당 글의 콘텐츠로 보존합니다.

## 그림 첨부

관리 화면의 설정 → 그림 첨부에서 선택합니다.

- 선명도 유지: 작은 그림은 그대로 두고 큰 PNG만 같은 해상도로 무손실 재인코딩합니다.
- 사진·용량 우선: 최대 2400px의 WebP로 변환합니다.
- 원본 유지: 입력 파일을 그대로 사용합니다.

최적화 결과가 더 작을 때만 교체합니다. 애니메이션은 그대로 보존합니다. 저장할 파일은 5MB 이하이며 새 그림은 게시 요청당 30개까지 받습니다. 그림 내용의 해시로 경로를 정해 중복 첨부를 방지합니다. 이미 게시한 그림은 이후 수정 때 다시 전송하지 않지만 브라우저 초안의 그림 사본은 유지합니다. 기존 SVG 도식은 벡터 그대로 제공합니다. LFS는 사용하지 않습니다.

## 작성·삭제·복원

작성 화면은 별도 Cloudflare Worker에서 GitHub 사용자 ID까지 확인해 본인만 접근합니다. 공개 블로그의 수정 버튼은 해당 글 편집기로 바로 연결됩니다. 로그인 세션·Origin·CSRF·저장소 쓰기 권한을 검사한 뒤 게시합니다. 자세한 배포·인증 구성은 `admin/README.md`에 있습니다.

‘내 글’의 공개 글에서 제목을 확인해 휴지통으로 옮기고 같은 화면에서 복원합니다. 삭제한 글은 목록·검색·RSS·사이트맵과 공개 원문에서 제외하고 기존 주소에는 안내를 표시합니다. 원본·그림·Git 이력·브라우저 초안은 보존합니다. 임시 글의 ×는 브라우저 사본만 삭제합니다.

IndexedDB `studybase.writer.v1`, 테마 `studybase.theme`, 읽기 목록 `studybase.reading.v1`을 유지합니다. 이전 개인 노트 앱의 중복 UI는 제거했으며 `notes.html`에서 로컬 저장소 `studybase.notes.v1`을 파일로 내보낼 수 있습니다. 자동으로 원본을 지우거나 서버에 전송하지 않습니다.

## 빌드와 검증

Python 3와 Node.js 24.15 이상이 필요합니다.

```sh
npm ci --ignore-scripts
BLOG_ADMIN_URL=https://studybase-admin.dmcydh1804.workers.dev python3 scripts/build.py
python3 scripts/check.py
node --test tests/*.test.*
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m http.server 8765 --directory _site
```

`BLOG_ADMIN_URL`을 생략하면 격리된 개발용 편집기를 빌드합니다. 운영에서는 저장소 Actions 변수로 관리 화면 주소를 설정합니다. `STUDYBASE_NODE`로 Node 실행 파일을 지정할 수 있습니다.

원고 검사 외에 임시 복사본으로 서로 다른 글 15편, 제목 없는 글, 제목 계층·수식·표·그림·해시 실험, 홈 노출 제한, 전체 삭제·복원, 원본과 배포물 분리를 검사합니다. 관리자 브라우저 검사는 모의 GitHub와 새 브라우저 프로필만 사용하며 실제 글이나 초안을 변경하지 않습니다.

원 논문 그림의 출처는 각 캡션과 `assets/engram/ATTRIBUTION.md`에 있습니다. 라이브러리 라이선스는 `assets/vendor/THIRD_PARTY.md`에 기록합니다.
