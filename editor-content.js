/* One sanitizer serves both the preview and the published canonical source. */
(() => {
  const tags = ['p','br','h2','h3','h4','ul','ol','li','a','img','figure','figcaption','table','thead','tbody','tfoot','tr','th','td','caption','pre','code','blockquote','hr','em','s','del','sub','sup','span','div','section','dl','dt','dd','details','summary'];
  function compile(markdown) {
    const clean = DOMPurify.sanitize(marked.parse(markdown, { breaks: false, gfm: true }), {
      ALLOWED_TAGS: tags, ALLOWED_ATTR: ['href','src','alt','title','id','class','colspan','rowspan','scope','width','height','start','open','aria-labelledby'],
      ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, FORBID_ATTR: ['style'], ALLOW_UNKNOWN_PROTOCOLS: false
    });
    const root = document.createElement('div'); root.innerHTML = clean;
    const used = new Set(['main','global-search','global-search-title']);
    root.querySelectorAll('[id]').forEach(el => { let id = el.id; if (!/^[\w가-힣-]+$/.test(id) || used.has(id)) el.removeAttribute('id'); else used.add(id); });
    root.querySelectorAll('a').forEach(a => { const href = a.getAttribute('href') || ''; if (!/^(?:https?:\/\/|mailto:|#|\.\.\/|\.\/|[^:/?#]+(?:\/|$))/i.test(href)) a.removeAttribute('href'); a.removeAttribute('class'); });
    root.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (/^https:\/\//i.test(src)) { /* Remote figures remain attributed by their captions. */ }
      else if (/^(?:\.\.\/)?assets\/[a-zA-Z0-9_./-]+$/.test(src) && !src.includes('/../')) img.setAttribute('src', '../' + src.replace(/^\.\.\//, ''));
      else img.removeAttribute('src');
      img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async');
    });
    root.querySelectorAll('[class]').forEach(el => {
      const classes = el.className.split(/\s+/).filter(c => /^(?:note-figure|paper-figure|figure-note|article-sources|source-list|formula|equation|table-wrap|table-caption|note|callout|language-[a-z0-9-]+|source-note|figure-grid|reference-list|engram-editor-note|engram-equation|engram-image-link|engram-paper-figure|engram-table|engram-table-wrap)$/.test(c));
      if (classes.length) el.className = classes.join(' '); else el.removeAttribute('class');
    });
    let count = 0;
    root.querySelectorAll('h2').forEach(h => { if (!h.id) { let id; do { id = 'section-' + String(++count).padStart(2, '0'); } while (used.has(id)); h.id = id; used.add(id); } });
    return root.innerHTML;
  }
  function preview(html, images = []) {
    const root = document.createElement('div'); root.innerHTML = html;
    root.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    root.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '', local = src.replace(/^\.\.\//, '');
      const staged = images.find(i => i.path === local);
      img.src = staged ? 'data:' + staged.type + ';base64,' + staged.base64 : new URL(src, new URL('posts/', location.href)).href;
    });
    root.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    return root.innerHTML;
  }
  window.EditorContent = { compile, preview };
})();
