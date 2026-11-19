import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  Pause,
  Play,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  Video,
  FileText,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, BadgeChip, EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { ACTIVE_TRACK_SLUGS, type CourseAssignment, type CourseModule, type CourseSummary } from '../shared/types';

function toYoutubeEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    let vid = '';
    if (parsed.hostname.includes('youtu.be')) {
      vid = parsed.pathname.replace('/', '');
    } else if (parsed.hostname.includes('youtube.com')) {
      vid = parsed.searchParams.get('v') || '';
    }
    if (!vid) return null;
    return `https://www.youtube.com/embed/${vid}?rel=0`;
  } catch {
    return null;
  }
}

function formatDurationClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CoursesListPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [cycleMonth, setCycleMonth] = useState('');
  const [daysLeft, setDaysLeft] = useState(0);
  const [mentorStatus, setMentorStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newNiche, setNewNiche] = useState<string>(ACTIVE_TRACK_SLUGS[0]);
  const [newDesc, setNewDesc] = useState('');
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);

  const load = useCallback(() => {
    apiFetch<{
      courses: CourseSummary[];
      cycle_month: string;
      days_left_in_cycle: number;
      mentor_status?: string | null;
    }>('/api/courses')
      .then((d) => {
        setCourses(d.courses);
        setCycleMonth(d.cycle_month);
        setDaysLeft(d.days_left_in_cycle);
        setMentorStatus(d.mentor_status ?? null);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCourse(true);
    try {
      await apiFetch('/api/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle,
          subtitle: newSubtitle,
          niche_slug: newNiche,
          description: newDesc,
          module_title: newModuleTitle,
          video_url: newVideoUrl,
        }),
      });
      toast.success('Course published! Students can now watch and submit assignments.');
      setShowCreateCourse(false);
      setNewTitle('');
      setNewSubtitle('');
      setNewDesc('');
      setNewModuleTitle('');
      setNewVideoUrl('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingCourse(false);
    }
  };

  const activeCourses = courses.filter((c) => !c.is_coming_soon);
  const upcomingCourses = courses.filter((c) => c.is_coming_soon);

  return (
    <AppShell title="Career Courses & Competitions">
      <div className="space-y-8">
        {/* Header + Cycle Highlight */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3">
            <Starburst size={26} color="#F6D66D" className="mt-1 shrink-0" />
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold">
                Career <span className="italic text-[#C83D42]">Courses</span> &amp; Competitions
              </h1>
              <p className="text-sm text-[#5A4F4F] mt-1 max-w-2xl">
                Watch mentor-led modules, submit your post-course video or presentation assignment to unlock mentor messaging, and compete monthly for Top 5 1:1 calls.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {user?.role === 'mentor' && mentorStatus === 'approved' && (
              <button
                type="button"
                onClick={() => setShowCreateCourse(true)}
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-xs font-bold hover:bg-[#B23237] whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Record / Publish Course</span>
              </button>
            )}
            <div className="rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm px-5 py-3.5 shrink-0">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wide text-[#252020]">
                Cohort Cycle · {cycleMonth || 'This Month'}
              </div>
              <div className="font-display text-lg font-bold text-[#252020] tabular-nums mt-0.5">
                {daysLeft} days left to compete &amp; network
              </div>
            </div>
          </div>
        </div>

        {user?.role === 'mentor' && mentorStatus !== 'approved' && (
          <div className="p-4 rounded-2xl bg-[#F6D66D]/50 border-2 border-[#252020] flex items-center gap-2.5 text-xs text-[#252020]">
            <Lock className="w-4 h-4 text-[#C83D42] shrink-0" />
            <span>
              <strong>Course Recording Locked (48h Verification):</strong> Publishing new courses unlocks automatically once your mentor profile is approved.
            </span>
          </div>
        )}

        {/* How Course -> Competition -> Certificate works */}
        <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-[#C83D42]" />
            </div>
            <div>
              <div className="font-display font-bold text-sm">1. Watch Video Curriculum</div>
              <p className="text-xs text-[#5A4F4F] mt-0.5">
                Complete all 4 video lessons in a flagship track to earn your Course Fellow badge.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F6D66D] border-2 border-[#252020] flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-[#252020]" />
            </div>
            <div>
              <div className="font-display font-bold text-sm">2. Mandatory Monthly Challenge</div>
              <p className="text-xs text-[#5A4F4F] mt-0.5">
                Course graduates compete together before month-end with real startup, psych, or civic pitches.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F7A98A]/60 border-2 border-[#252020] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-[#252020]" />
            </div>
            <div>
              <div className="font-display font-bold text-sm">3. Network In Person &amp; Certify</div>
              <p className="text-xs text-[#5A4F4F] mt-0.5">
                Meet peers and mentors at the monthly Karachi meetup and unlock your Honours Certificate.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-white border-2 border-[#252020]/15 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Active Flagship Courses */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">
                  Active Flagship Tracks <span className="text-sm font-normal text-[#5A4F4F]">· Full Video + Monthly Competition</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {activeCourses.map((c, idx) => {
                  const pct = c.module_count > 0 ? Math.round((c.completed_count / c.module_count) * 100) : 0;
                  const allWatched = c.module_count > 0 && c.completed_count >= c.module_count;
                  const headerBg =
                    idx === 0 ? 'bg-[#C83D42] text-white' : idx === 1 ? 'bg-[#F6D66D] text-[#252020]' : 'bg-[#F7A98A] text-[#252020]';

                  return (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className={`px-5 py-4 border-b-2 border-[#252020] ${headerBg}`}>
                          <div className="text-[11px] font-mono font-bold uppercase tracking-wider opacity-90">
                            {c.niche_name || c.niche_slug.replace(/-/g, ' ')} · {c.duration_label}
                          </div>
                          <h3 className="font-display text-lg font-bold leading-snug mt-1">{c.title}</h3>
                        </div>

                        <div className="p-5 space-y-4">
                          <p className="text-sm text-[#4D4242] leading-relaxed">{c.subtitle}</p>

                          <div className="flex items-center gap-2.5 text-xs text-[#5A4F4F]">
                            <Avatar src={c.author_avatar || null} name={c.author_name || 'Mentor'} size="sm" />
                            <div className="min-w-0">
                              <div className="font-bold text-[#252020] truncate">Led by {c.author_name}</div>
                              <div className="truncate">{c.cohort_count} students competing this month</div>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                              <span>
                                {c.completed_count} / {c.module_count} videos watched
                              </span>
                              <span className="text-[#C83D42]">{pct}%</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-[#FFF5E8] border border-[#252020] overflow-hidden">
                              <div
                                className="h-full bg-[#C83D42] transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 text-xs space-y-1">
                            <div className="font-bold text-[#252020] flex items-center gap-1.5">
                              <Trophy className="w-3.5 h-3.5 text-[#C83D42]" />
                              <span>{c.competition_title}</span>
                            </div>
                            <div className="text-[#5A4F4F] flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{c.meetup_venue}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-5 pb-5">
                        <Link
                          to={`/courses/${c.id}`}
                          className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-[#252020] font-display text-sm font-bold transition-transform hover:-translate-y-0.5 ${
                            c.has_entered_competition
                              ? 'bg-[#F6D66D] text-[#252020]'
                              : allWatched
                                ? 'bg-[#252020] text-white'
                                : 'bg-[#C83D42] text-white'
                          }`}
                        >
                          <span>
                            {c.has_entered_competition
                              ? 'View Pitch & Meetup Pass'
                              : allWatched
                                ? 'Enter Monthly Competition'
                                : c.completed_count > 0
                                  ? 'Continue Video Course'
                                  : 'Start Video Course'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Coming Soon Preview Tracks */}
            {upcomingCourses.length > 0 && (
              <section className="space-y-4 pt-2">
                <div>
                  <h2 className="font-display text-xl font-bold">More Career Fields — Coming Soon</h2>
                  <p className="text-xs text-[#5A4F4F] mt-0.5">
                    Video curricula for these tracks are being recorded with our TEDx speakers. You can connect 1:1 with mentors in these fields today.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {upcomingCourses.map((c) => (
                    <div
                      key={c.id}
                      className="bg-[#FFF5E8] rounded-2xl border-2 border-dashed border-[#252020]/50 p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-[#6B5E5E]">
                          <span>{c.niche_name || c.niche_slug.replace(/-/g, ' ')}</span>
                          <span className="inline-flex items-center gap-1 text-[#C83D42]">
                            <Lock className="w-3 h-3" />
                            Coming Soon
                          </span>
                        </div>
                        <h3 className="font-display font-bold text-base">{c.title}</h3>
                        <p className="text-xs text-[#5A4F4F] leading-relaxed">{c.subtitle}</p>
                        <div className="text-xs text-[#6B5E5E] pt-1">Mentor Lead: {c.author_name}</div>
                      </div>
                      <Link
                        to={`/explore?niche=${c.niche_slug}`}
                        className="inline-flex items-center justify-between px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#F6D66D]/50 transition-colors"
                      >
                        <span>Browse Track Mentors</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {showCreateCourse && (
              <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
                <form
                  onSubmit={handleCreateCourse}
                  className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                >
                  <h3 className="font-display text-xl font-bold">Record / Publish Track Course</h3>
                  <div>
                    <label className="block text-xs font-bold mb-1">Course Title *</label>
                    <input
                      required
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. Zero-to-One Product Validation in Pakistan"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Track Niche *</label>
                      <select
                        value={newNiche}
                        onChange={(e) => setNewNiche(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm bg-white focus:outline-none focus:border-[#252020]"
                      >
                        {ACTIVE_TRACK_SLUGS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/-/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Subtitle</label>
                      <input
                        value={newSubtitle}
                        onChange={(e) => setNewSubtitle(e.target.value)}
                        placeholder="Short 1-line summary"
                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Description *</label>
                    <textarea
                      required
                      rows={2}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="What students will learn and what assignment they will build..."
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">First Lesson Title</label>
                      <input
                        value={newModuleTitle}
                        onChange={(e) => setNewModuleTitle(e.target.value)}
                        placeholder="e.g. Lesson 1: Talking to Users"
                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Recorded Video URL (YouTube)</label>
                      <input
                        type="url"
                        value={newVideoUrl}
                        onChange={(e) => setNewVideoUrl(e.target.value)}
                        placeholder="https://youtu.be/..."
                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateCourse(false)}
                      className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingCourse}
                      className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold disabled:opacity-60"
                    >
                      {creatingCourse ? 'Publishing...' : 'Publish Course'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

interface CourseDetailPayload {
  course: CourseSummary & { author_profession?: string; author_company?: string | null };
  modules: CourseModule[];
  completed_module_ids: string[];
  is_course_completed: boolean;
  my_assignment?: CourseAssignment | null;
  participation_badge: { id: string; type: string; label: string } | null;
  competition_badge: { id: string; type: string; label: string } | null;
  cycle_month: string;
  days_left_in_cycle: number;
  my_entry: {
    id: string;
    pitch_title: string;
    problem_statement: string;
    solution_summary: string;
    pitch_link: string | null;
    in_person_rsvp: boolean;
    status: string;
    mentor_feedback: string | null;
    certificate_id: string | null;
    verify_code: string | null;
  } | null;
  cohort_peers: Array<{
    id: string;
    student_id: string;
    student_name: string;
    student_avatar: string | null;
    student_city: string | null;
    student_grade: string | null;
    student_school: string | null;
    pitch_title: string;
    in_person_rsvp: boolean;
    connection_status: string | null;
  }>;
}

export function CourseDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'videos' | 'competition'>(
    searchParams.get('tab') === 'competition' ? 'competition' : 'videos'
  );
  const [activeModIdx, setActiveModIdx] = useState(0);

  // Built-in interactive lecture simulator fallback state
  const [useSimulator, setUseSimulator] = useState(false);
  const [simPlaying, setSimPlaying] = useState(false);
  const [simElapsed, setSimElapsed] = useState(0);
  const [markingWatched, setMarkingWatched] = useState(false);

  // Post-course assignment state
  const [assignType, setAssignType] = useState<'video' | 'presentation'>('presentation');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignSummary, setAssignSummary] = useState('');
  const [assignUrl, setAssignUrl] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Competition pitch form
  const [pitchTitle, setPitchTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [solutionSummary, setSolutionSummary] = useState('');
  const [pitchLink, setPitchLink] = useState('');
  const [inPersonRsvp, setInPersonRsvp] = useState(true);
  const [submittingPitch, setSubmittingPitch] = useState(false);
  const [connectingPeerId, setConnectingPeerId] = useState<string | null>(null);

  const simTimerRef = useRef<number | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    apiFetch<CourseDetailPayload>(`/api/courses/${id}`)
      .then((d) => {
        setData(d);
        if (d.my_assignment) {
          setAssignType(d.my_assignment.submission_type);
          setAssignTitle(d.my_assignment.title);
          setAssignSummary(d.my_assignment.summary);
          setAssignUrl(d.my_assignment.asset_url);
        }
        if (d.my_entry) {
          setPitchTitle(d.my_entry.pitch_title);
          setProblemStatement(d.my_entry.problem_statement);
          setSolutionSummary(d.my_entry.solution_summary);
          setPitchLink(d.my_entry.pitch_link || '');
          setInPersonRsvp(d.my_entry.in_person_rsvp);
        }
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const activeModule = data?.modules[activeModIdx] || null;

  useEffect(() => {
    setSimPlaying(false);
    setSimElapsed(0);
    setUseSimulator(!activeModule?.video_url);
  }, [activeModIdx, activeModule?.video_url]);

  useEffect(() => {
    if (simPlaying && activeModule) {
      simTimerRef.current = window.setInterval(() => {
        setSimElapsed((prev) => {
          const cap = Math.min(activeModule.duration_seconds, 180);
          if (prev + 1 >= cap) {
            setSimPlaying(false);
            return cap;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [simPlaying, activeModule]);

  const markWatched = async (moduleId: string) => {
    if (!id) return;
    setMarkingWatched(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        completed_module_ids: string[];
        is_course_completed: boolean;
        awarded_badge: string | null;
      }>(`/api/courses/${id}/modules/${moduleId}/complete`, {
        method: 'POST',
      });
      if (res.awarded_badge) {
        toast.success(`All modules complete! Unlocked "${res.awarded_badge}" badge & Monthly Competition!`);
      } else {
        toast.success('Module marked as watched!');
      }
      load();
      if (data && activeModIdx < data.modules.length - 1) {
        setActiveModIdx((i) => i + 1);
      } else if (res.is_course_completed) {
        setTab('competition');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setMarkingWatched(false);
    }
  };

  const submitCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSubmittingPitch(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        certificate_id: string;
        verify_code: string;
      }>(`/api/courses/${id}/compete`, {
        method: 'POST',
        body: JSON.stringify({
          pitch_title: pitchTitle,
          problem_statement: problemStatement,
          solution_summary: solutionSummary,
          pitch_link: pitchLink,
          in_person_rsvp: inPersonRsvp,
        }),
      });
      toast.success('Competition submission confirmed! Honours Certificate issued to your Career Passport.');
      load();
      if (res.verify_code) {
        // Entry card immediately displays link to certificate and verify page
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmittingPitch(false);
    }
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSubmittingAssign(true);
    try {
      await apiFetch(`/api/courses/${id}/assignment`, {
        method: 'POST',
        body: JSON.stringify({
          submission_type: assignType,
          title: assignTitle,
          summary: assignSummary,
          asset_url: assignUrl,
        }),
      });
      toast.success('Assignment added to your Career Passport & Leaderboard! You can now send 1 structured message to mentors.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmittingAssign(false);
    }
  };

  const toggleMeetupRsvp = async () => {
    if (!id) return;
    try {
      const res = await apiFetch<{ ok: boolean; in_person_rsvp: boolean }>(`/api/courses/${id}/rsvp`, {
        method: 'POST',
      });
      toast.success(res.in_person_rsvp ? 'In-person Karachi meetup RSVP confirmed!' : 'Meetup RSVP updated.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const connectPeer = async (peerId: string, peerName: string) => {
    setConnectingPeerId(peerId);
    try {
      await apiFetch('/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: peerId,
          message: `Hi ${peerName.split(' ')[0]}! Saw your pitch in the ${data?.course.title} monthly challenge cohort.`,
        }),
      });
      toast.success(`Connection request sent to ${peerName}!`);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConnectingPeerId(null);
    }
  };

  if (loading) {
    return (
      <AppShell title="Course">
        <div className="py-12 text-center text-sm text-[#6B5E5E]">Loading course curriculum...</div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Course Not Found">
        <EmptyStateArt
          title="Course not found"
          subtitle="Browse our active flagship video tracks in Entrepreneurship, Psychology, and Social Impact."
          action={
            <Link
              to="/courses"
              className="inline-flex px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
            >
              Back to Courses
            </Link>
          }
        />
      </AppShell>
    );
  }

  const { course, modules, completed_module_ids, is_course_completed } = data;
  const totalCount = modules.length;
  const doneCount = completed_module_ids.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const embedUrl = activeModule ? toYoutubeEmbedUrl(activeModule.video_url) : null;
  const isCurrentWatched = activeModule ? completed_module_ids.includes(activeModule.id) : false;

  return (
    <AppShell title={course.title}>
      <div className="space-y-6">
        {/* Top Breadcrumb + Header */}
        <div>
          <Link
            to="/courses"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42] mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Career Courses</span>
          </Link>

          <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-mono font-bold text-[#C83D42] uppercase tracking-wide">
                {course.niche_name || course.niche_slug.replace(/-/g, ' ')} · {course.duration_label} · Cycle {data.cycle_month}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{course.title}</h1>
              <p className="text-sm text-[#4D4242]">{course.description}</p>
              <div className="text-xs text-[#5A4F4F] pt-1">
                Lead Mentor:{' '}
                <Link to={`/u/${course.author_id}`} className="font-bold text-[#252020] hover:text-[#C83D42] underline">
                  {course.author_name}
                </Link>
                {course.author_profession ? ` · ${course.author_profession}` : ''}
                {course.author_company ? ` @ ${course.author_company}` : ''}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
              <div className="px-4 py-3 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020] min-w-[210px]">
                <div className="flex items-center justify-between text-xs font-bold tabular-nums">
                  <span>Course Progress</span>
                  <span className="text-[#C83D42]">
                    {doneCount}/{totalCount} ({pct}%)
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white border border-[#252020] overflow-hidden">
                  <div className="h-full bg-[#C83D42] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="inline-flex p-1 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]">
                <button
                  type="button"
                  onClick={() => setTab('videos')}
                  className={`relative px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    tab === 'videos' ? 'text-white' : 'text-[#4D4242] hover:text-[#252020]'
                  }`}
                >
                  {tab === 'videos' && (
                    <motion.div
                      layoutId="course-tab-slide"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-[#C83D42] rounded-xl"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    <span>Video Curriculum</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('competition')}
                  className={`relative px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    tab === 'competition' ? 'text-white' : 'text-[#4D4242] hover:text-[#252020]'
                  }`}
                >
                  {tab === 'competition' && (
                    <motion.div
                      layoutId="course-tab-slide"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-[#C83D42] rounded-xl"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Monthly Competition</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {course.is_coming_soon ? (
          <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] mx-auto flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <h2 className="font-display text-2xl font-bold">Video Curriculum Coming Soon</h2>
            <p className="text-sm text-[#5A4F4F] max-w-lg mx-auto">
              Our mentor team is finalizing studio sessions for {course.title}. In the meantime, connect directly with verified mentors in this field or start one of our active tracks in Entrepreneurship, Psychology, or Social Impact.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to={`/explore?niche=${course.niche_slug}`}
                className="px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
              >
                Browse Track Mentors
              </Link>
              <Link
                to="/courses"
                className="px-5 py-2.5 rounded-xl bg-white border-2 border-[#252020] text-xs font-bold hover:bg-[#FFF5E8]"
              >
                Back to Active Courses
              </Link>
            </div>
          </div>
        ) : tab === 'videos' ? (
          /* TWO-ZONE VIDEO STAGE + MODULE PLAYLIST */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Primary Video Stage */}
            <div className="lg:col-span-8 space-y-4">
              {activeModule && (
                <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow overflow-hidden">
                  {/* Video Embed OR Built-in Interactive Lecture Simulator */}
                  <div className="bg-[#252020] text-white relative">
                    {embedUrl && !useSimulator ? (
                      <div className="aspect-video w-full">
                        <iframe
                          src={embedUrl}
                          title={activeModule.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video w-full p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-br from-[#252020] via-[#312626] to-[#252020]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F6D66D]">
                            Module {activeModule.position} · Outpase Studio Player
                          </span>
                          <span className="text-xs font-mono text-white/80 tabular-nums">
                            {formatDurationClock(simElapsed)} / {formatDurationClock(activeModule.duration_seconds)}
                          </span>
                        </div>

                        <div className="my-auto py-4 text-center space-y-3 max-w-xl mx-auto">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#F6D66D]">
                            <span>{activeModule.speaker_name}</span>
                            <span>·</span>
                            <span>{activeModule.speaker_role}</span>
                          </div>
                          <h3 className="font-display text-xl sm:text-2xl font-bold leading-snug">
                            {activeModule.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-white/80 leading-relaxed">{activeModule.summary}</p>
                        </div>

                        <div className="space-y-3">
                          <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                            <div
                              className="h-full bg-[#F6D66D] transition-all duration-300"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((simElapsed / Math.min(activeModule.duration_seconds, 180)) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSimPlaying((p) => !p)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C83D42] border border-white/25 text-white text-xs font-bold hover:bg-[#B23237]"
                            >
                              {simPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              <span>{simPlaying ? 'Pause Lecture' : simElapsed > 0 ? 'Resume Lecture' : 'Play Lecture'}</span>
                            </button>
                            {embedUrl && (
                              <button
                                type="button"
                                onClick={() => setUseSimulator(false)}
                                className="text-xs font-bold text-[#F6D66D] hover:underline"
                              >
                                Switch to YouTube Embed
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Module Details + Mark Watched Action */}
                  <div className="p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-mono font-bold text-[#C83D42]">
                          Lesson {activeModule.position} of {totalCount} · {Math.round(activeModule.duration_seconds / 60)} min
                        </div>
                        <h2 className="font-display text-xl sm:text-2xl font-bold mt-1">{activeModule.title}</h2>
                        <div className="text-xs text-[#5A4F4F] mt-1 font-medium">
                          Speaker: <span className="font-bold text-[#252020]">{activeModule.speaker_name}</span> ({activeModule.speaker_role})
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {embedUrl && !useSimulator && (
                          <button
                            type="button"
                            onClick={() => setUseSimulator(true)}
                            className="px-3 py-2 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]/50"
                          >
                            Interactive Player
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={markingWatched}
                          onClick={() => markWatched(activeModule.id)}
                          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#252020] text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                            isCurrentWatched
                              ? 'bg-[#F6D66D] text-[#252020]'
                              : 'bg-[#C83D42] text-white hover:bg-[#B23237]'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {markingWatched
                              ? 'Saving...'
                              : isCurrentWatched
                                ? 'Watched ✓'
                                : 'Mark Module Watched'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <p className="text-sm text-[#4D4242] leading-relaxed">{activeModule.summary}</p>

                    <div className="p-4 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]/15 space-y-2">
                      <div className="font-display text-xs font-bold uppercase tracking-wide text-[#252020]">
                        Key Takeaways
                      </div>
                      <ul className="space-y-1.5 text-sm text-[#3A3232]">
                        {activeModule.key_takeaways.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-mono text-xs font-bold text-[#C83D42] mt-0.5">0{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Playlist & Participation Status */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-3">
                <div className="font-display text-base font-bold">Course Modules ({doneCount}/{totalCount})</div>
                <div className="space-y-2">
                  {modules.map((m, i) => {
                    const isWatched = completed_module_ids.includes(m.id);
                    const isActive = i === activeModIdx;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setActiveModIdx(i)}
                        className={`w-full p-3.5 rounded-xl border-2 text-left transition-colors flex items-start gap-3 ${
                          isActive
                            ? 'bg-[#F6D66D]/50 border-[#252020]'
                            : 'bg-[#FFF5E8] border-[#252020]/15 hover:border-[#252020]'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-lg border border-[#252020] flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 ${
                            isWatched ? 'bg-[#C83D42] text-white' : 'bg-white text-[#252020]'
                          }`}
                        >
                          {isWatched ? '✓' : m.position}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display font-bold text-xs leading-snug">{m.title}</div>
                          <div className="text-[11px] text-[#6B5E5E] mt-0.5 truncate">
                            {m.speaker_name} · {Math.round(m.duration_seconds / 60)}m
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Post-Course Video / Presentation Assignment */}
              <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 font-display text-sm font-bold">
                  <FileText className="w-4 h-4 text-[#C83D42]" />
                  <span>Post-Course Assignment</span>
                </div>
                {!is_course_completed ? (
                  <p className="text-xs text-[#5A4F4F] leading-relaxed">
                    Finish all {totalCount} videos to submit a <strong>video</strong> or <strong>presentation</strong> assignment. Submitting adds it to your Profile, places you on the Leaderboard, and unlocks sending 1 structured message to mentors.
                  </p>
                ) : (
                  <form onSubmit={submitAssignment} className="space-y-3">
                    {data.my_assignment && (
                      <div className="p-2.5 rounded-xl bg-[#F6D66D]/50 border border-[#252020] text-xs font-bold text-[#252020]">
                        Submitted to Career Passport ✓ · Mentor messaging unlocked
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(['presentation', 'video'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAssignType(t)}
                          className={`py-2 rounded-xl border-2 text-xs font-bold capitalize ${
                            assignType === t
                              ? 'bg-[#252020] text-white border-[#252020]'
                              : 'bg-[#FFF5E8] text-[#252020] border-[#252020]/25'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      required
                      value={assignTitle}
                      onChange={(e) => setAssignTitle(e.target.value)}
                      placeholder="Assignment Title"
                      className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-xs focus:outline-none focus:border-[#252020]"
                    />
                    <textarea
                      required
                      rows={2}
                      value={assignSummary}
                      onChange={(e) => setAssignSummary(e.target.value)}
                      placeholder="Brief takeaways or findings (min 15 chars)"
                      className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-xs focus:outline-none focus:border-[#252020]"
                    />
                    <input
                      required
                      type="url"
                      value={assignUrl}
                      onChange={(e) => setAssignUrl(e.target.value)}
                      placeholder={assignType === 'video' ? 'https://youtu.be/...' : 'https://docs.google.com/presentation/...'}
                      className="w-full px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-xs focus:outline-none focus:border-[#252020]"
                    />
                    <button
                      type="submit"
                      disabled={submittingAssign}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237] disabled:opacity-60"
                    >
                      {submittingAssign
                        ? 'Saving to Profile...'
                        : data.my_assignment
                          ? 'Update Assignment'
                          : 'Submit Assignment & Unlock Messaging'}
                    </button>
                  </form>
                )}
              </div>

              {/* Participation Badge & Competition Unlock Status */}
              <div className="bg-[#FFF5E8] rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-3">
                <div className="flex items-center gap-2 font-display text-sm font-bold">
                  <Award className="w-4 h-4 text-[#C83D42]" />
                  <span>Participation &amp; Honours Path</span>
                </div>
                {is_course_completed ? (
                  <>
                    <p className="text-xs text-[#3A3232] leading-relaxed">
                      You completed all video modules and earned your participation badge! Compete in this month&apos;s challenge to aim for Top 5 &amp; unlock 1:1 mentor meetings.
                    </p>
                    {data.participation_badge && (
                      <div className="pt-1">
                        <BadgeChip type={data.participation_badge.type} label={data.participation_badge.label} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setTab('competition')}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>Go to Monthly Competition</span>
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-[#5A4F4F] leading-relaxed">
                    Watch all {totalCount} modules to earn the <strong>Course Fellow</strong> sticker badge and unlock entry into <strong>{course.competition_title}</strong>.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* MONTHLY COMPETITION & IN-PERSON NETWORKING TAB */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-5">
              {/* Competition Brief + In-Person Meetup Card */}
              <div className="bg-[#F6D66D] rounded-3xl border-2 border-[#252020] editorial-shadow p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wide text-[#252020]">
                    <Trophy className="w-4 h-4 text-[#C83D42]" />
                    <span>Mandatory Monthly Cohort Competition · {data.cycle_month}</span>
                  </div>
                  <span className="text-xs font-bold text-[#C83D42] tabular-nums">
                    {data.days_left_in_cycle} days left
                  </span>
                </div>
                <h2 className="font-display text-2xl font-bold">{course.competition_title}</h2>
                <p className="text-sm text-[#252020]/90 leading-relaxed">{course.competition_brief}</p>

                <div className="p-4 rounded-2xl bg-white border-2 border-[#252020] space-y-2">
                  <div className="font-display font-bold text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#C83D42]" />
                    <span>{course.meetup_title}</span>
                  </div>
                  <div className="text-xs text-[#4D4242] flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#C83D42]" />
                      {course.meetup_venue}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-[#C83D42]" />
                      {course.meetup_date_label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Honours Result Banner if Submitted */}
              {data.my_entry && (
                <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C83D42]">
                        <Sparkles className="w-4 h-4" />
                        <span>Entry Submitted · Honours Finalist Confirmed</span>
                      </div>
                      <h3 className="font-display text-xl font-bold">{data.my_entry.pitch_title}</h3>
                    </div>
                    {data.competition_badge && (
                      <BadgeChip type={data.competition_badge.type} label={data.competition_badge.label} />
                    )}
                  </div>

                  {data.my_entry.mentor_feedback && (
                    <div className="p-4 rounded-2xl bg-[#FFF5E8] border border-[#252020]/20 text-sm text-[#3A3232]">
                      <div className="text-xs font-bold text-[#252020] mb-1">Mentor Panel Note</div>
                      {data.my_entry.mentor_feedback}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {data.my_entry.certificate_id && (
                      <Link
                        to={`/certificates/${data.my_entry.certificate_id}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                      >
                        <Award className="w-4 h-4" />
                        <span>View Honours Certificate &amp; PDF</span>
                      </Link>
                    )}
                    {data.my_entry.verify_code && (
                      <Link
                        to={`/verify/${data.my_entry.verify_code}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border-2 border-[#252020] text-xs font-bold hover:bg-[#FFF5E8]"
                      >
                        <span>Verify Code: {data.my_entry.verify_code}</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={toggleMeetupRsvp}
                      className={`px-4 py-2.5 rounded-xl border-2 border-[#252020] text-xs font-bold ${
                        data.my_entry.in_person_rsvp ? 'bg-[#F6D66D]' : 'bg-white'
                      }`}
                    >
                      {data.my_entry.in_person_rsvp ? 'In-Person Meetup RSVP: Going ✓' : 'RSVP for In-Person Meetup'}
                    </button>
                  </div>
                </div>
              )}

              {/* Locked vs Unlocked Submission Form */}
              {!is_course_completed ? (
                <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#FFF5E8] border-2 border-[#252020] flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5 text-[#C83D42]" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold">Complete all {totalCount} course videos to compete</h3>
                      <p className="text-xs text-[#5A4F4F]">
                        Every monthly finalist first watches the full track curriculum ({doneCount}/{totalCount} complete).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('videos')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                  >
                    <Video className="w-4 h-4" />
                    <span>Resume Video Curriculum</span>
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={submitCompetition}
                  className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4"
                >
                  <h3 className="font-display text-lg font-bold">
                    {data.my_entry ? 'Update Your Monthly Pitch' : 'Submit Your Monthly Competition Entry'}
                  </h3>

                  <div>
                    <label className="block text-xs font-bold mb-1.5">Project / Startup / Initiative Name</label>
                    <input
                      required
                      value={pitchTitle}
                      onChange={(e) => setPitchTitle(e.target.value)}
                      placeholder="e.g. TaleemBridge — Peer Urdu-English Exam Notes"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1.5">Problem Statement</label>
                    <textarea
                      required
                      rows={2}
                      value={problemStatement}
                      onChange={(e) => setProblemStatement(e.target.value)}
                      placeholder="Who faces this problem in Pakistan today and why does it matter?"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1.5">Your Solution &amp; Next 30-Day Plan</label>
                    <textarea
                      required
                      rows={3}
                      value={solutionSummary}
                      onChange={(e) => setSolutionSummary(e.target.value)}
                      placeholder="How will you validate or launch this over the next 30 days?"
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1.5">Pitch Deck / Demo Link (Optional)</label>
                    <input
                      type="url"
                      value={pitchLink}
                      onChange={(e) => setPitchLink(e.target.value)}
                      placeholder="https://docs.google.com/presentation/..."
                      className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FFF5E8] border border-[#252020]/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inPersonRsvp}
                      onChange={(e) => setInPersonRsvp(e.target.checked)}
                      className="mt-0.5 accent-[#C83D42]"
                    />
                    <span className="text-xs text-[#252020]">
                      <strong>RSVP for In-Person Cohort Meetup</strong> — Reserve my seat at {course.meetup_venue} ({course.meetup_date_label}) to pitch live and network with peers &amp; mentors.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submittingPitch}
                    className="w-full py-3 px-5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white font-display text-sm font-bold hover:bg-[#B23237] disabled:opacity-60"
                  >
                    {submittingPitch
                      ? 'Confirming Entry & Generating Honours Certificate...'
                      : data.my_entry
                        ? 'Update Pitch Submission'
                        : 'Submit Entry & Claim Honours Certificate'}
                  </button>
                </form>
              )}
            </div>

            {/* Cohort Networking Peer Directory */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    This Month&apos;s Competing Cohort ({data.cohort_peers.length})
                  </h3>
                  <p className="text-xs text-[#5A4F4F] mt-0.5">
                    Students who completed the course and entered {data.cycle_month}&apos;s challenge. Connect before meeting in person!
                  </p>
                </div>

                {data.cohort_peers.length === 0 ? (
                  <p className="text-sm text-[#5A4F4F]">Be the first student in this cohort to submit your pitch!</p>
                ) : (
                  <div className="space-y-3">
                    {data.cohort_peers.map((peer) => {
                      const isMe = peer.student_id === user?.id;
                      return (
                        <div
                          key={peer.id}
                          className="p-4 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]/20 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link to={`/u/${peer.student_id}`} className="flex items-center gap-3 min-w-0">
                              <Avatar src={peer.student_avatar} name={peer.student_name} size="md" />
                              <div className="min-w-0">
                                <div className="font-display font-bold text-sm truncate hover:underline">
                                  {peer.student_name} {isMe ? '(You)' : ''}
                                </div>
                                <div className="text-xs text-[#6B5E5E] truncate">
                                  {[peer.student_grade, peer.student_school, peer.student_city].filter(Boolean).join(' · ')}
                                </div>
                              </div>
                            </Link>

                            {!isMe && (
                              peer.connection_status ? (
                                <span className="text-[11px] font-bold text-[#C83D42] shrink-0 capitalize">
                                  {peer.connection_status}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={connectingPeerId === peer.student_id}
                                  onClick={() => connectPeer(peer.student_id, peer.student_name)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border-2 border-[#252020] text-xs font-bold hover:bg-[#F6D66D]/50 shrink-0"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>{connectingPeerId === peer.student_id ? '...' : 'Connect'}</span>
                                </button>
                              )
                            )}
                          </div>

                          <div className="text-xs font-bold text-[#252020]">Pitch: {peer.pitch_title}</div>
                          {peer.in_person_rsvp && (
                            <div className="text-[11px] font-semibold text-[#5A4F4F] flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#C83D42]" />
                              <span>Attending {course.meetup_venue} meetup</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
