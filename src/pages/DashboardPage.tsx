import React, { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  AlertTriangle,
  Check,
  X,
  Video,
  Users,
  Sparkles,
  Trophy,
  MapPin,
  Lock,
  Bell,
  FileText,
  Send,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, BadgeChip, EmptyStateArt, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import {
  formatPKT,
  formatPKTDateOnly,
  formatReplyTime,
  type Badge,
  type Certificate,
  type CourseAssignment,
  type GroupQASession,
  type LeaderboardEntry,
  type MentorUpdate,
  type Subscription,
} from '../shared/types';

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
    vip_partner?: string | null;
    verification_deadline_at?: string | null;
    monthly_connections_used?: number;
    monthly_connections_limit?: number;
    topics?: string[];
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
  leaderboard_preview?: LeaderboardEntry[];
  my_updates?: MentorUpdate[];
  cycle_month?: string;
  cycle_ends_at?: string;
  active_courses?: Array<{
    id: string;
    niche_slug: string;
    title: string;
    duration_label: string;
    competition_title: string;
    competition_brief: string;
    meetup_venue: string;
    meetup_date_label: string;
    cohort_count: number;
    module_count: number;
    completed_count: number;
    has_entered_competition: boolean;
    has_submitted_assignment?: boolean;
  }>;
  messaging_unlocked?: boolean;
  one_on_one_unlocked?: boolean;
  leaderboard_rank?: number | null;
  is_competition_winner?: boolean;
  followed_updates?: MentorUpdate[];
  upcoming_group_qas?: GroupQASession[];
  my_assignments?: CourseAssignment[];
}

function getRemainingTimeParts(endIso?: string) {
  const targetMs = endIso ? new Date(endIso).getTime() : Date.now() + 12 * 24 * 3600 * 1000;
  const diff = Math.max(0, targetMs - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(() => getRemainingTimeParts());

  // Mentor Update / Masterclass Composer
  const [updateKind, setUpdateKind] = useState<'masterclass' | 'update' | 'cohort'>('masterclass');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateBody, setUpdateBody] = useState('');
  const [updateMediaUrl, setUpdateMediaUrl] = useState('');
  const [postingUpdate, setPostingUpdate] = useState(false);

  const load = useCallback(() => {
    apiFetch<DashboardData>('/api/dashboard')
      .then((d) => {
        setData(d);
        setCountdown(getRemainingTimeParts(d.cycle_ends_at));
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.cycle_ends_at) return;
    setCountdown(getRemainingTimeParts(data.cycle_ends_at));
    const timer = window.setInterval(() => {
      setCountdown(getRemainingTimeParts(data.cycle_ends_at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data?.cycle_ends_at]);

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const respondConnection = async (id: string, status: 'accepted' | 'declined') => {
    try {
      await apiFetch(`/api/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(
        status === 'accepted'
          ? 'Connection accepted! Automated welcome note sent to student.'
          : 'Request declined.'
      );
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const publishMentorUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostingUpdate(true);
    try {
      await apiFetch('/api/mentors/updates', {
        method: 'POST',
        body: JSON.stringify({
          kind: updateKind,
          title: updateTitle,
          body: updateBody,
          media_url: updateMediaUrl || null,
        }),
      });
      toast.success('Published to your student followers!');
      setUpdateTitle('');
      setUpdateBody('');
      setUpdateMediaUrl('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPostingUpdate(false);
    }
  };

  const toggleQnaRsvp = async (meetingId: string) => {
    try {
      const res = await apiFetch<{ ok: boolean; has_rsvped: boolean }>(`/api/groups/seminars/${meetingId}/rsvp`, {
        method: 'POST',
      });
      toast.success(res.has_rsvped ? 'RSVP confirmed for Group Q&A!' : 'RSVP removed.');
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

  // PENDING MENTOR VIEW (48-Hour Verification Window)
  if (data.role === 'mentor' && data.mentor_details?.status !== 'approved') {
    const deadlineIso = data.mentor_details?.verification_deadline_at;
    const hoursLeft = deadlineIso
      ? Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / (3600 * 1000)))
      : 48;

    return (
      <AppShell title="48-Hour Mentor Verification">
        <div className="space-y-8">
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-[#252020]" />
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold">
                    {data.mentor_details?.status === 'rejected'
                      ? 'Your mentor application was not approved'
                      : '48-Hour Verification in Progress'}
                  </h1>
                  <p className="text-sm text-[#4D4242] mt-1 leading-relaxed">
                    {data.mentor_details?.status === 'rejected'
                      ? 'Please update your LinkedIn URL and bio in Settings if you would like to request another review.'
                      : 'Since you joined without a VIP partner invite code, the Outpase team verifies your LinkedIn profile and expertise within 48 hours. Once approved, your Verified badge turns on and all teaching tools unlock.'}
                  </p>
                </div>
              </div>
              {data.mentor_details?.status !== 'rejected' && (
                <div className="px-4 py-2.5 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020] text-center shrink-0">
                  <div className="font-mono text-[11px] font-bold uppercase text-[#C83D42]">Estimated Window</div>
                  <div className="font-display text-xl font-bold tabular-nums">{hoursLeft}h remaining</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#252020]">
                  <Lock className="w-3.5 h-3.5 text-[#C83D42]" />
                  <span>Locked Until Verified</span>
                </div>
                <p className="text-xs text-[#5A4F4F]">
                  Recording courses, publishing 1:1 meeting slots, hosting Group Q&amp;As, and accepting student requests stay paused during review.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#F6D66D]/35 border border-[#252020]/25 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#252020]">
                  <Trophy className="w-3.5 h-3.5 text-[#C83D42]" />
                  <span>Open Right Now</span>
                </div>
                <p className="text-xs text-[#4D4242]">
                  Browse the Top Student Leaderboard below to click on students and inspect their submitted course videos &amp; presentations.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/leaderboard"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-sm font-bold hover:bg-[#B23237]"
              >
                <Trophy className="w-4 h-4" />
                <span>Browse Top Student Leaderboard →</span>
              </Link>
              <Link
                to="/settings"
                className="px-5 py-2.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-sm font-bold hover:bg-[#F6D66D]/40"
              >
                Edit Profile
              </Link>
              <Link
                to={`/u/${user?.id}`}
                className="px-5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm font-bold hover:bg-[#FFF5E8]"
              >
                Preview My Profile
              </Link>
            </div>
          </div>

          {/* Embedded Top Student Leaderboard Preview */}
          <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Top Performing Students</h2>
                <p className="text-xs text-[#5A4F4F]">Click any student to open their submitted assignments &amp; presentations.</p>
              </div>
              <Link to="/leaderboard" className="text-xs font-bold text-[#C83D42] hover:underline whitespace-nowrap">
                Full Leaderboard →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(data.leaderboard_preview || []).map((entry) => (
                <Link
                  key={entry.student_id}
                  to={`/u/${entry.student_id}`}
                  className="p-4 rounded-xl bg-[#FFF5E8] border-2 border-[#252020]/20 hover:border-[#252020] flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-[#F6D66D] border border-[#252020] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      #{entry.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm truncate">{entry.student_name}</div>
                      <div className="text-xs text-[#6B5E5E] truncate">
                        {entry.assignments_count} assignments · {entry.latest_pitch_title || 'Course Work'}
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#C83D42] tabular-nums shrink-0">
                    {entry.score} pts
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  // APPROVED MENTOR VIEW
  if (data.role === 'mentor') {
    const stats = data.mentor_details;
    const usedConnections = stats?.monthly_connections_used ?? 0;
    const maxConnections = stats?.monthly_connections_limit ?? 30;
    return (
      <AppShell title="Mentor Dashboard">
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Starburst size={26} color="#F6D66D" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-bold">Salam, {user?.full_name}</h1>
                  <VerifiedIcon className="w-5 h-5 text-[#C83D42]" />
                  {stats?.vip_partner && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#F6D66D] border border-[#252020] text-[11px] font-bold">
                      {stats.vip_partner}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#5A4F4F] mt-0.5">
                  Students must complete a course &amp; assignment before messaging you. Max {maxConnections} connections/month.
                </p>
              </div>
            </div>
            <Link
              to="/leaderboard"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#252020] text-white text-xs font-bold hover:bg-[#3A3232] whitespace-nowrap self-start"
            >
              <Trophy className="w-4 h-4 text-[#F6D66D]" />
              <span>Student Leaderboard</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5">
              <div className="text-xs font-bold text-[#6B5E5E]">Monthly Connection Cap</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                {usedConnections} / {maxConnections}
              </div>
            </div>
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

          {/* Verified Mentor Broadcast Composer + Leaderboard Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={publishMentorUpdate}
              className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4"
            >
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <Bell className="w-5 h-5 text-[#C83D42]" />
                <span>Post Masterclass, Update or Upcoming Cohort</span>
              </div>
              <p className="text-xs text-[#5A4F4F]">
                Shared with all students following your profile — even before they unlock 1:1 messaging.
              </p>
              <div className="flex gap-2">
                {(['masterclass', 'cohort', 'update'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setUpdateKind(k)}
                    className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold capitalize ${
                      updateKind === k
                        ? 'bg-[#C83D42] text-white border-[#252020]'
                        : 'bg-[#FFF5E8] text-[#252020] border-[#252020]/25'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <input
                required
                value={updateTitle}
                onChange={(e) => setUpdateTitle(e.target.value)}
                placeholder="Headline (e.g. Portfolio Review Masterclass Recording)"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
              <textarea
                required
                rows={2}
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                placeholder="Key announcement details or takeaways for your student followers..."
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
              <input
                type="url"
                value={updateMediaUrl}
                onChange={(e) => setUpdateMediaUrl(e.target.value)}
                placeholder="Video / Registration URL (optional)"
                className="w-full px-3.5 py-2 rounded-xl border-2 border-[#252020]/25 text-xs focus:outline-none focus:border-[#252020]"
              />
              <button
                type="submit"
                disabled={postingUpdate}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#252020] text-white text-xs font-bold hover:bg-[#3A3232] disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{postingUpdate ? 'Publishing...' : 'Publish to Followers'}</span>
              </button>
            </form>

            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Top Student Leaderboard</h2>
                <Link to="/leaderboard" className="text-xs font-bold text-[#C83D42] hover:underline">
                  Inspect All →
                </Link>
              </div>
              <div className="space-y-2.5">
                {(data.leaderboard_preview || []).slice(0, 4).map((entry) => (
                  <Link
                    key={entry.student_id}
                    to={`/u/${entry.student_id}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 hover:border-[#252020]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-xs font-bold text-[#C83D42] shrink-0">#{entry.rank}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{entry.student_name}</div>
                        <div className="text-[11px] text-[#6B5E5E] truncate">
                          {entry.assignments_count} assignments · {entry.latest_pitch_title || 'Student Work'}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#252020] shrink-0">{entry.score} pts</span>
                  </Link>
                ))}
              </div>
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

        {/* Student Mentorship Unlock Progress */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-white border-2 border-[#252020] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-[#6B5E5E]">Step 1 · Free Access</div>
              <div className="font-display font-bold text-sm">Follow Mentors &amp; Masterclasses</div>
            </div>
            <Link to="/explore" className="text-xs font-bold text-[#C83D42] hover:underline whitespace-nowrap">
              Explore →
            </Link>
          </div>

          <div
            className={`p-4 rounded-2xl border-2 border-[#252020] flex items-center justify-between gap-3 ${
              data.messaging_unlocked ? 'bg-[#F6D66D]/50' : 'bg-white'
            }`}
          >
            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-[#6B5E5E]">Step 2 · 1 Structured Intro</div>
              <div className="font-display font-bold text-sm">
                {data.messaging_unlocked ? 'Mentor Messaging Unlocked ✓' : 'Finish a Course & Assignment'}
              </div>
            </div>
            <Link to="/courses" className="text-xs font-bold text-[#C83D42] hover:underline whitespace-nowrap">
              {data.messaging_unlocked ? 'Connect →' : 'Start →'}
            </Link>
          </div>

          <div
            className={`p-4 rounded-2xl border-2 border-[#252020] flex items-center justify-between gap-3 ${
              data.one_on_one_unlocked ? 'bg-[#F6D66D]' : 'bg-white'
            }`}
          >
            <div>
              <div className="text-[11px] font-mono font-bold uppercase text-[#6B5E5E]">Step 3 · Top 5 / Winner</div>
              <div className="font-display font-bold text-sm">
                {data.one_on_one_unlocked
                  ? `1:1 Booking Unlocked (Rank #${data.leaderboard_rank || 1})`
                  : 'Place Top 5 for 1:1 Meetings'}
              </div>
            </div>
            <Link
              to={data.one_on_one_unlocked ? '/sessions' : '/leaderboard'}
              className="text-xs font-bold text-[#C83D42] hover:underline whitespace-nowrap"
            >
              {data.one_on_one_unlocked ? 'Book 1:1 →' : 'Rankings →'}
            </Link>
          </div>
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

        {/* Competitions Section — Monthly Challenges with Live Countdown & Join Buttons */}
        {data.active_courses && data.active_courses.length > 0 && (
          <section id="competitions" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Trophy className="w-6 h-6 text-[#C83D42] mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-display text-2xl font-bold">
                    Competitions <span className="italic text-[#C83D42]">({data.cycle_month || 'This Month'})</span>
                  </h2>
                  <p className="text-xs text-[#5A4F4F] mt-0.5">
                    Monthly challenges for Entrepreneurship, Psychology, and Social Impact courses. Watch course videos and submit before the timer ends.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm shrink-0">
                <Clock className="w-4 h-4 text-[#C83D42]" />
                <div className="font-mono text-xs font-bold text-[#252020] tabular-nums">
                  {String(countdown.days).padStart(2, '0')}d : {String(countdown.hours).padStart(2, '0')}h :{' '}
                  {String(countdown.minutes).padStart(2, '0')}m : {String(countdown.seconds).padStart(2, '0')}s left
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {data.active_courses.map((course, idx) => {
                const trackAccent =
                  idx === 0
                    ? 'bg-[#C83D42] text-white'
                    : idx === 1
                      ? 'bg-[#F6D66D] text-[#252020]'
                      : 'bg-[#F7A98A] text-[#252020]';

                return (
                  <div
                    key={course.id}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className={`px-5 py-3.5 border-b-2 border-[#252020] flex items-center justify-between gap-2 ${trackAccent}`}>
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                          {course.niche_slug.replace(/-/g, ' ')}
                        </span>
                        <span className="font-mono text-[11px] font-bold tabular-nums opacity-95">
                          {countdown.days}d {String(countdown.hours).padStart(2, '0')}h left
                        </span>
                      </div>

                      <div className="p-5 space-y-3">
                        <div>
                          <h3 className="font-display font-bold text-base leading-snug">{course.competition_title}</h3>
                          <div className="text-xs font-semibold text-[#C83D42] mt-0.5">{course.title}</div>
                        </div>

                        <p className="text-xs text-[#4D4242] leading-relaxed line-clamp-3">{course.competition_brief}</p>

                        <div className="pt-2 border-t border-[#252020]/10 space-y-1.5 text-xs text-[#5A4F4F]">
                          <div className="flex items-center justify-between tabular-nums">
                            <span>Course progress</span>
                            <span className="font-bold text-[#252020]">
                              {course.completed_count}/{course.module_count} videos
                            </span>
                          </div>
                          <div className="flex items-center justify-between tabular-nums">
                            <span>Participants</span>
                            <span className="font-bold text-[#252020]">{course.cohort_count} competing</span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-[#C83D42] shrink-0" />
                            <span className="truncate">{course.meetup_venue}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 pb-5 flex items-center gap-2">
                      <Link
                        to={`/courses/${course.id}?tab=competition`}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border-2 border-[#252020] font-display text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                          course.has_entered_competition
                            ? 'bg-[#F6D66D] text-[#252020]'
                            : 'bg-[#C83D42] text-white hover:bg-[#B23237]'
                        }`}
                      >
                        <span>{course.has_entered_competition ? 'View Entry ✓' : 'Join'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      <Link
                        to={`/courses/${course.id}`}
                        className="px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/40"
                      >
                        Course
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Followed Mentor Masterclasses & Monthly Group Q&A Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <Bell className="w-5 h-5 text-[#C83D42]" />
                <span>Followed Mentor Updates</span>
              </div>
              <Link to="/explore" className="text-xs font-bold text-[#C83D42] hover:underline">
                Follow more →
              </Link>
            </div>
            {!data.followed_updates?.length ? (
              <p className="text-sm text-[#5A4F4F]">
                Follow mentors in Explore to get their free masterclasses, career updates, and cohort announcements here.
              </p>
            ) : (
              <div className="space-y-3">
                {data.followed_updates.map((upd) => (
                  <div key={upd.id} className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <Link to={`/u/${upd.mentor_id}`} className="font-bold text-[#252020] hover:underline">
                        {upd.mentor_name}
                      </Link>
                      <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#F6D66D] border border-[#252020]">
                        {upd.kind}
                      </span>
                    </div>
                    <div className="font-display font-bold text-sm">{upd.title}</div>
                    <p className="text-xs text-[#4D4242] leading-relaxed">{upd.body}</p>
                    {upd.media_url && (
                      <a
                        href={upd.media_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#C83D42] hover:underline pt-0.5"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Watch / Open Resource →</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <Video className="w-5 h-5 text-[#C83D42]" />
                <span>Upcoming Monthly Group Q&amp;As</span>
              </div>
              <Link to="/groups" className="text-xs font-bold text-[#C83D42] hover:underline">
                All Groups →
              </Link>
            </div>
            {!data.upcoming_group_qas?.length ? (
              <p className="text-sm text-[#5A4F4F]">No live Group Q&amp;As scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {data.upcoming_group_qas.map((qa) => (
                  <div
                    key={qa.id}
                    className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-display font-bold text-sm truncate">{qa.topic}</div>
                      <div className="text-xs text-[#5A4F4F] truncate">
                        {qa.mentor_name} · {qa.start_at ? formatPKT(qa.start_at) : 'Monthly Live'}
                      </div>
                      <div className="text-[11px] text-[#6B5E5E] tabular-nums">{qa.rsvp_count} students going</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleQnaRsvp(qa.id)}
                        className={`px-3 py-1.5 rounded-xl border border-[#252020] text-xs font-bold ${
                          qa.has_rsvped ? 'bg-[#F6D66D]' : 'bg-white'
                        }`}
                      >
                        {qa.has_rsvped ? 'Going ✓' : 'RSVP'}
                      </button>
                      <a
                        href={qa.meet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold"
                      >
                        Meet
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
