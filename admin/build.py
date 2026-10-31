"""Package the existing editor for the separately authenticated Worker. No publication."""
from pathlib import Path
import hashlib
import shutil
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from site_files import copy_runtime

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / 'dist'


def replace_once(source, old, new):
    assert source.count(old) == 1, f'Editor integration changed: {old[:80]}'
    return source.replace(old, new, 1)


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    copy_runtime(OUT)
    shutil.copytree(ROOT / 'assets', OUT / 'assets')
    shutil.copy2(HERE / 'private-admin.mjs', OUT / 'private-admin.mjs')
    shutil.copy2(HERE / 'migration.mjs', OUT / 'migration.mjs')

    for name in ['manage-posts.mjs','manage-posts.css']:
        shutil.copy2(HERE / name, OUT / name)

    writer = (ROOT / 'src/js/writer.mjs').read_text(encoding='utf-8')
    writer = "import { createPostManager } from './manage-posts.mjs';\nimport { SessionPublisher } from './private-admin.mjs';\nimport { connectMigration } from './migration.mjs';\n" + writer
    writer = replace_once(writer, "'posts/'+draft.post.slug+'.html':'index.html'", "new URL('posts/'+draft.post.slug+'.html',LIVE).href:LIVE")
    writer = replace_once(writer, 'draft.images,draft.post.slug);', 'draft.images,draft.post.slug,LIVE);')
    writer, count = re.subn(r'function populatePosts\(\)\{.*?\n\}\nasync function loadPost', 'function populatePosts(){postManager.render(posts); }\nasync function loadPost', writer, count=1, flags=re.S)
    assert count == 1
    bootstrap = """const postManager = createPostManager({publisher:()=>publisher,edit:slug=>{closeDialog('library-dialog');loadPost(slug);},isBusy:()=>busy,begin:async()=>{busy=true;const unlock=lockEditor();try{await save('공개 글 관리 전');if(storageFailed)throw Error('현재 원고를 먼저 내려받아 보관해 주세요.');return unlock;}catch(error){unlock();busy=false;throw error;}},end:()=>{busy=false;$('#post-slug').disabled=!!draft.original||!!draft.images.length;renderDrafts();},changed:(state,removed)=>{posts=state.posts;if(removed&&draft?.original?.post.slug===removed)fill(blank());}});
async function connectPrivate() {
  const connected = await SessionPublisher.connect();
  publisher?.disconnect(); publisher = connected;
  $('#connection-state').textContent = publisher.login + ' · 로그인됨';
  $('#connect-form').hidden = true; $('#token-help').hidden = true;
}
connectMigration({button:$('#private-migrate'),store:draftStore,publicURL:LIVE,authorize:async()=>{const session=await SessionPublisher.connect();session.disconnect();},beforeImport:async()=>{if(busy)throw Error('현재 작업이 끝난 뒤 원고를 옮겨 주세요.');await save();if(storageFailed)throw Error('현재 원고를 먼저 내려받아 보관해 주세요.');},onImport:async result=>{await refreshDrafts();message(result.imported+'개 원고의 사본을 가져왔습니다. 원본은 그대로 남아 있습니다.'+(result.skipped?' 이미 가져온 '+result.skipped+'개는 유지했습니다.':''));openDialog('library-dialog');},onError:error=>message(error.message)});
addEventListener('pageshow', event => { if(event.persisted)connectPrivate().catch(error=>message(error.message)); });
$('#private-logout').addEventListener('click',async()=>{if(busy)return;try{await save();if(storageFailed)throw Error('임시 저장에 실패했습니다. 원고를 내려받은 뒤 로그아웃해 주세요.');await publisher.logout();location.assign('/write.html');}catch(error){message(error.message);}});
try {
  await connectPrivate();
} catch (error) {
  message(error.message + ' 원고를 보관한 뒤 새로고침해 다시 로그인해 주세요.');
  throw error;
}
"""
    writer = replace_once(writer, 'try {drafts=await draftStore.list();', bootstrap + 'try {drafts=await draftStore.list();')
    writer = replace_once(writer, "$('#review-connect').addEventListener('click',()=>{returnToReview=true;openDialog('connect-dialog');$('#github-token').focus()});", "$('#review-connect').addEventListener('click',async()=>{try{await connectPrivate();$('#review-button').click();}catch(error){message(error.message);}});")
    (OUT / 'writer.mjs').write_text(writer, encoding='utf-8')
    template = (ROOT / 'templates/write.html').read_text(encoding='utf-8')
    template = replace_once(template, '<body data-page="writer">', '<body data-page="writer" data-private-admin="true">')
    template = replace_once(template, '<span id="draft-status"', '<button type="button" id="private-logout" class="writer-back">로그아웃</button><span id="draft-status"')
    template = replace_once(template, '블로그 연결 관리', '로그인 정보')
    template = replace_once(template, '<footer class="library-footer">', '<footer class="library-footer" style="flex-wrap:wrap"><button type="button" id="private-migrate">이전 원고 옮기기</button>')
    template = replace_once(template, '<h2 id="connect-title">블로그 연결</h2>', '<h2 id="connect-title">로그인 정보</h2>')
    template = replace_once(template, '게시하려면 GitHub에 한 번 연결하세요.', '본인 계정으로 로그인했습니다.')
    template = replace_once(template, '토큰은 이 창에서만 사용하며 새로고침하면 지워집니다.', '게시 권한은 서버에서 확인합니다. 이 창에 GitHub 토큰을 입력하지 않아도 됩니다.')
    template = template.replace('<form id="connect-form">', '<form id="connect-form" hidden>').replace('<details id="token-help">', '<details id="token-help" hidden>')
    template = template.replace('</head>', '<link rel="stylesheet" href="manage-posts.css"></head>')
    version = hashlib.sha256((writer + template + (HERE / 'private-admin.mjs').read_text()).encode()).hexdigest()[:12]
    (OUT / 'write.html').write_text(template.replace('{{EDITOR_VERSION}}', version), encoding='utf-8')
    print(f'Private editor prepared in admin/dist (version {version}). No remote service was changed.')


if __name__ == '__main__':
    build()
