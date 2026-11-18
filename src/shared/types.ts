import { formatInTimeZone } from 'date-fns-tz';

export const PKT_TIMEZONE = 'Asia/Karachi';

export type UserRole = 'student' | 'mentor' | 'admin';
export type MentorStatus = 'pending' | 'approved' | 'rejected';
export type ConnectionStatus = 'pending' | 'accepted' | 'declined';
export type MeetingStatus = 'booked' | 'completed' | 'cancelled';
export type PlanType = 'trial' | 'monthly' | 'yearly' | 'institution' | 'expired';

export interface Profile {
  id: string;
  email?: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  grade_level: string | null;
  school_name: string | null;
  interests: string[];
  guardian_consent: boolean;
  onboarding_complete: boolean;
  created_at: string;
}

export interface MentorDetails {
  profile_id: string;
  profession: string;
  company: string | null;
  years_experience: number | null;
  linkedin_url: string;
  niches: string[];
  status: MentorStatus;
  avg_reply_hours: number | null;
  rating: number | null;
  sessions_completed: number;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: PlanType;
  effective_plan: PlanType;
  trial_ends_at: string | null;
  current_period_end: string | null;
  institution_id: string | null;
  institution_name?: string | null;
  free_sessions_left: number;
  days_left: number;
  is_active: boolean;
}

export interface Niche {
  id: string;
  slug: string;
  name: string;
  description: string;
  day_in_life: string;
  salary_range_pkr: string;
  degrees: string[];
  universities: string[];
  riasec_codes: string[];
  icon: string;
}

export interface Badge {
  id: string;
  student_id: string;
  type: string;
  label: string;
  awarded_at: string;
}

export interface Certificate {
  id: string;
  student_id: string;
  mentor_id: string;
  meeting_id: string | null;
  title: string;
  verify_code: string;
  issued_at: string;
  student_name?: string;
  mentor_name?: string;
  mentor_profession?: string;
  mentor_company?: string;
}

export function formatPKT(isoDate: string | Date, fmt = 'MMM d, yyyy · h:mm a') {
  try {
    return `${formatInTimeZone(new Date(isoDate), PKT_TIMEZONE, fmt)} PKT`;
  } catch {
    return String(isoDate);
  }
}

export function formatPKTDateOnly(isoDate: string | Date) {
  try {
    return formatInTimeZone(new Date(isoDate), PKT_TIMEZONE, 'MMM d, yyyy');
  } catch {
    return String(isoDate);
  }
}

export function formatReplyTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return 'New mentor';
  if (hours < 1) return 'Usually replies in under 1 hr';
  const rounded = Math.round(hours);
  return `Usually replies in ${rounded} hr${rounded === 1 ? '' : 's'}`;
}

export const RIASEC_LABELS: Record<string, { name: string; summary: string }> = {
  R: { name: 'Realistic (Doer)', summary: 'You enjoy hands-on building, engineering, tools, and practical systems.' },
  I: { name: 'Investigative (Thinker)', summary: 'You enjoy analyzing problems, research, logic, science, and deep inquiry.' },
  A: { name: 'Artistic (Creator)', summary: 'You thrive on visual design, storytelling, originality, and creative expression.' },
  S: { name: 'Social (Helper)', summary: 'You care about mentoring, healthcare, teaching, psychology, and helping people.' },
  E: { name: 'Enterprising (Leader)', summary: 'You enjoy persuading, leading teams, building ventures, and advocacy.' },
  C: { name: 'Conventional (Organizer)', summary: 'You excel with structured data, finance, systems, accuracy, and planning.' },
};

export const BADGE_META: Record<string, { description: string; accent: string }> = {
  explorer: { description: 'Completed the 12-question Career Fit Quiz', accent: 'bg-[#F6D66D]/40 text-[#252020] border-[#E6BE42]' },
  first_session: { description: 'Completed your first 1:1 mentor session', accent: 'bg-[#F7A98A]/35 text-[#252020] border-[#E58A65]' },
  three_sessions: { description: 'Completed 3 mentorship sessions', accent: 'bg-[#C83D42]/15 text-[#9C252A] border-[#C83D42]/40' },
  seminar_5: { description: 'Attended 5 group seminars', accent: 'bg-[#F6D66D]/50 text-[#252020] border-[#D9B036]' },
  quiz_ace: { description: 'Scored 80% or higher on a mentor quiz', accent: 'bg-[#F6D66D]/40 text-[#252020] border-[#E6BE42]' },
  contributor: { description: 'Shared 5 or more helpful posts in groups', accent: 'bg-[#F7A98A]/35 text-[#252020] border-[#E58A65]' },
};
