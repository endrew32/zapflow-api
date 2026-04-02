const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'automation.db');

let db;

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected', qr_code TEXT,
      sent_today INTEGER DEFAULT 0, daily_limit INTEGER DEFAULT 15,
      warmup_phase TEXT DEFAULT 'initial', warmup_day INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), last_seen TEXT
    );
    CREATE TABLE IF NOT EXISTS messages_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT, recipient TEXT NOT NULL,
      message TEXT NOT NULL, status TEXT DEFAULT 'pending',
      error TEXT, sent_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY, name TEXT,
      total INTEGER DEFAULT 0, sent INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0, status TEXT DEFAULT 'queued',
      created_at TEXT DEFAULT (datetime('now')), finished_at TEXT
    );
  `);
  return db;
}

function getDb() {
  if (!db) throw new Error('Banco não inicializado');
  return db;
}

const instancesDb = {
  create: (i) => { getDb().prepare(`INSERT INTO instances (id,name,status,daily_limit,warmup_phase) VALUES (@id,@name,@status,@daily_limit,@warmup_phase)`).run(i); return instancesDb.findById(i.id); },
  findById: (id) => getDb().prepare('SELECT * FROM instances WHERE id = ?').get(id),
  findAll: () => getDb().prepare('SELECT * FROM instances ORDER BY created_at DESC').all(),
  update: (id, fields) => { const keys = Object.keys(fields); const set = keys.map(k => `${k} = @${k}`).join(', '); getDb().prepare(`UPDATE instances SET ${set} WHERE id = @id`).run({ ...fields, id }); return instancesDb.findById(id); },
  delete: (id) => getDb().prepare('DELETE FROM instances WHERE id = ?').run(id),
};

const logsDb = {
  insert: (e) => { const r = getDb().prepare(`INSERT INTO messages_log (instance_id,recipient,message,status,error) VALUES (@instance_id,@recipient,@message,@status,@error)`).run({ error: null, ...e }); return r.lastInsertRowid; },
  updateStatus: (id, status, error = null) => getDb().prepare('UPDATE messages_log SET status = ?, error = ? WHERE id = ?').run(status, error, id),
  findAll: (limit = 200) => getDb().prepare(`SELECT l.*, i.name as instance_name FROM messages_log l LEFT JOIN instances i ON l.instance_id = i.id ORDER BY l.sent_at DESC LIMIT ?`).all(limit),
};

const bulkDb = {
  create: (job) => { getDb().prepare(`INSERT INTO bulk_jobs (id,name,total,status) VALUES (@id,@name,@total,@status)`).run(job); return bulkDb.findById(job.id); },
  findById: (id) => getDb().prepare('SELECT * FROM bulk_jobs WHERE id = ?').get(id),
  findAll: () => getDb().prepare('SELECT * FROM bulk_jobs ORDER BY created_at DESC').all(),
  update: (id, fields) => { const keys = Object.keys(fields); const set = keys.map(k => `${k} = @${k}`).join(', '); getDb().prepare(`UPDATE bulk_jobs SET ${set} WHERE id = @id`).run({ ...fields, id }); },
};

module.exports = { initDatabase, getDb, instancesDb, logsDb, bulkDb };
