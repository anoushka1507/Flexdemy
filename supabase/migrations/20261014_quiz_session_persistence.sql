-- Track D: durable quiz-session storage.
--
-- The backend is deployed as Vercel serverless functions, which do
-- NOT share in-process memory across invocations/instances. Active
-- quiz sessions were being held only in a plain Python dict, so a
-- redeploy or Vercel spinning up a new instance mid-quiz would wipe
-- all in-progress sessions ("Adaptive quiz session not found").
--
-- This table makes that state durable. Sessions aren't tied to a
-- logged-in user — anyone holding the session_id can continue a
-- quiz, same capability-token model the in-memory dict already had
-- — so RLS here is permissive rather than user-scoped.

create table if not exists public.quiz_sessions (
  session_id text primary key,
  session_data jsonb,
  material_chunks jsonb,
  material_embeddings jsonb,
  material_raw_file_b64 text,
  material_content_type text,
  material_filename text,
  updated_at timestamptz not null default now()
);

alter table public.quiz_sessions enable row level security;

create policy "Anyone can read/write quiz sessions"
  on public.quiz_sessions
  for all
  using (true)
  with check (true);
