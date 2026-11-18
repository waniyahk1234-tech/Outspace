import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Building2, Banknote, Users, BookOpen, ArrowRight } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Avatar, EmptyStateArt, NicheIcon, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch } from '../lib/api';
import { formatReplyTime, type Niche } from '../shared/types';

interface CareerDetailPayload {
  niche: Niche;
  mentors: Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    profession: string;
    company: string | null;
    city: string | null;
    avg_reply_hours: number | null;
    rating: number | null;
  }>;
  groups: Array<{ id: string; name: string; description: string; members_count: number; mentor_name: string }>;
  quizzes: Array<{ id: string; title: string; description: string; author_name: string }>;
}

export default function CareerDetailPage() {
  const { slug } = useParams();
  const [data, setData] = useState<CareerDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    apiFetch<CareerDetailPayload>(`/api/niches/${slug}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <AppShell title={data?.niche.name || 'Career Guide'}>
      {loading ? (
        <div className="py-12 text-center text-sm font-medium text-[#6B5E5E]">Loading career guide...</div>
      ) : !data ? (
        <EmptyStateArt
          title="Career guide not found"
          subtitle="That career track doesn't exist yet. Explore our 10 curated Pakistani career tracks."
          action={
            <Link
              to="/explore?tab=careers"
              className="inline-flex px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
            >
              Back to careers
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <div>
            <Link
              to="/explore?tab=careers"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42] mb-4"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Careers</span>
            </Link>

            <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm flex items-center justify-center shrink-0">
                  <NicheIcon name={data.niche.icon} className="w-8 h-8 text-[#252020]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C83D42] uppercase tracking-wide mb-1">
                    <Starburst size={14} color="#F6D66D" />
                    <span>Career Reality Guide</span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight">{data.niche.name}</h1>
                  <p className="mt-1.5 text-sm sm:text-base text-[#5A4F4F]">{data.niche.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="p-4 rounded-2xl bg-[#F6D66D]/45 border-2 border-[#252020]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#252020]">
                    <Banknote className="w-4 h-4 text-[#C83D42]" />
                    <span>Typical Salary Range</span>
                  </div>
                  <div className="mt-1.5 font-display font-bold text-base tabular-nums">
                    {data.niche.salary_range_pkr}
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-[#F7A98A]/35 border-2 border-[#252020]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#252020]">
                    <GraduationCap className="w-4 h-4 text-[#C83D42]" />
                    <span>Common Degrees</span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold">{data.niche.degrees.join(', ')}</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#252020]">
                    <Building2 className="w-4 h-4 text-[#C83D42]" />
                    <span>Pakistani Universities</span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold">{data.niche.universities.join(', ')}</div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]/20">
                <h2 className="font-display text-lg font-bold mb-1.5">A Day in the Life</h2>
                <p className="text-sm text-[#3A3232] leading-relaxed">{data.niche.day_in_life}</p>
              </div>
            </div>
          </div>

          {/* Mentors in this niche */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Starburst size={20} color="#F6D66D" />
              <h2 className="font-display text-xl font-bold">
                Verified Mentors in <span className="italic text-[#C83D42]">{data.niche.name}</span>
              </h2>
            </div>
            {data.mentors.length === 0 ? (
              <EmptyStateArt
                title="No mentors listed here yet"
                subtitle="Explore all verified Pakistani mentors or check back soon as new mentors get approved."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.mentors.map((m) => (
                  <Link
                    key={m.id}
                    to={`/u/${m.id}`}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <Avatar src={m.avatar_url} name={m.full_name} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-bold text-sm truncate">{m.full_name}</span>
                          <VerifiedIcon />
                        </div>
                        <div className="text-xs text-[#4D4242] truncate">
                          {m.profession}
                          {m.company ? ` @ ${m.company}` : ''}
                        </div>
                        <div className="text-xs text-[#6B5E5E] mt-1 tabular-nums">{formatReplyTime(m.avg_reply_hours)}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#C83D42] shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Groups & Quizzes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <Users className="w-5 h-5 text-[#C83D42]" />
                <span>Groups in this Niche</span>
              </div>
              {data.groups.length === 0 ? (
                <p className="text-sm text-[#5A4F4F]">No niche groups yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.groups.map((g) => (
                    <Link
                      key={g.id}
                      to={`/groups/${g.id}`}
                      className="block p-4 rounded-xl bg-[#FFF5E8] border-2 border-[#252020]/20 hover:border-[#252020] transition-colors"
                    >
                      <div className="font-display font-bold text-sm">{g.name}</div>
                      <div className="text-xs text-[#5A4F4F] mt-0.5 tabular-nums">
                        Hosted by {g.mentor_name} · {g.members_count} members
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2 font-display text-lg font-bold">
                <BookOpen className="w-5 h-5 text-[#C83D42]" />
                <span>Skill &amp; Reality Check Quizzes</span>
              </div>
              {data.quizzes.length === 0 ? (
                <p className="text-sm text-[#5A4F4F]">No mentor quizzes for this niche yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.quizzes.map((q) => (
                    <Link
                      key={q.id}
                      to={`/quizzes/${q.id}`}
                      className="block p-4 rounded-xl bg-[#F6D66D]/30 border-2 border-[#252020]/20 hover:border-[#252020] transition-colors"
                    >
                      <div className="font-display font-bold text-sm">{q.title}</div>
                      <div className="text-xs text-[#5A4F4F] mt-0.5">By {q.author_name}</div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
