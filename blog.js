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
  const cards = $$('[data-post-card]');
  let topic = '', savedOnly = false, searchContent = new Map();
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
    fetch('search-index.json' + assetVersion).then(r => { if (!r.ok) throw new Error('Search index unavailable'); return r.json(); }).then(posts => { searchContent = new Map(posts.map(post => [post.slug, post.search])); filterPosts(false); }).catch(() => { /* Metadata search remains available when offline. */ });
  }
  const siteRoot = new URL(document.body.dataset.page === 'article' ? '../' : './', location.href);
  let globalIndex;
  const searchDialog = $('[data-search-dialog]');
  const globalSearch = $('[data-global-search]');
  const globalResults = $('[data-global-results]');
  async function searchAll() {
    globalResults.textContent = '글을 찾는 중…';
    try {
      globalIndex ||= await fetch(new URL('search-index.json' + assetVersion, siteRoot)).then(r => { if (!r.ok) throw Error(); return r.json(); });
      const terms = normalize(globalSearch.value.trim()).split(/\s+/).filter(Boolean);
      const matches = globalIndex.filter(p => terms.every(t => normalize(p.search).includes(t)));
      globalResults.replaceChildren();
      for (const post of matches) {
        const link = document.createElement('a'); link.href = new URL('posts/' + post.slug + '.html', siteRoot);
        const date = document.createElement('small'); date.textContent = post.date + ' / ' + post.tags.slice(0, 3).join(' · ');
        const title = document.createElement('h3'); title.textContent = post.title;
        const excerpt = document.createElement('p');
        const body = post.text || post.description;
        const pos = terms.length ? normalize(body).indexOf(terms[0]) : -1;
        const start = Math.max(0, pos - 35); excerpt.textContent = (start ? '…' : '') + body.slice(start, start + 145) + (body.length > start + 145 ? '…' : '');
        link.append(date, title, excerpt); globalResults.append(link);
      }
      if (!matches.length) globalResults.textContent = '일치하는 글이 없어요. 다른 단어로 찾아보세요.';
    } catch { globalResults.textContent = '검색을 불러오지 못했습니다. 아카이브에서 글을 찾아주세요.'; }
  }
  $$('[data-open-search]').forEach(button => button.addEventListener('click', () => { searchDialog.showModal(); globalSearch.focus(); searchAll(); }));
  $('[data-close-search]')?.addEventListener('click', () => searchDialog.close());
  let globalTimer; globalSearch?.addEventListener('input', () => { clearTimeout(globalTimer); globalTimer = setTimeout(searchAll, 100); });
  searchDialog?.addEventListener('click', e => { if (e.target === searchDialog && (e.clientX < searchDialog.getBoundingClientRect().left || e.clientX > searchDialog.getBoundingClientRect().right || e.clientY < searchDialog.getBoundingClientRect().top || e.clientY > searchDialog.getBoundingClientRect().bottom)) searchDialog.close(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && searchDialog) { e.preventDefault(); if (!searchDialog.open) searchDialog.showModal(); globalSearch.focus(); searchAll(); }
    if (!searchDialog?.open) return;
    const links = [...globalResults.querySelectorAll('a')]; const current = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); links[Math.min(current + 1, links.length - 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (current <= 0) globalSearch.focus(); else links[current - 1].focus(); }
    if (e.key === 'Enter' && document.activeElement === globalSearch && links.length) { e.preventDefault(); links[0].click(); }
  });
  $$('.reader-popover').forEach(details=>details.addEventListener('toggle',()=>{if(details.open)$$('.reader-popover').filter(other=>other!==details).forEach(other=>other.open=false);}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const details=document.activeElement?.closest('.reader-popover');if(details?.open){details.open=false;details.querySelector('summary').focus();}}});
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
    article.querySelectorAll('pre').forEach(pre => { const wrapper = document.createElement('div'); wrapper.className = 'code-wrap'; pre.before(wrapper); wrapper.append(pre); const copy = document.createElement('button'); copy.className = 'copy-code'; copy.textContent = '복사'; copy.type = 'button'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pre.textContent); toast('코드를 복사했어요.'); } catch { toast('코드를 선택해서 복사해 주세요.'); } }); wrapper.append(copy); });
    const bar = $('[data-reading-progress]'), label = $('[data-progress-label]');
    let scheduled = false;
    const progress = () => { const start = article.getBoundingClientRect().top + scrollY - 100; const length = Math.max(1, article.offsetHeight - innerHeight + 150); const value = Math.max(0, Math.min(1, (scrollY - start) / length)); if (bar) bar.style.transform = `scaleX(${value})`; if (label) label.textContent = `${Math.round(value * 100)}%`; scheduled = false; };
    addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(progress); } }, { passive: true }); addEventListener('resize', progress); progress();
    const headings = [...article.querySelectorAll('h2[id]')];
    const setActive = () => { let id = headings[0]?.id; for (const heading of headings) { if (heading.getBoundingClientRect().top <= 150) id = heading.id; else break; } $$('[data-toc-link]').forEach(link => { if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); };
    let tocScheduled = false; addEventListener('scroll', () => { if (!tocScheduled) { tocScheduled = true; requestAnimationFrame(() => { setActive(); tocScheduled = false; }); } }, { passive: true }); addEventListener('resize',setActive);setActive();
    $$('[data-toc-link]').forEach(link => link.addEventListener('click', () => { const details = link.closest('details'); if (details) details.open = false; }));
    $('[data-copy-link]')?.addEventListener('click', async () => { const canonical = $('link[rel="canonical"]')?.href || location.href; const url = canonical + location.hash; try { await navigator.clipboard.writeText(url); toast('글 링크를 복사했어요.'); } catch { toast('주소 표시줄의 링크를 복사해 주세요.'); } });
  }
})();
