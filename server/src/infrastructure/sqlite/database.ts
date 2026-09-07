import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/** Open (creating if needed) the database at `path` and bring its schema up to date. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  runMigrations(db)
  return db
}

/**
 * Apply every `NNNN_*.sql` in `migrations/` not yet recorded in `schema_migration`, one
 * transaction each, in filename order.
 */
export function runMigrations(db: DatabaseSync): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migration')
      .all()
      .map((r) => r.version as string),
  )
  const record = db.prepare('INSERT INTO schema_migration (version, applied_at) VALUES (?, ?)')
  const done: string[] = []
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
    const version = file.slice(0, 4)
    if (applied.has(version)) continue
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
      record.run(version, new Date().toISOString())
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    done.push(version)
  }
  return done
}
