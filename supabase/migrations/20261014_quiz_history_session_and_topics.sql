-- Extend quiz_history so revisiting a past quiz from "Latest
-- Results" can actually show its topic mastery breakdown and
-- generate revision flashcards (needs the original session_id),
-- not just the summary score it already had.

alter table public.quiz_history
  add column if not exists session_id text,
  add column if not exists topic_breakdown jsonb;
