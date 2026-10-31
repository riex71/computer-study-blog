"""Collect only public site files for the Pages artifact."""
from pathlib import Path
import shutil
import json
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_site'
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
for file in ROOT.iterdir():
    if file.name in {'package.json','package-lock.json'}: continue
    if file.is_file() and (file.suffix in {'.html','.css','.js','.mjs','.json','.xml','.txt'} or file.name == '.nojekyll'):
        shutil.copy2(file, OUT / file.name)
for name in ['posts','assets','content','examples']:
    shutil.copytree(ROOT/name, OUT/name)
# Inactive sources stay in Git for owner recovery, never in the Pages artifact.
for entry in json.loads((ROOT/'content/deleted-posts.json').read_text(encoding='utf-8')):
    slug=entry['post']['slug']
    for suffix in ['md','html']:
        (OUT/'content/articles'/(slug+'.'+suffix)).unlink(missing_ok=True)
(OUT/'content/deleted-posts.json').unlink(missing_ok=True)
print('Packaged public files in _site/')
