// D1Database stand-in backed by real SQLite (node:sqlite).
//
// Real SQL against the real migration file, so constraints, indexes and CHECK
// clauses are genuinely exercised — a hand-written mock would let a broken
// query through and only fail after deployment.

import { DatabaseSync } from 'node:sqlite';

class PreparedStatement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new PreparedStatement(this.db, this.sql, args);
  }

  #stmt() {
    return this.db.prepare(this.sql);
  }

  async first() {
    const row = this.#stmt().get(...this.args);
    return row === undefined ? null : row;
  }

  async all() {
    const results = this.#stmt().all(...this.args);
    return { results, success: true, meta: { changes: 0 } };
  }

  async run() {
    const info = this.#stmt().run(...this.args);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

export function createFakeD1(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  return {
    prepare: (sql) => new PreparedStatement(db, sql),
    _raw: db,
    _close: () => db.close(),
  };
}
