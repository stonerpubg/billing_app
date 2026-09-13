# Deploying to Render.com

## ⚠ Read this first

Render's **free tier** gives you a container but **no persistent disk**. Every
restart, redeploy, or 15-minute idle sleep wipes your SQLite database back to
the seed state.

Concretely: every quotation, invoice, payroll run, income entry, and payment
you make **will disappear** on every restart. This is fine for a demo you're
OK re-seeding, but **not fine for real business data**.

For real production with persistence:
- **Recommended:** use Fly.io free tier instead — see [DEPLOY_FLY.md](DEPLOY_FLY.md).
  Fly gives you a persistent 1 GB volume free of charge.
- **Alternative:** upgrade Render to the **Starter plan ($7/mo)** which includes
  a persistent disk. Instructions in the "Upgrade to persistent" section below.

---

## Free tier deploy (data-loss demo mode)

### 1. Push your code to GitHub

Create a new GitHub repo, push everything except the `data/` and `release/` folders:

```powershell
git init
git add .
git commit -m "Initial commit"
gh repo create mrl-group-of-companies --private --source=. --push
```

(Make sure `.gitignore` excludes `node_modules/`, `dist/`, `release/`, and `data/`.)

### 2. Create a Render account + connect the repo

- Sign up at [render.com](https://render.com) (free)
- Dashboard → **New +** → **Blueprint**
- Point it at your GitHub repo
- Render reads `render.yaml` in the repo root and configures everything

### 3. First deploy runs automatically

- Render pulls the code, builds using the Dockerfile (~5 min first time)
- Auto-generates `SESSION_SECRET` from `render.yaml`'s `generateValue: true`
- Boots the server on port 8080
- Gives you a URL like `https://mrl-group-of-companies.onrender.com`

### 4. Log in

Default credentials on the first launch (from the seed data):
- **admin** / `admin123` — change immediately in Settings

Any data you enter now will vanish on the next restart. Consider this a demo
env only.

---

## Upgrading to persistent (Starter plan, $7/mo)

Once you have real data, switch to Starter to keep it safe.

### 1. Edit `render.yaml`

```yaml
plan: starter   # was: free

disk:           # uncomment this block
  name: mrl-data
  mountPath: /data
  sizeGB: 1
```

### 2. Commit + push

```powershell
git add render.yaml
git commit -m "Upgrade to Render Starter with persistent disk"
git push
```

Render sees the change and prompts you to upgrade the service. Confirm, add a
card, and the next deploy attaches a 1 GB volume at `/data`. `mrl.sqlite`
then survives restarts.

---

## Day-to-day

| Task | How |
|---|---|
| Deploy latest code | `git push` — Render auto-deploys on push to `main` |
| View logs | Dashboard → Service → **Logs** tab |
| Manual restart | Dashboard → Service → **Manual Deploy** → Clear cache & deploy |
| Environment vars | Dashboard → Service → **Environment** tab |
| Custom domain | Dashboard → Service → **Settings** → **Custom Domains** |

## Backing up the SQLite DB (paid plan only)

Render doesn't expose SSH on the free tier. On the Starter+ plan:

```powershell
# Install Render CLI from render.com/docs/cli
render ssh <service-id>
# Inside the container:
sqlite3 /data/data/mrl.sqlite ".backup /tmp/backup.sqlite"
# Then in another local terminal:
scp <service-id>:/tmp/backup.sqlite ./mrl_backup.sqlite
```

## Cold starts on the free tier

Free-tier services **sleep after 15 minutes of inactivity**. The next request
takes **30–60 seconds** to wake the container. Users see a spinner during that
time. Not appropriate for anything customer-facing.

Starter plan runs 24/7 with no cold starts.
