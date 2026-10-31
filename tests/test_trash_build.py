"""Run complete deletion/restore builds against a disposable copy, never real posts."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
class TrashBuild(unittest.TestCase):
    def test_delete_last_post_and_restore(self):
        node=os.environ.get('STUDYBASE_NODE') or shutil.which('node') or shutil.which('node.exe')
        self.assertTrue(node, 'Node is required for the build')
        env=os.environ.copy();env['STUDYBASE_NODE']=node
        modules=str(ROOT/'node_modules')
        if node.endswith('.exe'):
            modules=subprocess.check_output(['wslpath','-w',modules],text=True).strip()
            env['WSLENV']=env.get('WSLENV','')+':NODE_PATH'
        env['NODE_PATH']=modules
        with tempfile.TemporaryDirectory(prefix='trash-fixture-',dir=ROOT.parent) as folder:
            fixture=Path(folder)/'site'
            shutil.copytree(ROOT,fixture,ignore=shutil.ignore_patterns('.git','node_modules','admin','_site','__pycache__'))
            originals=json.loads((fixture/'content/posts.json').read_text())
            deleted=[]
            def build(active):
                (fixture/'content/posts.json').write_text(json.dumps(active))
                (fixture/'content/deleted-posts.json').write_text(json.dumps(deleted))
                for script in ['build.py','check.py','package.py']:
                    result=subprocess.run(['python3',str(fixture/'scripts'/script)],cwd=fixture,env=env,capture_output=True,text=True)
                    self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                public=fixture/'_site'
                self.assertFalse((public/'content/deleted-posts.json').exists())
                self.assertEqual({p['slug'] for p in json.loads((public/'search-index.json').read_text())},{p['slug'] for p in active})
                for item in deleted:
                    slug=item['post']['slug'];html=(public/'posts'/(slug+'.html')).read_text()
                    self.assertIn('data-deleted-article="'+slug+'"',html)
                    self.assertIn('noindex',html)
                    self.assertNotIn('class="public-article"',html)
                    for suffix in ['md','html']:self.assertFalse((public/'content/articles'/(slug+'.'+suffix)).exists())
                    self.assertTrue((fixture/item['post']['sourceMarkdown']).exists())
                    for filename in ['feed.xml','sitemap.xml','series.html']:
                        self.assertNotIn('posts/'+slug+'.html',(public/filename).read_text())
            deleted.append({'id':'fixture-1','post':originals[0]});build(originals[1:])
            deleted.append({'id':'fixture-2','post':originals[1]});build([])
            deleted.pop(0);build([originals[0]])
            self.assertIn('class="public-article"',(fixture/'_site/posts'/(originals[0]['slug']+'.html')).read_text())
