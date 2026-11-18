import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Clock, AlertTriangle, Check, X, Video, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, BadgeChip, EmptyStateArt, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatPKT, formatReplyTime, type Badge, type Certificate, type Subscription } from '../shared/types';

interface DashboardData {
  role: string;
  subscription?: Subscription;
  quiz_done?: boolean;
  badges?: Badge[];
  certificates?: Certificate[];
  upcoming_sessions?: Array<{
    id: string;
    topic: string;
    start_at: string;
    meet_url: string;
    mentor_name?: string;
    mentor_avatar?: string | null;
    profession?: string;
    company?: string | null;
    student_name?: string;
    student_avatar?: string | null;
    grade_level?: string | null;
  }>;
  my_groups?: Array<{ id: string; name: string; members_count: number; niche_slug: string }>;
  suggested_mentors?: Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    profession: string;
    company: string | null;
    avg_reply_hours: number | null;
    rating: number | null;
    sessions_completed: number;
  }>;
  stale_requests?: Array<{
    id: string;
    receiver_name: string;
    hours_waiting: number;
    alternatives: Array<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      profession: string;
      company: string | null;
      avg_reply_hours: number | null;
    }>;
  }>;
  pending_count?: number;
  mentor_details?: {
    status: string;
    avg_reply_hours: number | null;
    rating: number | null;
    sessions_completed: number;
  };
  pending_requests?: Array<{
    id: string;
    requester_id: string;
    requester_name: string;
    requester_avatar: string | null;
    grade_level: string | null;
    school_name: string | null;
    city: string | null;
    message: string | null;
    hours_waiting: number;
    is_urgent: boolean;
  }>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const respondConnection = async (id: string, status: 'accepted' | 'declined') => {
    try {
      await apiFetch(`/api/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(status === 'accepted' ? 'Connection accepted! Reply time updated.' : 'Request declined.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading || !data) {
    return (
      <AppShell title="Dashboard">
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-[#F6D66D]/40 border-2 border-[#252020]/15 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-44 rounded-2xl bg-white border-2 border-[#252020]/15 animate-pulse" />
            <div className="h-44 rounded-2xl bg-white border-2 border-[#252020]/15 animate-pulse" />
          </div>
        </div>
      </AppShell>
    );
  }

  // PENDING MENTOR VIEW
  if (data.role === 'mentor' && data.mentor_details?.status !== 'approved') {
    return (
      <AppShell title="Profile Under Review">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border-2 border-[#252020] editorial-shadow p-8 space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] flex items-center justify-center">
            <Clock className="w-6 h-6 text-[#252020]" />
          </div>
          <h1 className="font-display text-2xl font-bold">
            {data.mentor_details?.status === 'rejected'
              ? 'Your mentor application was not approved'
              : 'Your mentor profile is under review'}
          </h1>
          <p className="text-sm text-[#4D4242] leading-relaxed">
            {data.mentor_details?.status === 'rejected'
              ? 'Please update your LinkedIn URL and bio in Settings if you would like to request another review.'
              : 'To protect high-school students, our team verifies every mentor’s LinkedIn profile before your card appears in Explore or accepts requests. You can refine your profile anytime while you wait.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/settings"
              className="px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-sm font-bold hover:bg-[#B23237]"
            >
              Edit Profile
            </Link>
            <Link
              to={`/u/${user?.id}`}
              className="px-5 py-2.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-sm font-bold hover:bg-[#F6D66D]/40"
            >
              Preview My Profile
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // APPROVED MENTOR VIEW
  if (data.role === 'mentor') {
    const stats = data.mentor_details;
    return (
      <AppShell title="Mentor Dashboard">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <Starburst size={26} color="#F6D66D" />
            <div>
              <h1 className="font-display text-3xl font-bold">Salam, {user?.full_name}</h1>
              <p className="text-sm text-[#5A4F4F] mt-0.5">
                Respond within 24 hours to stay at the top of student Explore results.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5">
              <div className="text-xs font-bold text-[#6B5E5E]">Average Reply Time</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                {stats?.avg_reply_hours !== null && stats?.avg_reply_hours !== undefined
                  ? `${stats.avg_reply_hours} hrs`
                  : 'New mentor'}
              </div>
            </div>
            <div className="bg-[#F6D66D]/45 rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5">
              <div className="text-xs font-bold text-[#252020]">Student Rating</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                {stats?.rating ? `${stats.rating} / 5.0` : 'No ratings yet'}
              </div>
            </div>
            <div className="bg-[#F7A98A]/35 rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5">
              <div className="text-xs font-bold text-[#252020]">Sessions Completed</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">{stats?.sessions_completed ?? 0}</div>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Pending Connection Requests</h2>
              <Link to="/connections" className="text-sm font-bold text-[#C83D42] hover:underline">
                View all →
              </Link>
            </div>

            {!data.pending_requests?.length ? (
              <EmptyStateArt
                title="All caught up!"
                subtitle="You have no pending student requests right now. Students can connect from Explore."
              />
            ) : (
              <div className="space-y-3">
                {data.pending_requests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <Avatar src={req.requester_avatar} name={req.requester_name} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/u/${req.requester_id}`} className="font-display font-bold hover:underline">
                            {req.requester_name}
                          </Link>
                          <span
                            className={`text-xs font-mono font-bold tabular-nums ${
                              req.is_urgent ? 'text-[#C83D42]' : 'text-[#6B5E5E]'
                            }`}
                          >
                            · Waiting {req.hours_waiting} hrs
                          </span>
                        </div>
                        <div className="text-xs text-[#6B5E5E] mt-0.5">
                          {[req.grade_level, req.school_name, req.city].filter(Boolean).join(' · ')}
                        </div>
                        {req.message && <p className="text-sm text-[#4D4242] mt-2">&ldquo;{req.message}&rdquo;</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => respondConnection(req.id, 'accepted')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                      >
                        <Check className="w-4 h-4" />
                        <span>Accept</span>
                      </button>
                      <button
                        onClick={() => respondConnection(req.id, 'declined')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
                      >
                        <X className="w-4 h-4" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Upcoming 1:1 Sessions</h2>
                <Link to="/sessions" className="text-xs font-bold text-[#C83D42] hover:underline">
                  Manage slots →
                </Link>
              </div>
              {!data.upcoming_sessions?.length ? (
                <p className="text-sm text-[#5A4F4F]">
                  No booked sessions yet.{' '}
                  <Link to="/sessions" className="text-[#C83D42] font-bold hover:underline">
                    Add availability slots →
                  </Link>
                </p>
              ) : (
                <div className="space-y-3">
                  {data.upcoming_sessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{s.student_name}</div>
                        <div className="text-xs text-[#6B5E5E] truncate">{s.topic}</div>
                        <div className="text-xs font-mono text-[#252020] mt-1">{formatPKT(s.start_at)}</div>
                      </div>
                      <a
                        href={s.meet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold shrink-0"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">My Niche Groups</h2>
                <Link to="/groups" className="text-xs font-bold text-[#C83D42] hover:underline">
                  All groups →
                </Link>
              </div>
              {!data.my_groups?.length ? (
                <p className="text-sm text-[#5A4F4F]">
                  You haven&apos;t created a group yet.{' '}
                  <Link to="/groups" className="text-[#C83D42] font-bold hover:underline">
                    Create a niche group →
                  </Link>
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.my_groups.map((g) => (
                    <Link
                      key={g.id}
                      to={`/groups/${g.id}`}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 hover:border-[#C83D42]"
                    >
                      <span className="font-bold text-sm">{g.name}</span>
                      <span className="text-xs text-[#6B5E5E] tabular-nums">{g.members_count} members</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // STUDENT VIEW
  const sub = data.subscription;
  const passportSteps =
    (data.quiz_done ? 1 : 0) +
    ((data.badges?.length || 0) > 0 ? 1 : 0) +
    ((data.certificates?.length || 0) > 0 ? 1 : 0);
  const passportPercent = Math.min(100, Math.round(((passportSteps + 1) / 4) * 100));
  const ringCircumference = 2 * Math.PI * 30;
  const ringOffset = ringCircumference - (passportPercent / 100) * ringCircumference;

  return (
    <AppShell title="Student Dashboard">
      <div className="space-y-8">
        {/* Header + Trial Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Starburst size={26} color="#F6D66D" />
            <div>
              <h1 className="font-display text-3xl font-bold">
                Hi, <span className="italic text-[#C83D42]">{user?.full_name?.split(' ')[0]}!</span>
              </h1>
              <p className="text-sm text-[#5A4F4F] mt-0.5">Keep exploring. Your future is waiting.</p>
            </div>
          </div>

          {sub && sub.effective_plan === 'trial' && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white border-2 border-[#252020] editorial-shadow-sm">
              <div className="text-xs">
                <span className="font-bold">{sub.days_left} days left in trial</span>
                <span className="text-[#6B5E5E]"> · {sub.free_sessions_left} free 1:1 left</span>
              </div>
              <Link
                to="/pricing"
                className="px-3.5 py-1.5 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold whitespace-nowrap"
              >
                Upgrade
              </Link>
            </div>
          )}

          {sub && sub.effective_plan === 'expired' && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#F7A98A]/45 border-2 border-[#252020]">
              <div className="text-xs font-bold text-[#252020]">Your 7-day trial has ended</div>
              <Link
                to="/pricing"
                className="px-3.5 py-1.5 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold whitespace-nowrap"
              >
                Unlock Mentors
              </Link>
            </div>
          )}
        </div>

        {/* Career Fit Quiz Spotlight + Colourful Progress Ring + Upcoming Session */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#252020]">
                <Sparkles className="w-4 h-4 text-[#C83D42]" />
                <span>{data.quiz_done ? 'Career Fit Completed' : 'Start Here'}</span>
              </div>
              <h2 className="font-display text-2xl font-bold">
                {data.quiz_done ? 'View your Career Fit results' : 'Complete your Career Fit Quiz'}
              </h2>
              <p className="text-sm text-[#252020]/85">
                {data.quiz_done
                  ? 'Review your top RIASEC traits, 3 matched careers, and recommended mentors.'
                  : 'Get personalized Pakistani degree recommendations and mentor matches in 2 minutes.'}
              </p>
            </div>
            <div>
              <Link
                to="/quiz/career-fit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#252020] text-white font-display text-sm font-bold hover:bg-[#3A3232] transition-colors"
              >
                <span>{data.quiz_done ? 'See Matches' : 'Take the Quiz'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Colourful Career Passport Progress Ring */}
          <div className="lg:col-span-3 bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-[#252020]">Your Progress</span>
              <Link to={`/u/${user?.id}`} className="text-xs font-bold text-[#C83D42] hover:underline">
                Passport →
              </Link>
            </div>

            <div className="my-3 flex items-center gap-4">
              <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
                <circle cx="38" cy="38" r="30" fill="none" stroke="#FFF5E8" strokeWidth="9" />
                <circle
                  cx="38"
                  cy="38"
                  r="30"
                  fill="none"
                  stroke="#C83D42"
                  strokeWidth="9"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 38 38)"
                />
                <text
                  x="38"
                  y="42"
                  textAnchor="middle"
                  className="font-display font-bold text-sm fill-[#252020]"
                >
                  {passportPercent}%
                </text>
              </svg>
              <div>
                <div className="font-display font-bold text-sm leading-snug">Career Passport</div>
                <div className="text-xs text-[#6B5E5E] mt-1 tabular-nums">
                  {data.badges?.length || 0} badges · {data.certificates?.length || 0} certs
                </div>
              </div>
            </div>

            <div className="h-2 rounded-full bg-[#FFF5E8] border border-[#252020]/15 overflow-hidden flex">
              <div className="bg-[#C83D42] h-full" style={{ width: `${Math.min(50, passportPercent)}%` }} />
              <div
                className="bg-[#F6D66D] h-full"
                style={{ width: `${Math.max(0, passportPercent - 50)}%` }}
              />
            </div>
          </div>

          <div className="lg:col-span-3 bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-[#252020]">Upcoming Session</span>
              <Link to="/sessions" className="text-xs font-bold text-[#C83D42] hover:underline">
                All →
              </Link>
            </div>
            {data.upcoming_sessions && data.upcoming_sessions.length > 0 ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="font-display font-bold text-sm truncate">{data.upcoming_sessions[0].mentor_name}</div>
                  <div className="text-xs text-[#6B5E5E] truncate">{data.upcoming_sessions[0].topic}</div>
                  <div className="text-xs font-mono text-[#252020] mt-1">
                    {formatPKT(data.upcoming_sessions[0].start_at)}
                  </div>
                </div>
                <Link
                  to="/sessions"
                  className="inline-flex items-center justify-center w-full py-2 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/50"
                >
                  Open Session
                </Link>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[#6B5E5E]">No sessions booked yet.</p>
                <Link
                  to="/explore"
                  className="inline-flex items-center justify-center w-full py-2 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/50"
                >
                  Find a mentor →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* 24-Hour Promise Alert */}
        {data.stale_requests && data.stale_requests.length > 0 && (
          <div className="bg-[#F7A98A]/35 rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            {data.stale_requests.map((sr) => (
              <div key={sr.id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-[#C83D42] shrink-0 mt-0.5" />
                  <div className="font-display font-bold text-sm">
                    {sr.receiver_name} hasn&apos;t replied yet ({sr.hours_waiting} hrs). Here are similar mentors:
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {sr.alternatives.map((alt) => (
                    <Link
                      key={alt.id}
                      to={`/u/${alt.id}`}
                      className="p-3.5 rounded-xl bg-white border-2 border-[#252020] hover:-translate-y-0.5 transition-transform flex items-center gap-3"
                    >
                      <Avatar src={alt.avatar_url} name={alt.full_name} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{alt.full_name}</div>
                        <div className="text-xs text-[#6B5E5E] truncate">{formatReplyTime(alt.avg_reply_hours)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggested Mentors */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Suggested Mentors</h2>
            <Link to="/explore" className="text-sm font-bold text-[#C83D42] hover:underline">
              Explore all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.suggested_mentors?.map((m) => (
              <Link
                key={m.id}
                to={`/u/${m.id}`}
                className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex items-center justify-between gap-4 hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar src={m.avatar_url} name={m.full_name} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-bold text-base truncate">{m.full_name}</span>
                      <VerifiedIcon />
                    </div>
                    <div className="text-sm text-[#4D4242] truncate">
                      {m.profession}
                      {m.company ? ` · ${m.company}` : ''}
                    </div>
                    <div className="text-xs text-[#6B5E5E] mt-1 tabular-nums">
                      {formatReplyTime(m.avg_reply_hours)} · {m.rating ? `${m.rating} ★` : 'New'}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[#C83D42] shrink-0" />
              </Link>
            ))}
          </div>
        </section>

        {/* Groups & Sticker Badges */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">My Groups</h2>
              <Link to="/groups" className="text-xs font-bold text-[#C83D42] hover:underline">
                Browse groups →
              </Link>
            </div>
            {!data.my_groups?.length ? (
              <EmptyStateArt
                title="No groups joined yet"
                subtitle="Join a career niche group to ask questions and read mentor answers."
                action={
                  <Link
                    to="/groups"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-xs font-bold text-white"
                  >
                    <Users className="w-4 h-4" />
                    <span>Explore Groups</span>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {data.my_groups.map((g) => (
                  <Link
                    key={g.id}
                    to={`/groups/${g.id}`}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 hover:border-[#C83D42]"
                  >
                    <span className="font-bold text-sm">{g.name}</span>
                    <span className="text-xs text-[#6B5E5E] tabular-nums">{g.members_count} members</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">My Collectible Badges</h2>
              <Link to={`/u/${user?.id}`} className="text-xs font-bold text-[#C83D42] hover:underline">
                Career Passport →
              </Link>
            </div>
            {!data.badges?.length ? (
              <EmptyStateArt
                title="Start collecting stickers"
                subtitle="Finish the Career Fit Quiz or complete your first 1:1 session to unlock your first badge."
                action={
                  <Link
                    to="/quiz/career-fit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-xs font-bold text-[#252020]"
                  >
                    <span>Take Career Fit Quiz</span>
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {data.badges.map((b) => (
                  <BadgeChip key={b.id} type={b.type} label={b.label} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
