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
