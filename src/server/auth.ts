import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import type { PlanType, Subscription } from '../shared/types.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'outspace-dev-session-secret-change-in-prod';
export const SESSION_COOKIE_NAME = 'outspace_session';

export function signUserId(userId: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
  return `${userId}.${sig}`;
}

export function verifySignedToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [userId, sig] = token.split('.');
  if (!userId || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return userId;
    }
  } catch {
    return null;
  }
  return null;
}

export function signOAuthState(payload: { provider: 'google' | 'linkedin'; role: 'student' | 'mentor' }): string {
  const data = Buffer.from(
    JSON.stringify({
      ...payload,
      nonce: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + 15 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyOAuthState(
  state: string | undefined
): { provider: 'google' | 'linkedin'; role: 'student' | 'mentor' } | null {
  if (!state || !state.includes('.')) return null;
  const [data, sig] = state.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      provider: 'google' | 'linkedin';
      role: 'student' | 'mentor';
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!['google', 'linkedin'].includes(parsed.provider)) return null;
    if (!['student', 'mentor'].includes(parsed.role)) return null;
    return { provider: parsed.provider, role: parsed.role };
  } catch {
    return null;
  }
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL || '').startsWith('https://');

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL || '').startsWith('https://');

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

export function getEffectiveSubscription(db: Database.Database, userId: string): Subscription | null {
  const sub = db
    .prepare(
      `SELECT s.*, i.name as institution_name
       FROM subscriptions s
       LEFT JOIN institutions i ON i.id = s.institution_id
       WHERE s.user_id = ?`
    )
    .get(userId) as
    | {
        id: string;
        user_id: string;
        plan: PlanType;
        trial_ends_at: string | null;
        current_period_end: string | null;
        institution_id: string | null;
        institution_name: string | null;
        free_sessions_left: number;
      }
    | undefined;

  if (!sub) return null;

  const now = Date.now();
  let effectivePlan: PlanType = sub.plan;
  let isActive = false;
  let daysLeft = 0;

  if (sub.plan === 'institution') {
    effectivePlan = 'institution';
    isActive = true;
    daysLeft = 365;
  } else if (sub.plan === 'monthly' || sub.plan === 'yearly') {
    const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
    if (end > now) {
      effectivePlan = sub.plan;
      isActive = true;
      daysLeft = Math.max(1, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    } else {
      effectivePlan = 'expired';
      isActive = false;
      daysLeft = 0;
    }
  } else if (sub.plan === 'trial') {
    const end = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    if (end > now) {
      effectivePlan = 'trial';
      isActive = true;
      daysLeft = Math.max(1, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    } else {
      effectivePlan = 'expired';
      isActive = false;
      daysLeft = 0;
    }
  } else {
    effectivePlan = 'expired';
    isActive = false;
    daysLeft = 0;
  }

  return {
    id: sub.id,
    user_id: sub.user_id,
    plan: sub.plan,
    effective_plan: effectivePlan,
    trial_ends_at: sub.trial_ends_at,
    current_period_end: sub.current_period_end,
    institution_id: sub.institution_id,
    institution_name: sub.institution_name,
    free_sessions_left: sub.free_sessions_left,
    days_left: daysLeft,
    is_active: isActive,
  };
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function attachSession(db: Database.Database) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const userId = verifySignedToken(bearer || cookieToken || queryToken);
    if (userId) {
      const profile = db.prepare('SELECT id, role FROM profiles WHERE id = ?').get(userId) as
        | { id: string; role: string }
        | undefined;
      if (profile) {
        req.userId = profile.id;
        req.userRole = profile.role;
      }
    }
    next();
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: 'Please log in to continue.' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.userId || req.userRole !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}
