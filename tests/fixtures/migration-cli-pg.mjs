// Runs the real migration CLI against disposable PostgreSQL (PGlite), never TCP.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

class Client {
  constructor({ connectionString }) {
    if (connectionString !== 'postgresql://migration-test-only') throw new Error('Unexpected test database');
    this.db = new PGlite();
  }
  async connect() {
    const mode = process.env.GUIDON_MIGRATION_TEST_REGISTRY;
    if (mode !== 'absent') {
      const sql = await readFile(new URL('../../src/db/migrations/000_baseline_schema.sql', import.meta.url), 'utf8');
      const lf = sql.replace(/\r\n/g, '\n');
      const recorded = mode === 'lf' ? lf : mode === 'crlf' ? lf.replace(/\n/g, '\r\n') : mode === 'sql-drift' ? lf + '\nSELECT 1;\n' : sql;
      const checksum = mode === 'drift' ? 'changed' : createHash('sha256').update(recorded).digest('hex').slice(0, 16);
      await this.db.exec('CREATE TABLE public.guidon_migrations (name text PRIMARY KEY, checksum text NOT NULL)');
      await this.db.query('INSERT INTO public.guidon_migrations VALUES ($1, $2)', ['000_baseline_schema.sql', checksum]);
    }
    await this.db.exec('SET default_transaction_read_only = on');
  }
  query(sql, params) { return this.db.query(sql, params); }
  async end() {
    const { rows } = await this.db.query("SELECT to_regclass('public.guidon_migrations') IS NOT NULL AS present");
    console.log('TEST_REGISTRY_PRESENT=' + rows[0].present);
    await this.db.close();
  }
}

const pg = { Client };
export default pg;
