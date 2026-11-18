import { MongoClient, type Db as MongoDb } from 'mongodb';
import type Database from 'better-sqlite3';

const COLLECTIONS = [
  'auth_users',
  'email_verifications',
  'profiles',
  'mentor_details',
  'niches',
  'connections',
  'messages',
  'groups',
  'group_members',
  'group_posts',
  'availability',
  'meetings',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'badges',
  'certificates',
  'institutions',
  'subscriptions',
  'reports',
  'blocks',
] as const;

type CollectionName = (typeof COLLECTIONS)[number];

let mongoClient: MongoClient | null = null;
let mongoDb: MongoDb | null = null;
let mongoConnected = false;
let mongoLastError: string | null = null;
let syncInFlight: Promise<void> | null = null;
let syncPending = false;
let lastPullAt = 0;

function getDocumentKey(table: CollectionName, row: Record<string, unknown>): Record<string, unknown> {
  if (table === 'mentor_details') return { profile_id: row.profile_id };
  if (table === 'group_members') return { group_id: row.group_id, student_id: row.student_id };
  if (table === 'blocks') return { blocker_id: row.blocker_id, blocked_id: row.blocked_id };
  if (table === 'email_verifications') return { email: row.email };
  return { id: row.id };
}

export async function initMongoBridge(sqliteDb: Database.Database): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.log('[MongoDB] MONGODB_URI not set — running with local SQLite (outspace.db). Set MONGODB_URI to connect MongoDB.');
    return;
  }

  if (mongoClient && mongoConnected && mongoDb) {
    return;
  }

  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'outspace';
  try {
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 6000,
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
    await mongoDb.command({ ping: 1 });
    mongoConnected = true;
    mongoLastError = null;
    lastPullAt = Date.now();
    console.log(`[MongoDB] Connected successfully to database "${dbName}".`);

    await ensureMongoIndexes(mongoDb);

    // Check if MongoDB already has records managed by the user
    const existingUsers = await mongoDb.collection('auth_users').countDocuments();
    if (existingUsers === 0) {
      await pushAllSqliteToMongo(sqliteDb);
      console.log('[MongoDB] Initialized MongoDB collections with Outspace seed data.');
    } else {
      await pullMongoChangesIntoSqlite(sqliteDb);
      console.log(`[MongoDB] Hydrated runtime cache from ${existingUsers} MongoDB user records.`);
    }
  } catch (err) {
    mongoConnected = false;
    mongoLastError = (err as Error).message;
    console.error('[MongoDB] Connection failed, falling back to local SQLite:', mongoLastError);
  }
}

async function ensureMongoIndexes(db: MongoDb) {
  await Promise.all([
    db.collection('auth_users').createIndex({ id: 1 }, { unique: true }),
    db.collection('auth_users').createIndex({ email: 1 }, { unique: true }),
    db.collection('email_verifications').createIndex({ email: 1 }, { unique: true }),
    db.collection('profiles').createIndex({ id: 1 }, { unique: true }),
    db.collection('mentor_details').createIndex({ profile_id: 1 }, { unique: true }),
    db.collection('niches').createIndex({ slug: 1 }, { unique: true }),
    db.collection('certificates').createIndex({ verify_code: 1 }, { unique: true }),
    db.collection('institutions').createIndex({ access_code: 1 }, { unique: true }),
    db.collection('connections').createIndex({ id: 1 }, { unique: true }),
    db.collection('messages').createIndex({ id: 1 }, { unique: true }),
    db.collection('meetings').createIndex({ id: 1 }, { unique: true }),
  ]);
}

async function pullMongoChangesIntoSqlite(sqliteDb: Database.Database) {
  if (!mongoDb) return;

  sqliteDb.pragma('foreign_keys = OFF');
  try {
    const tx = sqliteDb.transaction(() => {});
    tx();
    for (const table of COLLECTIONS) {
      const docs = await mongoDb.collection(table).find({}, { projection: { _id: 0 } }).toArray();
      if (docs.length === 0) continue;

      const colsInfo = sqliteDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      const validCols = colsInfo.map((c) => c.name);
      if (validCols.length === 0) continue;

      const placeholders = validCols.map(() => '?').join(', ');
      const stmt = sqliteDb.prepare(
        `INSERT OR REPLACE INTO ${table} (${validCols.join(', ')}) VALUES (${placeholders})`
      );

      const batch = sqliteDb.transaction((rows: Record<string, unknown>[]) => {
        for (const doc of rows) {
          const values = validCols.map((col) => {
            const val = doc[col];
            if (val === undefined) return null;
            if (typeof val === 'boolean') return val ? 1 : 0;
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val;
          });
          stmt.run(...values);
        }
      });
      batch(docs as Record<string, unknown>[]);
    }
  } finally {
    sqliteDb.pragma('foreign_keys = ON');
  }
}

export async function pushAllSqliteToMongo(sqliteDb: Database.Database): Promise<void> {
  if (!mongoDb || !mongoConnected) return;

  for (const table of COLLECTIONS) {
    const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
    const col = mongoDb.collection(table);

    if (rows.length === 0) {
      await col.deleteMany({});
      continue;
    }

    const ops = rows.map((row) => {
      const filter = getDocumentKey(table, row);
      return {
        replaceOne: {
          filter,
          replacement: { ...row, updated_at_sync: new Date().toISOString() },
          upsert: true,
        },
      };
    });
    await col.bulkWrite(ops, { ordered: false });

    // Remove deleted rows in MongoDB for tables supporting deletes (availability, blocks, email_verifications)
    if (table === 'availability' || table === 'email_verifications') {
      const keyField = table === 'email_verifications' ? 'email' : 'id';
      const activeKeys = rows.map((r) => r[keyField]);
      await col.deleteMany({ [keyField]: { $nin: activeKeys } });
    }
  }
}

export function scheduleMongoSync(sqliteDb: Database.Database): void {
  if (!mongoConnected || !mongoDb) return;

  if (syncInFlight) {
    syncPending = true;
    return;
  }

  syncInFlight = (async () => {
    try {
      await pushAllSqliteToMongo(sqliteDb);
    } catch (err) {
      mongoLastError = (err as Error).message;
      console.error('[MongoDB] Background sync error:', mongoLastError);
    } finally {
      syncInFlight = null;
      if (syncPending) {
        syncPending = false;
        scheduleMongoSync(sqliteDb);
      }
    }
  })();
}

export async function flushMongoSync(sqliteDb: Database.Database): Promise<void> {
  if (!mongoConnected || !mongoDb) return;
  if (syncInFlight) {
    await syncInFlight;
  }
  if (syncPending) {
    syncPending = false;
    await pushAllSqliteToMongo(sqliteDb);
  }
}

export async function refreshFromMongoIfStale(sqliteDb: Database.Database, maxAgeMs = 2500): Promise<void> {
  if (!mongoConnected || !mongoDb || syncInFlight) return;
  if (Date.now() - lastPullAt < maxAgeMs) return;
  try {
    await pullMongoChangesIntoSqlite(sqliteDb);
    lastPullAt = Date.now();
  } catch (err) {
    mongoLastError = (err as Error).message;
  }
}

export function getMongoStatus() {
  return {
    configured: Boolean(process.env.MONGODB_URI?.trim()),
    connected: mongoConnected,
    dbName: process.env.MONGODB_DB_NAME?.trim() || 'outspace',
    lastError: mongoLastError,
  };
}
