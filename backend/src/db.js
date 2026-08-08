// Tiny SQLite wrapper. One file, one table, kept deliberately simple for v1.
//
// NOTE ON HOSTING: SQLite writes to a file on disk. Most free hosts (Render's
// free web service tier, for example) use an EPHEMERAL filesystem — the
// little-moments.db file gets wiped every time the service restarts or
// redeploys. That's fine while you're building and testing, but before you
// rely on this in production you'll want either:
//   1. A persistent disk add-on (Render has one, small monthly cost), or
//   2. Swap this file for a hosted Postgres (Render/Neon/Supabase all have
//      free Postgres tiers) — the rest of the app only talks to the small
//      set of functions exported below, so that swap is contained to this file.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'little-moments.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT NOT NULL,
    reaction TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER,
    reacted_at INTEGER
  );
`);

function createNote({ id, reference, payload }) {
  db.prepare(`
    INSERT INTO notes (id, reference, status, payload, created_at)
    VALUES (?, ?, 'pending', ?, ?)
  `).run(id, reference, JSON.stringify(payload), Date.now());
}

function markPaidByReference(reference) {
  const result = db.prepare(`
    UPDATE notes SET status = 'paid', paid_at = ?
    WHERE reference = ? AND status != 'paid'
  `).run(Date.now(), reference);
  return result.changes > 0;
}

function getNoteByReference(reference) {
  const row = db.prepare('SELECT * FROM notes WHERE reference = ?').get(reference);
  return row ? { ...row, payload: JSON.parse(row.payload) } : null;
}

function getPaidNoteById(id) {
  const row = db.prepare(`SELECT * FROM notes WHERE id = ? AND status = 'paid'`).get(id);
  return row ? { ...row, payload: JSON.parse(row.payload) } : null;
}

function setReaction(id, reaction) {
  const result = db.prepare(`
    UPDATE notes SET reaction = ?, reacted_at = ?
    WHERE id = ? AND status = 'paid'
  `).run(reaction, Date.now(), id);
  return result.changes > 0;
}

function getReactionStatus(id) {
  return db.prepare('SELECT reaction, reacted_at FROM notes WHERE id = ?').get(id);
}

module.exports = {
  createNote,
  markPaidByReference,
  getNoteByReference,
  getPaidNoteById,
  setReaction,
  getReactionStatus,
};
