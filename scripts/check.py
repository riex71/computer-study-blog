"""Validate the generated site's links, feeds, metadata and assets locally."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://riex71.github.io/computer-study-blog/'

class Document(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=set(); self.links=[]; self.duplicates=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a:
            if a['id'] in self.ids:self.duplicates.append(a['id'])
            self.ids.add(a['id'])
        for attr in ['src', 'href']:
            if attr in a:self.links.append(a[attr])
        if tag=='meta' and a.get('property')=='og:image':self.links.append(a['content'])

documents={}
for file in ROOT.rglob('*.html'):
    if '.git' in file.parts or 'templates' in file.parts:continue
    d=Document();d.feed(file.read_text(encoding='utf-8'));documents[file.resolve()]=d
    assert not d.duplicates, f'Duplicate IDs in {file}: {d.duplicates}'

for file, d in documents.items():
    for link in d.links:
        if link.startswith(BASE):target=ROOT / unquote(urlsplit(link).path.removeprefix('/computer-study-blog/'))
        else:
            url=urlsplit(link)
            if url.scheme or url.netloc:continue
            target=file.parent/unquote(url.path) if url.path else file
        target=target.resolve()
        assert target.exists(), f'Missing local link in {file.name}: {link}'
        fragment=urlsplit(link).fragment
        if fragment and target in documents:assert fragment in documents[target].ids,f'Missing anchor in {file.name}: {link}'

posts=json.loads((ROOT/'content/posts.json').read_text(encoding='utf-8'))
assert len({p['slug'] for p in posts})==len(posts),'Duplicate post slugs'
for p in posts:assert (ROOT/'posts'/(p['slug']+'.html')).exists(),p['slug']
search=json.loads((ROOT/'search-index.json').read_text(encoding='utf-8'))
assert {p['slug'] for p in search}=={p['slug'] for p in posts},'Search index out of date'
feed=ET.parse(ROOT/'feed.xml')
for item in feed.findall('./channel/item'):
    assert item.findtext('link').startswith(BASE)
    assert (ROOT/item.findtext('link').removeprefix(BASE)).exists()
ET.parse(ROOT/'sitemap.xml')
print(f'Checked {len(documents)} pages, all local links/anchors/assets, {len(posts)} search records, RSS and sitemap.')
