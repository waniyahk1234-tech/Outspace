import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/server/routes.js';
import { getDb } from './src/server/db.js';
import { initMongoBridge } from './src/server/mongo.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Respect X-Forwarded-Proto behind Cloud Run / reverse proxies for secure cookies
  app.set('trust proxy', 1);

  // Initialize DB, seed if empty, and connect MongoDB if MONGODB_URI is configured
  const db = getDb();
  await initMongoBridge(db);

  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // Serve uploaded avatars
  const uploadDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));

  // API routes (includes auth, email verification, Google/LinkedIn OAuth callbacks, and MongoDB sync)
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Outspace server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Outspace server:', err);
  process.exit(1);
});
