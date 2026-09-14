// Sync-compatible libsql client. Makes @libsql/client feel exactly like better-sqlite3
// so the existing 3,881-line database.js needs zero changes.
//
// Behavior modes:
//   • TURSO_URL set: uses embedded replica (local file synced with remote Turso every 30s).
//     All writes go through libsql and sync to Turso for durability.
//   • TURSO_URL unset: pure local libsql (a plain file:// URL). Same interface, no cloud sync.
//
// The trade-off vs better-sqlite3: every call blocks the event loop briefly (deasync waits
// for the promise). For an internal business app with few concurrent users this is fine.
// For high-traffic APIs it would not be, but that's not this app.

const { createClient } = require('@libsql/client');
const deasync = require('deasync');
const path = require('node:path');
const fs = require('node:fs');

// Minimal .env loader — reads KEY=VALUE lines from <cwd>/.env if it exists.
// Skips keys that are already set in the real environment so Render/Fly-injected
// vars always win over the committed file.
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
  } catch (_e) { /* ignore — .env is optional */ }
})();

/** Run an async promise synchronously by pumping the event loop. */
function syncCall(promise) {
  let done = false, err, val;
  promise.then((v) => { val = v; done = true; }).catch((e) => { err = e; done = true; });
  deasync.loopWhile(() => !done);
  if (err) throw err;
  return val;
}

// Named params fail on the Hrana write path in embedded-replica mode, so we
// rewrite every named marker (@name / :name / $name) to positional `?` and
// build a positional value array from the caller's object. Works everywhere.
// libsql rejects `undefined` as a bind value. better-sqlite3 accepts it and
// treats it as NULL, and lots of database.js call sites rely on that. So we
// normalize undefined → null at the boundary.
function safeVal(v) {
  return v === undefined ? null : v;
}

function rewriteToPositional(sql, argsObj) {
  const order = [];
  const outSql = String(sql).replace(/[@:$](\w+)/g, (_m, name) => {
    order.push(name);
    return '?';
  });
  const values = order.map((n) => safeVal(argsObj != null ? argsObj[n] : null));
  return { sql: outSql, args: values };
}

/** Convert a better-sqlite3-style call site into libsql {sql, args}. */
function prepareCall(sql, callArgs) {
  const isObjectArg = callArgs.length === 1
    && callArgs[0] !== null
    && typeof callArgs[0] === 'object'
    && !Array.isArray(callArgs[0])
    && !(callArgs[0] instanceof Uint8Array);
  if (isObjectArg) {
    return rewriteToPositional(sql, callArgs[0]);
  }
  // Positional args — flatten and map undefined → null.
  const flat = callArgs.length === 0 ? [] : callArgs.flat().map(safeVal);
  return { sql: String(sql), args: flat };
}

/**
 * Wrap a libsql client with a better-sqlite3-compatible API.
 * Everything downstream calls this looks-sync object.
 */
function wrapClient(client) {
  return {
    // db.prepare(sql) → statement with .get/.all/.run
    prepare(sql) {
      return {
        get: (...args) => {
          const c = prepareCall(sql, args);
          const r = syncCall(client.execute(c));
          return r.rows[0] ? { ...r.rows[0] } : undefined;
        },
        all: (...args) => {
          const c = prepareCall(sql, args);
          const r = syncCall(client.execute(c));
          return r.rows.map((row) => ({ ...row }));
        },
        run: (...args) => {
          const c = prepareCall(sql, args);
          const r = syncCall(client.execute(c));
          return {
            lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : 0,
            changes: r.rowsAffected || 0,
          };
        },
        iterate: (...args) => {
          const c = prepareCall(sql, args);
          const r = syncCall(client.execute(c));
          return r.rows.map((row) => ({ ...row }));
        },
      };
    },

    // db.exec(rawSql) — multi-statement DDL usually
    exec(rawSql) {
      // Split on ';' but keep it simple — the schema strings in database.js are well-behaved.
      const parts = rawSql
        .split(/;\s*(?=CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA|BEGIN|COMMIT|\/\*|--|\s*$)/i)
        .map((s) => s.trim())
        .filter((s) => s && !s.match(/^\s*(--|\/\*)/));
      for (const stmt of parts) {
        if (stmt.trim()) {
          try {
            syncCall(client.execute(stmt));
          } catch (e) {
            // Some PRAGMA statements aren't supported in libsql — warn but continue
            if (String(e.message).match(/pragma|unsupported/i)) {
              console.warn('[db.exec] skipping unsupported statement:', stmt.slice(0, 60));
              continue;
            }
            throw e;
          }
        }
      }
    },

    // db.pragma(name) or db.pragma('name = value')
    pragma(cmd) {
      try {
        const r = syncCall(client.execute(`PRAGMA ${cmd}`));
        return r.rows;
      } catch (e) {
        // Many PRAGMAs (WAL, foreign_keys) aren't needed on libsql — silently skip
        return [];
      }
    },

    // db.transaction(fn) → returns a function that when called runs fn in a transaction
    transaction(fn) {
      return (...outerArgs) => {
        const txn = syncCall(client.transaction('write'));
        // Wrap the txn so nested prepare()/exec() calls hit the transaction
        const txWrapped = {
          prepare(sql) {
            return {
              get: (...args) => {
                const c = prepareCall(sql, args);
                const r = syncCall(txn.execute(c));
                return r.rows[0] ? { ...r.rows[0] } : undefined;
              },
              all: (...args) => {
                const c = prepareCall(sql, args);
                const r = syncCall(txn.execute(c));
                return r.rows.map((row) => ({ ...row }));
              },
              run: (...args) => {
                const c = prepareCall(sql, args);
                const r = syncCall(txn.execute(c));
                return {
                  lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : 0,
                  changes: r.rowsAffected || 0,
                };
              },
              iterate: (...args) => {
                const c = prepareCall(sql, args);
                const r = syncCall(txn.execute(c));
                return r.rows.map((row) => ({ ...row }));
              },
            };
          },
          exec(sql) {
            const parts = String(sql).split(';').map((s) => s.trim()).filter(Boolean);
            for (const stmt of parts) syncCall(txn.execute(stmt));
          },
        };

        try {
          // Temporarily swap the outer `db` object's methods to hit the transaction.
          // Since database.js references the outer db from closure, we monkey-patch.
          const savedPrepare = api.prepare;
          const savedExec = api.exec;
          api.prepare = txWrapped.prepare;
          api.exec = txWrapped.exec;
          try {
            const result = fn(...outerArgs);
            syncCall(txn.commit());
            return result;
          } finally {
            api.prepare = savedPrepare;
            api.exec = savedExec;
          }
        } catch (e) {
          try { syncCall(txn.rollback()); } catch (_e2) { /* ignore */ }
          throw e;
        }
      };
    },

    // Close the connection
    close() {
      try { client.close(); } catch (_e) { /* ignore */ }
    },
  };
}

let api = null;

/**
 * Initialize the DB. Returns a better-sqlite3-compatible object.
 * Callers use it exactly like: db.prepare('...').get() etc.
 */
function open(dataDir) {
  if (api) return api;

  const localDir = path.join(dataDir, 'data');
  fs.mkdirSync(localDir, { recursive: true });
  const localPath = path.join(localDir, 'mrl.sqlite');

  const tursoUrl = process.env.TURSO_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  let client;
  if (tursoUrl && tursoToken) {
    console.log(`[db] embedded replica mode — syncing with ${tursoUrl.slice(0, 50)}...`);
    client = createClient({
      url: `file:${localPath}`,
      syncUrl: tursoUrl,
      authToken: tursoToken,
      syncInterval: 30, // seconds
    });
    // Initial sync to pull latest state from Turso
    try {
      syncCall(client.sync());
      console.log('[db] initial sync with Turso complete');
    } catch (e) {
      console.warn('[db] initial sync failed (using local state):', e.message);
    }
  } else {
    console.log(`[db] local-only mode — ${localPath}`);
    client = createClient({ url: `file:${localPath}` });
  }

  api = wrapClient(client);
  return api;
}

module.exports = { open, syncCall };
