import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ExternalLink,
  MessageSquare,
  UserPlus,
  Flag,
  Ban,
  CalendarCheck,
  Award,
  CheckCircle2,
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
  type MentorDetails,
  type Profile,
} from '../shared/types';

interface ProfilePayload {
  profile: Profile;
  mentor_details: MentorDetails | null;
  badges: Badge[];
  certificates: Certificate[];
  sessions_attended: number;
  connection: { id: string; status: string; requester_id: string; receiver_id: string } | null;
  is_blocked_by_me: boolean;
  is_blocked: boolean;
  open_slots: Array<{ id: string; start_at: string; end_at: string }>;
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [connectModal, setConnectModal] = useState(false);
  const [introNote, setIntroNote] = useState('');
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [bookingTopic, setBookingTopic] = useState('');

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

  const sendConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/connections', {
        method: 'POST',
        body: JSON.stringify({ receiver_id: id, message: introNote }),
      });
      toast.success('Connection request sent!');
      setConnectModal(false);
      setIntroNote('');
      load();
    } catch (err) {
      const e2 = err as Error & { code?: string };
      toast.error(e2.message);
      if (e2.code === 'PLAN_REQUIRED') {
        navigate('/pricing');
      }
    }
  };

  const handleBookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlotId) return;
    try {
      await apiFetch('/api/sessions/book', {
        method: 'POST',
        body: JSON.stringify({ slot_id: bookingSlotId, topic: bookingTopic || 'Career Mentorship 1:1' }),
      });
      toast.success('1:1 session booked! Jitsi meeting link created.');
      setBookingSlotId(null);
      setBookingTopic('');
      navigate('/sessions');
    } catch (err) {
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
      toast.success('Report submitted to Outspace safety team.');
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
                    <span>{data.mentor_details.sessions_completed} sessions completed</span>
                  </div>
                  {data.mentor_details.linkedin_url && (
                    <a
                      href={data.mentor_details.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C83D42] hover:underline pt-1"
                    >
                      <span>LinkedIn Profile</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
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
              {!data.is_blocked && !data.connection && (
                <button
                  onClick={() => setConnectModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Connect</span>
                </button>
              )}
              {data.connection?.status === 'pending' && (
                <span className="px-4 py-2 rounded-xl bg-[#F6D66D]/50 border-2 border-[#252020] text-xs font-bold text-[#252020] text-center">
                  Request Pending
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

      {/* Mentor Open Slots for Connected Students */}
      {user?.role === 'student' &&
        data.profile.role === 'mentor' &&
        data.connection?.status === 'accepted' &&
        !data.is_blocked && (
          <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <CalendarCheck className="w-5 h-5 text-[#C83D42]" />
              <span>Book a 1:1 Session (All times PKT)</span>
            </div>
            {data.open_slots.length === 0 ? (
              <p className="text-sm text-[#5A4F4F]">
                No open slots available right now. Message {data.profile.full_name} to request a time.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.open_slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setBookingSlotId(slot.id)}
                    className="p-3.5 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] hover:bg-[#F6D66D]/50 text-left transition-colors"
                  >
                    <div className="text-xs font-mono font-bold text-[#252020]">{formatPKT(slot.start_at)}</div>
                    <div className="text-xs text-[#C83D42] font-bold mt-1">Book 1:1 →</div>
                  </button>
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
            <h3 className="font-display text-xl font-bold">Connect with {data.profile.full_name}</h3>
            <p className="text-xs text-[#5A4F4F]">
              Introduce yourself briefly and share what you want to learn about their career.
            </p>
            <textarea
              required
              rows={3}
              value={introNote}
              onChange={(e) => setIntroNote(e.target.value)}
              placeholder="Assalam-o-Alaikum! I am an A-Level student exploring..."
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] text-sm focus:outline-none"
            />
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
                Send Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Book Slot Modal */}
      {bookingSlotId && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <form
            onSubmit={handleBookSlot}
            className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
          >
            <h3 className="font-display text-xl font-bold">Book 1:1 Video Session</h3>
            <p className="text-xs text-[#5A4F4F]">
              A Jitsi Meet video link will be created automatically for you and {data.profile.full_name}.
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
