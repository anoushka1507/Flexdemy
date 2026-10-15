-- Adjustable Dyslexia Mode reading preferences, so a student's chosen
-- font, text size, line/letter spacing, and background theme persist
-- across devices and sessions, not just in this browser's state.

alter table if exists public.user_preferences
  add column if not exists dyslexia_font text not null default 'standard',
  add column if not exists dyslexia_text_size integer not null default 18,
  add column if not exists dyslexia_line_spacing real not null default 1.65,
  add column if not exists dyslexia_letter_spacing real not null default 0.02,
  add column if not exists dyslexia_background text not null default 'warm';
