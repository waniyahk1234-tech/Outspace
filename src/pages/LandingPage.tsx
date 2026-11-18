import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ShieldCheck, Video, Award, Building2 } from 'lucide-react';
import { apiFetch, useAuth } from '../lib/api';
import { Avatar, BrandLogo, NicheIcon, OrbitDoodle, SparkDoodle, Starburst, VerifiedIcon } from '../components/BrandMark';
import { formatReplyTime, type Niche } from '../shared/types';

interface MentorSummary {
  id: string;
  full_name: string;
  avatar_url: string | null;
  city: string | null;
  profession: string;
  company: string | null;
  niches: string[];
  avg_reply_hours: number | null;
  rating: number | null;
  sessions_completed: number;
}

const LANDING_NAV = [
  { id: 'careers', label: 'Careers' },
  { id: 'mentors', label: 'Mentors' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'pricing', label: 'Pricing' },
] as const;

export default function LandingPage() {
  const { user } = useAuth();
  const [niches, setNiches] = useState<Niche[]>([]);
  const [mentors, setMentors] = useState<MentorSummary[]>([]);
  const [activeNav, setActiveNav] = useState<string>('careers');
  const [focusedSection, setFocusedSection] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches.slice(0, 6)))
      .catch(() => {});
    apiFetch<{ mentors: MentorSummary[] }>('/api/explore')
      .then((d) => setMentors(d.mentors.slice(0, 3)))
      .catch(() => {});
  }, []);

  const handleNavClick = (sectionId: string) => {
    setActiveNav(sectionId);
    setFocusedSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      setFocusedSection((prev) => (prev === sectionId ? null : prev));
    }, 650);
  };

  const nicheTileColors = [
    'bg-[#C83D42] text-white',
    'bg-[#F6D66D] text-[#252020]',
    'bg-[#F7A98A] text-[#252020]',
    'bg-[#252020] text-white',
    'bg-[#E45B4D] text-white',
    'bg-[#FADFA1] text-[#252020]',
  ];

  return (
    <div className="min-h-screen bg-[#FFF5E8] text-[#252020]">
      {/* Top Bar Contract with sliding active indicator on click */}
      <header className="sticky top-0 z-30 bg-[#FFF5E8]/95 backdrop-blur border-b border-[#252020]/12">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-8">
          <Link to="/">
            <BrandLogo />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#4D4242]">
            {LANDING_NAV.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive ? 'text-[#C83D42]' : 'text-[#4D4242] hover:text-[#252020]'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="landing-nav-underline"
                      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                      className="absolute left-0 right-0 -bottom-0.5 h-[3px] rounded-full bg-[#C83D42]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <Link
                to="/dashboard"
                className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:-translate-y-0.5 transition-transform whitespace-nowrap"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-sm font-bold text-[#252020] hover:bg-[#F6D66D]/40 transition-colors whitespace-nowrap"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:-translate-y-0.5 transition-transform whitespace-nowrap"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section — Oversized Editorial Typography + Illustration */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-8 pt-10 pb-14 md:pt-14 md:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 text-sm font-bold text-[#C83D42]">
              <Starburst size={18} color="#F6D66D" />
              <span>For Matric, O-Level, Intermediate &amp; A-Level students in Pakistan</span>
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-[62px] font-bold tracking-tight leading-[1.03] text-[#252020] text-balance">
              Your Future is an Entire{' '}
              <span className="relative inline-block italic text-[#C83D42]">
                Universe.
                <svg
                  className="w-full h-3 -mt-1 text-[#F6D66D]"
                  viewBox="0 0 220 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 9C48 2 135 2 217 10"
                    stroke="#C83D42"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            <p className="text-base sm:text-lg text-[#4D4242] leading-relaxed max-w-xl">
              Talk to someone who actually does the job before you choose your degree. Explore real Pakistani career paths, connect with verified mentors, and build your Career Passport.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link
                to={user ? '/explore' : '/signup'}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow text-white font-display font-bold text-sm hover:-translate-y-0.5 transition-transform whitespace-nowrap"
              >
                <span>Explore Careers</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/signup?role=mentor"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl border-2 border-[#252020] bg-white text-[#252020] font-display font-bold text-sm hover:bg-[#F6D66D]/50 transition-colors whitespace-nowrap"
              >
                <span>Become a Mentor</span>
              </Link>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#5A4F4F]">
              <span>7-day free student trial</span>
              <span aria-hidden="true">·</span>
              <span>1 free 1:1 video session</span>
              <span aria-hidden="true">·</span>
              <span>LinkedIn-verified mentors</span>
            </div>
          </div>

          <div className="lg:col-span-6 relative">
            <div className="hidden sm:block absolute -top-5 -left-4 z-10">
              <SparkDoodle />
            </div>
            <div className="hidden sm:block absolute -bottom-4 -right-3 z-10">
              <OrbitDoodle />
            </div>
            <div className="rounded-3xl overflow-hidden border-2 border-[#252020] editorial-shadow bg-[#FFF5E8]">
              <img
                src="/src/assets/images/hero_outspace_student_1795032880385.jpg"
                alt="Pakistani high-school student exploring careers on Outspace"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Explore Careers — Colourful Category Blocks */}
      <motion.section
        id="careers"
        animate={focusedSection === 'careers' ? { x: [14, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 scroll-mt-20"
      >
        <div className="flex items-end justify-between gap-4 mb-7">
          <div className="flex items-center gap-2.5">
            <Starburst size={22} color="#F6D66D" />
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#252020]">
                Explore <span className="italic text-[#C83D42]">Careers</span>
              </h2>
              <p className="mt-0.5 text-sm text-[#5A4F4F]">
                Day-in-the-life guides, local degrees, and real Pakistani salary ranges.
              </p>
            </div>
          </div>
          <Link
            to={user ? '/explore?tab=careers' : '/signup'}
            className="text-sm font-bold text-[#C83D42] hover:underline whitespace-nowrap"
          >
            View all 10 careers →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {niches.map((niche, idx) => (
            <Link
              key={niche.slug}
              to={user ? `/careers/${niche.slug}` : '/signup'}
              className={`rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex flex-col justify-between min-h-[150px] transition-transform hover:-translate-y-1 ${nicheTileColors[idx % nicheTileColors.length]}`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/25 border border-current/25 flex items-center justify-center">
                <NicheIcon name={niche.icon} className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <div className="font-display font-bold text-sm leading-snug">{niche.name}</div>
                <div className="text-[11px] opacity-85 mt-1 font-medium">{niche.salary_range_pkr}</div>
              </div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* Meet Our Mentors — Portrait-Forward Cards */}
      <motion.section
        id="mentors"
        animate={focusedSection === 'mentors' ? { x: [14, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 scroll-mt-20"
      >
        <div className="flex items-end justify-between gap-4 mb-7">
          <div className="flex items-center gap-2.5">
            <Starburst size={22} color="#F7A98A" />
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#252020]">Meet Our Verified Mentors</h2>
              <p className="mt-0.5 text-sm text-[#5A4F4F]">
                Every mentor is vetted via LinkedIn before appearing in student search.
              </p>
            </div>
          </div>
          <Link
            to={user ? '/explore' : '/signup'}
            className="text-sm font-bold text-[#C83D42] hover:underline whitespace-nowrap"
          >
            Browse all mentors →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {mentors.map((mentor) => (
            <Link
              key={mentor.id}
              to={`/u/${mentor.id}`}
              className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex items-start gap-4 hover:-translate-y-1 transition-transform"
            >
              <Avatar src={mentor.avatar_url} name={mentor.full_name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-base truncate">{mentor.full_name}</span>
                  <VerifiedIcon />
                </div>
                <div className="text-sm font-medium text-[#4D4242] truncate">
                  {mentor.profession}
                  {mentor.company ? ` · ${mentor.company}` : ''}
                </div>
                <div className="mt-2 text-xs text-[#6B5E5E] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                  <span className="font-semibold text-[#252020]">
                    {mentor.rating ? `${mentor.rating} ★` : 'New'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{mentor.sessions_completed} sessions</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatReplyTime(mentor.avg_reply_hours)}</span>
                </div>
                <div className="mt-2.5 text-xs font-semibold text-[#C83D42] truncate">
                  {mentor.niches.map((n) => n.replace(/-/g, ' ')).join(' · ')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* How It Works — Expressive Asymmetric Editorial Band */}
      <motion.section
        id="how-it-works"
        animate={focusedSection === 'how-it-works' ? { x: [14, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white border-y-2 border-[#252020] py-16 scroll-mt-20"
      >
        <div className="max-w-[1200px] mx-auto px-4 md:px-8">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#252020] text-balance">
              Why guess a 4-year degree when you can ask in <span className="italic text-[#C83D42]">30 minutes?</span>
            </h2>
            <p className="mt-3 text-[#5A4F4F] text-base">
              Too many students pick MBBS or engineering out of family pressure without talking to anyone in the job. Outspace turns guesswork into real mentorship.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3">
              <div className="inline-block px-2.5 py-1 rounded-lg bg-[#F6D66D] border border-[#252020] text-xs font-mono font-bold">
                01. DISCOVER
              </div>
              <h3 className="font-display text-xl font-bold">Take the Career Fit Quiz</h3>
              <p className="text-sm text-[#4D4242] leading-relaxed">
                Answer 12 quick RIASEC questions to uncover 3 careers that match your strengths—plus Pakistani universities and PKR salaries.
              </p>
            </div>
            <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3">
              <div className="inline-block px-2.5 py-1 rounded-lg bg-[#F7A98A] border border-[#252020] text-xs font-mono font-bold">
                02. CONNECT
              </div>
              <h3 className="font-display text-xl font-bold">Book a 1:1 or Join a Group</h3>
              <p className="text-sm text-[#4D4242] leading-relaxed">
                Message verified mentors in Karachi, Lahore, and Islamabad or book a 1:1 Jitsi video call scheduled in PKT.
              </p>
            </div>
            <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3">
              <div className="inline-block px-2.5 py-1 rounded-lg bg-[#C83D42] text-white border border-[#252020] text-xs font-mono font-bold">
                03. PROVE IT
              </div>
              <h3 className="font-display text-xl font-bold">Build Your Career Passport</h3>
              <p className="text-sm text-[#4D4242] leading-relaxed">
                Earn collectible sticker badges and QR-verifiable PDF certificates you can share with parents, schools, and university counselors.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#F6D66D] border border-[#252020] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#252020]" />
              </div>
              <h3 className="font-display text-xl font-bold">For Pakistani Professionals</h3>
              <p className="text-sm text-[#4D4242] leading-relaxed">
                Spend 45 minutes a week helping high-school students avoid years in the wrong degree. Host niche Q&amp;A groups and quizzes.
              </p>
              <Link
                to="/signup?role=mentor"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#C83D42] hover:underline"
              >
                <span>Apply as a mentor</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#F7A98A] border border-[#252020] flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#252020]" />
              </div>
              <h3 className="font-display text-xl font-bold">For Schools &amp; Colleges</h3>
              <p className="text-sm text-[#4D4242] leading-relaxed">
                Give your O-Level, A-Level, Matric, and Intermediate cohorts instant access via school seat codes (try{' '}
                <span className="font-mono font-bold">DEMO2026</span>).
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#C83D42] hover:underline"
              >
                <span>Redeem a school code</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Pricing Preview */}
      <motion.section
        id="pricing"
        animate={focusedSection === 'pricing' ? { x: [14, 0] } : { x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[1200px] mx-auto px-4 md:px-8 py-16 scroll-mt-20"
      >
        <div className="max-w-xl mb-10">
          <h2 className="font-display text-3xl sm:text-4xl font-bold">Simple student pricing in PKR</h2>
          <p className="mt-2 text-sm text-[#5A4F4F]">
            Career guides, the Career Fit Quiz, groups, and mentor quizzes are always free.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="text-sm font-bold text-[#6B5E5E]">7-Day Trial</div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">PKR 0</div>
              <p className="mt-2 text-sm text-[#5A4F4F]">Automatic on student signup.</p>
              <ul className="mt-5 space-y-2.5 text-sm text-[#4D4242]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> 1 free 1:1 mentor video session
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Direct mentor messaging for 7 days
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Career Passport &amp; PDF certificates
                </li>
              </ul>
            </div>
            <Link
              to="/signup"
              className="mt-6 w-full inline-flex justify-center py-2.5 px-4 rounded-xl border-2 border-[#252020] font-bold text-sm hover:bg-[#F6D66D]/40 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>

          <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] editorial-shadow p-6 flex flex-col justify-between">
            <div>
              <div className="inline-block px-2.5 py-0.5 rounded-lg bg-[#F6D66D] border border-[#252020] text-xs font-bold">
                Most Popular · Monthly
              </div>
              <div className="mt-3 font-display text-3xl font-bold tabular-nums">
                PKR 999 <span className="text-sm font-normal text-[#6B5E5E]">/ month</span>
              </div>
              <p className="mt-2 text-sm text-[#4D4242]">For active degree exploration before admissions.</p>
              <ul className="mt-5 space-y-2.5 text-sm text-[#252020]">
                <li className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#C83D42]" /> Unlimited 1:1 mentor bookings
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Unlimited mentor connect &amp; chat
                </li>
                <li className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#C83D42]" /> JazzCash, Easypaisa &amp; Card supported
                </li>
              </ul>
            </div>
            <Link
              to="/signup"
              className="mt-6 w-full inline-flex justify-center py-2.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white font-bold text-sm hover:bg-[#B23237] transition-colors"
            >
              Get Started
            </Link>
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="text-sm font-bold text-[#C83D42]">Yearly · Save 33%</div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums">
                PKR 7,999 <span className="text-sm font-normal text-[#6B5E5E]">/ year</span>
              </div>
              <p className="mt-2 text-sm text-[#5A4F4F]">Full-year mentorship across O/A-Levels or FSc.</p>
              <ul className="mt-5 space-y-2.5 text-sm text-[#4D4242]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Everything in Monthly for 12 months
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C83D42]" /> Or redeem your school code for free access
                </li>
              </ul>
            </div>
            <Link
              to="/signup"
              className="mt-6 w-full inline-flex justify-center py-2.5 px-4 rounded-xl border-2 border-[#252020] font-bold text-sm hover:bg-[#F6D66D]/40 transition-colors"
            >
              Choose Yearly
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Quiet Footer */}
      <footer className="border-t-2 border-[#252020]/15 bg-[#FFF5E8] py-8">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#5A4F4F]">
          <BrandLogo />
          <div className="flex items-center gap-6 font-semibold">
            <Link to="/login" className="hover:text-[#252020]">Log in</Link>
            <Link to="/signup" className="hover:text-[#252020]">Sign up</Link>
            <button type="button" onClick={() => handleNavClick('careers')} className="hover:text-[#252020]">
              Careers
            </button>
          </div>
          <div>Serious opportunities, playful experiences · All times PKT</div>
        </div>
      </footer>
    </div>
  );
}
