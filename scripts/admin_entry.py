"""Replace the public editor only after its protected counterpart has been connected."""
from html import escape
import json
import re
from urllib.parse import urlsplit


def validated_origin(address):
    url = urlsplit(address)
    if (url.scheme != 'https' or not re.fullmatch(r'[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev', url.netloc)
            or url.path not in {'', '/'} or url.query or url.fragment):
        raise ValueError('BLOG_ADMIN_URL must be the exact HTTPS workers.dev origin.')
    return address.rstrip('/')


def admin_entry(address):
    target = validated_origin(address) + '/write.html'
    safe = json.dumps(target).replace('<', '\\u003c')
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>블로그 관리 — Studybase</title><link rel="stylesheet" href="blog.css"></head><body><main class="site-main" style="padding-top:15vh"><h1>블로그 관리</h1><p>글 작성과 수정은 로그인한 관리 화면에서 진행합니다.</p><p><a id="admin-link" class="text-link" href="{escape(target, quote=True)}">로그인하고 관리 화면 열기 ↗</a></p><p><a href="index.html">블로그로 돌아가기</a></p></main><script>const target=new URL({safe}),params=new URLSearchParams(location.search);if(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.get('edit')||''))target.searchParams.set('edit',params.get('edit'));else if(params.get('new')==='1')target.searchParams.set('new','1');document.getElementById('admin-link').href=target.href;</script></body></html>'''


def draft_migration(address):
    origin = validated_origin(address)
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>이전 원고 옮기기 — Studybase</title><link rel="stylesheet" href="blog.css"></head><body data-draft-migration data-admin-origin="{escape(origin, quote=True)}"><main class="site-main" style="max-width:650px;padding-top:12vh"><h1>이전 원고 옮기기</h1><p>이 브라우저에 저장된 임시 원고를 로그인한 관리 화면으로 가져옵니다. 원본은 그대로 남깁니다.</p><button id="transfer-drafts" class="text-button" disabled>원본을 남기고 사본 가져오기</button><p id="transfer-status" role="status">관리 화면에서 본인 로그인을 확인하는 중입니다.</p></main><script type="module" src="draft-transfer.mjs"></script></body></html>'''
