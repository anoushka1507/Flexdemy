-- Track D: learner model persistence (per-topic mastery + cross-session
-- question dedup). Run this in the Supabase SQL editor for the project
-- referenced by VITE_SUPABASE_URL. Requires Supabase auth (auth.uid()).

create table if not exists public.topic_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  mastery_score numeric not null default 0.3,
  times_seen integer not null default 0,
  last_updated timestamptz not null default now(),
  unique (user_id, topic)
);

alter table public.topic_mastery enable row level security;

create policy "Users manage their own mastery rows"
  on public.topic_mastery
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.asked_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  question_text text not null,
  question_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, question_hash)
);

alter table public.asked_questions enable row level security;

create policy "Users manage their own asked-question log"
  on public.asked_questions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists asked_questions_user_topic_idx
  on public.asked_questions (user_id, topic);
