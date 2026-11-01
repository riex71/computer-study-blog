"""Content-independent identity shared by public rendering and the editor."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parent.parent

def runtime_id():
    files=[*list((ROOT/'src').rglob('*.js')),*list((ROOT/'src').rglob('*.mjs')),*list((ROOT/'src').rglob('*.css')),ROOT/'templates/write.html',ROOT/'scripts/markdown.cjs']
    files += [ROOT/'assets/vendor'/name for name in ['marked.js','purify.js','turndown.js','prism.js','katex/katex.min.js','katex/katex.min.css']]
    digest=hashlib.sha256()
    for file in sorted(files):
        digest.update(file.relative_to(ROOT).as_posix().encode());digest.update(b'\0');digest.update(file.read_bytes().replace(b'\r\n',b'\n'));digest.update(b'\0')
    return digest.hexdigest()

def write_runtime(destination):
    identity=runtime_id();(destination/'runtime.json').write_text(json.dumps({'runtime':identity,'contract':1}),encoding='utf-8');return identity
