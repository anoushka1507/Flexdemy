-- Multi-File Unified Ingestion: Material Collections Persistence
-- Stores normalized multi-document collections for cross-file quizzes,
-- grounded tutoring, and course prerequisite DAG generation.

create table if not exists public.material_collections (
  collection_id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  collection_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for user query performance
create index if not exists idx_material_collections_user_id
  on public.material_collections (user_id);

alter table public.material_collections enable row level security;

-- Authenticated users can only read and write their own collections
create policy "Users manage their own collections"
  on public.material_collections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Restrict anon key, grant service_role full control for backend operations
revoke all on public.material_collections from anon;
grant select, insert, update, delete on public.material_collections to authenticated;
grant all on public.material_collections to service_role;
