-- Quiz history: completed-quiz summaries, so the dashboard (quizzes
-- attempted, average score, recent quizzes, etc.) survives a page
-- refresh instead of resetting to empty every time (it was only
-- ever held in React state before this).

create table if not exists public.quiz_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id text not null,
  quiz_title text not null,
  topic text not null default '',
  difficulty text not null default 'Medium',
  score_percentage numeric not null,
  total_questions integer not null,
  correct_answers_count integer not null,
  completed_at timestamptz not null default now()
);

alter table public.quiz_history enable row level security;

create policy "Users manage their own quiz history"
  on public.quiz_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists quiz_history_user_completed_idx
  on public.quiz_history (user_id, completed_at desc);
