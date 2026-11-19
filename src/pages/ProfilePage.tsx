import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ExternalLink,
  MessageSquare,
  UserPlus,
  Flag,
  Ban,
  CalendarCheck,
  CheckCircle2,
  Video,
  Copy,
  Loader2,
  BellPlus,
  BellRing,
  Lock,
  Trophy,
  FileText,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, BadgeChip, BrandLogo, EmptyStateArt, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import {
  formatPKT,
  formatPKTDateOnly,
  formatReplyTime,
  type Badge,
  type Certificate,
  type CourseAssignment,
  type GroupQASession,
  type MentorDetails,
  type MentorUpdate,
  type Profile,
} from '../shared/types';

interface ProfilePayload {
  profile: Profile;
  mentor_details: MentorDetails | null;
  badges: Badge[];
  certificates: Certificate[];
  assignments?: CourseAssignment[];
  student_rank_info?: { unlocked: boolean; rank: number | null; is_winner: boolean } | null;
  sessions_attended: number;
  connection: { id: string; status: string; requester_id: string; receiver_id: string } | null;
  is_blocked_by_me: boolean;
  is_blocked: boolean;
  open_slots: Array<{ id: string; start_at: string; end_at: string }>;
  is_following?: boolean;
  followers_count?: number;
  mentor_updates?: MentorUpdate[];
  mentor_seminars?: GroupQASession[];
  viewer_gates?: {
    messaging_unlocked: boolean;
    one_on_one_unlocked: boolean;
    leaderboard_rank: number | null;
    is_winner: boolean;
  };
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [connectModal, setConnectModal] = useState(false);
  const [trackContext, setTrackContext] = useState('Entrepreneurship / Venture Track');
  const [specificGoal, setSpecificGoal] = useState('');
  const [focusedQuestion, setFocusedQuestion] = useState('');
  const [introNote, setIntroNote] = useState('');
  const [botAcceptedConnId, setBotAcceptedConnId] = useState<string | null>(null);
  const [botReplyPreview, setBotReplyPreview] = useState<string | null>(null);
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookingTopic, setBookingTopic] = useState('');
  const [bookingStage, setBookingStage] = useState<'form' | 'confirming' | 'confirmed'>('form');
  const [confirmedBooking, setConfirmedBooking] = useState<{
    meet_url: string;
    start_at: string;
    mentor_name: string;
    topic: string;
  } | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    apiFetch<ProfilePayload>(`/api/profiles/${id}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!data) return;
    try {
      const nextFollow = !data.is_following;
      await apiFetch(`/api/mentors/${id}/follow`, {
        method: nextFollow ? 'POST' : 'DELETE',
      });
      toast.success(
        nextFollow
          ? `Following ${data.profile.full_name}! Masterclasses and cohort updates will show on your dashboard.`
          : `Unfollowed ${data.profile.full_name}.`
      );
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const sendConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload =
        data?.profile.role === 'mentor' && user?.role === 'student'
          ? {
              receiver_id: id,
              track_context: trackContext,
              specific_goal: specificGoal,
              focused_question: focusedQuestion,
            }
          : { receiver_id: id, message: introNote };

      const res = await apiFetch<{
        ok: boolean;
        id: string;
        auto_accepted?: boolean;
        bot_reply?: string;
      }>('/api/connections', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setConnectModal(false);
      setIntroNote('');
      setSpecificGoal('');
      setFocusedQuestion('');
      if (res.auto_accepted) {
        setBotAcceptedConnId(res.id);
        setBotReplyPreview(res.bot_reply || null);
        toast.success(`${data?.profile.full_name} accepted your request and sent a welcome note!`);
      } else {
        toast.success('1 structured message sent! Open chat & welcome note unlock once accepted.');
      }
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlotId) return;
    setBookingStage('confirming');
    try {
      const [res] = await Promise.all([
        apiFetch<{
          ok: boolean;
          meet_url: string;
          start_at: string;
          mentor_name: string;
          topic: string;
        }>('/api/sessions/book', {
          method: 'POST',
          body: JSON.stringify({ slot_id: bookingSlotId, topic: bookingTopic || 'Career Mentorship 1:1' }),
        }),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      setConfirmedBooking({
        meet_url: res.meet_url,
        start_at: res.start_at,
        mentor_name: res.mentor_name,
        topic: res.topic,
      });
      setBookingStage('confirmed');
      toast.success('Booking confirmed! Meet link generated.');
      load();
    } catch (err) {
      setBookingStage('form');
      const e2 = err as Error & { code?: string };
      toast.error(e2.message);
      if (e2.code === 'PLAN_REQUIRED') {
        navigate('/pricing');
      }
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ reported_id: id, reason: reportReason }),
      });
      toast.success('Report submitted to Outpase safety team.');
      setReportModal(false);
      setReportReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const toggleBlock = async () => {
    if (!data) return;
    try {
      if (data.is_blocked_by_me) {
        await apiFetch(`/api/blocks/${id}`, { method: 'DELETE' });
        toast.success('User unblocked.');
      } else {
        await apiFetch('/api/blocks', { method: 'POST', body: JSON.stringify({ blocked_id: id }) });
        toast.success('User blocked. They can no longer message or connect with you.');
      }
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const content = loading ? (
    <div className="py-12 text-center text-sm text-[#6B5E5E]">Loading Career Passport...</div>
  ) : !data ? (
    <div className="py-12 text-center font-display text-xl font-bold">Profile not found</div>
  ) : (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <Avatar src={data.profile.avatar_url} name={data.profile.full_name} size="xl" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold">{data.profile.full_name}</h1>
                {data.mentor_details?.status === 'approved' && <VerifiedIcon className="w-5 h-5 text-[#C83D42]" />}
                {data.mentor_details?.vip_partner && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-[#F6D66D] border border-[#252020] text-[11px] font-bold">
                    {data.mentor_details.vip_partner}
                  </span>
                )}
                {data.mentor_details?.status === 'pending' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#FFF5E8] border border-[#252020] text-[11px] font-bold">
                    <Clock className="w-3 h-3 text-[#C83D42]" />
                    <span>48h Verification Pending</span>
                  </span>
                )}
                {data.student_rank_info?.unlocked && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#F6D66D] border border-[#252020] text-[11px] font-bold">
                    <Trophy className="w-3 h-3 text-[#C83D42]" />
                    <span>
                      {data.student_rank_info.is_winner
                        ? 'Competition Winner · Top 5'
                        : `Leaderboard Top 5 (#${data.student_rank_info.rank})`}
                    </span>
                  </span>
                )}
              </div>

              {data.profile.role === 'mentor' && data.mentor_details ? (
                <>
                  <div className="text-base font-semibold text-[#4D4242]">
                    {data.mentor_details.profession}
                    {data.mentor_details.company ? ` @ ${data.mentor_details.company}` : ''}
                  </div>
                  <div className="text-xs text-[#6B5E5E] flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
                    <span>{data.profile.city || 'Pakistan'}</span>
                    <span>·</span>
                    <span>{data.mentor_details.years_experience || 1}+ yrs experience</span>
                    <span>·</span>
                    <span>{formatReplyTime(data.mentor_details.avg_reply_hours)}</span>
                    <span>·</span>
                    <span className="font-bold text-[#252020]">
                      {data.mentor_details.rating ? `${data.mentor_details.rating} ★` : 'New'}
                    </span>
                    <span>·</span>
                    <span>
                      {data.mentor_details.monthly_connections_used ?? 0} /{' '}
                      {data.mentor_details.monthly_connections_limit ?? 30} monthly connects
                    </span>
                    <span>·</span>
                    <span>{data.followers_count || 0} followers</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    {data.mentor_details.linkedin_url && (
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={data.mentor_details.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C83D42] hover:underline"
                        >
                          <span>LinkedIn Profile</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {data.mentor_details.linkedin_verified && (
                          <span className="px-2 py-0.5 rounded-md bg-[#F6D66D]/60 border border-[#252020]/40 text-[10px] font-bold text-[#252020]">
                            OAuth Verified
                          </span>
                        )}
                      </div>
                    )}
                    {data.mentor_details.talk_url && (
                      <a
                        href={data.mentor_details.talk_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#252020] hover:text-[#C83D42] hover:underline"
                      >
                        <Video className="w-3.5 h-3.5 text-[#C83D42]" />
                        <span>Watch Featured Talk</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {data.mentor_details.topics && data.mentor_details.topics.length > 0 && (
                    <div className="pt-2 text-xs text-[#4D4242]">
                      <span className="font-bold text-[#252020]">Mentorship Topics:</span>{' '}
                      {data.mentor_details.topics.join(' · ')}
                    </div>
                  )}
                  {data.mentor_details.preferred_slots && data.mentor_details.preferred_slots.length > 0 && (
                    <div className="text-xs text-[#5A4F4F]">
                      <span className="font-bold text-[#252020]">Weekly Schedule (PKT):</span>{' '}
                      {data.mentor_details.preferred_slots.join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-[#5A4F4F]">
                  {[data.profile.grade_level, data.profile.school_name, data.profile.city].filter(Boolean).join(' · ')}
                  <span className="mx-2">·</span>
                  <span className="font-bold text-[#252020] tabular-nums">
                    {data.sessions_attended} sessions attended
                  </span>
                </div>
              )}

              {data.profile.bio && (
                <p className="text-sm text-[#4D4242] max-w-2xl pt-2 leading-relaxed">{data.profile.bio}</p>
              )}

              {data.profile.interests.length > 0 && (
                <div className="pt-2 text-xs text-[#6B5E5E]">
                  <span className="font-bold text-[#252020]">Focus areas:</span>{' '}
                  {data.profile.interests.map((s) => s.replace(/-/g, ' ')).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {user && user.id !== data.profile.id && (
            <div className="flex flex-wrap sm:flex-col gap-2.5 shrink-0">
              {data.profile.role === 'mentor' && user.role === 'student' && (
                <button
                  type="button"
                  onClick={toggleFollow}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#252020] text-sm font-bold transition-colors ${
                    data.is_following ? 'bg-[#F6D66D] text-[#252020]' : 'bg-[#FFF5E8] text-[#252020] hover:bg-[#F6D66D]/50'
                  }`}
                >
                  {data.is_following ? <BellRing className="w-4 h-4" /> : <BellPlus className="w-4 h-4" />}
                  <span>{data.is_following ? 'Following Updates' : 'Follow Updates'}</span>
                </button>
              )}

              {!data.is_blocked && !data.connection && (
                data.profile.role === 'mentor' && user.role === 'student' && !data.viewer_gates?.messaging_unlocked ? (
                  <Link
                    to="/courses"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-[#252020] text-xs font-bold text-[#252020] hover:bg-[#FFF5E8]"
                    title="Complete a course first to unlock 1 structured message"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#C83D42]" />
                    <span>Finish Course to Connect</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setConnectModal(true)}
                    disabled={data.profile.role === 'mentor' && data.mentor_details?.status !== 'approved'}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237] disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {data.profile.role === 'mentor' && user.role === 'student'
                        ? 'Send 1 Structured Message'
                        : 'Connect'}
                    </span>
                  </button>
                )
              )}

              {data.connection?.status === 'pending' && (
                <span className="px-4 py-2 rounded-xl bg-[#F6D66D]/50 border-2 border-[#252020] text-xs font-bold text-[#252020] text-center">
                  Structured Request Pending
                </span>
              )}
              {!data.is_blocked && data.connection?.status === 'accepted' && (
                <Link
                  to={`/messages/${data.connection.id}`}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message</span>
                </Link>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReportModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold text-[#252020] hover:bg-[#FFF5E8]"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
                <button
                  onClick={toggleBlock}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold text-[#C83D42] hover:bg-[#FFF5E8]"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{data.is_blocked_by_me ? 'Unblock' : 'Block'}</span>
                </button>
              </div>
            </div>
          )}

          {user && user.id === data.profile.id && (
            <Link
              to="/settings"
              className="px-4 py-2 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/50 self-start"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      {/* Instant Mentor Reply Callout */}
      {botAcceptedConnId && botReplyPreview && (
        <div className="bg-[#F6D66D] rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-mono font-bold text-[#C83D42] uppercase">
              Welcome Note from {data.profile.full_name}
            </div>
            <p className="text-sm text-[#252020] font-medium">&ldquo;{botReplyPreview}&rdquo;</p>
          </div>
          <Link
            to={`/messages/${botAcceptedConnId}`}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold shrink-0 hover:bg-[#B23237]"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Open Chat</span>
          </Link>
        </div>
      )}

      {/* Mentor Updates, Masterclasses & Group Q&As (Free & Pre-Course Accessible) */}
      {data.profile.role === 'mentor' &&
        ((data.mentor_updates && data.mentor_updates.length > 0) ||
          (data.mentor_seminars && data.mentor_seminars.length > 0)) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.mentor_updates && data.mentor_updates.length > 0 && (
              <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <Video className="w-5 h-5 text-[#C83D42]" />
                  <span>Masterclasses, Cohorts &amp; Updates</span>
                </div>
                <div className="space-y-3">
                  {data.mentor_updates.map((upd) => (
                    <div key={upd.id} className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 space-y-1.5">
                      <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#F6D66D] border border-[#252020]">
                        {upd.kind}
                      </span>
                      <div className="font-display font-bold text-sm">{upd.title}</div>
                      <p className="text-xs text-[#4D4242] leading-relaxed">{upd.body}</p>
                      {upd.media_url && (
                        <a
                          href={upd.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#C83D42] hover:underline"
                        >
                          <span>Open Link →</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.mentor_seminars && data.mentor_seminars.length > 0 && (
              <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <CalendarCheck className="w-5 h-5 text-[#C83D42]" />
                  <span>Monthly Group Q&amp;A Sessions</span>
                </div>
                <div className="space-y-3">
                  {data.mentor_seminars.map((sem) => (
                    <div key={sem.id} className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm truncate">{sem.topic}</div>
                        <div className="text-xs text-[#5A4F4F]">
                          {sem.start_at ? formatPKT(sem.start_at) : 'Monthly'} · {sem.rsvp_count} attending
                        </div>
                      </div>
                      <a
                        href={sem.meet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold shrink-0"
                      >
                        Meet
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

      {/* 1:1 Meeting Booking (Unlocked for Competition Winners & Top 5 Students) */}
      {user?.role === 'student' &&
        data.profile.role === 'mentor' &&
        data.mentor_details?.status === 'approved' &&
        !data.is_blocked && (
          <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <CalendarCheck className="w-5 h-5 text-[#C83D42]" />
                <span>Book a 1:1 Meeting Date &amp; Slot (PKT)</span>
              </div>
              {data.viewer_gates?.one_on_one_unlocked ? (
                <span className="px-3 py-1 rounded-lg bg-[#F6D66D] border border-[#252020] text-xs font-bold">
                  Top 5 / Winner Unlocked ✓
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#6B5E5E]">
                  <Lock className="w-3.5 h-3.5 text-[#C83D42]" />
                  <span>Top 5 / Winner Gate</span>
                </span>
              )}
            </div>

            {!data.viewer_gates?.one_on_one_unlocked ? (
              <div className="p-4 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-[#4D4242] leading-relaxed">
                  1:1 meetings unlock once you win a monthly course competition or place in the Top 5 on the Student Leaderboard. You can still follow updates, watch masterclasses, or attend their Monthly Group Q&amp;A!
                </p>
                <Link
                  to="/courses"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold whitespace-nowrap self-start"
                >
                  Enter Competition →
                </Link>
              </div>
            ) : data.open_slots.length === 0 ? (
              <p className="text-sm text-[#5A4F4F]">
                No open dates available right now. Message {data.profile.full_name} or join their Monthly Group Q&amp;A.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.open_slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      setBookingStage('form');
                      setConfirmedBooking(null);
                      setBookingSlotId(slot.id);
                    }}
                    className="p-3.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] hover:bg-[#F6D66D]/50 text-left transition-colors"
                  >
                    <div className="text-xs font-mono font-bold text-[#252020]">{formatPKT(slot.start_at)}</div>
                    <div className="text-xs text-[#C83D42] font-bold mt-1">Choose Date &amp; Book →</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

      {/* Student Submitted Course Assignments & Presentations */}
      {data.profile.role === 'student' && (
        <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <FileText className="w-5 h-5 text-[#C83D42]" />
              <span>Submitted Course Videos &amp; Presentations</span>
            </div>
            <Link to="/leaderboard" className="text-xs font-bold text-[#C83D42] hover:underline">
              Student Leaderboard →
            </Link>
          </div>
          {!data.assignments || data.assignments.length === 0 ? (
            <EmptyStateArt
              title="No course assignments submitted yet"
              subtitle="Completed video and presentation assignments appear here for mentors to inspect."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.assignments.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-mono font-bold uppercase text-[#C83D42]">
                        {a.submission_type === 'video' ? <Video className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        {a.submission_type}
                      </span>
                      <span className="font-mono font-bold tabular-nums">{a.score}/100</span>
                    </div>
                    <div className="font-display font-bold text-sm">{a.title}</div>
                    <div className="text-[11px] text-[#6B5E5E]">
                      {a.course_title} · {formatPKTDateOnly(a.created_at)}
                    </div>
                    <p className="text-xs text-[#4D4242] leading-relaxed">{a.summary}</p>
                  </div>
                  <div>
                    <a
                      href={a.asset_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C83D42] border border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                    >
                      <span>Open {a.submission_type === 'video' ? 'Video' : 'Presentation'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Career Passport: Sticker Badges & Verifiable Certificates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Starburst size={20} color="#F6D66D" />
            <span>Career Passport Badges</span>
          </div>
          {data.badges.length === 0 ? (
            <EmptyStateArt
              title="No sticker badges yet"
              subtitle="Complete the Career Fit Quiz or a 1:1 mentor session to start collecting."
            />
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.badges.map((b) => (
                <BadgeChip key={b.id} type={b.type} label={b.label} />
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <CheckCircle2 className="w-5 h-5 text-[#C83D42]" />
            <span>Verified Certificates</span>
          </div>
          {data.certificates.length === 0 ? (
            <EmptyStateArt
              title="No certificates issued yet"
              subtitle="Verified certificates appear here after completing a 1:1 session with a mentor."
            />
          ) : (
            <div className="space-y-3">
              {data.certificates.map((cert) => (
                <div
                  key={cert.id}
                  className="p-4 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm truncate">{cert.title}</div>
                    <div className="text-xs text-[#5A4F4F] mt-0.5">
                      Mentored by {cert.mentor_name} · {formatPKTDateOnly(cert.issued_at)}
                    </div>
                    <div className="text-xs font-mono font-bold text-[#252020] mt-1">Code: {cert.verify_code}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {user?.id === cert.student_id && (
                      <Link
                        to={`/certificates/${cert.id}`}
                        className="px-3 py-1.5 rounded-lg bg-[#C83D42] border border-[#252020] text-white text-xs font-bold"
                      >
                        PDF
                      </Link>
                    )}
                    <Link
                      to={`/verify/${cert.verify_code}`}
                      className="px-3 py-1.5 rounded-lg border border-[#252020] bg-white text-xs font-bold hover:bg-[#F6D66D]/50"
                    >
                      Verify
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <form
            onSubmit={sendConnect}
            className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-xl font-bold">
              {data.profile.role === 'mentor' && user?.role === 'student'
                ? `Send 1 Structured Message to ${data.profile.full_name}`
                : `Connect with ${data.profile.full_name}`}
            </h3>
            {data.profile.role === 'mentor' && user?.role === 'student' ? (
              <>
                <p className="text-xs text-[#5A4F4F]">
                  To stop vague spam messages, share your completed course track, goal, and one focused question. Full chat unlocks when {data.profile.full_name} accepts.
                </p>
                <div>
                  <label className="block text-xs font-bold mb-1">Completed Course Track</label>
                  <select
                    value={trackContext}
                    onChange={(e) => setTrackContext(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/40 text-sm bg-white focus:outline-none focus:border-[#252020]"
                  >
                    <option value="Entrepreneurship / Venture Track">Entrepreneurship / Venture Track</option>
                    <option value="Psychology & Human Behavior Track">Psychology &amp; Human Behavior Track</option>
                    <option value="Social Impact & Civic Innovation Track">Social Impact &amp; Civic Innovation Track</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Your Career / Project Goal *</label>
                  <input
                    required
                    value={specificGoal}
                    onChange={(e) => setSpecificGoal(e.target.value)}
                    placeholder="e.g. Applying to NUST BSCS and launching my edtech pitch"
                    className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/40 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">One Focused Question *</label>
                  <textarea
                    required
                    rows={3}
                    value={focusedQuestion}
                    onChange={(e) => setFocusedQuestion(e.target.value)}
                    placeholder="Ask a specific question about their career, university transition, or your assignment..."
                    className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/40 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-[#5A4F4F]">
                  Introduce yourself briefly and share what you are exploring.
                </p>
                <textarea
                  required
                  rows={3}
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  placeholder="Assalam-o-Alaikum! Saw your project in Outpase..."
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] text-sm focus:outline-none"
                />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConnectModal(false)}
                className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
              >
                Send Structured Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Book Slot Modal with Confirming -> Meet Link View */}
      {bookingSlotId && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          {bookingStage === 'confirming' ? (
            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#C83D42] animate-spin mx-auto" />
              <h3 className="font-display text-xl font-bold">Please wait until your booking confirms...</h3>
              <p className="text-xs text-[#5A4F4F]">
                Reserving your PKT slot with {data.profile.full_name} and generating your Meet link.
              </p>
            </div>
          ) : bookingStage === 'confirmed' && confirmedBooking ? (
            <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#C83D42] uppercase">
                <CheckCircle2 className="w-4 h-4" />
                <span>Booking Confirmed</span>
              </div>
              <h3 className="font-display text-xl font-bold">1:1 Session with {confirmedBooking.mentor_name}</h3>
              <div className="p-3.5 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 text-xs space-y-1">
                <div className="font-bold">{confirmedBooking.topic}</div>
                <div className="font-mono text-[#5A4F4F]">{formatPKT(confirmedBooking.start_at)}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#F6D66D]/50 border-2 border-[#252020] space-y-2">
                <div className="text-[11px] font-bold uppercase text-[#252020]">Your Meet Link</div>
                <a
                  href={confirmedBooking.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-mono text-xs font-bold text-[#C83D42] underline break-all"
                >
                  {confirmedBooking.meet_url}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(confirmedBooking.meet_url);
                    toast.success('Meet link copied!');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#252020] hover:text-[#C83D42]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Meet Link</span>
                </button>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBookingSlotId(null);
                    setBookingTopic('');
                    setBookingStage('form');
                  }}
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/sessions')}
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  View My Sessions →
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleBookSlot}
              className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-bold">Book 1:1 Video Session</h3>
              <p className="text-xs text-[#5A4F4F]">
                Once confirmed, a Meet link will be generated automatically for you and {data.profile.full_name}.
              </p>
              <div>
                <label className="block text-xs font-bold mb-1.5">What would you like to discuss?</label>
                <input
                  required
                  value={bookingTopic}
                  onChange={(e) => setBookingTopic(e.target.value)}
                  placeholder="e.g. FAST vs NUST BS CS and daily life as a developer"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] text-sm focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBookingSlotId(null)}
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <form
            onSubmit={submitReport}
            className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-xl font-bold">Report {data.profile.full_name}</h3>
            <textarea
              required
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe what happened..."
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] text-sm focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModal(false)}
                className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFF5E8]">
        <header className="h-16 border-b border-[#252020]/15 px-4 md:px-8 flex items-center justify-between max-w-[1200px] mx-auto">
          <Link to="/">
            <BrandLogo />
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
          >
            Log in
          </Link>
        </header>
        <main className="max-w-[1000px] mx-auto px-4 py-8">{content}</main>
      </div>
    );
  }

  return <AppShell title="Profile & Career Passport">{content}</AppShell>;
}
