import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import os from 'os';
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
import { isActiveTrackSlug } from '../shared/types.js';

function getCurrentCycleMonth(): string {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getDaysLeftInCycle(): number {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
  const year = pkt.getUTCFullYear();
  const month = pkt.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.max(1, lastDay - pkt.getUTCDate() + 1);
}

function getCycleEndIso(): string {
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 3600 * 1000);
  const year = pkt.getUTCFullYear();
  const month = pkt.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(lastDay).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}T23:59:59+05:00`;
}

function generateMentorFollowupReply(params: {
  studentName: string;
  studentMessage: string;
  mentorName: string;
  profession: string;
  company: string | null;
  talkUrl: string | null;
  niches: string[];
}): string {
  const firstStudent = params.studentName.split(' ')[0] || 'there';
  const firstMentor = params.mentorName.split(' ')[0] || params.mentorName;
  const msg = params.studentMessage.toLowerCase();

  if (msg.includes('slot') || msg.includes('time') || msg.includes('1:1') || msg.includes('book') || msg.includes('call') || msg.includes('meet')) {
    return `Great question, ${firstStudent}! I keep open evening PKT slots on my profile—just click "Select Time" on my profile or head to My Sessions to lock in a slot and generate your Meet link. Looking forward to speaking with you! — ${firstMentor}`;
  }
  if (msg.includes('uni') || msg.includes('degree') || msg.includes('lums') || msg.includes('nust') || msg.includes('iba') || msg.includes('fast') || msg.includes('aku') || msg.includes('major')) {
    return `Good thinking asking early, ${firstStudent}. In ${params.profession.toLowerCase()}, your portfolio, real projects, and hands-on curiosity matter just as much as the university name. Book a 1:1 slot on my profile and we can compare your A-Level/FSc options together! — ${firstMentor}`;
  }
  if (msg.includes('pitch') || msg.includes('compet') || msg.includes('course') || msg.includes('startup') || msg.includes('idea')) {
    return `Awesome initiative, ${firstStudent}! Start by interviewing 5 classmates or community members about the exact pain point before building slides. Once you finish the course videos, submit your pitch before month-end so we can review it at the showcase! — ${firstMentor}`;
  }
  if (msg.includes('salary') || msg.includes('pay') || msg.includes('scope') || msg.includes('day') || msg.includes('work') || msg.includes('career')) {
    return `Happy to share an honest look inside ${params.company || 'the field'}, ${firstStudent}. My days as ${params.profession} split between deep problem-solving and collaborating with teams across Pakistan. Drop more questions anytime or book a quick 1:1! — ${firstMentor}`;
  }
  if (msg.includes('thank') || msg.includes('shukriya') || msg.includes('ok') || msg.includes('sure')) {
    return `Anytime, ${firstStudent}! Keep exploring with confidence—message me whenever a new question pops up or grab one of my open 1:1 PKT slots. — ${firstMentor}`;
  }

  return `Thanks for sharing that, ${firstStudent}! From my experience as ${params.profession}${params.company ? ` at ${params.company}` : ''}, the fastest way to get clarity in ${params.niches[0]?.replace(/-/g, ' ') || 'this field'} is testing small projects early and asking specific questions. Feel free to book a 1:1 PKT slot on my profile whenever you'd like to dive deeper! — ${firstMentor}`;
}

function generateMentorBotReply(params: {
  studentName: string;
  studentMessage: string;
  mentorName: string;
  profession: string;
  company: string | null;
  talkUrl: string | null;
  niches: string[];
}): string {
  const firstStudent = params.studentName.split(' ')[0] || 'there';
  const firstMentor = params.mentorName.split(' ')[0] || params.mentorName;
  const msg = params.studentMessage.toLowerCase();

  let topicAck = `Thanks for reaching out about ${params.niches[0]?.replace(/-/g, ' ') || 'career exploration'}!`;
  if (msg.includes('startup') || msg.includes('founder') || msg.includes('business') || msg.includes('entrepreneur')) {
    topicAck = `Love the entrepreneurial curiosity you shared in your note!`;
  } else if (msg.includes('psych') || msg.includes('mental') || msg.includes('counsel') || msg.includes('research')) {
    topicAck = `Really glad to hear you are exploring psychology and human behavior thoughtfully.`;
  } else if (msg.includes('impact') || msg.includes('ngo') || msg.includes('social') || msg.includes('climate') || msg.includes('community')) {
    topicAck = `It is wonderful to see high-school students caring deeply about social impact in Pakistan.`;
  } else if (msg.includes('uni') || msg.includes('degree') || msg.includes('a-level') || msg.includes('fsc') || msg.includes('lums') || msg.includes('nust') || msg.includes('iba')) {
    topicAck = `Choosing your degree and university is a big milestone—you are asking the right questions early.`;
  } else if (msg.includes('session') || msg.includes('1:1') || msg.includes('call') || msg.includes('meet')) {
    topicAck = `I would be happy to jump on a 1:1 mentoring call with you.`;
  }

  const snippet = params.studentMessage.trim()
    ? ` I read your note ("${params.studentMessage.trim().slice(0, 72)}${params.studentMessage.trim().length > 72 ? '...' : ''}") and accepted your request.`
    : ` I accepted your connection request.`;

  const roleLine = `As ${params.profession}${params.company ? ` at ${params.company}` : ''}, feel free to drop your specific questions here or grab one of my open 1:1 PKT time slots on my profile.`;
  const talkLine = params.talkUrl ? ` You can also check out my featured talk while we schedule.` : '';

  return `Assalam-o-Alaikum ${firstStudent}! ${topicAck}${snippet} ${roleLine}${talkLine} — ${firstMentor}`;
}

const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

function resolveUploadDir(): string {
  const localDir = path.resolve(process.cwd(), 'uploads');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'outspace-uploads');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

const storage = isServerlessRuntime
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, resolveUploadDir()),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: isServerlessRuntime ? 1.5 * 1024 * 1024 : 3 * 1024 * 1024 },
});

let cachedFirebaseApiKey: string | null | undefined;

function loadFirebaseWebApiKey(): string | null {
  const envKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (envKey) return envKey;
  if (cachedFirebaseApiKey !== undefined) return cachedFirebaseApiKey;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { apiKey?: string };
      cachedFirebaseApiKey = parsed.apiKey?.trim() || null;
      return cachedFirebaseApiKey;
    }
  } catch {
    // ignore missing config
  }
  cachedFirebaseApiKey = null;
  return null;
}

function getAppBaseUrl(req: express.Request): string {
  const publicUrl = process.env.PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    return publicUrl.replace(/\/+$/, '');
  }

  const forwardedHost = ((req.headers['x-forwarded-host'] as string) || '').split(',')[0].trim();
  const rawHost = forwardedHost || req.headers.host || process.env.VERCEL_URL || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || (isServerlessRuntime ? 'https' : 'http');
  const proto = protoHeader.split(',')[0].trim();

  // On Vercel (preview or production), always derive callback URL from the active deployment host
  if (isServerlessRuntime && host) {
    return `${proto}://${host}`;
  }

  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    const isLocalEnv = envUrl.startsWith('http://localhost');
    if (!isLocalEnv || !forwardedHost || forwardedHost.startsWith('localhost')) {
      return envUrl.replace(/\/+$/, '');
    }
  }

  return `${proto}://${host}`;
}

function isTrustedReturnOrigin(origin: string | undefined, req: express.Request): origin is string {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const baseOrigin = new URL(getAppBaseUrl(req)).origin;
    if (parsed.origin === baseOrigin) return true;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
    const reqHost = (((req.headers['x-forwarded-host'] as string) || req.headers.host || '').split(',')[0].trim()).split(':')[0];
    if (parsed.protocol === 'https:') {
      if (parsed.hostname.endsWith('.run.app') || parsed.hostname.endsWith('.vercel.app')) return true;
      if (reqHost && parsed.hostname === reqHost) return true;
    }
    return false;
  } catch {
    return false;
  }
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

const MENTOR_MONTHLY_CONNECTION_LIMIT = 30;

const VIP_PARTNER_CODES: Record<string, string> = {
  'NIC-VIP-2026': 'NIC Pakistan',
  'PLAN9-VIP-2026': 'Plan9 PITB',
  'NESTIO-VIP-2026': 'The Nest I/O',
  'ORIC-VIP-2026': 'ORIC University Network',
  'SV-PARTNER-2026': 'Silicon Valley Partner Network',
};

function toPktMonth(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const pkt = new Date(d.getTime() + 5 * 3600 * 1000);
  return `${pkt.getUTCFullYear()}-${String(pkt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function hydrateMentor(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    ...row,
    niches: parseJsonArray<string>(row.niches),
    topics: parseJsonArray<string>(row.topics),
    preferred_slots: parseJsonArray<string>(row.preferred_slots),
    is_demo: row.is_demo !== undefined ? Boolean(row.is_demo) : false,
    linkedin_verified: row.linkedin_verified !== undefined ? Boolean(row.linkedin_verified) : undefined,
  };
}

function hydrateProfessionalProfile(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    profile_id: String(row.profile_id),
    linkedin_sub: row.linkedin_sub ? String(row.linkedin_sub) : null,
    linkedin_email: row.linkedin_email ? String(row.linkedin_email) : null,
    linkedin_verified: Boolean(row.linkedin_verified),
    linkedin_profile_url: row.linkedin_profile_url ? String(row.linkedin_profile_url) : null,
    headline: row.headline ? String(row.headline) : null,
    current_role: row.current_role ? String(row.current_role) : null,
    organization: row.organization ? String(row.organization) : null,
    industry: row.industry ? String(row.industry) : null,
    locale: row.locale ? String(row.locale) : null,
    synced_at: String(row.synced_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function hydrateNiche(row: Record<string, unknown>) {
  return {
    ...row,
    degrees: parseJsonArray<string>(row.degrees),
    universities: parseJsonArray<string>(row.universities),
    riasec_codes: parseJsonArray<string>(row.riasec_codes),
    is_active_track: isActiveTrackSlug(String(row.slug || '')),
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

  function upsertProfessionalProfileRecord(params: {
    profileId: string;
    linkedinSub?: string | null;
    linkedinEmail?: string | null;
    linkedinVerified?: boolean;
    linkedinProfileUrl?: string | null;
    headline?: string | null;
    currentRole?: string | null;
    organization?: string | null;
    industry?: string | null;
    locale?: string | null;
    rawOidcProfile?: Record<string, unknown> | null;
  }) {
    const nowIso = new Date().toISOString();
    const existing = db
      .prepare(`SELECT * FROM professional_profiles WHERE profile_id = ?`)
      .get(params.profileId) as Record<string, unknown> | undefined;

    const rawJson = params.rawOidcProfile
      ? JSON.stringify(params.rawOidcProfile)
      : existing
        ? String(existing.raw_oidc_profile || '{}')
        : '{}';

    if (!existing) {
      db.prepare(
        `INSERT INTO professional_profiles (
           profile_id, linkedin_sub, linkedin_email, linkedin_verified, linkedin_profile_url,
           headline, current_role, organization, industry, locale, raw_oidc_profile, synced_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        params.profileId,
        params.linkedinSub || null,
        params.linkedinEmail || null,
        params.linkedinVerified ? 1 : 0,
        params.linkedinProfileUrl || null,
        params.headline || null,
        params.currentRole || null,
        params.organization || null,
        params.industry || null,
        params.locale || null,
        rawJson,
        nowIso,
        nowIso
      );
      return;
    }

    db.prepare(
      `UPDATE professional_profiles
       SET linkedin_sub = COALESCE(?, linkedin_sub),
           linkedin_email = COALESCE(?, linkedin_email),
           linkedin_verified = CASE WHEN ? = 1 THEN 1 ELSE linkedin_verified END,
           linkedin_profile_url = COALESCE(?, linkedin_profile_url),
           headline = COALESCE(?, headline),
           current_role = COALESCE(?, current_role),
           organization = COALESCE(?, organization),
           industry = COALESCE(?, industry),
           locale = COALESCE(?, locale),
           raw_oidc_profile = ?,
           synced_at = CASE WHEN ? IS NOT NULL THEN ? ELSE synced_at END,
           updated_at = ?
       WHERE profile_id = ?`
    ).run(
      params.linkedinSub || null,
      params.linkedinEmail || null,
      params.linkedinVerified ? 1 : 0,
      params.linkedinProfileUrl !== undefined ? params.linkedinProfileUrl : null,
      params.headline !== undefined ? params.headline : null,
      params.currentRole !== undefined ? params.currentRole : null,
      params.organization !== undefined ? params.organization : null,
      params.industry !== undefined ? params.industry : null,
      params.locale || null,
      rawJson,
      params.linkedinSub || null,
      nowIso,
      nowIso,
      params.profileId
    );
  }

  // Shared helper for creating/updating a verified OAuth user & issuing Outspace session token
  function upsertOAuthAccount(
    req: express.Request,
    res: express.Response,
    params: {
      email: string;
      fullName: string;
      avatarUrl: string | null;
      provider: 'google' | 'linkedin';
      providerId: string;
      requestedRole: 'student' | 'mentor';
      linkedinClaims?: {
        locale?: string | null;
        rawProfile?: Record<string, unknown>;
      };
    }
  ) {
    let existing = (
      params.providerId
        ? db
            .prepare(`SELECT id, provider_id FROM auth_users WHERE auth_provider = ? AND provider_id = ?`)
            .get(params.provider, params.providerId)
        : undefined
    ) as { id: string; provider_id: string | null } | undefined;

    if (!existing) {
      existing = db.prepare(`SELECT id, provider_id FROM auth_users WHERE email = ?`).get(params.email) as
        | { id: string; provider_id: string | null }
        | undefined;
    }

    const userId = existing?.id || uuid();
    const nowIso = new Date().toISOString();
    let resolvedRole: string = params.requestedRole;

    if (!existing) {
      const role = params.requestedRole;
      const placeholderHash = `OAUTH_ONLY_${crypto.randomBytes(24).toString('hex')}`;
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO auth_users (id, email, password_hash, email_verified, auth_provider, provider_id, created_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)`
        ).run(userId, params.email, placeholderHash, params.provider, params.providerId, nowIso);

        db.prepare(
          `INSERT INTO profiles (id, role, full_name, avatar_url, bio, city, grade_level, school_name, interests, guardian_consent, onboarding_complete, created_at)
           VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', ?, 0, ?)`
        ).run(userId, role, params.fullName, params.avatarUrl, role === 'student' ? 1 : 0, nowIso);

        if (role === 'mentor') {
          db.prepare(
            `INSERT INTO mentor_details (profile_id, profession, company, years_experience, linkedin_url, niches, status, avg_reply_hours, rating, sessions_completed)
             VALUES (?, '', NULL, NULL, '', '[]', 'pending', NULL, NULL, 0)`
          ).run(userId);

          if (params.provider === 'linkedin' && params.providerId) {
            upsertProfessionalProfileRecord({
              profileId: userId,
              linkedinSub: params.providerId,
              linkedinEmail: params.email,
              linkedinVerified: true,
              locale: params.linkedinClaims?.locale || null,
              rawOidcProfile: params.linkedinClaims?.rawProfile || null,
            });
          }
        } else {
          // Student flow stays intentionally lightweight: no corporate/LinkedIn tables created
          const trialEnds = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
          db.prepare(
            `INSERT INTO subscriptions (id, user_id, plan, trial_ends_at, current_period_end, institution_id, free_sessions_left)
             VALUES (?, ?, 'trial', ?, NULL, NULL, 1)`
          ).run(uuid(), userId, trialEnds);
        }
      });
      tx();
    } else {
      const existingProfile = db.prepare(`SELECT role FROM profiles WHERE id = ?`).get(userId) as
        | { role: string }
        | undefined;
      resolvedRole = existingProfile?.role || params.requestedRole;

      db.prepare(
        `UPDATE auth_users
         SET email_verified = 1,
             provider_id = COALESCE(NULLIF(provider_id, ''), ?)
         WHERE id = ?`
      ).run(params.providerId || null, userId);

      if (params.avatarUrl) {
        db.prepare(`UPDATE profiles SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`).run(
          params.avatarUrl,
          userId
        );
      }

      if (resolvedRole === 'mentor' && params.provider === 'linkedin' && params.providerId) {
        upsertProfessionalProfileRecord({
          profileId: userId,
          linkedinSub: params.providerId,
          linkedinEmail: params.email,
          linkedinVerified: true,
          locale: params.linkedinClaims?.locale || null,
          rawOidcProfile: params.linkedinClaims?.rawProfile || null,
        });
      }
    }

    scheduleMongoSync(db);
    const token = signUserId(userId);
    setSessionCookie(req, res, token);

    const profileRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(userId) as Record<string, unknown>;
    return { token, profileRow };
  }

  // GOOGLE (GMAIL) & LINKEDIN OAUTH LOGIN FOR STUDENTS AND MENTORS
  router.get('/auth/oauth/providers', (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    const hasFirebaseGoogle = Boolean(loadFirebaseWebApiKey());
    const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    res.json({
      google: hasFirebaseGoogle || hasGoogleOAuth,
      googleFirebase: hasFirebaseGoogle,
      linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      callbacks: {
        google: `${baseUrl}/api/auth/oauth/google/callback`,
        linkedin: `${baseUrl}/api/auth/oauth/linkedin/callback`,
      },
    });
  });

  // Verify Firebase Auth Google ID token (works on AI Studio, Vercel, and Mobile without redirect_uri mismatch)
  router.post('/auth/oauth/google/firebase', async (req, res) => {
    const { idToken, accessToken, role } = req.body || {};
    const requestedRole: 'student' | 'mentor' = role === 'mentor' ? 'mentor' : 'student';

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Missing Google sign-in token.' });
      return;
    }

    const firebaseApiKey = loadFirebaseWebApiKey();
    if (!firebaseApiKey) {
      res.status(500).json({ error: 'Firebase Google sign-in is not configured on this server.' });
      return;
    }

    try {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      const lookupData = (await lookupRes.json()) as {
        users?: Array<{
          localId?: string;
          email?: string;
          emailVerified?: boolean;
          displayName?: string;
          photoUrl?: string;
          providerUserInfo?: Array<{ providerId?: string; rawId?: string }>;
        }>;
        error?: { message?: string };
      };

      const fbUser = lookupData.users?.[0];
      if (!lookupRes.ok || !fbUser?.email) {
        res.status(401).json({
          error: lookupData.error?.message || 'Could not verify Google account token.',
        });
        return;
      }

      let emailVerified = Boolean(fbUser.emailVerified);
      let fullName = fbUser.displayName?.trim() || fbUser.email.split('@')[0];
      let avatarUrl: string | null = fbUser.photoUrl || null;

      if (!emailVerified && typeof accessToken === 'string' && accessToken) {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userInfoRes.ok) {
          const gUser = (await userInfoRes.json()) as {
            email?: string;
            email_verified?: boolean;
            name?: string;
            picture?: string;
          };
          if (gUser.email?.toLowerCase() === fbUser.email.toLowerCase() && gUser.email_verified) {
            emailVerified = true;
            if (!fbUser.displayName && gUser.name) fullName = gUser.name.trim();
            if (!avatarUrl && gUser.picture) avatarUrl = gUser.picture;
          }
        }
      }

      if (!emailVerified) {
        res.status(403).json({ error: 'Your Google email address must be verified before signing in.' });
        return;
      }

      const googleProviderInfo = fbUser.providerUserInfo?.find((p) => p.providerId === 'google.com');
      const { token, profileRow } = upsertOAuthAccount(req, res, {
        email: fbUser.email.trim().toLowerCase(),
        fullName,
        avatarUrl,
        provider: 'google',
        providerId: googleProviderInfo?.rawId || fbUser.localId || '',
        requestedRole,
      });

      res.json({ ok: true, token, profile: hydrateProfile(profileRow) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Google authentication verification failed.' });
    }
  });

  router.get('/auth/oauth/:provider/url', (req: AuthenticatedRequest, res) => {
    const provider = req.params.provider;
    const role = req.query.role === 'mentor' ? 'mentor' : 'student';
    const mode = req.query.mode === 'redirect' ? 'redirect' : 'popup';
    const rawOrigin = typeof req.query.return_origin === 'string' ? req.query.return_origin : undefined;
    const returnOrigin = isTrustedReturnOrigin(rawOrigin, req) ? rawOrigin : getAppBaseUrl(req);
    const allowedReturnPaths = ['/login', '/signup', '/settings', '/onboarding'];
    const rawReturnPath = typeof req.query.return_path === 'string' ? req.query.return_path : '/login';
    const returnPath = allowedReturnPaths.includes(rawReturnPath) ? rawReturnPath : '/login';
    const wantsLink = req.query.intent === 'link';

    if (wantsLink && !req.userId) {
      res.status(401).json({ error: 'Please log in before linking your LinkedIn account.' });
      return;
    }

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
        state: signOAuthState({ provider: 'google', role, mode, returnOrigin, returnPath }),
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
      state: signOAuthState({
        provider: 'linkedin',
        role: wantsLink && req.userRole === 'mentor' ? 'mentor' : role,
        mode,
        returnOrigin,
        returnPath,
        linkUserId: wantsLink ? req.userId : undefined,
      }),
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

    const parsedState = verifyOAuthState(state);
    const baseUrl = getAppBaseUrl(req);
    const targetOrigin = isTrustedReturnOrigin(parsedState?.returnOrigin, req)
      ? parsedState!.returnOrigin!
      : baseUrl;
    const targetPath = parsedState?.returnPath || '/login';
    const flowMode = parsedState?.mode || 'popup';

    const sendOAuthResult = (payload: Record<string, unknown>) => {
      let redirectTarget = `${targetOrigin}${targetPath}`;
      if (payload.type === 'OUTSPACE_OAUTH_SUCCESS' && typeof payload.token === 'string') {
        const hashParams = new URLSearchParams({
          oauth_token: payload.token,
          role: String(payload.role || 'student'),
          onboarding: payload.onboarding_complete ? '1' : '0',
        });
        if (payload.linked) {
          hashParams.set('linkedin_synced', '1');
        }
        redirectTarget = `${targetOrigin}${targetPath}#${hashParams.toString()}`;
      } else if (payload.type === 'OUTSPACE_OAUTH_ERROR') {
        const hashParams = new URLSearchParams({
          oauth_error: String(payload.error || 'Authentication failed.'),
        });
        redirectTarget = `${targetOrigin}${targetPath}#${hashParams.toString()}`;
      }

      if (flowMode === 'redirect') {
        res.redirect(302, redirectTarget);
        return;
      }

      const json = JSON.stringify(payload);
      const redirectJson = JSON.stringify(redirectTarget);
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Outpase Sign-In</title>
  </head>
  <body style="font-family:sans-serif;background:#FFF5E8;color:#252020;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;">
    <div style="text-align:center;padding:24px;border:2px solid #252020;border-radius:18px;background:#fff;max-width:360px;width:100%;">
      <p style="font-weight:bold;margin:0 0 8px;font-size:16px;">Outpase Authentication</p>
      <p style="font-size:13px;margin:0 0 16px;color:#5A4F4F;">Completing sign-in, returning to Outpase...</p>
      <a id="continue-link" href="${redirectTarget.replace(/"/g, '&quot;')}" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#C83D42;color:#fff;font-weight:bold;font-size:13px;text-decoration:none;border:2px solid #252020;">Continue to Outpase &rarr;</a>
    </div>
    <script>
      (function () {
        var payload = ${json};
        var fallbackUrl = ${redirectJson};
        if (window.opener && !window.opener.closed) {
          try {
            window.opener.postMessage(payload, '*');
            window.close();
          } catch (e) {}
          setTimeout(function () {
            window.location.replace(fallbackUrl);
          }, 700);
        } else {
          window.location.replace(fallbackUrl);
        }
      })();
    </script>
  </body>
</html>`);
    };

    if (oauthError) {
      sendOAuthResult({ type: 'OUTSPACE_OAUTH_ERROR', error: `Authentication cancelled (${oauthError}).` });
      return;
    }

    if (!parsedState || parsedState.provider !== provider || !code) {
      sendOAuthResult({ type: 'OUTSPACE_OAUTH_ERROR', error: 'Invalid or expired OAuth session state.' });
      return;
    }

    const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;

    try {
      let email = '';
      let fullName = '';
      let avatarUrl: string | null = null;
      let providerId = '';
      let linkedinClaims: { locale?: string | null; rawProfile?: Record<string, unknown> } | undefined;

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
          email_verified?: boolean;
          name?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
          locale?: string | { country?: string; language?: string };
        };
        if (!profileData.email) {
          throw new Error('LinkedIn account did not share an email address.');
        }
        email = profileData.email.trim().toLowerCase();
        const combinedName = [profileData.given_name, profileData.family_name].filter(Boolean).join(' ').trim();
        fullName = profileData.name?.trim() || combinedName || email.split('@')[0];
        avatarUrl = profileData.picture || null;
        providerId = profileData.sub || '';

        const localeStr =
          typeof profileData.locale === 'string'
            ? profileData.locale
            : profileData.locale && (profileData.locale.language || profileData.locale.country)
              ? [profileData.locale.language, profileData.locale.country].filter(Boolean).join('-')
              : null;

        linkedinClaims = {
          locale: localeStr,
          rawProfile: {
            sub: profileData.sub,
            name: fullName,
            given_name: profileData.given_name,
            family_name: profileData.family_name,
            email,
            email_verified: profileData.email_verified,
            picture: avatarUrl,
            locale: localeStr,
          },
        };
      }

      // Mentor linking LinkedIn to their existing account from Settings or Onboarding
      if (parsedState.linkUserId && provider === 'linkedin') {
        const targetProfile = db
          .prepare(`SELECT id, role, onboarding_complete FROM profiles WHERE id = ?`)
          .get(parsedState.linkUserId) as
          | { id: string; role: string; onboarding_complete: number }
          | undefined;
        if (!targetProfile) {
          throw new Error('Target Outpase profile was not found.');
        }

        if (providerId) {
          const conflicting = db
            .prepare(`SELECT profile_id FROM professional_profiles WHERE linkedin_sub = ? AND profile_id != ?`)
            .get(providerId, targetProfile.id) as { profile_id: string } | undefined;
          if (conflicting) {
            throw new Error('This LinkedIn account is already linked to another Outpase mentor profile.');
          }
        }

        upsertProfessionalProfileRecord({
          profileId: targetProfile.id,
          linkedinSub: providerId || null,
          linkedinEmail: email,
          linkedinVerified: true,
          locale: linkedinClaims?.locale || null,
          rawOidcProfile: linkedinClaims?.rawProfile || null,
        });

        if (avatarUrl) {
          db.prepare(`UPDATE profiles SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`).run(
            avatarUrl,
            targetProfile.id
          );
        }

        scheduleMongoSync(db);
        const token = signUserId(targetProfile.id);
        setSessionCookie(req, res, token);

        sendOAuthResult({
          type: 'OUTSPACE_OAUTH_SUCCESS',
          token,
          role: targetProfile.role,
          onboarding_complete: Boolean(targetProfile.onboarding_complete),
          linked: true,
        });
        return;
      }

      const { token, profileRow } = upsertOAuthAccount(req, res, {
        email,
        fullName,
        avatarUrl,
        provider: provider as 'google' | 'linkedin',
        providerId,
        requestedRole: parsedState.role,
        linkedinClaims,
      });

      sendOAuthResult({
        type: 'OUTSPACE_OAUTH_SUCCESS',
        token,
        role: String(profileRow.role || 'student'),
        onboarding_complete: Boolean(profileRow.onboarding_complete),
      });
    } catch (err) {
      sendOAuthResult({
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
        ? (db
            .prepare(
              `SELECT md.*, COALESCE(pp.linkedin_verified, 0) as linkedin_verified
               FROM mentor_details md
               LEFT JOIN professional_profiles pp ON pp.profile_id = md.profile_id
               WHERE md.profile_id = ?`
            )
            .get(req.userId) as Record<string, unknown> | undefined)
        : undefined;
    const professionalRow =
      profileRow.role === 'mentor'
        ? (db.prepare(`SELECT * FROM professional_profiles WHERE profile_id = ?`).get(req.userId) as
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
        professional_profile: hydrateProfessionalProfile(professionalRow),
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
      const {
        profession,
        company,
        years_experience,
        linkedin_url,
        niches,
        topics,
        preferred_slots,
        auto_welcome_message,
        vip_code,
        bio,
        city,
        headline,
        industry,
      } = req.body || {};

      if (!profession || !linkedin_url || !bio || !city) {
        res.status(400).json({ error: 'Experience role, LinkedIn URL, city, and bio are required.' });
        return;
      }
      if (String(bio).trim().length < 20) {
        res.status(400).json({ error: 'Please write a short bio (at least 20 characters) describing your background.' });
        return;
      }
      if (!/^https?:\/\/.*linkedin\.com/i.test(String(linkedin_url).trim())) {
        res.status(400).json({ error: 'Please enter a valid LinkedIn profile URL (linkedin.com/in/...).' });
        return;
      }
      const cleanNiches = Array.isArray(niches) ? niches.filter(Boolean) : [];
      if (cleanNiches.length === 0) {
        res.status(400).json({ error: 'Please select one or more fields of expertise.' });
        return;
      }
      const cleanTopics = Array.isArray(topics)
        ? topics.map((t) => String(t).trim()).filter(Boolean)
        : [];
      if (cleanTopics.length === 0) {
        res.status(400).json({ error: 'Please list at least one specific topic you can mentor or teach best.' });
        return;
      }
      const cleanPreferredSlots = Array.isArray(preferred_slots)
        ? preferred_slots.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (cleanPreferredSlots.length === 0) {
        res.status(400).json({ error: 'Please choose your preferred weekly slot timings.' });
        return;
      }

      const rawVip = typeof vip_code === 'string' ? vip_code.trim().toUpperCase() : '';
      let matchedPartner: string | null = null;
      if (rawVip) {
        matchedPartner = VIP_PARTNER_CODES[rawVip] || null;
        if (!matchedPartner) {
          res.status(400).json({
            error:
              'That VIP code is not recognized. Only invited mentors from NIC, Plan9, Nest I/O, ORIC, or our Silicon Valley partner network have VIP codes — leave it blank to apply via standard 48-hour verification.',
          });
          return;
        }
      }

      const cleanProf = String(profession).trim();
      const cleanComp = company ? String(company).trim() : null;
      const cleanLinkedin = String(linkedin_url).trim();
      const cleanWelcome = auto_welcome_message && String(auto_welcome_message).trim()
        ? String(auto_welcome_message).trim()
        : null;
      const derivedHeadline =
        headline && String(headline).trim()
          ? String(headline).trim()
          : cleanComp
            ? `${cleanProf} at ${cleanComp}`
            : cleanProf;

      const nowMs = Date.now();
      const submittedAt = new Date(nowMs).toISOString();
      const deadlineAt = new Date(nowMs + 48 * 3600 * 1000).toISOString();
      const nextStatus = matchedPartner ? 'approved' : 'pending';

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE profiles SET city = ?, bio = ?, interests = ?, onboarding_complete = 1 WHERE id = ?`
        ).run(String(city).trim(), String(bio).trim(), JSON.stringify(cleanNiches), req.userId!);

        db.prepare(
          `UPDATE mentor_details
           SET profession = ?,
               company = ?,
               years_experience = ?,
               linkedin_url = ?,
               niches = ?,
               topics = ?,
               preferred_slots = ?,
               auto_welcome_message = ?,
               vip_code = ?,
               vip_partner = ?,
               verification_submitted_at = ?,
               verification_deadline_at = ?,
               status = ?
           WHERE profile_id = ?`
        ).run(
          cleanProf,
          cleanComp,
          Number(years_experience) || 1,
          cleanLinkedin,
          JSON.stringify(cleanNiches),
          JSON.stringify(cleanTopics),
          JSON.stringify(cleanPreferredSlots),
          cleanWelcome,
          rawVip || null,
          matchedPartner,
          submittedAt,
          matchedPartner ? null : deadlineAt,
          nextStatus,
          req.userId!
        );

        // If VIP partner verified immediately, seed open PKT availability slots from weekly preferences
        if (matchedPartner) {
          const slotCount = (
            db.prepare(`SELECT COUNT(*) as c FROM availability WHERE mentor_id = ? AND is_booked = 0`).get(req.userId!) as {
              c: number;
            }
          ).c;
          if (slotCount === 0) {
            for (const dayOffset of [1, 3, 5]) {
              const s = new Date(nowMs + dayOffset * 24 * 3600 * 1000);
              s.setUTCHours(14, 0, 0, 0); // 7 PM PKT
              const e = new Date(s.getTime() + 45 * 60 * 1000);
              db.prepare(
                `INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 0)`
              ).run(uuid(), req.userId!, s.toISOString(), e.toISOString());
            }
          }
        }

        upsertProfessionalProfileRecord({
          profileId: req.userId!,
          linkedinProfileUrl: cleanLinkedin,
          headline: derivedHeadline,
          currentRole: cleanProf,
          organization: cleanComp,
          industry: industry ? String(industry).trim() : null,
        });
      });
      tx();

      res.json({
        ok: true,
        next: '/dashboard',
        verification_status: nextStatus,
        vip_partner: matchedPartner,
        verification_deadline_at: matchedPartner ? null : deadlineAt,
      });
      return;
    }

    db.prepare(`UPDATE profiles SET onboarding_complete = 1 WHERE id = ?`).run(req.userId!);
    res.json({ ok: true, next: '/admin' });
  });

  // SETTINGS & AVATAR UPLOAD
  router.patch('/settings/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const {
      full_name,
      bio,
      city,
      grade_level,
      school_name,
      interests,
      profession,
      company,
      years_experience,
      linkedin_url,
      headline,
      industry,
      topics,
      preferred_slots,
      auto_welcome_message,
    } = req.body || {};

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
        const cleanProf = profession ? String(profession).trim() : null;
        const cleanComp = company !== undefined ? (company ? String(company).trim() : null) : undefined;
        const cleanLinkedin = linkedin_url ? String(linkedin_url).trim() : null;
        const cleanTopics = Array.isArray(topics)
          ? JSON.stringify(topics.map((t) => String(t).trim()).filter(Boolean))
          : null;
        const cleanSlots = Array.isArray(preferred_slots)
          ? JSON.stringify(preferred_slots.map((s) => String(s).trim()).filter(Boolean))
          : null;
        const cleanWelcome =
          auto_welcome_message !== undefined
            ? auto_welcome_message && String(auto_welcome_message).trim()
              ? String(auto_welcome_message).trim()
              : ''
            : null;

        db.prepare(
          `UPDATE mentor_details
           SET profession = COALESCE(?, profession),
               company = COALESCE(?, company),
               years_experience = COALESCE(?, years_experience),
               linkedin_url = COALESCE(?, linkedin_url),
               niches = COALESCE(?, niches),
               topics = COALESCE(?, topics),
               preferred_slots = COALESCE(?, preferred_slots),
               auto_welcome_message = CASE WHEN ? IS NOT NULL THEN NULLIF(?, '') ELSE auto_welcome_message END
           WHERE profile_id = ?`
        ).run(
          cleanProf,
          cleanComp !== undefined ? cleanComp : null,
          years_experience !== undefined ? Number(years_experience) : null,
          cleanLinkedin,
          Array.isArray(interests) ? JSON.stringify(interests) : null,
          cleanTopics,
          cleanSlots,
          cleanWelcome,
          cleanWelcome,
          req.userId!
        );

        upsertProfessionalProfileRecord({
          profileId: req.userId!,
          linkedinProfileUrl: cleanLinkedin || undefined,
          headline: headline !== undefined ? (headline ? String(headline).trim() : null) : undefined,
          currentRole: cleanProf || undefined,
          organization: cleanComp,
          industry: industry !== undefined ? (industry ? String(industry).trim() : null) : undefined,
        });
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
    const avatarUrl = req.file.buffer
      ? `data:${req.file.mimetype || 'image/png'};base64,${req.file.buffer.toString('base64')}`
      : `/uploads/${req.file.filename}`;
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

    const courses = db
      .prepare(
        `SELECT c.*, p.full_name as author_name,
                (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count
         FROM courses c
         LEFT JOIN profiles p ON p.id = c.author_id
         WHERE c.niche_slug = ?
         ORDER BY c.is_coming_soon ASC`
      )
      .all(slug);

    res.json({
      niche: hydrateNiche(nicheRow),
      mentors,
      groups,
      quizzes,
      courses,
    });
  });

  // Helper: Mentor monthly accepted student count (cap 30/month)
  function getMentorMonthlyConnectionsUsed(mentorId: string): number {
    const cycleMonth = getCurrentCycleMonth();
    const rows = db
      .prepare(
        `SELECT c.responded_at, c.created_at
         FROM connections c
         JOIN profiles p ON p.id = c.requester_id
         WHERE c.receiver_id = ? AND c.status = 'accepted' AND p.role = 'student'`
      )
      .all(mentorId) as Array<{ responded_at: string | null; created_at: string }>;
    return rows.filter((r) => toPktMonth(r.responded_at || r.created_at) === cycleMonth).length;
  }

  // Helper: Has student completed a course (all modules OR submitted course assignment)
  function hasStudentUnlockedMessaging(studentId: string): boolean {
    const assignment = db
      .prepare(`SELECT 1 FROM course_assignments WHERE student_id = ? LIMIT 1`)
      .get(studentId);
    if (assignment) return true;

    const completedCourse = db
      .prepare(
        `SELECT c.id
         FROM courses c
         WHERE c.is_coming_soon = 0
           AND (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) > 0
           AND (SELECT COUNT(*) FROM course_progress cp WHERE cp.course_id = c.id AND cp.student_id = ?) >= (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id)
         LIMIT 1`
      )
      .get(studentId);
    return Boolean(completedCourse);
  }

  // Helper: Compute Top Student Leaderboard & Top 5 / Winner eligibility
  function buildLeaderboard(nicheSlug?: string) {
    const students = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, p.city, p.grade_level, p.school_name
         FROM profiles p
         WHERE p.role = 'student' AND p.onboarding_complete = 1`
      )
      .all() as Array<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      city: string | null;
      grade_level: string | null;
      school_name: string | null;
    }>;

    const allAssignments = db
      .prepare(
        `SELECT ca.*, c.title as course_title, c.niche_slug
         FROM course_assignments ca
         JOIN courses c ON c.id = ca.course_id
         ORDER BY ca.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const allEntries = db
      .prepare(
        `SELECT ce.*, c.title as course_title, c.niche_slug
         FROM competition_entries ce
         JOIN courses c ON c.id = ce.course_id
         ORDER BY ce.score DESC, ce.created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const entries = students
      .map((s) => {
        const studentAssignments = allAssignments.filter(
          (a) => String(a.student_id) === s.id && (!nicheSlug || String(a.niche_slug) === nicheSlug)
        );
        const studentComps = allEntries.filter(
          (e) => String(e.student_id) === s.id && (!nicheSlug || String(e.niche_slug) === nicheSlug)
        );

        const completedCoursesRow = db
          .prepare(
            `SELECT COUNT(*) as c FROM courses c
             WHERE c.is_coming_soon = 0
               AND (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) > 0
               AND (SELECT COUNT(*) FROM course_progress cp WHERE cp.course_id = c.id AND cp.student_id = ?) >= (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id)`
          )
          .get(s.id) as { c: number };

        const bestCompScore = studentComps.reduce((max, e) => Math.max(max, Number(e.score) || 75), 0);
        const bestAssignScore = studentAssignments.reduce((max, a) => Math.max(max, Number(a.score) || 80), 0);
        const totalActivityBonus = Math.min(10, studentAssignments.length * 3 + studentComps.length * 2);
        const combinedScore =
          studentAssignments.length === 0 && studentComps.length === 0
            ? 0
            : Math.round(Math.max(bestCompScore, bestAssignScore) + (studentAssignments.length > 1 ? totalActivityBonus : 0));

        const topComp = studentComps[0];
        return {
          student_id: s.id,
          student_name: s.full_name,
          avatar_url: s.avatar_url,
          city: s.city,
          grade_level: s.grade_level,
          school_name: s.school_name,
          score: combinedScore,
          courses_completed: Math.max(completedCoursesRow.c, studentAssignments.length),
          assignments_count: studentAssignments.length,
          competition_count: studentComps.length,
          explicit_winner: studentComps.some((e) => e.status === 'winner' || Number(e.rank) === 1),
          explicit_top5: studentComps.some(
            (e) => e.status === 'winner' || e.status === 'top_5' || (e.rank !== null && e.rank !== undefined && Number(e.rank) <= 5)
          ),
          latest_pitch_title: topComp ? String(topComp.pitch_title) : null,
          latest_track: topComp ? String(topComp.niche_slug) : studentAssignments[0] ? String(studentAssignments[0].niche_slug) : null,
          assignments: studentAssignments,
        };
      })
      .filter((row) => row.assignments_count > 0 || row.competition_count > 0)
      .sort((a, b) => b.score - a.score || b.assignments_count - a.assignments_count);

    return entries.map((entry, idx) => {
      const rank = idx + 1;
      const isWinner = rank === 1 || entry.explicit_winner;
      const isTop5 = rank <= 5 || entry.explicit_top5;
      return {
        rank,
        student_id: entry.student_id,
        student_name: entry.student_name,
        avatar_url: entry.avatar_url,
        city: entry.city,
        grade_level: entry.grade_level,
        school_name: entry.school_name,
        score: entry.score,
        courses_completed: entry.courses_completed,
        assignments_count: entry.assignments_count,
        competition_count: entry.competition_count,
        is_winner: isWinner,
        is_top_5: isTop5,
        latest_pitch_title: entry.latest_pitch_title,
        latest_track: entry.latest_track,
        assignments: entry.assignments,
      };
    });
  }

  function isStudentTop5OrWinner(studentId: string): { unlocked: boolean; rank: number | null; is_winner: boolean } {
    const leaderboard = buildLeaderboard();
    const found = leaderboard.find((e) => e.student_id === studentId);
    if (found && (found.is_top_5 || found.is_winner)) {
      return { unlocked: true, rank: found.rank, is_winner: found.is_winner };
    }
    const dbRank = db
      .prepare(
        `SELECT rank, status FROM competition_entries
         WHERE student_id = ? AND (status IN ('winner', 'top_5') OR (rank IS NOT NULL AND rank <= 5))
         LIMIT 1`
      )
      .get(studentId) as { rank: number | null; status: string } | undefined;
    if (dbRank) {
      return {
        unlocked: true,
        rank: dbRank.rank || 1,
        is_winner: dbRank.status === 'winner' || dbRank.rank === 1,
      };
    }
    return { unlocked: false, rank: found?.rank || null, is_winner: false };
  }

  // LEADERBOARD & TOP STUDENT PORTFOLIO INSPECTION
  router.get('/leaderboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const nicheSlug = typeof req.query.niche === 'string' && req.query.niche.trim() ? req.query.niche.trim() : undefined;
    const entries = buildLeaderboard(nicheSlug);
    res.json({
      entries,
      cycle_month: getCurrentCycleMonth(),
      days_left_in_cycle: getDaysLeftInCycle(),
    });
  });

  // MENTOR FOLLOW & UPDATES (Accessible to free/unverified students!)
  router.post('/mentors/:id/follow', requireAuth, (req: AuthenticatedRequest, res) => {
    const mentorId = req.params.id;
    const target = db.prepare(`SELECT role FROM profiles WHERE id = ?`).get(mentorId) as { role: string } | undefined;
    if (!target || target.role !== 'mentor') {
      res.status(404).json({ error: 'Mentor not found.' });
      return;
    }
    db.prepare(`INSERT OR IGNORE INTO mentor_follows (mentor_id, student_id, created_at) VALUES (?, ?, ?)`).run(
      mentorId,
      req.userId!,
      new Date().toISOString()
    );
    const count = (
      db.prepare(`SELECT COUNT(*) as c FROM mentor_follows WHERE mentor_id = ?`).get(mentorId) as { c: number }
    ).c;
    res.json({ ok: true, is_following: true, followers_count: count });
  });

  router.delete('/mentors/:id/follow', requireAuth, (req: AuthenticatedRequest, res) => {
    const mentorId = req.params.id;
    db.prepare(`DELETE FROM mentor_follows WHERE mentor_id = ? AND student_id = ?`).run(mentorId, req.userId!);
    const count = (
      db.prepare(`SELECT COUNT(*) as c FROM mentor_follows WHERE mentor_id = ?`).get(mentorId) as { c: number }
    ).c;
    res.json({ ok: true, is_following: false, followers_count: count });
  });

  router.post('/mentors/updates', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only verified mentors can publish mentor updates and masterclasses.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
      | { status: string }
      | undefined;
    if (!md || md.status !== 'approved') {
      res.status(403).json({
        error:
          'Your mentor verification (within 48 hours) is still in progress. You can browse the Top Student Leaderboard while our team completes review.',
      });
      return;
    }

    const { kind, title, body, media_url, event_at } = req.body || {};
    if (!['update', 'masterclass', 'cohort'].includes(kind) || !title || !body) {
      res.status(400).json({ error: 'Update type, title, and message body are required.' });
      return;
    }
    const id = uuid();
    db.prepare(
      `INSERT INTO mentor_updates (id, mentor_id, kind, title, body, media_url, event_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.userId!,
      kind,
      String(title).trim(),
      String(body).trim(),
      media_url ? String(media_url).trim() : null,
      event_at ? String(event_at).trim() : null,
      new Date().toISOString()
    );
    res.status(201).json({ ok: true, id });
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
      .map((m) => {
        const mentorId = String(m.id);
        const monthlyUsed = getMentorMonthlyConnectionsUsed(mentorId);
        const isFollowing = req.userId
          ? Boolean(
              db
                .prepare(`SELECT 1 FROM mentor_follows WHERE mentor_id = ? AND student_id = ?`)
                .get(mentorId, req.userId)
            )
          : false;
        return {
          ...hydrateProfile(m),
          ...hydrateMentor(m),
          monthly_connections_used: monthlyUsed,
          monthly_connections_limit: MENTOR_MONTHLY_CONNECTION_LIMIT,
          is_following: isFollowing,
        };
      })
      .filter((m: Record<string, unknown>) => {
        if (niche && !(m.niches as string[]).includes(niche)) return false;
        if (city && String(m.city || '').toLowerCase() !== city.toLowerCase()) return false;
        if (q) {
          const hay = `${m.full_name} ${m.profession} ${m.company || ''} ${m.bio || ''} ${m.city || ''} ${(m.topics as string[]).join(' ')}`.toLowerCase();
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
           WHERE m.student_id = ? AND m.status = 'booked' AND m.type = 'one_on_one'
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

      const cycleMonth = getCurrentCycleMonth();
      const cycleEndsAt = getCycleEndIso();
      const coursesSummary = db
        .prepare(
          `SELECT c.id, c.niche_slug, c.title, c.duration_label, c.is_coming_soon, c.competition_title,
                  c.competition_brief, c.meetup_venue, c.meetup_date_label,
                  (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count,
                  (SELECT COUNT(*) FROM course_progress cp WHERE cp.course_id = c.id AND cp.student_id = ?) as completed_count,
                  (SELECT COUNT(*) FROM competition_entries ce2 WHERE ce2.course_id = c.id AND ce2.cycle_month = ?) as cohort_count,
                  EXISTS(SELECT 1 FROM competition_entries ce WHERE ce.course_id = c.id AND ce.student_id = ? AND ce.cycle_month = ?) as has_entered_competition,
                  EXISTS(SELECT 1 FROM course_assignments ca WHERE ca.course_id = c.id AND ca.student_id = ?) as has_submitted_assignment
           FROM courses c
           WHERE c.is_coming_soon = 0
           ORDER BY c.created_at ASC`
        )
        .all(req.userId!, cycleMonth, req.userId!, cycleMonth, req.userId!)
        .map((c: unknown) => {
          const row = c as Record<string, unknown>;
          return {
            ...row,
            is_coming_soon: Boolean(row.is_coming_soon),
            has_entered_competition: Boolean(row.has_entered_competition),
            has_submitted_assignment: Boolean(row.has_submitted_assignment),
          };
        });

      const messagingUnlocked = hasStudentUnlockedMessaging(req.userId!);
      const oneOnOneStatus = isStudentTop5OrWinner(req.userId!);

      const followedUpdates = db
        .prepare(
          `SELECT mu.*, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession as mentor_profession, md.company as mentor_company
           FROM mentor_updates mu
           JOIN mentor_follows mf ON mf.mentor_id = mu.mentor_id
           JOIN profiles p ON p.id = mu.mentor_id
           LEFT JOIN mentor_details md ON md.profile_id = p.id
           WHERE mf.student_id = ?
           ORDER BY mu.created_at DESC
           LIMIT 8`
        )
        .all(req.userId!);

      const upcomingGroupQAs = db
        .prepare(
          `SELECT m.id, m.topic, m.meet_url, m.group_id, g.name as group_name,
                  a.start_at, a.end_at, p.id as mentor_id, p.full_name as mentor_name, md.profession as mentor_profession,
                  (SELECT COUNT(*) FROM group_seminar_rsvps r WHERE r.meeting_id = m.id) as rsvp_count,
                  EXISTS(SELECT 1 FROM group_seminar_rsvps r2 WHERE r2.meeting_id = m.id AND r2.student_id = ?) as has_rsvped
           FROM meetings m
           LEFT JOIN availability a ON a.id = m.slot_id
           LEFT JOIN groups g ON g.id = m.group_id
           JOIN profiles p ON p.id = m.mentor_id
           LEFT JOIN mentor_details md ON md.profile_id = p.id
           WHERE m.type = 'group_seminar' AND m.status = 'booked'
           ORDER BY COALESCE(a.start_at, m.created_at) ASC
           LIMIT 6`
        )
        .all(req.userId!)
        .map((row: unknown) => {
          const r = row as Record<string, unknown>;
          return { ...r, has_rsvped: Boolean(r.has_rsvped) };
        });

      const myAssignments = db
        .prepare(
          `SELECT ca.*, c.title as course_title, c.niche_slug
           FROM course_assignments ca
           JOIN courses c ON c.id = ca.course_id
           WHERE ca.student_id = ?
           ORDER BY ca.created_at DESC`
        )
        .all(req.userId!);

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
        cycle_month: cycleMonth,
        cycle_ends_at: cycleEndsAt,
        active_courses: coursesSummary,
        messaging_unlocked: messagingUnlocked,
        one_on_one_unlocked: oneOnOneStatus.unlocked,
        leaderboard_rank: oneOnOneStatus.rank,
        is_competition_winner: oneOnOneStatus.is_winner,
        followed_updates: followedUpdates,
        upcoming_group_qas: upcomingGroupQAs,
        my_assignments: myAssignments,
      });
      return;
    }

    if (profile.role === 'mentor') {
      const mentorRow = db.prepare(`SELECT * FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as Record<
        string,
        unknown
      >;
      const monthlyUsed = getMentorMonthlyConnectionsUsed(req.userId!);
      const mentorDetails = {
        ...hydrateMentor(mentorRow),
        monthly_connections_used: monthlyUsed,
        monthly_connections_limit: MENTOR_MONTHLY_CONNECTION_LIMIT,
      };

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
           WHERE m.mentor_id = ? AND m.status = 'booked' AND m.type = 'one_on_one'
           ORDER BY a.start_at ASC`
        )
        .all(req.userId!);

      const myGroups = db
        .prepare(
          `SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as members_count
           FROM groups g WHERE g.mentor_id = ?`
        )
        .all(req.userId!);

      const topLeaderboard = buildLeaderboard().slice(0, 6);
      const myUpdates = db
        .prepare(`SELECT * FROM mentor_updates WHERE mentor_id = ? ORDER BY created_at DESC LIMIT 6`)
        .all(req.userId!);

      res.json({
        role: 'mentor',
        mentor_details: mentorDetails,
        pending_requests: pendingWithTimer,
        upcoming_sessions: upcomingSessions,
        my_groups: myGroups,
        leaderboard_preview: topLeaderboard,
        my_updates: myUpdates,
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
        ? (db
            .prepare(
              `SELECT md.*, COALESCE(pp.linkedin_verified, 0) as linkedin_verified
               FROM mentor_details md
               LEFT JOIN professional_profiles pp ON pp.profile_id = md.profile_id
               WHERE md.profile_id = ?`
            )
            .get(targetId) as Record<string, unknown> | undefined)
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

    const assignments = db
      .prepare(
        `SELECT ca.*, c.title as course_title, c.niche_slug
         FROM course_assignments ca
         JOIN courses c ON c.id = ca.course_id
         WHERE ca.student_id = ?
         ORDER BY ca.created_at DESC`
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
    let isFollowing = false;
    let followersCount = 0;
    let mentorUpdates: Record<string, unknown>[] = [];
    let mentorSeminars: Record<string, unknown>[] = [];
    let viewerGates = {
      messaging_unlocked: true,
      one_on_one_unlocked: true,
      leaderboard_rank: null as number | null,
      is_winner: false,
    };

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
      isFollowing = Boolean(
        db.prepare(`SELECT 1 FROM mentor_follows WHERE mentor_id = ? AND student_id = ?`).get(targetId, req.userId)
      );
      if (req.userRole === 'student') {
        const oneOnOne = isStudentTop5OrWinner(req.userId);
        viewerGates = {
          messaging_unlocked: hasStudentUnlockedMessaging(req.userId),
          one_on_one_unlocked: oneOnOne.unlocked,
          leaderboard_rank: oneOnOne.rank,
          is_winner: oneOnOne.is_winner,
        };
      }
    }

    if (profile.role === 'mentor') {
      openSlots = db
        .prepare(
          `SELECT * FROM availability WHERE mentor_id = ? AND is_booked = 0 AND start_at > ? ORDER BY start_at ASC`
        )
        .all(targetId, new Date().toISOString()) as Record<string, unknown>[];
      followersCount = (
        db.prepare(`SELECT COUNT(*) as c FROM mentor_follows WHERE mentor_id = ?`).get(targetId) as { c: number }
      ).c;
      mentorUpdates = db
        .prepare(`SELECT * FROM mentor_updates WHERE mentor_id = ? ORDER BY created_at DESC`)
        .all(targetId) as Record<string, unknown>[];
      mentorSeminars = db
        .prepare(
          `SELECT m.id, m.topic, m.meet_url, m.group_id, g.name as group_name, a.start_at, a.end_at,
                  (SELECT COUNT(*) FROM group_seminar_rsvps r WHERE r.meeting_id = m.id) as rsvp_count
           FROM meetings m
           LEFT JOIN availability a ON a.id = m.slot_id
           LEFT JOIN groups g ON g.id = m.group_id
           WHERE m.mentor_id = ? AND m.type = 'group_seminar' AND m.status = 'booked'
           ORDER BY COALESCE(a.start_at, m.created_at) ASC`
        )
        .all(targetId) as Record<string, unknown>[];
    }

    const mentorHydrated = hydrateMentor(mentorRow);
    const enrichedMentorDetails = mentorHydrated
      ? {
          ...mentorHydrated,
          monthly_connections_used: getMentorMonthlyConnectionsUsed(targetId),
          monthly_connections_limit: MENTOR_MONTHLY_CONNECTION_LIMIT,
        }
      : null;

    const studentRankInfo = profile.role === 'student' ? isStudentTop5OrWinner(targetId) : null;

    res.json({
      profile,
      mentor_details: enrichedMentorDetails,
      badges,
      certificates,
      assignments,
      student_rank_info: studentRankInfo,
      sessions_attended: sessionsAttended,
      connection,
      is_blocked_by_me: isBlockedByMe,
      is_blocked: isBlockedAny,
      open_slots: openSlots,
      is_following: isFollowing,
      followers_count: followersCount,
      mentor_updates: mentorUpdates,
      mentor_seminars: mentorSeminars,
      viewer_gates: viewerGates,
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
    const { receiver_id, message, track_context, specific_goal, focused_question } = req.body || {};
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

    // Compose structured note from either structured fields or free-form message
    const composedStructuredMessage = [
      track_context ? `Course Track: ${String(track_context).trim()}` : '',
      specific_goal ? `Goal: ${String(specific_goal).trim()}` : '',
      focused_question ? `Question: ${String(focused_question).trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    const rawNote = composedStructuredMessage || String(message || '').trim();

    if (receiver.role === 'mentor') {
      const md = db
        .prepare(`SELECT status, is_demo, auto_welcome_message FROM mentor_details WHERE profile_id = ?`)
        .get(receiver.id) as
        | { status: string; is_demo: number; auto_welcome_message: string | null }
        | undefined;
      if (!md || md.status !== 'approved') {
        res.status(403).json({
          error: 'This mentor is completing their 48-hour verification review. You can connect once verified.',
        });
        return;
      }

      if (req.userRole === 'student') {
        // Gate 1: Must complete at least one course & submit assignment before sending 1 structured message
        if (!hasStudentUnlockedMessaging(req.userId!)) {
          res.status(403).json({
            code: 'COURSE_REQUIRED',
            error:
              'Complete a career course first to unlock sending 1 structured message to mentors. Meanwhile you can follow mentor updates, watch masterclasses, and attend monthly Group Q&A sessions!',
          });
          return;
        }

        // Gate 2: Reject vague/spam requests ("hi sir", "pls give internship", too short)
        const normalizedLower = rawNote.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
        const bannedShortPhrases = [
          'hi',
          'hi sir',
          'hello',
          'hello sir',
          'hey',
          'pls give me internship',
          'please give me internship',
          'internship please',
          'need job',
          'need internship',
        ];
        if (rawNote.length < 25 || bannedShortPhrases.includes(normalizedLower)) {
          res.status(400).json({
            code: 'STRUCTURED_MESSAGE_REQUIRED',
            error:
              'To prevent inbox flooding, please write a specific structured intro (your completed course track, career goal, and focused question — at least 25 characters).',
          });
          return;
        }

        // Gate 3: 30 students/month cap per mentor
        const monthlyUsed = getMentorMonthlyConnectionsUsed(receiver.id);
        if (monthlyUsed >= MENTOR_MONTHLY_CONNECTION_LIMIT) {
          res.status(429).json({
            code: 'MENTOR_MONTHLY_CAP',
            error: `This mentor has reached their ${MENTOR_MONTHLY_CONNECTION_LIMIT}-student monthly connection limit for this month. Follow their updates or join a Group Q&A instead.`,
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
    const { masked } = maskContactDetails(rawNote);
    const nowIso = new Date().toISOString();

    if (receiver.role === 'mentor') {
      const studentProfile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(req.userId!) as
        | { full_name: string }
        | undefined;
      const mentorRow = db
        .prepare(
          `SELECT p.full_name, md.profession, md.company, md.talk_url, md.niches, md.is_demo, md.auto_welcome_message
           FROM profiles p
           JOIN mentor_details md ON md.profile_id = p.id
           WHERE p.id = ?`
        )
        .get(receiver.id) as
        | {
            full_name: string;
            profession: string;
            company: string | null;
            talk_url: string | null;
            niches: string;
            is_demo: number;
            auto_welcome_message: string | null;
          }
        | undefined;

      // Showcase TEDx speaker mentors (is_demo = 1) auto-accept after structured course check and deliver their 1 automated welcome note.
      // Real mentors (including mentor@demo.com, is_demo = 0) hold as 'pending' with the student's 1 structured message until mentor clicks Accept!
      if (mentorRow?.is_demo) {
        const welcomeBody =
          mentorRow.auto_welcome_message?.trim() ||
          generateMentorBotReply({
            studentName: studentProfile?.full_name || 'Student',
            studentMessage: masked,
            mentorName: mentorRow.full_name,
            profession: mentorRow.profession || 'Industry Mentor',
            company: mentorRow.company || null,
            talkUrl: mentorRow.talk_url || null,
            niches: parseJsonArray<string>(mentorRow.niches),
          });

        const msgId = uuid();
        const replyAt = new Date(Date.now() + 500).toISOString();

        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'accepted', ?, ?, ?)`
          ).run(connId, req.userId!, receiver_id, masked || null, nowIso, nowIso);

          if (masked) {
            db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
              uuid(),
              connId,
              req.userId!,
              masked,
              nowIso
            );
          }

          db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
            msgId,
            connId,
            receiver.id,
            welcomeBody,
            replyAt
          );
        });
        tx();

        const botMsgPayload = {
          id: msgId,
          connection_id: connId,
          sender_id: receiver.id,
          body: welcomeBody,
          created_at: replyAt,
        };
        emitToUsers([String(req.userId!), String(receiver_id)], 'connection_updated', { id: connId, status: 'accepted' });
        emitToUsers([String(req.userId!), String(receiver_id)], 'new_message', botMsgPayload);

        res.status(201).json({
          ok: true,
          id: connId,
          status: 'accepted',
          auto_accepted: true,
          bot_reply: welcomeBody,
        });
        return;
      }

      // Real mentor: store the student's 1 structured message in pending state until mentor accepts
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)`
        ).run(connId, req.userId!, receiver_id, masked || null, nowIso);

        if (masked) {
          db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
            uuid(),
            connId,
            req.userId!,
            masked,
            nowIso
          );
        }
      });
      tx();

      emitToUsers([String(receiver_id)], 'connection_updated', { id: connId, status: 'pending' });
      res.status(201).json({
        ok: true,
        id: connId,
        status: 'pending',
        auto_accepted: false,
      });
      return;
    }

    // Student-to-student peer connection
    db.prepare(
      `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)`
    ).run(connId, req.userId!, receiver_id, masked || null, nowIso);

    emitToUsers([String(receiver_id)], 'connection_updated', { id: connId });
    res.status(201).json({ ok: true, id: connId, status: 'pending', auto_accepted: false });
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

    let welcomeNoteSent: string | null = null;

    if (req.userRole === 'mentor') {
      const md = db
        .prepare(`SELECT status, auto_welcome_message, profession, company, talk_url, niches FROM mentor_details WHERE profile_id = ?`)
        .get(req.userId!) as
        | {
            status: string;
            auto_welcome_message: string | null;
            profession: string;
            company: string | null;
            talk_url: string | null;
            niches: string;
          }
        | undefined;
      if (!md || md.status !== 'approved') {
        res.status(403).json({
          error: 'Your mentor profile is within the 48-hour verification window and cannot accept requests yet.',
        });
        return;
      }

      if (status === 'accepted') {
        const used = getMentorMonthlyConnectionsUsed(req.userId!);
        if (used >= MENTOR_MONTHLY_CONNECTION_LIMIT) {
          res.status(429).json({
            code: 'MENTOR_MONTHLY_CAP',
            error: `You have reached your ${MENTOR_MONTHLY_CONNECTION_LIMIT} student connections limit for this month.`,
          });
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const tx = db.transaction(() => {
        db.prepare(`UPDATE connections SET status = ?, responded_at = ? WHERE id = ?`).run(status, nowIso, conn.id);

        if (status === 'accepted') {
          const mentorProfile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(req.userId!) as
            | { full_name: string }
            | undefined;
          const studentProfile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(conn.requester_id) as
            | { full_name: string }
            | undefined;

          // Ensure requester's structured note exists in messages if it wasn't inserted already
          const hasInitialMsg = db
            .prepare(`SELECT 1 FROM messages WHERE connection_id = ? LIMIT 1`)
            .get(conn.id);
          if (!hasInitialMsg && conn.message) {
            db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
              uuid(),
              conn.id,
              conn.requester_id,
              String(conn.message),
              String(conn.created_at || nowIso)
            );
          }

          welcomeNoteSent =
            md.auto_welcome_message?.trim() ||
            generateMentorBotReply({
              studentName: studentProfile?.full_name || 'Student',
              studentMessage: String(conn.message || ''),
              mentorName: mentorProfile?.full_name || 'Mentor',
              profession: md.profession || 'Industry Mentor',
              company: md.company || null,
              talkUrl: md.talk_url || null,
              niches: parseJsonArray<string>(md.niches),
            });

          const welcomeId = uuid();
          const welcomeAt = new Date(Date.now() + 300).toISOString();
          db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
            welcomeId,
            conn.id,
            req.userId!,
            welcomeNoteSent,
            welcomeAt
          );

          emitToUsers([String(conn.requester_id), String(conn.receiver_id)], 'new_message', {
            id: welcomeId,
            connection_id: conn.id,
            sender_id: req.userId!,
            body: welcomeNoteSent,
            created_at: welcomeAt,
          });
        }
      });
      tx();

      recalculateMentorReplyHours(db, req.userId!);
      emitToUsers([String(conn.requester_id), String(conn.receiver_id)], 'connection_updated', {
        id: conn.id,
        status,
      });
      res.json({ ok: true, status, welcome_message: welcomeNoteSent });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE connections SET status = ?, responded_at = ? WHERE id = ?`).run(status, nowIso, conn.id);

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

    const mentorMessagingLocked = false;

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
      res.status(404).json({ error: 'Open chat unlocks once the mentor accepts your structured connection request.' });
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

    let botReplyMessage: {
      id: string;
      connection_id: unknown;
      sender_id: string;
      body: string;
      created_at: string;
    } | null = null;

    if (req.userRole === 'student' && peer.role === 'mentor') {
      const mentorRow = db
        .prepare(
          `SELECT p.full_name, md.profession, md.company, md.talk_url, md.niches, md.is_demo
           FROM profiles p
           LEFT JOIN mentor_details md ON md.profile_id = p.id
           WHERE p.id = ?`
        )
        .get(peerId) as
        | {
            full_name: string;
            profession: string;
            company: string | null;
            talk_url: string | null;
            niches: string;
            is_demo: number;
          }
        | undefined;

      // Showcase TEDx speaker mentors reply immediately so demo chats feel responsive;
      // real mentors (is_demo = 0) hold genuine 2-way human threads.
      if (mentorRow?.is_demo) {
        const studentProfile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(req.userId!) as
          | { full_name: string }
          | undefined;
        const replyBody = generateMentorFollowupReply({
          studentName: studentProfile?.full_name || 'Student',
          studentMessage: masked,
          mentorName: mentorRow.full_name,
          profession: mentorRow.profession || 'Mentor',
          company: mentorRow.company || null,
          talkUrl: mentorRow.talk_url || null,
          niches: parseJsonArray<string>(mentorRow.niches),
        });
        const replyId = uuid();
        const replyCreatedAt = new Date(Date.now() + 400).toISOString();

        db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
          replyId,
          conn.id,
          peerId,
          replyBody,
          replyCreatedAt
        );

        botReplyMessage = {
          id: replyId,
          connection_id: conn.id,
          sender_id: peerId,
          body: replyBody,
          created_at: replyCreatedAt,
        };
        emitToUsers([String(conn.requester_id), String(conn.receiver_id)], 'new_message', botReplyMessage);
      }
    }

    res.status(201).json({ message: savedMessage, bot_reply: botReplyMessage, was_masked: wasMasked });
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

    const seminars = db
      .prepare(
        `SELECT m.id, m.mentor_id, m.group_id, m.topic, m.meet_url, m.status, m.created_at,
                a.start_at, a.end_at, p.full_name as mentor_name, p.avatar_url as mentor_avatar, md.profession as mentor_profession,
                (SELECT COUNT(*) FROM group_seminar_rsvps r WHERE r.meeting_id = m.id) as rsvp_count,
                EXISTS(SELECT 1 FROM group_seminar_rsvps r2 WHERE r2.meeting_id = m.id AND r2.student_id = ?) as has_rsvped
         FROM meetings m
         LEFT JOIN availability a ON a.id = m.slot_id
         JOIN profiles p ON p.id = m.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         WHERE m.group_id = ? AND m.type = 'group_seminar' AND m.status = 'booked'
         ORDER BY COALESCE(a.start_at, m.created_at) ASC`
      )
      .all(req.userId!, group.id)
      .map((s: unknown) => {
        const row = s as Record<string, unknown>;
        return { ...row, has_rsvped: Boolean(row.has_rsvped) };
      });

    res.json({
      group: { ...group, is_member: isMember },
      posts: posts.map((p) => ({
        ...p,
        is_question: Boolean(p.is_question),
        is_mentor_answer: String(p.author_id) === String(group.mentor_id),
      })),
      seminars,
    });
  });

  // Schedule a Monthly Group Q&A Session (Approved Mentors)
  router.post('/groups/:id/seminars', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only verified mentors can host monthly Group Q&A sessions.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
      | { status: string }
      | undefined;
    if (!md || md.status !== 'approved') {
      res.status(403).json({
        error: 'Group Q&A hosting unlocks once your 48-hour mentor verification is approved.',
      });
      return;
    }

    const group = db.prepare(`SELECT id, name FROM groups WHERE id = ?`).get(req.params.id) as
      | { id: string; name: string }
      | undefined;
    if (!group) {
      res.status(404).json({ error: 'Group not found.' });
      return;
    }

    const { topic, start_at, duration_minutes } = req.body || {};
    if (!topic || !String(topic).trim() || !start_at) {
      res.status(400).json({ error: 'Q&A topic and PKT date/time are required.' });
      return;
    }
    const startDate = new Date(start_at);
    if (Number.isNaN(startDate.getTime())) {
      res.status(400).json({ error: 'Invalid date/time.' });
      return;
    }
    const mins = [30, 45, 60].includes(Number(duration_minutes)) ? Number(duration_minutes) : 60;
    const endDate = new Date(startDate.getTime() + mins * 60 * 1000);

    const meetingId = uuid();
    const slotId = uuid();
    const meetUrl = `https://meet.google.com/out-${meetingId.replace(/-/g, '').slice(0, 4)}-${meetingId.replace(/-/g, '').slice(4, 7)}`;

    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 1)`).run(
        slotId,
        req.userId!,
        startDate.toISOString(),
        endDate.toISOString()
      );
      db.prepare(
        `INSERT INTO meetings (id, mentor_id, student_id, slot_id, type, group_id, topic, meet_url, status, created_at)
         VALUES (?, ?, ?, ?, 'group_seminar', ?, ?, ?, 'booked', ?)`
      ).run(
        meetingId,
        req.userId!,
        req.userId!,
        slotId,
        group.id,
        String(topic).trim(),
        meetUrl,
        new Date().toISOString()
      );
    });
    tx();

    res.status(201).json({ ok: true, id: meetingId, meet_url: meetUrl, start_at: startDate.toISOString() });
  });

  // Student RSVP for Monthly Group Q&A
  router.post('/groups/seminars/:meetingId/rsvp', requireAuth, (req: AuthenticatedRequest, res) => {
    const meeting = db
      .prepare(`SELECT id, type FROM meetings WHERE id = ? AND type = 'group_seminar'`)
      .get(req.params.meetingId);
    if (!meeting) {
      res.status(404).json({ error: 'Group Q&A session not found.' });
      return;
    }

    const existing = db
      .prepare(`SELECT 1 FROM group_seminar_rsvps WHERE meeting_id = ? AND student_id = ?`)
      .get(req.params.meetingId, req.userId!);
    if (existing) {
      db.prepare(`DELETE FROM group_seminar_rsvps WHERE meeting_id = ? AND student_id = ?`).run(
        req.params.meetingId,
        req.userId!
      );
    } else {
      db.prepare(`INSERT INTO group_seminar_rsvps (meeting_id, student_id, created_at) VALUES (?, ?, ?)`).run(
        req.params.meetingId,
        req.userId!,
        new Date().toISOString()
      );
      const rsvpTotal = (
        db.prepare(`SELECT COUNT(*) as c FROM group_seminar_rsvps WHERE student_id = ?`).get(req.userId!) as {
          c: number;
        }
      ).c;
      if (rsvpTotal >= 5) {
        awardBadge(db, req.userId!, 'seminar_5', 'Seminar Regular');
      }
    }

    const count = (
      db.prepare(`SELECT COUNT(*) as c FROM group_seminar_rsvps WHERE meeting_id = ?`).get(req.params.meetingId) as {
        c: number;
      }
    ).c;
    res.json({ ok: true, has_rsvped: !existing, rsvp_count: count });
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

    const groupQAs = db
      .prepare(
        `SELECT m.id, m.mentor_id, m.group_id, g.name as group_name, m.topic, m.meet_url, m.status, m.created_at,
                a.start_at, a.end_at, p.full_name as mentor_name, md.profession as mentor_profession,
                (SELECT COUNT(*) FROM group_seminar_rsvps r WHERE r.meeting_id = m.id) as rsvp_count,
                EXISTS(SELECT 1 FROM group_seminar_rsvps r2 WHERE r2.meeting_id = m.id AND r2.student_id = ?) as has_rsvped
         FROM meetings m
         LEFT JOIN availability a ON a.id = m.slot_id
         LEFT JOIN groups g ON g.id = m.group_id
         JOIN profiles p ON p.id = m.mentor_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         WHERE m.type = 'group_seminar' AND m.status = 'booked'
         ORDER BY COALESCE(a.start_at, m.created_at) ASC`
      )
      .all(req.userId!)
      .map((s: unknown) => {
        const row = s as Record<string, unknown>;
        return { ...row, has_rsvped: Boolean(row.has_rsvped) };
      });

    if (req.userRole === 'mentor') {
      const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
        | { status: string }
        | undefined;
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
           WHERE m.mentor_id = ? AND m.type = 'one_on_one'
           ORDER BY COALESCE(a.start_at, m.created_at) DESC`
        )
        .all(req.userId!);
      res.json({ role: 'mentor', mentor_status: md?.status || 'pending', slots, meetings, group_qas: groupQAs });
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
         WHERE m.student_id = ? AND m.type = 'one_on_one'
         ORDER BY COALESCE(a.start_at, m.created_at) DESC`
      )
      .all(req.userId!);

    const oneOnOneStatus = isStudentTop5OrWinner(req.userId!);

    // Approved mentors with open slots (connected mentors first, all approved mentors available when Top 5 / Winner unlocked)
    const connectedMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.avatar_url, md.profession, md.company, md.avg_reply_hours
         FROM profiles p
         JOIN mentor_details md ON md.profile_id = p.id
         WHERE md.status = 'approved' AND p.role = 'mentor'
         ORDER BY COALESCE(md.avg_reply_hours, 999) ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const nowIso = new Date().toISOString();
    const bookableMentors = connectedMentors
      .map((m) => ({
        ...m,
        open_slots: db
          .prepare(`SELECT * FROM availability WHERE mentor_id = ? AND is_booked = 0 AND start_at > ? ORDER BY start_at ASC`)
          .all(m.id, nowIso),
      }))
      .filter((m) => m.open_slots.length > 0);

    res.json({
      role: 'student',
      subscription,
      meetings,
      connected_mentors: bookableMentors,
      one_on_one_unlocked: oneOnOneStatus.unlocked,
      leaderboard_rank: oneOnOneStatus.rank,
      is_competition_winner: oneOnOneStatus.is_winner,
      group_qas: groupQAs,
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
      res.status(403).json({ error: '1:1 slots unlock once your 48-hour mentor verification is complete.' });
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

    // 1:1 Meeting Gate: Competition Winner or Top 5 placement required
    const eligibility = isStudentTop5OrWinner(req.userId!);
    if (!eligibility.unlocked) {
      res.status(403).json({
        code: 'TOP_5_REQUIRED',
        error:
          '1:1 Mentor Meetings unlock when you win a Monthly Competition or place in the Top 5 on the Student Leaderboard. You can still attend free Monthly Group Q&A sessions!',
      });
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

      db.prepare(`UPDATE availability SET is_booked = 1 WHERE id = ?`).run(slot.id);
      const meetingId = uuid();
      const shortA = meetingId.replace(/-/g, '').slice(0, 4);
      const shortB = meetingId.replace(/-/g, '').slice(4, 7);
      const meetUrl = `https://meet.google.com/out-${shortA}-${shortB}`;
      const topicStr = String(topic || '1:1 Career Mentorship Session').trim();

      const mentorProfile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(slot.mentor_id) as
        | { full_name: string }
        | undefined;

      db.prepare(
        `INSERT INTO meetings (id, mentor_id, student_id, slot_id, type, group_id, topic, meet_url, status, created_at)
         VALUES (?, ?, ?, ?, 'one_on_one', NULL, ?, ?, 'booked', ?)`
      ).run(
        meetingId,
        slot.mentor_id,
        req.userId!,
        slot.id,
        topicStr,
        meetUrl,
        new Date().toISOString()
      );

      return {
        ok: true,
        id: meetingId,
        status: 'confirmed',
        meet_url: meetUrl,
        start_at: slot.start_at,
        end_at: slot.end_at,
        mentor_name: mentorProfile?.full_name || 'Mentor',
        topic: topicStr,
      };
    });

    const result = tx() as {
      error?: string;
      status?: number | string;
      code?: string;
      ok?: boolean;
      id?: string;
      meet_url?: string;
      start_at?: string;
      end_at?: string;
      mentor_name?: string;
      topic?: string;
    };
    if (result.error) {
      res.status(Number(result.status) || 400).json({ error: result.error, code: result.code });
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

  // COURSES, POST-COURSE ASSIGNMENTS & MONTHLY COMPETITIONS
  router.get('/courses', requireAuth, (req: AuthenticatedRequest, res) => {
    const cycleMonth = getCurrentCycleMonth();
    const rows = db
      .prepare(
        `SELECT c.*, n.name as niche_name, p.full_name as author_name, p.avatar_url as author_avatar,
                (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = c.id) as module_count,
                (SELECT COUNT(*) FROM course_progress cp WHERE cp.course_id = c.id AND cp.student_id = ?) as completed_count,
                (SELECT COUNT(*) FROM competition_entries ce WHERE ce.course_id = c.id AND ce.cycle_month = ?) as cohort_count,
                EXISTS(SELECT 1 FROM competition_entries ce2 WHERE ce2.course_id = c.id AND ce2.student_id = ? AND ce2.cycle_month = ?) as has_entered_competition,
                EXISTS(SELECT 1 FROM course_assignments ca WHERE ca.course_id = c.id AND ca.student_id = ?) as has_submitted_assignment
         FROM courses c
         LEFT JOIN niches n ON n.slug = c.niche_slug
         LEFT JOIN profiles p ON p.id = c.author_id
         ORDER BY c.is_coming_soon ASC, c.title ASC`
      )
      .all(req.userId!, cycleMonth, req.userId!, cycleMonth, req.userId!) as Array<Record<string, unknown>>;

    const courses = rows.map((r) => ({
      ...r,
      is_coming_soon: Boolean(r.is_coming_soon),
      has_entered_competition: Boolean(r.has_entered_competition),
      has_submitted_assignment: Boolean(r.has_submitted_assignment),
      is_active_track: isActiveTrackSlug(String(r.niche_slug || '')),
    }));

    const mentorStatusRow =
      req.userRole === 'mentor'
        ? (db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
            | { status: string }
            | undefined)
        : undefined;

    res.json({
      courses,
      cycle_month: cycleMonth,
      days_left_in_cycle: getDaysLeftInCycle(),
      mentor_status: mentorStatusRow?.status || null,
    });
  });

  // Verified mentors can publish/record a new track course (locked during 48h verification!)
  router.post('/courses', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only verified mentors can record and publish courses.' });
      return;
    }
    const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
      | { status: string }
      | undefined;
    if (!md || md.status !== 'approved') {
      res.status(403).json({
        error:
          'Recording and publishing courses is locked while your account is in the 48-hour verification window.',
      });
      return;
    }

    const { title, subtitle, niche_slug, description, video_url, module_title } = req.body || {};
    if (!title || !niche_slug || !description) {
      res.status(400).json({ error: 'Course title, track niche, and description are required.' });
      return;
    }

    const profile = db.prepare(`SELECT full_name FROM profiles WHERE id = ?`).get(req.userId!) as { full_name: string };
    const mentorMeta = db
      .prepare(`SELECT profession, company FROM mentor_details WHERE profile_id = ?`)
      .get(req.userId!) as { profession: string; company: string | null };

    const courseId = uuid();
    const modId = uuid();
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO courses (id, niche_slug, author_id, title, subtitle, description, duration_label, is_coming_soon, competition_title, competition_brief, meetup_title, meetup_venue, meetup_date_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '18 min · 1 module', 0, ?, ?, ?, 'Karachi / Lahore / Online Live', 'Last Saturday of the Month', ?)`
      ).run(
        courseId,
        String(niche_slug),
        req.userId!,
        String(title).trim(),
        subtitle ? String(subtitle).trim() : `${String(title).trim()} — Mentor-Led Track`,
        String(description).trim(),
        `${String(title).trim()} Monthly Challenge`,
        'Submit a 2-minute video or presentation pitch applying this track to a real Pakistani problem.',
        `${String(title).trim()} Live Showcase`,
        nowIso
      );

      db.prepare(
        `INSERT INTO course_modules (id, course_id, position, title, speaker_name, speaker_role, duration_seconds, video_url, summary, key_takeaways)
         VALUES (?, ?, 1, ?, ?, ?, 900, ?, ?, ?)`
      ).run(
        modId,
        courseId,
        module_title ? String(module_title).trim() : `${String(title).trim()} — Masterclass Lesson`,
        profile.full_name,
        `${mentorMeta.profession}${mentorMeta.company ? ` @ ${mentorMeta.company}` : ''}`,
        video_url ? String(video_url).trim() : null,
        String(description).trim(),
        JSON.stringify(['Core career reality in Pakistan', 'Hands-on mini assignment rubric', 'How to stand out in top 5'])
      );
    });
    tx();

    res.status(201).json({ ok: true, id: courseId });
  });

  router.get('/courses/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const course = db
      .prepare(
        `SELECT c.*, n.name as niche_name, p.full_name as author_name, p.avatar_url as author_avatar,
                md.profession as author_profession, md.company as author_company
         FROM courses c
         LEFT JOIN niches n ON n.slug = c.niche_slug
         LEFT JOIN profiles p ON p.id = c.author_id
         LEFT JOIN mentor_details md ON md.profile_id = p.id
         WHERE c.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const cycleMonth = getCurrentCycleMonth();
    const modules = (
      db
        .prepare(`SELECT * FROM course_modules WHERE course_id = ? ORDER BY position ASC`)
        .all(course.id) as Array<Record<string, unknown>>
    ).map((m) => ({
      ...m,
      key_takeaways: parseJsonArray<string>(m.key_takeaways),
    }));

    const completedRows = db
      .prepare(`SELECT module_id FROM course_progress WHERE course_id = ? AND student_id = ?`)
      .all(course.id, req.userId!) as Array<{ module_id: string }>;
    const completedModuleIds = completedRows.map((r) => r.module_id);
    const isCourseCompleted = modules.length > 0 && completedModuleIds.length >= modules.length;

    const myAssignment =
      (db
        .prepare(`SELECT * FROM course_assignments WHERE course_id = ? AND student_id = ?`)
        .get(course.id, req.userId!) as Record<string, unknown> | undefined) || null;

    const participationBadge = db
      .prepare(`SELECT * FROM badges WHERE student_id = ? AND type = 'course_fellow' LIMIT 1`)
      .get(req.userId!) || null;

    const competitionBadge = db
      .prepare(`SELECT * FROM badges WHERE student_id = ? AND type = 'competition_honours' LIMIT 1`)
      .get(req.userId!) || null;

    const myEntry =
      (db
        .prepare(
          `SELECT ce.*, cert.verify_code
           FROM competition_entries ce
           LEFT JOIN certificates cert ON cert.id = ce.certificate_id
           WHERE ce.course_id = ? AND ce.student_id = ? AND ce.cycle_month = ?`
        )
        .get(course.id, req.userId!, cycleMonth) as Record<string, unknown> | undefined) || null;

    const peerRows = db
      .prepare(
        `SELECT ce.id, ce.student_id, ce.pitch_title, ce.problem_statement, ce.solution_summary,
                ce.in_person_rsvp, ce.status, ce.rank, ce.score, ce.created_at,
                p.full_name as student_name, p.avatar_url as student_avatar, p.city as student_city,
                p.grade_level as student_grade, p.school_name as student_school
         FROM competition_entries ce
         JOIN profiles p ON p.id = ce.student_id
         WHERE ce.course_id = ? AND ce.cycle_month = ?
         ORDER BY COALESCE(ce.rank, 999) ASC, ce.score DESC, ce.created_at DESC`
      )
      .all(course.id, cycleMonth) as Array<Record<string, unknown>>;

    const cohortPeers = peerRows.map((peer) => {
      const peerId = String(peer.student_id);
      const conn =
        peerId !== req.userId
          ? (db
              .prepare(
                `SELECT status FROM connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`
              )
              .get(req.userId!, peerId, peerId, req.userId!) as { status: string } | undefined)
          : undefined;
      return {
        ...peer,
        in_person_rsvp: Boolean(peer.in_person_rsvp),
        connection_status: conn?.status || null,
      };
    });

    res.json({
      course: {
        ...course,
        is_coming_soon: Boolean(course.is_coming_soon),
        is_active_track: isActiveTrackSlug(String(course.niche_slug || '')),
        module_count: modules.length,
        completed_count: completedModuleIds.length,
      },
      modules,
      completed_module_ids: completedModuleIds,
      is_course_completed: isCourseCompleted,
      my_assignment: myAssignment,
      participation_badge: participationBadge,
      competition_badge: competitionBadge,
      cycle_month: cycleMonth,
      days_left_in_cycle: getDaysLeftInCycle(),
      my_entry: myEntry ? { ...myEntry, in_person_rsvp: Boolean(myEntry.in_person_rsvp) } : null,
      cohort_peers: cohortPeers,
    });
  });

  // Post-Course Video / Presentation Assignment (added to Student Profile & unlocks 1 structured message!)
  router.post('/courses/:id/assignment', requireAuth, (req: AuthenticatedRequest, res) => {
    const course = db.prepare(`SELECT id, title, is_coming_soon FROM courses WHERE id = ?`).get(req.params.id) as
      | { id: string; title: string; is_coming_soon: number }
      | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (course.is_coming_soon) {
      res.status(400).json({ error: 'Assignments open once this course launches.' });
      return;
    }

    const totalModules = (
      db.prepare(`SELECT COUNT(*) as c FROM course_modules WHERE course_id = ?`).get(course.id) as { c: number }
    ).c;
    const completedCount = (
      db
        .prepare(`SELECT COUNT(*) as c FROM course_progress WHERE course_id = ? AND student_id = ?`)
        .get(course.id, req.userId!) as { c: number }
    ).c;
    if (completedCount < totalModules) {
      res.status(400).json({
        error: `Watch all ${totalModules} modules first (${completedCount}/${totalModules}) before submitting your post-course assignment.`,
      });
      return;
    }

    const { submission_type, title, summary, asset_url } = req.body || {};
    if (!['video', 'presentation'].includes(submission_type)) {
      res.status(400).json({ error: 'Select whether you are submitting a video or a presentation.' });
      return;
    }
    if (!title || String(title).trim().length < 4 || !summary || String(summary).trim().length < 15 || !asset_url) {
      res.status(400).json({
        error: 'Assignment title, short summary (15+ chars), and valid link to your video/presentation are required.',
      });
      return;
    }

    const existing = db
      .prepare(`SELECT id, score FROM course_assignments WHERE course_id = ? AND student_id = ?`)
      .get(course.id, req.userId!) as { id: string; score: number } | undefined;

    const assignmentId = existing?.id || uuid();
    const initialScore = existing?.score || 84;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      if (existing) {
        db.prepare(
          `UPDATE course_assignments
           SET submission_type = ?, title = ?, summary = ?, asset_url = ?, created_at = ?
           WHERE id = ?`
        ).run(
          submission_type,
          String(title).trim(),
          String(summary).trim(),
          String(asset_url).trim(),
          nowIso,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO course_assignments (id, course_id, student_id, submission_type, title, summary, asset_url, score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          assignmentId,
          course.id,
          req.userId!,
          submission_type,
          String(title).trim(),
          String(summary).trim(),
          String(asset_url).trim(),
          initialScore,
          nowIso
        );
      }

      awardBadge(db, req.userId!, 'course_fellow', 'Course Fellow');
    });
    tx();

    const saved = db.prepare(`SELECT * FROM course_assignments WHERE id = ?`).get(assignmentId);
    res.status(201).json({
      ok: true,
      assignment: saved,
      messaging_unlocked: true,
    });
  });

  router.post('/courses/:id/modules/:moduleId/complete', requireAuth, (req: AuthenticatedRequest, res) => {
    const course = db.prepare(`SELECT id, title, is_coming_soon FROM courses WHERE id = ?`).get(req.params.id) as
      | { id: string; title: string; is_coming_soon: number }
      | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (course.is_coming_soon) {
      res.status(400).json({ error: 'This course curriculum is coming soon.' });
      return;
    }

    const mod = db
      .prepare(`SELECT id FROM course_modules WHERE id = ? AND course_id = ?`)
      .get(req.params.moduleId, course.id);
    if (!mod) {
      res.status(404).json({ error: 'Module not found.' });
      return;
    }

    db.prepare(
      `INSERT OR IGNORE INTO course_progress (student_id, course_id, module_id, completed_at) VALUES (?, ?, ?, ?)`
    ).run(req.userId!, course.id, req.params.moduleId, new Date().toISOString());

    const totalModules = (
      db.prepare(`SELECT COUNT(*) as c FROM course_modules WHERE course_id = ?`).get(course.id) as { c: number }
    ).c;
    const completedRows = db
      .prepare(`SELECT module_id FROM course_progress WHERE course_id = ? AND student_id = ?`)
      .all(course.id, req.userId!) as Array<{ module_id: string }>;
    const completedModuleIds = completedRows.map((r) => r.module_id);
    const isCourseCompleted = totalModules > 0 && completedModuleIds.length >= totalModules;

    let awardedBadge: string | null = null;
    if (isCourseCompleted) {
      const existingBadge = db
        .prepare(`SELECT id FROM badges WHERE student_id = ? AND type = 'course_fellow'`)
        .get(req.userId!);
      if (!existingBadge) {
        awardBadge(db, req.userId!, 'course_fellow', 'Course Fellow');
        awardedBadge = 'Course Fellow';
      }
    }

    res.json({
      ok: true,
      completed_module_ids: completedModuleIds,
      is_course_completed: isCourseCompleted,
      awarded_badge: awardedBadge,
    });
  });

  router.post('/courses/:id/compete', requireAuth, (req: AuthenticatedRequest, res) => {
    const course = db
      .prepare(`SELECT * FROM courses WHERE id = ?`)
      .get(req.params.id) as Record<string, unknown> | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    if (course.is_coming_soon) {
      res.status(400).json({ error: 'Competition opens once this course launches.' });
      return;
    }

    const totalModules = (
      db.prepare(`SELECT COUNT(*) as c FROM course_modules WHERE course_id = ?`).get(course.id) as { c: number }
    ).c;
    const completedCount = (
      db
        .prepare(`SELECT COUNT(*) as c FROM course_progress WHERE course_id = ? AND student_id = ?`)
        .get(course.id, req.userId!) as { c: number }
    ).c;

    if (completedCount < totalModules) {
      res.status(400).json({
        error: `Watch all ${totalModules} video modules first (${completedCount}/${totalModules} complete) to unlock the mandatory monthly competition.`,
      });
      return;
    }

    const { pitch_title, problem_statement, solution_summary, pitch_link, in_person_rsvp } = req.body || {};
    if (!pitch_title || !String(pitch_title).trim() || !problem_statement || !solution_summary) {
      res.status(400).json({ error: 'Please complete your pitch title, problem statement, and solution summary.' });
      return;
    }

    const cycleMonth = getCurrentCycleMonth();
    const entryId = uuid();
    const certId = uuid();
    const verifyCode = cryptoRandomCode(8);
    const issuedAt = new Date().toISOString();
    const feedback = `Honours Finalist in ${String(course.competition_title)} (${cycleMonth}). Clear problem framing and practical solution ready for the ${String(course.meetup_venue)} in-person showcase.`;

    const existing = db
      .prepare(`SELECT id, certificate_id FROM competition_entries WHERE course_id = ? AND student_id = ? AND cycle_month = ?`)
      .get(course.id, req.userId!, cycleMonth) as { id: string; certificate_id: string | null } | undefined;

    let finalCertId = existing?.certificate_id || certId;
    let finalVerifyCode = verifyCode;

    const tx = db.transaction(() => {
      if (existing?.certificate_id) {
        const existingCert = db
          .prepare(`SELECT verify_code FROM certificates WHERE id = ?`)
          .get(existing.certificate_id) as { verify_code: string } | undefined;
        if (existingCert) {
          finalVerifyCode = existingCert.verify_code;
        }
      } else {
        db.prepare(
          `INSERT INTO certificates (id, student_id, mentor_id, meeting_id, title, verify_code, issued_at) VALUES (?, ?, ?, NULL, ?, ?, ?)`
        ).run(
          finalCertId,
          req.userId!,
          String(course.author_id),
          `${String(course.competition_title)} — Monthly Honours`,
          finalVerifyCode,
          issuedAt
        );
      }

      if (existing) {
        db.prepare(
          `UPDATE competition_entries
           SET pitch_title = ?, problem_statement = ?, solution_summary = ?, pitch_link = ?, in_person_rsvp = ?, status = CASE WHEN status IN ('winner','top_5') THEN status ELSE 'honours_awarded' END, score = CASE WHEN score = 0 THEN 82 ELSE score END, mentor_feedback = ?, certificate_id = ?
           WHERE id = ?`
        ).run(
          String(pitch_title).trim(),
          String(problem_statement).trim(),
          String(solution_summary).trim(),
          pitch_link ? String(pitch_link).trim() : null,
          in_person_rsvp === false ? 0 : 1,
          feedback,
          finalCertId,
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO competition_entries
           (id, course_id, student_id, cycle_month, pitch_title, problem_statement, solution_summary, pitch_link, in_person_rsvp, status, score, mentor_feedback, certificate_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'honours_awarded', 82, ?, ?, ?)`
        ).run(
          entryId,
          course.id,
          req.userId!,
          cycleMonth,
          String(pitch_title).trim(),
          String(problem_statement).trim(),
          String(solution_summary).trim(),
          pitch_link ? String(pitch_link).trim() : null,
          in_person_rsvp === false ? 0 : 1,
          feedback,
          finalCertId,
          issuedAt
        );
      }

      awardBadge(db, req.userId!, 'course_fellow', 'Course Fellow');
      awardBadge(db, req.userId!, 'competition_honours', 'Competition Finalist');
    });
    tx();

    const savedEntry = db
      .prepare(
        `SELECT ce.*, cert.verify_code FROM competition_entries ce LEFT JOIN certificates cert ON cert.id = ce.certificate_id WHERE ce.course_id = ? AND ce.student_id = ? AND ce.cycle_month = ?`
      )
      .get(course.id, req.userId!, cycleMonth) as Record<string, unknown>;

    res.status(201).json({
      ok: true,
      entry: { ...savedEntry, in_person_rsvp: Boolean(savedEntry.in_person_rsvp) },
      certificate_id: finalCertId,
      verify_code: finalVerifyCode,
    });
  });

  router.post('/courses/:id/rsvp', requireAuth, (req: AuthenticatedRequest, res) => {
    const cycleMonth = getCurrentCycleMonth();
    const existing = db
      .prepare(`SELECT id, in_person_rsvp FROM competition_entries WHERE course_id = ? AND student_id = ? AND cycle_month = ?`)
      .get(req.params.id, req.userId!, cycleMonth) as { id: string; in_person_rsvp: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Submit your monthly competition entry first to manage your in-person meetup RSVP.' });
      return;
    }

    const nextRsvp = existing.in_person_rsvp ? 0 : 1;
    db.prepare(`UPDATE competition_entries SET in_person_rsvp = ? WHERE id = ?`).run(nextRsvp, existing.id);
    res.json({ ok: true, in_person_rsvp: Boolean(nextRsvp) });
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
        `SELECT p.id, p.full_name, p.city, p.bio, p.created_at, au.email, md.*, COALESCE(pp.linkedin_verified, 0) as linkedin_verified, pp.headline
         FROM profiles p
         JOIN auth_users au ON au.id = p.id
         JOIN mentor_details md ON md.profile_id = p.id
         LEFT JOIN professional_profiles pp ON pp.profile_id = p.id
         WHERE md.status = 'pending'
         ORDER BY p.created_at ASC`
      )
      .all()
      .map((m) => hydrateMentor(m as Record<string, unknown>));

    const allMentors = db
      .prepare(
        `SELECT p.id, p.full_name, p.city, md.profession, md.company, md.status, md.linkedin_url, md.sessions_completed,
                md.vip_code, md.vip_partner, md.verification_deadline_at, md.topics, md.preferred_slots,
                COALESCE(pp.linkedin_verified, 0) as linkedin_verified
         FROM profiles p
         JOIN mentor_details md ON md.profile_id = p.id
         LEFT JOIN professional_profiles pp ON pp.profile_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all()
      .map((m) => hydrateMentor(m as Record<string, unknown>));

    const competitionEntries = db
      .prepare(
        `SELECT ce.*, p.full_name as student_name, c.title as course_title
         FROM competition_entries ce
         JOIN profiles p ON p.id = ce.student_id
         JOIN courses c ON c.id = ce.course_id
         ORDER BY COALESCE(ce.rank, 999) ASC, ce.score DESC, ce.created_at DESC
         LIMIT 25`
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

    res.json({ pending_mentors: pendingMentors, all_mentors: allMentors, competition_entries: competitionEntries, reports });
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

  router.post('/admin/competitions/:entryId/evaluate', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.userRole !== 'admin' && req.userRole !== 'mentor') {
      res.status(403).json({ error: 'Only admins or verified mentors can score competition entries.' });
      return;
    }
    if (req.userRole === 'mentor') {
      const md = db.prepare(`SELECT status FROM mentor_details WHERE profile_id = ?`).get(req.userId!) as
        | { status: string }
        | undefined;
      if (!md || md.status !== 'approved') {
        res.status(403).json({ error: 'Pending mentors cannot score competition entries yet.' });
        return;
      }
    }

    const { score, status, rank, mentor_feedback } = req.body || {};
    const entry = db.prepare(`SELECT * FROM competition_entries WHERE id = ?`).get(req.params.entryId) as
      | Record<string, unknown>
      | undefined;
    if (!entry) {
      res.status(404).json({ error: 'Competition entry not found.' });
      return;
    }

    const numericScore = Math.max(0, Math.min(100, Number(score ?? entry.score ?? 85)));
    const nextStatus = ['winner', 'top_5', 'honours_awarded', 'confirmed'].includes(status)
      ? status
      : numericScore >= 95
        ? 'winner'
        : numericScore >= 85
          ? 'top_5'
          : 'honours_awarded';
    const nextRank = rank !== undefined && rank !== null ? Number(rank) : nextStatus === 'winner' ? 1 : null;

    db.prepare(
      `UPDATE competition_entries
       SET score = ?, status = ?, rank = COALESCE(?, rank), mentor_feedback = COALESCE(?, mentor_feedback)
       WHERE id = ?`
    ).run(
      numericScore,
      nextStatus,
      nextRank,
      mentor_feedback ? String(mentor_feedback).trim() : null,
      entry.id
    );

    res.json({ ok: true, score: numericScore, status: nextStatus, rank: nextRank });
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
