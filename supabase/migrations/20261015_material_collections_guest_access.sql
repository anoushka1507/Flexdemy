-- Enable guest and unassigned collection access for anon key
-- Ensures Course Map generation and concept extraction succeed reliably
-- even when students are not signed in or service role key is absent in the environment.

create policy "Allow anon select on guest collections"
  on public.material_collections
  for select
  to anon
  using (user_id is null);

create policy "Allow anon insert on guest collections"
  on public.material_collections
  for insert
  to anon
  with check (user_id is null);

create policy "Allow anon update on guest collections"
  on public.material_collections
  for update
  to anon
  using (user_id is null)
  with check (user_id is null);

grant select, insert, update on public.material_collections to anon;

create policy "Allow anon select on guest material cache"
  on public.material_cache
  for select
  to anon
  using (user_id is null);

create policy "Allow anon insert on guest material cache"
  on public.material_cache
  for insert
  to anon
  with check (user_id is null);

grant select, insert, update on public.material_cache to anon;
