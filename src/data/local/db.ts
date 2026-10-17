import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { MIGRATIONS } from '@/data/local/schema.sql';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

// Exclusive transactions use a dedicated connection so concurrent sync reads/writes cannot
// interleave into the same BEGIN…COMMIT (expo-sqlite's plain withTransactionAsync is not
// exclusive). Web has no exclusive API — fall back to the shared-connection transaction there.
export async function withWriteTransaction(
  db: SQLite.SQLiteDatabase,
  task: (txn: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(() => task(db));
    return;
  }
  await db.withExclusiveTransactionAsync(task);
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
