import * as SQLite from 'expo-sqlite';

import { MIGRATIONS } from '@/data/local/schema.sql';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

async function openDb() {
  const db = await SQLite.openDatabaseAsync('expense-tracker.db');
  await db.execAsync('pragma journal_mode = wal;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('pragma user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    await db.execAsync(MIGRATIONS[version]);
    await db.execAsync(`pragma user_version = ${version + 1};`);
  }

  return db;
}
