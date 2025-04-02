import { Database } from "bun:sqlite";

function create(db: Database) {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, created_at TEXT, updated_at TEXT)");
}