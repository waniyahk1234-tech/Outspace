import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TEDX_SPEAKER_MENTORS } from './speakersSeed.js';
import { FLAGSHIP_COURSES_SEED } from './coursesSeed.js';

function resolveDbPath(): string {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return path.join(os.tmpdir(), 'outspace.db');
  }
  try {
    fs.accessSync(process.cwd(), fs.constants.W_OK);
    return path.resolve(process.cwd(), 'outspace.db');
  } catch {
    return path.join(os.tmpdir(), 'outspace.db');
  }
}

const DB_PATH = resolveDbPath();

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    initSchema(dbInstance);
    seedIfEmpty(dbInstance);
    ensureFlagshipSpeakersAndCourses(dbInstance);
  }
  return dbInstance;
}

export function uuid(): string {
  return crypto.randomUUID();
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 1,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      provider_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('student', 'mentor', 'admin')),
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT,
      city TEXT,
      grade_level TEXT,
      school_name TEXT,
      interests TEXT NOT NULL DEFAULT '[]',
      guardian_consent INTEGER NOT NULL DEFAULT 0,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mentor_details (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      profession TEXT NOT NULL,
      company TEXT,
      years_experience INTEGER,
      linkedin_url TEXT NOT NULL,
      talk_url TEXT,
      niches TEXT NOT NULL DEFAULT '[]',
      topics TEXT NOT NULL DEFAULT '[]',
      preferred_slots TEXT NOT NULL DEFAULT '[]',
      auto_welcome_message TEXT,
      vip_code TEXT,
      vip_partner TEXT,
      verification_submitted_at TEXT,
      verification_deadline_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      avg_reply_hours REAL,
      rating REAL,
      sessions_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS professional_profiles (
      profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      linkedin_sub TEXT UNIQUE,
      linkedin_email TEXT,
      linkedin_verified INTEGER NOT NULL DEFAULT 0,
      linkedin_profile_url TEXT,
      headline TEXT,
      current_role TEXT,
      organization TEXT,
      industry TEXT,
      locale TEXT,
      raw_oidc_profile TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS niches (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      day_in_life TEXT NOT NULL,
      salary_range_pkr TEXT NOT NULL,
      degrees TEXT NOT NULL DEFAULT '[]',
      universities TEXT NOT NULL DEFAULT '[]',
      riasec_codes TEXT NOT NULL DEFAULT '[]',
      icon TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
      message TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (requester_id, receiver_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      niche_slug TEXT REFERENCES niches(slug) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (group_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS group_posts (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES group_posts(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      is_question INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability (
      id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_booked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      slot_id TEXT REFERENCES availability(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'one_on_one' CHECK (type IN ('one_on_one', 'group_seminar')),
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      topic TEXT,
      meet_url TEXT,
      status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
      mentor_notes TEXT,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      feedback TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      niche_slug TEXT REFERENCES niches(slug) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      is_career_fit INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      score INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      awarded_at TEXT NOT NULL,
      UNIQUE (student_id, type)
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      verify_code TEXT UNIQUE NOT NULL,
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      access_code TEXT UNIQUE NOT NULL,
      seats_total INTEGER NOT NULL,
      seats_used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'monthly', 'yearly', 'institution', 'expired')),
      trial_ends_at TEXT,
      current_period_end TEXT,
      institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
      free_sessions_left INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      reported_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      niche_slug TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_label TEXT NOT NULL,
      is_coming_soon INTEGER NOT NULL DEFAULT 0,
      competition_title TEXT NOT NULL,
      competition_brief TEXT NOT NULL,
      meetup_title TEXT NOT NULL,
      meetup_venue TEXT NOT NULL,
      meetup_date_label TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS course_modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      speaker_name TEXT NOT NULL,
      speaker_role TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      video_url TEXT,
      summary TEXT NOT NULL,
      key_takeaways TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS course_progress (
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (student_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS competition_entries (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      cycle_month TEXT NOT NULL,
      pitch_title TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      solution_summary TEXT NOT NULL,
      pitch_link TEXT,
      in_person_rsvp INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'confirmed',
      rank INTEGER,
      score INTEGER NOT NULL DEFAULT 0,
      mentor_feedback TEXT,
      certificate_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (course_id, student_id, cycle_month)
    );

    CREATE TABLE IF NOT EXISTS course_assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      submission_type TEXT NOT NULL CHECK (submission_type IN ('video', 'presentation')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      asset_url TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 85,
      created_at TEXT NOT NULL,
      UNIQUE (course_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS mentor_follows (
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (mentor_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS mentor_updates (
      id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('update', 'masterclass', 'cohort')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      media_url TEXT,
      event_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_seminar_rsvps (
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (meeting_id, student_id)
    );
  `);

  // Safe migration for pre-existing local SQLite databases
  const authCols = (db.prepare(`PRAGMA table_info(auth_users)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!authCols.includes('email_verified')) {
    db.exec(`ALTER TABLE auth_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;`);
  }
  if (!authCols.includes('auth_provider')) {
    db.exec(`ALTER TABLE auth_users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local';`);
  }
  if (!authCols.includes('provider_id')) {
    db.exec(`ALTER TABLE auth_users ADD COLUMN provider_id TEXT;`);
  }

  const mentorCols = (db.prepare(`PRAGMA table_info(mentor_details)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!mentorCols.includes('talk_url')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN talk_url TEXT;`);
  }
  if (!mentorCols.includes('topics')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN topics TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!mentorCols.includes('preferred_slots')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN preferred_slots TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!mentorCols.includes('auto_welcome_message')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN auto_welcome_message TEXT;`);
  }
  if (!mentorCols.includes('vip_code')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN vip_code TEXT;`);
  }
  if (!mentorCols.includes('vip_partner')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN vip_partner TEXT;`);
  }
  if (!mentorCols.includes('verification_submitted_at')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN verification_submitted_at TEXT;`);
  }
  if (!mentorCols.includes('verification_deadline_at')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN verification_deadline_at TEXT;`);
  }
  if (!mentorCols.includes('is_demo')) {
    db.exec(`ALTER TABLE mentor_details ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;`);
  }

  const compCols = (db.prepare(`PRAGMA table_info(competition_entries)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!compCols.includes('rank')) {
    db.exec(`ALTER TABLE competition_entries ADD COLUMN rank INTEGER;`);
  }
  if (!compCols.includes('score')) {
    db.exec(`ALTER TABLE competition_entries ADD COLUMN score INTEGER NOT NULL DEFAULT 0;`);
  }
}

export function awardBadge(db: Database.Database, studentId: string, type: string, label: string) {
  db.prepare(
    `INSERT OR IGNORE INTO badges (id, student_id, type, label, awarded_at) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), studentId, type, label, new Date().toISOString());
}

export function recalculateMentorReplyHours(db: Database.Database, mentorId: string) {
  const rows = db
    .prepare(
      `SELECT created_at, responded_at FROM connections WHERE receiver_id = ? AND status IN ('accepted', 'declined') AND responded_at IS NOT NULL`
    )
    .all(mentorId) as Array<{ created_at: string; responded_at: string }>;

  if (rows.length === 0) return;

  const totalHours = rows.reduce((sum, r) => {
    const diffMs = Math.max(0, new Date(r.responded_at).getTime() - new Date(r.created_at).getTime());
    return sum + diffMs / (1000 * 60 * 60);
  }, 0);
  const avg = Math.round((totalHours / rows.length) * 10) / 10;

  db.prepare(`UPDATE mentor_details SET avg_reply_hours = ? WHERE profile_id = ?`).run(avg, mentorId);
}

export function recalculateMentorRating(db: Database.Database, mentorId: string) {
  const row = db
    .prepare(`SELECT AVG(rating) as avg_rating FROM meetings WHERE mentor_id = ? AND rating IS NOT NULL`)
    .get(mentorId) as { avg_rating: number | null };

  if (row && row.avg_rating !== null) {
    const rounded = Math.round(row.avg_rating * 10) / 10;
    db.prepare(`UPDATE mentor_details SET rating = ? WHERE profile_id = ?`).run(rounded, mentorId);
  }
}

function seedIfEmpty(db: Database.Database) {
  const nicheCount = (db.prepare(`SELECT COUNT(*) as c FROM niches`).get() as { c: number }).c;
  if (nicheCount > 0) return;

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysFromNow = (d: number, hourPKT: number, min = 0) => {
    // PKT is UTC+5
    const target = new Date(now.getTime() + d * 24 * 3600 * 1000);
    target.setUTCHours(hourPKT - 5, min, 0, 0);
    return target;
  };

  const demoPasswordHash = bcrypt.hashSync('Demo@1234', 10);

  const tx = db.transaction(() => {
    // 1. 10 Niches
    const nichesData = [
      {
        slug: 'software-engineering',
        name: 'Software Engineering',
        description:
          'Build web apps, mobile platforms, fintech systems, and scalable cloud products used across Pakistan and globally.',
        day_in_life:
          'Start with a morning standup with product and QA teammates, review pull requests, debug API endpoints or React components, and collaborate on system architecture before shipping features.',
        salary_range_pkr: 'PKR 120k–550k / month',
        degrees: ['BS Computer Science', 'BS Software Engineering', 'BS Computer Engineering'],
        universities: ['NUST', 'FAST-NUCES', 'LUMS', 'Habib University'],
        riasec_codes: ['I', 'R'],
        icon: 'Code2',
      },
      {
        slug: 'ux-ui-design',
        name: 'UX/UI Design',
        description:
          'Research how everyday Pakistani users navigate apps and craft intuitive, accessible digital experiences.',
        day_in_life:
          'Interview customers in Urdu or English, map user journeys in Figma, test clickable prototypes with real users, and pair closely with frontend engineers to polish interactions.',
        salary_range_pkr: 'PKR 90k–380k / month',
        degrees: ['BS Communication Design', 'BS Interactive Media', 'BS Human-Computer Interaction'],
        universities: ['Indus Valley School of Art and Architecture', 'NCA Lahore', 'Habib University', 'NUST'],
        riasec_codes: ['A', 'I'],
        icon: 'Palette',
      },
      {
        slug: 'medicine',
        name: 'Medicine',
        description:
          'Diagnose, treat, and prevent illness in hospital wards, clinics, and public health initiatives.',
        day_in_life:
          'Join morning ward rounds with senior consultants, review patient lab charts, console anxious families, and balance clinical rotations with ongoing medical research.',
        salary_range_pkr: 'PKR 100k–450k / month',
        degrees: ['MBBS', 'BDS', 'Doctor of Physical Therapy'],
        universities: ['Aga Khan University', 'King Edward Medical University', 'Dow University', 'Shifa Tameer-e-Millat'],
        riasec_codes: ['I', 'S'],
        icon: 'Stethoscope',
      },
      {
        slug: 'law',
        name: 'Law',
        description:
          'Advocate for clients, draft corporate contracts, and shape constitutional and technology policy.',
        day_in_life:
          'Research Supreme Court and High Court precedents, draft legal briefs and commercial agreements, meet clients, and argue motions before judges or regulatory panels.',
        salary_range_pkr: 'PKR 90k–500k / month',
        degrees: ['LLB (5-Year)', 'BA-LLB', 'University of London LLB'],
        universities: ['LUMS', 'SZABIST', 'Quaid-i-Azam University', 'Pakistan College of Law'],
        riasec_codes: ['E', 'S'],
        icon: 'Scale',
      },
      {
        slug: 'psychology',
        name: 'Psychology',
        description:
          'Understand human behavior and support mental health in schools, clinics, and organizational teams.',
        day_in_life:
          'Conduct structured counseling sessions, administer behavioral assessments, design school wellbeing workshops, and analyze qualitative research data.',
        salary_range_pkr: 'PKR 75k–280k / month',
        degrees: ['BS Psychology', 'BS Applied Psychology', 'MS Clinical Psychology'],
        universities: ['FCCU Lahore', 'Bahria University', 'University of Karachi', 'NUST'],
        riasec_codes: ['S', 'I'],
        icon: 'Brain',
      },
      {
        slug: 'architecture',
        name: 'Architecture',
        description:
          'Design climate-resilient homes, civic spaces, and urban neighborhoods tailored to Pakistani cities.',
        day_in_life:
          'Sketch spatial concepts, build 3D BIM models, visit active construction sites to inspect concrete and brickwork, and coordinate with structural engineers.',
        salary_range_pkr: 'PKR 85k–360k / month',
        degrees: ['B.Arch (5-Year)'],
        universities: ['NCA Lahore', 'Indus Valley School of Art and Architecture', 'NED University', 'NUST'],
        riasec_codes: ['A', 'R'],
        icon: 'Compass',
      },
      {
        slug: 'media-journalism',
        name: 'Media & Journalism',
        description:
          'Investigate public-interest stories, produce documentaries, and build credible digital newsrooms.',
        day_in_life:
          'Pitch timely story angles at the editorial desk, interview community voices on location, fact-check data sources, and edit multimedia packages for broadcast or digital.',
        salary_range_pkr: 'PKR 70k–300k / month',
        degrees: ['BS Media Sciences', 'BS Mass Communication', 'BA Comparative Humanities'],
        universities: ['SZABIST', 'Beaconhouse National University', 'Habib University', 'IBA Karachi'],
        riasec_codes: ['A', 'E'],
        icon: 'Mic',
      },
      {
        slug: 'data-science',
        name: 'Data Science',
        description:
          'Turn messy datasets into forecasts, fraud detection models, and actionable business intelligence.',
        day_in_life:
          'Write SQL pipelines, clean millions of transaction rows in Python, train machine learning models, and present clear visual stories to leadership.',
        salary_range_pkr: 'PKR 130k–600k / month',
        degrees: ['BS Data Science', 'BS Artificial Intelligence', 'BS Mathematics & Economics'],
        universities: ['LUMS', 'NUST', 'FAST-NUCES', 'IBA Karachi'],
        riasec_codes: ['I', 'C'],
        icon: 'BarChart3',
      },
      {
        slug: 'entrepreneurship',
        name: 'Entrepreneurship',
        description:
          'Spot overlooked problems in local markets and build sustainable startups from zero to scale.',
        day_in_life:
          'Talk to early customers, test minimum viable products, manage cash flow and unit economics, pitch angel investors, and recruit your founding team.',
        salary_range_pkr: 'PKR 80k–700k+ / month',
        degrees: ['BBA', 'BS Entrepreneurship', 'BS Management Sciences'],
        universities: ['IBA Karachi', 'LUMS', 'KSBL', 'NUST Business School'],
        riasec_codes: ['E', 'C'],
        icon: 'Rocket',
      },
      {
        slug: 'chartered-accountancy',
        name: 'Chartered Accountancy',
        description:
          'Audit financial statements, advise boards on corporate tax, and steward capital across industries.',
        day_in_life:
          'Review balance sheets and IFRS compliance during audit season, model financial projections in Excel, and advise CFOs on mergers and risk controls.',
        salary_range_pkr: 'PKR 110k–650k / month',
        degrees: ['CA (ICAP)', 'ACCA', 'BS Accounting & Finance'],
        universities: ['IBA Karachi', 'LUMS', 'SKANS', 'PAC Lahore'],
        riasec_codes: ['C', 'E'],
        icon: 'Calculator',
      },
    ];

    const insertNiche = db.prepare(
      `INSERT INTO niches (id, slug, name, description, day_in_life, salary_range_pkr, degrees, universities, riasec_codes, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of nichesData) {
      insertNiche.run(
        uuid(),
        n.slug,
        n.name,
        n.description,
        n.day_in_life,
        n.salary_range_pkr,
        JSON.stringify(n.degrees),
        JSON.stringify(n.universities),
        JSON.stringify(n.riasec_codes),
        n.icon
      );
    }

    // 2. Institution
    const instId = uuid();
    db.prepare(`INSERT INTO institutions (id, name, access_code, seats_total, seats_used) VALUES (?, ?, ?, ?, ?)`).run(
      instId,
      'Demo College Karachi',
      'DEMO2026',
      100,
      0
    );

    // 3. Helper to insert user + profile
    const insertUser = db.prepare(`INSERT INTO auth_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`);
    const insertProfile = db.prepare(
      `INSERT INTO profiles (id, role, full_name, avatar_url, bio, city, grade_level, school_name, interests, guardian_consent, onboarding_complete, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMentor = db.prepare(
      `INSERT INTO mentor_details (profile_id, profession, company, years_experience, linkedin_url, niches, status, avg_reply_hours, rating, sessions_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertSub = db.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, trial_ends_at, current_period_end, institution_id, free_sessions_left) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    // Admin
    const adminId = '00000000-0000-4000-8000-000000000001';
    insertUser.run(adminId, 'admin@demo.com', demoPasswordHash, iso(now));
    insertProfile.run(
      adminId,
      'admin',
      'Faisal Qureshi',
      null,
      'Outpase Trust & Mentor Verification Lead.',
      'Karachi',
      null,
      null,
      '[]',
      1,
      1,
      iso(now)
    );

    // 10 Approved Mentors + 1 Pending Mentor
    const mentorsSeed = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        email: 'mentor@demo.com',
        name: 'Ayesha Khan',
        avatar: '/src/assets/images/avatar_mentor_ayesha_1795032882395.jpg',
        city: 'Karachi',
        bio: 'Started with a CS degree from FAST-NUCES, now building scalable backend and AI developer platforms. I love helping O/A-Level students figure out if software engineering actually fits their day-to-day strengths.',
        profession: 'Senior Software Engineer',
        company: 'SadaPay / TechVentures',
        years: 6,
        linkedin: 'https://linkedin.com/in/ayesha-khan-swe',
        niches: ['software-engineering', 'data-science'],
        status: 'approved',
        avg_reply_hours: 1.5,
        rating: 4.9,
        sessions_completed: 24,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        email: 'bilal.ahmed@demo.com',
        name: 'Bilal Ahmed',
        avatar: '/src/assets/images/avatar_mentor_bilal_1795032883290.jpg',
        city: 'Lahore',
        bio: 'LUMS Computer Science grad leading applied machine learning and analytics pipelines. Happy to demystify Data Science vs Software Engineering for Matric & Intermediate students.',
        profession: 'Lead Data Scientist',
        company: 'Bazaar Technologies',
        years: 7,
        linkedin: 'https://linkedin.com/in/bilal-ahmed-ds',
        niches: ['data-science', 'software-engineering'],
        status: 'approved',
        avg_reply_hours: 2.0,
        rating: 4.8,
        sessions_completed: 19,
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        email: 'sara.ali@demo.com',
        name: 'Sara Ali',
        avatar: '/src/assets/images/avatar_mentor_sara_1795032882935.jpg',
        city: 'Karachi',
        bio: 'Indus Valley School alumna crafting accessible fintech and health mobile apps. Ask me how to build a design portfolio right out of A-Levels.',
        profession: 'Staff Product Designer',
        company: 'KTrade Digital',
        years: 5,
        linkedin: 'https://linkedin.com/in/sara-ali-ux',
        niches: ['ux-ui-design', 'entrepreneurship'],
        status: 'approved',
        avg_reply_hours: 3.0,
        rating: 4.9,
        sessions_completed: 16,
      },
      {
        id: '10000000-0000-4000-8000-000000000004',
        email: 'dr.hassan@demo.com',
        name: 'Dr. Hassan Raza',
        avatar: null,
        city: 'Karachi',
        bio: 'AKU graduate and internal medicine resident. Before committing 5+ years to MBBS and MDCAT prep, let us talk honestly about hospital life, residency, and medical research.',
        profession: 'Internal Medicine Resident',
        company: 'Aga Khan University Hospital',
        years: 5,
        linkedin: 'https://linkedin.com/in/dr-hassan-raza',
        niches: ['medicine', 'psychology'],
        status: 'approved',
        avg_reply_hours: 8.5,
        rating: 4.9,
        sessions_completed: 14,
      },
      {
        id: '10000000-0000-4000-8000-000000000005',
        email: 'hira.mansoor@demo.com',
        name: 'Hira Mansoor',
        avatar: null,
        city: 'Islamabad',
        bio: 'Corporate & technology counsel advising Pakistani startups and venture funds. Curious about LUMS BA-LLB vs UoL LLB? Let us chat.',
        profession: 'Corporate & Tech Lawyer',
        company: 'Axis Law Chambers',
        years: 8,
        linkedin: 'https://linkedin.com/in/hira-mansoor-law',
        niches: ['law', 'entrepreneurship'],
        status: 'approved',
        avg_reply_hours: 4.5,
        rating: 4.7,
        sessions_completed: 11,
      },
      {
        id: '10000000-0000-4000-8000-000000000006',
        email: 'amna.saeed@demo.com',
        name: 'Amna Saeed',
        avatar: null,
        city: 'Lahore',
        bio: 'Clinical psychologist working with adolescents and schools across Lahore. I mentor students interested in counseling, neuroscience, and organizational psychology.',
        profession: 'Clinical Psychologist',
        company: 'MindBridge Clinic Lahore',
        years: 6,
        linkedin: 'https://linkedin.com/in/amna-saeed-psych',
        niches: ['psychology', 'medicine'],
        status: 'approved',
        avg_reply_hours: 5.0,
        rating: 4.8,
        sessions_completed: 9,
      },
      {
        id: '10000000-0000-4000-8000-000000000007',
        email: 'usman.khalid@demo.com',
        name: 'Usman Khalid',
        avatar: null,
        city: 'Lahore',
        bio: 'NCA Lahore graduate designing sustainable residential and civic spaces. Happy to review architecture studio portfolios and discuss NCA/NUST entrance tests.',
        profession: 'Principal Architect',
        company: 'Studio Indus Architects',
        years: 9,
        linkedin: 'https://linkedin.com/in/usman-khalid-arch',
        niches: ['architecture', 'ux-ui-design'],
        status: 'approved',
        avg_reply_hours: 12.0,
        rating: 4.6,
        sessions_completed: 7,
      },
      {
        id: '10000000-0000-4000-8000-000000000008',
        email: 'maham.zafar@demo.com',
        name: 'Maham Zafar',
        avatar: null,
        city: 'Islamabad',
        bio: 'Investigative documentary producer and digital editor covering climate, youth culture, and public policy in Pakistan.',
        profession: 'Senior Multimedia Producer',
        company: 'Dawn Digital Studios',
        years: 7,
        linkedin: 'https://linkedin.com/in/maham-zafar-media',
        niches: ['media-journalism', 'ux-ui-design'],
        status: 'approved',
        avg_reply_hours: 6.0,
        rating: 4.8,
        sessions_completed: 10,
      },
      {
        id: '10000000-0000-4000-8000-000000000009',
        email: 'hamza.siddiqui@demo.com',
        name: 'Hamza Siddiqui',
        avatar: null,
        city: 'Karachi',
        bio: 'Co-founder of a logistics SaaS startup backed by regional angels. I love talking to entrepreneurial teens about building real projects before university.',
        profession: 'Startup Founder & CEO',
        company: 'Raasta Logistics',
        years: 6,
        linkedin: 'https://linkedin.com/in/hamza-siddiqui-founder',
        niches: ['entrepreneurship', 'software-engineering'],
        status: 'approved',
        avg_reply_hours: 18.0,
        rating: 4.7,
        sessions_completed: 8,
      },
      {
        id: '10000000-0000-4000-8000-000000000010',
        email: 'omar.farooq@demo.com',
        name: 'Omar Farooq',
        avatar: null,
        city: 'Karachi',
        bio: 'ICAP Chartered Accountant and Corporate Finance Manager. Let us compare CA, ACCA, and BS Accounting & Finance honestly.',
        profession: 'Corporate Finance Manager (ACA)',
        company: 'Engro Corporation',
        years: 8,
        linkedin: 'https://linkedin.com/in/omar-farooq-aca',
        niches: ['chartered-accountancy', 'entrepreneurship'],
        status: 'approved',
        avg_reply_hours: 7.5,
        rating: 4.9,
        sessions_completed: 15,
      },
      // Pending Mentor for Admin Demo
      {
        id: '10000000-0000-4000-8000-000000000011',
        email: 'pending.mentor@demo.com',
        name: 'Zainab Raza',
        avatar: null,
        city: 'Islamabad',
        bio: 'AI & Robotics engineer at NUST Spin-off Labs applying to mentor A-Level students in hardware and machine learning.',
        profession: 'Embedded Systems Engineer',
        company: 'NUST Robotics Lab',
        years: 4,
        linkedin: 'https://linkedin.com/in/zainab-raza-robotics',
        niches: ['software-engineering', 'data-science'],
        status: 'pending',
        avg_reply_hours: null,
        rating: null,
        sessions_completed: 0,
      },
    ];

    for (const m of mentorsSeed) {
      insertUser.run(m.id, m.email, demoPasswordHash, iso(now));
      insertProfile.run(
        m.id,
        'mentor',
        m.name,
        m.avatar,
        m.bio,
        m.city,
        null,
        null,
        JSON.stringify(m.niches),
        1,
        1,
        iso(now)
      );
      insertMentor.run(
        m.id,
        m.profession,
        m.company,
        m.years,
        m.linkedin,
        JSON.stringify(m.niches),
        m.status,
        m.avg_reply_hours,
        m.rating,
        m.sessions_completed
      );

      // Open availability slots over the next 7 days for approved mentors
      if (m.status === 'approved') {
        const insertSlot = db.prepare(
          `INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 0)`
        );
        for (const dayOffset of [1, 2, 4, 6]) {
          const start = daysFromNow(dayOffset, 17, 0); // 5:00 PM PKT
          const end = new Date(start.getTime() + 45 * 60 * 1000);
          insertSlot.run(uuid(), m.id, iso(start), iso(end));
        }
      }
    }

    // 4. 8 Students
    const studentsSeed = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        email: 'student@demo.com',
        name: 'Waniyah Tariq',
        avatar: '/src/assets/images/avatar_student_waniyah_1795032883041.jpg',
        city: 'Karachi',
        grade: 'A-Level',
        school: 'Nixor College',
        bio: 'A-Level student torn between Computer Science and Product Design. Trying to talk to people in the industry before university applications.',
        interests: ['software-engineering', 'ux-ui-design', 'data-science'],
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        email: 'ali.haider@demo.com',
        name: 'Ali Haider',
        avatar: null,
        city: 'Lahore',
        grade: 'Intermediate',
        school: 'Government College University Lahore',
        bio: 'FSc Pre-Medical student exploring whether Medicine or Psychology is right for me.',
        interests: ['medicine', 'psychology'],
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        email: 'fatima.noor@demo.com',
        name: 'Fatima Noor',
        avatar: null,
        city: 'Islamabad',
        grade: 'O-Level',
        school: 'Roots Millennium School',
        bio: 'O-Level student passionate about debate, constitutional law, and documentary filmmaking.',
        interests: ['law', 'media-journalism'],
      },
      {
        id: '20000000-0000-4000-8000-000000000004',
        email: 'zain.ul.abidin@demo.com',
        name: 'Zain ul Abidin',
        avatar: null,
        city: 'Karachi',
        grade: 'Matric',
        school: 'Habib Public School',
        bio: 'Class 10 Matric student curious about Chartered Accountancy and startups.',
        interests: ['chartered-accountancy', 'entrepreneurship'],
      },
      {
        id: '20000000-0000-4000-8000-000000000005',
        email: 'mahnoor.azhar@demo.com',
        name: 'Mahnoor Azhar',
        avatar: null,
        city: 'Lahore',
        grade: 'A-Level',
        school: 'Lahore Grammar School JT',
        bio: 'Building small Figma prototypes and sketching urban spaces.',
        interests: ['architecture', 'ux-ui-design'],
      },
      {
        id: '20000000-0000-4000-8000-000000000006',
        email: 'danish.kamran@demo.com',
        name: 'Danish Kamran',
        avatar: null,
        city: 'Karachi',
        grade: 'O-Level',
        school: 'Karachi Grammar School',
        bio: 'Learning Python and interested in AI and data analytics.',
        interests: ['data-science', 'software-engineering'],
      },
      {
        id: '20000000-0000-4000-8000-000000000007',
        email: 'sana.javed@demo.com',
        name: 'Sana Javed',
        avatar: null,
        city: 'Islamabad',
        grade: 'Intermediate',
        school: 'Fazaia Inter College',
        bio: 'Interested in journalism, digital storytelling, and psychology.',
        interests: ['media-journalism', 'psychology'],
      },
      {
        id: '20000000-0000-4000-8000-000000000008',
        email: 'saad.mehmood@demo.com',
        name: 'Saad Mehmood',
        avatar: null,
        city: 'Lahore',
        grade: 'Matric',
        school: 'Aitchison College',
        bio: 'Exploring fintech startups and software product development.',
        interests: ['entrepreneurship', 'software-engineering'],
      },
    ];

    const trialEnds = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    for (const s of studentsSeed) {
      insertUser.run(s.id, s.email, demoPasswordHash, iso(now));
      insertProfile.run(
        s.id,
        'student',
        s.name,
        s.avatar,
        s.bio,
        s.city,
        s.grade,
        s.school,
        JSON.stringify(s.interests),
        1,
        1,
        iso(now)
      );
      insertSub.run(uuid(), s.id, 'trial', trialEnds, null, null, 1);
    }

    // 5. Initial connections & messages for rich demo state
    const waniyahId = studentsSeed[0].id;
    const bilalId = mentorsSeed[1].id;
    const hamzaId = mentorsSeed[8].id;
    const ayeshaId = mentorsSeed[0].id;
    const saraId = mentorsSeed[2].id;
    const drHassanId = mentorsSeed[3].id;
    const hiraId = mentorsSeed[4].id;

    // Accepted connection between Waniyah and Bilal Ahmed (so Messages works out of the box)
    const connBilalId = uuid();
    db.prepare(
      `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'accepted', ?, ?, ?)`
    ).run(
      connBilalId,
      waniyahId,
      bilalId,
      'Assalam-o-Alaikum Bilal! I am in A-Levels and torn between BS CS and BS Data Science.',
      hoursAgo(10),
      hoursAgo(12)
    );
    db.prepare(`INSERT INTO messages (id, connection_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      uuid(),
      connBilalId,
      bilalId,
      'Wa Alaikum Assalam Waniyah! Happy to chat. Both degrees share core math and programming—feel free to ask anything here.',
      hoursAgo(9)
    );

    // Pending connection > 25 hours old to demonstrate the 24-hour promise fallback suggestions!
    db.prepare(
      `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)`
    ).run(
      uuid(),
      waniyahId,
      hamzaId,
      'Hi Hamza! Would love to ask how you started Raasta Logistics after university.',
      hoursAgo(26)
    );

    // Pending connection for Ayesha Khan (mentor@demo.com) from Danish Kamran, waiting 22 hours (triggers red urgency timer on Mentor Dashboard!)
    db.prepare(
      `INSERT INTO connections (id, requester_id, receiver_id, status, message, responded_at, created_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)`
    ).run(
      uuid(),
      studentsSeed[5].id,
      ayeshaId,
      'Hello Ayesha! I am an O-Level student learning Python and wanted advice on FAST vs NUST.',
      hoursAgo(22)
    );

    // 6. 5 Groups + Posts + Mentor Replies
    const groupsSeed = [
      {
        id: '30000000-0000-4000-8000-000000000001',
        mentor_id: ayeshaId,
        niche_slug: 'software-engineering',
        name: 'Tech Explorers Pakistan',
        description:
          'Ask anything about CS/SE admissions (FAST, NUST, LUMS, Habib), building side projects in Matric/A-Levels, and daily life as a software engineer.',
      },
      {
        id: '30000000-0000-4000-8000-000000000002',
        mentor_id: saraId,
        niche_slug: 'ux-ui-design',
        name: 'Design & Creative Karachi',
        description:
          'Explore UX/UI, Figma, product research, and creative portfolios for Indus Valley, NCA, and digital product teams.',
      },
      {
        id: '30000000-0000-4000-8000-000000000003',
        mentor_id: drHassanId,
        niche_slug: 'medicine',
        name: 'Pre-Med & Healthcare Guide',
        description:
          'Honest conversations about MDCAT, AKU, clinical rotations, and deciding if Medicine truly suits your temperament.',
      },
      {
        id: '30000000-0000-4000-8000-000000000004',
        mentor_id: hiraId,
        niche_slug: 'law',
        name: 'Law & Policy Pakistan',
        description:
          'LAT prep, LUMS BA-LLB vs external LLB, corporate vs litigation tracks, and legal tech.',
      },
      {
        id: '30000000-0000-4000-8000-000000000005',
        mentor_id: bilalId,
        niche_slug: 'data-science',
        name: 'Data & AI Hub',
        description:
          'How math, statistics, and Python come together in real Pakistani data science & ML teams.',
      },
    ];

    const insertGroup = db.prepare(
      `INSERT INTO groups (id, mentor_id, niche_slug, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertMember = db.prepare(
      `INSERT INTO group_members (group_id, student_id, joined_at) VALUES (?, ?, ?)`
    );
    const insertPost = db.prepare(
      `INSERT INTO group_posts (id, group_id, author_id, parent_id, body, is_question, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const g of groupsSeed) {
      insertGroup.run(g.id, g.mentor_id, g.niche_slug, g.name, g.description, hoursAgo(72));
    }

    // Seed group memberships
    insertMember.run(groupsSeed[0].id, waniyahId, hoursAgo(48));
    insertMember.run(groupsSeed[0].id, studentsSeed[5].id, hoursAgo(40));
    insertMember.run(groupsSeed[1].id, studentsSeed[4].id, hoursAgo(30));
    insertMember.run(groupsSeed[2].id, studentsSeed[1].id, hoursAgo(24));
    insertMember.run(groupsSeed[3].id, studentsSeed[2].id, hoursAgo(20));

    // Seed posts & mentor answers
    const q1Id = uuid();
    insertPost.run(
      q1Id,
      groupsSeed[0].id,
      studentsSeed[5].id,
      null,
      'Do I need A-Level Further Maths to get into BS Computer Science at FAST or NUST?',
      1,
      hoursAgo(18)
    );
    insertPost.run(
      uuid(),
      groupsSeed[0].id,
      ayeshaId,
      q1Id,
      'Great question! No, standard A-Level Mathematics (or FSc Pre-Engineering Maths) is enough for FAST, NUST, and LUMS. Focus on problem-solving and building 1–2 small coding projects.',
      0,
      hoursAgo(16)
    );

    const q2Id = uuid();
    insertPost.run(
      q2Id,
      groupsSeed[1].id,
      studentsSeed[4].id,
      null,
      'Is coding mandatory if I want to become a UX/UI Designer?',
      1,
      hoursAgo(14)
    );
    insertPost.run(
      uuid(),
      groupsSeed[1].id,
      saraId,
      q2Id,
      'Not mandatory at all! Understanding basic HTML/CSS helps you collaborate with engineers, but 90% of our day is user research, wireframing, and visual systems in Figma.',
      0,
      hoursAgo(12)
    );

    const q3Id = uuid();
    insertPost.run(
      q3Id,
      groupsSeed[2].id,
      studentsSeed[1].id,
      null,
      'What does a typical week look like for a first-year medical resident in Karachi?',
      1,
      hoursAgo(10)
    );
    insertPost.run(
      uuid(),
      groupsSeed[2].id,
      drHassanId,
      q3Id,
      'Expect 60–70 hours including two 24-hour calls a week. It is deeply rewarding if you love direct patient care, which is why shadowing or talking to doctors early helps so much!',
      0,
      hoursAgo(8)
    );

    // 7. Career Fit Quiz (12 RIASEC questions) + 3 Mentor Quizzes
    const careerQuizId = '40000000-0000-4000-8000-000000000001';
    db.prepare(
      `INSERT INTO quizzes (id, author_id, niche_slug, title, description, is_career_fit) VALUES (?, ?, NULL, ?, ?, 1)`
    ).run(
      careerQuizId,
      adminId,
      'Career Fit Quiz (RIASEC)',
      'Answer 12 quick questions about how you like to learn, solve problems, and work with others to discover matching careers and Pakistani mentors.'
    );

    const riasecQuestions = [
      {
        q: 'On a free Saturday afternoon, which activity sounds most enjoyable?',
        opts: [
          { label: 'Fixing a gadget or assembling something hands-on', riasec: 'R' },
          { label: 'Diving deep into a science, tech, or mystery puzzle', riasec: 'I' },
          { label: 'Sketching, editing a video, or designing a poster', riasec: 'A' },
          { label: 'Volunteering or helping a friend work through a problem', riasec: 'S' },
        ],
      },
      {
        q: 'Your school is organizing a science & culture fair. What role do you volunteer for?',
        opts: [
          { label: 'Managing the budget, schedule, and ticket spreadsheet', riasec: 'C' },
          { label: 'Pitching sponsors and leading the organizing team', riasec: 'E' },
          { label: 'Designing the stage backdrop and event branding', riasec: 'A' },
          { label: 'Setting up the sound, lighting, or robotics demo booth', riasec: 'R' },
        ],
      },
      {
        q: 'Which school subject assignment excites you the most?',
        opts: [
          { label: 'Conducting an experiment or analyzing data trends', riasec: 'I' },
          { label: 'Writing a persuasive speech or debating policy', riasec: 'E' },
          { label: 'Creating a short documentary or illustrated magazine', riasec: 'A' },
          { label: 'Tutoring younger students in a tough topic', riasec: 'S' },
        ],
      },
      {
        q: 'When using a Pakistani delivery or banking app, what do you notice first?',
        opts: [
          { label: 'How clean the layout, typography, and colors feel', riasec: 'A' },
          { label: 'How fast the backend loads and handles edge cases', riasec: 'I' },
          { label: 'Whether the business model makes profit per order', riasec: 'E' },
          { label: 'Whether every receipt, balance, and tax calculation adds up', riasec: 'C' },
        ],
      },
      {
        q: 'What kind of workplace energy sounds best to you?',
        opts: [
          { label: 'A collaborative hospital, clinic, or community center', riasec: 'S' },
          { label: 'A quiet research lab or engineering studio', riasec: 'I' },
          { label: 'A fast-moving startup pitching new ideas', riasec: 'E' },
          { label: 'An architecture workshop with models and blueprints', riasec: 'R' },
        ],
      },
      {
        q: 'Friends usually come to you when they need someone to:',
        opts: [
          { label: 'Listen empathetically and give thoughtful personal advice', riasec: 'S' },
          { label: 'Organize notes, plans, and group deadlines accurately', riasec: 'C' },
          { label: 'Debug a laptop issue or figure out how something works', riasec: 'R' },
          { label: 'Come up with a creative design or story angle', riasec: 'A' },
        ],
      },
      {
        q: 'Which YouTube rabbit hole could you watch for two hours straight?',
        opts: [
          { label: 'How bridges, engines, or sustainable buildings are constructed', riasec: 'R' },
          { label: 'How doctors diagnose rare cases or AI models learn', riasec: 'I' },
          { label: 'How founders grew a small brand into a huge company', riasec: 'E' },
          { label: 'Behind-the-scenes of cinema, journalism, or UI design', riasec: 'A' },
        ],
      },
      {
        q: 'How do you prefer to make decisions?',
        opts: [
          { label: 'By checking hard numbers, spreadsheets, and verified rules', riasec: 'C' },
          { label: 'By researching root causes and testing hypotheses', riasec: 'I' },
          { label: 'By considering how it affects people and relationships', riasec: 'S' },
          { label: 'By trusting bold opportunity and taking calculated risks', riasec: 'E' },
        ],
      },
      {
        q: 'If you could shadow one professional for a full week, who would you pick?',
        opts: [
          { label: 'A surgeon or clinical psychologist helping patients', riasec: 'S' },
          { label: 'An architect walking through an active construction site', riasec: 'R' },
          { label: 'A chartered accountant advising on a major merger', riasec: 'C' },
          { label: 'A lawyer arguing a landmark case in High Court', riasec: 'E' },
        ],
      },
      {
        q: 'What frustrates you the most in a group project?',
        opts: [
          { label: 'Messy files, unclear numbers, and missed checklists', riasec: 'C' },
          { label: 'Boring slides with zero visual polish or originality', riasec: 'A' },
          { label: 'Nobody taking charge to make a final decision', riasec: 'E' },
          { label: 'People ignoring facts and guessing without evidence', riasec: 'I' },
        ],
      },
      {
        q: 'Which real-world impact makes you proudest?',
        opts: [
          { label: 'Building a tool or software app thousands of people use daily', riasec: 'R' },
          { label: 'Supporting someone through stress, illness, or uncertainty', riasec: 'S' },
          { label: 'Uncovering a truth or telling a story that shifts public opinion', riasec: 'A' },
          { label: 'Discovering a pattern in data that solves an expensive problem', riasec: 'I' },
        ],
      },
      {
        q: 'Ten years from now, what compliment would mean the most to you?',
        opts: [
          { label: '“You are the most reliable financial and strategic mind in the room.”', riasec: 'C' },
          { label: '“You built something from scratch that created jobs for others.”', riasec: 'E' },
          { label: '“You always ask the sharpest questions and solve hard puzzles.”', riasec: 'I' },
          { label: '“Your patience and care genuinely changed people’s lives.”', riasec: 'S' },
        ],
      },
    ];

    const insertQ = db.prepare(
      `INSERT INTO quiz_questions (id, quiz_id, position, question, options, correct_index) VALUES (?, ?, ?, ?, ?, ?)`
    );
    riasecQuestions.forEach((item, idx) => {
      insertQ.run(uuid(), careerQuizId, idx + 1, item.q, JSON.stringify(item.opts), null);
    });

    // 3 Mentor Quizzes
    const mentorQuizzes = [
      {
        id: '40000000-0000-4000-8000-000000000002',
        author_id: ayeshaId,
        niche_slug: 'software-engineering',
        title: 'Software Engineering Reality Check',
        description: 'Test what you know about real-world software teams, APIs, and CS careers in Pakistan.',
        questions: [
          {
            q: 'What does an API primarily allow two software systems to do?',
            opts: [
              { label: 'Communicate and exchange structured data reliably' },
              { label: 'Design logos and brand colors automatically' },
              { label: 'Increase laptop battery capacity' },
            ],
            correct: 0,
          },
          {
            q: 'Which habit makes a junior developer stand out most during internships?',
            opts: [
              { label: 'Memorizing every programming language syntax' },
              { label: 'Writing clear code, asking thoughtful questions, and debugging methodically' },
              { label: 'Avoiding code reviews completely' },
            ],
            correct: 1,
          },
          {
            q: 'In Pakistan, which of these is true about getting into Software Engineering?',
            opts: [
              { label: 'You must win an international coding olympiad first' },
              { label: 'Real projects and problem-solving matter as much as your university GPA' },
              { label: 'Only students from one city can get remote jobs' },
            ],
            correct: 1,
          },
          {
            q: 'What is version control (like Git) used for?',
            opts: [
              { label: 'Tracking code changes and collaborating without overwriting teammate work' },
              { label: 'Compressing PDF files for printing' },
              { label: 'Speeding up Wi-Fi routers' },
            ],
            correct: 0,
          },
          {
            q: 'Before shipping a new feature, what do engineers usually write to prevent bugs?',
            opts: [
              { label: 'Automated tests and pull request checks' },
              { label: 'Handwritten letters to users' },
              { label: 'Random CSS animations' },
            ],
            correct: 0,
          },
        ],
      },
      {
        id: '40000000-0000-4000-8000-000000000003',
        author_id: saraId,
        niche_slug: 'ux-ui-design',
        title: 'UX/UI Design Foundations',
        description: 'See how product designers think about usability, contrast, and user research.',
        questions: [
          {
            q: 'What is the main difference between UX and UI design?',
            opts: [
              { label: 'UX covers the overall user flow and problem-solving; UI covers visual interfaces' },
              { label: 'UX is only for print posters; UI is only for video games' },
              { label: 'There is no difference' },
            ],
            correct: 0,
          },
          {
            q: 'Why do designers test low-fidelity wireframes before high-polish visuals?',
            opts: [
              { label: 'To spot confusing navigation early before spending weeks on polish' },
              { label: 'Because Figma does not support color' },
              { label: 'To hide features from engineers' },
            ],
            correct: 0,
          },
          {
            q: 'What makes text accessible for every user on mobile?',
            opts: [
              { label: 'Strong color contrast and readable font sizes' },
              { label: 'Light gray text on a white background' },
              { label: 'All-caps paragraphs everywhere' },
            ],
            correct: 0,
          },
          {
            q: 'Which tool is the industry standard for collaborative UI prototyping?',
            opts: [
              { label: 'Figma' },
              { label: 'Microsoft Notepad' },
              { label: 'VLC Media Player' },
            ],
            correct: 0,
          },
        ],
      },
      {
        id: '40000000-0000-4000-8000-000000000004',
        author_id: bilalId,
        niche_slug: 'data-science',
        title: 'Data Science & Analytics Starter',
        description: 'Check your intuition on SQL, data cleaning, and machine learning tradeoffs.',
        questions: [
          {
            q: 'Where do data scientists typically spend a large chunk of their project time?',
            opts: [
              { label: 'Cleaning, validating, and joining messy real-world data' },
              { label: 'Choosing dark mode themes' },
              { label: 'Printing bar charts' },
            ],
            correct: 0,
          },
          {
            q: 'Which language is essential for querying relational databases?',
            opts: [
              { label: 'SQL' },
              { label: 'HTML' },
              { label: 'CSS' },
            ],
            correct: 0,
          },
          {
            q: 'Why should you split data into training and test sets?',
            opts: [
              { label: 'To evaluate whether a model generalizes to unseen data' },
              { label: 'To delete half the dataset permanently' },
              { label: 'To make charts brighter' },
            ],
            correct: 0,
          },
          {
            q: 'What does a fintech fraud team care most about when presenting model results?',
            opts: [
              { label: 'Clear business impact and false-positive tradeoffs' },
              { label: 'Using the longest buzzwords possible' },
              { label: 'Hiding error rates' },
            ],
            correct: 0,
          },
        ],
      },
    ];

    for (const mq of mentorQuizzes) {
      db.prepare(
        `INSERT INTO quizzes (id, author_id, niche_slug, title, description, is_career_fit) VALUES (?, ?, ?, ?, ?, 0)`
      ).run(mq.id, mq.author_id, mq.niche_slug, mq.title, mq.description);

      mq.questions.forEach((item, idx) => {
        insertQ.run(uuid(), mq.id, idx + 1, item.q, JSON.stringify(item.opts), item.correct);
      });
    }
  });

  tx();
}

export function getCurrentCycleMonth(): string {
  const pktNow = new Date(Date.now() + 5 * 3600 * 1000);
  return `${pktNow.getUTCFullYear()}-${String(pktNow.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ensureFlagshipSpeakersAndCourses(db: Database.Database) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysFromNow = (d: number, hourPKT: number, min = 0) => {
    const target = new Date(now.getTime() + d * 24 * 3600 * 1000);
    target.setUTCHours(hourPKT - 5, min, 0, 0);
    return target;
  };
  const demoPasswordHash = bcrypt.hashSync('Demo@1234', 10);

  const tx = db.transaction(() => {
    // 1. Ensure Social Impact flagship niche exists
    db.prepare(
      `INSERT OR IGNORE INTO niches (id, slug, name, description, day_in_life, salary_range_pkr, degrees, universities, riasec_codes, icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      '90000000-0000-4000-8000-000000000011',
      'social-impact',
      'Social Impact & Inclusion',
      'Lead education reform, disability accessibility tech, climate action, and non-profit ventures across Pakistan.',
      'Meet communities in Karachi or rural Sindh, design inclusive grassroots programs, measure real social outcomes, and pitch funders or policy partners.',
      'PKR 75k–400k / month',
      JSON.stringify(['BS Development Studies', 'BS Public Policy', 'BS Social Sciences & Liberal Arts']),
      JSON.stringify(['IBA Karachi', 'LUMS', 'Habib University', 'SZABIST']),
      JSON.stringify(['S', 'E']),
      'HeartHandshake'
    );

    // 2. Insert/ensure all 40 TEDx speakers & industry mentors (showcase is_demo = 1)
    const insertUser = db.prepare(
      `INSERT OR IGNORE INTO auth_users (id, email, password_hash, email_verified, auth_provider, created_at) VALUES (?, ?, ?, 1, 'local', ?)`
    );
    const insertProfile = db.prepare(
      `INSERT OR IGNORE INTO profiles (id, role, full_name, avatar_url, bio, city, grade_level, school_name, interests, guardian_consent, onboarding_complete, created_at)
       VALUES (?, 'mentor', ?, NULL, ?, ?, NULL, NULL, ?, 1, 1, ?)`
    );
    const insertMentor = db.prepare(
      `INSERT OR IGNORE INTO mentor_details (profile_id, profession, company, years_experience, linkedin_url, talk_url, niches, topics, preferred_slots, auto_welcome_message, vip_partner, is_demo, status, avg_reply_hours, rating, sessions_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Outpase Speaker Partner', 1, 'approved', ?, ?, ?)`
    );

    for (const s of TEDX_SPEAKER_MENTORS) {
      const derivedTopics = [s.profession.split('&')[0].trim(), `${s.niches[0]?.replace(/-/g, ' ')} roadmaps`, 'Career & university transitions'];
      const defaultWelcome = `Assalam-o-Alaikum! Thanks for completing a course and reaching out with such a thoughtful question. Happy to connect with you — feel free to follow up here or join my monthly Group Q&A! — ${s.name}`;
      insertUser.run(s.id, s.email, demoPasswordHash, iso(now));
      insertProfile.run(s.id, s.name, s.bio, s.city, JSON.stringify(s.niches), iso(now));
      insertMentor.run(
        s.id,
        s.profession,
        s.company,
        s.years,
        s.linkedin,
        s.talk_url || null,
        JSON.stringify(s.niches),
        JSON.stringify(derivedTopics),
        JSON.stringify(['Wednesday 7:00 PM PKT', 'Saturday 4:00 PM PKT']),
        defaultWelcome,
        s.avg_reply_hours,
        s.rating,
        s.sessions_completed
      );
    }

    // Ensure mentor@demo.com & pending.mentor@demo.com have topics/slots/48h fields populated cleanly
    db.prepare(
      `UPDATE mentor_details
       SET topics = CASE WHEN topics = '[]' OR topics IS NULL THEN ? ELSE topics END,
           preferred_slots = CASE WHEN preferred_slots = '[]' OR preferred_slots IS NULL THEN ? ELSE preferred_slots END,
           auto_welcome_message = COALESCE(auto_welcome_message, ?),
           vip_code = COALESCE(vip_code, 'NIC-VIP-2026'),
           vip_partner = COALESCE(vip_partner, 'NIC Pakistan'),
           is_demo = 0
       WHERE profile_id = '10000000-0000-4000-8000-000000000001'`
    ).run(
      JSON.stringify(['React & TypeScript', 'CS Admissions (NUST/FAST/LUMS)', 'First Engineering Internships']),
      JSON.stringify(['Tuesday 7:00 PM PKT', 'Thursday 8:00 PM PKT', 'Saturday 5:00 PM PKT']),
      'Assalam-o-Alaikum! Thank you for completing your Outpase course first. Your structured note is great — feel free to share your assignment link or ask about FAST/NUST/LUMS CS prep here.'
    );

    const pendingDeadline = new Date(now.getTime() + 46 * 3600 * 1000).toISOString();
    db.prepare(
      `UPDATE mentor_details
       SET topics = CASE WHEN topics = '[]' OR topics IS NULL THEN ? ELSE topics END,
           preferred_slots = CASE WHEN preferred_slots = '[]' OR preferred_slots IS NULL THEN ? ELSE preferred_slots END,
           verification_submitted_at = COALESCE(verification_submitted_at, ?),
           verification_deadline_at = COALESCE(verification_deadline_at, ?),
           is_demo = 0
       WHERE profile_id = '10000000-0000-4000-8000-000000000011'`
    ).run(
      JSON.stringify(['Embedded Systems & IoT', 'Robotics Competitions', 'Applied Machine Learning']),
      JSON.stringify(['Monday 6:00 PM PKT', 'Friday 7:00 PM PKT']),
      hoursAgo(2),
      pendingDeadline
    );

    // 3. Ensure every approved mentor has at least 3 open upcoming PKT slots
    const approvedMentors = db
      .prepare(`SELECT profile_id FROM mentor_details WHERE status = 'approved'`)
      .all() as Array<{ profile_id: string }>;
    const countOpenSlots = db.prepare(
      `SELECT COUNT(*) as c FROM availability WHERE mentor_id = ? AND is_booked = 0 AND start_at > ?`
    );
    const insertSlot = db.prepare(
      `INSERT INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 0)`
    );

    for (const m of approvedMentors) {
      const openCount = (countOpenSlots.get(m.profile_id, iso(now)) as { c: number }).c;
      if (openCount === 0) {
        for (const [idx, dayOffset] of [1, 2, 4].entries()) {
          const start = daysFromNow(dayOffset, 16 + idx, 0);
          const end = new Date(start.getTime() + 45 * 60 * 1000);
          insertSlot.run(uuid(), m.profile_id, iso(start), iso(end));
        }
      }
    }

    // 4. Ensure Flagship Track Groups exist for Entrepreneurship, Psychology, and Social Impact
    const flagshipGroups = [
      {
        id: '30000000-0000-4000-8000-000000000006',
        mentor_id: '10000000-0000-4000-8000-000000000105',
        niche_slug: 'entrepreneurship',
        name: 'Pakistan Student Founders & NIC Circle',
        description:
          'Share startup ideas, get pitch feedback from NIC Karachi & BusCaro mentors, and organize meetup teams.',
      },
      {
        id: '30000000-0000-4000-8000-000000000007',
        mentor_id: '10000000-0000-4000-8000-000000000119',
        niche_slug: 'psychology',
        name: 'Mind & Resilience Explorers',
        description:
          'Discuss clinical psychology degrees, youth mental health campaigns, and overcoming academic burnout.',
      },
      {
        id: '30000000-0000-4000-8000-000000000008',
        mentor_id: '10000000-0000-4000-8000-000000000101',
        niche_slug: 'social-impact',
        name: 'Social Impact & Accessibility Builders',
        description:
          'Connect with ConnectHear, Durbeen, and TEDxIBA mentors working on education equity, climate, and inclusion.',
      },
    ];
    const insertGroup = db.prepare(
      `INSERT OR IGNORE INTO groups (id, mentor_id, niche_slug, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const fg of flagshipGroups) {
      insertGroup.run(fg.id, fg.mentor_id, fg.niche_slug, fg.name, fg.description, iso(now));
    }

    // 5. Upsert Flagship Courses + Modules
    const insertCourse = db.prepare(
      `INSERT OR IGNORE INTO courses (id, niche_slug, author_id, title, subtitle, description, duration_label, is_coming_soon, competition_title, competition_brief, meetup_title, meetup_venue, meetup_date_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertModule = db.prepare(
      `INSERT OR IGNORE INTO course_modules (id, course_id, position, title, speaker_name, speaker_role, duration_seconds, video_url, summary, key_takeaways)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const c of FLAGSHIP_COURSES_SEED) {
      insertCourse.run(
        c.id,
        c.niche_slug,
        c.author_id,
        c.title,
        c.subtitle,
        c.description,
        c.duration_label,
        c.is_coming_soon ? 1 : 0,
        c.competition_title,
        c.competition_brief,
        c.meetup_title,
        c.meetup_venue,
        c.meetup_date_label,
        iso(now)
      );

      for (const mod of c.modules) {
        insertModule.run(
          mod.id,
          c.id,
          mod.position,
          mod.title,
          mod.speaker_name,
          mod.speaker_role,
          mod.duration_seconds,
          mod.video_url,
          mod.summary,
          JSON.stringify(mod.key_takeaways)
        );
      }
    }

    // 6. Seed starter peer cohort entries + scores/ranks + post-course assignments for Top Student Leaderboard
    const cycleMonth = getCurrentCycleMonth();
    const cohortSeeds = [
      {
        id: '60000000-0000-4000-8000-000000000001',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000008', // Saad Mehmood (#1 Winner)
        pitch_title: 'BazaarSplit: Shared Stationery & Lab Kit Co-op for Matric Students',
        problem_statement: 'Textbooks and science lab kits cost too much for individual students every term.',
        solution_summary:
          'A neighborhood school co-op app letting students swap verified kits and split bulk stationery orders with doorstep pickup.',
        rank: 1,
        score: 96,
        status: 'winner',
      },
      {
        id: '60000000-0000-4000-8000-000000000002',
        course_id: '50000000-0000-4000-8000-000000000002',
        student_id: '20000000-0000-4000-8000-000000000007', // Sana Javed (#2 Top 5)
        pitch_title: 'SukoonBoard: Bilingual Exam Stress Check-In Circles for Inter Students',
        problem_statement: 'Pre-board exam burnout is rarely discussed openly in Pakistani colleges.',
        solution_summary:
          'Weekly 25-minute peer-moderated study reflection circles paired with anonymous Urdu/English coping checklists.',
        rank: 2,
        score: 93,
        status: 'top_5',
      },
      {
        id: '60000000-0000-4000-8000-000000000003',
        course_id: '50000000-0000-4000-8000-000000000003',
        student_id: '20000000-0000-4000-8000-000000000003', // Fatima Noor (#3 Top 5)
        pitch_title: 'SunehriRasta: Audio-Visual Science Notes for Deaf & Low-Vision Classrooms',
        problem_statement: 'Science revision sheets in public schools lack Pakistani Sign Language and high-contrast audio guides.',
        solution_summary:
          'Student volunteer teams convert Matric Biology & Physics chapters into captioned PSL mini-clips for partner schools.',
        rank: 3,
        score: 90,
        status: 'top_5',
      },
      {
        id: '60000000-0000-4000-8000-000000000004',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000006', // Danish Kamran (#4 Top 5)
        pitch_title: 'CampusMeter: Solar Micro-Kiosk & Phone Charging for Rural Tuition Centers',
        problem_statement: 'Load-shedding disrupts evening exam prep across outer Karachi & interior Sindh.',
        solution_summary:
          'Low-cost student-operated solar battery bank leased per evening session with JazzCash micro-payments.',
        rank: 4,
        score: 87,
        status: 'top_5',
      },
      {
        id: '60000000-0000-4000-8000-000000000005',
        course_id: '50000000-0000-4000-8000-000000000003',
        student_id: '20000000-0000-4000-8000-000000000005', // Mahnoor Azhar (#5 Top 5)
        pitch_title: 'SadaaTransit: Tactile Bus-Stop Route Cards for Visually Impaired Commuters',
        problem_statement: 'Bus routes in Lahore lack tactile or audio route indicators for blind commuters.',
        solution_summary:
          'Embossed waterproof route sleeves paired with free QR Urdu voice guides co-designed with Punjab transit.',
        rank: 5,
        score: 84,
        status: 'top_5',
      },
      {
        id: '60000000-0000-4000-8000-000000000006',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000004', // Zain ul Abidin (#6)
        pitch_title: 'HisaabBook Teen: Pocket Allowance & Bookkeeping Helper for Students',
        problem_statement: 'High-school clubs struggle to reconcile bake-sale and event budgets transparently.',
        solution_summary:
          'Simple two-column mobile ledger template tailored for school society treasurers.',
        rank: 6,
        score: 78,
        status: 'confirmed',
      },
    ];

    const insertEntry = db.prepare(
      `INSERT OR IGNORE INTO competition_entries (id, course_id, student_id, cycle_month, pitch_title, problem_statement, solution_summary, pitch_link, in_person_rsvp, status, rank, score, mentor_feedback, certificate_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, 'Strong local insight—evaluated by Outpase track mentors.', NULL, ?)`
    );
    const updateEntryScore = db.prepare(
      `UPDATE competition_entries SET rank = COALESCE(rank, ?), score = CASE WHEN score = 0 THEN ? ELSE score END, status = CASE WHEN status = 'confirmed' THEN ? ELSE status END WHERE id = ?`
    );
    for (const ce of cohortSeeds) {
      insertEntry.run(
        ce.id,
        ce.course_id,
        ce.student_id,
        cycleMonth,
        ce.pitch_title,
        ce.problem_statement,
        ce.solution_summary,
        ce.status,
        ce.rank,
        ce.score,
        iso(now)
      );
      updateEntryScore.run(ce.rank, ce.score, ce.status, ce.id);
    }

    // 7. Seed Post-Course Assignments (video & presentation submissions) so Leaderboard & Student Profiles are inspectable immediately
    const assignmentSeeds = [
      {
        id: '70000000-0000-4000-8000-000000000001',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000008', // Saad Mehmood
        submission_type: 'presentation',
        title: 'BazaarSplit 10-Slide Unit Economics & School Pilot Deck',
        summary: 'Surveyed 64 Matric parents in Lahore, mapped 18% bulk stationery savings, and modeled campus ambassador logistics.',
        asset_url: 'https://docs.google.com/presentation/d/outspace-bazaarsplit-deck',
        score: 96,
      },
      {
        id: '70000000-0000-4000-8000-000000000002',
        course_id: '50000000-0000-4000-8000-000000000002',
        student_id: '20000000-0000-4000-8000-000000000007', // Sana Javed
        submission_type: 'video',
        title: '3-Minute Urdu/English Peer Counseling Roleplay & Field Brief',
        summary: 'Demonstrated active-listening de-escalation protocol for pre-board exam anxiety tested with 15 Fazaia Inter classmates.',
        asset_url: 'https://youtu.be/dQw4w9WgXcQ',
        score: 93,
      },
      {
        id: '70000000-0000-4000-8000-000000000003',
        course_id: '50000000-0000-4000-8000-000000000003',
        student_id: '20000000-0000-4000-8000-000000000003', // Fatima Noor
        submission_type: 'presentation',
        title: 'SunehriRasta PSL Science Accessibility Prototype Deck',
        summary: '12-slide accessibility breakdown interviewing two special-education teachers in Islamabad and scripting captioned Physics lessons.',
        asset_url: 'https://docs.google.com/presentation/d/outspace-sunehrirasta-deck',
        score: 90,
      },
      {
        id: '70000000-0000-4000-8000-000000000004',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000006', // Danish Kamran
        submission_type: 'video',
        title: 'CampusMeter Solar Micro-Kiosk Hardware Walkthrough (2m 45s)',
        summary: 'Walked through 12V LiFePO4 bill of materials, break-even pricing in PKR, and tuition center pilot feedback.',
        asset_url: 'https://youtu.be/M7lc1UVf-VE',
        score: 87,
      },
      {
        id: '70000000-0000-4000-8000-000000000005',
        course_id: '50000000-0000-4000-8000-000000000003',
        student_id: '20000000-0000-4000-8000-000000000005', // Mahnoor Azhar
        submission_type: 'presentation',
        title: 'SadaaTransit Orange Line Wayfinding Figma & Tactile Case Study',
        summary: 'Field audit of 4 Lahore transit stops with high-contrast tactile card prototypes and bilingual audio QR flows.',
        asset_url: 'https://docs.google.com/presentation/d/outspace-sadaatransit-study',
        score: 84,
      },
      {
        id: '70000000-0000-4000-8000-000000000006',
        course_id: '50000000-0000-4000-8000-000000000001',
        student_id: '20000000-0000-4000-8000-000000000004', // Zain ul Abidin
        submission_type: 'presentation',
        title: 'HisaabBook Teen School Society Ledger Showcase',
        summary: 'Sample Google Sheets + cash-flow breakdown for high school science Olympiad budgeting.',
        asset_url: 'https://docs.google.com/presentation/d/outspace-hisaabbook-deck',
        score: 78,
      },
    ];

    const insertAssignment = db.prepare(
      `INSERT OR IGNORE INTO course_assignments (id, course_id, student_id, submission_type, title, summary, asset_url, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of assignmentSeeds) {
      insertAssignment.run(
        a.id,
        a.course_id,
        a.student_id,
        a.submission_type,
        a.title,
        a.summary,
        a.asset_url,
        a.score,
        hoursAgo(12)
      );
    }

    // 8. Seed Mentor Updates (Masterclasses, Updates & Upcoming Cohorts) for free/unverified follow feed
    const mentorUpdatesSeed = [
      {
        id: '80000000-0000-4000-8000-000000000001',
        mentor_id: '10000000-0000-4000-8000-000000000001', // Ayesha Khan
        kind: 'masterclass',
        title: 'Masterclass: How Pakistani High-Schoolers Land Engineering Portfolios',
        body: 'Watch my 18-minute walkthrough on turning A-Level & Matric class projects into deployable TypeScript apps recruiters actually open.',
        media_url: 'https://youtu.be/M7lc1UVf-VE',
        event_at: null,
      },
      {
        id: '80000000-0000-4000-8000-000000000002',
        mentor_id: '10000000-0000-4000-8000-000000000001',
        kind: 'cohort',
        title: 'Upcoming Cohort: Tech Explorers Monthly Live Q&A',
        body: 'Hosting our monthly group Q&A on FAST vs NUST vs LUMS admissions and hackathon teamwork. Open to all following students — no prior course needed to listen in!',
        media_url: null,
        event_at: iso(daysFromNow(3, 19, 0)),
      },
      {
        id: '80000000-0000-4000-8000-000000000003',
        mentor_id: '10000000-0000-4000-8000-000000000105', // Jehan Ara
        kind: 'update',
        title: 'What NIC & Nest I/O Evaluators Look For in First-Time Student Pitches',
        body: 'We do not expect polished revenue numbers at 16. We look for genuine field interviews with 10 real Pakistani customers and a clear unit-cost experiment.',
        media_url: null,
        event_at: null,
      },
      {
        id: '80000000-0000-4000-8000-000000000004',
        mentor_id: '10000000-0000-4000-8000-000000000101', // Azima Dhanjee
        kind: 'masterclass',
        title: 'Masterclass: Building Accessible Assistive Startups in Karachi',
        body: 'Behind the scenes of co-founding ConnectHear and scaling Sign Language interpretation to hospitals and schools nationwide.',
        media_url: 'https://youtu.be/dQw4w9WgXcQ',
        event_at: null,
      },
    ];

    const insertMentorUpdate = db.prepare(
      `INSERT OR IGNORE INTO mentor_updates (id, mentor_id, kind, title, body, media_url, event_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const u of mentorUpdatesSeed) {
      insertMentorUpdate.run(u.id, u.mentor_id, u.kind, u.title, u.body, u.media_url, u.event_at, hoursAgo(6));
    }

    // Seed initial follow so Waniyah sees followed updates out of the box
    db.prepare(`INSERT OR IGNORE INTO mentor_follows (mentor_id, student_id, created_at) VALUES (?, ?, ?)`).run(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      hoursAgo(24)
    );

    // 9. Seed Monthly Group Q&A Seminars inside Flagship & Core Groups
    const groupSeminarsSeed = [
      {
        id: '91000000-0000-4000-8000-000000000001',
        mentor_id: '10000000-0000-4000-8000-000000000001', // Ayesha Khan
        group_id: '30000000-0000-4000-8000-000000000001', // Tech Explorers Pakistan
        topic: 'Monthly Group Q&A: NUST / FAST / LUMS CS Admissions & Portfolio Prep',
        meet_url: 'https://meet.google.com/out-tech-qna',
        start_at: iso(daysFromNow(3, 19, 0)),
      },
      {
        id: '91000000-0000-4000-8000-000000000002',
        mentor_id: '10000000-0000-4000-8000-000000000105', // Jehan Ara
        group_id: '30000000-0000-4000-8000-000000000006', // Pakistan Student Founders & NIC Circle
        topic: 'Monthly Group Q&A: Idea Validation & Pitch Deck Clinic for Teens',
        meet_url: 'https://meet.google.com/out-nic-qna',
        start_at: iso(daysFromNow(5, 18, 0)),
      },
    ];
    const insertSeminar = db.prepare(
      `INSERT OR IGNORE INTO meetings (id, mentor_id, student_id, slot_id, type, group_id, topic, meet_url, status, created_at)
       VALUES (?, ?, ?, NULL, 'group_seminar', ?, ?, ?, 'booked', ?)`
    );
    for (const gs of groupSeminarsSeed) {
      // Note: store start_at ISO in mentor_notes or availability; let's create a group availability row or store start_at cleanly
      const slotId = `slot-${gs.id}`;
      db.prepare(`INSERT OR IGNORE INTO availability (id, mentor_id, start_at, end_at, is_booked) VALUES (?, ?, ?, ?, 1)`).run(
        slotId,
        gs.mentor_id,
        gs.start_at,
        iso(new Date(new Date(gs.start_at).getTime() + 60 * 60 * 1000))
      );
      insertSeminar.run(gs.id, gs.mentor_id, gs.mentor_id, gs.group_id, gs.topic, gs.meet_url, hoursAgo(10));
      db.prepare(`UPDATE meetings SET slot_id = COALESCE(slot_id, ?) WHERE id = ?`).run(slotId, gs.id);
    }
  });

  tx();
}
