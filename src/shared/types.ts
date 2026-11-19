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

export const ACTIVE_TRACK_SLUGS = ['entrepreneurship', 'psychology', 'social-impact'] as const;

export function isActiveTrackSlug(slug: string): boolean {
  return (ACTIVE_TRACK_SLUGS as readonly string[]).includes(slug);
}

export interface ProfessionalProfile {
  profile_id: string;
  linkedin_sub: string | null;
  linkedin_email: string | null;
  linkedin_verified: boolean;
  linkedin_profile_url: string | null;
  headline: string | null;
  current_role: string | null;
  organization: string | null;
  industry: string | null;
  locale: string | null;
  synced_at: string;
  updated_at: string;
}

export interface MentorDetails {
  profile_id: string;
  profession: string;
  company: string | null;
  years_experience: number | null;
  linkedin_url: string;
  talk_url?: string | null;
  niches: string[];
  topics?: string[];
  preferred_slots?: string[];
  auto_welcome_message?: string | null;
  vip_code?: string | null;
  vip_partner?: string | null;
  verification_submitted_at?: string | null;
  verification_deadline_at?: string | null;
  is_demo?: boolean;
  monthly_connections_used?: number;
  monthly_connections_limit?: number;
  status: MentorStatus;
  avg_reply_hours: number | null;
  rating: number | null;
  sessions_completed: number;
  linkedin_verified?: boolean;
}

export interface CourseAssignment {
  id: string;
  course_id: string;
  course_title?: string;
  niche_slug?: string;
  student_id: string;
  submission_type: 'video' | 'presentation';
  title: string;
  summary: string;
  asset_url: string;
  score: number;
  created_at: string;
}

export interface MentorUpdate {
  id: string;
  mentor_id: string;
  mentor_name?: string;
  mentor_avatar?: string | null;
  mentor_profession?: string;
  mentor_company?: string | null;
  kind: 'update' | 'masterclass' | 'cohort';
  title: string;
  body: string;
  media_url: string | null;
  event_at: string | null;
  created_at: string;
}

export interface GroupQASession {
  id: string;
  mentor_id: string;
  mentor_name?: string;
  mentor_avatar?: string | null;
  mentor_profession?: string | null;
  group_id: string | null;
  group_name?: string | null;
  topic: string;
  meet_url: string;
  start_at: string;
  end_at: string;
  status: string;
  rsvp_count: number;
  has_rsvped: boolean;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  city: string | null;
  grade_level: string | null;
  school_name: string | null;
  score: number;
  courses_completed: number;
  assignments_count: number;
  competition_count: number;
  is_winner: boolean;
  is_top_5: boolean;
  latest_pitch_title?: string | null;
  latest_track?: string | null;
  assignments: CourseAssignment[];
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
  is_active_track?: boolean;
}

export interface CourseModule {
  id: string;
  course_id: string;
  position: number;
  title: string;
  speaker_name: string;
  speaker_role: string;
  duration_seconds: number;
  video_url: string | null;
  summary: string;
  key_takeaways: string[];
}

export interface CourseSummary {
  id: string;
  niche_slug: string;
  niche_name: string | null;
  author_id: string;
  author_name: string | null;
  author_avatar?: string | null;
  title: string;
  subtitle: string;
  description: string;
  duration_label: string;
  is_coming_soon: boolean;
  competition_title: string;
  competition_brief: string;
  meetup_title: string;
  meetup_venue: string;
  meetup_date_label: string;
  module_count: number;
  completed_count: number;
  cohort_count: number;
  has_entered_competition: boolean;
  has_submitted_assignment?: boolean;
}

export interface CompetitionEntry {
  id: string;
  course_id: string;
  student_id: string;
  cycle_month: string;
  pitch_title: string;
  problem_statement: string;
  solution_summary: string;
  pitch_link: string | null;
  in_person_rsvp: boolean;
  status: string;
  rank?: number | null;
  score?: number;
  mentor_feedback: string | null;
  certificate_id: string | null;
  verify_code?: string | null;
  created_at: string;
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
  course_fellow: { description: 'Watched every video module in a track course', accent: 'bg-[#F6D66D]/50 text-[#252020] border-[#E6BE42]' },
  competition_honours: { description: 'Competed in the monthly pitch & networking showcase', accent: 'bg-[#C83D42]/15 text-[#9C252A] border-[#C83D42]/40' },
};
