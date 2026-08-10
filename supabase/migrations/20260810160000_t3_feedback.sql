-- ============================================================================
-- SAPIENS — T3: tester feedback channel (pre-testing chunk)
-- ============================================================================
-- A lightweight in-app "Send feedback" pipe for the closed testing phase (and
-- beyond): members write a note, it lands here, the admin dashboard triages.
-- Not a support system — one table, no threads, no replies.

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  text       text        not null check (length(trim(text)) > 0),
  context    jsonb       not null default '{}'::jsonb,  -- {platform, version} from the client
  status     text        not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

create index feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Members write their own note and can re-read what they sent. status is
-- admin-only: no client update policy exists, and the column grant below
-- keeps even the owner from touching rows after sending.
create policy "feedback: owner inserts own"
  on public.feedback for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "feedback: owner reads own"
  on public.feedback for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke update, delete on public.feedback from authenticated, anon;
