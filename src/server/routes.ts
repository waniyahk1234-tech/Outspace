import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb, uuid, awardBadge, recalculateMentorReplyHours, recalculateMentorRating } from './db.js';
import {
  attachSession,
  requireAuth,
  requireAdmin,
  signUserId,
  setSessionCookie,
  clearSessionCookie,
  signOAuthState,
  verifyOAuthState,
  getEffectiveSubscription,
  type AuthenticatedRequest,
} from './auth.js';
import {
  validatePasswordStrength,
  validateAndNormalizeEmail,
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
  generateVerificationCode,
  hashVerificationCode,
  sendVerificationEmail,
} from './security.js';
import { scheduleMongoSync, getMongoStatus } from './mongo.js';
import { maskContactDetails, isBlockedBetween } from './safety.js';
import { addRealtimeClient, emitToUsers } from './realtime.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
});

function getAppBaseUrl(req: express.Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function parseJsonArray<T = string>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hydrateProfile(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    ...row,
    interests: parseJsonArray<string>(row.interests),
    guardian_consent: Boolean(row.guardian_consent),
    onboarding_complete: Boolean(row.onboarding_complete),
  };
}

function hydrateMentor(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    ...row,
    niches: parseJsonArray<string>(row.niches),
  };
}

function hydrateNiche(row: Record<string, unknown>) {
  return {
    ...row,
    degrees: parseJsonArray<string>(row.degrees),
    universities: parseJsonArray<string>(row.universities),
    riasec_codes: parseJsonArray<string>(row.riasec_codes),
  };
}

export function createApiRouter() {
  const router = express.Router();
  const db = getDb();

  router.use(attachSession(db));

  // Automatically sync successful write mutations to MongoDB when configured
  router.use((req, res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      res.on('finish', () => {
        if (res.statusCode < 400) {
          scheduleMongoSync(db);
        }
      });
    }
    next();
  });

  router.get('/health/db', (_req, res) => {
    res.json({ ok: true, mongo: getMongoStatus() });
  });

  // Realtime SSE stream
  router.get('/realtime/stream', requireAuth, (req: AuthenticatedRequest, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const remove = addRealtimeClient(req.userId!, res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      remove();
    });
  });

  // AUTH — MANUAL SIGNUP WITH PASSWORD SECURITY & GMAIL/EMAIL VERIFICATION
  router.post('/auth/signup', async (req, res) => {
    const { role, full_name, email, password, guardian_consent } = req.body || {};
    if (!role || !['student', 'mentor'].includes(role)) {
      res.status(400).json({ error: 'Please select whether you are a Student or a Mentor.' });
      return;
    }
    if (!full_name || String(full_name).trim().length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    const emailCheck = validateAndNormalizeEmail(email);
    if (!emailCheck.valid) {
      res.status(400).json({ error: emailCheck.error || 'Please enter a valid email address.' });
      return;
    }

    const cleanName = String(full_name).trim();
    const pwdCheck = validatePasswordStrength(password, {
      email: emailCheck.email,
      fullName: cleanName,
    });
    if (!pwdCheck.valid) {
      res.status(400).json({ error: pwdCheck.error });
      return;
    }

    if (role === 'student' && !guardian_consent) {
      res.status(400).json({ error: 'Guardian consent confirmation is required for students.' });
      return;
    }

    const cleanEmail = emailCheck.email;
    const existing = db
      .prepare(`SELECT id, email_verified, auth_provider FROM auth_users WHERE email = ?`)
      .get(cleanEmail) as { id: string; email_verified: number; auth_provider: string } | undefined;

    if (existing && existing.email_verified === 1) {
      res.status(409).json({
        error:
          existing.auth_provider !== 'local'
            ? `An account with this email already exists via ${existing.auth_provider}. Please log in with ${existing.auth_provider}.`
            : 'An account with this email already exists. Please log in instead.',
      });
      return;
    }

    const hash = bcrypt.hashSync(String(password), 12);
    const nowIso = new Date().toISOString();
    let userId = existing?.id || uuid();

    const tx = db.transaction(() => {
      if (existing) {
        // Update unverified draft account so user can complete verification cleanly
        db.prepare(`UPDATE auth_users SET password_hash = ?, created_at = ? WHERE id = ?`).run(hash, nowIso, existing.id);
        db.prepare(`UPDATE profiles SET role = ?, full_name = ?, guardian_consent = ? WHERE id = ?`).run(
          role,
          cleanName,
          guardian_consent ? 1 : 0,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO auth_users (id, email, password_hash, email_verified, auth_provider, provider_id, created_at)
           VALUES (?, ?, ?, 0, 'local', NULL, ?)`
        ).run(userId, cleanEmail, hash, nowIso);

        db.prepare(
          `INSERT INTO profiles (id, role, full_name, avatar_url, bio, city, grade_level, school_name, interests, guardian_consent, onboarding_complete, created_at)
           VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, '[]', ?, 0, ?)`
        ).run(userId, role, cleanName, guardian_consent ? 1 : 0, nowIso);

        if (role === 'mentor') {
          db.prepare(
            `INSERT INTO mentor_details (profile_id, profession, company, years_experience, linkedin_url, niches, status, avg_reply_hours, rating, sessions_completed)
             VALUES (?, '', NULL, NULL, '', '[]', 'pending', NULL, NULL, 0)`
          ).run(userId);
        } else {
          const trialEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
          db.prepare(
            `INSERT INTO subscriptions (id, user_id, plan, trial_ends_at, current_period_end, institution_id, free_sessions_left)
             VALUES (?, ?, 'trial', ?, NULL, NULL, 1)`
          ).run(uuid(), userId, trialEnds);
        }
      }
    });
    tx();

    const otp = generateVerificationCode();
    db.prepare(
      `INSERT OR REPLACE INTO email_verifications (email, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, 0, ?)`
    ).run(cleanEmail, otp.hash, otp.expiresAt, nowIso);

    const delivery = await sendVerificationEmail(cleanEmail, cleanName, otp.code);
    scheduleMongoSync(db);

    res.status(201).json({
      ok: true,
      requires_verification: true,
      email: cleanEmail,
      is_gmail: emailCheck.isGmail,
      role,
      smtp_configured: delivery.sentViaSmtp,
      verification_preview_code: delivery.sentViaSmtp ? undefined : otp.code,
    });
  });

  router.post('/auth/verify-email', (req, res) => {
    const { email, code } = req.body || {};
    const emailCheck = validateAndNormalizeEmail(email);
    if (!emailCheck.valid || !code) {
      res.status(400).json({ error: 'Valid email and 6-digit verification code are required.' });
      return;
    }

    const cleanEmail = emailCheck.email;
    const record = db
      .prepare(`SELECT * FROM email_verifications WHERE email = ?`)
      .get(cleanEmail) as
      | { email: string; code_hash: string; expires_at: string; attempts: number }
      | undefined;

    if (!record) {
      res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
      return;
    }

    if (record.attempts >= 5) {
      res.status(429).json({ error: 'Too many incorrect codes. Please click Resend Code.' });
      return;
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Verification code expired. Please click Resend Code.' });
      return;
    }

    if (hashVerificationCode(String(code)) !== record.code_hash) {
      db.prepare(`UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?`).run(cleanEmail);
      res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
      return;
    }

    const user = db.prepare(`SELECT id FROM auth_users WHERE email = ?`).get(cleanEmail) as { id: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    db.prepare(`UPDATE auth_users SET email_verified = 1 WHERE id = ?`).run(user.id);
    db.prepare(`DELETE FROM email_verifications WHERE email = ?`).run(cleanEmail);
    clearFailedLogins(cleanEmail);

    const token = signUserId(user.id);
    setSessionCookie(req, res, token);

    const profile = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(user.id) as Record<string, unknown>;
    res.json({ ok: true, token, profile: hydrateProfile(profile) });
  });

  router.post('/auth/resend-verification', async (req, res) => {
    const { email } = req.body || {};
    const emailCheck = validateAndNormalizeEmail(email);
    if (!emailCheck.valid) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const cleanEmail = emailCheck.email;
    const user = db
      .prepare(
        `SELECT au.id, au.email_verified, p.full_name
         FROM auth_users au JOIN profiles p ON p.id = au.id
         WHERE au.email = ?`
      )
      .get(cleanEmail) as { id: string; email_verified: number; full_name: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'No account found with this email.' });
      return;
    }
    if (user.email_verified === 1) {
      res.json({ ok: true, already_verified: true });
      return;
    }

    const otp = generateVerificationCode();
    db.prepare(
      `INSERT OR REPLACE INTO email_verifications (email, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, 0, ?)`
    ).run(cleanEmail, otp.hash, otp.expiresAt, new Date().toISOString());

    const delivery = await sendVerificationEmail(cleanEmail, user.full_name, otp.code);
    res.json({
      ok: true,
      smtp_configured: delivery.sentViaSmtp,
      verification_preview_code: delivery.sentViaSmtp ? undefined : otp.code,
    });
  });

  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const emailCheck = validateAndNormalizeEmail(email);
    const cleanEmail = emailCheck.email;

    const rate = checkLoginRateLimit(cleanEmail);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Too many failed login attempts. Try again in ${rate.waitMinutes} minute(s).`,
      });
      return;
    }

    const user = db
      .prepare(`SELECT id, email, password_hash, email_verified, auth_provider FROM auth_users WHERE email = ?`)
      .get(cleanEmail) as
      | { id: string; email: string; password_hash: string; email_verified: number; auth_provider: string }
      | undefined;

    if (!user) {
      recordFailedLogin(cleanEmail);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.auth_provider !== 'local' && user.password_hash.startsWith('OAUTH_ONLY_')) {
      res.status(400).json({
        error: `This email is registered with ${user.auth_provider === 'google' ? 'Gmail (Google)' : 'LinkedIn'}. Please use the Continue with ${user.auth_provider === 'google' ? 'Gmail' : 'LinkedIn'} button above.`,
      });
      return;
    }

    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      recordFailedLogin(cleanEmail);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.email_verified === 0) {
      const profile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(user.id) as
        | { full_name: string }
        | undefined;
      const otp = generateVerificationCode();
      db.prepare(
        `INSERT OR REPLACE INTO email_verifications (email, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, ?, 0, ?)`
      ).run(cleanEmail, otp.hash, otp.expiresAt, new Date().toISOString());
      const delivery = await sendVerificationEmail(cleanEmail, profile?.full_name || 'Student', otp.code);

      res.status(403).json({
        error: 'Please verify your email address before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        requires_verification: true,
        email: cleanEmail,
        smtp_configured: delivery.sentViaSmtp,
        verification_preview_code: delivery.sentViaSmtp ? undefined : otp.code,
      });
      return;
    }

    clearFailedLogins(cleanEmail);
    const token = signUserId(user.id);
    setSessionCookie(req, res, token);

    const profile = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(user.id) as Record<string, unknown>;
    res.json({ ok: true, token, profile: hydrateProfile(profile) });
  });

  // GOOGLE (GMAIL) & LINKEDIN OAUTH LOGIN FOR STUDENTS AND MENTORS
  router.get('/auth/oauth/providers', (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    res.json({
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      callbacks: {
        google: `${baseUrl}/api/auth/oauth/google/callback`,
        linkedin: `${baseUrl}/api/auth/oauth/linkedin/callback`,
      },
    });
  });

  router.get('/auth/oauth/:provider/url', (req, res) => {
    const provider = req.params.provider;
    const role = req.query.role === 'mentor' ? 'mentor' : 'student';
    if (provider !== 'google' && provider !== 'linkedin') {
      res.status(400).json({ error: 'Unsupported OAuth provider.' });
      return;
    }

    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (!clientId || !clientSecret) {
        res.json({
          configured: false,
          provider: 'google',
          redirectUri,
          requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
        });
        return;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state: signOAuthState({ provider: 'google', role }),
      });

      res.json({
        configured: true,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri,
      });
      return;
    }

    // LinkedIn OIDC
    const liClientId = process.env.LINKEDIN_CLIENT_ID?.trim();
    const liClientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
    if (!liClientId || !liClientSecret) {
      res.json({
        configured: false,
        provider: 'linkedin',
        redirectUri,
        requiredEnv: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      });
      return;
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: liClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state: signOAuthState({ provider: 'linkedin', role }),
    });

    res.json({
      configured: true,
      url: `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`,
      redirectUri,
    });
  });

  const handleOAuthCallback = async (req: express.Request, res: express.Response) => {
    const provider = req.params.provider;
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

    const sendPopupResult = (payload: Record<string, unknown>) => {
      const json = JSON.stringify(payload);
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!doctype html>
<html>
  <body style="font-family:sans-serif;background:#FFF5E8;color:#252020;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <div style="text-align:center;padding:24px;border:2px solid #252020;border-radius:16px;background:#fff;">
      <p style="font-weight:bold;margin:0 0 8px;">Outspace Authentication</p>
      <p style="font-size:13px;margin:0;color:#5A4F4F;">Completing sign-in, this window will close automatically...</p>
    </div>
    <script>
      if (window.opener) {
        window.opener.postMessage(${json}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
    };

    if (oauthError) {
      sendPopupResult({ type: 'OUTSPACE_OAUTH_ERROR', error: `Authentication cancelled (${oauthError}).` });
      return;
    }

    const parsedState = verifyOAuthState(state);
    if (!parsedState || parsedState.provider !== provider || !code) {
      sendPopupResult({ type: 'OUTSPACE_OAUTH_ERROR', error: 'Invalid or expired OAuth session state.' });
      return;
    }

    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

    try {
      let email = '';
      let fullName = '';
      let avatarUrl: string | null = null;
      let providerId = '';

      if (provider === 'google') {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
        if (!tokenData.access_token) {
          throw new Error(tokenData.error_description || 'Failed to exchange Google code.');
        }

        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profileData = (await userRes.json()) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        };
        if (!profileData.email || profileData.email_verified === false) {
          throw new Error('Google account email is missing or unverified.');
        }
        email = profileData.email.trim().toLowerCase();
        fullName = profileData.name?.trim() || email.split('@')[0];
        avatarUrl = profileData.picture || null;
        providerId = profileData.sub || '';
      } else {
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: process.env.LINKEDIN_CLIENT_ID!,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
            redirect_uri: redirectUri,
          }),
        });
        const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
        if (!tokenData.access_token) {
          throw new Error(tokenData.error_description || 'Failed to exchange LinkedIn code.');
        }

        const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profileData = (await userRes.json()) as {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
        };
        if (!profileData.email) {
          throw new Error('LinkedIn account did not share an email address.');
        }
        email = profileData.email.trim().toLowerCase();
        fullName = profileData.name?.trim() || email.split('@')[0];
        avatarUrl = profileData.picture || null;
        providerId = profileData.sub || '';
      }

      const existing = db.prepare(`SELECT id FROM auth_users WHERE email = ?`).get(email) as
        | { id: string }
        | undefined;

      let userId = existing?.id || uuid();
      const nowIso = new Date().toISOString();

      if (!existing) {
        const role = parsedState.role;
        const placeholderHash = `OAUTH_ONLY_${crypto.randomBytes(24).toString('hex')}`;
        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO auth_users (id, email, password_hash, email_verified, auth_provider, provider_id, created_at)
             VALUES (?, ?, ?, 1, ?, ?, ?)`
          ).run(userId, email, placeholderHash, provider, providerId, nowIso);

          db.prepare(
            `INSERT INTO profiles (id, role, full_name, avatar_url, bio, city, grade_level, school_name, interests, guardian_consent, onboarding_complete, created_at)
             VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', ?, 0, ?)`
          ).run(userId, role, fullName, avatarUrl, role === 'student' ? 1 : 0, nowIso);

          if (role === 'mentor') {
            db.prepare(
              `INSERT INTO mentor_details (profile_id, profession, company, years_experience, linkedin_url, niches, status, avg_reply_hours, rating, sessions_completed)
               VALUES (?, '', NULL, NULL, '', '[]', 'pending', NULL, NULL, 0)`
            ).run(userId);
          } else {
            const trialEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
            db.prepare(
              `INSERT INTO subscriptions (id, user_id, plan, trial_ends_at, current_period_end, institution_id, free_sessions_left)
               VALUES (?, ?, 'trial', ?, NULL, NULL, 1)`
            ).run(uuid(), userId, trialEnds);
          }
        });
        tx();
      } else {
        db.prepare(`UPDATE auth_users SET email_verified = 1 WHERE id = ?`).run(userId);
        if (avatarUrl) {
          db.prepare(`UPDATE profiles SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`).run(avatarUrl, userId);
        }
      }

      scheduleMongoSync(db);
      const token = signUserId(userId);
      setSessionCookie(req, res, token);

      const profile = db.prepare(`SELECT role, onboarding_complete FROM profiles WHERE id = ?`).get(userId) as {
        role: string;
        onboarding_complete: number;
      };

      sendPopupResult({
        type: 'OUTSPACE_OAUTH_SUCCESS',
        token,
        role: profile.role,
        onboarding_complete: Boolean(profile.onboarding_complete),
      });
    } catch (err) {
      sendPopupResult({
        type: 'OUTSPACE_OAUTH_ERROR',
        error: (err as Error).message || 'OAuth authentication failed.',
      });
    }
  };

  router.get(['/auth/oauth/:provider/callback', '/auth/oauth/:provider/callback/'], handleOAuthCallback);

  router.post('/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/me', (req: AuthenticatedRequest, res) => {
    if (!req.userId) {
      res.json({ user: null });
      return;
    }
    const authUser = db
      .prepare(`SELECT email, email_verified, auth_provider FROM auth_users WHERE id = ?`)
      .get(req.userId) as { email: string; email_verified: number; auth_provider: string } | undefined;
    const profileRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(req.userId) as
      | Record<string, unknown>
      | undefined;
    if (!profileRow) {
      res.json({ user: null });
      return;
    }
    const profile = hydrateProfile(profileRow);
    const mentorRow =
      profileRow.role === 'mentor'
        ? (db.prepare(`SELECT * FROM mentor_details WHERE profile_id = ?`).get(req.userId) as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const subscription =
      profileRow.role === 'student' ? getEffectiveSubscription(db, req.userId) : null;

    const unreadMessagesCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM connections WHERE (requester_id = ? OR receiver_id = ?) AND status = 'pending' AND receiver_id = ?`
        )
        .get(req.userId, req.userId, req.userId) as { c: number }
    ).c;

    res.json({
      user: {
        ...profile,
        email: authUser?.email,
        email_verified: Boolean(authUser?.email_verified),
        auth_provider: authUser?.auth_provider || 'local',
        mentor_details: hydrateMentor(mentorRow),
        subscription,
        pending_requests_count: unreadMessagesCount,
      },
    });
  });

  // ONBOARDING
  router.post('/onboarding', requireAuth, (req: AuthenticatedRequest, res) => {
    const profile = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(req.userId!) as
      | Record<string, unknown>
      | undefined;
    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    if (profile.role === 'student') {
      const { grade_level, school_name, city, interests, bio, avatar_url } = req.body || {};
      if (!grade_level || !school_name || !city) {
        res.status(400).json({ error: 'Grade level, school name, and city are required.' });
        return;
      }
      const cleanInterests = Array.isArray(interests) ? interests : [];
      if (cleanInterests.length === 0) {
        res.status(400).json({ error: 'Please pick at least one career interest.' });
        return;
      }

      db.prepare(
        `UPDATE profiles SET grade_level = ?, school_name = ?, city = ?, interests = ?, bio = ?, avatar_url = COALESCE(?, avatar_url), onboarding_complete = 1 WHERE id = ?`
      ).run(
        String(grade_level),
        String(school_name).trim(),
        String(city).trim(),
        JSON.stringify(cleanInterests),
        bio ? String(bio).trim() : null,
        avatar_url || null,
        req.userId!
      );

      res.json({ ok: true, next: '/quiz/career-fit' });
      return;
    }

    if (profile.role === 'mentor') {
      const { profession, company, years_experience, linkedin_url, niches, bio, city } = req.body || {};
      if (!profession || !linkedin_url || !bio || !city) {
        res.status(400).json({ error: 'Profession, LinkedIn URL, city, and bio are required.' });
        return;
      }
      const cleanNiches = Array.isArray(niches) ? niches : [];
      if (cleanNiches.length === 0) {
        res.status(400).json({ error: 'Please select at least one career niche you can mentor.' });
        return;
      }

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE profiles SET city = ?, bio = ?, interests = ?, onboarding_complete = 1 WHERE id = ?`
        ).run(String(city).trim(), String(bio).trim(), JSON.stringify(cleanNiches), req.userId!);

        db.prepare(
          `UPDATE mentor_details SET profession = ?, company = ?, years_experience = ?, linkedin_url = ?, niches = ? WHERE profile_id = ?`
        ).run(
          String(profession).trim(),
          company ? String(company).trim() : null,
          Number(years_experience) || 1,
          String(linkedin_url).trim(),
          JSON.stringify(cleanNiches),
          req.userId!
        );
      });
      tx();

      res.json({ ok: true, next: '/dashboard' });
      return;
    }

    db.prepare(`UPDATE profiles SET onboarding_complete = 1 WHERE id = ?`).run(req.userId!);
    res.json({ ok: true, next: '/admin' });
  });

  // SETTINGS & AVATAR UPLOAD
  router.patch('/settings/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const { full_name, bio, city, grade_level, school_name, interests, profession, company, years_experience, linkedin_url } =
      req.body || {};

    const current = db.prepare(`SELECT role FROM profiles WHERE id = ?`).get(req.userId!) as { role: string };

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE profiles
         SET full_name = COALESCE(?, full_name),
             bio = COALESCE(?, bio),
             city = COALESCE(?, city),
             grade_level = COALESCE(?, grade_level),
             school_name = COALESCE(?, school_name),
             interests = COALESCE(?, interests)
         WHERE id = ?`
      ).run(
        full_name ? String(full_name).trim() : null,
        bio !== undefined ? String(bio).trim() : null,
        city ? String(city).trim() : null,
        grade_level !== undefined ? grade_level : null,
        school_name !== undefined ? school_name : null,
        Array.isArray(interests) ? JSON.stringify(interests) : null,
        req.userId!
      );

      if (current.role === 'mentor') {
        db.prepare(
          `UPDATE mentor_details
           SET profession = COALESCE(?, profession),
               company = COALESCE(?, company),
               years_experience = COALESCE(?, years_experience),
               linkedin_url = COALESCE(?, linkedin_url),
               niches = COALESCE(?, niches)
           WHERE profile_id = ?`
        ).run(
          profession ? String(profession).trim() : null,
          company !== undefined ? company : null,
          years_experience !== undefined ? Number(years_experience) : null,
          linkedin_url ? String(linkedin_url).trim() : null,
          Array.isArray(interests) ? JSON.stringify(interests) : null,
          req.userId!
        );
      }
    });
    tx();

    res.json({ ok: true });
  });

  router.post('/settings/avatar', requireAuth, upload.single('avatar'), (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please select an image file to upload.' });
      return;
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    db.prepare(`UPDATE profiles SET avatar_url = ? WHERE id = ?`).run(avatarUrl, req.userId!);
    res.json({ ok: true, avatar_url: avatarUrl });
  });

  // NICHES / CAREERS
  router.get('/niches', (_req, res) => {
    const rows = db.prepare(`SELECT * FROM niches ORDER BY name ASC`).all() as Record<string, unknown>[];
    const enriched = rows.map((n) => {
      const slug = String(n.slug);
      const mentorCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM mentor_details md WHERE md.status = 'approved' AND md.niches LIKE ?`
          )
          .get(`%"${slug}"%`) as { c: number }
      ).c;
      const groupCount = (
        db.prepare(`SELECT COUNT(*) as c FROM groups WHERE niche_slug = ?`).get(slug) as { c: number }
      ).c;
      return { ...hydrateNiche(n), mentor_count: mentorCount, group_count: groupCount };
    });
    res.json({ niches: enriched });
  });

  router.get('/niches/:slug', (req, res) => {
    const { slug } = req.params;
    const nicheRow = db.prepare(`SELECT * FROM niches WHERE slug = ?`).get(slug) as
      | Record<string, unknown>
      | undefined;
    if (!nicheRow) {
      res.status(404).json({ error: 'Career niche not found.' });
      return;
    }

    const mentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.city, p.bio, md.*
         FROM profiles p
         JOIN mentor_details md ON md.profile_id = p.id
         WHERE md.status = 'approved' AND md.niches LIKE ?
         ORDER BY COALESCE(md.avg_reply_hours, 999) ASC`
      )
      .all(`%"${slug}"%`)
      .map((m: unknown) => hydrateMentor(m as Record<string, unknown>));

    const groups = db
      .prepare(
        `SELECT g.*, p.full_name as mentor_name, p.avatar_url as mentor_avatar,
                (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as members_count
         FROM groups g
         JOIN profiles p ON p.id = g.mentor_id
         WHERE g.niche_slug = ?`
      )
      .all(slug);

    const quizzes = db
      .prepare(
        `SELECT q.*, p.full_name as author_name
         FROM quizzes q
         LEFT JOIN profiles p ON p.id = q.author_id
         WHERE q.niche_slug = ? AND q.is_career_fit = 0`
      )
      .all(slug);

    res.json({
      niche: hydrateNiche(nicheRow),
      mentors,
      groups,
      quizzes,
    });
  });

  // EXPLORE
  router.get('/explore', (req: AuthenticatedRequest, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const niche = String(req.query.niche || '').trim();
    const city = String(req.query.city || '').trim();

    const blockedIds = req.userId
      ? (
          db
            .prepare(
              `SELECT blocked_id as id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id as id FROM blocks WHERE blocked_id = ?`
            )
            .all(req.userId, req.userId) as Array<{ id: string }>
        ).map((b) => b.id)
      : [];

    // Approved mentors only
    const mentorRows = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.city, p.bio, p.interests, md.*
         FROM profiles p
         JOIN mentor_details md ON md.profile_id = p.id
         WHERE md.status = 'approved' AND p.onboarding_complete = 1
         ORDER BY COALESCE(md.avg_reply_hours, 999) ASC, COALESCE(md.rating, 0) DESC`
      )
      .all() as Record<string, unknown>[];

    const mentors = mentorRows
      .filter((m) => !blockedIds.includes(String(m.id)) && String(m.id) !== req.userId)
      .map((m) => ({
        ...hydrateProfile(m),
        ...hydrateMentor(m),
      }))
      .filter((m: Record<string, unknown>) => {
        if (niche && !(m.niches as string[]).includes(niche)) return false;
        if (city && String(m.city || '').toLowerCase() !== city.toLowerCase()) return false;
        if (q) {
          const hay = `${m.full_name} ${m.profession} ${m.company || ''} ${m.bio || ''} ${m.city || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    // Students
    const studentRows = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.city, p.bio, p.grade_level, p.school_name, p.interests, p.created_at
         FROM profiles p
         WHERE p.role = 'student' AND p.onboarding_complete = 1
         ORDER BY p.created_at DESC`
      )
      .all() as Record<string, unknown>[];

    const students = studentRows
      .filter((s) => !blockedIds.includes(String(s.id)) && String(s.id) !== req.userId)
      .map((s) => hydrateProfile(s)!)
      .filter((s: Record<string, unknown>) => {
        if (niche && !(s.interests as string[]).includes(niche)) return false;
        if (city && String(s.city || '').toLowerCase() !== city.toLowerCase()) return false;
        if (q) {
          const hay = `${s.full_name} ${s.school_name || ''} ${s.grade_level || ''} ${s.city || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

    const nichesRows = db.prepare(`SELECT * FROM niches ORDER BY name ASC`).all() as Record<string, unknown>[];
    const niches = nichesRows
      .map((n) => hydrateNiche(n))
      .filter((n: Record<string, unknown>) => {
        if (!q) return true;
        return `${n.name} ${n.description}`.toLowerCase().includes(q);
      });

    res.json({ mentors, students, niches });
  });

  // DASHBOARD
  router.get('/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const profileRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(req.userId!) as Record<string, unknown>;
    const profile = hydrateProfile(profileRow) as Record<string, unknown>;

    if (profile.role === 'student') {
      const subscription = getEffectiveSubscription(db, req.userId!);
      const badges = db
        .prepare(`SELECT * FROM badges WHERE student_id = ? ORDER BY awarded_at DESC`)
        .all(req.userId!);
      const certificates = db
        .prepare(
          `SELECT c.*, p.full_name as mentor_name FROM certificates c JOIN profiles p ON p.id = c.mentor_id WHERE c.student_id = ? ORDER BY c.issued_at DESC`
        )
        .all(req.userId!);
      const quizDone = Boolean(
        db
          .prepare(
            `SELECT 1 FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE qa.student_id = ? AND q.is_career_fit = 1 LIMIT 1`
          )
          .get(req.userId!)
      );
      const upcomingSessions = db
        .prepare(
          `SELECT m.*, a.start_at, a.end_at, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession, md.company
           FROM meetings m
           JOIN availability a ON a.id = m.slot_id
           JOIN profiles p ON p.id = m.mentor_id
           LEFT JOIN mentor_details md ON md.profile_id = p.id
           WHERE m.student_id = ? AND m.status = 'booked'
           ORDER BY a.start_at ASC`
        )
        .all(req.userId!);

      const myGroups = db
        .prepare(
          `SELECT g.*, (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) as members_count
           FROM groups g
           JOIN group_members gm ON gm.group_id = g.id
           WHERE gm.student_id = ?`
        )
        .all(req.userId!);

      const interests = (profile.interests as string[]) || [];
      const approvedMentors = db
        .prepare(
          `SELECT p.id, p.full_name, p.avatar_url, p.city, p.bio, md.*
           FROM profiles p JOIN mentor_details md ON md.profile_id = p.id
           WHERE md.status = 'approved'
           ORDER BY COALESCE(md.avg_reply_hours, 999) ASC`
        )
        .all() as Record<string, unknown>[];

      const suggestedMentors = approvedMentors
        .map((m) => hydrateMentor(m) as Record<string, unknown>)
        .sort((a, b) => {
          const aMatch = (a.niches as string[]).filter((n) => interests.includes(n)).length;
          const bMatch = (b.niches as string[]).filter((n) => interests.includes(n)).length;
          return bMatch - aMatch;
        })
        .slice(0, 4);

      // Pending requests > 24h check
      const pendingOutgoing = db
        .prepare(
          `SELECT c.*, p.full_name as receiver_name, md.niches as receiver_niches
           FROM connections c
           JOIN profiles p ON p.id = c.receiver_id
           LEFT JOIN mentor_details md ON md.profile_id = p.id
           WHERE c.requester_id = ? AND c.status = 'pending'
           ORDER BY c.created_at ASC`
        )
        .all(req.userId!) as Array<Record<string, unknown>>;

      const nowMs = Date.now();
      const staleRequests = pendingOutgoing
        .map((r) => {
          const hrs = (nowMs - new Date(String(r.created_at)).getTime()) / (1000 * 3600);
          const receiverNiches = parseJsonArray<string>(r.receiver_niches);
          const alternatives =
            hrs >= 24
              ? approvedMentors
                  .filter(
                    (m) =>
                      String(m.id) !== String(r.receiver_id) &&
                      parseJsonArray<string>(m.niches).some((n) => receiverNiches.includes(n))
                  )
                  .slice(0, 3)
                  .map((m) => hydrateMentor(m))
              : [];
          return {
            ...r,
            hours_waiting: Math.round(hrs),
            is_overdue: hrs >= 24,
            alternatives,
          };
        })
        .filter((r) => r.is_overdue);

      res.json({
        role: 'student',
        subscription,
        quiz_done: quizDone,
        badges,
        certificates,
        upcoming_sessions: upcomingSessions,
        my_groups: myGroups,
        suggested_mentors: suggestedMentors,
        stale_requests: staleRequests,
        pending_count: pendingOutgoing.length,
      });
      return;
    }

    if (profile.role === 'mentor') {
      const mentorRow = db.prepare(`SELECT * FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as Record<
        string,
        unknown
      >;
      const mentorDetails = hydrateMentor(mentorRow);

      const pendingIncoming = db
        .prepare(
          `SELECT c.*, p.full_name as requester_name, p.avatar_url as requester_avatar, p.grade_level, p.school_name, p.city
           FROM connections c
           JOIN profiles p ON p.id = c.requester_id
           WHERE c.receiver_id = ? AND c.status = 'pending'
           ORDER BY c.created_at ASC`
        )
        .all(req.userId!) as Array<Record<string, unknown>>;

      const nowMs = Date.now();
      const pendingWithTimer = pendingIncoming.map((r) => {
        const hoursWaiting = Math.round((nowMs - new Date(String(r.created_at)).getTime()) / (1000 * 3600));
        return {
          ...r,
          hours_waiting: hoursWaiting,
          is_urgent: hoursWaiting >= 20,
        };
      });

      const upcomingSessions = db
        .prepare(
          `SELECT m.*, a.start_at, a.end_at, p.full_name as student_name, p.avatar_url as student_avatar, p.grade_level
           FROM meetings m
           JOIN availability a ON a.id = m.slot_id
           JOIN profiles p ON p.id = m.student_id
           WHERE m.mentor_id = ? AND m.status = 'booked'
           ORDER BY a.start_at ASC`
        )
        .all(req.userId!);

      const myGroups = db
        .prepare(
          `SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as members_count
           FROM groups g WHERE g.mentor_id = ?`
        )
        .all(req.userId!);

      res.json({
        role: 'mentor',
        mentor_details: mentorDetails,
        pending_requests: pendingWithTimer,
        upcoming_sessions: upcomingSessions,
        my_groups: myGroups,
      });
      return;
    }

    res.json({ role: 'admin' });
  });

  // PUBLIC / PROFILE PASSPORT /u/:id
  router.get('/profiles/:id', (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    const profileRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(targetId) as
      | Record<string, unknown>
      | undefined;
    if (!profileRow) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const profile = hydrateProfile(profileRow) as Record<string, unknown>;
    const mentorRow =
      profile.role === 'mentor'
        ? (db.prepare(`SELECT * FROM mentor_details WHERE profile_id = ?`).get(targetId) as
            | Record<string, unknown>
            | undefined)
        : undefined;

    const badges = db
      .prepare(`SELECT * FROM badges WHERE student_id = ? ORDER BY awarded_at DESC`)
      .all(targetId);

    const certificates = db
      .prepare(
        `SELECT c.*, p.full_name as mentor_name, md.profession as mentor_profession, md.company as mentor_company
         FROM certificates c
         JOIN profiles p ON p.id = c.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         WHERE c.student_id = ?
         ORDER BY c.issued_at DESC`
      )
      .all(targetId);

    const sessionsAttended = (
      db
        .prepare(`SELECT COUNT(*) as c FROM meetings WHERE student_id = ? AND status = 'completed'`)
        .get(targetId) as { c: number }
    ).c;

    let connection: Record<string, unknown> | null = null;
    let isBlockedByMe = false;
    let isBlockedAny = false;
    let openSlots: Record<string, unknown>[] = [];

    if (req.userId) {
      connection =
        (db
          .prepare(
            `SELECT * FROM connections
             WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`
          )
          .get(req.userId, targetId, targetId, req.userId) as Record<string, unknown> | undefined) || null;
      isBlockedByMe = Boolean(
        db.prepare(`SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).get(req.userId, targetId)
      );
      isBlockedAny = isBlockedBetween(db, req.userId, targetId);
    }

    if (profile.role === 'mentor') {
      openSlots = db
        .prepare(
          `SELECT * FROM availability WHERE mentor_id = ? AND is_booked = 0 AND start_at > ? ORDER BY start_at ASC`
        )
        .all(targetId, new Date().toISOString()) as Record<string, unknown>[];
    }

    res.json({
      profile,
      mentor_details: hydrateMentor(mentorRow),
      badges,
      certificates,
      sessions_attended: sessionsAttended,
      connection,
      is_blocked_by_me: isBlockedByMe,
      is_blocked: isBlockedAny,
      open_slots: openSlots,
    });
  });

  // CONNECTIONS
  router.get('/connections', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT c.*,
                req.full_name as requester_name, req.avatar_url as requester_avatar, req.role as requester_role, req.city as requester_city, req.grade_level as requester_grade,
                rec.full_name as receiver_name, rec.avatar_url as receiver_avatar, rec.role as receiver_role, rec.city as receiver_city,
                md_rec.profession as receiver_profession, md_rec.company as receiver_company, md_rec.niches as receiver_niches, md_rec.avg_reply_hours as receiver_reply_hours
         FROM connections c
         JOIN profiles req ON req.id = c.requester_id
         JOIN profiles rec ON rec.id = c.receiver_id
         LEFT JOIN mentor_details md_rec ON md_rec.profile_id = rec.id
         WHERE c.requester_id = ? OR c.receiver_id = ?
         ORDER BY c.created_at DESC`
      )
      .all(req.userId!, req.userId!) as Array<Record<string, unknown>>;

    const approvedMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.city, md.*
         FROM profiles p JOIN mentor_details md ON md.profile_id = p.id
         WHERE md.status = 'approved'
         ORDER BY COALESCE(md.avg_reply_hours, 999) ASC`
      )
      .all() as Record<string, unknown>[];

    const nowMs = Date.now();
    const enriched = rows
      .filter((r) => !isBlockedBetween(db, String(r.requester_id), String(r.receiver_id)))
      .map((r) => {
        const hoursWaiting = Math.round((nowMs - new Date(String(r.created_at)).getTime()) / (1000 * 3600));
        const receiverNiches = parseJsonArray<string>(r.receiver_niches);
        const alternatives =
          r.status === 'pending' && String(r.requester_id) === req.userId && hoursWaiting >= 24 && r.receiver_role === 'mentor'
            ? approvedMentors
                .filter(
                  (m) =>
                    String(m.id) !== String(r.receiver_id) &&
                    parseJsonArray<string>(m.niches).some((n) => receiverNiches.includes(n))
                )
                .slice(0, 3)
                .map((m) => hydrateMentor(m))
            : [];
        return {
          ...r,
          receiver_niches: receiverNiches,
          hours_waiting: hoursWaiting,
          alternatives,
        };
      });

    res.json({ connections: enriched });
  });

  router.post('/connections', requireAuth, (req: AuthenticatedRequest, res) => {
    const { receiver_id, message } = req.body || {};
    if (!receiver_id || receiver_id === req.userId) {
      res.status(400).json({ error: 'Invalid connection recipient.' });
      return;
    }

    if (isBlockedBetween(db, req.userId!, String(receiver_id))) {
      res.status(403).json({ error: 'Unable to connect with this user.' });
      return;
    }

    const receiver = db.prepare(`SELECT id, role FROM profiles WHERE id = ?`).get(receiver_id) as
      | { id: string; role: string }
      | undefined;
    if (!receiver) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (receiver.role === 'mentor') {
      const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(receiver.id) as
        | { status: string }
        | undefined;
      if (!md || md.status !== 'approved') {
        res.status(403).json({ error: 'This mentor is still under review.' });
        return;
      }
      if (req.userRole === 'student') {
        const sub = getEffectiveSubscription(db, req.userId!);
        if (!sub || !sub.is_active) {
          res.status(402).json({
            error: 'Your 7-day trial has ended. Upgrade your plan or redeem an institution code to send mentor requests.',
            code: 'PLAN_REQUIRED',
          });
          return;
        }
      }
    }

    const existing = db
      .prepare(
        `SELECT id, status FROM connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`
      )
      .get(req.userId!, receiver_id, receiver_id, req.userId!) as { id: string; status: string } | undefined;

    if (existing) {
      res.status(409).json({ error: `Connection already exists (${existing.status}).` });
      return;
    }

    const connId = uuid();
    const { masked } = maskContactDetails(String(message || '').trim());
    db.prepare(
      `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)`
    ).run(connId, req.userId!, receiver_id, masked || null, new Date().toISOString());

    emitToUsers([String(receiver_id)], 'connection_updated', { id: connId });
    res.status(201).json({ ok: true, id: connId });
  });

  router.patch('/connections/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const { status } = req.body || {};
    if (!['accepted', 'declined'].includes(status)) {
      res.status(400).json({ error: 'Status must be accepted or declined.' });
      return;
    }

    const conn = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!conn) {
      res.status(404).json({ error: 'Connection not found.' });
      return;
    }
    if (String(conn.receiver_id) !== req.userId) {
      res.status(403).json({ error: 'Only the recipient can respond to this request.' });
      return;
    }

    if (req.userRole === 'mentor') {
      const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as {
        status: string;
      };
      if (md.status !== 'approved') {
        res.status(403).json({ error: 'Your mentor profile must be approved before accepting connections.' });
        return;
      }
    }

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE connections SET status = ?, responded_at = ? WHERE id = ?`).run(status, nowIso, conn.id);

    if (req.userRole === 'mentor') {
      recalculateMentorReplyHours(db, req.userId!);
    }

    emitToUsers([String(conn.requester_id), String(conn.receiver_id)], 'connection_updated', {
      id: conn.id,
      status,
    });
    res.json({ ok: true, status });
  });

  // MESSAGES
  router.get('/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const conns = db
      .prepare(
        `SELECT c.*,
                CASE WHEN c.requester_id = ? THEN rec.id ELSE req.id END as peer_id,
                CASE WHEN c.requester_id = ? THEN rec.full_name ELSE req.full_name END as peer_name,
                CASE WHEN c.requester_id = ? THEN rec.avatar_url ELSE req.avatar_url END as peer_avatar,
                CASE WHEN c.requester_id = ? THEN rec.role ELSE req.role END as peer_role,
                (SELECT body FROM messages m WHERE m.connection_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages m WHERE m.connection_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
         FROM connections c
         JOIN profiles req ON req.id = c.requester_id
         JOIN profiles rec ON rec.id = c.receiver_id
         WHERE (c.requester_id = ? OR c.receiver_id = ?) AND c.status = 'accepted'
         ORDER BY COALESCE(last_message_at, c.responded_at, c.created_at) DESC`
      )
      .all(req.userId!, req.userId!, req.userId!, req.userId!, req.userId!, req.userId!) as Array<
      Record<string, unknown>
    >;

    const threads = conns.filter((c) => !isBlockedBetween(db, req.userId!, String(c.peer_id)));
    res.json({ threads });
  });

  router.get('/messages/:connectionId', requireAuth, (req: AuthenticatedRequest, res) => {
    const conn = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(req.params.connectionId) as
      | Record<string, unknown>
      | undefined;
    if (!conn || conn.status !== 'accepted') {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (String(conn.requester_id) !== req.userId && String(conn.receiver_id) !== req.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const peerId = String(conn.requester_id) === req.userId ? String(conn.receiver_id) : String(conn.requester_id);
    if (isBlockedBetween(db, req.userId!, peerId)) {
      res.status(403).json({ error: 'Messaging is unavailable because one user blocked the other.' });
      return;
    }

    const peer = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.role, p.city, p.grade_level, md.profession, md.company
         FROM profiles p LEFT JOIN mentor_details md ON md.profile_id = p.id WHERE p.id = ?`
      )
      .get(peerId);

    const messages = db
      .prepare(`SELECT * FROM messages WHERE connection_id = ? ORDER BY created_at ASC`)
      .all(conn.id);

    const subscription = req.userRole === 'student' ? getEffectiveSubscription(db, req.userId!) : null;
    const mentorMessagingLocked =
      req.userRole === 'student' &&
      (peer as { role: string })?.role === 'mentor' &&
      (!subscription || !subscription.is_active);

    res.json({ connection: conn, peer, messages, mentor_messaging_locked: mentorMessagingLocked });
  });

  router.post('/messages/:connectionId', requireAuth, (req: AuthenticatedRequest, res) => {
    const { body } = req.body || {};
    if (!body || !String(body).trim()) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const conn = db.prepare(`SELECT * FROM connections WHERE id = ?`).get(req.params.connectionId) as
      | Record<string, unknown>
      | undefined;
    if (!conn || conn.status !== 'accepted') {
      res.status(404).json({ error: 'Accepted connection not found.' });
      return;
    }
    if (String(conn.requester_id) !== req.userId && String(conn.receiver_id) !== req.userId) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    const peerId = String(conn.requester_id) === req.userId ? String(conn.receiver_id) : String(conn.requester_id);
    if (isBlockedBetween(db, req.userId!, peerId)) {
      res.status(403).json({ error: 'Cannot message a blocked user.' });
      return;
    }

    const peer = db.prepare(`SELECT role FROM profiles WHERE id = ?`).get(peerId) as { role: string };
    if (req.userRole === 'student' && peer.role === 'mentor') {
      const sub = getEffectiveSubscription(db, req.userId!);
      if (!sub || !sub.is_active) {
        res.status(402).json({
          error: 'Your trial has expired. Upgrade to continue messaging mentors.',
          code: 'PLAN_REQUIRED',
        });
        return;
      }
    }

    const { masked, wasMasked } = maskContactDetails(String(body).trim());
    const msgId = uuid();
    const createdAt = new Date().toISOString();

    db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      msgId,
      conn.id,
      req.userId!,
      masked,
      createdAt
    );

    const savedMessage = {
      id: msgId,
      connection_id: conn.id,
      sender_id: req.userId!,
      body: masked,
      created_at: createdAt,
    };

    emitToUsers([String(conn.requester_id), String(conn.receiver_id)], 'new_message', savedMessage);
    res.status(201).json({ message: savedMessage, was_masked: wasMasked });
  });

  // GROUPS
  router.get('/groups', requireAuth, (req: AuthenticatedRequest, res) => {
    const groups = db
      .prepare(
        `SELECT g.*, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession as mentor_profession, md.company as mentor_company,
                n.name as niche_name,
                (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as members_count,
                (SELECT COUNT(*) FROM group_posts gp WHERE gp.group_id = g.id) as posts_count,
                EXISTS(SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.student_id = ?) as is_member
         FROM groups g
         JOIN profiles p ON p.id = g.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         LEFT JOIN niches n ON n.slug = g.niche_slug
         ORDER BY g.created_at DESC`
      )
      .all(req.userId!) as Array<Record<string, unknown>>;

    res.json({
      groups: groups.map((g) => ({
        ...g,
        is_member: Boolean(g.is_member) || String(g.mentor_id) === req.userId,
      })),
    });
  });

  router.post('/groups', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only approved mentors can create niche groups.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as {
      status: string;
    };
    if (!md || md.status !== 'approved') {
      res.status(403).json({ error: 'Your mentor profile must be approved before creating a group.' });
      return;
    }

    const { name, niche_slug, description } = req.body || {};
    if (!name || !niche_slug || !description) {
      res.status(400).json({ error: 'Name, niche, and description are required.' });
      return;
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO groups (id, mentor_id, niche_slug, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, req.userId!, niche_slug, String(name).trim(), String(description).trim(), new Date().toISOString());

    res.status(201).json({ ok: true, id });
  });

  router.get('/groups/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const group = db
      .prepare(
        `SELECT g.*, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession as mentor_profession, md.company as mentor_company,
                n.name as niche_name,
                (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as members_count
         FROM groups g
         JOIN profiles p ON p.id = g.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         LEFT JOIN niches n ON n.slug = g.niche_slug
         WHERE g.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    const isMember =
      String(group.mentor_id) === req.userId ||
      Boolean(
        db
          .prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND student_id = ?`)
          .get(group.id, req.userId!)
      );

    const posts = db
      .prepare(
        `SELECT gp.*, p.full_name as author_name, p.avatar_url as author_avatar, p.role as author_role, p.grade_level as author_grade, md.profession as author_profession
         FROM group_posts gp
         JOIN profiles p ON p.id = gp.author_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         WHERE gp.group_id = ?
         ORDER BY gp.created_at ASC`
      )
      .all(group.id) as Array<Record<string, unknown>>;

    res.json({
      group: { ...group, is_member: isMember },
      posts: posts.map((p) => ({
        ...p,
        is_question: Boolean(p.is_question),
        is_mentor_answer: String(p.author_id) === String(group.mentor_id),
      })),
    });
  });

  router.post('/groups/:id/join', requireAuth, (req: AuthenticatedRequest, res) => {
    const group = db.prepare(`SELECT id FROM groups WHERE id = ?`).get(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, student_id, joined_at) VALUES (?, ?, ?)`).run(
      req.params.id,
      req.userId!,
      new Date().toISOString()
    );
    res.json({ ok: true });
  });

  router.post('/groups/:id/posts', requireAuth, (req: AuthenticatedRequest, res) => {
    const group = db.prepare(`SELECT id, mentor_id FROM groups WHERE id = ?`).get(req.params.id) as
      | { id: string; mentor_id: string }
      | undefined;
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    const isMember =
      group.mentor_id === req.userId ||
      Boolean(
        db
          .prepare(`SELECT 1 FROM group_members WHERE group_id = ? AND student_id = ?`)
          .get(group.id, req.userId!)
      );
    if (!isMember) {
      res.status(403).json({ error: 'Join the group first before posting.' });
      return;
    }

    const { body, is_question, parent_id } = req.body || {};
    if (!body || !String(body).trim()) {
      res.status(400).json({ error: 'Post cannot be empty.' });
      return;
    }

    const { masked, wasMasked } = maskContactDetails(String(body).trim());
    const postId = uuid();
    db.prepare(
      `INSERT INTO group_posts (id, group_id, author_id, parent_id, body, is_question, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(postId, group.id, req.userId!, parent_id || null, masked, is_question ? 1 : 0, new Date().toISOString());

    // Badge check: Contributor (5+ group posts)
    if (req.userRole === 'student') {
      const postCount = (
        db.prepare(`SELECT COUNT(*) as c FROM group_posts WHERE author_id = ?`).get(req.userId!) as { c: number }
      ).c;
      if (postCount >= 5) {
        awardBadge(db, req.userId!, 'contributor', 'Contributor');
      }
    }

    res.status(201).json({ ok: true, id: postId, was_masked: wasMasked });
  });

  // SESSIONS & AVAILABILITY
  router.get('/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
    const subscription = req.userRole === 'student' ? getEffectiveSubscription(db, req.userId!) : null;

    if (req.userRole === 'mentor') {
      const slots = db
        .prepare(`SELECT * FROM availability WHERE mentor_id = ? ORDER BY start_at ASC`)
        .all(req.userId!);
      const meetings = db
        .prepare(
          `SELECT m.*, a.start_at, a.end_at, p.full_name as student_name, p.avatar_url as student_avatar, p.grade_level, p.school_name,
                  c.id as certificate_id, c.verify_code
           FROM meetings m
           LEFT JOIN availability a ON a.id = m.slot_id
           JOIN profiles p ON p.id = m.student_id
           LEFT JOIN certificates c ON c.meeting_id = m.id
           WHERE m.mentor_id = ?
           ORDER BY COALESCE(a.start_at, m.created_at) DESC`
        )
        .all(req.userId!);
      res.json({ role: 'mentor', slots, meetings });
      return;
    }

    const meetings = db
      .prepare(
        `SELECT m.*, a.start_at, a.end_at, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession, md.company,
                c.id as certificate_id, c.verify_code
         FROM meetings m
         LEFT JOIN availability a ON a.id = m.slot_id
         JOIN profiles p ON p.id = m.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         LEFT JOIN certificates c ON c.meeting_id = m.id
         WHERE m.student_id = ?
         ORDER BY COALESCE(a.start_at, m.created_at) DESC`
      )
      .all(req.userId!);

    // Connected mentors with open slots
    const connectedMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, md.profession, md.company, md.avg_reply_hours
         FROM connections c
         JOIN profiles p ON p.id = CASE WHEN c.requester_id = ? THEN c.receiver_id ELSE c.requester_id END
         JOIN mentor_details md ON md.profile_id = p.id
         WHERE (c.requester_id = ? OR c.receiver_id = ?) AND c.status = 'accepted' AND p.role = 'mentor'`
      )
      .all(req.userId!, req.userId!, req.userId!) as Array<Record<string, unknown>>;

    const nowIso = new Date().toISOString();
    const bookableMentors = connectedMentors.map((m) => ({
      ...m,
      open_slots: db
        .prepare(`SELECT * FROM availability WHERE mentor_id = ? AND is_booked = 0 AND start_at > ? ORDER BY start_at ASC`)
        .all(m.id, nowIso),
    }));

    res.json({
      role: 'student',
      subscription,
      meetings,
      connected_mentors: bookableMentors,
    });
  });

  router.post('/availability', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only mentors can create availability slots.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as {
      status: string;
    };
    if (!md || md.status !== 'approved') {
      res.status(403).json({ error: 'Your mentor profile must be approved before adding slots.' });
      return;
    }

    const { start_at, duration_minutes } = req.body || {};
    if (!start_at) {
      res.status(400).json({ error: 'Start time is required.' });
      return;
    }
    const mins = Number(duration_minutes) || 45;
    if (![30, 45, 60].includes(mins)) {
      res.status(400).json({ error: 'Duration must be 30, 45, or 60 minutes.' });
      return;
    }

    const startDate = new Date(start_at);
    if (Number.isNaN(startDate.getTime())) {
      res.status(400).json({ error: 'Invalid date/time.' });
      return;
    }
    const endDate = new Date(startDate.getTime() + mins * 60 * 1000);

    const id = uuid();
    db.prepare(`INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 0)`).run(
      id,
      req.userId!,
      startDate.toISOString(),
      endDate.toISOString()
    );
    res.status(201).json({ ok: true, id });
  });

  router.delete('/availability/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const slot = db.prepare(`SELECT * FROM availability WHERE id = ?`).get(req.params.id) as
      | { id: string; mentor_id: string; is_booked: number }
      | undefined;
    if (!slot || slot.mentor_id !== req.userId) {
      res.status(404).json({ error: 'Slot not found.' });
      return;
    }
    if (slot.is_booked) {
      res.status(400).json({ error: 'Cannot delete an already booked slot.' });
      return;
    }
    db.prepare(`DELETE FROM availability WHERE id = ?`).run(slot.id);
    res.json({ ok: true });
  });

  router.post('/sessions/book', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'student') {
      res.status(403).json({ error: 'Only students can book 1:1 sessions.' });
      return;
    }
    const { slot_id, topic } = req.body || {};
    if (!slot_id) {
      res.status(400).json({ error: 'Please select a time slot.' });
      return;
    }

    const tx = db.transaction(() => {
      const slot = db.prepare(`SELECT * FROM availability WHERE id = ?`).get(slot_id) as
        | { id: string; mentor_id: string; start_at: string; end_at: string; is_booked: number }
        | undefined;
      if (!slot || slot.is_booked) {
        return { error: 'This slot is no longer available.', status: 409 };
      }

      if (isBlockedBetween(db, req.userId!, slot.mentor_id)) {
        return { error: 'Booking unavailable.', status: 403 };
      }

      const connected = db
        .prepare(
          `SELECT 1 FROM connections
           WHERE status = 'accepted'
             AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))`
        )
        .get(req.userId!, slot.mentor_id, slot.mentor_id, req.userId!);
      if (!connected) {
        return { error: 'You can only book mentors you are connected with.', status: 403 };
      }

      const sub = getEffectiveSubscription(db, req.userId!);
      if (!sub) {
        return { error: 'Subscription not found.', status: 400 };
      }

      if (sub.effective_plan === 'institution' || sub.effective_plan === 'monthly' || sub.effective_plan === 'yearly') {
        // allowed
      } else if (sub.effective_plan === 'trial' && sub.free_sessions_left > 0) {
        db.prepare(`UPDATE subscriptions SET free_sessions_left = free_sessions_left - 1 WHERE id = ?`).run(sub.id);
      } else {
        return {
          error: 'You have used your 1 free trial session. Upgrade to Monthly, Yearly, or redeem an institution code to book another 1:1.',
          status: 402,
          code: 'PLAN_REQUIRED',
        };
      }

      db.prepare(`UPDATE availability SET is_booked = 1 WHERE id = ?`).run(slot.id);
      const meetingId = uuid();
      const meetUrl = `https://meet.jit.si/outspace-${meetingId}`;

      db.prepare(
        `INSERT INTO meetings (id, mentor_id, student_id, slot_id, type, group_id, topic, meet_url, status, created_at)
         VALUES (?, ?, ?, ?, 'one_on_one', NULL, ?, ?, 'booked', ?)`
      ).run(
        meetingId,
        slot.mentor_id,
        req.userId!,
        slot.id,
        String(topic || '1:1 Career Mentorship Session').trim(),
        meetUrl,
        new Date().toISOString()
      );

      return { ok: true, id: meetingId, meet_url: meetUrl };
    });

    const result = tx() as { error?: string; status?: number; code?: string; ok?: boolean; id?: string; meet_url?: string };
    if (result.error) {
      res.status(result.status || 400).json({ error: result.error, code: result.code });
      return;
    }
    res.status(201).json(result);
  });

  router.post('/sessions/:id/complete', requireAuth, (req: AuthenticatedRequest, res) => {
    const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!meeting) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (String(meeting.mentor_id) !== req.userId) {
      res.status(403).json({ error: 'Only the session mentor can mark it complete.' });
      return;
    }
    if (meeting.status === 'completed') {
      res.status(400).json({ error: 'Session is already marked complete.' });
      return;
    }

    const { mentor_notes } = req.body || {};
    const certId = uuid();
    const verifyCode = cryptoRandomCode(8);
    const issuedAt = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`UPDATE meetings SET status = 'completed', mentor_notes = ? WHERE id = ?`).run(
        mentor_notes ? String(mentor_notes).trim() : null,
        meeting.id
      );
      db.prepare(`UPDATE mentor_details SET sessions_completed = sessions_completed + 1 WHERE profile_id = ?`).run(
        meeting.mentor_id
      );
      db.prepare(
        `INSERT INTO certificates (id, student_id, mentor_id, meeting_id, title, verify_code, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        certId,
        meeting.student_id,
        meeting.mentor_id,
        meeting.id,
        String(meeting.topic || '1:1 Career Mentorship Session'),
        verifyCode,
        issuedAt
      );

      const completedCount = (
        db
          .prepare(`SELECT COUNT(*) as c FROM meetings WHERE student_id = ? AND status = 'completed'`)
          .get(meeting.student_id) as { c: number }
      ).c;

      if (completedCount >= 1) {
        awardBadge(db, String(meeting.student_id), 'first_session', 'First Session');
      }
      if (completedCount >= 3) {
        awardBadge(db, String(meeting.student_id), 'three_sessions', 'Committed Learner');
      }

      const seminarCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM meetings WHERE student_id = ? AND status = 'completed' AND type = 'group_seminar'`
          )
          .get(meeting.student_id) as { c: number }
      ).c;
      if (seminarCount >= 5) {
        awardBadge(db, String(meeting.student_id), 'seminar_5', 'Seminar Regular');
      }
    });
    tx();

    res.json({ ok: true, certificate_id: certId, verify_code: verifyCode });
  });

  router.post('/sessions/:id/rate', requireAuth, (req: AuthenticatedRequest, res) => {
    const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!meeting) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }
    if (String(meeting.student_id) !== req.userId) {
      res.status(403).json({ error: 'Only the student can rate this session.' });
      return;
    }
    const { rating, feedback } = req.body || {};
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      res.status(400).json({ error: 'Rating must be between 1 and 5.' });
      return;
    }

    db.prepare(`UPDATE meetings SET rating = ?, feedback = ? WHERE id = ?`).run(
      numRating,
      feedback ? String(feedback).trim() : null,
      meeting.id
    );
    recalculateMentorRating(db, String(meeting.mentor_id));

    res.json({ ok: true });
  });

  // QUIZZES
  router.get('/quizzes', requireAuth, (req: AuthenticatedRequest, res) => {
    const quizzes = db
      .prepare(
        `SELECT q.*, p.full_name as author_name, n.name as niche_name,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
                (SELECT score FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.student_id = ? ORDER BY qa.created_at DESC LIMIT 1) as best_attempt_score
         FROM quizzes q
         LEFT JOIN profiles p ON p.id = q.author_id
         LEFT JOIN niches n ON n.slug = q.niche_slug
         ORDER BY q.is_career_fit DESC, q.title ASC`
      )
      .all(req.userId!);

    res.json({ quizzes });
  });

  router.post('/quizzes', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only approved mentors can create quizzes.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as {
      status: string;
    };
    if (!md || md.status !== 'approved') {
      res.status(403).json({ error: 'Your mentor profile must be approved before creating quizzes.' });
      return;
    }

    const { title, description, niche_slug, questions } = req.body || {};
    if (!title || !niche_slug || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'Title, niche, and at least one question are required.' });
      return;
    }

    const quizId = uuid();
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO quizzes (id, author_id, niche_slug, title, description, is_career_fit) VALUES (?, ?, ?, ?, ?, 0)`
      ).run(quizId, req.userId!, niche_slug, String(title).trim(), description ? String(description).trim() : '');

      const insertQ = db.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, position, question, options, correct_index) VALUES (?, ?, ?, ?, ?, ?)`
      );
      questions.forEach((q: { question: string; options: string[]; correct_index: number }, idx: number) => {
        insertQ.run(
          uuid(),
          quizId,
          idx + 1,
          String(q.question).trim(),
          JSON.stringify(q.options.map((o) => ({ label: String(o).trim() }))),
          Number(q.correct_index) || 0
        );
      });
    });
    tx();

    res.status(201).json({ ok: true, id: quizId });
  });

  router.get('/quizzes/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const quiz = db
      .prepare(
        `SELECT q.*, p.full_name as author_name, n.name as niche_name
         FROM quizzes q
         LEFT JOIN profiles p ON p.id = q.author_id
         LEFT JOIN niches n ON n.slug = q.niche_slug
         WHERE q.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    const questions = (
      db
        .prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC`)
        .all(quiz.id) as Array<Record<string, unknown>>
    ).map((q) => ({
      ...q,
      options: parseJsonArray(q.options),
    }));

    const latestAttempt = db
      .prepare(`SELECT * FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(quiz.id, req.userId!) as Record<string, unknown> | undefined;

    res.json({
      quiz: { ...quiz, is_career_fit: Boolean(quiz.is_career_fit) },
      questions,
      latest_attempt: latestAttempt
        ? { ...latestAttempt, result: latestAttempt.result ? JSON.parse(String(latestAttempt.result)) : null }
        : null,
    });
  });

  router.post('/quizzes/:id/attempt', requireAuth, (req: AuthenticatedRequest, res) => {
    const quiz = db.prepare(`SELECT * FROM quizzes WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    const questions = (
      db
        .prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC`)
        .all(quiz.id) as Array<{ id: string; question: string; options: string; correct_index: number | null }>
    ).map((q) => ({
      ...q,
      options: parseJsonArray<{ label: string; riasec?: string }>(q.options),
    }));

    const { answers } = req.body || {};
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      res.status(400).json({ error: 'Please answer all questions before submitting.' });
      return;
    }

    if (quiz.is_career_fit) {
      const counts: Record<string, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
      questions.forEach((q, idx) => {
        const chosenIdx = Number(answers[idx]);
        const chosenOpt = q.options[chosenIdx];
        if (chosenOpt?.riasec && counts[chosenOpt.riasec] !== undefined) {
          counts[chosenOpt.riasec] += 1;
        }
      });

      const topCodes = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([code]) => code);

      const allNiches = (db.prepare(`SELECT * FROM niches`).all() as Record<string, unknown>[]).map((n) =>
        hydrateNiche(n)
      );

      const suggestedNiches = allNiches
        .map((n: Record<string, unknown>) => {
          const codes = n.riasec_codes as string[];
          const primaryMatch = codes[0] === topCodes[0] ? 3 : codes.includes(topCodes[0]) ? 2 : 0;
          const secondaryMatch = codes.includes(topCodes[1]) ? 1 : 0;
          return { ...n, matchScore: primaryMatch + secondaryMatch };
        })
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3);

      const suggestedSlugs = suggestedNiches.map((n: Record<string, unknown>) => String(n.slug));

      const approvedMentors = (
        db
          .prepare(
            `SELECT p.id, p.full_name, p.avatar_url, p.city, p.bio, md.*
             FROM profiles p JOIN mentor_details md ON md.profile_id = p.id
             WHERE md.status = 'approved'
             ORDER BY COALESCE(md.avg_reply_hours, 999) ASC`
          )
          .all() as Record<string, unknown>[]
      ).map((m) => hydrateMentor(m) as Record<string, unknown>);

      const matchedMentors = approvedMentors
        .map((m) => {
          const overlap = (m.niches as string[]).filter((n) => suggestedSlugs.includes(n)).length;
          return { ...m, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 3);

      const resultPayload = {
        counts,
        top_codes: topCodes,
        suggested_niches: suggestedNiches,
        matched_mentors: matchedMentors,
      };

      const attemptId = uuid();
      db.prepare(
        `INSERT INTO quiz_attempts (id, quiz_id, student_id, score, result, created_at) VALUES (?, ?, ?, 100, ?, ?)`
      ).run(attemptId, quiz.id, req.userId!, JSON.stringify(resultPayload), new Date().toISOString());

      if (req.userRole === 'student') {
        awardBadge(db, req.userId!, 'explorer', 'Explorer');
      }

      res.json({ ok: true, is_career_fit: true, result: resultPayload });
      return;
    }

    // Mentor multiple-choice quiz
    let correctCount = 0;
    const breakdown = questions.map((q, idx) => {
      const selected = Number(answers[idx]);
      const isCorrect = selected === Number(q.correct_index);
      if (isCorrect) correctCount += 1;
      return {
        question: q.question,
        selected_index: selected,
        correct_index: Number(q.correct_index),
        is_correct: isCorrect,
        options: q.options,
      };
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const resultPayload = { correct_count: correctCount, total: questions.length, breakdown };

    db.prepare(
      `INSERT INTO quiz_attempts (id, quiz_id, student_id, score, result, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuid(), quiz.id, req.userId!, score, JSON.stringify(resultPayload), new Date().toISOString());

    let earnedQuizAce = false;
    if (req.userRole === 'student' && score >= 80) {
      awardBadge(db, req.userId!, 'quiz_ace', 'Quiz Ace');
      earnedQuizAce = true;
    }

    res.json({ ok: true, is_career_fit: false, score, earned_quiz_ace: earnedQuizAce, result: resultPayload });
  });

  // CERTIFICATES & PUBLIC VERIFY
  router.get('/certificates/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const cert = db
      .prepare(
        `SELECT c.*,
                s.full_name as student_name, s.grade_level as student_grade, s.school_name as student_school,
                m.full_name as mentor_name, md.profession as mentor_profession, md.company as mentor_company
         FROM certificates c
         JOIN profiles s ON s.id = c.student_id
         JOIN profiles m ON m.id = c.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = m.id
         WHERE c.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!cert) {
      res.status(404).json({ error: 'Certificate not found.' });
      return;
    }
    if (String(cert.student_id) !== req.userId && String(cert.mentor_id) !== req.userId && req.userRole !== 'admin') {
      res.status(403).json({ error: 'Only the certificate owner can view this page.' });
      return;
    }
    res.json({ certificate: cert });
  });

  router.get('/verify/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const cert = db
      .prepare(
        `SELECT c.*,
                s.full_name as student_name, s.grade_level as student_grade, s.school_name as student_school,
                m.full_name as mentor_name, md.profession as mentor_profession, md.company as mentor_company
         FROM certificates c
         JOIN profiles s ON s.id = c.student_id
         JOIN profiles m ON m.id = c.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = m.id
         WHERE UPPER(c.verify_code) = ?`
      )
      .get(code) as Record<string, unknown> | undefined;

    if (!cert) {
      res.status(404).json({ verified: false, error: 'Certificate not found.' });
      return;
    }
    res.json({ verified: true, certificate: cert });
  });

  // PRICING, CHECKOUT, INSTITUTION CODES
  router.get('/pricing', requireAuth, (req: AuthenticatedRequest, res) => {
    const subscription = req.userRole === 'student' ? getEffectiveSubscription(db, req.userId!) : null;
    res.json({ subscription });
  });

  router.post('/pricing/checkout', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'student') {
      res.status(403).json({ error: 'Only student accounts require a mentorship plan.' });
      return;
    }
    const { plan, method } = req.body || {};
    if (!['monthly', 'yearly'].includes(plan)) {
      res.status(400).json({ error: 'Invalid plan selected.' });
      return;
    }
    const current = getEffectiveSubscription(db, req.userId!);
    if (current?.effective_plan === 'institution') {
      res.status(400).json({ error: 'Your account is already covered by your institution.' });
      return;
    }

    const days = plan === 'yearly' ? 365 : 30;
    const periodEnd = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

    db.prepare(`UPDATE subscriptions SET plan = ?, current_period_end = ? WHERE user_id = ?`).run(
      plan,
      periodEnd,
      req.userId!
    );

    const updated = getEffectiveSubscription(db, req.userId!);
    res.json({ ok: true, method: method || 'Card', subscription: updated });
  });

  router.post('/pricing/redeem', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'student') {
      res.status(403).json({ error: 'Only student accounts can redeem an institution code.' });
      return;
    }
    const { code } = req.body || {};
    if (!code || !String(code).trim()) {
      res.status(400).json({ error: 'Please enter an institution access code.' });
      return;
    }

    const tx = db.transaction(() => {
      const inst = db
        .prepare(`SELECT * FROM institutions WHERE UPPER(access_code) = UPPER(?)`)
        .get(String(code).trim()) as
        | { id: string; name: string; access_code: string; seats_total: number; seats_used: number }
        | undefined;

      if (!inst) {
        return { error: 'Invalid institution access code.', status: 404 };
      }
      if (inst.seats_used >= inst.seats_total) {
        return { error: 'All seats for this institution code have been claimed.', status: 400 };
      }

      const current = db.prepare(`SELECT institution_id FROM subscriptions WHERE user_id = ?`).get(req.userId!) as {
        institution_id: string | null;
      };
      if (current?.institution_id === inst.id) {
        return { error: 'You have already redeemed this institution code.', status: 400 };
      }

      db.prepare(`UPDATE institutions SET seats_used = seats_used + 1 WHERE id = ?`).run(inst.id);
      db.prepare(`UPDATE subscriptions SET plan = 'institution', institution_id = ? WHERE user_id = ?`).run(
        inst.id,
        req.userId!
      );
      return { ok: true, institution_name: inst.name };
    });

    const result = tx() as { error?: string; status?: number; ok?: boolean; institution_name?: string };
    if (result.error) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }

    const updated = getEffectiveSubscription(db, req.userId!);
    res.json({ ok: true, institution_name: result.institution_name, subscription: updated });
  });

  // ADMIN, REPORTS, BLOCKS
  router.get('/admin/overview', requireAuth, requireAdmin, (_req, res) => {
    const pendingMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.city, p.bio, p.created_at, au.email, md.*
         FROM profiles p
         JOIN auth_users au ON au.id = p.id
         JOIN mentor_details md ON md.profile_id = p.id
         WHERE md.status = 'pending'
         ORDER BY p.created_at ASC`
      )
      .all()
      .map((m) => hydrateMentor(m as Record<string, unknown>));

    const allMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.city, md.profession, md.company, md.status, md.linkedin_url, md.sessions_completed
         FROM profiles p JOIN mentor_details md ON md.profile_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all();

    const reports = db
      .prepare(
        `SELECT r.*, rep.full_name as reporter_name, tgt.full_name as reported_name, tgt.role as reported_role
         FROM reports r
         JOIN profiles rep ON rep.id = r.reporter_id
         JOIN profiles tgt ON tgt.id = r.reported_id
         ORDER BY r.created_at DESC`
      )
      .all();

    res.json({ pending_mentors: pendingMentors, all_mentors: allMentors, reports });
  });

  router.post('/admin/mentors/:id/decision', requireAuth, requireAdmin, (req, res) => {
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Decision must be approved or rejected.' });
      return;
    }

    const md = db.prepare(`SELECT profile_id FROM mentor_details WHERE profile_id = ?`).get(req.params.id);
    if (!md) {
      res.status(404).json({ error: 'Mentor not found.' });
      return;
    }

    db.prepare(`UPDATE mentor_details SET status = ? WHERE profile_id = ?`).run(status, req.params.id);

    // If approved and has no slots yet, add 2 starter slots over the next 3 days so students can test booking right away
    if (status === 'approved') {
      const slotCount = (
        db.prepare(`SELECT COUNT(*) as c FROM availability WHERE mentor_id = ?`).get(req.params.id) as { c: number }
      ).c;
      if (slotCount === 0) {
        const s1 = new Date(Date.now() + 24 * 3600 * 1000);
        s1.setUTCHours(12, 0, 0, 0); // 5 PM PKT
        const e1 = new Date(s1.getTime() + 45 * 60 * 1000);
        db.prepare(`INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 0)`).run(
          uuid(),
          req.params.id,
          s1.toISOString(),
          e1.toISOString()
        );
      }
    }

    res.json({ ok: true, status });
  });

  router.post('/reports', requireAuth, (req: AuthenticatedRequest, res) => {
    const { reported_id, reason } = req.body || {};
    if (!reported_id || !reason || String(reason).trim().length < 5) {
      res.status(400).json({ error: 'Please provide a clear reason for your report.' });
      return;
    }
    db.prepare(`INSERT INTO reports (id, reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      uuid(),
      req.userId!,
      reported_id,
      String(reason).trim(),
      new Date().toISOString()
    );
    res.status(201).json({ ok: true });
  });

  router.post('/blocks', requireAuth, (req: AuthenticatedRequest, res) => {
    const { blocked_id } = req.body || {};
    if (!blocked_id || blocked_id === req.userId) {
      res.status(400).json({ error: 'Invalid user.' });
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)`).run(req.userId!, blocked_id);
    res.json({ ok: true });
  });

  router.delete('/blocks/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).run(req.userId!, req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function cryptoRandomCode(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
