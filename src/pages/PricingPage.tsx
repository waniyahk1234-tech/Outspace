import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Building2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatPKTDateOnly, type Subscription } from '../shared/types';

export default function PricingPage() {
  const { refreshUser } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [instCode, setInstCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const [checkoutPlan, setCheckoutPlan] = useState<'monthly' | 'yearly' | null>(null);
  const [processingMethod, setProcessingMethod] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<{ subscription: Subscription | null }>('/api/pricing')
      .then((d) => setSub(d.subscription))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instCode.trim()) return;
    setRedeeming(true);
    try {
      const res = await apiFetch<{ institution_name: string; subscription: Subscription }>('/api/pricing/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: instCode }),
      });
      setSub(res.subscription);
      await refreshUser();
      toast.success(`Unlocked via ${res.institution_name}!`);
      setInstCode('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRedeeming(false);
    }
  };

  const runMockCheckout = async (method: 'JazzCash' | 'Easypaisa' | 'Card') => {
    if (!checkoutPlan) return;
    setProcessingMethod(method);
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await apiFetch<{ subscription: Subscription }>('/api/pricing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: checkoutPlan, method }),
      });
      setSub(res.subscription);
      await refreshUser();
      toast.success(`${checkoutPlan === 'yearly' ? 'Yearly' : 'Monthly'} plan activated!`);
      setCheckoutPlan(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessingMethod(null);
    }
  };

  const isInstitution = sub?.effective_plan === 'institution';

  return (
    <AppShell title="Pricing & Plans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Starburst size={26} color="#F6D66D" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              Your <span className="italic text-[#C83D42]">Outpase</span> Plan
            </h1>
            <p className="text-sm text-[#5A4F4F] mt-0.5">
              Browse careers, take quizzes, and join niche groups free forever. Unlock unlimited 1:1 mentor sessions and
              messaging below.
            </p>
          </div>
        </div>

        {/* Current Plan Summary */}
        {sub && (
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[#C83D42] uppercase tracking-wider">Current Status</div>
              <div className="font-display text-xl font-bold mt-1 capitalize">
                {sub.effective_plan === 'institution'
                  ? `Institution Plan (${sub.institution_name || 'School Covered'})`
                  : sub.effective_plan === 'trial'
                    ? `7-Day Free Trial (${sub.days_left} days left)`
                    : sub.effective_plan === 'expired'
                      ? 'Trial Expired'
                      : `${sub.effective_plan} Plan Active`}
              </div>
              {sub.effective_plan === 'trial' && (
                <p className="text-xs text-[#5A4F4F] mt-1">
                  {sub.free_sessions_left} free 1:1 booking remaining · Ends{' '}
                  {sub.trial_ends_at ? formatPKTDateOnly(sub.trial_ends_at) : ''}
                </p>
              )}
              {(sub.effective_plan === 'monthly' || sub.effective_plan === 'yearly') && sub.current_period_end && (
                <p className="text-xs text-[#5A4F4F] mt-1">
                  Active until {formatPKTDateOnly(sub.current_period_end)} (PKT)
                </p>
              )}
            </div>
            {isInstitution && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-[#252020]" />
                <span>Full Access Covered by School</span>
              </div>
            )}
          </div>
        )}

        {/* Paid plans hidden once student is covered by an institution */}
        {!isInstitution && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between space-y-6">
                <div>
                  <div className="text-sm font-bold text-[#6B5E5E]">Monthly Plan</div>
                  <div className="mt-2 font-display text-3xl font-bold tabular-nums">
                    PKR 999 <span className="text-sm font-normal text-[#6B5E5E]">/ month</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-[#4D4242]">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Unlimited 1:1 video bookings
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Unlimited mentor connect &amp; live chat
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Downloadable QR PDF certificates
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => setCheckoutPlan('monthly')}
                  className="w-full py-3 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white font-display text-sm font-bold hover:bg-[#B23237]"
                >
                  Choose Monthly (PKR 999)
                </button>
              </div>

              <div className="bg-[#F6D66D] rounded-3xl border-2 border-[#252020] editorial-shadow p-6 flex flex-col justify-between space-y-6">
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-lg bg-white border border-[#252020] text-xs font-bold text-[#C83D42]">
                    Yearly Plan · Save 33%
                  </div>
                  <div className="mt-3 font-display text-3xl font-bold tabular-nums">
                    PKR 7,999 <span className="text-sm font-normal text-[#252020]/75">/ year</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-[#252020]">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Everything in Monthly for 365 days
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Full year of university &amp; career prep
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Save PKR 3,989 vs monthly billing
                    </li>
                  </ul>
                </div>
                <button
                  onClick={() => setCheckoutPlan('yearly')}
                  className="w-full py-3 px-4 rounded-xl bg-[#252020] text-white font-display text-sm font-bold hover:bg-[#3A3232]"
                >
                  Choose Yearly (PKR 7,999)
                </button>
              </div>
            </div>

            {/* Institution Code Redemption */}
            <form
              onSubmit={handleRedeem}
              className="bg-[#F7A98A]/35 rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3"
            >
              <div className="flex items-center gap-2 font-display font-bold text-lg">
                <Building2 className="w-5 h-5 text-[#C83D42]" />
                <span>I have an institution code</span>
              </div>
              <p className="text-xs text-[#4D4242]">
                If your school or college partnered with Outpase, enter your access code (demo code:{' '}
                <span className="font-mono font-bold text-[#252020]">DEMO2026</span>).
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <input
                  value={instCode}
                  onChange={(e) => setInstCode(e.target.value)}
                  placeholder="Enter code (e.g. DEMO2026)"
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm font-mono uppercase focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={redeeming}
                  className="px-6 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-sm font-bold hover:bg-[#B23237] disabled:opacity-60"
                >
                  {redeeming ? 'Checking...' : 'Redeem Code'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* Mock Checkout Modal */}
        {checkoutPlan && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-5">
              <div>
                <div className="text-xs font-mono font-bold text-[#C83D42]">DEMO PAYMENT · NO MONEY CHARGED</div>
                <h3 className="font-display text-xl font-bold mt-1">
                  Pay {checkoutPlan === 'yearly' ? 'PKR 7,999 (1 Year)' : 'PKR 999 (1 Month)'}
                </h3>
                <p className="text-xs text-[#5A4F4F] mt-1">
                  Select any payment method below to simulate checkout (1.5s).
                </p>
              </div>

              <div className="space-y-2.5">
                {(['JazzCash', 'Easypaisa', 'Card'] as const).map((method) => (
                  <button
                    key={method}
                    disabled={Boolean(processingMethod)}
                    onClick={() => runMockCheckout(method)}
                    className="w-full p-3.5 rounded-xl border-2 border-[#252020]/35 hover:border-[#252020] hover:bg-[#FFF5E8] flex items-center justify-between text-sm font-bold disabled:opacity-60 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4 text-[#C83D42]" />
                      <span>{method}</span>
                    </span>
                    <span className="text-xs text-[#6B5E5E]">
                      {processingMethod === method ? 'Processing...' : 'Pay now →'}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={Boolean(processingMethod)}
                onClick={() => setCheckoutPlan(null)}
                className="w-full py-2 text-xs font-bold text-[#6B5E5E]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
