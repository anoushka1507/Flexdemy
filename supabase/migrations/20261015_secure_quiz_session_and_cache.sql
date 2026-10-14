-- Track D Security Hardening: Revoke unrestricted anonymous access to quiz sessions
-- and add durable material cache for serverless execution.

-- 1. Alter public.quiz_sessions to bind sessions to users and add versioning
alter table if exists public.quiz_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists version integer not null default 1,
  add column if not exists created_at timestamptz not null default now();

-- 2. Drop the insecure permissive policy
drop policy if exists "Anyone can read/write quiz sessions" on public.quiz_sessions;

-- 3. Ensure Row Level Security is enabled
alter table public.quiz_sessions enable row level security;

-- 4. Secure RLS policies: Authenticated users can only read and write their own sessions
create policy "Users manage their own quiz sessions"
  on public.quiz_sessions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Explicitly revoke direct table access from anonymous clients (anon key)
-- Server-side backend uses service_role key to manage sessions across cold starts safely.
revoke all on public.quiz_sessions from anon;
grant select, insert, update, delete on public.quiz_sessions to authenticated;
grant all on public.quiz_sessions to service_role;

-- 6. Durable material cache for Vercel cold starts (upload-once, reuse across serverless instances)
create table if not exists public.material_cache (
  content_hash text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  material_chunks jsonb not null,
  concept_drafts jsonb not null,
  material_content_type text,
  material_filename text,
  created_at timestamptz not null default now()
);

alter table public.material_cache enable row level security;

create policy "Users manage their own cached materials"
  on public.material_cache
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.material_cache from anon;
grant select, insert, update, delete on public.material_cache to authenticated;
grant all on public.material_cache to service_role;
