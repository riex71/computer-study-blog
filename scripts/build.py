"""Build the public blog from canonical article HTML and content/posts.json."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
import hashlib
import json
import math
import os
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://riex71.github.io/computer-study-blog'
AUTHOR = '윤동현'
POSTS = sorted(json.loads((ROOT / 'content/posts.json').read_text(encoding='utf-8')), key=lambda p: p['date'], reverse=True)
VERSION = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in ['blog.css', 'reader.css', 'blog.js', 'article-math.js', 'assets/vendor/katex/katex.min.js', 'assets/vendor/katex/katex.min.css'])).hexdigest()[:12]
BOOKMARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>'
class Plain(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)
class SourceGuard(HTMLParser):
    def handle_starttag(self, tag, attrs):
        assert tag not in {'script','style','iframe','object','embed','form','base','link','meta','svg','math'}, 'Unsafe article element'
        for key, value in attrs:
            assert not key.lower().startswith('on'), 'Unsafe event attribute'
            if key.lower() in {'href','src'}:
                compact = re.sub(r'[\s\x00-\x1f]+', '', value or '').lower()
                assert not compact.startswith(('javascript:', 'vbscript:', 'data:')), 'Unsafe article URL'
def text(html):
    p = Plain(); p.feed(html)
    return ' '.join(' '.join(p.parts).split())
def js(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c')
def attr(value):
    return escape(str(value), quote=True)

def header(prefix=''):
    return f'''<header class="site-header"><div class="header-inner"><a class="site-brand" href="{prefix}index.html">Studybase</a><nav class="site-nav" aria-label="주 메뉴"><a href="{prefix}archive.html">글</a><a href="{prefix}index.html#about">소개</a></nav><button class="search-toggle" data-open-search type="button" aria-label="글 검색 (Ctrl 또는 Command K)">검색</button><button class="theme-toggle" data-theme-toggle type="button" aria-label="어두운 화면으로 변경" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg></button></div></header>'''

def footer(prefix=''):
    return f'''<footer class="site-footer"><div class="footer-inner"><span>© 2026 윤동현</span><nav class="footer-links" aria-label="하단 메뉴"><a href="{prefix}feed.xml">RSS</a><a href="https://github.com/riex71/computer-study-blog">GitHub</a><a href="{prefix}write.html?new=1">글쓰기</a></nav></div></footer>'''

def dialogs():
    return '''<dialog class="search-dialog" data-search-dialog aria-labelledby="global-search-title"><div class="dialog-top"><label id="global-search-title" for="global-search">어떤 개념을 찾고 있나요?</label><button data-close-search type="button" aria-label="검색 닫기">닫기 · Esc</button></div><input id="global-search" type="search" data-global-search placeholder="제목, 태그, 본문 검색" autocomplete="off" maxlength="200" aria-describedby="global-search-status"><p class="search-status" data-global-status id="global-search-status" role="status" aria-live="polite"></p><div class="global-results" data-global-results></div><p class="dialog-hint">↑ ↓ 결과 이동 · Enter 열기</p></dialog><div class="blog-toast" data-toast role="status" aria-live="polite"></div>'''

def head(title, description, path='', noindex=False):
    url = BASE + '/' + path
    return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)} — Studybase</title><meta name="description" content="{attr(description)}"><meta name="theme-color" content="#f7f6f2">{'<meta name="robots" content="noindex">' if noindex else ''}<link rel="canonical" href="{url}"><meta property="og:type" content="website"><meta property="og:title" content="{attr(title)}"><meta property="og:description" content="{attr(description)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}/assets/social-cover.png"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="Studybase RSS" href="feed.xml"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Noto+Sans+KR:wght@400&display=swap" rel="stylesheet"><script>try{{if(localStorage.getItem('studybase.theme')==='dark')document.documentElement.dataset.theme='dark'}}catch(e){{}}</script><link rel="stylesheet" href="blog.css?v={VERSION}"><script src="blog.js?v={VERSION}" defer></script>'''

def save_button(slug, label=False):
    return f'<button type="button" class="save-button" data-save="{attr(slug)}" aria-label="읽기 목록에 저장" aria-pressed="false">{BOOKMARK}' + ('<span data-save-label>나중에 읽기</span>' if label else '') + '</button>'

contents = {}
for post in POSTS:
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', post['slug']), 'Invalid slug'
    source_path = (ROOT / post['sourceHtml']).resolve()
    assert source_path.is_relative_to(ROOT / 'content/articles'), 'Invalid article source path'
    body = source_path.read_text(encoding='utf-8').strip()
    SourceGuard().feed(body)
    body = re.sub(r'</?(?:strong|b)(?:\s[^>]*)?>', '', body)
    used_ids = set(re.findall(r'\bid="([^"]+)"', body))
    heading_count = [0]
    def heading(match):
        attrs, inner = match.groups(); heading_count[0] += 1
        if 'id=' not in attrs:
            candidate = f'section-{heading_count[0]:02}'
            while candidate in used_ids: candidate += '-h'
            used_ids.add(candidate); attrs += f' id="{candidate}"'
        return f'<h2{attrs}>{inner}</h2>'
    body = re.sub(r'<h2([^>]*)>([\s\S]*?)</h2>', heading, body)
    contents[post['slug']] = '<article class="public-article">\n' + body + '\n</article>'
    post['minutes'] = max(1, math.ceil(len(re.sub(r'\s+', '', text(body))) / 600))
VERSION = hashlib.sha256((VERSION + js(POSTS) + ''.join(contents.values())).encode()).hexdigest()[:12]

def card(post, quiet=False):
    slug=post['slug'];url=f'posts/{slug}.html';haystack=' '.join([post['title'],post['description'],*post['tags'],*post['topics']])
    return f'''<article class="post-card" data-post-card data-slug="{slug}" data-title="{attr(post['title'])}" data-date="{attr(post['date'])}" data-topics="{attr(js(post['topics']))}" data-search-text="{attr(haystack)}"><div class="post-date"><time datetime="{attr(post['date'])}">{post['date'].replace('-','.')}</time><span>{post['minutes']}분 읽기</span></div><div class="card-copy"><h3><a href="{url}">{escape(post['title'])}</a></h3><p>{escape(post['description'])}</p></div>{'' if quiet else save_button(slug)}</article>'''

topics = list(dict.fromkeys(t for p in POSTS for t in p['topics']))
topic_links = ''.join(f'<a href="archive.html?topic={attr(t)}">{escape(t)} <span>{sum(t in p["topics"] for p in POSTS):02}</span></a>' for t in topics)
filters = '<button type="button" data-topic="" aria-pressed="true">전체</button>' + ''.join(f'<button type="button" data-topic="{attr(t)}" aria-pressed="false">{escape(t)}</button>' for t in topics)
home = (ROOT / 'templates/home.html').read_text(encoding='utf-8')
for key, value in {'HEAD': head('원리를 연결하는 AI 공부 기록', '윤동현의 AI 공부 블로그. 논문의 구조와 수식, 실험 조건을 그림과 함께 차근차근 읽습니다.'), 'COUNT': str(len(POSTS)), 'HEADER': header(), 'FOOTER': footer(), 'DIALOGS': dialogs(), 'TOPIC_LINKS': topic_links, 'CARDS': '\n'.join(card(p, quiet=True) for p in POSTS[:6])}.items(): home = home.replace('{{'+key+'}}', value)
schema = {'@context':'https://schema.org','@type':'Blog','name':'Studybase','url':BASE+'/','inLanguage':'ko-KR','author':{'@type':'Person','name':AUTHOR},'blogPost':[{'@type':'BlogPosting','headline':p['title'],'url':BASE+'/posts/'+p['slug']+'.html','datePublished':p['date']} for p in POSTS]}
home = home.replace('</head>', '<script type="application/ld+json">'+js(schema)+'</script></head>')
assert '{{' not in home
(ROOT / 'index.html').write_text(home, encoding='utf-8')

def page(filename, title, description, content, page_type='archive'):
    (ROOT / filename).write_text(f'<!doctype html><html lang="ko"><head>{head(title, description, filename)}</head><body data-page="{page_type}"><a class="skip-link" href="#main">본문으로 건너뛰기</a>{header()}<main class="site-main" id="main">{content}</main>{footer()}{dialogs()}</body></html>', encoding='utf-8')

archive = f'''<section class="page-intro"><h1>모든 글</h1><p>제목부터 본문까지, 궁금한 개념으로 찾아보세요.</p></section><section id="archive" class="archive archive-page"><div class="archive-controls" data-search-controls hidden><div class="search-row"><label class="blog-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span class="sr-only">공개 글 제목, 태그, 본문 검색</span><input type="search" data-search placeholder="궁금한 개념을 찾아보세요" autocomplete="off" maxlength="200"><kbd>/</kbd></label><label class="sort-label"><span class="sr-only">글 정렬</span><select data-sort><option value="newest">최근 글부터</option><option value="oldest">처음 쓴 글부터</option><option value="title">제목순</option></select></label></div><div class="filter-row"><div class="topic-filters" aria-label="글 주제">{filters}</div><button class="saved-filter" type="button" data-saved-filter aria-pressed="false">{BOOKMARK}저장한 글</button></div></div><div class="archive-view-row"><span class="article-count" data-result-count>{len(POSTS)}편의 글</span></div><noscript><p class="quiet">모든 공개 글을 아래에서 읽을 수 있습니다. 검색과 읽기 목록은 JavaScript가 필요합니다.</p></noscript><div class="post-grid" data-post-grid>{''.join(card(p) for p in POSTS)}</div><div class="search-empty" data-search-empty hidden><p>아직 일치하는 기록이 없어요.</p><span>다른 검색어를 입력하거나 모든 글을 둘러보세요.</span><button class="text-button" data-reset-filters type="button">모든 글 보기 ↗</button></div><p class="sr-only" data-search-status role="status" aria-live="polite"></p></section>'''
page('archive.html', '아카이브', '주제와 키워드로 찾는 AI 공부 기록', archive)
series = '''<section class="page-intro"><h1>모델은 어떻게 기억할까</h1><p>같은 ‘기억’이라는 단어를 쓰지만, 저장하는 것과 꺼내 쓰는 방법은 다릅니다.<br>상태를 갱신하는 Mamba에서 주소로 조회하는 Engram으로 이어 읽습니다.</p></section><div class="series-layout"><aside><p class="eyebrow">읽기 전에</p><p>벡터와 행렬 곱, 신경망의 층 개념을 알고 있다면 시작할 수 있습니다. SSM을 처음 접한다면 첫 글의 상태 갱신식부터 천천히 읽어보세요.</p><a href="archive.html?topic=메모리">메모리 주제로 더 찾기 ↗</a></aside><div class="series-steps"><section><span class="path-number">01</span><h2>무엇을 기억하고 잊을까</h2><p>Mamba는 입력에 따라 상태 갱신 방식을 바꿉니다. 이전 토큰을 모두 보관하는 대신, 과거 정보를 상태에 압축하는 설계와 그 대가를 살펴봅니다.</p><a class="text-link" href="posts/mamba-selective-ssm.html">Mamba 읽기 <span>↗</span></a></section><section><span class="path-number">02</span><h2>무엇을 계산하고 찾아올까</h2><p>Engram은 짧은 토큰 패턴으로 메모리 주소를 정하고, 조회한 벡터를 현재 문맥에 맞춰 결합합니다. 상태 갱신과는 다른 ‘기억’의 역할을 읽습니다.</p><a class="text-link" href="posts/engram-conditional-memory.html">Engram 읽기 <span>↗</span></a></section><section><span class="path-number">03</span><h2>두 글을 읽고 남길 질문</h2><ul><li>입력이 달라지면 저장된 값이 바뀌는가, 조회하는 주소가 바뀌는가?</li><li>긴 문맥을 처리하는 비용은 어디에서 발생하는가?</li><li>논문의 성능 비교에서 학습량과 추론 비용은 어떻게 통제됐는가?</li></ul><p>RAG의 외부 문서 검색, 대화 기록 저장, recurrent state도 구분해 보세요.</p><a class="text-link" href="posts/engram-conditional-memory.html#related">개념 비교로 돌아가기 <span>↗</span></a></section></div></div>'''
page('series.html', '이어 읽기 — 모델은 어떻게 기억할까', 'Mamba와 Engram을 연결하는 읽기 가이드', series, 'series')

def toc_title(value):
    return re.sub(r'^\d{1,2}[.)]\s+', '', text(value))

for post in POSTS:
    body = contents[post['slug']]
    sections=list(re.finditer(r'<h2[^>]*id="([^"]+)"[^>]*>([\s\S]*?)</h2>', body))
    toc = '<ol class="toc-list">'+''.join(f'<li><a data-toc-link href="#{attr(m.group(1))}"><span class="toc-number" aria-hidden="true">{i:02}</span><span class="toc-title">{escape(toc_title(m.group(2)))}</span></a></li>' for i,m in enumerate(sections,1))+'</ol>'
    others = sorted((p for p in POSTS if p['slug'] != post['slug']), key=lambda p: len(set(p['topics']) & set(post['topics'])), reverse=True)
    related = ''.join(f'<a class="related-story" href="{p["slug"]}.html"><span><small>{escape(" · ".join(t for t in p["topics"] if t in post["topics"]) or p["category"])} · {p["minutes"]}분 읽기</small><span class="related-title">{escape(p["title"])}</span><span class="related-description">{escape(p["description"])}</span></span><span aria-hidden="true">↗</span></a>' for p in others[:2])
    url = BASE + '/posts/' + post['slug'] + '.html'
    schema = {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': post['title'], 'description': post['description'], 'datePublished': post['date'], 'dateModified': post.get('updated', post['date']), 'author': {'@type': 'Person', 'name': AUTHOR, 'url': BASE+'/#about'}, 'mainEntityOfPage': url, 'image': BASE+'/assets/social-cover.png', 'inLanguage': 'ko-KR'}
    extra_css = f'<link rel="stylesheet" href="engram.css?v={VERSION}">' if post['slug'].startswith('engram') else ''
    article_head = head(post['title'], post['description'], 'posts/'+post['slug']+'.html')
    article_head = article_head.replace('href="feed.xml"','href="../feed.xml"').replace('href="assets/', 'href="../assets/').replace('href="blog.css', 'href="../blog.css').replace('src="blog.js', 'src="../blog.js').replace('content="website"', 'content="article"')
    article_head += f'<link rel="stylesheet" href="../assets/vendor/katex/katex.min.css?v={VERSION}"><script src="../assets/vendor/katex/katex.min.js?v={VERSION}" defer></script><script src="../article-math.js?v={VERSION}" defer></script>'
    article_page=(ROOT/'templates/article.html').read_text(encoding='utf-8')
    values={'HEAD':article_head+extra_css+f'<link rel="stylesheet" href="../reader.css?v={VERSION}"><script type="application/ld+json">{js(schema)}</script>','BODY_CLASS':'engram-article-page' if post['slug'].startswith('engram') else '', 'HEADER':header('../'),'FOOTER':footer('../'),'DIALOGS':dialogs(),'TITLE':escape(post['title']),'DECK':escape(post.get('deck',post['description'])),'DATE':attr(post['date']),'DISPLAY_DATE':post['date'].replace('-','.'),'MINUTES':str(post['minutes']),'SLUG':post['slug'],'TOC':toc,'TOC_COUNT':str(len(sections)).zfill(2),'TOC_HIDDEN':'' if sections else ' hidden','SAVE':save_button(post['slug'],True),'BODY':body,'RELATED':related}
    for key,value in values.items():article_page=article_page.replace('{{'+key+'}}',value)
    assert '{{' not in article_page
    (ROOT / 'posts' / (post['slug'] + '.html')).write_text(article_page, encoding='utf-8')

index = [{'slug': p['slug'], 'title': p['title'], 'description': p['description'], 'date': p['date'], 'tags': p['tags'], 'text': text(contents[p['slug']]), 'search': ' '.join([p['title'], p['description'], *p['tags'], *p['topics'], text(contents[p['slug']])])} for p in POSTS]
(ROOT / 'search-index.json').write_text(js(index), encoding='utf-8')
rss = ET.Element('rss', version='2.0'); channel = ET.SubElement(rss, 'channel')
for name, value in [('title','Studybase — AI 공부 기록'),('link',BASE+'/'),('description','논문을 읽고 원리를 연결하는 윤동현의 AI 공부 기록'),('language','ko-KR')]: ET.SubElement(channel,name).text=value
for p in POSTS:
    item=ET.SubElement(channel,'item');link=BASE+'/posts/'+p['slug']+'.html'
    for name,value in [('title',p['title']),('link',link),('guid',link),('description',p['description']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(tzinfo=timezone(timedelta(hours=9)))))]: ET.SubElement(item,name).text=value
ET.indent(rss);ET.ElementTree(rss).write(ROOT/'feed.xml',encoding='utf-8',xml_declaration=True)
ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
urlset=ET.Element('{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
for location,date in [(BASE+'/',POSTS[0]['date']),(BASE+'/archive.html',POSTS[0]['date']),(BASE+'/series.html',POSTS[0]['date'])]+[(BASE+'/posts/'+p['slug']+'.html',p.get('updated',p['date'])) for p in POSTS]:
    node=ET.SubElement(urlset,'url');ET.SubElement(node,'loc').text=location;ET.SubElement(node,'lastmod').text=date
ET.indent(urlset);ET.ElementTree(urlset).write(ROOT/'sitemap.xml',encoding='utf-8',xml_declaration=True)
(ROOT/'404.html').write_text(f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없어요 — Studybase</title><link rel="stylesheet" href="{BASE}/blog.css?v={VERSION}"></head><body><main class="site-main" style="padding-top:18vh"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>이 기록은 아직 없거나,<br>주소가 바뀌었어요.</h1><p class="quiet">아카이브에서 찾고 있던 글을 다시 찾아보세요.</p><a class="text-link" href="{BASE}/archive.html">아카이브로 돌아가기 ↗</a></main></body></html>',encoding='utf-8')
if os.environ.get('GITHUB_SHA'):
    (ROOT/'build.json').write_text(json.dumps({'commit':os.environ['GITHUB_SHA'],'builtAt':datetime.now(timezone.utc).isoformat()}),encoding='utf-8')
editor_template = (ROOT/'templates/write.html').read_text(encoding='utf-8')
editor_version = hashlib.sha256((editor_template + ''.join((ROOT/p).read_text(encoding='utf-8') for p in ['writer.mjs','writer.css','editor-content.js','article-math.js','publisher.mjs','draft-store.mjs','assets/vendor/THIRD_PARTY.md'])).encode()).hexdigest()[:12]
(ROOT/'write.html').write_text(editor_template.replace('{{EDITOR_VERSION}}', editor_version),encoding='utf-8')
print(f'Built {len(POSTS)} posts, home, archive, series, search, RSS and sitemap. Version {VERSION}')
