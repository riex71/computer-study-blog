"""Regenerate the static blog after editing content/posts.json or an article.

Run from any directory: python3 scripts/build.py
GitHub Pages serves the committed output directly; no runtime dependency is needed.
"""
from pathlib import Path
from html import escape, unescape
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://riex71.github.io/computer-study-blog'
AUTHOR = '윤동현'
POSTS = json.loads((ROOT / 'content/posts.json').read_text(encoding='utf-8'))
VERSION = hashlib.sha256(b''.join((ROOT / p).read_bytes() for p in ['blog.css', 'reader.css', 'blog.js'])).hexdigest()[:12]
BOOKMARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>'

class Plain(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

def text(html):
    p = Plain(); p.feed(html)
    return ' '.join(' '.join(p.parts).split())

def js(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c')

def header(prefix=''):
    return f'''<header class="site-header"><div class="header-inner">
      <a class="site-brand" href="{prefix}index.html" aria-label="Studybase 홈"><span class="brand-symbol" aria-hidden="true">S</span><span>STUDYBASE</span></a>
      <nav class="site-nav" aria-label="주 메뉴"><a href="{prefix}index.html#archive">아카이브</a><a href="{prefix}index.html#study-map">공부 지도</a><a href="{prefix}index.html#about">소개</a><a class="nav-notes" href="{prefix}notes.html">개인 노트 ↗</a></nav>
      <button class="theme-toggle" data-theme-toggle type="button" aria-label="어두운 화면으로 변경" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg></button>
    </div></header>'''

def footer(prefix=''):
    return f'''<footer class="site-footer"><div class="footer-inner"><a class="footer-brand" href="{prefix}index.html">STUDYBASE</a><span>© 2026 윤동현 · 읽고, 이해하고, 기록합니다.</span><div class="footer-links"><a href="https://github.com/riex71/computer-study-blog" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="{prefix}feed.xml">RSS ↗</a><a href="{prefix}index.html#main">맨 위로 ↑</a></div></div></footer>'''

def save_button(slug, label=False):
    return f'<button type="button" class="save-button" data-save="{slug}" aria-label="읽기 목록에 저장" aria-pressed="false">{BOOKMARK}' + ('<span data-save-label>나중에 읽기</span>' if label else '') + '</button>'

contents = {}
for post in POSTS:
    p = ROOT / 'posts' / (post['slug'] + '.html')
    source = p.read_text(encoding='utf-8')
    article = re.search(r'<article class="public-article">[\s\S]*?</article>', source)
    if not article:
        raise ValueError(f'Article body not found: {p}')
    body = re.sub(r'</?(?:strong|b)>', '', article.group())
    heading_count = [0]
    def heading(match):
        attrs, inner = match.groups()
        heading_count[0] += 1
        if 'id=' not in attrs:
            attrs += f' id="section-{heading_count[0]:02}"'
        return f'<h2{attrs}>{inner}</h2>'
    body = re.sub(r'<h2([^>]*)>([\s\S]*?)</h2>', heading, body)
    contents[post['slug']] = body
    post['minutes'] = max(1, math.ceil(len(re.sub(r'\s+', '', text(body))) / 600))

VERSION = hashlib.sha256((VERSION + js(POSTS) + ''.join(contents.values())).encode()).hexdigest()[:12]

def card(post):
    slug = post['slug']; url = f'posts/{slug}.html'
    haystack = ' '.join([post['title'], post['description'], *post['tags'], *post['topics']])
    tags = ''.join(f'<a href="?q={escape(tag, quote=True)}#archive">#{escape(tag)}</a>' for tag in post['tags'][:3])
    return f'''<article class="post-card" data-post-card data-slug="{slug}" data-title="{escape(post['title'], quote=True)}" data-date="{post['date']}" data-topics="{escape(js(post['topics']), quote=True)}" data-search-text="{escape(haystack, quote=True)}">
      <a class="card-image" href="{url}" tabindex="-1" aria-hidden="true"><img src="{post['thumbnail']}" width="1000" height="580" alt="" loading="lazy" decoding="async"></a>
      <div class="card-topline"><div class="article-kicker"><span class="category">{post['category']}</span><span>{escape(post['tags'][0])}</span></div>{save_button(slug)}</div>
      <h3><a href="{url}">{escape(post['title'])}</a></h3><p>{escape(post['description'])}</p><div class="card-tags">{tags}</div>
      <div class="card-footer"><time datetime="{post['date']}">{post['date'].replace('-', '.')}</time><span>·</span><span>{post['minutes']}분 읽기</span><a class="card-arrow" href="{url}" aria-label="{escape(post['shortTitle'], quote=True)} 읽기">↗</a></div>
    </article>'''

featured = POSTS[0]
featured_html = f'''<article class="feature-story"><div class="feature-art"><a href="posts/{featured['slug']}.html" aria-label="{escape(featured['title'], quote=True)} 읽기"><img src="{featured['thumbnail']}" width="615" height="368" alt="{escape(featured['thumbnailAlt'], quote=True)}" fetchpriority="high"></a><span class="art-credit"><a href="{featured['thumbnailSource']}" target="_blank" rel="noopener noreferrer">{featured['thumbnailCredit']}</a></span></div><div class="feature-copy"><div class="article-kicker"><span class="category">{featured['category']}</span><time datetime="{featured['date']}">{featured['date'].replace('-', '.')}</time><span>{featured['minutes']}분 읽기</span></div><h3><a href="posts/{featured['slug']}.html">{featured['title']}</a></h3><p>{featured['description']}</p><a class="text-link" href="posts/{featured['slug']}.html">논문 함께 읽기 <span aria-hidden="true">↗</span></a></div></article>'''
topics = list(dict.fromkeys(t for p in POSTS for t in p['topics']))
filters = '<button type="button" data-topic="" aria-pressed="true">전체</button>' + ''.join(f'<button type="button" data-topic="{t}" aria-pressed="false">{t}</button>' for t in topics)
schema = {'@context': 'https://schema.org', '@type': 'Blog', 'name': 'Studybase', 'url': BASE + '/', 'inLanguage': 'ko-KR', 'author': {'@type': 'Person', 'name': AUTHOR}, 'blogPost': [{'@type': 'BlogPosting', 'headline': p['title'], 'url': BASE+'/posts/'+p['slug']+'.html', 'datePublished': p['date']} for p in POSTS]}
home = (ROOT / 'templates/home.html').read_text(encoding='utf-8')
for key, value in {'BASE': BASE, 'VERSION': VERSION, 'COUNT': str(len(POSTS)), 'HEADER': header(), 'FOOTER': footer(), 'JSONLD': js(schema), 'FEATURED': featured_html, 'FILTERS': filters, 'CARDS': '\n'.join(card(p) for p in POSTS)}.items():
    home = home.replace('{{'+key+'}}', value)
assert '{{' not in home
(ROOT / 'index.html').write_text(home, encoding='utf-8')

for post in POSTS:
    body = contents[post['slug']]
    toc = ''.join(f'<a data-toc-link href="#{escape(m.group(1), quote=True)}">{escape(text(m.group(2)))}</a>' for m in re.finditer(r'<h2[^>]*id="([^"]+)"[^>]*>([\s\S]*?)</h2>', body))
    other = next(p for p in POSTS if p['slug'] != post['slug'])
    url = BASE + '/posts/' + post['slug'] + '.html'
    article_schema = {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': post['title'], 'description': post['description'], 'datePublished': post['date'], 'dateModified': '2026-10-29', 'author': {'@type': 'Person', 'name': AUTHOR, 'url': BASE+'/#about'}, 'mainEntityOfPage': url, 'image': BASE+'/assets/social-cover.png', 'inLanguage': 'ko-KR'}
    extra_css = f'<link rel="stylesheet" href="engram.css?v={VERSION}">' if post['slug'].startswith('engram') else ''
    page = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(post['title'])} — Studybase</title><meta name="description" content="{escape(post['description'], quote=True)}"><meta name="theme-color" content="#f7f6f2"><link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:title" content="{escape(post['title'], quote=True)}"><meta property="og:description" content="{escape(post['description'], quote=True)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}/assets/social-cover.png"><meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Studybase RSS" href="../feed.xml"><link rel="icon" href="../assets/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500&display=swap" rel="stylesheet">
<script>try{{if(localStorage.getItem('studybase.theme')==='dark')document.documentElement.dataset.theme='dark'}}catch(e){{}}</script>
<link rel="stylesheet" href="../blog.css?v={VERSION}">{extra_css}<link rel="stylesheet" href="../reader.css?v={VERSION}"><script src="../blog.js?v={VERSION}" defer></script><script type="application/ld+json">{js(article_schema)}</script></head>
<body data-page="article" class="public-article-page {'engram-article-page' if post['slug'].startswith('engram') else ''}"><a class="skip-link" href="#main">본문으로 건너뛰기</a><div class="reading-progress" data-reading-progress aria-hidden="true"></div>{header('../')}
<div class="reading-shell"><aside class="article-toc" aria-label="이 글의 목차"><div class="toc-heading">이 글의 목차 <span data-progress-label>0%</span></div><nav class="toc-nav">{toc}</nav><a class="toc-home" href="../index.html#archive">← 모든 기록으로</a></aside>
<main id="main" class="article-layout"><header class="article-header"><div class="article-kicker"><span class="category">{post['category']}</span><span>{escape(post['tags'][0])}</span><span>{post['minutes']}분 읽기</span></div><h1>{escape(post['title'])}</h1><p class="article-deck">{escape(post['deck'])}</p><div class="article-meta"><span>{AUTHOR}</span><time datetime="{post['date']}">{post['date'].replace('-', '.')}</time><span>{escape(' · '.join(post['tags'][:3]))}</span></div></header>
<div class="article-tools">{save_button(post['slug'], True)}<button type="button" data-copy-link>링크 복사 ↗</button><span class="saved-note">읽기 목록은 이 브라우저에 저장됩니다.</span></div><details class="mobile-toc"><summary>이 글의 목차</summary><nav class="toc-nav" aria-label="모바일 목차">{toc}</nav></details>
{body}
<section class="article-end" aria-label="이어 읽기"><p>KEEP EXPLORING</p><a class="related-story" href="{other['slug']}.html"><span>{escape(other['title'])}</span><span aria-hidden="true">↗</span></a><div class="article-end-links"><a href="../index.html#study-map">공부 지도 보기</a><a href="#main">맨 위로 ↑</a></div></section></main></div>{footer('../')}<div class="blog-toast" data-toast role="status" aria-live="polite"></div></body></html>'''
    (ROOT / 'posts' / (post['slug'] + '.html')).write_text(page, encoding='utf-8')

index = [{'slug': p['slug'], 'search': ' '.join([p['title'], p['description'], *p['tags'], *p['topics'], text(contents[p['slug']])])} for p in POSTS]
(ROOT / 'search-index.json').write_text(js(index), encoding='utf-8')
rss = ET.Element('rss', version='2.0'); channel = ET.SubElement(rss, 'channel')
for name, value in [('title','Studybase — AI 공부 기록'),('link',BASE+'/'),('description','논문을 읽고 원리를 연결하는 윤동현의 AI 공부 기록'),('language','ko-KR')]: ET.SubElement(channel,name).text=value
for p in POSTS:
    item = ET.SubElement(channel,'item'); link = BASE+'/posts/'+p['slug']+'.html'
    for name,value in [('title',p['title']),('link',link),('guid',link),('description',p['description']),('pubDate',format_datetime(datetime.fromisoformat(p['date']).replace(tzinfo=timezone(timedelta(hours=9)))))]: ET.SubElement(item,name).text=value
ET.indent(rss); ET.ElementTree(rss).write(ROOT/'feed.xml',encoding='utf-8',xml_declaration=True)
ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
urlset=ET.Element('{http://www.sitemaps.org/schemas/sitemap/0.9}urlset')
for location,date in [(BASE+'/','2026-10-29')]+[(BASE+'/posts/'+p['slug']+'.html',p['date']) for p in POSTS]:
    node=ET.SubElement(urlset,'url'); ET.SubElement(node,'loc').text=location; ET.SubElement(node,'lastmod').text=date
ET.indent(urlset); ET.ElementTree(urlset).write(ROOT/'sitemap.xml',encoding='utf-8',xml_declaration=True)
(ROOT/'404.html').write_text(f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없어요 — Studybase</title><link rel="stylesheet" href="{BASE}/blog.css?v={VERSION}"></head><body><main class="site-main" style="padding-top:18vh"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1 style="font-size:40px;margin-top:25px">이 기록은 아직 없거나,<br>주소가 바뀌었어요.</h1><p class="quiet">아카이브에서 찾고 있던 글을 다시 찾아보세요.</p><a class="text-link" href="{BASE}/#archive">아카이브로 돌아가기 ↗</a></main></body></html>''',encoding='utf-8')
print(f'Built {len(POSTS)} posts, homepage, search index, RSS, sitemap and 404. Version {VERSION}')
