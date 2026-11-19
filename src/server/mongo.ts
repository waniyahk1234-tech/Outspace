import { MongoClient, type Db as MongoDb } from 'mongodb';
import type Database from 'better-sqlite3';

const COLLECTIONS = [
  'auth_users',
  'email_verifications',
  'profiles',
  'mentor_details',
  'professional_profiles',
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
  'courses',
  'course_modules',
  'course_progress',
  'course_assignments',
  'competition_entries',
  'mentor_follows',
  'mentor_updates',
  'group_seminar_rsvps',
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
  if (table === 'mentor_details' || table === 'professional_profiles') return { profile_id: row.profile_id };
  if (table === 'group_members') return { group_id: row.group_id, student_id: row.student_id };
  if (table === 'group_seminar_rsvps') return { meeting_id: row.meeting_id, student_id: row.student_id };
  if (table === 'mentor_follows') return { mentor_id: row.mentor_id, student_id: row.student_id };
  if (table === 'blocks') return { blocker_id: row.blocker_id, blocked_id: row.blocked_id };
  if (table === 'email_verifications') return { email: row.email };
  if (table === 'course_progress') return { student_id: row.student_id, module_id: row.module_id };
  return { id: row.id };
}

interface NormalizedMongoUri {
  uri: string;
  uriWithoutAngleBrackets: string | null;
  hasExplicitAuthSource: boolean;
  hasAngleBracketPassword: boolean;
}

function encodeMongoCredentialPart(raw: string): string {
  try {
    const decoded = decodeURIComponent(raw);
    return encodeURIComponent(decoded);
  } catch {
    return encodeURIComponent(raw);
  }
}

function normalizeMongoUri(rawUri: string): NormalizedMongoUri {
  let cleaned = rawUri.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  const schemeMatch = cleaned.match(/^(mongodb(?:\+srv)?:\/\/)(.+)$/i);
  if (!schemeMatch) {
    return {
      uri: cleaned,
      uriWithoutAngleBrackets: null,
      hasExplicitAuthSource: /[?&]authSource=/i.test(cleaned),
      hasAngleBracketPassword: false,
    };
  }

  const [, scheme, rest] = schemeMatch;
  const hasExplicitAuthSource = /[?&]authSource=/i.test(rest);
  let hasAngleBracketPassword = false;

  const atIndex = rest.lastIndexOf('@');
  if (atIndex === -1) {
    return {
      uri: `${scheme}${rest}`,
      uriWithoutAngleBrackets: null,
      hasExplicitAuthSource,
      hasAngleBracketPassword,
    };
  }

  const userInfo = rest.slice(0, atIndex);
  const hostAndRest = rest.slice(atIndex + 1);
  if (!/^[a-zA-Z0-9._-]+/.test(hostAndRest)) {
    return {
      uri: `${scheme}${rest}`,
      uriWithoutAngleBrackets: null,
      hasExplicitAuthSource,
      hasAngleBracketPassword,
    };
  }

  const colonIndex = userInfo.indexOf(':');
  if (colonIndex === -1) {
    return {
      uri: `${scheme}${encodeMongoCredentialPart(userInfo)}@${hostAndRest}`,
      uriWithoutAngleBrackets: null,
      hasExplicitAuthSource,
      hasAngleBracketPassword,
    };
  }

  const rawUser = userInfo.slice(0, colonIndex);
  const rawPass = userInfo.slice(colonIndex + 1);
  const encodedUser = encodeMongoCredentialPart(rawUser);

  let decodedPass = rawPass;
  try {
    decodedPass = decodeURIComponent(rawPass);
  } catch {
    decodedPass = rawPass;
  }

  let uriWithoutAngleBrackets: string | null = null;
  if (decodedPass.startsWith('<') && decodedPass.endsWith('>') && decodedPass.length > 2) {
    hasAngleBracketPassword = true;
    const strippedPass = decodedPass.slice(1, -1);
    uriWithoutAngleBrackets = `${scheme}${encodedUser}:${encodeURIComponent(strippedPass)}@${hostAndRest}`;
  }

  return {
    uri: `${scheme}${encodedUser}:${encodeMongoCredentialPart(rawPass)}@${hostAndRest}`,
    uriWithoutAngleBrackets,
    hasExplicitAuthSource,
    hasAngleBracketPassword,
  };
}

async function connectMongoClient(
  uri: string,
  dbName: string,
  authSource?: string
): Promise<{ client: MongoClient; db: MongoDb }> {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 6000,
    ...(authSource ? { authSource } : {}),
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

async function connectWithFallbacks(
  normalized: NormalizedMongoUri,
  dbName: string
): Promise<{ client: MongoClient; db: MongoDb }> {
  const candidateUris = normalized.uriWithoutAngleBrackets
    ? [normalized.uri, normalized.uriWithoutAngleBrackets]
    : [normalized.uri];

  let lastErr: unknown;
  for (const candidateUri of candidateUris) {
    try {
      return await connectMongoClient(candidateUri, dbName);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message || '';
      const isAuthFailure = /bad auth|authentication failed/i.test(msg);
      if (!isAuthFailure) {
        throw err;
      }
      if (!normalized.hasExplicitAuthSource) {
        try {
          return await connectMongoClient(candidateUri, dbName, 'admin');
        } catch (adminErr) {
          lastErr = adminErr;
          const adminMsg = (adminErr as Error).message || '';
          if (!/bad auth|authentication failed/i.test(adminMsg)) {
            throw adminErr;
          }
        }
      }
    }
  }
  throw lastErr;
}

export async function initMongoBridge(sqliteDb: Database.Database): Promise<void> {
  const rawUri = process.env.MONGODB_URI?.trim();
  if (!rawUri) {
    console.log('[MongoDB] MONGODB_URI not set — running with local SQLite (outspace.db). Set MONGODB_URI to connect MongoDB.');
    return;
  }

  if (mongoClient && mongoConnected && mongoDb) {
    return;
  }

  const normalized = normalizeMongoUri(rawUri);
  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'outspace';
  try {
    const connection = await connectWithFallbacks(normalized, dbName);
    if (normalized.hasAngleBracketPassword) {
      console.warn('[MongoDB] Connected after stripping < > brackets around password. Update MONGODB_URI to remove < >.');
    }

    mongoClient = connection.client;
    mongoDb = connection.db;
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
    mongoClient = null;
    mongoDb = null;
    mongoConnected = false;
    const baseMsg = (err as Error).message || 'Unknown MongoDB error';
    if (/bad auth|authentication failed/i.test(baseMsg) && normalized.hasAngleBracketPassword) {
      mongoLastError = `${baseMsg} (remove < and > brackets around the password in MONGODB_URI)`;
    } else if (/bad auth|authentication failed/i.test(baseMsg)) {
      mongoLastError = `${baseMsg} (verify Atlas Database Access username/password in MONGODB_URI)`;
    } else {
      mongoLastError = baseMsg;
    }
    console.warn('[MongoDB] Connection unavailable, falling back to local SQLite:', mongoLastError);
  }
}

async function ensureMongoIndexes(db: MongoDb) {
  await Promise.all([
    db.collection('auth_users').createIndex({ id: 1 }, { unique: true }),
    db.collection('auth_users').createIndex({ email: 1 }, { unique: true }),
    db.collection('email_verifications').createIndex({ email: 1 }, { unique: true }),
    db.collection('profiles').createIndex({ id: 1 }, { unique: true }),
    db.collection('mentor_details').createIndex({ profile_id: 1 }, { unique: true }),
    db.collection('professional_profiles').createIndex({ profile_id: 1 }, { unique: true }),
    db.collection('professional_profiles').createIndex({ linkedin_sub: 1 }, { unique: true, sparse: true }),
    db.collection('niches').createIndex({ slug: 1 }, { unique: true }),
    db.collection('certificates').createIndex({ verify_code: 1 }, { unique: true }),
    db.collection('institutions').createIndex({ access_code: 1 }, { unique: true }),
    db.collection('connections').createIndex({ id: 1 }, { unique: true }),
    db.collection('messages').createIndex({ id: 1 }, { unique: true }),
    db.collection('meetings').createIndex({ id: 1 }, { unique: true }),
    db.collection('courses').createIndex({ id: 1 }, { unique: true }),
    db.collection('course_modules').createIndex({ id: 1 }, { unique: true }),
    db.collection('course_progress').createIndex({ student_id: 1, module_id: 1 }, { unique: true }),
    db.collection('competition_entries').createIndex({ id: 1 }, { unique: true }),
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
