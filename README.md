# Studybase

원 논문의 구조와 실험 조건을 읽고 정리하는 한국어 AI 공부 블로그입니다.

사이트: https://riex71.github.io/computer-study-blog/

## 공개 블로그

- 논문 이미지와 실제 글을 중심으로 구성한 홈과 아카이브
- 제목·태그·본문 통합 검색, 주제 필터, 정렬
- 브라우저에 보관되는 읽기 목록과 라이트/다크 테마
- 글별 목차, 읽기 진행률, 링크 복사, 이어 읽기
- 모바일 화면, 키보드 탐색, JavaScript 없는 환경에서도 읽을 수 있는 정적 본문
- RSS(`feed.xml`), 사이트맵(`sitemap.xml`), canonical·Open Graph·JSON-LD 메타데이터

## 개인 공부 노트

기존 노트 앱은 `notes.html`에서 사용합니다. 저장 키는 기존과 같은 `studybase.notes.v1`이므로 같은 브라우저·같은 사이트 주소의 기존 데이터가 유지됩니다. `studybase.theme`은 테마, `studybase.reading.v1`은 읽기 목록에 사용합니다.

노트와 읽기 목록은 해당 브라우저의 localStorage에 저장되며 기기 간 자동 동기화는 제공하지 않습니다. 노트 화면의 내보내기/가져오기로 백업할 수 있습니다. 공개 글은 저장소의 HTML 파일로 관리합니다.

## 글 추가 및 재생성

1. `posts/`에 글 HTML을 추가합니다. 본문은 `<article class="public-article">` 안에 작성합니다. 이미지와 출처도 함께 넣습니다.
2. `content/posts.json`에 제목·slug·날짜·주제·태그·요약·썸네일을 등록합니다. 첫 번째 항목이 홈의 대표 글입니다.
3. `python3 scripts/build.py`를 실행합니다. 홈·글 공통 화면·검색 인덱스·RSS·사이트맵을 갱신합니다.
4. `python3 scripts/check.py`로 링크와 파일을 확인합니다.
5. 생성된 결과를 함께 커밋해 `main`에 반영하면 기존 GitHub Pages 배포가 적용됩니다.

별도의 npm 설치나 서버 데이터베이스는 필요하지 않습니다. `templates/home.html`은 홈의 원본이며 `index.html`은 생성된 결과입니다. 디자인과 기능은 `blog.css`, `reader.css`, `blog.js`에서 관리합니다. 개인 노트의 `styles.css`와 `script.js`는 별도로 유지합니다.

## 로컬 확인

저장소 루트에서 `python3 -m http.server 8000`을 실행하고 브라우저로 http://localhost:8000/ 을 엽니다. 파일을 직접 열어도 글을 읽을 수 있지만, 전체 본문 검색에는 HTTP 서버가 필요합니다.

## 그림 출처

Engram 논문의 원본 그림은 CC BY 4.0에 따라 출처를 표시했습니다. 상세 정보는 `assets/engram/ATTRIBUTION.md`와 각 그림의 캡션에 있습니다. `assets/mamba-state.svg`는 상태 갱신을 설명하기 위해 직접 작성한 개념도입니다.
