-- ============================================================================
-- Fala! — Brazilian Portuguese learning app — Supabase schema
-- Run this whole file once in the Supabase SQL editor (Dashboard → SQL Editor).
-- ============================================================================

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'master')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The FIRST profile ever created becomes the master profile automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    case when not exists (select 1 from public.profiles) then 'master' else 'user' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by RLS policies (security definer avoids recursive RLS).
create or replace function public.is_master()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'master'
  );
$$;

-- ------------------------------------------------------------------- words
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  portuguese text not null,
  english text not null default '',
  pos text not null default 'noun',
  category text not null default 'general',
  is_phrase boolean not null default false,
  image_url text,
  notes text,
  status text not null default 'unknown'
    check (status in ('unknown', 'learning', 'trouble', 'recognize', 'learned')),
  times_seen integer not null default 0,
  times_correct integer not null default 0,
  last_reviewed timestamptz,
  status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, portuguese)
);

create index if not exists words_user_idx on public.words (user_id, status);
create index if not exists words_created_idx on public.words (user_id, created_at desc);

-- ----------------------------------------------- shared AI word-info cache
-- One row per word across ALL users: the AI is called once, everyone reuses it.
create table if not exists public.word_info (
  word text primary key,
  info jsonb not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- stories
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- activity tracking
create table if not exists public.activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  cards integer not null default 0,
  primary key (user_id, day)
);

create or replace function public.bump_activity(p_day date)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.activity (user_id, day, cards)
  values (auth.uid(), p_day, 1)
  on conflict (user_id, day) do update set cards = activity.cards + 1;
$$;

-- ---------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.words enable row level security;
alter table public.word_info enable row level security;
alter table public.stories enable row level security;
alter table public.activity enable row level security;

-- profiles: read own; master reads all; update own (but not the role column)
drop policy if exists "profiles_select_own_or_master" on public.profiles;
create policy "profiles_select_own_or_master" on public.profiles
  for select using (id = auth.uid() or public.is_master());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

-- words: owner has full CRUD; master can read everyone's
drop policy if exists "words_select" on public.words;
create policy "words_select" on public.words
  for select using (user_id = auth.uid() or public.is_master());

drop policy if exists "words_insert" on public.words;
create policy "words_insert" on public.words
  for insert with check (user_id = auth.uid());

drop policy if exists "words_update" on public.words;
create policy "words_update" on public.words
  for update using (user_id = auth.uid());

drop policy if exists "words_delete" on public.words;
create policy "words_delete" on public.words
  for delete using (user_id = auth.uid());

-- word_info: shared cache — any signed-in user can read or contribute
drop policy if exists "word_info_select" on public.word_info;
create policy "word_info_select" on public.word_info
  for select using (auth.role() = 'authenticated');

drop policy if exists "word_info_insert" on public.word_info;
create policy "word_info_insert" on public.word_info
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "word_info_update" on public.word_info;
create policy "word_info_update" on public.word_info
  for update using (auth.role() = 'authenticated');

-- stories: owner CRUD; master read
drop policy if exists "stories_select" on public.stories;
create policy "stories_select" on public.stories
  for select using (user_id = auth.uid() or public.is_master());

drop policy if exists "stories_insert" on public.stories;
create policy "stories_insert" on public.stories
  for insert with check (user_id = auth.uid());

drop policy if exists "stories_delete" on public.stories;
create policy "stories_delete" on public.stories
  for delete using (user_id = auth.uid());

-- activity: own rows (writes go through bump_activity)
drop policy if exists "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select using (user_id = auth.uid() or public.is_master());

-- ---------------------------------------------------------------- storage
-- Public-read buckets: shared audio library + word images.
insert into storage.buckets (id, name, public)
values ('word-audio', 'word-audio', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('word-images', 'word-images', true)
on conflict (id) do nothing;

drop policy if exists "audio_read" on storage.objects;
create policy "audio_read" on storage.objects
  for select using (bucket_id = 'word-audio');

drop policy if exists "audio_write" on storage.objects;
create policy "audio_write" on storage.objects
  for insert with check (bucket_id = 'word-audio' and auth.role() = 'authenticated');

drop policy if exists "audio_update" on storage.objects;
create policy "audio_update" on storage.objects
  for update using (bucket_id = 'word-audio' and auth.role() = 'authenticated');

drop policy if exists "images_read" on storage.objects;
create policy "images_read" on storage.objects
  for select using (bucket_id = 'word-images');

drop policy if exists "images_write" on storage.objects;
create policy "images_write" on storage.objects
  for insert with check (bucket_id = 'word-images' and auth.role() = 'authenticated');

-- ============================================================================
-- To promote another user to master later, run:
--   update public.profiles set role = 'master' where email = 'someone@example.com';
-- ============================================================================

-- ============================================================================
-- v2: teachers & classes, homework, notifications, messages, mini lessons,
--     leaderboard, profile pictures.
-- Safe to run on top of v1 (idempotent).
-- ============================================================================

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists teacher_id uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists teacher_code text unique;

-- allow the 'teacher' role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'teacher', 'master'));

-- New signups may declare themselves teachers (never masters).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  v_role := case
    when not exists (select 1 from public.profiles) then 'master'
    when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher'
    else 'user'
  end;
  insert into public.profiles (id, email, display_name, role, teacher_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_role,
    case when v_role in ('teacher', 'master')
      then upper(substr(md5(gen_random_uuid()::text), 1, 6)) end
  );
  return new;
end;
$$;

-- Give pre-existing teacher/master rows a class code
update public.profiles
set teacher_code = upper(substr(md5(gen_random_uuid()::text), 1, 6))
where role in ('teacher', 'master') and teacher_code is null;

create or replace function public.is_teacher_of(student uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles where id = student and teacher_id = auth.uid()
  );
$$;

-- Join/leave a class by teacher code (students call these)
create or replace function public.join_class(p_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_teacher public.profiles%rowtype;
begin
  select * into v_teacher from public.profiles
    where teacher_code = upper(trim(p_code)) and role in ('teacher', 'master');
  if v_teacher.id is null then
    raise exception 'No class found with that code';
  end if;
  if v_teacher.id = auth.uid() then
    raise exception 'You cannot join your own class';
  end if;
  update public.profiles set teacher_id = v_teacher.id where id = auth.uid();
  return coalesce(v_teacher.display_name, v_teacher.email);
end;
$$;

create or replace function public.leave_class()
returns void
language sql security definer set search_path = public
as $$
  update public.profiles set teacher_id = null where id = auth.uid();
$$;

-- Teachers can see their students' profiles (extend the select policy)
drop policy if exists "profiles_select_own_or_master" on public.profiles;
create policy "profiles_select_own_or_master" on public.profiles
  for select using (id = auth.uid() or public.is_master() or teacher_id = auth.uid());

-- Teachers can read their students' words and activity
drop policy if exists "words_select" on public.words;
create policy "words_select" on public.words
  for select using (user_id = auth.uid() or public.is_master() or public.is_teacher_of(user_id));

drop policy if exists "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select using (user_id = auth.uid() or public.is_master() or public.is_teacher_of(user_id));

-- ------------------------------------------------------------- assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  instructions text,
  words jsonb not null default '[]'::jsonb,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_students (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  words_added_at timestamptz,
  completed_at timestamptz,
  primary key (assignment_id, student_id)
);

alter table public.assignments enable row level security;
alter table public.assignment_students enable row level security;

drop policy if exists "assignments_teacher_all" on public.assignments;
create policy "assignments_teacher_all" on public.assignments
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "assignments_student_select" on public.assignments;
create policy "assignments_student_select" on public.assignments
  for select using (
    exists (select 1 from public.assignment_students s
            where s.assignment_id = id and s.student_id = auth.uid())
  );

drop policy if exists "assignment_students_teacher" on public.assignment_students;
create policy "assignment_students_teacher" on public.assignment_students
  for all using (
    exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = auth.uid())
  ) with check (
    exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = auth.uid())
    and public.is_teacher_of(student_id)
  );

drop policy if exists "assignment_students_self_select" on public.assignment_students;
create policy "assignment_students_self_select" on public.assignment_students
  for select using (student_id = auth.uid());

drop policy if exists "assignment_students_self_update" on public.assignment_students;
create policy "assignment_students_self_update" on public.assignment_students
  for update using (student_id = auth.uid());

-- ----------------------------------------------------------- notifications
-- Kept after being read (read_at is set, rows are never auto-deleted).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- You can notify yourself, your students, or your teacher.
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (
    user_id = auth.uid()
    or public.is_teacher_of(user_id)
    or (select teacher_id from public.profiles where id = auth.uid()) = user_id
  );

-- ---------------------------------------------------------------- messages
-- Teacher <-> student chat (the floating chat head).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_pair_idx on public.messages (from_id, to_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    from_id = auth.uid()
    and (
      public.is_teacher_of(to_id)
      or (select teacher_id from public.profiles where id = auth.uid()) = to_id
    )
  );

drop policy if exists "messages_update_read" on public.messages;
create policy "messages_update_read" on public.messages
  for update using (to_id = auth.uid());

-- ------------------------------------------------------------ mini lessons
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  topic text,
  source text not null default 'generated' check (source in ('generated', 'chat')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

drop policy if exists "lessons_own" on public.lessons;
create policy "lessons_own" on public.lessons
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------- leaderboard
-- Aggregate, opt-out-free stats across all users (display name + points only).
create or replace function public.leaderboard()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  learned bigint,
  week_cards bigint,
  points bigint
)
language sql security definer set search_path = public stable
as $$
  select
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name,
    p.avatar_url,
    coalesce(w.learned, 0) as learned,
    coalesce(a.week_cards, 0) as week_cards,
    coalesce(w.learned, 0) * 10 + coalesce(a.total_cards, 0) as points
  from public.profiles p
  left join (
    select user_id, count(*) filter (where status = 'learned') as learned
    from public.words group by user_id
  ) w on w.user_id = p.id
  left join (
    select user_id,
      sum(cards) as total_cards,
      sum(cards) filter (where day > current_date - 7) as week_cards
    from public.activity group by user_id
  ) a on a.user_id = p.id
  order by points desc
  limit 50;
$$;

-- ---------------------------------------------------------------- avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write" on storage.objects;
create policy "avatars_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- v2.1 — review fixes: class-scoped leaderboard, students can see their
-- teacher's name, shared caches are no longer overwritable by anyone.
-- ============================================================================

-- Students may read their own teacher's profile row (name/avatar for chat).
drop policy if exists "profiles_select_own_or_master" on public.profiles;
create policy "profiles_select_own_or_master" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_master()
    or teacher_id = auth.uid()
    or id = (select teacher_id from public.profiles p2 where p2.id = auth.uid())
  );

-- Leaderboard scoped to YOUR CLASS (you + classmates + your teacher).
-- Users with no class see only themselves; masters see everyone.
create or replace function public.leaderboard()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  learned bigint,
  week_cards bigint,
  points bigint
)
language sql security definer set search_path = public stable
as $$
  with me as (
    select p.id,
      p.role,
      coalesce(p.teacher_id, case when p.role in ('teacher','master') then p.id end) as class_id
    from public.profiles p where p.id = auth.uid()
  )
  select
    p.id,
    coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name,
    p.avatar_url,
    coalesce(w.learned, 0) as learned,
    coalesce(a.week_cards, 0) as week_cards,
    coalesce(w.learned, 0) * 10 + coalesce(a.total_cards, 0) as points
  from public.profiles p
  cross join me
  left join (
    select user_id, count(*) filter (where status = 'learned') as learned
    from public.words group by user_id
  ) w on w.user_id = p.id
  left join (
    select user_id,
      sum(cards) as total_cards,
      sum(cards) filter (where day > current_date - 7) as week_cards
    from public.activity group by user_id
  ) a on a.user_id = p.id
  where p.id = auth.uid()
     or me.role = 'master'
     or (me.class_id is not null and (p.teacher_id = me.class_id or p.id = me.class_id))
  order by points desc
  limit 50;
$$;

-- Shared caches: first write wins for regular users; only masters may replace
-- (stops one student overwriting everyone's audio for a word).
drop policy if exists "audio_update" on storage.objects;
create policy "audio_update" on storage.objects
  for update using (bucket_id = 'word-audio' and public.is_master());

drop policy if exists "word_info_update" on public.word_info;
create policy "word_info_update" on public.word_info
  for update using (public.is_master());
