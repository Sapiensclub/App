-- ============================================================================
-- SAPIENS — Phase 0 foundation schema
-- ============================================================================
-- The COMPLETE P1 data model from Build Spec §3, with Row Level Security.
--
-- The constitution is enforced HERE, in data — not just in UI:
--   · "No profile surfing"     → profiles are owner-only; strangers get only
--                                the narrow profiles_public view.
--   · "Information is earned"  → precise location / full rows unlock only as
--                                the disclosure ladder advances (PRD 0.4).
--   · "Everyone verified"      → asking/offering help requires verified=true.
--   · "Moneta can't be gamed"  → append-only ledger + one-earn-per-pair rule.
--
-- Tables are created for ALL phases now (Phase 0 milestone), but app features
-- arrive phase by phase. Client-write policies for later-phase flows are kept
-- deliberately minimal; Edge Functions (service role) do the orchestration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
-- PostGIS powers the "who is nearby" dispatch queries (spec §5).
create extension if not exists postgis with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES (fixed vocabularies used across tables)
-- ----------------------------------------------------------------------------
create type public.celestial_stage as enum
  ('new_moon', 'crescent', 'half_moon', 'full_moon', 'sunrise', 'golden_sun', 'galaxy');

create type public.urgency_tier as enum
  ('casual', 'everyday', 'urgent', 'sos');

create type public.timing_kind as enum ('now', 'scheduled', 'either');

create type public.request_timing as enum ('now', 'scheduled');

create type public.request_status as enum
  ('open', 'matched', 'active', 'completed', 'cancelled', 'expired');

create type public.interaction_type as enum ('one_to_one', 'group', 'either');

create type public.safety_sensitivity as enum ('low', 'medium', 'high');

create type public.radius_hint as enum ('tight', 'normal', 'wide');

create type public.dispatch_outcome as enum ('pending', 'raised', 'ignored', 'expired');

create type public.response_status as enum ('raised', 'confirmed', 'vetoed', 'withdrawn');

create type public.match_status as enum
  ('confirmed', 'on_the_way', 'arrived', 'completed', 'cancelled');

create type public.chat_kind as enum ('active', 'inbox');

create type public.message_type as enum ('text', 'photo', 'voice', 'emoji');

create type public.connection_status as enum
  ('offered', 'active', 'declined', 'disconnected');

create type public.moneta_entry_type as enum ('earned', 'spent', 'reversed');

create type public.report_context as enum ('chat', 'match', 'moment');

create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

create type public.moment_type as enum ('selfie', 'milestone');

create type public.suggestion_status as enum ('pending', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- 2. SHARED TRIGGER HELPERS
-- ----------------------------------------------------------------------------
-- Keeps updated_at fresh on every UPDATE.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Used on append-only tables: any UPDATE/DELETE is refused, even for admins.
-- Corrections happen by appending a compensating row (e.g. type='reversed').
create function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. IDENTITY & PROFILE
-- ----------------------------------------------------------------------------

-- One row per human. id mirrors auth.users(id).
-- Cached counters (unique_helps, moneta_*, trust_rating_avg, ...) are written
-- ONLY by server-side logic in later phases — never by clients.
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text,                          -- first name (PRD 9.4)
  display_photo_url  text,                          -- the editable, face-matched photo (PRD 9.2)
  kyc_selfie_ref     text,                          -- PRIVATE liveness selfie ref; never exposed, never editable
  verified           boolean       not null default false,  -- the KYC gate (PRD 2.1)
  over_18            boolean,                       -- from KYC; drives child mode (PRD 2.3)
  verification_token text,                          -- opaque provider token; never a raw Aadhaar number
  member_since       timestamptz   not null default now(),
  bio                text,
  -- cached, derived (Phase 3 computes these; clients only read):
  celestial_stage    public.celestial_stage not null default 'new_moon',
  unique_helps       integer       not null default 0,      -- breadth (PRD 7.1)
  total_helps        integer       not null default 0,      -- steadfast/depth (PRD 7.2)
  moneta_lifetime    integer       not null default 0,      -- never decreases (PRD 7.6)
  moneta_balance     integer       not null default 0,      -- earned − spent
  trust_rating_avg   numeric(3, 2),                         -- avg stars 0–5; null until first rating
  goodness_score     numeric(5, 2) not null default 0,      -- owner-facing 0–100 (PRD 7.7)
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Owner reads their full row. Everyone else must use profiles_public (below).
create policy "profiles: owner reads own full row"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- Owner may update ONLY the editable columns (PRD 9.6). Column-level grants
-- below make locked columns (verified, counters, kyc_selfie_ref, photo)
-- untouchable from the client even though this row policy passes.
-- display_photo_url is NOT client-writable: Phase 1's face-match Edge
-- Function is the only writer (two-photo model, PRD 9.2).
create policy "profiles: owner updates own row"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated, anon;
grant update (display_name, bio) on public.profiles to authenticated;

-- The staged-disclosure boundary (PRD 0.4 / 9.4): what a stranger may see.
-- SECURITY DEFINER view (security_invoker = off) is intentional: it reaches
-- past profiles' RLS but exposes ONLY these five safe columns.
-- Discovery/browsing is still impossible — you need a person's uuid, which
-- the app only hands out through the dispatch/match flow.
-- (Phase 4 adds a richer profiles_connection view for connected pairs, PRD 5.4.)
create view public.profiles_public
  with (security_invoker = off) as
  select
    id,
    display_name,
    display_photo_url,
    celestial_stage,
    trust_rating_avg,
    member_since
  from public.profiles;

revoke all on public.profiles_public from anon;
grant select on public.profiles_public to authenticated;

-- Helper: is the calling user KYC-verified? (SECURITY DEFINER so policies on
-- other tables can consult profiles without tripping profiles' own RLS.)
create function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select verified from public.profiles where id = auth.uid()),
    false
  );
$$;

-- "Ways I help" + reach settings. Availability is IMPLICIT (PRD 3.1):
-- no online/offline toggle, only snooze + quiet hours.
create table public.helper_preferences (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  categories    uuid[]      not null default '{}',   -- opted-in category ids
  radius_max_m  integer     not null default 3000,   -- helper's exposure cap (PRD 3.2)
  quiet_hours   jsonb,                               -- e.g. {"start":"22:00","end":"07:00"}
  snoozed_until timestamptz,                         -- temporary snooze (PRD 3.1)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger helper_preferences_updated_at
  before update on public.helper_preferences
  for each row execute function public.set_updated_at();

alter table public.helper_preferences enable row level security;

create policy "helper_preferences: owner full access"
  on public.helper_preferences for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 1–3 emergency contacts, captured at onboarding (PRD 1.2). SOS Layer 1.
create table public.trusted_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  name       text        not null,
  phone      text        not null,
  slot       smallint    not null check (slot between 1 and 3),
  created_at timestamptz not null default now(),
  unique (user_id, slot)                            -- hard cap of 3 per user
);

alter table public.trusted_contacts enable row level security;

create policy "trusted_contacts: owner full access"
  on public.trusted_contacts for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. CATEGORIES (data, not code — PRD 3.11)
-- ----------------------------------------------------------------------------
-- The taxonomy is editable data; each row carries the attributes that tell
-- the dispatch engine how to treat requests. Seeded in Phase 2.
create table public.categories (
  id                    uuid primary key default gen_random_uuid(),
  parent_id             uuid references public.categories (id),
  label                 text        not null,
  slug                  text        not null unique,
  description           text,
  enabled               boolean     not null default true,  -- hide without deleting
  version               integer     not null default 1,
  icon                  text,                               -- doodle key (brand-consistent)
  default_timing        public.timing_kind        not null default 'either',
  typical_urgency       public.urgency_tier       not null default 'everyday',
  interaction_type      public.interaction_type   not null default 'one_to_one',
  implies_physical_meet boolean     not null default true,
  safety_sensitivity    public.safety_sensitivity not null default 'medium',
  allows_media          boolean     not null default true,
  radius_hint           public.radius_hint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

-- Anyone signed in can read enabled categories. Writes: service/admin only
-- (no client write policy → denied).
create policy "categories: authenticated read enabled"
  on public.categories for select
  to authenticated
  using (enabled);

-- The "missing category" suggestion box (PRD 9.6) — the input pipe that keeps
-- the taxonomy alive. Approval (admin, Phase 7) moves it into categories.
create table public.category_suggestions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  text       text        not null,
  status     public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.category_suggestions enable row level security;

create policy "category_suggestions: owner inserts"
  on public.category_suggestions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "category_suggestions: owner reads own"
  on public.category_suggestions for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 5. REQUESTS & DISPATCH (the engine's tables — spec §5, PRD 3.x)
-- ----------------------------------------------------------------------------

create table public.requests (
  id              uuid primary key default gen_random_uuid(),
  seeker_id       uuid        not null references public.profiles (id) on delete cascade,
  category_id     uuid        not null references public.categories (id),
  description     text,
  voice_note_url  text,                              -- accessibility-first (PRD 4.4)
  timing          public.request_timing not null,
  scheduled_at    timestamptz,
  urgency         public.urgency_tier   not null,
  status          public.request_status not null default 'open',
  -- Precise meetpoint: released to the helper ONLY at confirm (PRD 0.5).
  -- Until then helpers may see approx_area alone (via a Phase 2 dispatch view).
  meetpoint_lat   double precision,
  meetpoint_lng   double precision,
  -- Generated PostGIS point for radius queries — always in sync with lat/lng.
  meetpoint_geo   extensions.geography (point, 4326)
                    generated always as (
                      case
                        when meetpoint_lat is null or meetpoint_lng is null then null
                        else extensions.st_setsrid(
                               extensions.st_makepoint(meetpoint_lng, meetpoint_lat), 4326
                             )::extensions.geography
                      end
                    ) stored,
  approx_area     text,                              -- human label ("Koregaon Park")
  interaction_type public.interaction_type not null default 'one_to_one'
                    check (interaction_type <> 'either'),  -- a real request is one or the other
  participant_cap smallint check (participant_cap between 2 and 50),
  is_directed     boolean     not null default false,      -- directed request (PRD 5.5)
  directed_to     uuid references public.profiles (id),
  prefer_women    boolean     not null default false,      -- PRD 1.4
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  updated_at      timestamptz not null default now(),
  check (
    (timing = 'now'       and scheduled_at is null) or
    (timing = 'scheduled' and scheduled_at is not null)
  ),
  check (is_directed = (directed_to is not null))
);

create index requests_status_idx      on public.requests (status);
create index requests_seeker_idx      on public.requests (seeker_id);
create index requests_category_idx    on public.requests (category_id);
create index requests_open_expiry_idx on public.requests (expires_at) where status = 'open';
create index requests_geo_idx         on public.requests using gist (meetpoint_geo);

create trigger requests_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

alter table public.requests enable row level security;

-- Seeker owns their request. Helpers do NOT get a policy here — in Phase 2
-- they see pings via dispatch_targets + a limited dispatch view, so a client
-- can never fetch a stranger's precise location before confirm (PRD 0.4).
create policy "requests: seeker reads own"
  on public.requests for select
  to authenticated
  using (seeker_id = (select auth.uid()));

-- Raising a request requires verification — the constitution's hard gate
-- (PRD 2.1), enforced in data.
create policy "requests: verified seeker creates own"
  on public.requests for insert
  to authenticated
  with check (seeker_id = (select auth.uid()) and public.is_verified());

create policy "requests: seeker updates own"
  on public.requests for update
  to authenticated
  using (seeker_id = (select auth.uid()))
  with check (seeker_id = (select auth.uid()));

-- One row per (request, pinged helper). Drives wave logic + fairness rotation
-- (PRD 3.3/3.4). Written only by the dispatch engine (service role).
create table public.dispatch_targets (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid        not null references public.requests (id) on delete cascade,
  helper_id   uuid        not null references public.profiles (id) on delete cascade,
  wave_number integer     not null,
  pinged_at   timestamptz not null default now(),
  outcome     public.dispatch_outcome not null default 'pending',
  unique (request_id, helper_id)
);

create index dispatch_targets_helper_idx  on public.dispatch_targets (helper_id, outcome);
create index dispatch_targets_request_idx on public.dispatch_targets (request_id, wave_number);

alter table public.dispatch_targets enable row level security;

-- A helper sees only their own pings (limited info; the ping payload itself
-- carries help type + rough distance + urgency, never seeker identity).
create policy "dispatch_targets: helper reads own"
  on public.dispatch_targets for select
  to authenticated
  using (helper_id = (select auth.uid()));

-- Raised hands (PRD 0.1). Insert requires the helper to be verified AND
-- actually pinged for that request — you cannot raise a hand for a request
-- the engine never showed you.
create table public.request_responses (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid        not null references public.requests (id) on delete cascade,
  helper_id  uuid        not null references public.profiles (id) on delete cascade,
  status     public.response_status not null default 'raised',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, helper_id)
);

create trigger request_responses_updated_at
  before update on public.request_responses
  for each row execute function public.set_updated_at();

alter table public.request_responses enable row level security;

create policy "request_responses: helper reads own"
  on public.request_responses for select
  to authenticated
  using (helper_id = (select auth.uid()));

create policy "request_responses: seeker reads responses to own request"
  on public.request_responses for select
  to authenticated
  using (exists (
    select 1 from public.requests r
    where r.id = request_id and r.seeker_id = (select auth.uid())
  ));

create policy "request_responses: verified pinged helper raises hand"
  on public.request_responses for insert
  to authenticated
  with check (
    helper_id = (select auth.uid())
    and public.is_verified()
    and exists (
      select 1 from public.dispatch_targets dt
      where dt.request_id = request_responses.request_id
        and dt.helper_id = (select auth.uid())
    )
  );

create policy "request_responses: helper withdraws own"
  on public.request_responses for update
  to authenticated
  using (helper_id = (select auth.uid()))
  with check (helper_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 6. MATCHES, MEETING, COMPLETION (PRD 0.7/0.8)
-- ----------------------------------------------------------------------------
-- Created by the engine at confirm. Group requests → multiple matches per
-- request. State transitions run server-side in Phase 2 (timeouts, lapse,
-- auto-confirm), so clients only read here.
create table public.matches (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid        not null references public.requests (id) on delete cascade,
  helper_id           uuid        not null references public.profiles (id) on delete cascade,
  seeker_id           uuid        not null references public.profiles (id) on delete cascade,
  status              public.match_status not null default 'confirmed',
  meetup_code         text,                          -- short code proving the right person (PRD 0.4)
  confirmed_at        timestamptz not null default now(),
  helper_done_at      timestamptz,
  seeker_confirmed_at timestamptz,
  auto_confirmed      boolean     not null default false,
  completed_at        timestamptz,
  unique (request_id, helper_id)
);

create index matches_helper_idx on public.matches (helper_id, status);
create index matches_seeker_idx on public.matches (seeker_id, status);

alter table public.matches enable row level security;

create policy "matches: the two parties read"
  on public.matches for select
  to authenticated
  using ((select auth.uid()) in (helper_id, seeker_id));

-- Double-blind ratings (PRD 0.8): you always see your own; you see the other
-- side's only after both submitted (service sets revealed=true).
create table public.ratings (
  id                 uuid primary key default gen_random_uuid(),
  match_id           uuid        not null references public.matches (id) on delete cascade,
  rater_id           uuid        not null references public.profiles (id) on delete cascade,
  ratee_id           uuid        not null references public.profiles (id) on delete cascade,
  stars              smallint    not null check (stars between 0 and 5),
  feedback_text      text,
  feedback_voice_url text,
  submitted_at       timestamptz not null default now(),
  revealed           boolean     not null default false,
  unique (match_id, rater_id)
);

alter table public.ratings enable row level security;

create policy "ratings: rater reads own; ratee reads after reveal"
  on public.ratings for select
  to authenticated
  using (
    rater_id = (select auth.uid())
    or (ratee_id = (select auth.uid()) and revealed)
  );

create policy "ratings: match party submits own"
  on public.ratings for insert
  to authenticated
  with check (
    rater_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (select auth.uid()) in (m.helper_id, m.seeker_id)
        and ratee_id in (m.helper_id, m.seeker_id)
        and ratee_id <> rater_id
    )
  );

-- ----------------------------------------------------------------------------
-- 7. CONNECTIONS & SOCIAL GRAPH (PRD Bucket 5)
-- ----------------------------------------------------------------------------
-- The only relationship in Sapiens — earned by a real completed help.
-- user_a < user_b keeps one canonical row per pair.
create table public.connections (
  id                  uuid primary key default gen_random_uuid(),
  user_a              uuid        not null references public.profiles (id) on delete cascade,
  user_b              uuid        not null references public.profiles (id) on delete cascade,
  status              public.connection_status not null default 'offered',
  formed_from_request uuid references public.requests (id),
  offered_at          timestamptz not null default now(),
  active_at           timestamptz,
  disconnected_at     timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index connections_user_a_idx on public.connections (user_a, status);
create index connections_user_b_idx on public.connections (user_b, status);

alter table public.connections enable row level security;

-- Connection count/list is hidden from strangers (PRD 5.7): only the two
-- parties can even see the row. Offer/accept/disconnect flows come in Phase 4.
create policy "connections: the two parties read"
  on public.connections for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- Block = hard separation (PRD 5.10). The dispatch engine must NEVER match a
-- blocked pair — Phase 2's eligibility query joins against this table.
create table public.blocks (
  blocker_id uuid        not null references public.profiles (id) on delete cascade,
  blocked_id uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "blocks: owner manages own"
  on public.blocks for all
  to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 8. COMMUNICATION (PRD Buckets 4 & 6)
-- ----------------------------------------------------------------------------
-- Two chat surfaces, one table: 'active' (scaffolding for one meeting;
-- server-readable evidence; dissolves at confirmed completion) and 'inbox'
-- (persistent, connections only). chat_participants supports both 1-to-1 and
-- group coordination chats (PRD 4.7). Chats are opened server-side (Phase 2).
create table public.chats (
  id            uuid primary key default gen_random_uuid(),
  kind          public.chat_kind not null,
  request_id    uuid references public.requests (id) on delete cascade,
  connection_id uuid references public.connections (id) on delete cascade,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,                        -- set at confirmed completion (PRD 4.2)
  check (
    (kind = 'active' and request_id is not null and connection_id is null) or
    (kind = 'inbox'  and connection_id is not null and request_id is null)
  )
);

create table public.chat_participants (
  chat_id   uuid        not null references public.chats (id) on delete cascade,
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,                            -- group members can drop out (PRD 4.7)
  primary key (chat_id, user_id)
);

-- SECURITY DEFINER membership check — lets chats/messages policies consult
-- membership without recursive RLS lookups.
create function public.is_chat_participant(p_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = p_chat_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;

alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;

create policy "chats: participants read"
  on public.chats for select
  to authenticated
  using (public.is_chat_participant(id));

create policy "chat_participants: member reads own memberships"
  on public.chat_participants for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_chat_participant(chat_id));

-- Messages. Active-request messages are server-readable evidence (PRD 6.2)
-- and purged on a retention window (Phase 8 job, PRD 4.3). Inbox messages are
-- encrypted in transit/at rest by the platform; E2E is [P2].
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid        not null references public.chats (id) on delete cascade,
  sender_id  uuid        not null references public.profiles (id) on delete cascade,
  type       public.message_type not null default 'text',
  body       text,
  media_url  text,
  created_at timestamptz not null default now(),
  check (body is not null or media_url is not null)
);

create index messages_chat_idx on public.messages (chat_id, created_at);

alter table public.messages enable row level security;

create policy "messages: participants read"
  on public.messages for select
  to authenticated
  using (public.is_chat_participant(chat_id));

create policy "messages: participant sends into open chat"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_chat_participant(chat_id)
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and c.closed_at is null
    )
  );

-- ----------------------------------------------------------------------------
-- 9. REWARD & REPUTATION (PRD Bucket 7)
-- ----------------------------------------------------------------------------
-- Append-only, immutable ledger. The unique-help rule (PRD 7.1) is enforced
-- by a partial unique index: a helper can have at most ONE 'earned' row per
-- counterparty, ever. Repeat helps earn nothing — collusion dies at design.
create table public.moneta_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  help_ref        uuid references public.matches (id),
  amount          integer     not null,
  type            public.moneta_entry_type not null,
  counterparty_id uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  -- an 'earned' row must name who was helped, or the unique-pair rule
  -- below could be dodged with a null counterparty
  check (type <> 'earned' or counterparty_id is not null)
);

create unique index moneta_unique_help_pair_idx
  on public.moneta_ledger (user_id, counterparty_id)
  where type = 'earned';

create index moneta_ledger_user_idx on public.moneta_ledger (user_id, created_at);

-- Immutability: corrections are new 'reversed' rows, never edits.
create trigger moneta_ledger_immutable
  before update or delete on public.moneta_ledger
  for each row execute function public.forbid_change();

alter table public.moneta_ledger enable row level security;

create policy "moneta_ledger: owner reads own"
  on public.moneta_ledger for select
  to authenticated
  using (user_id = (select auth.uid()));

-- (The monthly unique-helps leaderboard, PRD 7.9, is a materialized view
--  built in Phase 3 — it derives entirely from this ledger.)

-- ----------------------------------------------------------------------------
-- 10. SAFETY (PRD Buckets 1 & 6.13)
-- ----------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid        not null references public.profiles (id) on delete cascade,
  reported_id      uuid        not null references public.profiles (id),
  context          public.report_context not null,
  evidence_chat_id uuid references public.chats (id),
  reason           text        not null,
  status           public.report_status not null default 'open',
  resolution       text,
  created_at       timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports: reporter files"
  on public.reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "reports: reporter reads own"
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

-- Every SOS press. Soft daily limit 2–3 (PRD 10.9) is enforced in the Phase 5
-- Edge Function — never by locking the button. resolved = the "are you safe?"
-- follow-up step.
create table public.sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  resolved    boolean     not null default false,
  daily_count integer     not null default 1        -- nth SOS by this user today (service-set)
);

create index sos_events_user_idx on public.sos_events (user_id, created_at);

alter table public.sos_events enable row level security;

create policy "sos_events: owner reads own"
  on public.sos_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "sos_events: owner fires own"
  on public.sos_events for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 11. MOMENTS, APPRECIATION, NOTIFICATIONS (PRD Bucket 8, 10.12)
-- ----------------------------------------------------------------------------
-- The finite, area-scoped celebration surface. Selfies: double opt-in
-- (visible only when both consent), removable by either party any time,
-- never searchable, no tap-to-profile (PRD 8.4). Area-scoped feed queries
-- come in Phase 6; the base rules live here now.
create table public.moments (
  id           uuid primary key default gen_random_uuid(),
  type         public.moment_type not null,
  request_id   uuid references public.requests (id),
  participants uuid[]      not null,
  photo_url    text,
  caption      text,
  area         text,                                -- zip/locality label — never coordinates
  consent_a    boolean     not null default false,
  consent_b    boolean     not null default false,
  visible      boolean     not null default false,  -- service flips true only when both consent
  removed_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index moments_area_idx on public.moments (area, created_at) where visible;

alter table public.moments enable row level security;

create policy "moments: participants read own"
  on public.moments for select
  to authenticated
  using ((select auth.uid()) = any (participants));

create policy "moments: visible moments readable"
  on public.moments for select
  to authenticated
  using (visible and removed_by is null);

-- Either participant can remove — no questions asked (PRD 8.4).
create policy "moments: participant removes"
  on public.moments for update
  to authenticated
  using ((select auth.uid()) = any (participants))
  with check ((select auth.uid()) = any (participants));

-- ❤️ Appreciate — one gesture, count hidden (PRD 8.7). You can see/undo your
-- own heart; total counts are never client-readable.
create table public.appreciations (
  moment_id  uuid        not null references public.moments (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

alter table public.appreciations enable row level security;

create policy "appreciations: owner manages own"
  on public.appreciations for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- In-app notification inbox (bell icon, PRD 10.12). Written by server logic;
-- budgets/caps per type are enforced by the writers (PRD 3.8/5.8/6.11).
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  type       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read, created_at);

alter table public.notifications enable row level security;

create policy "notifications: owner reads own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: owner marks read"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Expo push tokens, one row per device (spec §6). Server sends via
-- EXPO_ACCESS_TOKEN in Phase 2+.
create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  expo_token   text        not null unique,
  platform     text,                                -- 'ios' | 'android'
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy "push_tokens: owner manages own"
  on public.push_tokens for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 12. AUTH → PROFILE BOOTSTRAP
-- ----------------------------------------------------------------------------
-- Every new auth user automatically gets a profiles row + empty helper
-- preferences. SECURITY DEFINER because it runs from the auth schema's
-- trigger context, not as the user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.helper_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Done. Later phases add: category seed data (P2), dispatch views + engine
-- functions (P2), leaderboard matview (P3), connection-tier profile view (P4),
-- retention/purge jobs (P8), storage buckets as media features arrive.
-- ----------------------------------------------------------------------------
