-- ============================================================
-- SAVED LEARNING PATHS & FLASHCARD DECKS MIGRATION
-- ============================================================

-- 1. SAVED LEARNING PATHS TABLE
create table if not exists public.saved_learning_paths (
    id text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    collection_id text default '',
    source_files jsonb default '[]'::jsonb,
    concepts jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_saved_learning_paths_user_id
    on public.saved_learning_paths(user_id, updated_at desc);

alter table public.saved_learning_paths enable row level security;

drop policy if exists "Users can view their own saved learning paths" on public.saved_learning_paths;
create policy "Users can view their own saved learning paths"
    on public.saved_learning_paths
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own saved learning paths" on public.saved_learning_paths;
create policy "Users can insert their own saved learning paths"
    on public.saved_learning_paths
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved learning paths" on public.saved_learning_paths;
create policy "Users can update their own saved learning paths"
    on public.saved_learning_paths
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved learning paths" on public.saved_learning_paths;
create policy "Users can delete their own saved learning paths"
    on public.saved_learning_paths
    for delete
    using (auth.uid() = user_id);


-- 2. FLASHCARD DECKS TABLE
create table if not exists public.flashcard_decks (
    deck_id text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    topic text not null default '',
    collection_id text default '',
    cards jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_flashcard_decks_user_id
    on public.flashcard_decks(user_id, updated_at desc);

alter table public.flashcard_decks enable row level security;

drop policy if exists "Users can view their own flashcard decks" on public.flashcard_decks;
create policy "Users can view their own flashcard decks"
    on public.flashcard_decks
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own flashcard decks" on public.flashcard_decks;
create policy "Users can insert their own flashcard decks"
    on public.flashcard_decks
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own flashcard decks" on public.flashcard_decks;
create policy "Users can update their own flashcard decks"
    on public.flashcard_decks
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own flashcard decks" on public.flashcard_decks;
create policy "Users can delete their own flashcard decks"
    on public.flashcard_decks
    for delete
    using (auth.uid() = user_id);


-- 3. FLASHCARD REVIEWS TABLE (for spaced-repetition tracking)
create table if not exists public.flashcard_reviews (
    id text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    deck_id text not null,
    card_id text not null,
    rating text not null,
    interval_days int not null default 1,
    reviewed_at timestamptz not null default now()
);

create index if not exists idx_flashcard_reviews_user_deck
    on public.flashcard_reviews(user_id, deck_id, reviewed_at desc);

alter table public.flashcard_reviews enable row level security;

drop policy if exists "Users can view their own flashcard reviews" on public.flashcard_reviews;
create policy "Users can view their own flashcard reviews"
    on public.flashcard_reviews
    for select
    using (auth.uid() = user_id);

drop policy if exists "Users can record their own flashcard reviews" on public.flashcard_reviews;
create policy "Users can record their own flashcard reviews"
    on public.flashcard_reviews
    for insert
    with check (auth.uid() = user_id);
