"""Exercise arbitrary articles, a growing archive, and deletion without real posts."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
class GenericSiteBuild(unittest.TestCase):
    def test_generic_articles_growth_delete_and_restore(self):
        node=os.environ.get('STUDYBASE_NODE') or shutil.which('node') or shutil.which('node.exe')
        self.assertTrue(node)
        env=os.environ.copy();env['STUDYBASE_NODE']=node;modules=str(ROOT/'node_modules')
        if node.endswith('.exe'):
            modules=subprocess.check_output(['wslpath','-w',modules],text=True).strip();env['WSLENV']=env.get('WSLENV','')+':NODE_PATH'
        env['NODE_PATH']=modules
        body='## 원리 {#principle}\n\n### 구조\n\n#### 세부\n\n수식 $x_i + 1$\n\n```python\nprint(1)\n```\n\n![그림](../assets/social-cover.png)\n\n| 이름 | 값 |\n| --- | ---: |\n| A | 1 |\n\n:::hash-demo\n:::\n'
        with tempfile.TemporaryDirectory(prefix='generic-site-',dir=ROOT.parent) as directory:
            site=Path(directory)/'source';shutil.copytree(ROOT,site,ignore=shutil.ignore_patterns('.git','node_modules','admin','_site','__pycache__'))
            shutil.rmtree(site/'content/articles');(site/'content/articles').mkdir()
            posts=[]
            for index in range(15):
                slug=['os-page-tables','engram-unrelated-title','plain-note'][index] if index<3 else 'note-'+str(index)
                posts.append(dict(slug=slug,title='CS 기록 '+str(index),date='2026-10-31',description='범용 글 검사',category='공부 노트',topics=['주제'+str(index)],tags=[],sourceMarkdown='content/articles/'+slug+'.md',sourceHtml='content/articles/'+slug+'.html'))
                (site/posts[-1]['sourceMarkdown']).write_text(body if index!=2 else '제목 없는 짧은 기록',encoding='utf-8')
            sources={str(p.relative_to(site)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (site/'src').rglob('*') if p.is_file()}
            deleted=[]
            def build(active):
                (site/'content/posts.json').write_text(json.dumps(active));(site/'content/deleted-posts.json').write_text(json.dumps(deleted))
                for script in ['build.py','check.py']:
                    run=subprocess.run(['python3',str(site/'scripts'/script)],cwd=site,env=env,text=True,capture_output=True);self.assertEqual(run.returncode,0,run.stdout+run.stderr)
                out=site/'_site';self.assertFalse((out/'content/deleted-posts.json').exists());self.assertFalse(list((site/'content/articles').glob('*.html')))
                self.assertFalse((site/'index.html').exists());self.assertFalse((out/'admin').exists())
                self.assertEqual({p['slug'] for p in json.loads((out/'search-index.json').read_text())},{p['slug'] for p in active})
                for record in deleted:
                    slug=record['post']['slug'];html=(out/'posts'/(slug+'.html')).read_text();self.assertIn('data-deleted-article="'+slug+'"',html);self.assertIn('noindex',html);self.assertNotIn('class="public-article"',html)
                    for suffix in ['md','html']:self.assertFalse((out/'content/articles'/(slug+'.'+suffix)).exists())
                    self.assertTrue((site/record['post']['sourceMarkdown']).exists())
                    for name in ['feed.xml','sitemap.xml','series.html']:self.assertNotIn('posts/'+slug+'.html',(out/name).read_text())
                return out
            out=build(posts)
            first=(out/'posts/os-page-tables.html').read_text();second=(out/'posts/engram-unrelated-title.html').read_text()
            resources=lambda html:re.findall(r'(?:src|href)="([^\"]+\.(?:css|js)[^\"]*)"',html)
            self.assertEqual(resources(first),resources(second))
            for html in [first,second]:
                for marker in ['id="principle"','<h4','math-inline','language-python','<table','class="hash-demo"','../assets/social-cover.png']:self.assertIn(marker,html)
                self.assertNotIn('engram-article-page',html);self.assertNotIn('engram.css',html)
            self.assertIn('class="toc-rail" hidden',(out/'posts/plain-note.html').read_text())
            home=(out/'index.html').read_text();self.assertEqual(home.count('class="post-card"'),6);self.assertIn('모든 주제',home)
            deleted.append({'id':'fixture-first','post':posts[0]});build(posts[1:])
            deleted[:]=[{'id':'fixture-'+str(i),'post':p} for i,p in enumerate(posts)];build([])
            deleted.pop(0);out=build([posts[0]]);self.assertIn('class="public-article"',(out/'posts/os-page-tables.html').read_text())
            self.assertEqual(sources,{str(p.relative_to(site)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (site/'src').rglob('*') if p.is_file()})
