-- Track D: Persistent Learner Profiles, Preferences, and Idempotent Quiz History
-- Run this in the Supabase SQL editor for the project referenced by VITE_SUPABASE_URL.

-- 1. Extend quiz_history with question outcomes and unique idempotency constraint
alter table if exists public.quiz_history
  add column if not exists question_outcomes jsonb;

create unique index if not exists quiz_history_user_quiz_uidx
  on public.quiz_history (user_id, quiz_id);

-- 2. Create user_preferences table for persistent learner settings and study plans
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'english',
  explanation_style text not null default 'concise',
  dyslexia_mode boolean not null default false,
  exam_date text,
  daily_minutes integer not null default 45,
  saved_schedule jsonb,
  completed_tasks jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Enable Row Level Security
alter table public.user_preferences enable row level security;

-- 4. Secure RLS policies
create policy "Users manage their own preferences"
  on public.user_preferences
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Revoke anon access and grant authenticated & service_role
revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
