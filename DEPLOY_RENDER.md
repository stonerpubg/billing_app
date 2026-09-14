# Deploying to Render.com (Turso-backed)

Data lives in **Turso** (a hosted libSQL/SQLite service with a generous free
tier), not on Render's ephemeral disk. Every write replicates to Turso within a
few seconds, so restarts, redeploys, and free-tier idle sleep no longer wipe
your database.

The app uses libSQL's **embedded-replica** mode: a local SQLite file inside
the container is kept in sync with the remote Turso database. Reads hit the
local file (fast); writes go through libSQL and are pushed to Turso for
durability.

---

## 1. Create the Turso database

Install the Turso CLI (WSL / macOS / Linux):

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup      # or: turso auth login
turso db create mrl-db --location aws-ap-south-1   # Mumbai (change to your region)
turso db show mrl-db --url
turso db tokens create mrl-db
```

Save both values — you'll paste them into Render next.

### Seeding the database (first time only)

If you have an existing `mrl.sqlite` file with real data, dump it and pipe it
into Turso:

```bash
# From WSL (needs python3 sqlite3 module for the dump)
python3 -c "
import sqlite3, sys
con = sqlite3.connect('/mnt/d/path/to/data/mrl.sqlite')
sys.stdout.write('PRAGMA foreign_keys=OFF;\n')
for line in con.iterdump():
    sys.stdout.write(f'{line}\n')
" > dump.sql

cat dump.sql | turso db shell mrl-db
```

Verify with `turso db shell mrl-db "SELECT COUNT(*) FROM customers;"`.

---

## 2. Push your code to GitHub

Make sure `.env` is in `.gitignore` (already is) — the Turso token must stay
out of the repo.

```powershell
git init
git add .
git commit -m "Initial commit"
gh repo create mrl-group-of-companies --private --source=. --push
```

---

## 3. Create the Render service

- Sign up at [render.com](https://render.com) (free)
- Dashboard → **New +** → **Blueprint**
- Point it at your GitHub repo — Render reads `render.yaml`

`render.yaml` declares two env vars as `sync: false`:
- `TURSO_URL`
- `TURSO_AUTH_TOKEN`

On the first deploy, Render will prompt you to fill them in the dashboard.
Paste the values from step 1.

Render builds the Docker image (~5 min first time), boots on port 8080, and
gives you a URL like `https://mrl-group-of-companies.onrender.com`.

---

## 4. Log in

Default seeded credentials:
- **admin** / `admin123` — change this immediately in Settings.

Any data you enter now is persisted in Turso and survives restarts.

---

## Day-to-day

| Task | How |
|---|---|
| Deploy latest code | `git push` — Render auto-deploys on push to `main` |
| View logs | Dashboard → Service → **Logs** tab |
| Manual restart | Dashboard → Service → **Manual Deploy** |
| Rotate the Turso token | `turso db tokens create mrl-db`, paste into Render's Environment tab |
| Inspect production data | `turso db shell mrl-db` locally |
| Back up | `turso db shell mrl-db ".dump" > backup-$(date +%F).sql` |

## Cold starts on the free tier

Free-tier Render services **sleep after 15 minutes of inactivity**. The next
request takes 30–60 seconds to wake the container. Data is safe (it's in
Turso) — only the process takes a moment to boot. Upgrade to Starter ($7/mo)
for 24/7 uptime with no cold starts.

## Local development with Turso

Copy `.env.example` to `.env` and fill in the same `TURSO_URL` /
`TURSO_AUTH_TOKEN` values. Then `npm run dev` — your local Electron/web app
will read/write against the same Turso database as production. Handy for
support / debugging; risky for experimentation (use a separate `mrl-db-dev`
Turso database for that).

Leave `TURSO_URL` unset in `.env` and the app falls back to a pure-local
SQLite file at `./data/mrl.sqlite` with no cloud sync — good for offline
work.
