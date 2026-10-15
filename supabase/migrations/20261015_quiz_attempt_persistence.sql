-- Track D: Production Quiz Attempt Persistence & History Integrity
-- Ensures completed quiz attempts preserve all required attempt metadata,
-- question-level outcomes, answers, and timestamps idempotently.

-- 1. Ensure public.quiz_history has all necessary columns
alter table if exists public.quiz_history
  add column if not exists attempt_id text,
  add column if not exists user_answers jsonb,
  add column if not exists question_outcomes jsonb,
  add column if not exists topic_breakdown jsonb,
  add column if not exists session_id text,
  add column if not exists status text not null default 'completed';

-- 2. Idempotency index on user_id and quiz_id (or attempt_id)
create unique index if not exists quiz_history_user_quiz_uidx
  on public.quiz_history (user_id, quiz_id);

-- 3. Row Level Security policies: Authenticated users manage only their own quiz history
alter table public.quiz_history enable row level security;

drop policy if exists "Users manage their own quiz history" on public.quiz_history;

create policy "Users manage their own quiz history"
  on public.quiz_history
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Permissions
grant select, insert, update, delete on public.quiz_history to authenticated;
grant all on public.quiz_history to service_role;
