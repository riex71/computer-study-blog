(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const assetVersion = document.currentScript ? new URL(document.currentScript.src).search : '';
  const storage = { get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } } };
  function readSaved(fallback=[]){try{const value=JSON.parse(storage.get('studybase.reading.v1',JSON.stringify(fallback)));return new Set(Array.isArray(value)?value.filter(x=>typeof x==='string'):fallback);}catch{return new Set(fallback);}}
  let saved=readSaved();
  let toastTimer;
  function toast(message) { const el = $('[data-toast]'); if (!el) return; clearTimeout(toastTimer); el.textContent = message; el.classList.add('show'); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
  function updateTheme() { const dark = document.documentElement.dataset.theme === 'dark'; $$('[data-theme-toggle]').forEach(button => { button.setAttribute('aria-pressed', String(dark)); button.setAttribute('aria-label', dark ? '밝은 화면으로 변경' : '어두운 화면으로 변경'); }); }
  $$('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme; storage.set('studybase.theme', dark ? 'dark' : 'light'); updateTheme(); }));
  updateTheme();
  function updateSaved() { $$('[data-save]').forEach(button => { const active = saved.has(button.dataset.save); button.setAttribute('aria-pressed', String(active)); button.setAttribute('aria-label', active ? '읽기 목록에서 해제' : '읽기 목록에 저장'); const label = button.querySelector('[data-save-label]'); if (label) label.textContent = active ? '저장됨' : '나중에 읽기'; }); }
  $$('[data-save]').forEach(button => button.addEventListener('click', () => { saved=readSaved([...saved]);const slug = button.dataset.save; if (saved.has(slug)) saved.delete(slug); else saved.add(slug); const persisted = storage.set('studybase.reading.v1', JSON.stringify([...saved])); updateSaved(); filterPosts(); toast(persisted ? (saved.has(slug) ? '이 브라우저의 읽기 목록에 저장했어요.' : '읽기 목록에서 해제했어요.') : '브라우저 저장소를 사용할 수 없어 이 화면에서만 유지됩니다.'); }));
  updateSaved();
  addEventListener('storage',event=>{if(event.key==='studybase.reading.v1'){saved=readSaved();updateSaved();filterPosts(false);}if(event.key==='studybase.theme'){if(event.newValue==='dark')document.documentElement.dataset.theme='dark';else delete document.documentElement.dataset.theme;updateTheme();}});
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko-KR');
  function highlightText(container,text,terms){
    container.replaceChildren();
    if(!terms.length){container.textContent=text;return;}
    const pattern=new RegExp(terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'giu');
    let cursor=0,match;
    while((match=pattern.exec(text))){
      container.append(document.createTextNode(text.slice(cursor,match.index)));
      const mark=document.createElement('mark');mark.className='search-match';mark.textContent=match[0];container.append(mark);cursor=match.index+match[0].length;
    }
    container.append(document.createTextNode(text.slice(cursor)));
  }
  function searchExcerpt(post,terms){
    if(!terms.length)return post.description;
    const body=post.text||post.description,normalized=normalize(body);
    const positions=terms.map(term=>normalized.indexOf(term)).filter(index=>index>=0);
    if(!positions.length)return post.description;
    const start=Math.max(0,Math.min(...positions)-35),end=start+155;
    return (start?'…':'')+body.slice(start,end)+(body.length>end?'…':'');
  }
  $$('.site-nav a').forEach(link=>{const url=new URL(link.href);if(!url.hash&&url.pathname===location.pathname)link.setAttribute('aria-current','page');});

  const cards = $$('[data-post-card]');
  const cardDescriptions=new Map(cards.map(card=>[card.dataset.slug,card.querySelector('.card-copy>p').textContent]));
  let topic = '', savedOnly = false, searchContent = new Map(),searchPosts=new Map();
  const search = $('[data-search]'), sort = $('[data-sort]');
  function filterPosts(updateURL = true) {
    if (!search || !sort) return;
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let visible = 0;
    cards.sort((a, b) => sort.value === 'title' ? a.dataset.title.localeCompare(b.dataset.title, 'ko') : (sort.value === 'oldest' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date)));
    cards.forEach(card => {
      const text = normalize(searchContent.get(card.dataset.slug) || card.dataset.searchText);
      const show = (!topic || JSON.parse(card.dataset.topics).includes(topic)) && (!savedOnly || saved.has(card.dataset.slug)) && terms.every(term => text.includes(term));
      card.hidden = !show; if (show) visible++;
      highlightText(card.querySelector('h3 a'),card.dataset.title,terms);
      const post=searchPosts.get(card.dataset.slug)||{description:cardDescriptions.get(card.dataset.slug)};
      highlightText(card.querySelector('.card-copy>p'),searchExcerpt(post,terms),terms);
      $('[data-post-grid]').append(card);
    });
    $('[data-result-count]').textContent = `${visible}편의 글`;
    $('[data-search-empty]').hidden = visible !== 0;
    $('[data-search-status]').textContent = `${visible}편의 글을 찾았습니다.`;
    $$('[data-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === topic)));
    $('[data-saved-filter]').setAttribute('aria-pressed', String(savedOnly));
    if (updateURL && location.protocol !== 'file:') { const url = new URL(location.href); for (const key of ['q', 'topic', 'saved', 'sort']) url.searchParams.delete(key); if (search.value.trim()) url.searchParams.set('q', search.value.trim()); if (topic) url.searchParams.set('topic', topic); if (savedOnly) url.searchParams.set('saved', '1'); if (sort.value !== 'newest') url.searchParams.set('sort', sort.value); history.replaceState(null, '', url); }
  }
  if (search && sort) {
    $('[data-search-controls]').hidden = false;
    const params = new URLSearchParams(location.search);
    search.value = params.get('q') || '';
    if ($$('[data-topic]').some(button => button.dataset.topic === params.get('topic'))) topic = params.get('topic');
    savedOnly = params.get('saved') === '1';
    if (['newest', 'oldest', 'title'].includes(params.get('sort'))) sort.value = params.get('sort');
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => filterPosts(), 80); });
    sort.addEventListener('change', () => filterPosts());
    $$('[data-topic]').forEach(button => button.addEventListener('click', () => { topic = button.dataset.topic; filterPosts(); }));
    $('[data-saved-filter]').addEventListener('click', () => { savedOnly = !savedOnly; filterPosts(); });
    $('[data-reset-filters]').addEventListener('click', () => { search.value = ''; topic = ''; savedOnly = false; sort.value = 'newest'; filterPosts(); search.focus(); });
    document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); search.focus(); } });
    filterPosts(false);
    fetch('search-index.json' + assetVersion).then(r => { if (!r.ok) throw new Error('Search index unavailable'); return r.json(); }).then(posts => { searchContent = new Map(posts.map(post => [post.slug, post.search]));searchPosts=new Map(posts.map(post=>[post.slug,post])); filterPosts(false); }).catch(() => { /* Metadata search remains available when offline. */ });
  }
  const siteRoot = new URL(document.body.dataset.page === 'article' ? '../' : './', location.href);
  let globalIndex,globalIndexRequest,searchEpoch=0;
  const searchDialog = $('[data-search-dialog]');
  const globalSearch = $('[data-global-search]');
  const globalResults = $('[data-global-results]');
  const globalStatus=$('[data-global-status]');
  async function searchAll() {
    const epoch=++searchEpoch,terms=normalize(globalSearch.value.trim()).split(/\s+/).filter(Boolean);
    globalStatus.textContent='글을 찾는 중…';
    try {
      globalIndexRequest ||= fetch(new URL('search-index.json'+assetVersion,siteRoot)).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(error=>{globalIndexRequest=undefined;throw error;});
      globalIndex ||= await globalIndexRequest;
      if(epoch!==searchEpoch)return;
      const matches=globalIndex.filter(post=>terms.every(term=>normalize(post.search).includes(term)));
      globalResults.replaceChildren();
      globalStatus.textContent=terms.length?`${matches.length}편의 글을 찾았습니다.`:`전체 ${matches.length}편 · 제목과 본문에서 검색합니다.`;
      for(const post of matches){
        const link=document.createElement('a');link.href=new URL('posts/'+post.slug+'.html',siteRoot);
        const date=document.createElement('small');date.textContent=post.date+' · '+post.tags.slice(0,2).join(' · ');
        const title=document.createElement('h3');highlightText(title,post.title,terms);
        const excerpt=document.createElement('p');highlightText(excerpt,searchExcerpt(post,terms),terms);
        link.append(date,title,excerpt);globalResults.append(link);
      }
      if(!matches.length){const empty=document.createElement('p');empty.className='global-empty';empty.textContent='다른 검색어를 입력하거나 모든 글을 둘러보세요.';const archive=document.createElement('a');archive.href=new URL('archive.html',siteRoot);archive.textContent='모든 글 보기 →';globalResults.append(empty,archive);}
    }catch{if(epoch===searchEpoch){globalStatus.textContent='검색을 불러오지 못했습니다.';globalResults.replaceChildren();const link=document.createElement('a');link.href=new URL('archive.html',siteRoot);link.textContent='아카이브에서 글 찾기 →';globalResults.append(link);}}
  }
  function openSearch(){
    $$('.reader-popover[open]').forEach(details=>{const focused=details.contains(document.activeElement);details.open=false;if(focused)details.querySelector('summary').focus({preventScroll:true});});
    if(!searchDialog.open)searchDialog.showModal();globalSearch.focus();searchAll();
  }
  $$('[data-open-search]').forEach(button=>button.addEventListener('click',openSearch));
  $('[data-close-search]')?.addEventListener('click', () => searchDialog.close());
  let globalTimer; globalSearch?.addEventListener('input', () => { ++searchEpoch;clearTimeout(globalTimer); globalTimer = setTimeout(searchAll, 100); });
  searchDialog?.addEventListener('close',()=>{++searchEpoch;clearTimeout(globalTimer);});
  searchDialog?.addEventListener('click', e => { if (e.target === searchDialog && (e.clientX < searchDialog.getBoundingClientRect().left || e.clientX > searchDialog.getBoundingClientRect().right || e.clientY < searchDialog.getBoundingClientRect().top || e.clientY > searchDialog.getBoundingClientRect().bottom)) searchDialog.close(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && searchDialog) { e.preventDefault();openSearch(); }
    if (!searchDialog?.open) return;
    const links = [...globalResults.querySelectorAll('a')]; const current = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); links[Math.min(current + 1, links.length - 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (current <= 0) globalSearch.focus(); else links[current - 1].focus(); }
    if (e.key === 'Enter' && document.activeElement === globalSearch && links.length) { e.preventDefault(); links[0].click(); }
  });
  $$('.reader-popover').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)$$('.reader-popover').filter(other=>other!==details).forEach(other=>other.open=false);}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const details=document.activeElement?.closest('.reader-popover');if(details?.open){details.open=false;details.querySelector('summary').focus();}}});
  document.addEventListener('pointerdown',event=>{$$('.reader-popover[open]').filter(details=>!details.contains(event.target)).forEach(details=>details.open=false);});
  const article = document.body.dataset.page === 'article' ? $('.public-article') : null;
  if (article) {
    let font = Number(storage.get('studybase.font', '0')) || 0;
    const setFont = () => { article.style.setProperty('--reading-size', `${(innerWidth <= 600 ? 16 : 17) + font}px`); };
    $$('[data-font]').forEach(b => b.addEventListener('click', () => { font = Math.max(-2, Math.min(4, font + Number(b.dataset.font))); setFont(); storage.set('studybase.font', String(font)); }));
    setFont(); addEventListener('resize', setFont);
    const zoom = document.createElement('dialog'); zoom.className = 'figure-dialog'; zoom.setAttribute('aria-label', '그림 크게 보기');
    const top = document.createElement('div'); top.className = 'dialog-top';
    const zoomTitle = document.createElement('span'); zoomTitle.textContent = '그림 크게 보기';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기 · Esc'; close.addEventListener('click', () => zoom.close());
    const zoomImg = document.createElement('img'), caption = document.createElement('p'); top.append(zoomTitle, close); zoom.append(top, zoomImg, caption); document.body.append(zoom);
    article.querySelectorAll('img').forEach(img => {
      img.dataset.zoomable = '';
      let trigger=img.closest('a');
      if(!trigger){trigger=document.createElement('button');trigger.type='button';trigger.className='figure-zoom-trigger';img.before(trigger);trigger.append(img);}
      trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-label',(img.alt||'논문 그림')+' 크게 보기');
      const open = () => { zoomImg.src = img.currentSrc || img.src; zoomImg.alt = img.alt; caption.textContent = img.closest('figure')?.querySelector('figcaption')?.textContent || img.alt; zoom.showModal(); close.focus(); };
      trigger.addEventListener('click',e=>{e.preventDefault();open();});
      if(trigger.tagName==='A')trigger.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();open();}});
    });
    zoom.addEventListener('click', e => { if (e.target === zoom) zoom.close(); });

    article.querySelectorAll('table').forEach(table=>{
      if(table.parentElement.matches('.engram-table-wrap,.table-scroll'))return;
      const wrapper=document.createElement('div');wrapper.className='table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label',(table.querySelector('caption')?.textContent.trim()||'본문 표')+', 가로 스크롤 가능');table.before(wrapper);wrapper.append(table);
    });
    const mobileToc=$('.mobile-toc'),articleTools=$('.article-tools');
    const compactScreen=matchMedia('(max-width:1439px)');
    const floatToc=()=>{
      if(!mobileToc||mobileToc.hidden)return;
      const headerHeight=$('.site-header')?.offsetHeight||72;
      const floating=compactScreen.matches&&articleTools.getBoundingClientRect().bottom<headerHeight+8&&article.getBoundingClientRect().bottom>headerHeight+140;
      if(mobileToc.classList.contains('is-floating')===floating)return;
      if(mobileToc.open){const focused=mobileToc.contains(document.activeElement);mobileToc.open=false;if(focused)mobileToc.querySelector('summary').focus({preventScroll:true});}
      mobileToc.classList.toggle('is-floating',floating);
    };
    const bar = $('[data-reading-progress]'), label = $('[data-progress-label]'), tocProgress=$$('[data-toc-progress]');
    let scheduled = false;
    const progress = () => {floatToc(); const start = article.getBoundingClientRect().top + scrollY - 100; const length = Math.max(1, article.offsetHeight - innerHeight + 150); const value = Math.max(0, Math.min(1, (scrollY - start) / length)); if (bar) bar.style.transform = `scaleX(${value})`;tocProgress.forEach(fill=>fill.style.transform=`scaleX(${value})`); if (label) label.textContent = `${Math.round(value * 100)}%`; scheduled = false; };
    addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(progress); } }, { passive: true }); addEventListener('resize', progress); progress();
    const headings = [...article.querySelectorAll('h2[id],h3[id]')];
    const tocGroups=$$('.toc-track').map(track=>({track,nav:track.closest('nav'),links:[...track.querySelectorAll('[data-toc-link]')],active:null}));
    const setActive=()=>{
      if(!headings.length)return;
      let index=0;for(let i=0;i<headings.length;i++){if(headings[i].getBoundingClientRect().top<=150)index=i;else break;}
      const id=headings[index]?.id;
      $$('[data-toc-position]').forEach(label=>{label.textContent=String(index+1).padStart(2,'0')+' / '+String(headings.length).padStart(2,'0');label.setAttribute('aria-label',`전체 ${headings.length}개 절 중 ${index+1}번째 절`);});
      for(const group of tocGroups){
        const changed=group.active!==id;group.active=id;
        for(const link of group.links){if(link.getAttribute('href')===`#${id}`)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
        const active=group.links.find(link=>link.getAttribute('href')===`#${id}`);if(!active||!group.track.getClientRects().length)continue;
        const row=active.getBoundingClientRect(),track=group.track.getBoundingClientRect();
        group.track.style.setProperty('--toc-marker-x',`${row.left-track.left}px`);
        group.track.style.setProperty('--toc-marker-y',`${row.top-track.top+6}px`);
        group.track.style.setProperty('--toc-marker-height',`${Math.max(14,row.height-12)}px`);group.track.dataset.tocReady='';
        if(changed&&!group.nav.matches(':hover,:focus-within')){
          const viewport=group.nav.getBoundingClientRect();
          if(row.top<viewport.top+6)group.nav.scrollTop-=viewport.top-row.top+6;
          else if(row.bottom>viewport.bottom-6)group.nav.scrollTop+=row.bottom-viewport.bottom+6;
        }
      }
    };
    let tocScheduled=false;
    const scheduleToc=()=>{if(!tocScheduled){tocScheduled=true;requestAnimationFrame(()=>{setActive();tocScheduled=false;});}};
    addEventListener('scroll',scheduleToc,{passive:true});addEventListener('resize',scheduleToc);
    article.addEventListener('load',scheduleToc,true);document.fonts?.ready.then(scheduleToc);
    $$('.mobile-toc').forEach(details=>details.addEventListener('toggle',()=>{if(details.open){tocGroups.filter(group=>group.track.closest('details')===details).forEach(group=>group.active=null);scheduleToc();}}));setActive();
    $$('[data-toc-link]').forEach(link => link.addEventListener('click', () => { const details = link.closest('details'); if (details) details.open = false; }));
    $('[data-copy-link]')?.addEventListener('click', async () => { const canonical = $('link[rel="canonical"]')?.href || location.href; const url = canonical + location.hash; try { await navigator.clipboard.writeText(url); toast('글 링크를 복사했어요.'); } catch { toast('주소 표시줄의 링크를 복사해 주세요.'); } });
  }
})();
