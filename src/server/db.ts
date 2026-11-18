import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
      niches TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      avg_reply_hours REAL,
      rating REAL,
      sessions_completed INTEGER NOT NULL DEFAULT 0
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
      'Outspace Trust & Mentor Verification Lead.',
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
