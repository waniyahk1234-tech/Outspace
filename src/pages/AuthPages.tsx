import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  GraduationCap,
  Briefcase,
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  MailCheck,
  ShieldCheck,
  Copy,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, setSessionToken, useAuth } from '../lib/api';
import { BrandLogo, Starburst } from '../components/BrandMark';

function GoogleGIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <span
      aria-hidden="true"
      className="w-4 h-4 rounded-[4px] bg-[#0A66C2] text-white font-display font-bold text-[10px] leading-none flex items-center justify-center shrink-0"
    >
      in
    </span>
  );
}

interface OAuthSetupInfo {
  provider: 'google' | 'linkedin';
  redirectUri: string;
  requiredEnv: string[];
}

function OAuthSetupModal({ info, onClose }: { info: OAuthSetupInfo; onClose: () => void }) {
  const label = info.provider === 'google' ? 'Gmail (Google)' : 'LinkedIn';
  const copyUri = () => {
    navigator.clipboard?.writeText(info.redirectUri);
    toast.success('Callback URL copied!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-mono font-bold text-[#C83D42] uppercase">OAuth Credentials Needed</div>
            <h3 className="font-display text-xl font-bold mt-0.5">Connect {label} Login</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border-2 border-[#252020]/30 hover:border-[#252020]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#4D4242] leading-relaxed">
          To enable one-click {label} sign-in for students and mentors, register this authorized redirect URI in your{' '}
          {info.provider === 'google' ? 'Google Cloud Console' : 'LinkedIn Developer App'} and add the two keys to AI
          Studio Secrets:
        </p>

        <div className="p-3 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] space-y-1.5">
          <div className="text-[11px] font-bold text-[#5A4F4F]">Authorized Redirect URI</div>
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono break-all flex-1 text-[#252020]">{info.redirectUri}</code>
            <button
              type="button"
              onClick={copyUri}
              className="p-1.5 rounded-lg bg-[#F6D66D] border border-[#252020] shrink-0"
              title="Copy URL"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#F6D66D]/35 border border-[#252020]/40 text-xs space-y-1">
          <div className="font-bold">Environment Secrets Required:</div>
          <div className="font-mono text-[11px]">{info.requiredEnv.join(', ')}</div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#252020] text-white text-xs font-bold"
        >
          Got it — Use email login meanwhile
        </button>
      </div>
    </div>
  );
}

function useOAuthPopup(
  onSuccess: (payload: { token: string; role: string; onboarding_complete: boolean }) => Promise<void>
) {
  const [setupModal, setSetupModal] = useState<OAuthSetupInfo | null>(null);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'linkedin' | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OUTSPACE_OAUTH_SUCCESS' && event.data?.token) {
        setOauthBusy(null);
        onSuccess(event.data);
      } else if (event.data?.type === 'OUTSPACE_OAUTH_ERROR') {
        setOauthBusy(null);
        toast.error(event.data.error || 'OAuth login failed.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSuccess]);

  const launchOAuth = async (provider: 'google' | 'linkedin', role: 'student' | 'mentor') => {
    setOauthBusy(provider);
    try {
      const res = await apiFetch<{
        configured: boolean;
        url?: string;
        redirectUri: string;
        requiredEnv?: string[];
      }>(`/api/auth/oauth/${provider}/url?role=${role}`);

      if (!res.configured || !res.url) {
        setOauthBusy(null);
        setSetupModal({
          provider,
          redirectUri: res.redirectUri,
          requiredEnv:
            res.requiredEnv ||
            (provider === 'google'
              ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
              : ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']),
        });
        return;
      }

      const authWin = window.open(res.url, 'outspace_oauth_popup', 'width=560,height=680');
      if (!authWin) {
        setOauthBusy(null);
        toast.error('Popup was blocked by your browser. Please allow popups for this site.');
      }
    } catch (err) {
      setOauthBusy(null);
      toast.error((err as Error).message);
    }
  };

  return { launchOAuth, oauthBusy, setupModal, closeSetupModal: () => setSetupModal(null) };
}

function getPasswordChecks(pwd: string) {
  return {
    length: pwd.length >= 8,
    uppercase: /[A-Z]/.test(pwd),
    lowercase: /[a-z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
}

function EmailVerificationCard({
  email,
  previewCode,
  smtpConfigured,
  onVerified,
  onBack,
}: {
  email: string;
  previewCode?: string;
  smtpConfigured: boolean;
  onVerified: (data: { token: string; profile: { role: string; onboarding_complete: boolean } }) => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState(previewCode || '');
  const [activePreview, setActivePreview] = useState(previewCode);
  const [isSmtp, setIsSmtp] = useState(smtpConfigured);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) {
      toast.error('Please enter the 6-digit verification code.');
      return;
    }
    setVerifying(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        token: string;
        profile: { role: string; onboarding_complete: boolean };
      }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code: code.trim() }),
      });
      await onVerified(res);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        smtp_configured: boolean;
        verification_preview_code?: string;
      }>('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setIsSmtp(res.smtp_configured);
      if (res.verification_preview_code) {
        setActivePreview(res.verification_preview_code);
        setCode(res.verification_preview_code);
      }
      toast.success(
        res.smtp_configured ? 'New verification code sent to your inbox!' : 'New verification code generated.'
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-xl border-2 border-[#252020] hover:bg-[#FFF5E8]"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold">Verify your email</h1>
          <p className="text-xs text-[#6B5E5E] truncate">{email}</p>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-[#F6D66D]/50 border-2 border-[#252020] space-y-1.5 text-xs">
        <div className="flex items-center gap-2 font-bold text-[#252020]">
          <MailCheck className="w-4 h-4 text-[#C83D42]" />
          <span>
            {isSmtp ? 'Verification code sent to your Gmail inbox' : '6-digit verification code ready'}
          </span>
        </div>
        {isSmtp ? (
          <p className="text-[#4D4242]">
            Check <span className="font-bold">{email}</span> (including Spam/Promotions) for your 6-digit code.
          </p>
        ) : (
          <p className="text-[#4D4242]">
            Live SMTP delivery is not configured in Secrets yet, so use verification code:{' '}
            <span className="font-mono font-bold text-[#252020] bg-white px-2 py-0.5 rounded border border-[#252020]">
              {activePreview}
            </span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold mb-1.5" htmlFor="verify-code">
          6-Digit Verification Code
        </label>
        <input
          id="verify-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          placeholder="123456"
          className="w-full px-4 py-3 rounded-xl border-2 border-[#252020] bg-white text-center font-mono text-xl font-bold tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
        />
      </div>

      <button
        type="submit"
        disabled={verifying}
        className="w-full py-3 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white font-bold text-sm hover:bg-[#B23237] disabled:opacity-60"
      >
        {verifying ? 'Verifying...' : 'Verify & Continue →'}
      </button>

      <div className="text-center">
        <button
          type="button"
          disabled={resending}
          onClick={handleResend}
          className="text-xs font-bold text-[#C83D42] hover:underline disabled:opacity-50"
        >
          {resending ? 'Sending...' : 'Didn’t receive a code? Resend'}
        </button>
      </div>
    </form>
  );
}

const signupSchema = z.object({
  full_name: z.string().min(2, 'Please enter your full name'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Include at least 1 uppercase letter')
    .regex(/[a-z]/, 'Include at least 1 lowercase letter')
    .regex(/[0-9]/, 'Include at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Include at least 1 special character'),
  guardian_consent: z.boolean().optional(),
});

type SignupValues = z.infer<typeof signupSchema>;

export function SignupPage() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'mentor' ? 'mentor' : null;
  const [role, setRole] = useState<'student' | 'mentor' | null>(initialRole);
  const [showPwd, setShowPwd] = useState(false);
  const [pendingVerify, setPendingVerify] = useState<{
    email: string;
    previewCode?: string;
    smtpConfigured: boolean;
  } | null>(null);

  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { guardian_consent: false, password: '' },
  });

  const passwordVal = watch('password') || '';
  const checks = getPasswordChecks(passwordVal);
  const passedCount = Object.values(checks).filter(Boolean).length;

  const finishAuthNavigation = async (token: string, profile: { role: string; onboarding_complete: boolean }) => {
    setSessionToken(token);
    await refreshUser();
    toast.success('Welcome to Outspace!');
    if (!profile.onboarding_complete) {
      navigate('/onboarding');
    } else if (profile.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  const { launchOAuth, oauthBusy, setupModal, closeSetupModal } = useOAuthPopup(async (payload) => {
    await finishAuthNavigation(payload.token, {
      role: payload.role,
      onboarding_complete: payload.onboarding_complete,
    });
  });

  const onSubmit = async (values: SignupValues) => {
    if (!role) return;
    if (role === 'student' && !values.guardian_consent) {
      setError('guardian_consent', {
        message: 'Please confirm you are 18+ or have parent/guardian permission.',
      });
      return;
    }

    try {
      const res = await apiFetch<{
        ok: boolean;
        requires_verification: boolean;
        email: string;
        smtp_configured: boolean;
        verification_preview_code?: string;
      }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ ...values, role }),
      });

      setPendingVerify({
        email: res.email,
        smtpConfigured: res.smtp_configured,
        previewCode: res.verification_preview_code,
      });
      toast.success('Account created! Please verify your email code.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF5E8] flex flex-col justify-center py-10 px-4">
      <div className="max-w-xl w-full mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/">
            <BrandLogo />
          </Link>
          <Link to="/login" className="text-sm font-bold text-[#C83D42] hover:underline">
            Already have an account? Log in
          </Link>
        </div>

        <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8">
          {pendingVerify ? (
            <EmailVerificationCard
              email={pendingVerify.email}
              previewCode={pendingVerify.previewCode}
              smtpConfigured={pendingVerify.smtpConfigured}
              onBack={() => setPendingVerify(null)}
              onVerified={async (res) => finishAuthNavigation(res.token, res.profile)}
            />
          ) : !role ? (
            <div className="space-y-6">
              <div className="flex items-center gap-2.5">
                <Starburst size={22} color="#F6D66D" />
                <div>
                  <h1 className="font-display text-3xl font-bold text-[#252020]">Join Outspace</h1>
                  <p className="mt-0.5 text-sm text-[#5A4F4F]">Choose how you will explore or mentor.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className="text-left p-6 rounded-2xl border-2 border-[#252020] editorial-shadow-sm bg-[#F6D66D]/55 hover:-translate-y-0.5 transition-transform space-y-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-white border-2 border-[#252020] flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-[#C83D42]" />
                  </div>
                  <div className="font-display text-lg font-bold">I&apos;m a Student</div>
                  <p className="text-sm text-[#4D4242]">
                    Matric, O-Level, Intermediate, or A-Level (14–18). Free 7-day trial + 1 free 1:1 session.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('mentor')}
                  className="text-left p-6 rounded-2xl border-2 border-[#252020] editorial-shadow-sm bg-[#F7A98A]/55 hover:-translate-y-0.5 transition-transform space-y-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-white border-2 border-[#252020] flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-[#252020]" />
                  </div>
                  <div className="font-display text-lg font-bold">I&apos;m a Mentor</div>
                  <p className="text-sm text-[#4D4242]">
                    Working professional ready to guide Pakistani students with honest career insight.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRole(null)}
                  className="p-2 rounded-xl border-2 border-[#252020] hover:bg-[#FFF5E8]"
                  aria-label="Change role"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="font-display text-2xl font-bold">
                    Create {role === 'student' ? 'Student' : 'Mentor'} Account
                  </h1>
                  <p className="text-xs text-[#6B5E5E]">Sign up with Gmail, LinkedIn, or verified email</p>
                </div>
              </div>

              {/* Gmail & LinkedIn Sign Up for both Students and Mentors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={oauthBusy !== null}
                  onClick={() => launchOAuth('google', role)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8] transition-colors disabled:opacity-60"
                >
                  <GoogleGIcon />
                  <span>{oauthBusy === 'google' ? 'Connecting...' : 'Continue with Gmail'}</span>
                </button>

                <button
                  type="button"
                  disabled={oauthBusy !== null}
                  onClick={() => launchOAuth('linkedin', role)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8] transition-colors disabled:opacity-60"
                >
                  <LinkedInIcon />
                  <span>{oauthBusy === 'linkedin' ? 'Connecting...' : 'Continue with LinkedIn'}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#6B5E5E]">
                <div className="flex-1 h-px bg-[#252020]/15" />
                <span className="font-medium">or sign up manually</span>
                <div className="flex-1 h-px bg-[#252020]/15" />
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5" htmlFor="full_name">
                    Full name
                  </label>
                  <input
                    id="full_name"
                    {...register('full_name')}
                    placeholder={role === 'student' ? 'e.g. Waniyah Tariq' : 'e.g. Ayesha Khan'}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
                  />
                  {errors.full_name && <p className="mt-1 text-xs text-[#C83D42]">{errors.full_name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" htmlFor="email">
                    Gmail or Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="you@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
                  />
                  {errors.email && <p className="mt-1 text-xs text-[#C83D42]">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      {...register('password')}
                      placeholder="Strong password (min 8 chars)"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A4F4F] hover:text-[#252020]"
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-[#C83D42]">{errors.password.message}</p>}

                  {/* Live Password Security Strength Meter */}
                  <div className="mt-2.5 p-3 rounded-xl bg-[#FFF5E8] border border-[#252020]/25 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="inline-flex items-center gap-1 text-[#252020]">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#C83D42]" />
                        Password Security
                      </span>
                      <span className={passedCount === 5 ? 'text-emerald-700' : 'text-[#6B5E5E]'}>
                        {passedCount}/5 checks
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 3, 4, 5].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 rounded-full transition-colors ${
                            passedCount >= step
                              ? passedCount === 5
                                ? 'bg-emerald-600'
                                : 'bg-[#F6D66D]'
                              : 'bg-[#252020]/10'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      {[
                        { ok: checks.length, label: '8+ characters' },
                        { ok: checks.uppercase, label: 'Uppercase (A–Z)' },
                        { ok: checks.lowercase, label: 'Lowercase (a–z)' },
                        { ok: checks.number, label: 'Number (0–9)' },
                        { ok: checks.special, label: 'Symbol (!@#$)' },
                      ].map((rule) => (
                        <div
                          key={rule.label}
                          className={`flex items-center gap-1.5 ${rule.ok ? 'text-emerald-800 font-semibold' : 'text-[#6B5E5E]'}`}
                        >
                          {rule.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <Circle className="w-3 h-3 shrink-0" />}
                          <span>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {role === 'student' && (
                  <div className="p-3.5 rounded-xl bg-[#FFF5E8] border-2 border-[#252020]">
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('guardian_consent')}
                        className="mt-0.5 w-4 h-4 accent-[#C83D42] rounded"
                      />
                      <span>I am 18+ or my parent/guardian agrees to me using Outspace</span>
                    </label>
                    {errors.guardian_consent && (
                      <p className="mt-1.5 text-xs text-[#C83D42]">{errors.guardian_consent.message}</p>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white font-bold text-sm hover:bg-[#B23237] disabled:opacity-60 transition-colors"
                >
                  {isSubmitting ? 'Creating account...' : 'Create Account & Verify Email'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {setupModal && <OAuthSetupModal info={setupModal} onClose={closeSetupModal} />}
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [oauthRole, setOauthRole] = useState<'student' | 'mentor'>('student');
  const [showPwd, setShowPwd] = useState(false);
  const [pendingVerify, setPendingVerify] = useState<{
    email: string;
    previewCode?: string;
    smtpConfigured: boolean;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const finishLogin = async (token: string, profile: { role: string; onboarding_complete: boolean }) => {
    setSessionToken(token);
    await refreshUser();
    toast.success('Logged in!');
    if (!profile.onboarding_complete) {
      navigate('/onboarding');
    } else if (profile.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  const { launchOAuth, oauthBusy, setupModal, closeSetupModal } = useOAuthPopup(async (payload) => {
    await finishLogin(payload.token, {
      role: payload.role,
      onboarding_complete: payload.onboarding_complete,
    });
  });

  const doLogin = async (values: LoginValues) => {
    try {
      const data = await apiFetch<{
        ok: boolean;
        token: string;
        profile: { role: string; onboarding_complete: boolean };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      await finishLogin(data.token, data.profile);
    } catch (err) {
      const e2 = err as Error & {
        code?: string;
        data?: {
          requires_verification?: boolean;
          email?: string;
          smtp_configured?: boolean;
          verification_preview_code?: string;
        };
      };
      if (e2.code === 'EMAIL_NOT_VERIFIED' && e2.data?.email) {
        setPendingVerify({
          email: e2.data.email,
          smtpConfigured: Boolean(e2.data.smtp_configured),
          previewCode: e2.data.verification_preview_code,
        });
        toast.info('Please verify your email code to complete login.');
        return;
      }
      toast.error(e2.message);
    }
  };

  const quickDemoLogin = async (email: string) => {
    setValue('email', email);
    setValue('password', 'Demo@1234');
    await doLogin({ email, password: 'Demo@1234' });
  };

  return (
    <div className="min-h-screen bg-[#FFF5E8] flex flex-col justify-center py-10 px-4">
      <div className="max-w-md w-full mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/">
            <BrandLogo />
          </Link>
          <Link to="/signup" className="text-sm font-bold text-[#C83D42] hover:underline">
            New to Outspace? Sign up
          </Link>
        </div>

        <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8 space-y-6">
          {pendingVerify ? (
            <EmailVerificationCard
              email={pendingVerify.email}
              previewCode={pendingVerify.previewCode}
              smtpConfigured={pendingVerify.smtpConfigured}
              onBack={() => setPendingVerify(null)}
              onVerified={async (res) => finishLogin(res.token, res.profile)}
            />
          ) : (
            <>
              <div>
                <h1 className="font-display text-3xl font-bold">Welcome back</h1>
                <p className="mt-1 text-sm text-[#5A4F4F]">
                  Log in manually or with Gmail or LinkedIn.
                </p>
              </div>

              {/* Student / Mentor Role Switch + Gmail & LinkedIn OAuth */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#5A4F4F]">Account type (for new social sign-in):</span>
                  <div className="inline-flex rounded-xl border-2 border-[#252020] bg-[#FFF5E8] p-0.5">
                    {(['student', 'mentor'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setOauthRole(r)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors ${
                          oauthRole === r ? 'bg-[#F6D66D] text-[#252020]' : 'text-[#5A4F4F]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={oauthBusy !== null}
                    onClick={() => launchOAuth('google', oauthRole)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8] transition-colors disabled:opacity-60"
                  >
                    <GoogleGIcon />
                    <span>{oauthBusy === 'google' ? 'Connecting...' : 'Gmail Login'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={oauthBusy !== null}
                    onClick={() => launchOAuth('linkedin', oauthRole)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8] transition-colors disabled:opacity-60"
                  >
                    <LinkedInIcon />
                    <span>{oauthBusy === 'linkedin' ? 'Connecting...' : 'LinkedIn Login'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#6B5E5E]">
                <div className="flex-1 h-px bg-[#252020]/15" />
                <span className="font-medium">or log in manually</span>
                <div className="flex-1 h-px bg-[#252020]/15" />
              </div>

              <form onSubmit={handleSubmit(doLogin)} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5" htmlFor="login-email">
                    Email address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    {...register('email')}
                    placeholder="student@demo.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
                  />
                  {errors.email && <p className="mt-1 text-xs text-[#C83D42]">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" htmlFor="login-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPwd ? 'text' : 'password'}
                      {...register('password')}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A4F4F] hover:text-[#252020]"
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-[#C83D42]">{errors.password.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white font-bold text-sm hover:bg-[#B23237] disabled:opacity-60 transition-colors"
                >
                  {isSubmitting ? 'Logging in...' : 'Log in'}
                </button>
              </form>

              <div className="pt-5 border-t border-[#252020]/15">
                <div className="text-xs font-bold text-[#6B5E5E] mb-3">
                  Instant demo accounts (password: <span className="font-mono text-[#252020]">Demo@1234</span>)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => quickDemoLogin('student@demo.com')}
                    className="py-2 px-2.5 rounded-xl border-2 border-[#252020] bg-[#F6D66D]/60 text-xs font-bold hover:bg-[#F6D66D] transition-colors"
                  >
                    Student Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => quickDemoLogin('mentor@demo.com')}
                    className="py-2 px-2.5 rounded-xl border-2 border-[#252020] bg-[#F7A98A]/60 text-xs font-bold hover:bg-[#F7A98A] transition-colors"
                  >
                    Mentor Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => quickDemoLogin('admin@demo.com')}
                    className="py-2 px-2.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/40 transition-colors"
                  >
                    Admin Demo
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {setupModal && <OAuthSetupModal info={setupModal} onClose={closeSetupModal} />}
    </div>
  );
}
