# Sapiens — Security & RLS Review (Phase 8, Chunk 1)

Scope: every table's Row-Level Security, the staged-disclosure views, function
privileges, and the constitution's data-level invariants. Reviewed against the
migrations in `supabase/migrations/`.

## Verdict

The data model enforces the constitution in the database, not just the UI. RLS
is enabled on **all 25 tables** with owner-scoped policies; the append-only
ledger, staged disclosure, and admin-only moderation paths all hold. **One real
leak was found and fixed** (leaderboard `user_id`). Remaining items are launch
tasks (below), not defects.

## What was checked

### Tables & RLS
- All 25 tables have `enable row level security`. No table is left open.
- Sensitive reads are owner-scoped: `moneta_ledger`, `sos_events`, `ratings`,
  `blocks`, `notifications`, `trusted_contacts`, `helper_preferences`,
  `connection_nicknames`, `admins` all filter to `auth.uid()` (or, for `admins`,
  have RLS on with **no** policy → service-role only).
- The only `using (true)` read policy is `dispatch_config` (non-secret tunables).
- `categories` is world-readable only where `enabled` — taxonomy, no PII.

### Profiles (the no-surfing boundary)
- Others cannot read the `profiles` row directly; only the owner can. Everyone
  else goes through `profiles_public`, which exposes just five safe columns
  (name, photo, stage, trust, member_since) and requires knowing a uuid — which
  the app only hands out through the dispatch/match/connection flow.
- Writes are **column-locked**: `revoke update` + `grant update (display_name,
  bio, onboarded_at)`. So `verified`, the reputation counters, and the Phase 7
  moderation columns (`banned_at`, `suspended_until`, `moderation_note`) are
  **not client-writable at all** — a user cannot self-verify or self-unban. The
  `protect_moderation_columns` trigger is defense-in-depth on top of that.

### Disclosure views (all `security_invoker = off`, i.e. definer)
Each is filtered by `auth.uid()` and exposes only safe columns:
`helper_pings` (no seeker id/coords), `request_candidates` (seeker's own request
only), `match_details` (the two parties only, meetpoint post-confirm),
`my_connections` / `my_inbox` (the pair only), `my_pending_moments` (participant
only), `moments_feed` (first names, **no ids**, no counts). `anon` is revoked on
every one.

### Functions
- All 64 `security definer` functions pin `set search_path = ''` (no
  search-path injection).
- Admin mutation RPCs (`admin_ban_user`, `admin_suspend_user`, `admin_lift_user`,
  `admin_approve_suggestion`, `admin_reject_suggestion`) are **revoked from
  authenticated/anon and granted to `service_role` only**; the dashboard
  re-checks the `admins` allowlist server-side before calling them.

## Finding (fixed)

**`leaderboard_month` exposed raw `user_id`** to every authenticated viewer — a
stable identifier enabling cross-surface linking. The board only needs to mark
the caller's own row, so the view now returns an `is_me` boolean and **no user
id** (`20260801190000_phase8_leaderboard_privacy.sql`); the app screen was
updated to match.

## Launch tasks (not defects — tracked for Phase 8 / pre-launch)

- **Remove dev backdoors**: run `supabase/PRELAUNCH_TEARDOWN.sql` (drops
  `admin_reset_help_data` and `admin_set_helper_location`); do not deploy
  `app/scripts/*` (harnesses/seeders use the service key).
- **Admin dashboard**: add proxy-based session refresh and lock down deployment
  auth before hosting it anywhere but localhost (Phase 8, Chunk 4).
- **Turn Supabase "Confirm email" back ON** for production (it was OFF for
  Phase 0 testing).
- **Secrets**: confirm the service key only ever lives server-side (admin) and
  in `.env.local` (gitignored); never in the mobile bundle.
- Legal/compliance gate (owner + lawyer): DPDP, POCSO, IT Rules, ToS, insurance,
  DLT SMS registration — these block public launch and are not code.
