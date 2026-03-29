/* =====================================================
   Mind Garden — Frontend App (API-driven)
   ===================================================== */

// ─── State ────────────────────────────────────────────
let PAGES = {};
let FOLDERS = [];
let SITE = {};
let currentPage = 'mind-garden';

// ─── DOM refs ─────────────────────────────────────────
const pageContent = document.getElementById('page-content');
const navFolders = document.getElementById('nav-folders');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const linkPreview = document.getElementById('link-preview');
const previewTitle = document.getElementById('preview-title');
const previewExcerpt = document.getElementById('preview-excerpt');
const sidebar = document.getElementById('sidebar');
const hamburger = document.getElementById('hamburger');
const overlay = document.getElementById('overlay');

// ─── API helpers ──────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ─── Load data from API ───────────────────────────────
async function loadData() {
  pageContent.innerHTML = '<p style="padding:60px;color:var(--text-muted)">Loading…</p>';
  try {
    [PAGES, FOLDERS, SITE] = await Promise.all([
      apiGet('/api/pages'),
      apiGet('/api/folders'),
      apiGet('/api/site')
    ]);
    applySiteSettings();
    buildNavFolders();
    const hashPage = location.hash.slice(1);
    const initial = (hashPage && PAGES[hashPage]) ? hashPage : Object.keys(PAGES)[0] || '';
    if (initial) {
      renderPage(initial);
      autoOpenFolder(initial);
      history.replaceState({ page: initial }, '', `#${initial}`);
    }
  } catch (e) {
    pageContent.innerHTML = `<p style="padding:60px;color:red">Failed to load data: ${e.message}</p>`;
  }
}

// Apply site settings to the DOM
function applySiteSettings() {
  // Avatar
  const avatarImg = document.getElementById('avatar-img');
  if (avatarImg && SITE.avatar) {
    // Add cache-busting query to always show latest
    avatarImg.src = `${SITE.avatar}?t=${Date.now()}`;
    avatarImg.alt = SITE.siteName || 'avatar';
  }

  // Site name in sidebar
  const siteNameEl = document.querySelector('.site-name');
  if (siteNameEl && SITE.siteName) siteNameEl.textContent = SITE.siteName;

  // Site name in mobile header
  const mobileTitle = document.querySelector('.mobile-title');
  if (mobileTitle && SITE.siteName) mobileTitle.textContent = SITE.siteName;

  // Page title
  document.title = `${SITE.siteName || 'mind flow'} – my flow`;

  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && SITE.description) metaDesc.setAttribute('content', SITE.description);

  // Apply theme
  if (SITE.theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

// ─── Build sidebar folders ────────────────────────────
function buildNavFolders() {
  navFolders.innerHTML = '';

  // Also update pinned nav links to work
  document.querySelectorAll('#nav-tree .nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });

  FOLDERS.forEach(folder => {
    const item = document.createElement('div');
    item.className = 'folder-item';
    item.dataset.folder = folder.name;

    const header = document.createElement('div');
    header.className = 'folder-header';
    header.innerHTML = `
      <svg class="folder-chevron" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
      </svg>
      <span class="folder-name">${folder.name}</span>`;

    const children = document.createElement('div');
    children.className = 'folder-children';

    (folder.pages || []).forEach(pageId => {
      if (PAGES[pageId]) {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'nav-link';
        link.dataset.page = pageId;
        link.id = `nav-${pageId}`;
        link.textContent = PAGES[pageId].title;
        link.addEventListener('click', e => { e.preventDefault(); navigateTo(pageId); });
        children.appendChild(link);
      }
    });

    header.addEventListener('click', () => item.classList.toggle('open'));
    item.appendChild(header);
    item.appendChild(children);
    navFolders.appendChild(item);
  });

  // Open first folder by default
  const first = navFolders.querySelector('.folder-item');
  if (first) first.classList.add('open');
}

// ─── Render page ─────────────────────────────────────
function renderPage(pageId) {
  const page = PAGES[pageId];
  if (!page) return;

  currentPage = pageId;
  document.title = `${page.title} – my flow`;

  const tagsHTML = (page.tags || [])
    .map(t => `<span class="page-tag" data-tag="${t}">${t}</span>`).join('');

  const heroHTML = page.hero
    ? `<div class="page-hero"><img src="${page.hero}" alt="${page.title}" /></div>`
    : '';

  const backlinksHTML = (page.backlinks || []).length
    ? `<div class="backlinks">
        <div class="backlinks-title">Linked here</div>
        <div class="backlinks-list">
          ${page.backlinks.filter(id => PAGES[id]).map(id =>
            `<div class="backlink-item" data-page="${id}">← ${PAGES[id].title}</div>`
          ).join('')}
        </div>
      </div>`
    : '';

  const updatedAt = page.updatedAt
    ? `<div class="page-meta">Last updated: ${new Date(page.updatedAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</div>`
    : '';

  pageContent.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${page.title}</h1>
      ${page.tags?.length ? `<div class="page-tags">${tagsHTML}</div>` : ''}
    </div>
    ${heroHTML}
    <div class="page-body">${page.content}</div>
    ${backlinksHTML}
    ${updatedAt}
    <div class="pwby">${SITE.footerText || 'Powered by a flow'}</div>
  `;

  // Wire wiki links
  pageContent.querySelectorAll('.wiki-link').forEach(link => {
    const pid = link.dataset.page;
    link.addEventListener('click', e => { e.preventDefault(); navigateTo(pid); });
    link.addEventListener('mouseenter', e => showPreview(pid, e));
    link.addEventListener('mousemove', e => positionPreview(e));
    link.addEventListener('mouseleave', hidePreview);
  });

  pageContent.querySelectorAll('.backlink-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  pageContent.querySelectorAll('.page-tag').forEach(tag => {
    tag.addEventListener('click', () => showTagPage(tag.dataset.tag));
  });

  updateActiveNav(pageId);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ─── Navigate ─────────────────────────────────────────
function navigateTo(pageId) {
  if (!PAGES[pageId]) return;
  sidebar.classList.remove('open');
  overlay.classList.remove('open');

  pageContent.style.opacity = '0';
  pageContent.style.transform = 'translateY(-6px)';
  pageContent.style.transition = 'opacity 0.15s ease, transform 0.15s ease';

  setTimeout(() => {
    pageContent.style.opacity = '';
    pageContent.style.transform = '';
    pageContent.style.transition = '';
    renderPage(pageId);
    autoOpenFolder(pageId);
  }, 150);

  history.pushState({ page: pageId }, '', `#${pageId}`);
}

// ─── Update active nav link ───────────────────────────
function updateActiveNav(pageId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const el = document.getElementById(`nav-${pageId}`);
  if (el) el.classList.add('active');

  const pinnedIds = ['welcome', 'now', 'start-here'];
  if (pinnedIds.includes(pageId)) {
    const pel = document.querySelector(`[data-page="${pageId}"]`);
    if (pel) pel.classList.add('active');
  }
}

// ─── Auto-open folder in sidebar ─────────────────────
function autoOpenFolder(pageId) {
  const page = PAGES[pageId];
  if (!page?.folder) return;
  const folderEl = document.querySelector(`.folder-item[data-folder="${page.folder}"]`);
  if (folderEl) folderEl.classList.add('open');
}

// ─── Hover preview ────────────────────────────────────
function showPreview(pageId, e) {
  const page = PAGES[pageId];
  if (!page) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = page.content;
  const excerpt = tmp.textContent.trim().slice(0, 200) + '…';
  previewTitle.textContent = page.title;
  previewExcerpt.textContent = excerpt;
  linkPreview.classList.add('visible');
  positionPreview(e);
}

function positionPreview(e) {
  const pW = 280, pH = 110;
  let x = e.clientX + 16, y = e.clientY + 16;
  if (x + pW > window.innerWidth) x = e.clientX - pW - 8;
  if (y + pH > window.innerHeight) y = e.clientY - pH - 8;
  linkPreview.style.left = x + 'px';
  linkPreview.style.top = y + 'px';
}

function hidePreview() {
  linkPreview.classList.remove('visible');
}

// ─── Search (calls API) ───────────────────────────────
let searchDebounce;
function doSearch(query) {
  query = query.trim();
  if (!query) { searchResults.classList.remove('open'); return; }

  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    try {
      const results = await apiGet(`/api/search?q=${encodeURIComponent(query)}`);
      renderSearchResults(results, query);
    } catch {
      renderSearchResults([], query);
    }
  }, 150);
}

function renderSearchResults(results, query) {
  if (!results.length) {
    searchResults.innerHTML = `<div class="search-no-results">No results for "<strong>${escapeHtml(query)}</strong>"</div>`;
    searchResults.classList.add('open');
    return;
  }

  searchResults.innerHTML = results.map(r => {
    const hl = s => s.replace(new RegExp(escapeRegex(query), 'gi'), m => `<mark>${m}</mark>`);
    return `
      <div class="search-result-item" data-page="${r.id}">
        <div class="sri-title">${hl(r.title)}</div>
        ${r.excerpt ? `<div class="sri-excerpt">${hl(r.excerpt)}</div>` : ''}
        ${r.folder ? `<div class="sri-parent">${r.folder}</div>` : ''}
      </div>`;
  }).join('');

  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
      searchInput.value = '';
      searchResults.classList.remove('open');
    });
  });
  searchResults.classList.add('open');
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Tag page ─────────────────────────────────────────
function showTagPage(tag) {
  const matches = Object.entries(PAGES).filter(([, p]) => p.tags?.includes(tag));
  pageContent.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${tag}</h1>
      <div class="page-tags"><span class="page-tag">${tag}</span></div>
    </div>
    <div class="page-body tag-page">
      <p>All pages tagged with <strong>${tag}</strong>:</p>
      ${matches.map(([id, p]) => `<a class="wiki-link" data-page="${id}">${p.title}</a>`).join('')}
    </div>
    <div class="pwby">${SITE.footerText || 'Powered by a flow'}</div>
  `;
  pageContent.querySelectorAll('.wiki-link').forEach(link => {
    const pid = link.dataset.page;
    link.addEventListener('click', e => { e.preventDefault(); navigateTo(pid); });
    link.addEventListener('mouseenter', e => showPreview(pid, e));
    link.addEventListener('mousemove', e => positionPreview(e));
    link.addEventListener('mouseleave', hidePreview);
  });
  updateActiveNav('');
  document.title = `${tag} – my flow`;
}

// ─── Events ───────────────────────────────────────────
searchInput.addEventListener('input', () => doSearch(searchInput.value));
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) doSearch(searchInput.value); });
document.addEventListener('click', e => {
  if (!document.getElementById('search-box').contains(e.target)) searchResults.classList.remove('open');
});
hamburger.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
window.addEventListener('popstate', e => { if (e.state?.page) renderPage(e.state.page); });

// ─── Pinned nav event listeners (welcome/now/start-here) ─
document.querySelectorAll('#nav-tree .nav-link').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.page); });
});

// ─── Boot ─────────────────────────────────────────────
loadData();
