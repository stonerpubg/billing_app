// Thin wrapper around the `libsql` package, a synchronous native fork of
// better-sqlite3 that also supports embedded-replica sync with Turso.
//
// Behavior modes:
//   • TURSO_URL set: embedded replica — local SQLite file kept in sync with
//     remote Turso every 30 seconds. Reads hit the local file; writes go
//     through libSQL and replicate to Turso.
//   • TURSO_URL unset: pure local SQLite. Same interface, no cloud sync.
//
// libsql's API is sync end-to-end (no promises, no deasync), so it drops
// into existing better-sqlite3 code as-is. The only compatibility shim below
// is undefined→null bind coercion.

const Database = require('libsql');
const path = require('node:path');
const fs = require('node:fs');

// Minimal .env loader — reads KEY=VALUE lines from <cwd>/.env if it exists.
// Skips keys already set in the real environment so Render/Fly-injected
// values always win over the committed file.
(function loadDotEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_e) { /* .env is optional */ }
})();

// libsql rejects `undefined` as a bind value; better-sqlite3 treats it as
// NULL and several call sites in database.js rely on that.
function coerceUndefined(v) {
  return v === undefined ? null : v;
}
function coerceArgs(args) {
  if (args.length === 0) return args;
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object'
      && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
    const out = {};
    for (const [k, v] of Object.entries(args[0])) out[k] = coerceUndefined(v);
    return [out];
  }
  return args.map(coerceUndefined);
}

// libsql's native exec hangs on the app's long multi-statement schema, so we
// split by ; ourselves and run each statement individually. We also strip
// SQL comments up front — better-sqlite3 tolerated bare-comment fragments,
// libsql chokes on them.
function stripSqlComments(sql) {
  let out = '';
  let inStr = false;
  let strCh = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (inStr) {
      out += c;
      if (c === strCh) {
        if (next === strCh) { out += sql[++i]; }
        else { inStr = false; }
      }
      continue;
    }
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; }
    out += c;
  }
  return out;
}

function splitStatements(sql) {
  const cleaned = stripSqlComments(sql);
  const out = [];
  let buf = '';
  let inStr = false;
  let strCh = '';
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      buf += c;
      if (c === strCh) {
        if (cleaned[i + 1] === strCh) { buf += cleaned[++i]; }
        else { inStr = false; }
      }
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; strCh = c; buf += c; continue; }
    if (c === ';') {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function wrap(db) {
  const origPrepare = db.prepare.bind(db);
  const origExec = db.exec.bind(db);
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origGet = stmt.get.bind(stmt);
    const origAll = stmt.all.bind(stmt);
    const origRun = stmt.run.bind(stmt);
    const origIterate = stmt.iterate ? stmt.iterate.bind(stmt) : null;
    stmt.get = (...a) => origGet(...coerceArgs(a));
    stmt.all = (...a) => origAll(...coerceArgs(a));
    stmt.run = (...a) => origRun(...coerceArgs(a));
    if (origIterate) stmt.iterate = (...a) => origIterate(...coerceArgs(a));
    return stmt;
  };
  db.exec = (sql) => {
    for (const stmt of splitStatements(String(sql))) {
      origExec(stmt);
    }
  };
  return db;
}

let api = null;

function open(dataDir) {
  if (api) return api;

  const localDir = path.join(dataDir, 'data');
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, 'mrl.sqlite');

  const tursoUrl = process.env.TURSO_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  let db;
  if (tursoUrl && tursoToken) {
    console.log(`[db] embedded replica mode — syncing with ${tursoUrl.slice(0, 50)}...`);
    // libsql's embedded replica needs its own metadata file next to the sqlite
    // file. If the file was created by better-sqlite3 (pre-Turso) we'd hit
    // "invalid local state: db file exists but metadata file does not". Turso
    // is authoritative now, so wipe any stray local files and let libsql
    // re-hydrate from the cloud.
    const metaPath = localPath + '-info';
    if (fs.existsSync(localPath) && !fs.existsSync(metaPath)) {
      console.log('[db] stale local SQLite detected — clearing so libsql can re-hydrate from Turso');
      for (const suffix of ['', '-shm', '-wal', '-journal', '-info']) {
        try { fs.unlinkSync(localPath + suffix); } catch (_e) { /* fine */ }
      }
    }
    db = new Database(localPath, {
      syncUrl: tursoUrl,
      authToken: tursoToken,
      syncPeriod: 30, // seconds
    });
    try {
      db.sync();
      console.log('[db] initial sync with Turso complete');
    } catch (e) {
      console.warn('[db] initial sync failed (using local state):', e.message);
    }
  } else {
    console.log(`[db] local-only mode — ${localPath}`);
    db = new Database(localPath);
  }

  api = wrap(db);
  return api;
}

module.exports = { open };
