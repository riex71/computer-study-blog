const STORAGE_KEY = 'studybase.notes.v1';
const THEME_KEY = 'studybase.theme';

const TOPICS = [
  { name: 'AI 기초', color: '#6d63df', bg: '#eeecff' },
  { name: '머신러닝', color: '#1c7d63', bg: '#e4f5ef' },
  { name: '딥러닝', color: '#ad5c1c', bg: '#fff0df' },
  { name: '생성형 AI', color: '#a6416b', bg: '#fbe9f1' },
  { name: '논문 리뷰', color: '#3974a7', bg: '#e7f2fa' },
  { name: '프로젝트', color: '#5f7030', bg: '#eff5dc' },
  { name: '기타', color: '#696b64', bg: '#eceee9' }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  noteGrid: $('#note-grid'), emptyState: $('#empty-state'), noResults: $('#no-results'), search: $('#search-input'), sort: $('#sort-select'),
  topicList: $('#topic-list'), notesHeading: $('#notes-heading'), resultCount: $('#result-count'), editor: $('#editor-dialog'), form: $('#note-form'),
  noteId: $('#note-id'), noteTitle: $('#note-title'), noteTopic: $('#note-topic'), noteTags: $('#note-tags'), noteContent: $('#note-content'),
  editorKicker: $('#editor-kicker'), editorLabel: $('#editor-label'), saveState: $('#save-state'), writePanel: $('#write-panel'),
  previewPanel: $('#preview-panel'), reader: $('#reader-dialog'), confirm: $('#confirm-dialog'), toast: $('#toast'), sidebar: $('#sidebar'), sidebarScrim: $('#sidebar-scrim')
};
const state = { notes: loadNotes(), view: 'all', topic: null, openId: null, pendingDeleteId: null, toastTimer: null };

function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isValidNote) : [];
  } catch { return []; }
}
function isValidNote(note) { return note && typeof note === 'object' && typeof note.id === 'string' && typeof note.title === 'string' && typeof note.content === 'string'; }
function persistNotes() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes)); }
function createId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function inlineMarkdown(text) { return text.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>'); }

function renderMarkdown(markdown = '') {
  const lines = escapeHtml(markdown).replace(/\r/g, '').split('\n');
  let html = '', inCode = false, list = null;
  const closeList = () => { if (list) html += `</${list}>`; list = null; };
  for (const line of lines) {
    if (line.trim().startsWith('```')) { closeList(); html += inCode ? '</code></pre>' : '<pre><code>'; inCode = !inCode; continue; }
    if (inCode) { html += `${line}\n`; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; }
    else if (unordered) { if (list !== 'ul') { closeList(); list = 'ul'; html += '<ul>'; } html += `<li>${inlineMarkdown(unordered[1])}</li>`; }
    else if (ordered) { if (list !== 'ol') { closeList(); list = 'ol'; html += '<ol>'; } html += `<li>${inlineMarkdown(ordered[1])}</li>`; }
    else if (line.startsWith('&gt; ')) { closeList(); html += `<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`; }
    else if (!line.trim()) closeList();
    else { closeList(); html += `<p>${inlineMarkdown(line)}</p>`; }
  }
  closeList();
  if (inCode) html += '</code></pre>';
  return html || '<p>미리볼 내용이 없습니다.</p>';
}

function plainText(markdown = '') { return markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`\-]/g, ' ').replace(/\s+/g, ' ').trim(); }
function topicStyle(name) { const topic = TOPICS.find((item) => item.name === name) || TOPICS.at(-1); return `--topic-text:${topic.color};--topic-bg:${topic.bg};--topic-color:${topic.color}`; }
function formatDate(value, short = false) {
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', short ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}
function showToast(message) { clearTimeout(state.toastTimer); els.toast.textContent = message; els.toast.classList.add('show'); state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200); }

function getFilteredNotes() {
  const query = els.search.value.trim().toLocaleLowerCase('ko');
  const filtered = state.notes.filter((note) => {
    const viewMatches = state.view === 'all' || (state.view === 'favorite' && note.favorite);
    const topicMatches = !state.topic || note.topic === state.topic;
    const haystack = `${note.title} ${note.content} ${(note.tags || []).join(' ')} ${note.topic}`.toLocaleLowerCase('ko');
    return viewMatches && topicMatches && (!query || haystack.includes(query));
  });
  return filtered.sort((a, b) => {
    if (els.sort.value === 'title-asc') return a.title.localeCompare(b.title, 'ko');
    if (els.sort.value === 'created-desc') return new Date(b.createdAt) - new Date(a.createdAt);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function renderTopics() {
  els.topicList.innerHTML = TOPICS.map((topic) => {
    const count = state.notes.filter((note) => note.topic === topic.name).length;
    return `<button class="nav-item topic-item${state.topic === topic.name ? ' active' : ''}" type="button" data-topic="${escapeHtml(topic.name)}"><i class="topic-dot" style="--topic-color:${topic.color}"></i><span>${escapeHtml(topic.name)}</span><b>${count}</b></button>`;
  }).join('');
}

function renderSummary() {
  $('#all-count').textContent = state.notes.length;
  $('#favorite-count').textContent = state.notes.filter((note) => note.favorite).length;
  $('#summary-total').textContent = state.notes.length;
  $('#summary-topics').textContent = new Set(state.notes.map((note) => note.topic)).size;
  const latest = [...state.notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  $('#summary-last').textContent = latest ? formatDate(latest.updatedAt, true) : '아직 없음';
  $('#summary-last-title').textContent = latest ? latest.title : '첫 노트를 기다리고 있어요';
}

function renderNotes() {
  const notes = getFilteredNotes();
  els.noteGrid.innerHTML = notes.map((note) => {
    const excerpt = plainText(note.content) || '내용이 없는 노트입니다.';
    const tags = (note.tags || []).slice(0, 2).map((tag) => `#${tag}`).join(' · ');
    return `<article class="note-card" tabindex="0" data-note-id="${note.id}" aria-label="${escapeHtml(note.title)} 읽기"><div class="note-card-top"><span class="topic-badge" style="${topicStyle(note.topic)}">${escapeHtml(note.topic)}</span><button class="favorite-button${note.favorite ? ' on' : ''}" type="button" data-favorite="${note.id}" aria-label="중요 노트 ${note.favorite ? '해제' : '설정'}">${note.favorite ? '★' : '☆'}</button></div><h3>${escapeHtml(note.title)}</h3><p class="note-excerpt">${escapeHtml(excerpt)}</p><div class="note-card-footer"><span>${formatDate(note.updatedAt, true)} 수정</span><span>${escapeHtml(tags || '태그 없음')}</span></div></article>`;
  }).join('');
  els.resultCount.textContent = `${notes.length}개`;
  els.emptyState.hidden = state.notes.length !== 0;
  els.noResults.hidden = state.notes.length === 0 || notes.length !== 0;
  els.noteGrid.hidden = state.notes.length === 0 || notes.length === 0;
  els.notesHeading.textContent = state.topic || (state.view === 'favorite' ? '중요 노트' : '모든 노트');
  renderTopics(); renderSummary();
}

function setActiveNavigation() { $$('.side-nav .nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view && !state.topic)); }
function setEditorTab(mode) {
  const preview = mode === 'preview'; els.writePanel.hidden = preview; els.previewPanel.hidden = !preview;
  if (preview) els.previewPanel.innerHTML = renderMarkdown(els.noteContent.value);
  $$('[data-editor-tab]').forEach((button) => button.classList.toggle('active', button.dataset.editorTab === mode));
}

function openEditor(note = null) {
  els.form.reset(); els.noteId.value = note?.id || ''; els.noteTitle.value = note?.title || ''; els.noteTopic.value = note?.topic || TOPICS[0].name;
  els.noteTags.value = (note?.tags || []).join(', '); els.noteContent.value = note?.content || ''; els.editorKicker.textContent = note ? 'EDIT NOTE' : 'NEW NOTE';
  els.editorLabel.textContent = note ? '노트 수정' : '새 노트 작성'; els.saveState.textContent = note ? '수정 중' : '저장 전'; setEditorTab('write');
  els.editor.showModal(); requestAnimationFrame(() => els.noteTitle.focus());
}

function saveNote() {
  const title = els.noteTitle.value.trim(), content = els.noteContent.value.trim(); if (!title || !content) return;
  const id = els.noteId.value, existing = state.notes.find((note) => note.id === id), now = new Date().toISOString();
  const tags = [...new Set(els.noteTags.value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
  const nextNote = { id: existing?.id || createId(), title, topic: els.noteTopic.value, tags, content, favorite: existing?.favorite || false, createdAt: existing?.createdAt || now, updatedAt: now };
  state.notes = existing ? state.notes.map((note) => note.id === id ? nextNote : note) : [nextNote, ...state.notes];
  persistNotes(); els.editor.close(); renderNotes(); showToast(existing ? '노트를 수정했습니다.' : '새 노트를 저장했습니다.');
}

function openReader(id) {
  const note = state.notes.find((item) => item.id === id); if (!note) return; state.openId = id;
  $('#reader-topic').textContent = note.topic; $('#reader-title').textContent = note.title;
  $('#reader-meta').textContent = `${formatDate(note.createdAt)} 작성 · ${formatDate(note.updatedAt)} 수정`;
  $('#reader-tags').innerHTML = (note.tags || []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('');
  $('#reader-body').innerHTML = renderMarkdown(note.content); $('#reader-favorite').textContent = note.favorite ? '★ 중요 해제' : '☆ 중요'; els.reader.showModal();
}

function toggleFavorite(id) {
  state.notes = state.notes.map((note) => note.id === id ? { ...note, favorite: !note.favorite, updatedAt: new Date().toISOString() } : note);
  persistNotes(); renderNotes();
  if (els.reader.open && state.openId === id) { const note = state.notes.find((item) => item.id === id); $('#reader-favorite').textContent = note.favorite ? '★ 중요 해제' : '☆ 중요'; }
}
function requestDelete(id) { state.pendingDeleteId = id; els.confirm.showModal(); }
function confirmDelete() {
  const id = state.pendingDeleteId; if (!id) return; state.notes = state.notes.filter((note) => note.id !== id); persistNotes(); state.pendingDeleteId = null;
  els.confirm.close(); if (els.reader.open) els.reader.close(); renderNotes(); showToast('노트를 삭제했습니다.');
}
function setView(view, topic = null) { state.view = view; state.topic = topic; setActiveNavigation(); renderNotes(); closeSidebar(); }
function openSidebar() { els.sidebar.classList.add('open'); els.sidebarScrim.classList.add('open'); }
function closeSidebar() { els.sidebar.classList.remove('open'); els.sidebarScrim.classList.remove('open'); }

function exportNotes() {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes: state.notes }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `studybase-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  URL.revokeObjectURL(url); showToast('백업 파일을 만들었습니다.');
}

async function importNotes(file) {
  try {
    const parsed = JSON.parse(await file.text()), incoming = Array.isArray(parsed) ? parsed : parsed.notes;
    if (!Array.isArray(incoming) || !incoming.every(isValidNote)) throw new Error('invalid');
    const merged = new Map(state.notes.map((note) => [note.id, note]));
    incoming.forEach((note) => merged.set(note.id, { ...note, topic: TOPICS.some((topic) => topic.name === note.topic) ? note.topic : '기타', tags: Array.isArray(note.tags) ? note.tags.map(String).slice(0, 12) : [], favorite: Boolean(note.favorite) }));
    state.notes = [...merged.values()]; persistNotes(); setView('all'); showToast(`${incoming.length}개의 노트를 가져왔습니다.`);
  } catch { showToast('올바른 Studybase 백업 파일이 아닙니다.'); }
  finally { $('#import-input').value = ''; }
}

$('#new-note-button').addEventListener('click', () => openEditor());
$('[data-new-note]').addEventListener('click', () => openEditor());
$('#editor-cancel').addEventListener('click', () => els.editor.close());
els.form.addEventListener('submit', (event) => { event.preventDefault(); saveNote(); });
els.form.addEventListener('input', () => { els.saveState.textContent = '저장 전'; });
$$('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => setEditorTab(button.dataset.editorTab)));
els.search.addEventListener('input', renderNotes); els.sort.addEventListener('change', renderNotes);
$('.side-nav').addEventListener('click', (event) => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); });
els.topicList.addEventListener('click', (event) => { const button = event.target.closest('[data-topic]'); if (button) setView('all', button.dataset.topic); });
els.noteGrid.addEventListener('click', (event) => {
  const favorite = event.target.closest('[data-favorite]'); if (favorite) { event.stopPropagation(); toggleFavorite(favorite.dataset.favorite); return; }
  const card = event.target.closest('[data-note-id]'); if (card) openReader(card.dataset.noteId);
});
els.noteGrid.addEventListener('keydown', (event) => { const card = event.target.closest('[data-note-id]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openReader(card.dataset.noteId); } });
$('#reader-close').addEventListener('click', () => els.reader.close());
$('#reader-favorite').addEventListener('click', () => toggleFavorite(state.openId));
$('#reader-edit').addEventListener('click', () => { const note = state.notes.find((item) => item.id === state.openId); els.reader.close(); openEditor(note); });
$('#reader-delete').addEventListener('click', () => requestDelete(state.openId));
$('#delete-cancel').addEventListener('click', () => { state.pendingDeleteId = null; els.confirm.close(); });
$('#delete-confirm').addEventListener('click', confirmDelete);
$('#export-button').addEventListener('click', exportNotes);
$('#import-input').addEventListener('change', (event) => { if (event.target.files[0]) importNotes(event.target.files[0]); });
$('#menu-button').addEventListener('click', openSidebar); $('#sidebar-close').addEventListener('click', closeSidebar); els.sidebarScrim.addEventListener('click', closeSidebar);
$('#theme-button').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem(THEME_KEY, document.body.classList.contains('dark') ? 'dark' : 'light'); });
[els.editor, els.reader].forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); els.search.focus(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && els.editor.open) { event.preventDefault(); els.form.requestSubmit(); }
});
if (localStorage.getItem(THEME_KEY) === 'dark' || (!localStorage.getItem(THEME_KEY) && matchMedia('(prefers-color-scheme: dark)').matches)) document.body.classList.add('dark');
renderNotes();
