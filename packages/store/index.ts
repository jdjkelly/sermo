import { Database } from "bun:sqlite";

export const db = new Database("store.sqlite", { strict: true });

create(db);

function create(db: Database) {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, created_at TEXT, updated_at TEXT)");
}
