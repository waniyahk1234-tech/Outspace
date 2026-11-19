import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Video, CheckCircle2, Star, Trash2, Plus, Lock, Copy, Loader2, ExternalLink, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatPKT, type GroupQASession } from '../shared/types';

interface SlotItem {
  id: string;
  start_at: string;
  end_at: string;
  is_booked: number;
}

interface MeetingItem {
  id: string;
  mentor_id: string;
  student_id: string;
  topic: string;
  meet_url: string;
  status: string;
  mentor_notes: string | null;
  rating: number | null;
  feedback: string | null;
  start_at: string;
  end_at: string;
  mentor_name?: string;
  mentor_avatar?: string | null;
  profession?: string;
  company?: string | null;
  student_name?: string;
  student_avatar?: string | null;
  grade_level?: string | null;
  certificate_id?: string | null;
  verify_code?: string | null;
}

interface ConnectedMentor {
  id: string;
  full_name: string;
  avatar_url: string | null;
  profession: string;
  company: string | null;
  open_slots: SlotItem[];
}

export default function SessionsPage() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [connectedMentors, setConnectedMentors] = useState<ConnectedMentor[]>([]);
  const [groupQAs, setGroupQAs] = useState<GroupQASession[]>([]);
  const [oneOnOneUnlocked, setOneOnOneUnlocked] = useState(false);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [isWinner, setIsWinner] = useState(false);
  const [mentorStatus, setMentorStatus] = useState<string>('approved');
  const [loading, setLoading] = useState(true);

  // Mentor add slot form
  const [slotDate, setSlotDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [slotTime, setSlotTime] = useState('17:00');
  const [duration, setDuration] = useState('45');

  // Complete session modal
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [mentorNotes, setMentorNotes] = useState('');

  // Book slot modal
  const [bookSlotId, setBookSlotId] = useState<string | null>(null);
  const [bookTopic, setBookTopic] = useState('');
  const [bookingStage, setBookingStage] = useState<'form' | 'confirming'>('form');
  const [confirmedMeet, setConfirmedMeet] = useState<{
    meet_url: string;
    start_at: string;
    mentor_name: string;
    topic: string;
  } | null>(null);

  // Rate session modal
  const [rateId, setRateId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(() => {
    apiFetch<{
      role: string;
      mentor_status?: string;
      slots?: SlotItem[];
      meetings: MeetingItem[];
      connected_mentors?: ConnectedMentor[];
      one_on_one_unlocked?: boolean;
      leaderboard_rank?: number | null;
      is_competition_winner?: boolean;
      group_qas?: GroupQASession[];
    }>('/api/sessions')
      .then((d) => {
        setSlots(d.slots || []);
        setMeetings(d.meetings || []);
        setConnectedMentors(d.connected_mentors || []);
        setGroupQAs(d.group_qas || []);
        setOneOnOneUnlocked(Boolean(d.one_on_one_unlocked));
        setLeaderboardRank(d.leaderboard_rank ?? null);
        setIsWinner(Boolean(d.is_competition_winner));
        if (d.mentor_status) setMentorStatus(d.mentor_status);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleGroupRsvp = async (meetingId: string) => {
    try {
      const res = await apiFetch<{ ok: boolean; has_rsvped: boolean }>(`/api/groups/seminars/${meetingId}/rsvp`, {
        method: 'POST',
      });
      toast.success(res.has_rsvped ? 'RSVP confirmed for Monthly Group Q&A!' : 'RSVP removed.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const addSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isoPKT = `${slotDate}T${slotTime}:00+05:00`;
      await apiFetch('/api/availability', {
        method: 'POST',
        body: JSON.stringify({ start_at: new Date(isoPKT).toISOString(), duration_minutes: Number(duration) }),
      });
      toast.success('Availability slot added (PKT)!');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const deleteSlot = async (id: string) => {
    try {
      await apiFetch(`/api/availability/${id}`, { method: 'DELETE' });
      toast.success('Slot removed.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const bookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookSlotId) return;
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
          body: JSON.stringify({ slot_id: bookSlotId, topic: bookTopic || 'Career Exploration 1:1' }),
        }),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      setConfirmedMeet({
        meet_url: res.meet_url,
        start_at: res.start_at,
        mentor_name: res.mentor_name,
        topic: res.topic,
      });
      toast.success('Booking confirmed! Meet link generated.');
      setBookSlotId(null);
      setBookTopic('');
      setBookingStage('form');
      load();
    } catch (err) {
      setBookingStage('form');
      toast.error((err as Error).message);
    }
  };

  const completeMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeId) return;
    try {
      await apiFetch(`/api/sessions/${completeId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ mentor_notes: mentorNotes }),
      });
      toast.success('Session marked complete! Certificate & badge issued to student.');
      setCompleteId(null);
      setMentorNotes('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const rateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateId) return;
    try {
      await apiFetch(`/api/sessions/${rateId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating, feedback }),
      });
      toast.success('Thank you for rating your mentor!');
      setRateId(null);
      setFeedback('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const canJoinNow = (startAt: string) => {
    const diffMs = new Date(startAt).getTime() - Date.now();
    return diffMs <= 10 * 60 * 1000;
  };

  return (
    <AppShell title="Sessions">
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <Starburst size={24} color="#F6D66D" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              1:1 Mentorship <span className="italic text-[#C83D42]">Sessions</span>
            </h1>
            <p className="text-sm text-[#5A4F4F]">All session times are shown in Pakistan Standard Time (PKT).</p>
          </div>
        </div>

        {confirmedMeet && (
          <div className="rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#C83D42] uppercase">
                <CheckCircle2 className="w-4 h-4" />
                <span>Booking Confirmed · Meet Link Ready</span>
              </div>
              <div className="font-display text-lg font-bold">
                1:1 with {confirmedMeet.mentor_name} — {confirmedMeet.topic}
              </div>
              <div className="text-xs font-mono text-[#252020]">{formatPKT(confirmedMeet.start_at)}</div>
              <div className="text-xs font-mono font-bold text-[#C83D42] break-all pt-1">{confirmedMeet.meet_url}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(confirmedMeet.meet_url);
                  toast.success('Meet link copied!');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border-2 border-[#252020] text-xs font-bold hover:bg-[#FFF5E8]"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </button>
              <a
                href={confirmedMeet.meet_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Meet Link</span>
              </a>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-sm text-[#6B5E5E]">Loading sessions...</div>
        ) : user?.role === 'mentor' ? (
          <>
            {mentorStatus !== 'approved' ? (
              <div className="bg-[#F6D66D]/50 rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3">
                <div className="flex items-center gap-2 font-display text-lg font-bold">
                  <Lock className="w-5 h-5 text-[#C83D42]" />
                  <span>1:1 Slots Locked During 48-Hour Verification</span>
                </div>
                <p className="text-sm text-[#4D4242]">
                  Your mentor profile is currently under 48-hour verification. Once verified, you can publish 1:1 slots and host Group Q&amp;As. Meanwhile, inspect top student videos &amp; presentations on the Leaderboard.
                </p>
                <Link
                  to="/leaderboard"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#252020] text-white text-xs font-bold"
                >
                  <span>Browse Top Student Leaderboard →</span>
                </Link>
              </div>
            ) : (
              <>
                {/* Mentor Add Slot */}
                <form
                  onSubmit={addSlot}
                  className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4"
                >
                  <div className="flex items-center gap-2 font-display text-lg font-bold">
                    <Calendar className="w-5 h-5 text-[#C83D42]" />
                    <span>Add Availability Slot (PKT)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Date</label>
                      <input
                        type="date"
                        required
                        value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Start Time (PKT)</label>
                      <input
                        type="time"
                        required
                        value={slotTime}
                        onChange={(e) => setSlotTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Duration</label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-sm bg-white focus:outline-none focus:border-[#252020]"
                      >
                        <option value="30">30 minutes</option>
                        <option value="45">45 minutes</option>
                        <option value="60">60 minutes</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-sm font-bold hover:bg-[#B23237]"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Slot</span>
                      </button>
                    </div>
                  </div>
                </form>

                {/* Mentor Open Slots */}
                <section className="space-y-3">
                  <h2 className="font-display text-lg font-bold">Your Availability Slots</h2>
                  {slots.length === 0 ? (
                    <EmptyStateArt
                      title="No availability slots added"
                      subtitle="Publish an upcoming 30-60 minute PKT slot above so Competition Winners & Top 5 finalists can book 1:1 sessions."
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {slots.map((s) => (
                        <div
                          key={s.id}
                          className="bg-white rounded-xl border-2 border-[#252020] editorial-shadow-sm p-4 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-xs font-mono font-bold">{formatPKT(s.start_at)}</div>
                            <div className="text-xs text-[#6B5E5E] mt-0.5 font-semibold">
                              {s.is_booked ? 'Booked' : 'Open'}
                            </div>
                          </div>
                          {!s.is_booked && (
                            <button
                              onClick={() => deleteSlot(s.id)}
                              className="p-2 text-[#6B5E5E] hover:text-[#C83D42]"
                              title="Delete slot"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        ) : (
          /* Student 1:1 Booking (Competition Winner / Top 5 Gate) + Free Monthly Group Q&As */
          <div className="space-y-8">
            <section className="space-y-4">
              {oneOnOneUnlocked ? (
                <>
                  <div className="p-4 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm font-bold text-[#252020]">
                      <Trophy className="w-5 h-5 text-[#C83D42] shrink-0" />
                      <span>
                        {isWinner
                          ? 'Competition Winner! Your 1:1 mentor booking is unlocked.'
                          : `Top 5 Finalist (Rank #${leaderboardRank})! Pick a mentor PKT slot below to book your 1:1 meeting.`}
                      </span>
                    </div>
                    <Link
                      to="/leaderboard"
                      className="text-xs font-bold text-[#252020] underline whitespace-nowrap"
                    >
                      View Leaderboard →
                    </Link>
                  </div>

                  <h2 className="font-display text-lg font-bold">Available Mentor 1:1 Dates &amp; Slots (PKT)</h2>
                  {connectedMentors.length === 0 ? (
                    <EmptyStateArt
                      title="No open slots right now"
                      subtitle="Mentors publish fresh weekly PKT dates regularly. Check back soon or explore mentor profiles."
                    />
                  ) : (
                    <div className="space-y-4">
                      {connectedMentors.map((m) => (
                        <div
                          key={m.id}
                          className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-4"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar src={m.avatar_url} name={m.full_name} size="md" />
                            <div>
                              <Link to={`/u/${m.id}`} className="font-display font-bold hover:underline">
                                {m.full_name}
                              </Link>
                              <div className="text-xs text-[#6B5E5E]">
                                {m.profession}
                                {m.company ? ` @ ${m.company}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            {m.open_slots.map((slot) => (
                              <button
                                key={slot.id}
                                onClick={() => setBookSlotId(slot.id)}
                                className="p-3 rounded-xl border-2 border-[#252020]/35 bg-[#FFF5E8] hover:border-[#252020] hover:bg-[#F6D66D]/45 transition-colors text-left"
                              >
                                <div className="text-xs font-mono font-bold">{formatPKT(slot.start_at)}</div>
                                <div className="text-xs font-bold text-[#C83D42] mt-1">Book 1:1 →</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F6D66D] border-2 border-[#252020] flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5 text-[#C83D42]" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-bold">
                        1:1 Mentor Meetings Unlock for Competition Winners &amp; Top 5
                      </h2>
                      <p className="text-sm text-[#4D4242] leading-relaxed">
                        To protect mentors&apos; time, private 1:1 booking opens when you win a course&apos;s monthly competition or secure a Top 5 spot on the Student Leaderboard.
                        {leaderboardRank ? ` You are currently ranked #${leaderboardRank}.` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/courses"
                      className="px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                    >
                      Complete Course &amp; Compete →
                    </Link>
                    <Link
                      to="/leaderboard"
                      className="px-4 py-2.5 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] text-xs font-bold hover:bg-[#F6D66D]/60"
                    >
                      Check Top 5 Leaderboard
                    </Link>
                  </div>
                </div>
              )}
            </section>

            {/* Free Monthly Group Q&A Sessions */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Monthly Group Q&amp;A Sessions (Open to All Students)</h2>
                <Link to="/groups" className="text-xs font-bold text-[#C83D42] hover:underline">
                  All Groups →
                </Link>
              </div>
              {groupQAs.length === 0 ? (
                <p className="text-sm text-[#5A4F4F]">No upcoming Group Q&amp;As scheduled yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupQAs.map((qa) => (
                    <div
                      key={qa.id}
                      className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="text-[11px] font-mono font-bold text-[#C83D42] uppercase">
                          {qa.group_name || 'Niche Group'}
                        </div>
                        <div className="font-display font-bold text-sm">{qa.topic}</div>
                        <div className="text-xs text-[#5A4F4F]">
                          Host: <strong>{qa.mentor_name}</strong> · {qa.start_at ? formatPKT(qa.start_at) : 'Monthly'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#252020]/10">
                        <span className="text-xs text-[#6B5E5E] tabular-nums">{qa.rsvp_count} attending</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleGroupRsvp(qa.id)}
                            className={`px-3 py-1.5 rounded-xl border-2 border-[#252020] text-xs font-bold ${
                              qa.has_rsvped ? 'bg-[#F6D66D]' : 'bg-[#FFF5E8]'
                            }`}
                          >
                            {qa.has_rsvped ? 'Going ✓' : 'RSVP'}
                          </button>
                          <a
                            href={qa.meet_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Meet</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Meetings List (Upcoming & Completed) */}
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold">Your Booked &amp; Past Sessions</h2>
          {meetings.length === 0 ? (
            <EmptyStateArt
              title="No sessions scheduled yet"
              subtitle="Book a 1:1 slot with any connected mentor to generate your Jitsi Meet link and earn a verified certificate."
            />
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => {
                const joinActive = m.status === 'booked' && canJoinNow(m.start_at);
                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-base">
                          {user?.role === 'mentor' ? m.student_name : m.mentor_name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border border-[#252020] text-[11px] font-bold capitalize ${
                            m.status === 'completed' ? 'bg-[#F6D66D] text-[#252020]' : 'bg-[#F7A98A]/50 text-[#252020]'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      <div className="text-sm text-[#4D4242] font-medium">{m.topic}</div>
                      {m.start_at && <div className="text-xs font-mono text-[#6B5E5E]">{formatPKT(m.start_at)}</div>}
                      {m.meet_url && m.status === 'booked' && (
                        <div className="text-xs font-mono text-[#5A4F4F] truncate">
                          Meeting URL:{' '}
                          <a href={m.meet_url} target="_blank" rel="noreferrer" className="underline text-[#C83D42]">
                            {m.meet_url}
                          </a>
                        </div>
                      )}
                      {m.mentor_notes && (
                        <div className="text-xs text-[#4D4242] pt-1">Mentor notes: {m.mentor_notes}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {m.status === 'booked' && (
                        <>
                          {m.meet_url && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(m.meet_url);
                                toast.success('Meet link copied!');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Meet Link</span>
                            </button>
                          )}
                          {joinActive ? (
                            <a
                              href={m.meet_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                            >
                              <Video className="w-4 h-4" />
                              <span>Join Meet Call</span>
                            </a>
                          ) : (
                            <span
                              title="Meet call opens 10 minutes before start"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[#252020]/30 bg-[#FFF5E8] text-xs font-bold text-[#6B5E5E]"
                            >
                              <Video className="w-4 h-4" />
                              <span>Meet Link Ready</span>
                            </span>
                          )}

                          {user?.role === 'mentor' && (
                            <button
                              onClick={() => setCompleteId(m.id)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#252020] text-white text-xs font-bold hover:bg-[#3A3232]"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Mark Complete</span>
                            </button>
                          )}
                        </>
                      )}

                      {m.status === 'completed' && m.certificate_id && (
                        <Link
                          to={`/certificates/${m.certificate_id}`}
                          className="px-4 py-2 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-[#252020] text-xs font-bold hover:-translate-y-0.5 transition-transform"
                        >
                          View Certificate
                        </Link>
                      )}

                      {m.status === 'completed' && user?.role === 'student' && !m.rating && (
                        <button
                          onClick={() => setRateId(m.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
                        >
                          <Star className="w-3.5 h-3.5 text-[#C83D42]" />
                          <span>Rate Session</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Book Modal */}
        {bookSlotId && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            {bookingStage === 'confirming' ? (
              <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-[#C83D42] animate-spin mx-auto" />
                <h3 className="font-display text-xl font-bold">Please wait until your booking confirms...</h3>
                <p className="text-xs text-[#5A4F4F]">
                  Locking in your PKT time slot and generating your Meet link.
                </p>
              </div>
            ) : (
              <form
                onSubmit={bookSlot}
                className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
              >
                <h3 className="font-display text-xl font-bold">Confirm 1:1 Booking</h3>
                <div>
                  <label className="block text-xs font-bold mb-1.5">Session Topic</label>
                  <input
                    required
                    value={bookTopic}
                    onChange={(e) => setBookTopic(e.target.value)}
                    placeholder="e.g. Choosing between Entrepreneurship and BS Psychology"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBookSlotId(null)}
                    className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                  >
                    Confirm &amp; Generate Meet Link
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Complete Session Modal */}
        {completeId && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <form
              onSubmit={completeMeeting}
              className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-bold">Mark Session Complete</h3>
              <p className="text-xs text-[#5A4F4F]">
                Completing this session automatically issues a verifiable certificate and badge to the student&apos;s
                Career Passport.
              </p>
              <textarea
                required
                rows={3}
                value={mentorNotes}
                onChange={(e) => setMentorNotes(e.target.value)}
                placeholder="Key takeaways and recommended next steps for the student..."
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCompleteId(null)}
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Complete &amp; Issue Certificate
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rate Session Modal */}
        {rateId && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <form
              onSubmit={rateMeeting}
              className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-bold">Rate Your Session</h3>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`w-10 h-10 rounded-xl border-2 border-[#252020] font-display font-bold text-sm transition-colors ${
                      rating >= n ? 'bg-[#F6D66D] text-[#252020]' : 'bg-white text-[#6B5E5E]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="How helpful was this conversation?"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRateId(null)}
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Submit Rating
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}
