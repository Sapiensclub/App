-- ============================================================================
-- SAPIENS — Phase 7, Chunk 1: admin allowlist
-- ============================================================================
-- The Trust & Safety dashboard (Next.js /admin) authenticates admins with a
-- normal Supabase account, then checks this allowlist server-side (via the
-- service role). Only listed users may enter. Add yourself with, in the SQL
-- editor:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- ============================================================================
create table if not exists public.admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- RLS on with NO policies: unreadable/unwritable to normal clients. The admin
-- dashboard reads it with the service role (server-side only), which bypasses
-- RLS. This keeps the allowlist invisible to the mobile app entirely.
alter table public.admins enable row level security;
