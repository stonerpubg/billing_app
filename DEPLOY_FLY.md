# Deploying to Fly.io

MRL GROUP OF COMPANIES runs as an Express server (`server/index.js`) serving the
built React frontend + REST API + SQLite. Fly.io hosts it in a Docker container
with a persistent 1 GB volume mounted at `/data` for the SQLite file.

**Cost:** free within Fly's ~$5/month usage credit for a single small VM (1 shared
CPU, 512 MB RAM) + 1 GB volume. Auto-sleeps when idle, wakes in ~2 seconds.

---

## One-time setup (10 minutes)

### 1. Install flyctl (Windows PowerShell)

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Restart your terminal after install so `fly` is on PATH.

### 2. Sign up / log in

```powershell
fly auth signup    # if you don't have an account
# or
fly auth login
```

You'll need a credit card on file (Fly requires it even for free-tier usage —
they charge $0 as long as you stay under the credit).

### 3. Pick a globally unique app name

Edit `fly.toml` and change the first line:

```toml
app = "your-unique-name-here"    # e.g. mrl-group-tirupur
```

App names must be globally unique across all Fly customers. If the name is taken
you'll get an error on launch — pick another.

### 4. Create the app on Fly (without deploying yet)

```powershell
fly launch --copy-config --no-deploy
```

Answers to the prompts:
- **Do you want to tweak these settings before proceeding?** → No
- If it asks about a database — say No (we're using SQLite in a volume)
- If it complains about the app name being taken, edit `fly.toml` and re-run

### 5. Create the persistent volume for SQLite

```powershell
fly volume create mrl_data --size 1 --region bom
```

- Size: `1` GB is plenty for years of quotations/invoices/payroll
- Region MUST match `primary_region` in `fly.toml` (default: `bom` = Mumbai)

### 6. Set the session secret

The server refuses to start in production without `SESSION_SECRET`. Generate a
random one:

```powershell
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
fly secrets set SESSION_SECRET=$secret
```

### 7. Deploy

```powershell
fly deploy
```

First build takes ~3–5 min (Docker build + push). Subsequent deploys are ~1 min.

### 8. Open it in your browser

```powershell
fly open
```

You'll land on the login page. Default credentials from the seed:
- **admin** / `admin123`  ← change immediately in Settings after first login
- **user**  / `user123`

---

## Day-to-day

| Task | Command |
|---|---|
| Deploy latest code | `git commit …; fly deploy` |
| View live logs | `fly logs` |
| Check status | `fly status` |
| SSH into the running machine | `fly ssh console` |
| Restart | `fly apps restart mrl-quotation` |
| View secrets | `fly secrets list` |

## Backing up the SQLite DB

The DB lives at `/data/data/mrl.sqlite` inside the machine. To pull a backup to
your local machine:

```powershell
fly ssh sftp shell
# inside the sftp shell:
get /data/data/mrl.sqlite ./mrl_backup.sqlite
exit
```

Do this before major changes or on a schedule (weekly is fine for a small business).

## Restoring a backup

```powershell
fly ssh sftp shell
put ./mrl_backup.sqlite /data/data/mrl.sqlite
exit
fly apps restart mrl-quotation
```

---

## Cost monitoring

```powershell
fly dashboard   # opens the web UI
```

Under **Billing** you'll see usage against the $5/month free credit. A single
small VM + 1 GB volume for a low-traffic business app typically runs
**$0.50–$2/month**, comfortably inside the free credit.

If you exceed the credit Fly emails you before charging — no surprise bills.

## Scaling up later (paid, if needed)

```powershell
fly scale memory 1024              # bump to 1 GB RAM
fly scale count 1 --region bom     # single always-on machine
# Disable auto-sleep for always-on behaviour:
# edit fly.toml → auto_stop_machines = false → fly deploy
```

---

## Troubleshooting

**"App name has already been taken"** — edit `app = "…"` in `fly.toml`, pick a
unique name, re-run `fly launch --copy-config --no-deploy`.

**"FATAL: SESSION_SECRET env var must be set in production"** in logs — you
skipped step 6. Set the secret and redeploy: `fly deploy`.

**Login page loads but login fails** — cookies aren't being set because
`force_https = true` in `fly.toml` requires HTTPS. Always open the app via the
`https://` URL Fly gave you, not `http://`.

**Data disappeared after a restart** — the volume wasn't created or wasn't
mounted. Verify with `fly volume list` (should show `mrl_data` in the `bom`
region) and `fly ssh console → ls /data/data/` (should show `mrl.sqlite`).

**Build fails with `better-sqlite3` errors** — the Dockerfile already handles
this via `npm rebuild better-sqlite3`. If you see this, share the full build log:
`fly deploy --verbose`.
