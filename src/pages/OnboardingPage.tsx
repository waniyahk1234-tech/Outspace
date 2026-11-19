import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Plus, X, KeyRound, Clock } from 'lucide-react';
import { apiFetch, useAuth } from '../lib/api';
import { BrandLogo, SparkDoodle, Starburst } from '../components/BrandMark';
import type { Niche } from '../shared/types';

const SUGGESTED_WEEKLY_SLOTS = [
  'Monday 7:00 PM PKT',
  'Tuesday 7:00 PM PKT',
  'Wednesday 8:00 PM PKT',
  'Thursday 7:00 PM PKT',
  'Friday 6:00 PM PKT',
  'Saturday 4:00 PM PKT',
  'Sunday 5:00 PM PKT',
];

const QUICK_TOPIC_PRESETS = [
  'University Admissions (NUST/FAST/LUMS/AKU)',
  'Portfolio & First Projects',
  'Startup Idea Validation',
  'Resume & Internship Prep',
  'Industry Career Transitions',
];

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
  const [profession, setProfession] = useState(user?.mentor_details?.profession || user?.professional_profile?.current_role || '');
  const [company, setCompany] = useState(user?.mentor_details?.company || user?.professional_profile?.organization || '');
  const [yearsExp, setYearsExp] = useState(
    user?.mentor_details?.years_experience ? String(user.mentor_details.years_experience) : '3'
  );
  const [linkedinUrl, setLinkedinUrl] = useState(
    user?.mentor_details?.linkedin_url || user?.professional_profile?.linkedin_profile_url || ''
  );
  const [headline, setHeadline] = useState(user?.professional_profile?.headline || '');
  const [industry, setIndustry] = useState(user?.professional_profile?.industry || '');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState('');
  const [preferredSlots, setPreferredSlots] = useState<string[]>(['Wednesday 8:00 PM PKT', 'Saturday 4:00 PM PKT']);
  const [autoWelcomeMessage, setAutoWelcomeMessage] = useState('');
  const [vipCode, setVipCode] = useState('');

  useEffect(() => {
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.city) setCity(user.city);
    if (user.mentor_details) {
      if (user.mentor_details.profession) setProfession(user.mentor_details.profession);
      if (user.mentor_details.company) setCompany(user.mentor_details.company);
      if (user.mentor_details.linkedin_url) setLinkedinUrl(user.mentor_details.linkedin_url);
      if (user.mentor_details.years_experience) setYearsExp(String(user.mentor_details.years_experience));
      if (user.mentor_details.topics?.length) setTopics(user.mentor_details.topics);
      if (user.mentor_details.preferred_slots?.length) setPreferredSlots(user.mentor_details.preferred_slots);
      if (user.mentor_details.auto_welcome_message) setAutoWelcomeMessage(user.mentor_details.auto_welcome_message);
    }
    if (user.professional_profile) {
      if (user.professional_profile.headline) setHeadline(user.professional_profile.headline);
      if (user.professional_profile.industry) setIndustry(user.professional_profile.industry);
      if (!profession && user.professional_profile.current_role) {
        setProfession(user.professional_profile.current_role);
      }
      if (!company && user.professional_profile.organization) {
        setCompany(user.professional_profile.organization);
      }
      if (!linkedinUrl && user.professional_profile.linkedin_profile_url) {
        setLinkedinUrl(user.professional_profile.linkedin_profile_url);
      }
    }
  }, [user]);

  if (!user) return null;

  const toggleNiche = (slug: string) => {
    setSelectedNiches((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const toggleSlot = (slot: string) => {
    setPreferredSlots((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]));
  };

  const addTopic = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    setTopics((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setTopicDraft('');
  };

  const removeTopic = (val: string) => {
    setTopics((prev) => prev.filter((t) => t !== val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNiches.length === 0) {
      toast.error('Please pick at least one field of expertise / career interest.');
      return;
    }
    if (user.role === 'mentor') {
      const effectiveTopics = topicDraft.trim() ? [...topics, topicDraft.trim()] : topics;
      if (effectiveTopics.length === 0) {
        toast.error('Add at least one specific topic you can mentor or teach best.');
        return;
      }
      if (preferredSlots.length === 0) {
        toast.error('Select at least one preferred weekly slot timing.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const effectiveTopics =
        user.role === 'mentor'
          ? Array.from(new Set([...topics, ...(topicDraft.trim() ? [topicDraft.trim()] : [])]))
          : [];

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
              headline,
              industry,
              niches: selectedNiches,
              topics: effectiveTopics,
              preferred_slots: preferredSlots,
              auto_welcome_message: autoWelcomeMessage,
              vip_code: vipCode,
              city,
              bio,
            };

      const res = await apiFetch<{
        ok: boolean;
        next: string;
        verification_status?: string;
        vip_partner?: string | null;
      }>('/api/onboarding', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshUser();

      if (user.role === 'student') {
        toast.success('Profile saved! Now take your 12-question Career Fit Quiz.');
      } else if (res.verification_status === 'approved') {
        toast.success(`VIP Partner verified (${res.vip_partner})! Full mentor features unlocked.`);
      } else {
        toast.success('Profile submitted! Verification takes up to 48 hours — browse Top Students meanwhile.');
      }
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
      : Number(Boolean(profession.trim())) +
        Number(Boolean(linkedinUrl.trim())) +
        Number(topics.length > 0) +
        Number(preferredSlots.length > 0)) + Number(selectedNiches.length > 0);
  const progressPct = Math.min(100, Math.round(((filledSteps + 1) / (user.role === 'mentor' ? 6 : 4)) * 100));

  return (
    <div className="min-h-screen bg-[#FFF5E8] py-10 px-4 text-[#252020]">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <SparkDoodle />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#5A4F4F]">
              Onboarding
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
                    : 'Choose your expertise, teaching topics, weekly timings, and optional partner VIP code.'}
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
              {user.professional_profile?.linkedin_verified && (
                <div className="p-3.5 rounded-2xl bg-[#F6D66D]/45 border-2 border-[#252020] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-[#252020]">LinkedIn Account Verified</div>
                      <div className="text-[11px] text-[#4D4242]">
                        {user.professional_profile.linkedin_email || user.email}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-bold mb-1.5">Industry</label>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Software, Healthcare, Venture"
                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">Professional Headline (Optional)</label>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Building fintech products for Pakistan & mentoring teens"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
            </>
          )}

          {/* Fields of Expertise / Interests */}
          <div>
            <label className="block text-sm font-bold mb-2">
              {user.role === 'student'
                ? 'Careers you want to explore *'
                : 'Field(s) of Expertise (select one or multiple) *'}
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

          {user.role === 'mentor' && (
            <>
              {/* Specific Topics */}
              <div className="space-y-2.5">
                <label className="block text-sm font-bold">
                  Particular topics you can teach or mentor best *
                </label>
                <div className="flex gap-2">
                  <input
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTopic(topicDraft);
                      }
                    }}
                    placeholder="Type a topic (e.g. System Design, Startup Fundraising) and press Add"
                    className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                  />
                  <button
                    type="button"
                    onClick={() => addTopic(topicDraft)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border-2 border-[#252020] bg-[#F6D66D] text-xs font-bold hover:bg-[#E6BE42] whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>

                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {topics.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#252020] text-white text-xs font-semibold"
                      >
                        <span>{t}</span>
                        <button type="button" onClick={() => removeTopic(t)} aria-label={`Remove ${t}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TOPIC_PRESETS.filter((p) => !topics.includes(p)).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addTopic(preset)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#FFF5E8] border border-[#252020]/20 hover:border-[#252020]"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekly Slot Timings */}
              <div className="space-y-2">
                <label className="block text-sm font-bold">
                  Preferred Weekly Slot Timings (PKT) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_WEEKLY_SLOTS.map((slot) => {
                    const checked = preferredSlots.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggleSlot(slot)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-colors ${
                          checked
                            ? 'bg-[#F6D66D]/60 border-[#252020] text-[#252020]'
                            : 'bg-white border-[#252020]/20 text-[#5A4F4F] hover:border-[#252020]'
                        }`}
                      >
                        <span>{slot}</span>
                        <span className="font-mono">{checked ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Bio */}
          <div>
            <label className="block text-sm font-bold mb-1.5">
              {user.role === 'student' ? 'Short bio (optional)' : 'Bio & how you can help students (min 20 chars) *'}
            </label>
            <textarea
              required={user.role === 'mentor'}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={
                user.role === 'student'
                  ? 'What are you curious about right now?'
                  : 'Share your degree path, career highlights, and the questions high-schoolers should ask you...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
            />
          </div>

          {user.role === 'mentor' && (
            <>
              {/* Auto Welcome Message */}
              <div>
                <label className="block text-sm font-bold mb-1.5">
                  Auto Welcome Message <span className="text-[#6B5E5E] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={autoWelcomeMessage}
                  onChange={(e) => setAutoWelcomeMessage(e.target.value)}
                  placeholder="Sent automatically when you accept a student's structured request (e.g., Assalam-o-Alaikum! Happy to guide you — tell me which university or skill track you are targeting.)"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>

              {/* VIP Invite Code */}
              <div className="p-4 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020]/25 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <KeyRound className="w-4 h-4 text-[#C83D42]" />
                  <span>VIP Partner Code (Optional)</span>
                </div>
                <p className="text-xs text-[#4D4242] leading-relaxed">
                  Exclusive to invited mentors from <strong>NIC</strong>, <strong>Plan9</strong>, <strong>Nest I/O</strong>, <strong>ORIC</strong>, or our <strong>Silicon Valley partner network</strong>. Entering a valid VIP code grants instant Verified status. Mentors joining by recommendation without a VIP code enter a <strong>48-hour verification window</strong>.
                </p>
                <input
                  value={vipCode}
                  onChange={(e) => setVipCode(e.target.value.toUpperCase())}
                  placeholder="e.g. NIC-VIP-2026 (leave blank if you don't have one)"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 bg-white font-mono text-xs uppercase tracking-wider focus:outline-none focus:border-[#252020]"
                />
                {!vipCode.trim() && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#5A4F4F]">
                    <Clock className="w-3.5 h-3.5 text-[#C83D42]" />
                    <span>Without a VIP code, our team verifies your profile within 48 hours. You can browse Top Students meanwhile.</span>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-4 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white font-display font-bold text-sm hover:bg-[#B23237] disabled:opacity-60 transition-all hover:-translate-y-0.5"
          >
            {submitting
              ? 'Saving...'
              : user.role === 'student'
                ? 'Save & Take Career Fit Quiz →'
                : vipCode.trim()
                  ? 'Verify VIP Code & Activate Mentor Profile →'
                  : 'Submit for 48-Hour Verification →'}
          </button>
        </form>
      </div>
    </div>
  );
}
