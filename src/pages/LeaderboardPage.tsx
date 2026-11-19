import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Video, FileText, ExternalLink, Lock, CheckCircle2, X, Award, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { ACTIVE_TRACK_SLUGS, formatPKTDateOnly, type CourseAssignment, type LeaderboardEntry } from '../shared/types';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [cycleMonth, setCycleMonth] = useState('');
  const [daysLeft, setDaysLeft] = useState(0);
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = trackFilter !== 'all' ? `?niche=${encodeURIComponent(trackFilter)}` : '';
    apiFetch<{ entries: LeaderboardEntry[]; cycle_month: string; days_left_in_cycle: number }>(`/api/leaderboard${qs}`)
      .then((d) => {
        setEntries(d.entries);
        setCycleMonth(d.cycle_month);
        setDaysLeft(d.days_left_in_cycle);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, [trackFilter]);

  const openAssignmentUrl = (url: string) => {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      toast.info(`Submitted link: ${url}`);
    }
  };

  return (
    <AppShell title="Top Student Leaderboard">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#C83D42]">
              <Trophy className="w-4 h-4" />
              <span>Monthly Leaderboard · {cycleMonth || 'Current Cycle'}</span>
            </div>
            <h1 className="font-display text-3xl font-bold mt-1">Top Student Leaderboard</h1>
            <p className="text-sm text-[#5A4F4F] mt-1 max-w-2xl">
              Click any student to inspect their post-course video &amp; presentation assignments. Top 5 finalists &amp; monthly winners unlock 1:1 mentor booking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm font-mono text-xs font-bold tabular-nums whitespace-nowrap">
              {daysLeft} days left in cycle
            </div>
          </div>
        </div>

        {/* Track Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTrackFilter('all')}
            className={`px-3.5 py-2 rounded-xl border-2 text-xs font-bold transition-colors whitespace-nowrap ${
              trackFilter === 'all'
                ? 'bg-[#252020] text-white border-[#252020]'
                : 'bg-white text-[#252020] border-[#252020]/25 hover:border-[#252020]'
            }`}
          >
            All Tracks
          </button>
          {ACTIVE_TRACK_SLUGS.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => setTrackFilter(slug)}
              className={`px-3.5 py-2 rounded-xl border-2 text-xs font-bold capitalize transition-colors whitespace-nowrap ${
                trackFilter === slug
                  ? 'bg-[#C83D42] text-white border-[#252020]'
                  : 'bg-white text-[#252020] border-[#252020]/25 hover:border-[#252020]'
              }`}
            >
              {slug.replace(/-/g, ' ')}
            </button>
          ))}
        </div>

        {user?.role === 'mentor' && user.mentor_details?.status !== 'approved' && (
          <div className="p-4 rounded-2xl bg-[#F6D66D]/50 border-2 border-[#252020] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-[#252020]">
              <Lock className="w-4 h-4 text-[#C83D42] shrink-0 mt-0.5" />
              <span>
                <strong>48-Hour Verification Mode:</strong> You can browse students &amp; inspect all submitted course presentations/videos right now. Recording courses, 1:1 scheduling, and accepting connections unlock after verification.
              </span>
            </div>
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              <div className="h-12 rounded-xl bg-[#FFF5E8] animate-pulse" />
              <div className="h-12 rounded-xl bg-[#FFF5E8] animate-pulse" />
              <div className="h-12 rounded-xl bg-[#FFF5E8] animate-pulse" />
            </div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="font-display font-bold text-lg">No submissions in this track yet</div>
              <p className="text-sm text-[#5A4F4F]">
                Students appear here as soon as they finish a course and submit their post-course video or presentation assignment.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#252020] bg-[#FFF5E8] text-[11px] font-mono font-bold uppercase tracking-wider text-[#5A4F4F]">
                    <th className="py-3.5 px-4">Rank</th>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Latest Project / Pitch</th>
                    <th className="py-3.5 px-4 text-right">Assignments</th>
                    <th className="py-3.5 px-4 text-right">Score</th>
                    <th className="py-3.5 px-4">1:1 Eligibility</th>
                    <th className="py-3.5 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252020]/10 text-sm">
                  {entries.map((entry) => {
                    const isSelf = entry.student_id === user?.id;
                    return (
                      <tr
                        key={entry.student_id}
                        onClick={() => setSelectedStudent(entry)}
                        className={`cursor-pointer transition-colors hover:bg-[#FFF5E8]/80 ${
                          isSelf ? 'bg-[#F6D66D]/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold tabular-nums whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-xl border-2 border-[#252020] text-xs ${
                              entry.rank === 1
                                ? 'bg-[#F6D66D] text-[#252020]'
                                : entry.rank <= 5
                                  ? 'bg-[#F7A98A]/60 text-[#252020]'
                                  : 'bg-white text-[#5A4F4F]'
                            }`}
                          >
                            #{entry.rank}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar src={entry.avatar_url} name={entry.student_name} size="sm" />
                            <div>
                              <div className="font-display font-bold text-[#252020]">
                                {entry.student_name}
                                {isSelf && <span className="ml-1.5 text-xs text-[#C83D42]">(You)</span>}
                              </div>
                              <div className="text-xs text-[#6B5E5E]">
                                {[entry.grade_level, entry.school_name, entry.city].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-medium text-[#252020] truncate">
                            {entry.latest_pitch_title || entry.assignments[0]?.title || 'Course Assignment'}
                          </div>
                          {entry.latest_track && (
                            <div className="text-[11px] font-mono uppercase tracking-wider text-[#6B5E5E] mt-0.5">
                              {entry.latest_track.replace(/-/g, ' ')}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                          {entry.assignments_count}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-[#C83D42]">
                          {entry.score}/100
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {entry.is_winner ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#9C252A]">
                              <Trophy className="w-3.5 h-3.5 text-[#C83D42]" />
                              Winner · 1:1 Unlocked
                            </span>
                          ) : entry.is_top_5 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Top 5 · 1:1 Unlocked
                            </span>
                          ) : (
                            <span className="text-xs text-[#6B5E5E]">Compete for Top 5</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudent(entry);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#F6D66D]"
                          >
                            <span>View Work</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Student Assignment & Portfolio Inspector Modal */}
      {selectedStudent && (
        <div
          className="fixed inset-0 z-50 bg-[#252020]/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedStudent(null)}
        >
          <div
            className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#252020]/15 pb-4">
              <div className="flex items-center gap-3.5">
                <Avatar src={selectedStudent.avatar_url} name={selectedStudent.student_name} size="lg" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold">{selectedStudent.student_name}</h2>
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#F6D66D] border border-[#252020] font-mono text-xs font-bold tabular-nums">
                      Rank #{selectedStudent.rank} · {selectedStudent.score} pts
                    </span>
                  </div>
                  <div className="text-xs text-[#6B5E5E] mt-1">
                    {[selectedStudent.grade_level, selectedStudent.school_name, selectedStudent.city].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="p-2 rounded-xl border-2 border-[#252020]/20 hover:border-[#252020]"
                aria-label="Close student work modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedStudent.latest_pitch_title && (
              <div className="p-4 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]/20 space-y-1">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#C83D42]">
                  Competition Entry
                </div>
                <div className="font-display font-bold text-base">{selectedStudent.latest_pitch_title}</div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-base">
                  Completed Presentations &amp; Video Assignments ({selectedStudent.assignments.length})
                </h3>
              </div>

              {selectedStudent.assignments.length === 0 ? (
                <p className="text-sm text-[#5A4F4F]">No assignment files linked yet.</p>
              ) : (
                <div className="space-y-3">
                  {selectedStudent.assignments.map((a: CourseAssignment) => (
                    <div
                      key={a.id}
                      className="p-4 rounded-2xl border-2 border-[#252020] bg-white space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-[#F6D66D]/60 border border-[#252020] flex items-center justify-center shrink-0">
                            {a.submission_type === 'video' ? (
                              <Video className="w-4 h-4 text-[#C83D42]" />
                            ) : (
                              <FileText className="w-4 h-4 text-[#252020]" />
                            )}
                          </span>
                          <div>
                            <div className="font-display font-bold text-sm">{a.title}</div>
                            <div className="text-xs text-[#6B5E5E]">
                              {a.course_title} · {a.submission_type === 'video' ? 'Video' : 'Presentation'} · Submitted {formatPKTDateOnly(a.created_at)}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#C83D42] tabular-nums shrink-0">
                          {a.score}/100
                        </span>
                      </div>

                      <p className="text-xs text-[#4D4242] leading-relaxed">{a.summary}</p>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => openAssignmentUrl(a.asset_url)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                        >
                          <span>
                            Open {a.submission_type === 'video' ? 'Video Submission' : 'Presentation Deck'}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#252020]/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#5A4F4F]">
                <Award className="w-4 h-4 text-[#C83D42]" />
                <span>{selectedStudent.courses_completed} courses completed</span>
              </div>
              <Link
                to={`/u/${selectedStudent.student_id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#252020] bg-[#FFF5E8] text-xs font-bold hover:bg-[#F6D66D]"
              >
                <span>Open Career Passport →</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
