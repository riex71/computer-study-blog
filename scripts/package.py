"""Collect only public site files for the Pages artifact."""
from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_site'
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
for file in ROOT.iterdir():
    if file.is_file() and (file.suffix in {'.html','.css','.js','.mjs','.json','.xml','.txt'} or file.name == '.nojekyll'):
        shutil.copy2(file, OUT / file.name)
for name in ['posts','assets','content']:
    shutil.copytree(ROOT/name, OUT/name)
print('Packaged public files in _site/')
