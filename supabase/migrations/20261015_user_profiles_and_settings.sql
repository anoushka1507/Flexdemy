-- Flexdemy: User Profiles, Settings, and Data Management
-- Run this in the Supabase SQL editor for the project referenced by VITE_SUPABASE_URL.

-- 1. Create public.profiles table if it does not already exist
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  study_goal text,
  course_program text,
  institution text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Extend public.user_preferences with theme, speech, accessibility, and revision cadence
alter table if exists public.user_preferences
  add column if not exists theme text not null default 'system',
  add column if not exists speech_rate real not null default 1.0,
  add column if not exists speech_pitch real not null default 1.0,
  add column if not exists reduced_motion boolean not null default false,
  add column if not exists font_size text not null default 'standard',
  add column if not exists weak_topic_interval text not null default 'daily';

-- 3. Enable Row Level Security on profiles
alter table public.profiles enable row level security;

-- 4. RLS policies for public.profiles
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users manage their own profile'
  ) then
    create policy "Users manage their own profile"
      on public.profiles
      for all
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

-- 5. Revoke anon access and grant authenticated & service_role
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
