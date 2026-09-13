# Building the Windows installer

Produces `release/MRL-Group-of-Companies-Setup-1.0.0.exe` — a standard NSIS
installer users double-click to install. Comes bundled with your **current dev
database** as a seed, so the installed app opens with all employees,
attendance, payroll, income, and expense data already there.

---

## Prerequisites (one-time)

- Node.js 20+ installed
- All dependencies installed: `npm install`
- `resources/seed/mrl.sqlite` exists (bundled current dev DB — I already copied
  it there for you when you asked to preserve current data)

## Build the installer

From the project root in PowerShell:

```powershell
npm run build:win
```

This runs:
1. `vite build` → bundles the React frontend into `dist/`
2. `electron-builder --win` → wraps everything with Electron + creates an NSIS installer

Expected time: **5–10 minutes on first build**, 2–3 min on subsequent builds.

Output:
```
release/
  MRL-Group-of-Companies-Setup-1.0.0.exe    ← give this to end users
  win-unpacked/                              ← unpacked app (for testing)
  builder-effective-config.yaml              ← generated config (for debugging)
```

The installer is a single ~120 MB `.exe` file. That's Electron's baseline —
it embeds Chromium.

---

## Installing on a Windows machine

1. **Double-click** `MRL-Group-of-Companies-Setup-1.0.0.exe`
2. Confirm the User Account Control prompt
3. **Choose install location** (NSIS lets users pick, default is
   `C:\Users\<you>\AppData\Local\Programs\MRL GROUP OF COMPANIES`)
4. Installer creates desktop + Start Menu shortcuts labelled
   **MRL GROUP OF COMPANIES**
5. Launch from the desktop shortcut

## First launch — the seed DB

On the very first launch:
- App checks if `%APPDATA%\MRL GROUP OF COMPANIES\data\mrl.sqlite` exists
- It doesn't (fresh install), so the app copies the bundled seed DB there
- All your employees, attendance, payroll runs, incomes, expenses **appear immediately**
- Second launch onwards: uses the user's own DB (never overwrites)

You can verify by checking the AppData folder after install:
```
%APPDATA%\MRL GROUP OF COMPANIES\
  data\
    mrl.sqlite         ← your working DB
    mrl.sqlite-wal     ← SQLite write-ahead log (created on first write)
    mrl.sqlite-shm     ← SQLite shared memory (created on first write)
  assets\               ← uploaded logo, watermark, receipts
```

Login with **admin** / `admin123` (from the seed) — change password
immediately in Settings.

---

## Common build issues

**`Error: better-sqlite3 was compiled against a different Node version`**
Fix: rebuild native modules for Electron.
```powershell
npm run rebuild:electron
npm run build:win
```

**`Error: Cannot find module 'electron'`**
Fix: reinstall dependencies.
```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run build:win
```

**Antivirus flags the installer as suspicious**
Common with unsigned NSIS installers. Options:
- Add an exception in Windows Defender / your AV
- Get a code-signing certificate (~₹10,000/year from DigiCert, Sectigo, etc.)
  and add `"win": { "certificateFile": "path.pfx", "certificatePassword": "…" }`
  to the `build:` block in `package.json`

**Installer size seems huge (>150 MB)**
Normal — Electron bundles a full Chromium browser (~110 MB baseline). To
reduce: strip out unused pdfmake fonts, node_modules, or use `asarUnpack` for
large native deps.

---

## Updating the app on end-user machines

Every time you cut a new release:
1. Bump version in `package.json` (e.g. `1.0.0` → `1.0.1`)
2. `npm run build:win`
3. Send the new `MRL-Group-of-Companies-Setup-1.0.1.exe`
4. User runs the new installer — NSIS uninstalls old version, installs new one
5. **User's data is preserved** — installer doesn't touch `%APPDATA%\MRL GROUP OF COMPANIES\`

The seed-DB copy logic only fires on **first install** (when AppData is
empty), so upgrades never overwrite live data.

---

## Refreshing the bundled seed for a fresh installer

If you want the NEXT installer to ship with today's data (not the old dev DB
from when you first ran this build):

```powershell
# Copy your current dev DB over the seed
Copy-Item "d:\New folder (2)\data\data\mrl.sqlite" -Destination "d:\New folder (2)\resources\seed\mrl.sqlite" -Force

# Then re-build
npm run build:win
```

The new installer will bundle whatever data was in your dev DB at that moment.

---

## Distributing to multiple machines

Once you have `MRL-Group-of-Companies-Setup-1.0.0.exe`:
- **USB pen drive** — copy the .exe, run on each PC
- **Google Drive / OneDrive** — share the download link
- **Email** — too big for most email limits (~120 MB); use a file-share link
- **Company file server** — put it on a shared drive, install from there
