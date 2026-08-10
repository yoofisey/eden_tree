#!/usr/bin/env node
/*
 * Eden Tree — database backup script
 *
 * Dumps every table into a single JSON file under /backups, then prunes
 * old backups (keeps the newest N, default 14).
 *
 * Usage:
 *   node scripts/backup.js                 # uses DATABASE_URL (Postgres) if set, else local backend/eden.db (sql.js)
 *   node scripts/backup.js --keep 30       # keep the last 30 backups
 *
 * Set DATABASE_URL (e.g. in backend/.env) to back up the production
 * Postgres database. Without it, the local sql.js file is backed up.
 *
 * The JSON file is plain data, so it can be re-imported into either engine
 * via the restore helpers at the bottom of this file.
 */

const fs = require('fs');
const path = require('path');

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
}

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const LOCAL_DB_PATH = path.join(__dirname, '..', 'backend', 'eden.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = /^postgres(ql)?:\/\//.test(DATABASE_URL);

function tableListSql() {
  if (USE_PG) return "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename";
  return "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
}

async function dumpPg(pool) {
  const tables = await pool.query(tableListSql());
  const out = {};
  for (const t of tables.rows) {
    const name = t.tablename;
    const res = await pool.query('SELECT * FROM ' + name);
    out[name] = res.rows;
  }
  return out;
}

function dumpSqlJs(SQL) {
  const dbFile = fs.readFileSync(LOCAL_DB_PATH);
  const db = new SQL.Database(dbFile);
  try {
    const tables = db.exec(tableListSql());
    const names = tables[0].values.map((r) => r[0]);
    const out = {};
    for (const name of names) {
      const res = db.exec('SELECT * FROM "' + name + '"');
      if (!res.length) { out[name] = []; continue; }
      const cols = res[0].columns;
      out[name] = res[0].values.map((row) => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = row[i]; });
        return obj;
      });
    }
    return out;
  } finally {
    db.close();
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function prune(keep) {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^eden-tree-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(f))
    .sort();
  const toRemove = files.length - keep;
  if (toRemove <= 0) return 0;
  files.slice(0, toRemove).forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  return toRemove;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let keep = 14;
  const argIdx = process.argv.indexOf('--keep');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    keep = Math.max(1, parseInt(process.argv[argIdx + 1], 10) || 14);
  }

  let tables;
  let engine;
  if (USE_PG) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    try {
      tables = await dumpPg(pool);
    } finally {
      await pool.end();
    }
    engine = 'postgres';
  } else if (fs.existsSync(LOCAL_DB_PATH)) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    tables = dumpSqlJs(SQL);
    engine = 'sqlite';
  } else {
    console.error('No database found. Set DATABASE_URL or place backend/eden.db.');
    process.exit(1);
  }

  const file = 'eden-tree-' + timestamp() + '.json';
  const full = path.join(BACKUP_DIR, file);
  const payload = {
    backupAt: new Date().toISOString(),
    engine,
    rowCount: Object.keys(tables).reduce((n, t) => n + tables[t].length, 0),
    tables,
  };
  fs.writeFileSync(full, JSON.stringify(payload, null, 2));

  const removed = prune(keep);
  console.log('Backup written: ' + full);
  console.log('Engine: ' + engine + ' | Tables: ' + Object.keys(tables).length + ' | Rows: ' + payload.rowCount);
  if (removed) console.log('Pruned ' + removed + ' old backup(s), keeping last ' + keep);
}

/* ── Restore: re-import a backup file into the configured engine ── */
async function restore(file) {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (USE_PG) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
      for (const [table, rows] of Object.entries(data.tables)) {
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        for (const row of rows) {
          const placeholders = cols.map((_, i) => '$' + (i + 1)).join(',');
          await pool.query(
            'INSERT INTO "' + table + '" (' + cols.join(',') + ') VALUES (' + placeholders + ') ON CONFLICT DO NOTHING',
            cols.map((c) => row[c])
          );
        }
      }
    } finally {
      await pool.end();
    }
  } else if (fs.existsSync(LOCAL_DB_PATH)) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(LOCAL_DB_PATH));
    try {
      for (const [table, rows] of Object.entries(data.tables)) {
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]);
        for (const row of rows) {
          const placeholders = cols.map(() => '?').join(',');
          db.run('INSERT INTO "' + table + '" (' + cols.join(',') + ') VALUES (' + placeholders + ')', cols.map((c) => row[c]));
        }
      }
      fs.writeFileSync(LOCAL_DB_PATH, Buffer.from(db.export()));
    } finally {
      db.close();
    }
  } else {
    console.error('No target database configured for restore.');
    process.exit(1);
  }
  console.log('Restored from: ' + file);
}

if (require.main === module && process.argv[2] === '--restore') {
  const file = process.argv[3];
  if (!file) { console.error('Usage: node scripts/backup.js --restore <backup.json>'); process.exit(1); }
  restore(file).catch((e) => { console.error(e); process.exit(1); });
} else if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { dumpPg, dumpSqlJs, restore };
