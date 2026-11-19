export interface CourseModuleSeed {
  id: string;
  position: number;
  title: string;
  speaker_name: string;
  speaker_role: string;
  duration_seconds: number;
  video_url: string | null;
  summary: string;
  key_takeaways: string[];
}

export interface CourseSeed {
  id: string;
  niche_slug: string;
  author_id: string;
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
  modules: CourseModuleSeed[];
}

export const FLAGSHIP_COURSES_SEED: CourseSeed[] = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    niche_slug: 'entrepreneurship',
    author_id: '10000000-0000-4000-8000-000000000105',
    title: 'Zero to Pitch: Building Startups from Pakistan',
    subtitle: '4 Video Modules · Monthly Startup Pitch Arena',
    description:
      'Learn how Pakistani founders discover overlooked local problems, size markets, handle self-doubt, and prepare a real startup pitch before graduating high school.',
    duration_label: '4 video lessons · 38 mins',
    is_coming_soon: false,
    competition_title: 'Monthly Startup Idea & Pitch Arena',
    competition_brief:
      'All students completing this entrepreneurship track within the 30-day cycle submit a 1-page startup pitch and join our monthly Karachi demo meetup to compete for the Honours Certificate.',
    meetup_title: 'Student Founders & NIC Mentors In-Person Mixer',
    meetup_venue: 'National Incubation Center (NIC), Karachi',
    meetup_date_label: 'Last Saturday of the Month · 4:00 PM PKT',
    modules: [
      {
        id: '51000000-0000-4000-8000-000000000101',
        position: 1,
        title: 'Embracing Self-Doubt & Launching BusCaro',
        speaker_name: 'Maha Shahzad',
        speaker_role: 'Founder & CEO, BusCaro · TEDxClifton',
        duration_seconds: 540,
        video_url: 'https://www.youtube.com/watch?v=_47Q2CAfAgs',
        summary:
          'Why waiting until you feel 100% ready stops great student founders—and how turning everyday commute problems in Karachi into an MVP builds real conviction.',
        key_takeaways: [
          'Start with a recurring pain point you witness daily in Pakistan',
          'Talk to 15 real users before writing code or printing flyers',
          'Use imposter syndrome as feedback, never as a stop sign',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000102',
        position: 2,
        title: 'Market Size, Traction & Founder Storytelling',
        speaker_name: 'Muhammad Ammar Hassan',
        speaker_role: 'Founder, BuyPass · ex-CMO Daraz & OLX',
        duration_seconds: 620,
        video_url: null,
        summary:
          'How Pakistan’s largest digital marketplaces measure genuine demand vs vanity metrics, and how to turn customer interviews into a clear pitch story.',
        key_takeaways: [
          'Distinguish between total population and reachable paying customers',
          'Retention and repeat usage beat one-time launch spikes',
          'Frame your startup pitch as Before → Friction → Breakthrough',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000103',
        position: 3,
        title: 'Incubation, Team Culture & Pitching at NIC Karachi',
        speaker_name: 'Syed Hazkeel Haider Rizvi',
        speaker_role: 'Head of NIC Karachi · Startup Mentor',
        duration_seconds: 580,
        video_url: null,
        summary:
          'Inside Pakistan’s top startup incubators: what judges look for in early student pitches and how to protect founder mental health while shipping fast.',
        key_takeaways: [
          'Strong founder-problem fit matters more than complex slides',
          'Build complementary co-founder skills across product and distribution',
          'Show a concrete 30-day pilot plan for your competition pitch',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000104',
        position: 4,
        title: 'Trained by Chaos: The Mindset AI Can’t Replace',
        speaker_name: 'Muhammad Saadi Mansuri',
        speaker_role: 'CEO, NostradAI · TEDxIBA Speaker',
        duration_seconds: 510,
        video_url: 'https://youtu.be/8sHUWCQEmmE',
        summary:
          'How Pakistani youth can pair AI tools with uniquely human judgment, negotiation, and resourcefulness to launch lean ventures from Matric or A-Levels.',
        key_takeaways: [
          'Use AI as leverage for research and prototyping—not a crutch for strategy',
          'Validate pricing early with small paid tests or pre-orders',
          'Prepare your 3-minute monthly competition pitch cleanly',
        ],
      },
    ],
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    niche_slug: 'psychology',
    author_id: '10000000-0000-4000-8000-000000000119',
    title: 'Mind, Resilience & Applied Psychology in Pakistan',
    subtitle: '4 Video Modules · Monthly Wellbeing Campaign Challenge',
    description:
      'Explore clinical psychology, psychiatry, trauma counseling, and applied behavioral communication through practitioners changing how Pakistan talks about mental health.',
    duration_label: '4 video lessons · 36 mins',
    is_coming_soon: false,
    competition_title: 'Monthly Youth Mental Health & Campaign Challenge',
    competition_brief:
      'Complete all 4 video lessons to unlock this month’s mandatory applied psychology challenge: design a practical school peer-support or anti-burnout initiative and meet mentors in person.',
    meetup_title: 'Karachi Psychology & Peer Listening In-Person Circle',
    meetup_venue: 'Clifton Community Learning Hub, Karachi',
    meetup_date_label: 'Last Saturday of the Month · 2:30 PM PKT',
    modules: [
      {
        id: '51000000-0000-4000-8000-000000000201',
        position: 1,
        title: 'Bas Paanch Minute: Youth Burnout & Stigma',
        speaker_name: 'Dr. Ayesha Mian',
        speaker_role: 'Founder & CEO, Synapse Neuroscience Institute',
        duration_seconds: 510,
        video_url: null,
        summary:
          'A candid walkthrough of adolescent stress, board-exam pressure, and how Pakistani psychiatrists and psychologists work together across schools and hospitals.',
        key_takeaways: [
          'Distinguish psychiatry (MD/MBBS), clinical psychology (MS), and counseling',
          'Early peer conversations prevent bottled emotions from escalating',
          'Design culturally empathetic Urdu & English mental health awareness',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000202',
        position: 2,
        title: 'Purpose, Empathy & Inclusive Psychology',
        speaker_name: 'Dr. Iffet Sultana',
        speaker_role: 'Professor of Psychology, Iqra University · TEDx',
        duration_seconds: 590,
        video_url: 'https://youtu.be/O0fKrm_AFlQ',
        summary:
          'How psychology research translates into real community impact—from girls’ education in Karachi slums to supporting neurodiverse artists.',
        key_takeaways: [
          'Field research grounds psychological theory in real lived environments',
          'Inclusion begins when families and schools listen without judgment',
          'Career paths span research, school counseling, and organizational behavior',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000203',
        position: 3,
        title: 'Meta-Skills, Confidence & Mindset Coaching',
        speaker_name: 'Aliyah Mohyeddin',
        speaker_role: 'CEO, Dynamic Communications · TEDx Speaker',
        duration_seconds: 540,
        video_url: 'https://youtu.be/-X8HPZGjRnI',
        summary:
          'Practical NLP communication frameworks that help high-schoolers manage exam anxiety, reframe internal self-talk, and listen actively.',
        key_takeaways: [
          'Notice limiting beliefs triggered by "safe career" comparison',
          'Active listening builds immediate psychological safety with peers',
          'Combine structured empathy with measurable habit experiments',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000204',
        position: 4,
        title: 'Trauma-Informed Youth Counseling Practice',
        speaker_name: 'Faraheem Batool',
        speaker_role: 'Psychotherapist & Youth Trauma Counselor',
        duration_seconds: 495,
        video_url: null,
        summary:
          'What an actual week looks like running online counseling sessions for Pakistani youth—ethics, boundaries, and choosing BS vs MS tracks.',
        key_takeaways: [
          'Ethics, confidentiality, and supervision define credible practitioners',
          'Compare BS Psychology options at KU, Bahria, FCCU, and NUST',
          'Outline a realistic 30-day school wellbeing pilot for the monthly challenge',
        ],
      },
    ],
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    niche_slug: 'social-impact',
    author_id: '10000000-0000-4000-8000-000000000101',
    title: 'Inclusive Systems & Social Impact Leadership',
    subtitle: '4 Video Modules · Monthly Civic & Impact Sprint',
    description:
      'Discover how Pakistani changemakers build accessible tech, reform public schools, lead climate resilience, and turn lived adversity into systemic impact.',
    duration_label: '4 video lessons · 40 mins',
    is_coming_soon: false,
    competition_title: 'Monthly Inclusive Impact & Civic Design Sprint',
    competition_brief:
      'Course finishers enter our mandatory monthly social impact showcase: propose an accessibility, education, or climate action pilot for your city and network in person.',
    meetup_title: 'Social Impact Builders & TEDx Alumni Roundtable',
    meetup_venue: 'Clifton Community Space / T2F, Karachi',
    meetup_date_label: 'Last Sunday of the Month · 4:00 PM PKT',
    modules: [
      {
        id: '51000000-0000-4000-8000-000000000301',
        position: 1,
        title: 'Fly I Must: From Orangi Town to Harvard Policy',
        speaker_name: 'Afreen Mushtaq',
        speaker_role: 'Harvard Ed.M · Fulbright & TEDxIBA Speaker',
        duration_seconds: 600,
        video_url: null,
        summary:
          'How scholarships, community mentors, and refusing to accept low expectations took Afreen from Orangi Town to Harvard—and back to transform Pakistani education.',
        key_takeaways: [
          'Audit scholarship pipelines early (IBA NTHP, LUMS NOP, Fulbright)',
          'Lived experience inside communities is a superpower in public policy',
          'Turn personal barriers into measurable programs for younger students',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000302',
        position: 2,
        title: 'Scaling ConnectHear & Accessibility Tech',
        speaker_name: 'Azima Dhanjee',
        speaker_role: 'Co-founder & CEO, ConnectHear',
        duration_seconds: 560,
        video_url: null,
        summary:
          'How a Facebook page started at age 19 grew into South Asia’s largest Pakistani Sign Language accessibility platform serving hospitals, banks, and schools.',
        key_takeaways: [
          'Social enterprises combine sustainable revenue with measurable equity',
          'Co-design every feature directly with the community you serve',
          'Start small with a focused pilot before seeking national partnerships',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000303',
        position: 3,
        title: 'The Other Side of Life: Inclusion by Design',
        speaker_name: 'Ali Khan Tareen',
        speaker_role: 'Founder, Inclusive Pakistan · TEDxClifton',
        duration_seconds: 590,
        video_url: 'https://youtu.be/ta7L7Sun2Gs',
        summary:
          'Why accessibility is a right, not charity—plus lessons from pioneering Dining in the Dark and Inclusive Pakistan.',
        key_takeaways: [
          'Inclusive design improves dignity and outcomes for everyone',
          'Experiential empathy changes mindsets faster than lectures',
          'Measure impact through real employment and independent agency',
        ],
      },
      {
        id: '51000000-0000-4000-8000-000000000304',
        position: 4,
        title: 'Don’t Undermine the Power of Small',
        speaker_name: 'Umair Jaliawala',
        speaker_role: 'CEO, School of Leadership · TEDxPIFD',
        duration_seconds: 620,
        video_url: 'https://youtu.be/3BmjODfqWi0',
        summary:
          'Leadership frameworks from working with 103,000+ people across Pakistan: how high-school students organize grassroots initiatives that stick.',
        key_takeaways: [
          'Consistent small civic actions compound across campuses',
          'Recruit 3 peers with shared urgency to test your monthly sprint idea',
          'Come ready to network and collaborate at the monthly Karachi meetup',
        ],
      },
    ],
  },
  // Coming Soon preview courses for remaining niches
  {
    id: '50000000-0000-4000-8000-000000000004',
    niche_slug: 'data-science',
    author_id: '10000000-0000-4000-8000-000000000126',
    title: 'Applied AI, Data Literacy & Human Intellect',
    subtitle: 'Video Track Launching Next Cohort · Mentors Active Now',
    description:
      'Explore data pipelines, ethical AI, and Karachi.AI practitioner workflows with Berjees Shaikh, Mesum Raza Hemani, and Khizer Ahmed.',
    duration_label: 'Coming Soon · 4 planned lessons',
    is_coming_soon: true,
    competition_title: 'AI Builder Sprint (Opening Soon)',
    competition_brief: 'Upcoming monthly challenge on practical machine learning workflows.',
    meetup_title: 'Karachi.AI Youth Data Jam',
    meetup_venue: 'NIC Karachi',
    meetup_date_label: 'Next Cycle · TBA',
    modules: [],
  },
  {
    id: '50000000-0000-4000-8000-000000000005',
    niche_slug: 'media-journalism',
    author_id: '10000000-0000-4000-8000-000000000132',
    title: 'Storytelling, Fact-Checking & Digital Media',
    subtitle: 'Video Track Launching Next Cohort · Mentors Active Now',
    description:
      'Behind the scenes of Nukta, Dawn, iVerify Pakistan, and podcasting with Amber Rahim Shamsi, Aleezeh Fatimah Hashmi, and Ahmer Naqvi.',
    duration_label: 'Coming Soon · 4 planned lessons',
    is_coming_soon: true,
    competition_title: 'Digital Documentary & Fact-Check Sprint (Opening Soon)',
    competition_brief: 'Upcoming monthly challenge on civic storytelling and verification.',
    meetup_title: 'Pakistani Storytellers & Podcast Mixer',
    meetup_venue: 'Karachi',
    meetup_date_label: 'Next Cycle · TBA',
    modules: [],
  },
  {
    id: '50000000-0000-4000-8000-000000000006',
    niche_slug: 'software-engineering',
    author_id: '10000000-0000-4000-8000-000000000001',
    title: 'Full-Stack Engineering & Product Shipping',
    subtitle: 'Video Track Launching Next Cohort · Mentors Active Now',
    description:
      'Go inside FAST/NUST/LUMS computer science paths and real Pakistani engineering teams with Ayesha Khan and tech mentors.',
    duration_label: 'Coming Soon · 4 planned lessons',
    is_coming_soon: true,
    competition_title: 'Weekend Civic Hackathon (Opening Soon)',
    competition_brief: 'Upcoming monthly coding sprint for student builders.',
    meetup_title: 'Karachi Student Builders Meetup',
    meetup_venue: 'Karachi',
    meetup_date_label: 'Next Cycle · TBA',
    modules: [],
  },
];
