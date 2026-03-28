# Mind Flow 🌊

A personal digital garden / knowledge base — built with Node.js + Express.

## Structure

```
mind-flow/
├── server.js          # Express backend (API + static server)
├── package.json
├── data/
│   ├── pages.json     # All page content
│   ├── folders.json   # Navigation folder structure
│   └── site.json      # Site name, avatar, description
├── public/            # Frontend (served at /)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── avatar.png
│   └── uploads/       # Uploaded hero images (auto-created)
└── admin/             # Admin panel (served at /admin)
    ├── index.html
    ├── admin.css
    └── admin.js
```

## Quick Start

```bash
npm install
node server.js
```

- Frontend: http://localhost:3000  
- Admin:    http://localhost:3000/admin

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |
