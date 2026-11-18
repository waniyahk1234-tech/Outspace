import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, ArrowRight } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Avatar, EmptyStateArt, NicheIcon, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch } from '../lib/api';
import { formatReplyTime, type Niche } from '../shared/types';

interface MentorCard {
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

interface StudentCard {
  id: string;
  full_name: string;
  avatar_url: string | null;
  city: string | null;
  grade_level: string | null;
  school_name: string | null;
  interests: string[];
}

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'mentors' | 'students' | 'careers') || 'mentors';

  const [tab, setTab] = useState<'mentors' | 'students' | 'careers'>(initialTab);
  const [q, setQ] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [mentors, setMentors] = useState<MentorCard[]>([]);
  const [students, setStudents] = useState<StudentCard[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (niche) params.set('niche', niche);
    if (city) params.set('city', city);

    apiFetch<{ mentors: MentorCard[]; students: StudentCard[]; niches: Niche[] }>(
      `/api/explore?${params.toString()}`
    )
      .then((d) => {
        setMentors(d.mentors);
        setStudents(d.students);
        setNiches(d.niches);
      })
      .finally(() => setLoading(false));
  }, [q, niche, city]);

  const changeTab = (next: 'mentors' | 'students' | 'careers') => {
    setTab(next);
    setSearchParams({ tab: next });
  };

  const nichePalette = [
    'bg-[#C83D42] text-white',
    'bg-[#F6D66D] text-[#252020]',
    'bg-[#F7A98A] text-[#252020]',
    'bg-[#252020] text-white',
    'bg-white text-[#252020]',
  ];

  return (
    <AppShell title="Explore">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Starburst size={24} color="#F6D66D" />
            <div>
              <h1 className="font-display text-3xl font-bold">
                Explore <span className="italic text-[#C83D42]">Outspace</span>
              </h1>
              <p className="text-sm text-[#5A4F4F]">
                Find verified mentors sorted by reply speed, meet peers, or browse 10 Pakistani careers.
              </p>
            </div>
          </div>

          {/* Segmented Tabs with sliding active highlight */}
          <div className="inline-flex p-1 rounded-2xl bg-white border-2 border-[#252020] editorial-shadow-sm self-start">
            {(['mentors', 'students', 'careers'] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeTab(t)}
                  className={`relative px-4 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors whitespace-nowrap ${
                    active ? 'text-white' : 'text-[#4D4242] hover:text-[#252020]'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="explore-tab-slide"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-[#C83D42] rounded-xl"
                    />
                  )}
                  <span className="relative z-10">{t}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-[#6B5E5E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, profession, company, or school..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F6D66D]"
            />
          </div>
          <div className="sm:col-span-3">
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none"
            >
              <option value="">All career niches</option>
              {niches.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-sm focus:outline-none"
            >
              <option value="">All cities</option>
              <option value="Karachi">Karachi</option>
              <option value="Lahore">Lahore</option>
              <option value="Islamabad">Islamabad</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white border-2 border-[#252020]/15 animate-pulse" />
            ))}
          </div>
        ) : tab === 'mentors' ? (
          mentors.length === 0 ? (
            <EmptyStateArt
              title="No verified mentors match these filters"
              subtitle="Try clearing your city or career filter to see all approved Pakistani mentors."
              action={
                <button
                  onClick={() => {
                    setQ('');
                    setNiche('');
                    setCity('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Reset filters
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mentors.map((m) => (
                <Link
                  key={m.id}
                  to={`/u/${m.id}`}
                  className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <Avatar src={m.avatar_url} name={m.full_name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-display font-bold text-base truncate">{m.full_name}</h3>
                        <VerifiedIcon />
                      </div>
                      <p className="text-sm font-medium text-[#4D4242] truncate">
                        {m.profession}
                        {m.company ? ` @ ${m.company}` : ''}
                      </p>
                      <div className="mt-1.5 text-xs text-[#6B5E5E]">
                        {m.city || 'Pakistan'} · {m.niches.map((s) => s.replace(/-/g, ' ')).join(', ')}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#252020]/10 flex items-center justify-between text-xs text-[#5A4F4F] tabular-nums">
                    <span className="font-semibold">{formatReplyTime(m.avg_reply_hours)}</span>
                    <span className="font-bold text-[#252020]">
                      {m.rating ? `${m.rating} ★` : 'New'} · {m.sessions_completed} sessions
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : tab === 'students' ? (
          students.length === 0 ? (
            <EmptyStateArt
              title="No students found"
              subtitle="Try adjusting your search query or city filter."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {students.map((s) => (
                <Link
                  key={s.id}
                  to={`/u/${s.id}`}
                  className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar src={s.avatar_url} name={s.full_name} size="md" />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-base truncate">{s.full_name}</div>
                      <div className="text-xs text-[#5A4F4F] truncate">
                        {[s.grade_level, s.school_name, s.city].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-xs text-[#C83D42] font-semibold mt-1 truncate">
                        Exploring: {s.interests.map((i) => i.replace(/-/g, ' ')).join(', ') || 'Undecided'}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#252020] shrink-0" />
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {niches.map((n, idx) => (
              <Link
                key={n.slug}
                to={`/careers/${n.slug}`}
                className={`rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform flex items-start gap-4 ${nichePalette[idx % nichePalette.length]}`}
              >
                <div className="w-11 h-11 rounded-xl bg-white/25 border border-current/25 flex items-center justify-center shrink-0">
                  <NicheIcon name={n.icon} className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display font-bold text-lg">{n.name}</h3>
                    <span className="text-xs font-mono opacity-85 shrink-0">{n.salary_range_pkr}</span>
                  </div>
                  <p className="text-sm opacity-90 mt-1 line-clamp-2">{n.description}</p>
                  <div className="mt-2 text-xs opacity-80">
                    Universities: {n.universities.slice(0, 3).join(', ')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
