import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { IncomingMessage, ServerResponse } from 'http';
import { createApiRouter } from '../src/server/routes.js';
import { getDb } from '../src/server/db.js';
import {
  initMongoBridge,
  flushMongoSync,
  refreshFromMongoIfStale,
} from '../src/server/mongo.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const apiRouter = createApiRouter();
app.use('/api', apiRouter);
app.use('/', apiRouter);

let initPromise: Promise<void> | null = null;

async function ensureReady() {
  const db = getDb();
  if (!initPromise) {
    initPromise = initMongoBridge(db).catch((err) => {
      initPromise = null;
      console.error('[Vercel] MongoDB init error:', err);
    });
  }
  await initPromise;
  await refreshFromMongoIfStale(db);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureReady();

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      try {
        if (
          req.method &&
          ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
          res.statusCode < 400
        ) {
          await flushMongoSync(getDb());
        }
      } catch (err) {
        console.error('[Vercel] MongoDB flush error:', err);
      }
      resolve();
    };

    res.on('finish', () => {
      void finish();
    });
    res.on('close', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });

    app(req as unknown as express.Request, res as unknown as express.Response);
  });
}
