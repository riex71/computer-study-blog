const root = document.body;
const themeButton = document.querySelector('.theme-toggle');
const storedTheme = localStorage.getItem('bit-by-bit-theme');

if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  root.classList.add('dark');
}

themeButton?.addEventListener('click', () => {
  root.classList.toggle('dark');
  localStorage.setItem('bit-by-bit-theme', root.classList.contains('dark') ? 'dark' : 'light');
});

const search = document.querySelector('#search');
const filters = [...document.querySelectorAll('.filter')];
const posts = [...document.querySelectorAll('.post-card')];
const emptyState = document.querySelector('.empty-state');
let activeFilter = 'all';

function updatePosts() {
  const query = search?.value.trim().toLocaleLowerCase('ko') ?? '';
  let visibleCount = 0;

  posts.forEach((post) => {
    const categoryMatches = activeFilter === 'all' || post.dataset.category === activeFilter;
    const text = `${post.textContent} ${post.dataset.search}`.toLocaleLowerCase('ko');
    const searchMatches = !query || text.includes(query);
    post.hidden = !(categoryMatches && searchMatches);
    if (!post.hidden) visibleCount += 1;
  });

  if (emptyState) emptyState.hidden = visibleCount !== 0;
}

filters.forEach((filter) => {
  filter.addEventListener('click', () => {
    filters.forEach((button) => button.classList.remove('active'));
    filter.classList.add('active');
    activeFilter = filter.dataset.filter;
    updatePosts();
  });
});

search?.addEventListener('input', updatePosts);
