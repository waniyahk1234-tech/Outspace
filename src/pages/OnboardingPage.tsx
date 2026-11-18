import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiFetch, useAuth } from '../lib/api';
import { BrandLogo, SparkDoodle, Starburst } from '../components/BrandMark';
import type { Niche } from '../shared/types';

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [niches, setNiches] = useState<Niche[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Student fields
  const [gradeLevel, setGradeLevel] = useState('A-Level');
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('Karachi');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [bio, setBio] = useState('');

  // Mentor fields
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [yearsExp, setYearsExp] = useState('3');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  useEffect(() => {
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches))
      .catch(() => {});
  }, []);

  if (!user) return null;

  const toggleNiche = (slug: string) => {
    setSelectedNiches((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNiches.length === 0) {
      toast.error('Please pick at least one career area.');
      return;
    }
    setSubmitting(true);
    try {
      const payload =
        user.role === 'student'
          ? {
              grade_level: gradeLevel,
              school_name: schoolName,
              city,
              interests: selectedNiches,
              bio,
            }
          : {
              profession,
              company,
              years_experience: Number(yearsExp) || 1,
              linkedin_url: linkedinUrl,
              niches: selectedNiches,
              city,
              bio,
            };

      const res = await apiFetch<{ ok: boolean; next: string }>('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshUser();
      toast.success(
        user.role === 'student'
          ? 'Profile saved! Now take your 12-question Career Fit Quiz.'
          : 'Profile submitted for admin review!'
      );
      navigate(res.next || '/dashboard');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const filledSteps =
    (user.role === 'student'
      ? Number(Boolean(schoolName.trim())) + Number(Boolean(city.trim()))
      : Number(Boolean(profession.trim())) + Number(Boolean(linkedinUrl.trim()))) +
    Number(selectedNiches.length > 0);
  const progressPct = Math.min(100, Math.round(((filledSteps + 1) / 4) * 100));

  return (
    <div className="min-h-screen bg-[#FFF5E8] py-10 px-4 text-[#252020]">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <SparkDoodle />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#5A4F4F]">
              Step 1 of 2
            </span>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8 space-y-6"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <Starburst size={24} color="#F6D66D" className="mt-1" />
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                  {user.role === 'student' ? (
                    <>
                      Tell us about your <span className="italic text-[#C83D42]">school journey</span>
                    </>
                  ) : (
                    <>
                      Set up your <span className="italic text-[#C83D42]">Mentor Profile</span>
                    </>
                  )}
                </h1>
                <p className="mt-1 text-sm text-[#5A4F4F]">
                  {user.role === 'student'
                    ? 'We use this to personalize career suggestions and match you with mentors in Pakistan.'
                    : 'Admins verify every mentor’s LinkedIn profile before your profile appears in Explore.'}
                </p>
              </div>
            </div>

            <div className="h-2.5 rounded-full bg-[#FFF5E8] border-2 border-[#252020] overflow-hidden">
              <div
                className="h-full bg-[#F6D66D] border-r-2 border-[#252020] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {user.role === 'student' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5">Grade / Education Track</label>
                  <select
                    value={gradeLevel}
                    onChange={(e) => setGradeLevel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-[#FFF5E8]/50 text-sm font-medium focus:outline-none focus:border-[#252020]"
                  >
                    <option value="Matric">Matric</option>
                    <option value="O-Level">O-Level</option>
                    <option value="Intermediate">Intermediate (FSc / FA / ICS)</option>
                    <option value="A-Level">A-Level</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5">City</label>
                  <input
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Karachi, Lahore, Islamabad"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">School or College Name</label>
                <input
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Nixor College, Beaconhouse, GCU"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5">Current Role / Profession *</label>
                  <input
                    required
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5">Company / Hospital / Firm</label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Systems Limited, AKUH"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5">Years of Experience *</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={yearsExp}
                    onChange={(e) => setYearsExp(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5">City *</label>
                  <input
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Karachi"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">LinkedIn Profile URL *</label>
                <input
                  required
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/your-profile"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-bold mb-2">
              {user.role === 'student' ? 'Careers you want to explore *' : 'Niches you can mentor *'}
            </label>
            <div className="flex flex-wrap gap-2">
              {niches.map((n) => {
                const active = selectedNiches.includes(n.slug);
                return (
                  <button
                    key={n.slug}
                    type="button"
                    onClick={() => toggleNiche(n.slug)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                      active
                        ? 'bg-[#C83D42] text-white border-[#252020] editorial-shadow-sm'
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
            <label className="block text-sm font-bold mb-1.5">
              {user.role === 'student' ? 'Short bio (optional)' : 'Short bio & how you can help students *'}
            </label>
            <textarea
              required={user.role === 'mentor'}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={
                user.role === 'student'
                  ? 'What are you curious about right now?'
                  : 'Share your degree path and what questions students can ask you...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white font-display font-bold text-sm hover:bg-[#B23237] disabled:opacity-60 transition-all hover:-translate-y-0.5"
          >
            {submitting
              ? 'Saving...'
              : user.role === 'student'
                ? 'Save & Take Career Fit Quiz →'
                : 'Submit for Review →'}
          </button>
        </form>
      </div>
    </div>
  );
}
