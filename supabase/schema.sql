-- Outspace PostgreSQL / Supabase Schema
-- Complete tables, enums, Row Level Security (RLS), triggers, and security-definer functions.

create extension if not exists "pgcrypto";

-- Enums
create type user_role as enum ('student', 'mentor', 'admin');
create type mentor_status as enum ('pending', 'approved', 'rejected');
create type connection_status as enum ('pending', 'accepted', 'declined');
create type meeting_status as enum ('booked', 'completed', 'cancelled');
create type plan_type as enum ('trial', 'monthly', 'yearly', 'institution', 'expired');

-- Tables
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  avatar_url text,
  bio text,
  city text,
  grade_level text,
  school_name text,
  interests text[] default '{}',
  guardian_consent boolean default false,
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);

create table mentor_details (
  profile_id uuid primary key references profiles(id) on delete cascade,
  profession text not null,
  company text,
  years_experience int,
  linkedin_url text not null,
  niches text[] default '{}',
  status mentor_status default 'pending',
  avg_reply_hours numeric,
  rating numeric,
  sessions_completed int default 0
);

create table niches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null,
  day_in_life text not null,
  salary_range_pkr text not null,
  degrees text[] default '{}',
  universities text[] default '{}',
  riasec_codes text[] default '{}',
  icon text not null
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  status connection_status default 'pending',
  message text,
  responded_at timestamptz,
  created_at timestamptz default now(),
  unique (requester_id, receiver_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references connections(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references profiles(id) on delete cascade not null,
  niche_slug text references niches(slug) on delete set null,
  name text not null,
  description text not null,
  created_at timestamptz default now()
);

create table group_members (
  group_id uuid references groups(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, student_id)
);

create table group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade not null,
  author_id uuid references profiles(id) on delete cascade not null,
  parent_id uuid references group_posts(id) on delete cascade,
  body text not null,
  is_question boolean default false,
  created_at timestamptz default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references profiles(id) on delete cascade not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_booked boolean default false
);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid references profiles(id) on delete cascade not null,
  student_id uuid references profiles(id) on delete cascade not null,
  slot_id uuid references availability(id) on delete set null,
  type text default 'one_on_one' check (type in ('one_on_one', 'group_seminar')),
  group_id uuid references groups(id) on delete set null,
  topic text,
  meet_url text,
  status meeting_status default 'booked',
  mentor_notes text,
  rating int check (rating between 1 and 5),
  feedback text,
  created_at timestamptz default now()
);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,
  niche_slug text references niches(slug) on delete set null,
  title text not null,
  description text,
  is_career_fit boolean default false
);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade not null,
  position int not null,
  question text not null,
  options jsonb not null,
  correct_index int
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade not null,
  student_id uuid references profiles(id) on delete cascade not null,
  score int default 0,
  result jsonb,
  created_at timestamptz default now()
);

create table badges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade not null,
  type text not null,
  label text not null,
  awarded_at timestamptz default now(),
  unique (student_id, type)
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id) on delete cascade not null,
  mentor_id uuid references profiles(id) on delete cascade not null,
  meeting_id uuid references meetings(id) on delete set null,
  title text not null,
  verify_code text unique not null,
  issued_at timestamptz default now()
);

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code text unique not null,
  seats_total int not null,
  seats_used int default 0
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique not null,
  plan plan_type default 'trial',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  institution_id uuid references institutions(id) on delete set null,
  free_sessions_left int default 1
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete cascade not null,
  reported_id uuid references profiles(id) on delete cascade not null,
  reason text not null,
  created_at timestamptz default now()
);

create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Enable RLS on every table
alter table profiles enable row level security;
alter table mentor_details enable row level security;
alter table niches enable row level security;
alter table connections enable row level security;
alter table messages enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_posts enable row level security;
alter table availability enable row level security;
alter table meetings enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;
alter table badges enable row level security;
alter table certificates enable row level security;
alter table institutions enable row level security;
alter table subscriptions enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;

-- RLS Policies
-- profiles
create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_select_public_passport" on profiles
  for select using (true);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

-- mentor_details
create policy "mentor_details_select" on mentor_details
  for select using (status = 'approved' or auth.uid() = profile_id or is_admin());
create policy "mentor_details_update_own" on mentor_details
  for update using (auth.uid() = profile_id)
  with check (status = (select md.status from mentor_details md where md.profile_id = auth.uid()));
create policy "mentor_details_admin_update" on mentor_details
  for update using (is_admin());
create policy "mentor_details_insert_own" on mentor_details
  for insert with check (auth.uid() = profile_id);

-- niches
create policy "niches_select_all" on niches
  for select using (true);

-- connections
create policy "connections_select_participants" on connections
  for select using (auth.uid() = requester_id or auth.uid() = receiver_id);
create policy "connections_insert_requester" on connections
  for insert with check (auth.uid() = requester_id);
create policy "connections_update_receiver" on connections
  for update using (auth.uid() = receiver_id);

-- messages
create policy "messages_select_accepted_participants" on messages
  for select using (
    exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and c.status = 'accepted'
        and (c.requester_id = auth.uid() or c.receiver_id = auth.uid())
    )
  );
create policy "messages_insert_accepted_participants" on messages
  for insert with check (
    auth.uid() = sender_id and exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and c.status = 'accepted'
        and (c.requester_id = auth.uid() or c.receiver_id = auth.uid())
    )
  );

-- groups & group_members & group_posts
create policy "groups_select_authenticated" on groups
  for select using (auth.role() = 'authenticated');
create policy "groups_insert_approved_mentor" on groups
  for insert with check (
    auth.uid() = mentor_id and exists (
      select 1 from mentor_details md where md.profile_id = auth.uid() and md.status = 'approved'
    )
  );

create policy "group_members_select_authenticated" on group_members
  for select using (auth.role() = 'authenticated');
create policy "group_members_insert_self" on group_members
  for insert with check (auth.uid() = student_id);

create policy "group_posts_select_authenticated" on group_posts
  for select using (auth.role() = 'authenticated');
create policy "group_posts_insert_member_or_mentor" on group_posts
  for insert with check (
    auth.uid() = author_id and (
      exists (select 1 from groups g where g.id = group_id and g.mentor_id = auth.uid())
      or exists (select 1 from group_members gm where gm.group_id = group_id and gm.student_id = auth.uid())
    )
  );

-- availability
create policy "availability_select_all" on availability
  for select using (true);
create policy "availability_write_owner" on availability
  for all using (auth.uid() = mentor_id) with check (auth.uid() = mentor_id);

-- meetings
create policy "meetings_select_participants" on meetings
  for select using (auth.uid() = mentor_id or auth.uid() = student_id);
create policy "meetings_update_participants" on meetings
  for update using (auth.uid() = mentor_id or auth.uid() = student_id);

-- quizzes
create policy "quizzes_select_authenticated" on quizzes
  for select using (auth.role() = 'authenticated');
create policy "quizzes_insert_approved_mentor" on quizzes
  for insert with check (
    auth.uid() = author_id and exists (
      select 1 from mentor_details md where md.profile_id = auth.uid() and md.status = 'approved'
    )
  );
create policy "quiz_questions_select_authenticated" on quiz_questions
  for select using (auth.role() = 'authenticated');
create policy "quiz_attempts_select_own" on quiz_attempts
  for select using (auth.uid() = student_id);
create policy "quiz_attempts_insert_own" on quiz_attempts
  for insert with check (auth.uid() = student_id);

-- badges & certificates (publicly readable)
create policy "badges_select_public" on badges
  for select using (true);
create policy "certificates_select_public" on certificates
  for select using (true);

-- subscriptions (owner only read)
create policy "subscriptions_select_owner" on subscriptions
  for select using (auth.uid() = user_id);

-- institutions
create policy "institutions_select_authenticated" on institutions
  for select using (auth.role() = 'authenticated');

-- reports & blocks
create policy "reports_insert_reporter" on reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports_select_admin" on reports
  for select using (is_admin());

create policy "blocks_own" on blocks
  for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Trigger: recalculate mentor avg_reply_hours on connection status change
create or replace function handle_connection_response()
returns trigger
language plpgsql
security definer
as $$
declare
  avg_hrs numeric;
begin
  if new.status in ('accepted', 'declined') and old.status = 'pending' then
    new.responded_at := now();
    select round(avg(extract(epoch from (coalesce(responded_at, now()) - created_at)) / 3600.0)::numeric, 1)
    into avg_hrs
    from connections
    where receiver_id = new.receiver_id and status in ('accepted', 'declined');

    update mentor_details
    set avg_reply_hours = avg_hrs
    where profile_id = new.receiver_id;
  end if;
  return new;
end;
$$;

create trigger trg_connection_response
  before update on connections
  for each row
  execute function handle_connection_response();

-- Security Definer Function: book_slot(slot_id, topic)
create or replace function book_slot(p_slot_id uuid, p_topic text)
returns meetings
language plpgsql
security definer
as $$
declare
  v_slot availability%rowtype;
  v_sub subscriptions%rowtype;
  v_student_id uuid := auth.uid();
  v_connected boolean;
  v_meet_url text;
  v_meeting meetings%rowtype;
begin
  select * into v_slot from availability where id = p_slot_id for update;
  if not found or v_slot.is_booked then
    raise exception 'Slot is not available';
  end if;

  select exists (
    select 1 from connections
    where status = 'accepted'
      and ((requester_id = v_student_id and receiver_id = v_slot.mentor_id)
        or (requester_id = v_slot.mentor_id and receiver_id = v_student_id))
  ) into v_connected;
  if not v_connected then
    raise exception 'You must be connected with this mentor before booking';
  end if;

  select * into v_sub from subscriptions where user_id = v_student_id for update;
  if not found then
    raise exception 'Subscription record missing';
  end if;

  if v_sub.plan = 'institution' then
    null;
  elsif v_sub.plan in ('monthly', 'yearly') and v_sub.current_period_end > now() then
    null;
  elsif v_sub.plan = 'trial' and v_sub.trial_ends_at > now() and v_sub.free_sessions_left > 0 then
    update subscriptions set free_sessions_left = free_sessions_left - 1 where id = v_sub.id;
  else
    raise exception 'Upgrade required to book another 1:1 session';
  end if;

  update availability set is_booked = true where id = p_slot_id;
  v_meet_url := 'https://meet.jit.si/outspace-' || gen_random_uuid()::text;

  insert into meetings (mentor_id, student_id, slot_id, type, topic, meet_url, status)
  values (v_slot.mentor_id, v_student_id, p_slot_id, 'one_on_one', p_topic, v_meet_url, 'booked')
  returning * into v_meeting;

  return v_meeting;
end;
$$;

-- Security Definer Function: complete_meeting(meeting_id, notes)
create or replace function complete_meeting(p_meeting_id uuid, p_notes text)
returns certificates
language plpgsql
security definer
as $$
declare
  v_meeting meetings%rowtype;
  v_code text;
  v_cert certificates%rowtype;
  v_completed_count int;
  v_seminar_count int;
begin
  select * into v_meeting from meetings where id = p_meeting_id for update;
  if not found or v_meeting.mentor_id <> auth.uid() then
    raise exception 'Only the session mentor can complete this meeting';
  end if;
  if v_meeting.status = 'completed' then
    raise exception 'Meeting already completed';
  end if;

  update meetings set status = 'completed', mentor_notes = p_notes where id = p_meeting_id;
  update mentor_details set sessions_completed = coalesce(sessions_completed, 0) + 1 where profile_id = v_meeting.mentor_id;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into certificates (student_id, mentor_id, meeting_id, title, verify_code)
  values (v_meeting.student_id, v_meeting.mentor_id, p_meeting_id, coalesce(v_meeting.topic, '1:1 Career Mentorship Session'), v_code)
  returning * into v_cert;

  select count(*) into v_completed_count from meetings where student_id = v_meeting.student_id and status = 'completed';
  if v_completed_count >= 1 then
    insert into badges (student_id, type, label) values (v_meeting.student_id, 'first_session', 'First Session') on conflict do nothing;
  end if;
  if v_completed_count >= 3 then
    insert into badges (student_id, type, label) values (v_meeting.student_id, 'three_sessions', 'Committed Learner') on conflict do nothing;
  end if;

  select count(*) into v_seminar_count from meetings where student_id = v_meeting.student_id and status = 'completed' and type = 'group_seminar';
  if v_seminar_count >= 5 then
    insert into badges (student_id, type, label) values (v_meeting.student_id, 'seminar_5', 'Seminar Regular') on conflict do nothing;
  end if;

  return v_cert;
end;
$$;

-- Security Definer Function: redeem_institution_code(code)
create or replace function redeem_institution_code(p_code text)
returns subscriptions
language plpgsql
security definer
as $$
declare
  v_inst institutions%rowtype;
  v_sub subscriptions%rowtype;
begin
  select * into v_inst from institutions where upper(access_code) = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Invalid institution code';
  end if;
  if v_inst.seats_used >= v_inst.seats_total then
    raise exception 'No seats remaining for this institution code';
  end if;

  update institutions set seats_used = seats_used + 1 where id = v_inst.id;
  update subscriptions
    set plan = 'institution', institution_id = v_inst.id
    where user_id = auth.uid()
    returning * into v_sub;

  return v_sub;
end;
$$;
