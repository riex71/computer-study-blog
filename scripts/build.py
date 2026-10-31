"""Compile Markdown, then build public pages from its generated HTML."""
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
import subprocess
import shutil
import xml.etree.ElementTree as ET
from outline import table_of_contents
from site_files import copy_runtime
from admin_entry import admin_entry, draft_migration, validated_origin

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'_site'
if OUT.exists():shutil.rmtree(OUT)
OUT.mkdir()
(OUT/'.nojekyll').touch()
copy_runtime(OUT)
for name in ['assets','examples']:shutil.copytree(ROOT/name, OUT/name)
(OUT/'posts').mkdir()
(OUT/'content/articles').mkdir(parents=True)
shutil.copy2(ROOT/'content/posts.json',OUT/'content/posts.json')
shutil.copy2(ROOT/'templates/legacy-notes.html',OUT/'notes.html')
node = os.environ.get('STUDYBASE_NODE') or shutil.which('node') or shutil.which('node.exe')
assert node, 'Node.js 24.15+ is required. Run npm ci before building.'
compiler = ROOT / 'scripts/markdown.cjs'
if str(node).endswith('.exe') and str(compiler).startswith('/mnt/'):
    compiler = subprocess.check_output(['wslpath', '-w', str(compiler)], text=True).strip()
subprocess.run([node, str(compiler)], cwd=ROOT, check=True)
admin_url = os.environ.get('BLOG_ADMIN_URL', '').strip()
admin_origin = validated_origin(admin_url) if admin_url else ''
BASE = 'https://riex71.github.io/computer-study-blog'
AUTHOR = '윤동현'
POSTS = sorted(json.loads((ROOT / 'content/posts.json').read_text(encoding='utf-8')), key=lambda p: p['date'], reverse=True)
DELETED = json.loads((ROOT / 'content/deleted-posts.json').read_text(encoding='utf-8'))
assert isinstance(DELETED, list)
active_slugs = {p['slug'] for p in POSTS}
deleted_slugs = {entry['post']['slug'] for entry in DELETED}
assert len(deleted_slugs) == len(DELETED) and not active_slugs & deleted_slugs
assert all(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) for slug in deleted_slugs)
VERSION = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in ['src/css/blog.css', 'src/css/reader.css', 'src/js/blog.js', 'src/js/article-math.js', 'src/js/article-labs.js', 'src/js/article-code.js', 'assets/vendor/prism.js', 'assets/vendor/katex/katex.min.js', 'assets/vendor/katex/katex.min.css'])).hexdigest()[:12]
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
    return f'''<header class="site-header"><div class="header-inner"><a class="site-brand" href="{prefix}index.html">Studybase</a><nav class="site-nav" aria-label="주 메뉴"><a href="{prefix}archive.html">글</a></nav><button class="search-toggle" data-open-search type="button" aria-label="글 검색 (Ctrl 또는 Command K)">검색</button><button class="theme-toggle" data-theme-toggle type="button" aria-label="어두운 화면으로 변경" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg></button></div></header>'''

def footer(prefix=''):
    return f'''<footer class="site-footer"><div class="footer-inner"><span>© 2026 Studybase</span><nav class="footer-links" aria-label="하단 메뉴"><a href="{prefix}feed.xml">RSS</a><a href="https://github.com/riex71/computer-study-blog">GitHub</a><a href="{prefix}write.html?new=1">글쓰기</a></nav></div></footer>'''

def dialogs():
    return '''<dialog class="search-dialog" data-search-dialog aria-labelledby="global-search-title"><div class="dialog-top"><label id="global-search-title" for="global-search">어떤 개념을 찾고 있나요?</label><button data-close-search type="button" aria-label="검색 닫기">닫기 · Esc</button></div><input id="global-search" type="search" data-global-search placeholder="제목, 태그, 본문 검색" autocomplete="off" maxlength="200" aria-describedby="global-search-status"><p class="search-status" data-global-status id="global-search-status" role="status" aria-live="polite"></p><div class="global-results" data-global-results></div><p class="dialog-hint">↑ ↓ 결과 이동 · Enter 열기</p></dialog><div class="blog-toast" data-toast role="status" aria-live="polite"></div>'''

def head(title, description, path='', noindex=False, image='assets/social-cover.png'):
    url = BASE + '/' + path
    image_url = image if image.startswith('https://') else BASE + '/' + image
    return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)} — Studybase</title><meta name="description" content="{attr(description)}"><meta name="theme-color" content="#f7f6f2">{'<meta name="robots" content="noindex">' if noindex else ''}<link rel="canonical" href="{url}"><meta property="og:type" content="website"><meta property="og:title" content="{attr(title)}"><meta property="og:description" content="{attr(description)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{attr(image_url)}"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="Studybase RSS" href="feed.xml"><link rel="icon" href="assets/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Noto+Sans+KR:wght@400&display=swap" rel="stylesheet"><script>try{{if(localStorage.getItem('studybase.theme')==='dark')document.documentElement.dataset.theme='dark'}}catch(e){{}}</script><link rel="stylesheet" href="blog.css?v={VERSION}"><script src="blog.js?v={VERSION}" defer></script>'''

def save_button(slug, label=False):
    return f'<button type="button" class="save-button" data-save="{attr(slug)}" aria-label="읽기 목록에 저장" aria-pressed="false">{BOOKMARK}' + ('<span data-save-label>나중에 읽기</span>' if label else '') + '</button>'

contents = {}
for post in POSTS:
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', post['slug']), 'Invalid slug'
    source_path = (OUT / post['sourceHtml']).resolve()
    assert source_path.is_relative_to(OUT / 'content/articles'), 'Invalid article source path'
    body = source_path.read_text(encoding='utf-8').strip()
    SourceGuard().feed(body)
    body = re.sub(r'</?(?:strong|b)(?:\s[^>]*)?>', '', body)
    contents[post['slug']] = '<article class="public-article">\n' + body + '\n</article>'
    post['minutes'] = max(1, math.ceil(len(re.sub(r'\s+', '', text(body))) / 600))
VERSION = hashlib.sha256((VERSION + js(POSTS) + ''.join(contents.values())).encode()).hexdigest()[:12]

def card(post, quiet=False):
    slug=post['slug'];url=f'posts/{slug}.html';haystack=' '.join([post['title'],post['description'],*post['tags'],*post['topics']])
    post_topics = ''.join(f'<a href="archive.html?topic={attr(t)}">{escape(t)}</a>' for t in post['topics'][:2])
    return f'''<article class="post-card" data-post-card data-slug="{slug}" data-title="{attr(post['title'])}" data-date="{attr(post['date'])}" data-topics="{attr(js(post['topics']))}" data-search-text="{attr(haystack)}"><div class="post-date"><time datetime="{attr(post['date'])}">{post['date'].replace('-','.')}</time><span>{post['minutes']}분 읽기</span></div><div class="card-copy"><h3><a href="{url}">{escape(post['title'])}</a></h3><p>{escape(post['description'])}</p><div class="post-topics" aria-label="글 주제">{post_topics}</div></div>{'' if quiet else save_button(slug)}</article>'''

topics = list(dict.fromkeys(t for p in POSTS for t in p['topics']))
home_topics = sorted(topics, key=lambda t: -sum(t in p['topics'] for p in POSTS))[:8]
topic_links = ''.join(f'<a href="archive.html?topic={attr(t)}">{escape(t)} <span>{sum(t in p["topics"] for p in POSTS)}</span></a>' for t in home_topics)
if len(topics) > len(home_topics):
    topic_links += '<a href="archive.html">모든 주제 ↗</a>'
filters = '<button type="button" data-topic="" aria-pressed="true">전체</button>' + ''.join(f'<button type="button" data-topic="{attr(t)}" aria-pressed="false">{escape(t)}</button>' for t in topics)
home = (ROOT / 'templates/home.html').read_text(encoding='utf-8')
for key, value in {'HEAD': head('컴퓨터 과학 노트', '컴퓨터 과학의 개념과 구현을 공부하며 남기는 기록.'), 'COUNT': str(len(POSTS)), 'HEADER': header(), 'FOOTER': footer(), 'DIALOGS': dialogs(), 'TOPIC_NAV': '<nav class="home-topics" aria-label="주제별 글"><span>주제</span>'+topic_links+'</nav>' if topics else '', 'CARDS': '\n'.join(card(p, quiet=True) for p in POSTS[:6]) or '<p class="quiet">아직 공개된 글이 없습니다.</p>'}.items(): home = home.replace('{{'+key+'}}', value)
schema = {'@context':'https://schema.org','@type':'Blog','name':'Studybase','url':BASE+'/','inLanguage':'ko-KR','author':{'@type':'Person','name':AUTHOR},'blogPost':[{'@type':'BlogPosting','headline':p['title'],'url':BASE+'/posts/'+p['slug']+'.html','datePublished':p['date']} for p in POSTS]}
home = home.replace('</head>', '<script type="application/ld+json">'+js(schema)+'</script></head>')
assert '{{' not in home
(OUT / 'index.html').write_text(home, encoding='utf-8')

def page(filename, title, description, content, page_type='archive'):
    (OUT / filename).write_text(f'<!doctype html><html lang="ko"><head>{head(title, description, filename)}</head><body data-page="{page_type}"><a class="skip-link" href="#main">본문으로 건너뛰기</a>{header()}<main class="site-main" id="main">{content}</main>{footer()}{dialogs()}</body></html>', encoding='utf-8')

archive = f'''<section class="page-intro"><p class="page-kicker">ARCHIVE</p><h1>모든 글</h1></section><section id="archive" class="archive archive-page"><div class="archive-controls" data-search-controls hidden><div class="search-row"><label class="blog-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span class="sr-only">공개 글 제목, 태그, 본문 검색</span><input type="search" data-search placeholder="궁금한 개념을 찾아보세요" autocomplete="off" maxlength="200"><kbd>/</kbd></label><label class="sort-label"><span class="sr-only">글 정렬</span><select data-sort><option value="newest">최근 글부터</option><option value="oldest">처음 쓴 글부터</option><option value="title">제목순</option></select></label></div><div class="filter-row"><div class="topic-filters" aria-label="글 주제">{filters}</div><button class="saved-filter" type="button" data-saved-filter aria-pressed="false">{BOOKMARK}저장한 글</button></div></div><div class="archive-view-row"><span class="article-count" data-result-count>{len(POSTS)}편의 글</span></div><noscript><p class="quiet">모든 공개 글을 아래에서 읽을 수 있습니다. 검색과 읽기 목록은 JavaScript가 필요합니다.</p></noscript><div class="post-grid" data-post-grid>{''.join(card(p) for p in POSTS)}</div><div class="search-empty" data-search-empty hidden><p>아직 일치하는 기록이 없어요.</p><span>다른 검색어를 입력하거나 모든 글을 둘러보세요.</span><button class="text-button" data-reset-filters type="button">모든 글 보기 ↗</button></div><p class="sr-only" data-search-status role="status" aria-live="polite"></p></section>'''
page('archive.html', '아카이브', '주제와 키워드로 찾는 컴퓨터 과학 노트', archive)
# Keep old bookmarks usable after retiring the two-article reading guide.
(OUT/'series.html').write_text('<!doctype html><html lang="ko"><head>'+head('모든 글', '전체 글 목록으로 이동합니다.', 'archive.html', noindex=True)+'<meta http-equiv="refresh" content="0;url=archive.html"></head><body><main class="site-main"><p><a href="archive.html">모든 글 보기 ↗</a></p></main><script>location.replace("archive.html");</script></body></html>',encoding='utf-8')

for post in POSTS:
    body = contents[post['slug']]
    toc,section_count=table_of_contents(body)
    others = sorted((p for p in POSTS if p['slug'] != post['slug']), key=lambda p: len(set(p['topics']) & set(post['topics'])), reverse=True)
    related = ''.join(f'<a class="related-story" href="{p["slug"]}.html"><span><small>{escape(" · ".join(t for t in p["topics"] if t in post["topics"]) or p["category"])} · {p["minutes"]}분 읽기</small><span class="related-title">{escape(p["title"])}</span><span class="related-description">{escape(p["description"])}</span></span><span aria-hidden="true">↗</span></a>' for p in others[:2])
    url = BASE + '/posts/' + post['slug'] + '.html'
    schema = {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': post['title'], 'description': post['description'], 'datePublished': post['date'], 'dateModified': post.get('updated', post['date']), 'author': {'@type': 'Person', 'name': AUTHOR, 'url': BASE+'/'}, 'mainEntityOfPage': url, 'image': BASE+'/'+post.get('socialImage','assets/social-cover.png'), 'inLanguage': 'ko-KR'}
    article_head = head(post['title'], post['description'], 'posts/'+post['slug']+'.html', image=post.get('socialImage','assets/social-cover.png'))
    article_head = article_head.replace('href="feed.xml"','href="../feed.xml"').replace('href="assets/', 'href="../assets/').replace('href="blog.css', 'href="../blog.css').replace('src="blog.js', 'src="../blog.js').replace('content="website"', 'content="article"')
    article_head += f'<link rel="stylesheet" href="../assets/vendor/katex/katex.min.css?v={VERSION}"><script src="../assets/vendor/katex/katex.min.js?v={VERSION}" defer></script><script src="../article-math.js?v={VERSION}" defer></script>'
    article_head += f'<script src="../article-labs.js?v={VERSION}" defer></script><script src="../assets/vendor/prism.js?v={VERSION}" defer></script><script src="../article-code.js?v={VERSION}" defer></script>'
    revision = ''
    if post.get('updated'):
        revision = f'<p class="article-revision">수정 <time datetime="{attr(post["updated"])}">{escape(post["updated"].replace("-","."))}</time>' + (' · '+escape(post['revisionNote']) if post.get('revisionNote') else '') + '</p>'
    article_page=(ROOT/'templates/article.html').read_text(encoding='utf-8')
    values={'HEAD':article_head+f'<link rel="stylesheet" href="../reader.css?v={VERSION}"><script type="application/ld+json">{js(schema)}</script>','HEADER':header('../'),'FOOTER':footer('../'),'DIALOGS':dialogs(),'TITLE':escape(post['title']),'DECK':escape(post.get('deck',post['description'])),'REVISION':revision,'DATE':attr(post['date']),'DISPLAY_DATE':post['date'].replace('-','.'),'MINUTES':str(post['minutes']),'SLUG':post['slug'],'EDIT_URL':attr((admin_origin+'/write' if admin_origin else '../write.html')+'?edit='+post['slug']),'TOC':toc,'TOC_COUNT':str(section_count).zfill(2),'TOC_HIDDEN':'' if section_count else ' hidden','SAVE':save_button(post['slug'],True),'BODY':body,'RELATED':related}
    for key,value in values.items():article_page=article_page.replace('{{'+key+'}}',value)
    assert '{{' not in article_page
    (OUT / 'posts' / (post['slug'] + '.html')).write_text(article_page, encoding='utf-8')

# Replace old generated pages as well; an old tracked HTML file must never leak its body.
for slug in deleted_slugs:
    gone_head = head('삭제된 글', '현재 공개되지 않은 글입니다.', 'posts/'+slug+'.html', noindex=True)
    for old, new in [('href="feed.xml"','href="../feed.xml"'),('href="assets/','href="../assets/'),('href="blog.css','href="../blog.css'),('src="blog.js','src="../blog.js')]:
        gone_head = gone_head.replace(old,new)
    (OUT / 'posts' / (slug+'.html')).write_text('<!doctype html><html lang="ko"><head>'+gone_head+'</head><body data-deleted-article="'+slug+'">'+header('../')+'<main class="site-main"><section class="page-intro"><h1>현재 공개되지 않은 글입니다.</h1><p>작성자가 이 글을 삭제했습니다.</p><a href="../archive.html">다른 글 둘러보기 ↗</a></section></main>'+footer('../')+dialogs()+'</body></html>',encoding='utf-8')

index = [{'slug': p['slug'], 'title': p['title'], 'description': p['description'], 'date': p['date'], 'tags': p['tags'], 'text': text(contents[p['slug']]), 'search': ' '.join([p['title'], p['description'], *p['tags'], *p['topics'], text(contents[p['slug']])])} for p in POSTS]
(OUT / 'search-index.json').write_text(js(index), encoding='utf-8')
rss = ET.Element('rss', version='2.0'); channel = ET.SubElement(rss, 'channel')
for name, value in [('title','Studybase — 컴퓨터 과학 노트'),('link',BASE+'/'),('description','컴퓨터 과학의 개념과 구현을 공부하며 남기는 기록'),('language','ko-KR')]: ET.SubElement(channel,name).text=value
for p in POSTS:
    item=ET.SubElement(channel,'item');link=BASE+'/posts/'+p['slug']+'.html'
    for name,value in [('title',p['title']),('link',link),('guid',link),('description',p['description']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(tzinfo=timezone(timedelta(hours=9)))))]: ET.SubElement(item,name).text=value
ET.indent(rss);ET.ElementTree(rss).write(OUT/'feed.xml',encoding='utf-8',xml_declaration=True)
ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
urlset=ET.Element('{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
latest_date = POSTS[0]['date'] if POSTS else datetime.now(timezone.utc).date().isoformat()
for location,date in [(BASE+'/',latest_date),(BASE+'/archive.html',latest_date)]+[(BASE+'/posts/'+p['slug']+'.html',p.get('updated',p['date'])) for p in POSTS]:
    node=ET.SubElement(urlset,'url');ET.SubElement(node,'loc').text=location;ET.SubElement(node,'lastmod').text=date
ET.indent(urlset);ET.ElementTree(urlset).write(OUT/'sitemap.xml',encoding='utf-8',xml_declaration=True)
(OUT/'404.html').write_text(f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없어요 — Studybase</title><link rel="stylesheet" href="{BASE}/blog.css?v={VERSION}"></head><body><main class="site-main" style="padding-top:18vh"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>이 기록은 아직 없거나,<br>주소가 바뀌었어요.</h1><p class="quiet">아카이브에서 찾고 있던 글을 다시 찾아보세요.</p><a class="text-link" href="{BASE}/archive.html">아카이브로 돌아가기 ↗</a></main></body></html>',encoding='utf-8')
if os.environ.get('GITHUB_SHA'):
    (OUT/'build.json').write_text(json.dumps({'commit':os.environ['GITHUB_SHA'],'builtAt':datetime.now(timezone.utc).isoformat()}),encoding='utf-8')
editor_template = (ROOT/'templates/write.html').read_text(encoding='utf-8')
editor_version = hashlib.sha256((editor_template + ''.join((ROOT/p).read_text(encoding='utf-8') for p in ['src/js/writer.mjs','src/css/writer.css','src/js/editor-content.js','src/js/article-math.js','src/js/publisher.mjs','src/js/draft-store.mjs','src/js/article-labs.js','src/js/article-code.js','src/js/editor-scroll.js','src/js/editor-source.js','assets/vendor/prism.js','src/css/reader.css','assets/vendor/THIRD_PARTY.md'])).encode()).hexdigest()[:12]
(OUT/'write.html').write_text(admin_entry(admin_url) if admin_url else editor_template.replace('{{EDITOR_VERSION}}', editor_version),encoding='utf-8')
if admin_url:
    (OUT/'draft-migration.html').write_text(draft_migration(admin_url), encoding='utf-8')
elif (OUT/'draft-migration.html').exists() and 'data-draft-migration' in (OUT/'draft-migration.html').read_text(encoding='utf-8'):
    (OUT/'draft-migration.html').unlink()
print(f'Built {len(POSTS)} posts, home, archive, search, RSS and sitemap. Version {VERSION}')
