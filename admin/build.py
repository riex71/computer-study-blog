"""Assemble the authenticated editor from stable modules, without patching JS."""
from pathlib import Path
import hashlib,shutil,sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from site_files import copy_runtime
from release_contract import write_runtime
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
OUT=HERE/'dist'

def build():
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir();identity=write_runtime(OUT);copy_runtime(OUT);shutil.copytree(ROOT/'assets',OUT/'assets')
    for name in ['private-admin.mjs','private-editor.mjs','migration.mjs','manage-posts.mjs','manage-posts.css']:
        shutil.copy2(HERE/name,OUT/name)
    shutil.copy2(HERE/'private-entry.mjs',OUT/'writer-entry.mjs')
    template=(ROOT/'templates/write.html').read_text(encoding='utf-8')
    sources=[p for p in OUT.iterdir() if p.is_file() and p.suffix in {'.mjs','.js','.css'}]
    version=hashlib.sha256((template+''.join(p.read_text(encoding='utf-8') for p in sorted(sources))).encode()).hexdigest()[:12]
    (OUT/'write.html').write_text(template.replace('{{EDITOR_VERSION}}',version).replace('{{RUNTIME_ID}}',identity),encoding='utf-8')
    print(f'Private editor prepared (version {version}). No remote service was changed.')

if __name__=='__main__':build()
