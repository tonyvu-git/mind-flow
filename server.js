/**
 * Mind Garden — Express Backend
 * Serves frontend + provides REST API for page/folder management
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Paths ────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const PAGES_FILE = path.join(DATA_DIR, 'pages.json');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'mind-garden-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// ─── Auth helpers ─────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function checkAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ─── Auth endpoints ───────────────────────────────────

// GET /api/auth/status — check if logged in
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Incorrect password' });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Static: admin panel at /admin — protected by checkAuth
app.use('/admin', (req, res, next) => {
  // Allow index.html and static assets (CSS/JS) without auth
  // so the login screen can render
  const ext = path.extname(req.path);
  // Allow CSS, JS, fonts, images (static assets needed for login screen)
  if (ext && ext !== '.html') return next();
  // Always allow the main HTML (login overlay is embedded)
  return next();
});
app.use('/admin', express.static(ADMIN_DIR));

// Static: frontend at /
app.use(express.static(PUBLIC_DIR));

// ─── Helpers ──────────────────────────────────────────
function readPages() {
  try {
    return JSON.parse(fs.readFileSync(PAGES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writePages(pages) {
  fs.writeFileSync(PAGES_FILE, JSON.stringify(pages, null, 2), 'utf-8');
}

function readFolders() {
  try {
    return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeFolders(folders) {
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2), 'utf-8');
}

function readSite() {
  try {
    return JSON.parse(fs.readFileSync(SITE_FILE, 'utf-8'));
  } catch {
    return { siteName: 'my mind garden', description: '', avatar: 'avatar.png', authorName: '', footerText: 'Powered by a flow', theme: 'dark' };
  }
}

function writeSite(data) {
  fs.writeFileSync(SITE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Generate slug from title
function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── Multer (image upload) ────────────────────────────
const imageFileFilter = (req, file, cb) => {
  const allowed = /\.(jpe?g|png|gif|webp|svg)$/i;
  cb(null, allowed.test(file.originalname));
};

// General uploads (hero images)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Avatar upload — saves directly to public/ as avatar.png (replaces existing)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PUBLIC_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Save with timestamp so browser cache busts automatically
    cb(null, `avatar${ext}`);
  }
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 3 * 1024 * 1024 }, fileFilter: imageFileFilter });

// Backup upload
const backupStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, `backup-${Date.now()}.zip`)
});
const uploadBackup = multer({ storage: backupStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── API: Backups ────────────────────────────────────

// GET /api/backup/export
app.get('/api/backup/export', checkAuth, (req, res) => {
  try {
    const zip = new AdmZip();
    
    // Add raw json data
    if (fs.existsSync(PAGES_FILE)) zip.addLocalFile(PAGES_FILE, 'data');
    if (fs.existsSync(FOLDERS_FILE)) zip.addLocalFile(FOLDERS_FILE, 'data');
    if (fs.existsSync(SITE_FILE)) zip.addLocalFile(SITE_FILE, 'data');

    // Add uploads folder
    if (fs.existsSync(UPLOADS_DIR)) {
      zip.addLocalFolder(UPLOADS_DIR, 'uploads');
    }

    // Add avatar from public dir
    const site = readSite();
    if (site.avatar) {
      const avatarPath = path.join(PUBLIC_DIR, site.avatar);
      if (fs.existsSync(avatarPath)) {
        zip.addLocalFile(avatarPath, 'public');
      }
    }

    const zipBuffer = zip.toBuffer();
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="mind-garden-backup.zip"');
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

// POST /api/backup/import
app.post('/api/backup/import', checkAuth, uploadBackup.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file provided' });

  try {
    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();
    
    // Create folders if they don't exist
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    zipEntries.forEach((entry) => {
       const entryName = entry.entryName.replace(/\\/g, '/');
       
       // Handle JSON files inside 'data'
       if (entryName.startsWith('data/')) {
          const filename = path.basename(entryName);
          if (filename.endsWith('.json')) {
             zip.extractEntryTo(entry, DATA_DIR, false, true);
          }
       }
       // Handle uploads
       else if (entryName.startsWith('uploads/') && !entry.isDirectory) {
          zip.extractEntryTo(entry, UPLOADS_DIR, false, true);
       }
       // Handle public files (avatar)
       else if (entryName.startsWith('public/') && !entry.isDirectory) {
          zip.extractEntryTo(entry, PUBLIC_DIR, false, true);
       }
    });
    
    // Clean up temporary zip
    fs.unlinkSync(req.file.path);
    res.json({ success: true, message: 'Restore completed successfully' });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to restore backup: ' + err.message });
  }
});

// ─── API: Pages ──────────────────────────────────────

// GET /api/pages — all pages
app.get('/api/pages', (req, res) => {
  res.json(readPages());
});

// GET /api/pages/:id — single page
app.get('/api/pages/:id', (req, res) => {
  const pages = readPages();
  const page = pages[req.params.id];
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.json({ id: req.params.id, ...page });
});

// POST /api/pages — create new page
app.post('/api/pages', checkAuth, (req, res) => {
  const pages = readPages();
  const { id: customId, title, tags, folder, hero, content, contentMarkdown, backlinks } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const id = customId ? customId.trim() : slugify(title);

  if (pages[id]) {
    return res.status(409).json({ error: `Page with id "${id}" already exists` });
  }

  const now = new Date().toISOString();
  pages[id] = {
    title: title.trim(),
    tags: Array.isArray(tags) ? tags : [],
    folder: folder || null,
    hero: hero || null,
    content: content || '',
    contentMarkdown: contentMarkdown || '',
    backlinks: Array.isArray(backlinks) ? backlinks : [],
    createdAt: now,
    updatedAt: now
  };

  writePages(pages);

  // If folder specified, also add to folders.json if not present
  if (folder) {
    const folders = readFolders();
    const folderEntry = folders.find(f => f.name === folder);
    if (folderEntry) {
      if (!folderEntry.pages.includes(id)) folderEntry.pages.push(id);
    } else {
      folders.push({ name: folder, pages: [id] });
    }
    writeFolders(folders);
  }

  res.status(201).json({ id, ...pages[id] });
});

// PUT /api/pages/:id — update page
app.put('/api/pages/:id', checkAuth, (req, res) => {
  const pages = readPages();
  const { id } = req.params;

  if (!pages[id]) return res.status(404).json({ error: 'Page not found' });

  const { title, tags, folder, hero, content, contentMarkdown, backlinks } = req.body;
  const oldFolder = pages[id].folder;

  pages[id] = {
    ...pages[id],
    title: title !== undefined ? title.trim() : pages[id].title,
    tags: Array.isArray(tags) ? tags : pages[id].tags,
    folder: folder !== undefined ? (folder || null) : pages[id].folder,
    hero: hero !== undefined ? (hero || null) : pages[id].hero,
    content: content !== undefined ? content : pages[id].content,
    contentMarkdown: contentMarkdown !== undefined ? contentMarkdown : pages[id].contentMarkdown,
    backlinks: Array.isArray(backlinks) ? backlinks : pages[id].backlinks,
    updatedAt: new Date().toISOString()
  };

  writePages(pages);

  // Sync folders.json if folder changed
  const newFolder = pages[id].folder;
  if (oldFolder !== newFolder) {
    const folders = readFolders();

    // Remove from old folder
    if (oldFolder) {
      const old = folders.find(f => f.name === oldFolder);
      if (old) old.pages = old.pages.filter(p => p !== id);
    }

    // Add to new folder
    if (newFolder) {
      const nf = folders.find(f => f.name === newFolder);
      if (nf) { if (!nf.pages.includes(id)) nf.pages.push(id); }
      else folders.push({ name: newFolder, pages: [id] });
    }

    writeFolders(folders.filter(f => f.pages.length > 0));
  }

  res.json({ id, ...pages[id] });
});

// DELETE /api/pages/:id — delete page
app.delete('/api/pages/:id', checkAuth, (req, res) => {
  const pages = readPages();
  const { id } = req.params;

  if (!pages[id]) return res.status(404).json({ error: 'Page not found' });

  const folder = pages[id].folder;
  delete pages[id];
  writePages(pages);

  // Remove from folders
  if (folder) {
    const folders = readFolders();
    const fi = folders.find(f => f.name === folder);
    if (fi) fi.pages = fi.pages.filter(p => p !== id);
    writeFolders(folders.filter(f => f.pages.length > 0));
  }

  // Also remove from backlinks of other pages
  Object.keys(pages).forEach(pid => {
    if (pages[pid].backlinks && pages[pid].backlinks.includes(id)) {
      pages[pid].backlinks = pages[pid].backlinks.filter(b => b !== id);
    }
  });
  writePages(pages);

  res.json({ success: true, deleted: id });
});

// ─── API: Folders ─────────────────────────────────────

// GET /api/folders
app.get('/api/folders', (req, res) => {
  res.json(readFolders());
});

// PUT /api/folders — replace entire folder structure
app.put('/api/folders', checkAuth, (req, res) => {
  const { folders } = req.body;
  if (!Array.isArray(folders)) return res.status(400).json({ error: 'folders must be an array' });
  writeFolders(folders);
  res.json({ success: true, folders });
});

// POST /api/folders — add new folder
app.post('/api/folders', checkAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const folders = readFolders();
  if (folders.find(f => f.name === name)) {
    return res.status(409).json({ error: 'Folder already exists' });
  }
  folders.push({ name, pages: [] });
  writeFolders(folders);
  res.status(201).json({ success: true, folders });
});

// DELETE /api/folders/:name — remove folder (pages unassigned)
app.delete('/api/folders/:name', checkAuth, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const folders = readFolders();
  const idx = folders.findIndex(f => f.name === name);
  if (idx === -1) return res.status(404).json({ error: 'Folder not found' });

  // Unassign pages from folder
  const pages = readPages();
  folders[idx].pages.forEach(pid => {
    if (pages[pid]) pages[pid].folder = null;
  });
  writePages(pages);

  folders.splice(idx, 1);
  writeFolders(folders);
  res.json({ success: true });
});

// ─── API: Search ──────────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);

  const pages = readPages();
  const results = [];

  Object.entries(pages).forEach(([id, page]) => {
    const titleMatch = page.title.toLowerCase().includes(q);
    // Strip HTML tags for body search
    const bodyText = page.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const bodyIdx = bodyText.toLowerCase().indexOf(q);
    const bodyMatch = bodyIdx !== -1;

    if (titleMatch || bodyMatch) {
      let excerpt = '';
      if (bodyMatch) {
        const start = Math.max(0, bodyIdx - 40);
        const end = Math.min(bodyText.length, bodyIdx + q.length + 80);
        excerpt = (start > 0 ? '...' : '') + bodyText.slice(start, end) + (end < bodyText.length ? '...' : '');
      }
      results.push({ id, title: page.title, folder: page.folder, excerpt });
    }
  });

  res.json(results);
});

// ─── API: Image upload ────────────────────────────────
app.post('/api/upload', checkAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  // Return path relative to public dir
  const relativePath = `uploads/${req.file.filename}`;
  res.json({ success: true, path: relativePath, filename: req.file.filename });
});

// DELETE /api/upload/:filename — remove uploaded image
app.delete('/api/upload/:filename', checkAuth, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ─── API: Site settings ───────────────────────────────

// GET /api/site
app.get('/api/site', (req, res) => {
  res.json(readSite());
});

// PUT /api/site — update site metadata (name, description, footerText, authorName)
app.put('/api/site', checkAuth, (req, res) => {
  const site = readSite();
  const { siteName, description, authorName, footerText, theme } = req.body;
  if (siteName !== undefined) site.siteName = siteName.trim();
  if (description !== undefined) site.description = description.trim();
  if (authorName !== undefined) site.authorName = authorName.trim();
  if (footerText !== undefined) site.footerText = footerText.trim();
  if (theme !== undefined) site.theme = theme;
  writeSite(site);
  res.json({ success: true, site });
});

// POST /api/upload/avatar — upload new avatar image
app.post('/api/upload/avatar', checkAuth, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const ext = path.extname(req.file.originalname);
  const filename = `avatar${ext}`;
  // Update site.json with new avatar filename
  const site = readSite();
  site.avatar = filename;
  writeSite(site);
  res.json({ success: true, avatar: filename, path: filename });
});

// ─── Catch-all: serve frontend SPA ───────────────────
app.get('/{*any}', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Start ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌊 Mind Flow server running!`);
  console.log(`   Frontend:  http://localhost:${PORT}`);
  console.log(`   Admin:     http://localhost:${PORT}/admin`);
  console.log(`   API:       http://localhost:${PORT}/api/pages\n`);
});
