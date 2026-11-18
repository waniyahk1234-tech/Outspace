-- Outspace Seed Data (Niches, Institutions, Demo Quizzes)
-- Run after creating auth users via the seed script or Supabase Auth Admin API.

insert into niches (slug, name, description, day_in_life, salary_range_pkr, degrees, universities, riasec_codes, icon)
values
  (
    'software-engineering',
    'Software Engineering',
    'Build web apps, mobile platforms, fintech systems, and scalable cloud products used across Pakistan and globally.',
    'Start with a morning standup with product and QA teammates, review pull requests, debug API endpoints or React components, and collaborate on system architecture before shipping features.',
    'PKR 120k–550k / month',
    array['BS Computer Science', 'BS Software Engineering', 'BS Computer Engineering'],
    array['NUST', 'FAST-NUCES', 'LUMS', 'Habib University'],
    array['I', 'R'],
    'Code2'
  ),
  (
    'ux-ui-design',
    'UX/UI Design',
    'Research how everyday Pakistani users navigate apps and craft intuitive, accessible digital experiences.',
    'Interview customers in Urdu or English, map user journeys in Figma, test clickable prototypes with real users, and pair closely with frontend engineers to polish interactions.',
    'PKR 90k–380k / month',
    array['BS Communication Design', 'BS Interactive Media', 'BS Human-Computer Interaction'],
    array['Indus Valley School of Art and Architecture', 'NCA Lahore', 'Habib University', 'NUST'],
    array['A', 'I'],
    'Palette'
  ),
  (
    'medicine',
    'Medicine',
    'Diagnose, treat, and prevent illness in hospital wards, clinics, and public health initiatives.',
    'Join morning ward rounds with senior consultants, review patient lab charts, console anxious families, and balance clinical rotations with ongoing medical research.',
    'PKR 100k–450k / month',
    array['MBBS', 'BDS', 'Doctor of Physical Therapy'],
    array['Aga Khan University', 'King Edward Medical University', 'Dow University', 'Shifa Tameer-e-Millat'],
    array['I', 'S'],
    'Stethoscope'
  ),
  (
    'law',
    'Law',
    'Advocate for clients, draft corporate contracts, and shape constitutional and technology policy.',
    'Research Supreme Court and High Court precedents, draft legal briefs and commercial agreements, meet clients, and argue motions before judges or regulatory panels.',
    'PKR 90k–500k / month',
    array['LLB (5-Year)', 'BA-LLB', 'University of London LLB'],
    array['LUMS', 'SZABIST', 'Quaid-i-Azam University', 'Pakistan College of Law'],
    array['E', 'S'],
    'Scale'
  ),
  (
    'psychology',
    'Psychology',
    'Understand human behavior and support mental health in schools, clinics, and organizational teams.',
    'Conduct structured counseling sessions, administer behavioral assessments, design school wellbeing workshops, and analyze qualitative research data.',
    'PKR 75k–280k / month',
    array['BS Psychology', 'BS Applied Psychology', 'MS Clinical Psychology'],
    array['FCCU Lahore', 'Bahria University', 'University of Karachi', 'NUST'],
    array['S', 'I'],
    'Brain'
  ),
  (
    'architecture',
    'Architecture',
    'Design climate-resilient homes, civic spaces, and urban neighborhoods tailored to Pakistani cities.',
    'Sketch spatial concepts, build 3D BIM models, visit active construction sites to inspect concrete and brickwork, and coordinate with structural engineers.',
    'PKR 85k–360k / month',
    array['B.Arch (5-Year)'],
    array['NCA Lahore', 'Indus Valley School of Art and Architecture', 'NED University', 'NUST'],
    array['A', 'R'],
    'Compass'
  ),
  (
    'media-journalism',
    'Media & Journalism',
    'Investigate public-interest stories, produce documentaries, and build credible digital newsrooms.',
    'Pitch timely story angles at the editorial desk, interview community voices on location, fact-check data sources, and edit multimedia packages for broadcast or digital.',
    'PKR 70k–300k / month',
    array['BS Media Sciences', 'BS Mass Communication', 'BA Comparative Humanities'],
    array['SZABIST', 'Beaconhouse National University', 'Habib University', 'IBA Karachi'],
    array['A', 'E'],
    'Mic'
  ),
  (
    'data-science',
    'Data Science',
    'Turn messy datasets into forecasts, fraud detection models, and actionable business intelligence.',
    'Write SQL pipelines, clean millions of transaction rows in Python, train machine learning models, and present clear visual stories to leadership.',
    'PKR 130k–600k / month',
    array['BS Data Science', 'BS Artificial Intelligence', 'BS Mathematics & Economics'],
    array['LUMS', 'NUST', 'FAST-NUCES', 'IBA Karachi'],
    array['I', 'C'],
    'BarChart3'
  ),
  (
    'entrepreneurship',
    'Entrepreneurship',
    'Spot overlooked problems in local markets and build sustainable startups from zero to scale.',
    'Talk to early customers, test minimum viable products, manage cash flow and unit economics, pitch angel investors, and recruit your founding team.',
    'PKR 80k–700k+ / month',
    array['BBA', 'BS Entrepreneurship', 'BS Management Sciences'],
    array['IBA Karachi', 'LUMS', 'KSBL', 'NUST Business School'],
    array['E', 'C'],
    'Rocket'
  ),
  (
    'chartered-accountancy',
    'Chartered Accountancy',
    'Audit financial statements, advise boards on corporate tax, and steward capital across industries.',
    'Review balance sheets and IFRS compliance during audit season, model financial projections in Excel, and advise CFOs on mergers and risk controls.',
    'PKR 110k–650k / month',
    array['CA (ICAP)', 'ACCA', 'BS Accounting & Finance'],
    array['IBA Karachi', 'LUMS', 'SKANS', 'PAC Lahore'],
    array['C', 'E'],
    'Calculator'
  )
on conflict (slug) do nothing;

insert into institutions (name, access_code, seats_total, seats_used)
values ('Demo College Karachi', 'DEMO2026', 100, 0)
on conflict (access_code) do nothing;
