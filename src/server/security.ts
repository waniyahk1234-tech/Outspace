import crypto from 'crypto';
import nodemailer from 'nodemailer';

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'qwertyuiop',
  'outspace123',
  'welcome123',
  'admin123',
  'letmein1',
  'pakistan123',
]);

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

export function validatePasswordStrength(
  password: string,
  context?: { email?: string; fullName?: string }
): PasswordValidationResult {
  const pwd = String(password || '');
  const checks = {
    length: pwd.length >= 8 && pwd.length <= 128,
    uppercase: /[A-Z]/.test(pwd),
    lowercase: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };

  if (!checks.length) {
    return { valid: false, error: 'Password must be between 8 and 128 characters.', checks };
  }
  if (!checks.uppercase) {
    return { valid: false, error: 'Password must include at least one uppercase letter (A–Z).', checks };
  }
  if (!checks.lowercase) {
    return { valid: false, error: 'Password must include at least one lowercase letter (a–z).', checks };
  }
  if (!checks.number) {
    return { valid: false, error: 'Password must include at least one number (0–9).', checks };
  }
  if (!checks.special) {
    return { valid: false, error: 'Password must include at least one special character (e.g. @, #, $, !).', checks };
  }

  const lowerPwd = pwd.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lowerPwd)) {
    return { valid: false, error: 'This password is too common. Please choose a stronger password.', checks };
  }

  if (context?.email) {
    const localPart = context.email.split('@')[0]?.toLowerCase() || '';
    if (localPart.length >= 4 && lowerPwd.includes(localPart)) {
      return { valid: false, error: 'Password cannot contain your email username.', checks };
    }
  }

  if (context?.fullName) {
    const nameTokens = context.fullName
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const token of nameTokens) {
      if (lowerPwd.includes(token)) {
        return { valid: false, error: 'Password cannot contain your own name.', checks };
      }
    }
  }

  return { valid: true, checks };
}

const GMAIL_TYPOS = new Set(['gamil.com', 'gmial.com', 'gmal.com', 'gnail.com', 'gmail.co', 'gmail.cm']);

export function validateAndNormalizeEmail(rawEmail: string): { valid: boolean; email: string; isGmail: boolean; error?: string } {
  const trimmed = String(rawEmail || '').trim().toLowerCase();
  const basicRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!basicRegex.test(trimmed)) {
    return { valid: false, email: trimmed, isGmail: false, error: 'Please enter a valid email address.' };
  }

  const [local, domain] = trimmed.split('@');
  if (!local || !domain) {
    return { valid: false, email: trimmed, isGmail: false, error: 'Please enter a valid email address.' };
  }

  if (GMAIL_TYPOS.has(domain)) {
    return {
      valid: false,
      email: trimmed,
      isGmail: false,
      error: `Did you mean ${local}@gmail.com? Please check your Gmail spelling.`,
    };
  }

  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const isGmail = normalizedDomain === 'gmail.com';

  if (isGmail) {
    const baseLocal = local.split('+')[0] || '';
    if (baseLocal.length < 3 || baseLocal.length > 30) {
      return {
        valid: false,
        email: trimmed,
        isGmail: true,
        error: 'Gmail usernames must be between 3 and 30 characters before @gmail.com.',
      };
    }
    if (!/^[a-z0-9.+]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
      return {
        valid: false,
        email: trimmed,
        isGmail: true,
        error: 'Invalid Gmail address format (only letters, numbers, and single dots allowed).',
      };
    }
  }

  return { valid: true, email: `${local}@${normalizedDomain}`, isGmail };
}

// Brute-force login rate limiter per email
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export function checkLoginRateLimit(email: string): { allowed: boolean; waitMinutes?: number } {
  const rec = failedAttempts.get(email);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > Date.now()) {
    const waitMinutes = Math.max(1, Math.ceil((rec.lockedUntil - Date.now()) / 60000));
    return { allowed: false, waitMinutes };
  }
  if (rec.lockedUntil !== 0 && rec.lockedUntil <= Date.now()) {
    failedAttempts.delete(email);
  }
  return { allowed: true };
}

export function recordFailedLogin(email: string) {
  const rec = failedAttempts.get(email) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILED_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  failedAttempts.set(email, rec);
}

export function clearFailedLogins(email: string) {
  failedAttempts.delete(email);
}

export function generateVerificationCode(): { code: string; hash: string; expiresAt: string } {
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return { code, hash, expiresAt };
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendVerificationEmail(
  toEmail: string,
  fullName: string,
  code: string
): Promise<{ sentViaSmtp: boolean }> {
  if (!isSmtpConfigured()) {
    console.log(`[Outspace Email Verification] Code for ${toEmail}: ${code}`);
    return { sentViaSmtp: false };
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Outspace Pakistan" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `${code} is your Outspace verification code`,
    text: `Salam ${fullName},\n\nYour Outspace verification code is: ${code}\n\nThis code expires in 15 minutes. If you did not create an account on Outspace, you can safely ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; background:#FFF5E8; padding:28px; color:#252020;">
        <div style="max-width:480px; margin:0 auto; background:#ffffff; border:2px solid #252020; border-radius:16px; padding:24px;">
          <h2 style="margin:0 0 8px; color:#C83D42;">Verify your Outspace account</h2>
          <p style="margin:0 0 18px; font-size:14px;">Salam ${fullName}, enter this 6-digit verification code to confirm your email address:</p>
          <div style="background:#F6D66D; border:2px solid #252020; border-radius:12px; padding:14px; text-align:center; font-size:28px; font-weight:bold; letter-spacing:6px;">
            ${code}
          </div>
          <p style="margin:16px 0 0; font-size:12px; color:#5A4F4F;">Expires in 15 minutes · Outspace Career Exploration Platform</p>
        </div>
      </div>
    `,
  });

  return { sentViaSmtp: true };
}
