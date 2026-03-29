/* =====================================================
   Mind Garden — Admin JS
   ===================================================== */

const API = '';  // same origin

// ─── State ────────────────────────────────────────────
let allPages = {};
let allFolders = [];
let currentPageId = null;
let isNew = false;
let currentTags = [];
let pendingHeroFile = null;
let pendingDeleteId = null;
// Folder edit state (for the modal)
let editFolders = [];
let isAuthenticated = false;

// ─── DOM refs ─────────────────────────────────────────
const pageList = document.getElementById('page-list');
const pageFilter = document.getElementById('page-filter');
const panelRight = document.getElementById('panel-right');
const toast = document.getElementById('toast');
const foldersModal = document.getElementById('folders-modal');
const deleteModal = document.getElementById('delete-modal');

// ─── API helpers ──────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Toast ────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ─── Load data ────────────────────────────────────────
async function loadAll() {
  try {
    [allPages, allFolders] = await Promise.all([
      apiFetch('/api/pages'),
      apiFetch('/api/folders')
    ]);
    renderPageList();
  } catch (e) {
    if (e.message && e.message.includes('401')) {
      showLoginOverlay();
    } else {
      showToast('Failed to load data: ' + e.message, 'error');
    }
  }
}

// ─── Page list ────────────────────────────────────────
function renderPageList(filter = '') {
  const q = filter.toLowerCase();
  const groups = {};

  // Pinned (no folder)
  groups['__pinned__'] = [];

  // Folder groups
  allFolders.forEach(f => { groups[f.name] = []; });

  // Distribute pages
  Object.entries(allPages).forEach(([id, page]) => {
    const matchesFilter = !q || page.title.toLowerCase().includes(q) || id.includes(q);
    if (!matchesFilter) return;

    if (page.folder && groups[page.folder] !== undefined) {
      groups[page.folder].push({ id, page });
    } else {
      groups['__pinned__'].push({ id, page });
    }
  });

  let html = '';

  // Render pinned
  if (groups['__pinned__'].length) {
    groups['__pinned__'].forEach(({ id, page }) => {
      html += pageItemHTML(id, page);
    });
    if (allFolders.length) html += '<div class="divider" style="margin:4px 0"></div>';
  }

  // Render folders
  allFolders.forEach(folder => {
    const items = groups[folder.name] || [];
    if (!items.length && q) return; // hide empty folders when filtering
    html += `<div class="folder-group">
      <div class="folder-group-name">${folder.name}</div>
      ${items.map(({ id, page }) => pageItemHTML(id, page)).join('')}
      ${!items.length ? `<div style="padding:4px 16px 8px;font-size:0.78rem;color:var(--text-light)">No pages</div>` : ''}
    </div>`;
  });

  if (!html) html = '<div class="list-loading">No pages found</div>';
  pageList.innerHTML = html;

  // Bind clicks
  pageList.querySelectorAll('.page-item').forEach(el => {
    el.addEventListener('click', () => selectPage(el.dataset.id));
  });

  // Highlight active
  if (currentPageId) {
    const active = pageList.querySelector(`[data-id="${currentPageId}"]`);
    if (active) active.classList.add('active');
  }
}

function pageItemHTML(id, page) {
  const isActive = id === currentPageId ? ' active' : '';
  const folder = page.folder ? `<span class="page-item-folder">${page.folder}</span>` : '';
  return `<div class="page-item${isActive}" data-id="${id}" title="${id}">
    <span class="page-item-title">${page.title}</span>
    ${folder}
  </div>`;
}

// ─── Select/open a page ───────────────────────────────
function selectPage(id) {
  currentPageId = id;
  isNew = false;

  // Update active state in list
  pageList.querySelectorAll('.page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  renderEditor(id, allPages[id]);
}

// ─── Render editor ────────────────────────────────────
function renderEditor(id, page) {
  currentTags = [...(page.tags || [])];
  pendingHeroFile = null;

  const folderOptions = allFolders.map(f =>
    `<option value="${f.name}" ${page.folder === f.name ? 'selected' : ''}>${f.name}</option>`
  ).join('');

  const backlinksOptions = Object.entries(allPages)
    .filter(([pid]) => pid !== id)
    .map(([pid, p]) => {
      const checked = (page.backlinks || []).includes(pid) ? 'checked' : '';
      return `<label class="backlink-option">
        <input type="checkbox" value="${pid}" ${checked} /> ${p.title}
        <span style="color:var(--text-light);font-size:0.75em;margin-left:4px">${pid}</span>
      </label>`;
    }).join('');

  const heroSrc = page.hero ? `/${page.hero}` : '';

  panelRight.innerHTML = `
    <div class="editor">
      <div class="editor-form" id="editor-form">
        <!-- Header row -->
        <div class="editor-header">
          <span class="editor-page-id">${id}</span>
          <div class="editor-actions">
            <button class="btn btn-ghost btn-sm" id="btn-delete-page">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              Delete
            </button>
            <button class="btn btn-primary btn-sm" id="btn-save-page">
              Save
            </button>
          </div>
        </div>

        <!-- Title -->
        <div class="field">
          <label>Title</label>
          <input type="text" id="f-title" value="${escapeAttr(page.title)}" placeholder="Page title" />
        </div>

        <!-- Tags -->
        <div class="field">
          <label>Tags</label>
          <div class="tags-container" id="tags-container">
            <input type="text" class="tags-input" id="tags-input" placeholder="Type tag and press Enter…" />
          </div>
          <span class="field-hint">Press Enter or comma to add a tag. Example: #mindgarden</span>
        </div>

        <!-- Folder -->
        <div class="field">
          <label>Folder</label>
          <select id="f-folder">
            <option value="">— No folder (pinned) —</option>
            ${folderOptions}
          </select>
        </div>

        <!-- Hero image -->
        <div class="field">
          <label>Hero Image</label>
          ${heroSrc ? `<img src="${heroSrc}" class="hero-preview" id="hero-preview" alt="hero" />` : `<div id="hero-preview" style="display:none"></div>`}
          <div class="hero-actions">
            <label class="hero-upload-label" for="hero-file-input">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload image
            </label>
            <input type="file" id="hero-file-input" accept="image/*" />
            ${heroSrc ? `<button class="btn btn-ghost btn-sm" id="btn-remove-hero">Remove hero</button>` : ''}
          </div>
          <span class="field-hint">Recommended: 1200×500px. JPG, PNG, WebP, SVG.</span>
        </div>

        <!-- Content -->
        <div class="field">
          <label>Content (Markdown)</label>
          <textarea id="f-content-markdown" rows="12" placeholder="Write your content in Markdown...">${escapeHtml(page.contentMarkdown || '')}</textarea>
        </div>

        <div class="field">
          <label>Content (HTML) <span class="field-hint">(Auto-generated)</span></label>
          <textarea id="f-content" rows="6" placeholder="&lt;p&gt;Your content here…&lt;/p&gt;" disabled>${escapeHtml(page.content || '')}</textarea>
          <span class="field-hint">Wiki links: &lt;a class="wiki-link" data-page="page-id"&gt;text&lt;/a&gt;</span>
        </div>

        <!-- Backlinks -->
        <div class="field">
          <label>Backlinks (pages that link here)</label>
          <div class="backlinks-wrap" id="backlinks-wrap">
            ${backlinksOptions || '<div style="padding:10px;color:var(--text-light);font-size:0.82rem">No other pages yet</div>'}
          </div>
        </div>
      </div>

      <!-- Live preview -->
      <div class="editor-preview">
        <div class="preview-label">Live Preview</div>
        <div class="preview-content" id="live-preview">
          <h1>${page.title}</h1>
          ${page.content || ''}
        </div>
      </div>
    </div>
  `;

  // Init tags
  renderTags();

  // Wire events
  document.getElementById('btn-save-page').addEventListener('click', savePage);
  document.getElementById('btn-delete-page').addEventListener('click', () => openDeleteModal(id, page.title));
  
  const mdInput = document.getElementById('f-content-markdown');
  const htmlInput = document.getElementById('f-content');
  mdInput.addEventListener('input', () => {
    htmlInput.value = marked.parse(mdInput.value);
    updatePreview();
  });

  document.getElementById('f-title').addEventListener('input', updatePreview);
  document.getElementById('tags-input').addEventListener('keydown', onTagInput);
  document.getElementById('hero-file-input').addEventListener('change', onHeroUpload);
  const removeHero = document.getElementById('btn-remove-hero');
  if (removeHero) removeHero.addEventListener('click', removeHeroImage);
}

// ─── New page form ────────────────────────────────────
function renderNewPageForm() {
  isNew = true;
  currentPageId = null;
  currentTags = [];
  pendingHeroFile = null;

  // Deselect list items
  pageList.querySelectorAll('.page-item').forEach(el => el.classList.remove('active'));

  const folderOptions = allFolders.map(f =>
    `<option value="${f.name}">${f.name}</option>`
  ).join('');

  panelRight.innerHTML = `
    <div class="editor">
      <div class="editor-form">
        <div class="editor-header">
          <span class="editor-page-id">new page</span>
          <div class="editor-actions">
            <button class="btn btn-ghost btn-sm" id="btn-cancel-new">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btn-save-page">Create Page</button>
          </div>
        </div>

        <!-- Page ID -->
        <div class="field">
          <label>Page ID (URL slug)</label>
          <div class="id-field-wrap">
            <input type="text" id="f-id" placeholder="my-page-id" />
            <span class="id-auto-badge">auto from title</span>
          </div>
          <span class="field-hint">Used in URLs and internal links. Lowercase, hyphens only. Leave blank to auto-generate from title.</span>
        </div>

        <!-- Title -->
        <div class="field">
          <label>Title</label>
          <input type="text" id="f-title" placeholder="Page title" />
        </div>

        <!-- Tags -->
        <div class="field">
          <label>Tags</label>
          <div class="tags-container" id="tags-container">
            <input type="text" class="tags-input" id="tags-input" placeholder="Type tag and press Enter…" />
          </div>
        </div>

        <!-- Folder -->
        <div class="field">
          <label>Folder</label>
          <select id="f-folder">
            <option value="">— No folder (pinned) —</option>
            ${folderOptions}
          </select>
        </div>

        <!-- Content -->
        <div class="field">
          <label>Content (Markdown)</label>
          <textarea id="f-content-markdown" rows="10" placeholder="Write your content in Markdown..."></textarea>
        </div>

        <div class="field">
          <label>Content (HTML) <span class="field-hint">(Auto-generated)</span></label>
          <textarea id="f-content" rows="4" placeholder="&lt;p&gt;Your content here…&lt;/p&gt;" disabled></textarea>
          <span class="field-hint">Wiki links: &lt;a class="wiki-link" data-page="page-id"&gt;text&lt;/a&gt;</span>
        </div>
      </div>

      <div class="editor-preview">
        <div class="preview-label">Live Preview</div>
        <div class="preview-content" id="live-preview">
          <p style="color:var(--text-light);font-style:italic">Start typing to see preview…</p>
        </div>
      </div>
    </div>
  `;

  // Auto-populate ID from title
  const titleInput = document.getElementById('f-title');
  const idInput = document.getElementById('f-id');
  titleInput.addEventListener('input', () => {
    if (!idInput.dataset.manual) {
      idInput.value = slugify(titleInput.value);
    }
    updatePreview();
  });
  idInput.addEventListener('input', () => {
    idInput.dataset.manual = '1';
  });

  document.getElementById('btn-save-page').addEventListener('click', savePage);
  document.getElementById('btn-cancel-new').addEventListener('click', () => {
    panelRight.innerHTML = `<div class="editor-empty"><div class="editor-empty-icon">📝</div><p>Select a page to edit, or create a new one</p><button class="btn btn-primary" id="btn-new-page-2">+ New Page</button></div>`;
    document.getElementById('btn-new-page-2').addEventListener('click', renderNewPageForm);
    isNew = false;
  });

  const mdInput = document.getElementById('f-content-markdown');
  const htmlInput = document.getElementById('f-content');
  mdInput.addEventListener('input', () => {
    htmlInput.value = marked.parse(mdInput.value);
    updatePreview();
  });

  document.getElementById('tags-input').addEventListener('keydown', onTagInput);

  titleInput.focus();
}

// ─── Tags ─────────────────────────────────────────────
function renderTags() {
  const container = document.getElementById('tags-container');
  if (!container) return;
  const input = document.getElementById('tags-input');

  // Remove existing chips
  container.querySelectorAll('.tag-chip').forEach(el => el.remove());

  // Insert chips before input
  currentTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escapeHtml(tag)}<span class="tag-chip-remove" data-tag="${escapeAttr(tag)}">✕</span>`;
    chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
      currentTags = currentTags.filter(t => t !== tag);
      renderTags();
    });
    container.insertBefore(chip, input);
  });
}

function onTagInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val && !currentTags.includes(val)) {
      currentTags.push(val.startsWith('#') ? val : '#' + val);
      renderTags();
    }
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value && currentTags.length) {
    currentTags.pop();
    renderTags();
  }
}

// ─── Live preview ─────────────────────────────────────
function updatePreview() {
  const preview = document.getElementById('live-preview');
  if (!preview) return;
  const title = document.getElementById('f-title')?.value || '';
  const content = document.getElementById('f-content')?.value || '';
  preview.innerHTML = `<h1>${escapeHtml(title)}</h1>${content}`;
}

// ─── Hero image ───────────────────────────────────────
function onHeroUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  pendingHeroFile = file;

  // Show local preview
  const reader = new FileReader();
  reader.onload = ev => {
    let preview = document.getElementById('hero-preview');
    if (preview.tagName !== 'IMG') {
      const img = document.createElement('img');
      img.className = 'hero-preview';
      img.id = 'hero-preview';
      preview.replaceWith(img);
      preview = img;
    }
    preview.src = ev.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeHeroImage() {
  pendingHeroFile = null;
  const preview = document.getElementById('hero-preview');
  if (preview) preview.style.display = 'none';
  // Mark hero as removed
  document.getElementById('hero-file-input').value = '';
  document.getElementById('btn-remove-hero')?.remove();
  // Store a sentinel to clear on save
  panelRight.dataset.removeHero = '1';
}

// ─── Save page ────────────────────────────────────────
async function savePage() {
  const titleEl = document.getElementById('f-title');
  const contentEl = document.getElementById('f-content');
  const folderEl = document.getElementById('f-folder');
  const saveBtn = document.getElementById('btn-save-page');

  const title = titleEl?.value?.trim();
  if (!title) { showToast('Title is required', 'error'); titleEl?.focus(); return; }

  // Disable button + show spinner
  const origText = saveBtn.innerHTML;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving…';
  saveBtn.disabled = true;

  try {
    // 1. Upload hero image if pending
    let heroPath = null;

    if (pendingHeroFile) {
      const fd = new FormData();
      fd.append('image', pendingHeroFile);
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
      heroPath = upData.path;
    }

    // Collect backlinks
    const backlinks = [];
    document.querySelectorAll('#backlinks-wrap input[type="checkbox"]:checked').forEach(cb => {
      backlinks.push(cb.value);
    });

    // Build payload
    const payload = {
      title,
      tags: [...currentTags],
      folder: folderEl?.value || null,
      content: contentEl?.value || '',
      contentMarkdown: document.getElementById('f-content-markdown')?.value || '',
      backlinks,
    };

    // Handle hero
    if (heroPath) {
      payload.hero = heroPath;
    } else if (panelRight.dataset.removeHero) {
      payload.hero = null;
      delete panelRight.dataset.removeHero;
    } else if (!isNew && currentPageId && allPages[currentPageId]) {
      // keep existing
      payload.hero = allPages[currentPageId].hero;
    }

    let result;
    if (isNew) {
      const idInput = document.getElementById('f-id');
      if (idInput?.value?.trim()) payload.id = idInput.value.trim();
      result = await apiFetch('/api/pages', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      currentPageId = result.id;
      isNew = false;
    } else {
      result = await apiFetch(`/api/pages/${currentPageId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    }

    // Refresh local state
    await loadAll();
    renderPageList(pageFilter.value);

    // Re-select page
    const active = pageList.querySelector(`[data-id="${currentPageId}"]`);
    if (active) active.classList.add('active');

    showToast('✓ Page saved successfully');
    pendingHeroFile = null;

  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    saveBtn.innerHTML = origText;
    saveBtn.disabled = false;
  }
}

// ─── Delete ───────────────────────────────────────────
function openDeleteModal(id, title) {
  pendingDeleteId = id;
  document.getElementById('delete-page-title').textContent = title;
  deleteModal.style.display = 'flex';
}

document.getElementById('delete-modal-close').addEventListener('click', () => { deleteModal.style.display = 'none'; });
document.getElementById('delete-cancel').addEventListener('click', () => { deleteModal.style.display = 'none'; });
document.getElementById('delete-confirm').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    await apiFetch(`/api/pages/${pendingDeleteId}`, { method: 'DELETE' });
    deleteModal.style.display = 'none';
    showToast('Page deleted');
    currentPageId = null;
    await loadAll();
    panelRight.innerHTML = `<div class="editor-empty"><div class="editor-empty-icon">📝</div><p>Select a page to edit, or create a new one</p><button class="btn btn-primary" id="btn-new-page-2">+ New Page</button></div>`;
    document.getElementById('btn-new-page-2').addEventListener('click', renderNewPageForm);
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
});

// ─── Folders modal ────────────────────────────────────
document.getElementById('btn-manage-folders').addEventListener('click', openFoldersModal);
document.getElementById('folders-modal-close').addEventListener('click', () => { foldersModal.style.display = 'none'; });

function openFoldersModal() {
  editFolders = allFolders.map(f => ({ ...f, pages: [...f.pages] }));
  renderFoldersModal();
  foldersModal.style.display = 'flex';
}

function renderFoldersModal() {
  const body = document.getElementById('folders-modal-body');
  body.innerHTML = `<div class="folder-modal-list">
    ${editFolders.map((f, i) => `
      <div class="folder-modal-item" data-idx="${i}">
        <div>
          <div class="folder-modal-item-name">${escapeHtml(f.name)}</div>
          <div class="folder-modal-item-count">${f.pages.length} page(s)</div>
        </div>
        <div class="folder-modal-right">
          <button class="btn btn-ghost btn-sm" data-action="up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-ghost btn-sm" data-action="down" data-idx="${i}" ${i === editFolders.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-danger btn-sm" data-action="del" data-idx="${i}">Remove</button>
        </div>
      </div>
    `).join('')}
    ${!editFolders.length ? '<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px">No folders yet</div>' : ''}
  </div>`;

  body.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.action === 'up' && idx > 0) {
        [editFolders[idx - 1], editFolders[idx]] = [editFolders[idx], editFolders[idx - 1]];
      } else if (btn.dataset.action === 'down' && idx < editFolders.length - 1) {
        [editFolders[idx], editFolders[idx + 1]] = [editFolders[idx + 1], editFolders[idx]];
      } else if (btn.dataset.action === 'del') {
        editFolders.splice(idx, 1);
      }
      renderFoldersModal();
    });
  });
}

document.getElementById('btn-add-folder').addEventListener('click', () => {
  const nameInput = document.getElementById('new-folder-name');
  const name = nameInput.value.trim();
  if (!name) return;
  if (editFolders.find(f => f.name === name)) {
    showToast('Folder already exists', 'error'); return;
  }
  editFolders.push({ name, pages: [] });
  nameInput.value = '';
  renderFoldersModal();
});

document.getElementById('btn-save-folders').addEventListener('click', async () => {
  try {
    await apiFetch('/api/folders', {
      method: 'PUT',
      body: JSON.stringify({ folders: editFolders })
    });
    await loadAll();
    foldersModal.style.display = 'none';
    showToast('Folders saved');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
});

// ─── Filter ───────────────────────────────────────────
pageFilter.addEventListener('input', () => renderPageList(pageFilter.value));

// ─── New page buttons ────────────────────────────────
document.getElementById('btn-new-page').addEventListener('click', renderNewPageForm);
document.getElementById('btn-new-page-2').addEventListener('click', renderNewPageForm);

// ─── Click outside modals ────────────────────────────
[foldersModal, deleteModal].forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
});

// ─── Helpers ──────────────────────────────────────────
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}
function slugify(str) {
  return (str || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── Site Settings ────────────────────────────────────
const siteSettingsModal = document.getElementById('site-settings-modal');

document.getElementById('btn-site-settings').addEventListener('click', openSiteSettings);
document.getElementById('site-settings-close').addEventListener('click', () => { siteSettingsModal.style.display = 'none'; });
document.getElementById('site-settings-cancel').addEventListener('click', () => { siteSettingsModal.style.display = 'none'; });
siteSettingsModal.addEventListener('click', e => { if (e.target === siteSettingsModal) siteSettingsModal.style.display = 'none'; });

async function openSiteSettings() {
  // Load current site data
  try {
    const site = await apiFetch('/api/site');
    document.getElementById('settings-site-name').value = site.siteName || '';
    document.getElementById('settings-description').value = site.description || '';
    document.getElementById('settings-author').value = site.authorName || '';
    document.getElementById('settings-footer').value = site.footerText || '';
    document.getElementById('settings-theme').value = site.theme || 'dark';

    // Apply theme immediately to admin for preview
    if (site.theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    // Set avatar preview with cache bust
    const avatarPreview = document.getElementById('settings-avatar-preview');
    avatarPreview.src = `/${site.avatar || 'avatar.png'}?t=${Date.now()}`;
  } catch (e) {
    showToast('Could not load site settings: ' + e.message, 'error');
  }
  siteSettingsModal.style.display = 'flex';
}

// Avatar: instant upload when file selected
document.getElementById('settings-avatar-file').addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('settings-avatar-preview').src = ev.target.result;
  };
  reader.readAsDataURL(file);

  // Upload right away
  const statusEl = document.getElementById('avatar-upload-status');
  statusEl.textContent = 'Uploading…';
  statusEl.className = '';

  try {
    const fd = new FormData();
    fd.append('avatar', file);
    const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    // Bust cache on preview to show the real saved file
    document.getElementById('settings-avatar-preview').src = `/${data.avatar}?t=${Date.now()}`;
    statusEl.textContent = '✓ Avatar updated successfully!';
    statusEl.className = 'upload-status-ok';
    showToast('✓ Avatar uploaded');
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.className = 'upload-status-err';
    showToast('Avatar upload failed: ' + e.message, 'error');
  }
  this.value = ''; // reset input
});

// Save text settings
document.getElementById('btn-save-site-settings').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-site-settings');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  btn.disabled = true;

  try {
    await apiFetch('/api/site', {
      method: 'PUT',
      body: JSON.stringify({
        siteName: document.getElementById('settings-site-name').value,
        description: document.getElementById('settings-description').value,
        authorName: document.getElementById('settings-author').value,
        footerText: document.getElementById('settings-footer').value,
        theme: document.getElementById('settings-theme').value,
      })
    });
    showToast('✓ Site settings saved');
    
    // Apply theme change locally
    const selectedTheme = document.getElementById('settings-theme').value;
    if (selectedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }

    siteSettingsModal.style.display = 'none';
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
});

// ─── Backup & Restore ─────────────────────────────────

document.getElementById('btn-export-backup').addEventListener('click', () => {
  // Trigger download by opening the API endpoint
  window.location.href = '/api/backup/export';
});

document.getElementById('import-backup-file').addEventListener('change', async function() {
  const file = this.files[0];
  if (!file) return;

  const statusEl = document.getElementById('backup-restore-status');
  statusEl.textContent = 'Uploading and Restoring... Please wait...';
  statusEl.className = '';
  statusEl.style.color = 'var(--accent)';

  try {
    const fd = new FormData();
    fd.append('backup', file);
    const res = await fetch('/api/backup/import', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Restore failed');

    statusEl.innerHTML = '✓ Restore completed successfully! <br><span style="font-size:0.8em">Reloading page...</span>';
    statusEl.style.color = 'var(--success)';
    
    // Reload interface
    setTimeout(() => {
      window.location.reload();
    }, 1500);

  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.style.color = 'var(--danger)';
    showToast('Restore failed: ' + e.message, 'error');
  }
  this.value = ''; // reset input
});

// ─── Boot ─────────────────────────────────────────────
// ─── Auth ─────────────────────────────────────────────
const loginOverlay = document.getElementById('login-overlay');
const loginPasswordInput = document.getElementById('login-password');
const loginErrorEl = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

function showLoginOverlay() {
  loginOverlay.classList.remove('hiding', 'hidden');
  btnLogout.style.display = 'none';
  setTimeout(() => loginPasswordInput && loginPasswordInput.focus(), 300);
}

function hideLoginOverlay() {
  loginOverlay.classList.add('hiding');
  btnLogout.style.display = '';
  setTimeout(() => loginOverlay.classList.add('hidden'), 400);
}

async function doLogin() {
  const password = loginPasswordInput.value;
  if (!password) {
    loginErrorEl.textContent = 'Please enter your password.';
    loginErrorEl.style.display = 'block';
    return;
  }

  btnLogin.innerHTML = '<span class="spinner"></span> Signing in\u2026';
  btnLogin.disabled = true;
  loginErrorEl.style.display = 'none';

  try {
    await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    isAuthenticated = true;
    hideLoginOverlay();
    loginPasswordInput.value = '';
    await loadAll();
  } catch (e) {
    loginErrorEl.textContent = e.message || 'Incorrect password';
    loginErrorEl.style.display = 'block';
    loginPasswordInput.select();
  } finally {
    btnLogin.innerHTML = 'Sign In';
    btnLogin.disabled = false;
  }
}

btnLogin.addEventListener('click', doLogin);
loginPasswordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

btnLogout.addEventListener('click', async () => {
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch (_) { /* ignore */ }
  isAuthenticated = false;
  showLoginOverlay();
  showToast('Logged out');
});

(async () => {
  try {
    const status = await apiFetch('/api/auth/status');
    if (status.authenticated) {
      isAuthenticated = true;
      hideLoginOverlay();
      await loadAll();
    } else {
      showLoginOverlay();
    }
  } catch (e) {
    showLoginOverlay();
  }
})();
