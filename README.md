# MRL Quotation

Quotation management app for **MRL Fabrications** — plumbing, roofing, electrical, and fabrication works.

Runs in **two modes off the same codebase**:
- **Desktop** — Electron app (Windows installer via `electron-builder`)
- **Web** — Node.js server (Express + SQLite) accessible via browser from any device on the internet

Features:
- Sign-in with two roles: **Admin** (products, settings, PDF designer) and **User** (quotations, customers)
- Auto-numbered quotations, per-product GST rates, HSN/SAC codes
- Full **PDF Designer** — click any element to edit colors/fonts/visibility; drag logo + watermark + blocks; arrow-key nudging; per-block alignment
- PDF export with company logo, watermark, CGST/SGST split, amount in words, terms, bank details, signature
- Customer directory, dashboard, in-app PDF preview (canvas, no print-viewer chrome)

## Quick start

### Desktop (Electron)

```powershell
npm install
npm run dev
```

The Electron window opens. Sign in with `admin` / `admin123` — you'll be nagged to change the password.

To build a Windows installer:
```powershell
npm run build:win
```

### Web (browser)

Local dev:
```powershell
npm run rebuild:node    # once — better-sqlite3 needs the Node ABI, not Electron's
npm run dev:web         # runs Vite (5173) + Express (8080) together
```

Open http://localhost:5173 in any browser. Vite proxies `/api/*` to Express automatically.

Production single-server build:
```powershell
npm run rebuild:node
npm run web             # builds dist/, then serves everything on port 8080
```

Open http://localhost:8080.

## Deploy to the public internet

The included `Dockerfile` and `fly.toml` deploy to **Fly.io** with persistent SQLite storage and free HTTPS.

```bash
# 1. Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
fly auth login

# 2. Edit fly.toml → change `app = "mrl-quotation"` to something globally unique

# 3. First-time setup
fly launch --copy-config --no-deploy   # creates the app, don't deploy yet
fly volume create mrl_data --size 1 --region sin   # persistent SQLite disk
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)

# 4. Deploy
fly deploy
```

Your app is now at `https://<your-app>.fly.dev`. HTTPS is automatic.

**Immediately after first sign-in:**
1. Sign in as admin (`admin` / `admin123`)
2. Go to **Settings → Change password** — pick a strong one
3. Do the same for the `user` account (sign in as user, change password)

The yellow banner at the top of the app warns you if any account is still on the default password.

### Deploy to any other host (Render, Railway, DigitalOcean, VPS)

The `Dockerfile` is generic — any Docker-capable host works.

Required env vars:
- `NODE_ENV=production`
- `SESSION_SECRET=<random 32+ chars>` — see `openssl rand -hex 32`
- `PORT=8080` (or whatever the host expects)
- `DATA_DIR=/data` — mount a persistent volume here

## Default credentials

| Role  | Username | Password   |
|-------|----------|-----------|
| Admin | `admin`  | `admin123` |
| User  | `user`   | `user123`  |

**Change immediately** if the server is on the public internet.

## Data locations

**Desktop:** `%APPDATA%\MRL Quotation\data\mrl.sqlite` and `%APPDATA%\MRL Quotation\assets\`

**Web:** `<DATA_DIR>/data/mrl.sqlite`, `<DATA_DIR>/assets/`, `<DATA_DIR>/sessions.sqlite`

Back these up. Fly.io volumes are single-region — snapshot occasionally.

## Architecture

```
                     ┌─────────────── React (src/) ───────────────┐
                     │  window.api  is the single source of truth │
                     └─────────────────────────────────────────────┘
                                    │                    │
                    Electron mode   │                    │  Web mode
                                    ▼                    ▼
                    ┌───────────────────────┐   ┌──────────────────────┐
                    │ electron/preload.js   │   │ src/api/http.js      │
                    │ (contextBridge → IPC) │   │ (fetch → /api/*)     │
                    └───────────────────────┘   └──────────────────────┘
                                    │                    │
                                    ▼                    ▼
                    ┌───────────────────────┐   ┌──────────────────────┐
                    │ electron/main.js      │   │ server/index.js      │
                    │ (IPC handlers)        │   │ (Express routes)     │
                    └───────────────────────┘   └──────────────────────┘
                                    │                    │
                                    ▼                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  electron/database.js (better-sqlite3)      │
                    │  electron/pdf-generator.js (pdfmake)        │
                    └─────────────────────────────────────────────┘
```

Both modes share the same DB layer and PDF generator. The frontend uses `window.api` identically — an HTTP shim installs itself when Electron isn't present.

## Local dev: switching between Electron and Node

Native SQLite is compiled per Node ABI. If you switch between `npm run dev` (Electron) and `npm run dev:web` (Node server) locally, rebuild native modules:

```powershell
npm run rebuild:node       # before running the Node server
npm run rebuild:electron   # before running Electron
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron dev mode (Vite + Electron) |
| `npm run dev:web` | Web dev mode (Vite + Express, /api proxied) |
| `npm run web` | Build frontend + start production Node server |
| `npm run start:server` | Start the production Node server (assumes `dist/` exists) |
| `npm run build:vite` | Build the React frontend into `dist/` |
| `npm run build:win` | Build Windows Electron installer |
| `npm run rebuild:node` | Rebuild better-sqlite3 for Node (before running server) |
| `npm run rebuild:electron` | Rebuild better-sqlite3 for Electron (before running Electron) |
