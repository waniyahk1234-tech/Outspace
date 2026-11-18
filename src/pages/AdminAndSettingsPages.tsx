import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Check, X, Upload, LogOut, ShieldCheck, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, BrandLogo, EmptyStateArt, OrbitDoodle, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatPKT, type Niche } from '../shared/types';

interface PendingMentor {
  id: string;
  full_name: string;
  email: string;
  city: string | null;
  bio: string | null;
  profession: string;
  company: string | null;
  years_experience: number | null;
  linkedin_url: string;
  niches: string[];
  created_at: string;
}

interface ReportItem {
  id: string;
  reporter_name: string;
  reported_name: string;
  reported_role: string;
  reason: string;
  created_at: string;
}

export function AdminPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingMentor[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<{ pending_mentors: PendingMentor[]; reports: ReportItem[] }>('/api/admin/overview')
      .then((d) => {
        setPending(d.pending_mentors);
        setReports(d.reports);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/api/admin/mentors/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      toast.success(status === 'approved' ? 'Mentor approved and now visible in Explore!' : 'Mentor rejected.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <AppShell title="Admin">
        <EmptyStateArt title="Admin access required" subtitle="Only Outspace moderators can open this review queue." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin Review">
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <Starburst size={24} color="#F6D66D" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              Admin <span className="italic text-[#C83D42]">Moderation</span> &amp; Verification
            </h1>
            <p className="text-sm text-[#5A4F4F]">Verify LinkedIn profiles before mentors appear in student search.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-sm text-[#6B5E5E]">Loading admin queue...</div>
        ) : (
          <>
            {/* Pending Mentors */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 font-display text-xl font-bold">
                <ShieldCheck className="w-5 h-5 text-[#C83D42]" />
                <span>Pending Mentors ({pending.length})</span>
              </div>
              {pending.length === 0 ? (
                <EmptyStateArt
                  title="Queue is clear"
                  subtitle="No pending mentor applications right now. New mentor signups will appear here for verification."
                />
              ) : (
                <div className="space-y-3">
                  {pending.map((m) => (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="font-display text-lg font-bold">{m.full_name}</div>
                        <div className="text-sm text-[#4D4242]">
                          {m.profession}
                          {m.company ? ` @ ${m.company}` : ''} · {m.years_experience || 1} yrs · {m.city || 'Pakistan'}
                        </div>
                        <div className="text-xs text-[#6B5E5E]">
                          Email: {m.email} · Niches: {m.niches.join(', ')}
                        </div>
                        {m.bio && <p className="text-sm text-[#5A4F4F] pt-1">{m.bio}</p>}
                        {m.linkedin_url && (
                          <a
                            href={m.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C83D42] hover:underline pt-1"
                          >
                            <span>Inspect LinkedIn Profile</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => decide(m.id, 'approved')}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => decide(m.id, 'rejected')}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
                        >
                          <X className="w-4 h-4" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Safety Reports */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 font-display text-xl font-bold">
                <Flag className="w-5 h-5 text-[#C83D42]" />
                <span>Safety Reports ({reports.length})</span>
              </div>
              {reports.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 text-sm text-[#5A4F4F]">
                  No reports submitted.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F6D66D]/45 border-b-2 border-[#252020] text-xs font-bold text-[#252020]">
                      <tr>
                        <th className="py-3 px-4">Reporter</th>
                        <th className="py-3 px-4">Reported User</th>
                        <th className="py-3 px-4">Reason</th>
                        <th className="py-3 px-4">Time (PKT)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252020]/10">
                      {reports.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 px-4 font-bold">{r.reporter_name}</td>
                          <td className="py-3 px-4">
                            {r.reported_name} <span className="text-xs text-[#6B5E5E]">({r.reported_role})</span>
                          </td>
                          <td className="py-3 px-4 text-[#4D4242]">{r.reason}</td>
                          <td className="py-3 px-4 font-mono text-xs text-[#6B5E5E]">{formatPKT(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [niches, setNiches] = useState<Niche[]>([]);

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [city, setCity] = useState(user?.city || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gradeLevel, setGradeLevel] = useState(user?.grade_level || 'A-Level');
  const [schoolName, setSchoolName] = useState(user?.school_name || '');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);

  const [profession, setProfession] = useState(user?.mentor_details?.profession || '');
  const [company, setCompany] = useState(user?.mentor_details?.company || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user?.mentor_details?.linkedin_url || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name || '');
    setCity(user.city || '');
    setBio(user.bio || '');
    setGradeLevel(user.grade_level || 'A-Level');
    setSchoolName(user.school_name || '');
    setInterests(user.interests || []);
    if (user.mentor_details) {
      setProfession(user.mentor_details.profession || '');
      setCompany(user.mentor_details.company || '');
      setLinkedinUrl(user.mentor_details.linkedin_url || '');
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      await apiFetch('/api/settings/avatar', { method: 'POST', body: form });
      await refreshUser();
      toast.success('Avatar updated!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/settings/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: fullName,
          city,
          bio,
          grade_level: gradeLevel,
          school_name: schoolName,
          interests,
          profession,
          company,
          linkedin_url: linkedinUrl,
        }),
      });
      await refreshUser();
      toast.success('Profile updated!');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleNiche = (slug: string) => {
    setInterests((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  return (
    <AppShell title="Settings">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Starburst size={22} color="#F6D66D" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              Profile <span className="italic text-[#C83D42]">Settings</span>
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold text-[#C83D42] hover:bg-[#FFF5E8]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex items-center gap-5">
          <Avatar src={user?.avatar_url} name={user?.full_name || 'User'} size="xl" />
          <div className="space-y-2">
            <div className="font-display font-bold">Profile Photo</div>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-[#252020] bg-[#F6D66D] text-xs font-bold cursor-pointer hover:-translate-y-0.5 transition-transform">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Avatar</span>
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
          </div>
        </div>

        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
            </div>
          </div>

          {user?.role === 'student' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1">Grade Level</label>
                <select
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm bg-white focus:outline-none focus:border-[#252020]"
                >
                  <option value="Matric">Matric</option>
                  <option value="O-Level">O-Level</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="A-Level">A-Level</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">School Name</label>
                <input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
            </div>
          )}

          {user?.role === 'mentor' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">Profession</label>
                  <input
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Company</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">LinkedIn URL</label>
                <input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-2">Career Niches</label>
            <div className="flex flex-wrap gap-2">
              {niches.map((n) => {
                const active = interests.includes(n.slug);
                return (
                  <button
                    key={n.slug}
                    type="button"
                    onClick={() => toggleNiche(n.slug)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                      active
                        ? 'bg-[#C83D42] text-white border-[#252020]'
                        : 'bg-[#FFF5E8] text-[#252020] border-[#252020]/30 hover:border-[#252020]'
                    }`}
                  >
                    {n.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">Bio</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237] disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#FFF5E8] flex flex-col items-center justify-center p-6 text-center space-y-5 text-[#252020]">
      <BrandLogo />
      <div className="w-20 h-20 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm flex items-center justify-center">
        <OrbitDoodle />
      </div>
      <h1 className="font-display text-4xl font-bold">
        404 — <span className="italic text-[#C83D42]">Lost in orbit</span>
      </h1>
      <p className="text-sm text-[#5A4F4F] max-w-md">
        The career page or profile you are looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        to="/"
        className="px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
      >
        Back to Outspace Home
      </Link>
    </div>
  );
}
