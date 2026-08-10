# Sapiens — Build Context & Checkpoint Log

> Living reference for the Sapiens app build. Keep this updated as phases complete.
> Last updated: after Phase 4, Chunk 2 (the Inbox).

---

## 1. What Sapiens is

A hyperlocal **mutual-aid** mobile app (India-first): verified real people help each
other **in person, for free**. The constitution (non-negotiable, enforced in DATA not
just UI):
1. **No money for help, ever.**
2. **No profile surfing** — info about others is *earned step by step* (staged
   disclosure via RLS + disclosure views).
3. **Everyone is a verified real human** before giving/receiving help (KYC gate).
4. **Trust is the product** — any feature eroding it is wrong.
5. **Never endanger the person we're protecting** (safety design > safety theatre).
6. **No attention-farming** — no feeds, streaks, dopamine loops (anti-addiction rules
   are hard/permanent).

Source docs live in `docs/`:
- `docs/Sapiens_App_MVP_Build_Spec.pdf` — the build spec (phases §7, schema §3, stack).
- `docs/Sapiens PRD.pdf` — full behavioural design (Buckets 0–11, phase-tagged).
Website design system source: `C:\Users\KIIT\sapiens\Sapiens_Build_Spec_v2_for_Claude_Code.md` §2.

We build **P1 only**, strictly in the spec's §7 phase order, **one chunk at a time**,
stopping for owner testing after each. P2/LATER items are NOT built — only
architectural hooks are left.

---

## 2. Owner / working style

- **Solo founder, not an expert mobile dev.** Explain plainly; small chunks; after each
  chunk STOP, explain what was built + exact test steps, wait for confirmation.
- Prefer clear, maintainable code over clever code.
- **Never print secret values.** Owner pastes keys into `.env.local` themselves.
- Owner's terminal is **Windows PowerShell 5.1** — no `&&` (use `;`), quote paths with
  spaces. Dev machine: Windows 11, Node 22, git.
- Owner has: Supabase project, GitHub repo **https://github.com/Sapiensclub/App**, Expo
  account, Expo Go on **iPhone 17 / iOS 26**.
- After each committed chunk we push to GitHub.
- Commit messages: **avoid embedded double-quotes/backticks** (PowerShell here-string
  breaks arg parsing). End commit messages with `Co-Authored-By: Claude Fable 5 ...`.

---

## 3. Stack & architecture

- **Monorepo**: `/app` (Expo RN + expo-router + TS), `/admin` (Next.js stub — real
  dashboard is Phase 7), `/supabase` (migrations, functions, seed), `/docs`.
- **App pinned to Expo SDK 54** (template `default@sdk-54`) — the App Store Expo Go
  supports SDK 54 only; `create-expo-app@latest` gives SDK 57 which Expo Go can't load.
  **Do not upgrade the Expo SDK until Expo Go supports it.**
- Web output = **`single`** (client-only SPA) in `app.json` — NOT `static` (static
  pre-renders in Node where `window` is undefined → crash). The web build is our
  **second test user** (press `w` in expo).
- Backend: **Supabase** (Postgres/RLS/Realtime/Auth/Storage/PostGIS). Analytics:
  **PostHog** (wired, key not yet added — deferred). Push: Expo Push (Phase 2+; needs a
  dev build, Expo Go can't receive push).
- Design: warm paper/ink/spark-orange + celestial night. **Nunito Sans** for all UI,
  **Cabin Sketch** for display/headlines/celebratory. Exact website palette (verified
  against live site): paper `#F7F4EC`, ink `#141414`, spark `#F59E2D`, night `#17142E`,
  gold `#F0C078`, moonlight `#CDD6FF`, clay `#D85A30`. Hand-drawn "wobble" button
  corners. 70-year-old accessibility test (big targets, high contrast).
- **Light + dark themes** via `useTheme()` reading system color scheme; `theme/tokens.ts`
  has `lightColors`/`darkColors` (semantic keys) + spacing/radius/fonts/type.
- Component kit in `app/components/ui/`: Screen, Button, Card, Tile, Sheet, Text,
  TextField, EmptyState. Logo (footprint-S) rendered via react-native-svg from
  `logo.svg`, theme-aware.
- Realtime: **all `postgres_changes` subscriptions go through `app/lib/realtime.ts`
  `useRealtime()` hook** — unique channel name per subscribe, effect keyed only on the
  subscription shape, callback via ref. (Fixed the "cannot add postgres_changes
  callbacks after subscribe()" crash class.)
- Env files (gitignored): `app/.env.local` (EXPO_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY +
  POSTHOG_KEY[empty] + POSTHOG_HOST), `admin/.env.local` (NEXT_PUBLIC_* + SUPABASE_SERVICE_KEY),
  `supabase/.env.local` (EXPO_ACCESS_TOKEN + KYC/SMS keys — all empty/later).

---

## 4. Progress — phases done

### Phase 0 — Foundation ✅
Monorepo, full schema (~20 tables) + RLS enforcing the constitution + `profiles_public`
view (the staged-disclosure boundary) + PostGIS. Auth = **email + password** (owner's
choice for easy testing; behind an AuthProvider seam so swapping to OTP later is small;
requires Supabase "Confirm email" OFF). Phone OTP **stubbed** (`app/lib/auth/phoneOtp.ts`).
Themed light/dark component kit + logo. Four-tab home (Home/Moments/Inbox/You). PostHog
wired (no-ops without key). Sessions persist via expo-secure-store.

### Phase 1 — Identity & profile ✅
Onboarding flow (walkthrough + trusted contacts + welcome). **Mock KYC gate**
(`apply_mock_kyc` RPC + `KycProvider` seam in `app/lib/kyc/`; real vendor swaps one file).
Display photo via `avatars` Storage bucket + `set_display_photo` RPC (face-match
**stubbed** to auto-accept). 8 parent categories seeded. Ways-I-help + helper prefs
(reach slider 1–10km, quiet hours, category suggestions). Assembled You tab (edit
profile, trusted-contacts editor).

### Phase 2 — THE SPINE ✅ (the core product)
- **Location** (`app/lib/location/locationProvider.ts`): the one seam — GPS, locality
  reverse-geocode, distance/ETA, `showLocation()` deep-links to external maps (no Map
  API v1). `useLocationSync` keeps helper location fresh while app open.
- **Dispatch engine** (SQL, SECURITY DEFINER): `dispatch_wave` (PostGIS radius grows per
  wave, category opt-in, verified, not mid-help, not quiet hours, not blocked,
  prefer-women soft pre-order, nearest-first + **load-rotation fairness — never badge**,
  daily ping cap), `dispatch_tick` (widen waves, expire, lapse re-broadcast,
  auto-confirm). Trigger pings wave 1 on request create. Proved via
  `app/scripts/dispatch-harness.mjs`. Tunables live in `dispatch_config` table (data,
  not code).
- **Raise-help flow** (3 taps): category grid → what/when (Now/Scheduled presets,
  urgency pre-filled, prefer-women, **group option + participant cap**) → send.
  Waiting screen (live, honest, expiry countdown, cancel, Try-again).
- **Staged disclosure enforced in DATA** via SECURITY DEFINER views: `helper_pings`
  (limited pre-accept info, no seeker id/coords), `request_candidates` (seeker sees
  PRD 9.4 fields of a raised hand), `match_details` (precise meetpoint released ONLY
  post-confirm; also helper live distance for seeker ETA).
- **Match flow**: Help-now bounded list, "I'll help" (`raise_hand`), seeker
  Confirm/Decline (veto, not pick — `confirm_helper`/`veto_helper`), meetup code.
- **Active-request chat**: text only (photos/voice deferred), realtime, server-readable;
  **Cancel+Report+Block** hatch (`cancel_report_block` — terminates match, files report
  w/ chat evidence, blocks pair, re-broadcasts).
- **Meeting & completion**: helper on-my-way→arrived→mark-done ladder; seeker sees
  status + ETA text ("~400m · ~6 min", never a live dot); seeker confirm or auto-confirm;
  chat dissolves; group activities `group_end`.
- **Group scheduled requests**: multi-accept up to cap, shared group chat (sender names),
  seeker ends activity.
- `OngoingHelp` card on Home = way back into any in-progress request/match.

### Phase 3 — Reward & reputation ✅
- **Moneta engine**: `award_on_completion` trigger — on match completion, helper earns
  1 Moneta **only on FIRST-EVER help with a person** (unique-help rule, PRD 7.1);
  append-only ledger + partial unique index make a 2nd award per pair impossible.
  Recomputes unique_helps, total_helps (steadfast, incl. repeats), moneta, celestial
  stage, goodness = 100·(1−e^(−unique/280)). Proved via `moneta-harness.mjs`. The person
  *helped* earns nothing.
- **Double-blind ratings**: `on_rating_submitted` trigger reveals both only when both
  submit, then recomputes each Trust avg. Rate screen (stars + note).
- **Three meters + Celestial Journey** on You tab: SVG moon→sun (`components/journey/`),
  Goodness gauge (responsive), Trust stars, milestone dots, impact numbers.
- **Monthly leaderboard**: `leaderboard_month` view — new unique people reached this
  month, ranked by uniques (not raw count). Global (area filters need stored user area —
  later). Screen from You tab.

### Phase 4 — Connections & inbox ✅ (COMPLETE)
- **Chunk 1 ✅ — Connect offer**: double opt-in (`connect_offer`/`connect_decline`),
  rating-gated (both ≥3★, only shown after both rate), 7-day expiry, silent decline.
  `my_connections` view (private graph, PRD 5.7). Connections list + fuller profile;
  You tab entry with count. **Bug fixed**: `connect_offer` CASE status must cast to
  `::connection_status` enum.
- **Chunk 2 ✅ — the Inbox**: inbox chat opens on connection + active-request messages
  **carry over**; `my_inbox` view (threads, last msg, unread); nicknames
  (`connection_nicknames`); `disconnect_connection` (silent, freeze), `block_connection`
  (freeze + hard block), `mark_chat_read`. Inbox tab + inbox chat screen (rename/
  disconnect/block, frozen state).
- **Chunk 3 ✅ — directed requests + connections wave**: "Ask [name] for help"
  (`dispatch_directed` pings one connection only; `opened_at` marks fallback to open
  dispatch after `directed_fallback_minutes`; ping reveals seeker identity to the named
  connection via `helper_pings.directed_to_me/from_name/from_photo`, PRD 5.5). Connections
  wave (`dispatch_connections` pings eligible connections first on a normal request; tick
  widens to strangers after; PRD 5.6). Proved via `directed-harness.mjs`.

### Phase 5 — SOS ✅ (COMPLETE)
- **Chunk 1 ✅ — guarded button**: `fire_sos` RPC (records press, server-computes nth-today
  count, `sos_soft_daily_limit` surfaced not enforced), `resolve_sos` ("I'm safe"),
  `resolved_at` col; `app/sos` screen — hold-to-activate guard, best-effort location (never
  blocks), one-tap **Call 112** (device dialer, works offline), over-limit accountability
  note; SOS entry in Home header (modal route). Builds on Phase 0 `sos_events`.
- **Chunk 2 ✅ — trusted-contact alerts (Layer 1)**: `alerted_at` col + `mark_sos_alerted`;
  **device-native delivery** (owner's decision) — `lib/sos/sosAlerter.ts` opens the phone's
  SMS composer to all trusted contacts pre-filled with a maps location link, falls back to
  share sheet; behind a seam so server-sent SMS can replace it later. Added `expo-sms`.
  Warning haptic on activate. **Location link = maps pin at alert time, NOT a live-updating
  page** (that + Layer 3 community responders are deferred/[P2]).

### Phase 6 — Community & notifications ✅ (COMPLETE)
- **Chunk 1 ✅ — notifications bell**: 5 DB triggers write `notifications` (hand raised,
  you were confirmed, help completed, connection active, connection milestone [PRD 5.8]);
  milestone fires only on enum stage upgrade (no reset spam). `NotificationBell` (unread dot,
  realtime) in Home header; `app/notifications` center (unread highlight, tap-through per
  type, mark-all-read on view). `lib/notifications.ts` centralizes copy (staged-disclosure
  safe). Push-to-lockscreen deferred to Phase 8 (needs dev build).
- **Chunks 2 & 3 ✅ — Moments feed + selfies**: `'help'` added to `moment_type` (own
  migration). Triggers auto-create anonymous `help` tiles on completion (deduped/request) +
  `milestone` tiles on stage-up. `moments_feed` view = safe cols only (first names, NO ids →
  no tap-to-profile, NO counts). Moments tab: tiles, ❤️ appreciate (optimistic), remove-mine,
  "all caught up" bottom. Home "N helps near you this week". Selfies (PRD 8.4): `moments`
  storage bucket, `propose_selfie_moment`/`consent_moment`/`remove_moment` (visible only when
  BOTH consent; either removes anytime), `moment_pending` notification + pending card via
  `my_pending_moments`; "Share a moment" on both completion screens → `app/moment/new`.

### Phase 7 — Admin / Trust & Safety dashboard ✅ (COMPLETE) — Next.js `/admin`
Auth: **Supabase login + `admins` allowlist** (RLS-locked, service-role read). Per-request
server client (cookie auth) + `service.ts` (service-role, `server-only` guard so the secret
key can't reach the browser). Every server action re-checks `getAdmin()`. Next.js **16**
(cookies async; `middleware`→`proxy` — we skip middleware, refresh per request). Env:
`admin/.env.local` (URL + PUBLISHABLE + SERVICE_KEY).
- **Chunk 1 ✅** — foundation + reports: login page, `AdminShell`, overview (open reports /
  suggestions / members counts), reports queue + detail with **read-only flagged-chat
  evidence**, resolve (reviewing/actioned/dismissed + note). `seed-test-report.mjs`.
- **Chunk 2 ✅** — suspend/ban: profiles `suspended_until`/`banned_at`/`moderation_note`;
  `is_active_member()`; `protect_moderation_columns` trigger (users can't self-clear);
  enforcement — restricted seeker can't insert a request (trigger), restricted helper can't
  `raise_hand`. `admin_ban_user`/`admin_suspend_user`/`admin_lift_user` (SECURITY DEFINER,
  service-role only). Members search + user detail w/ Suspend/Ban/Lift. App: `lib/moderation.ts`
  + Home "Account restricted" banner gating the two actions.
- **Chunk 3 ✅** — category suggestions: `admin_approve_suggestion` (SQL slugify + unique;
  inserts into `categories`, defaults for the rest; optional parent/icon) + `admin_reject_suggestion`.
  `/suggestions` review page. `seed-test-suggestion.mjs`.

**Admin auth still owed:** proxy/middleware for token refresh + deployment auth hardening →
Phase 8/launch. Dashboard is localhost-run for now.

### Phase 8 — Hardening & store prep ✅ (COMPLETE) — code side
- **Chunk 1 ✅** — security/RLS review (`docs/security-review.md`): all 25 tables RLS-scoped,
  column-locked profile writes, disclosure views leak-checked, all definer funcs pin
  search_path. Fixed `leaderboard_month` `user_id` leak → `is_me` boolean.
  `supabase/PRELAUNCH_TEARDOWN.sql` (manual, drops dev backdoors).
- **Chunk 2 ✅** — accessibility (70-year test): baseline already good (Button role/target,
  text scales). New `IconButton` primitive; labelled the bare back/send/heart icon-only
  controls.
- **Chunk 3 ✅** — data lifecycle + notification budgets: `notify()` writer with per-type
  daily caps + unread dedup (5 triggers route through it); `retention_sweep()` daily pg_cron
  (purges closed active-chat messages [inbox permanent; open-report evidence kept], old read
  notifications, resolved SOS, resolved reports). Windows/caps in `dispatch_config`.
- **Chunk 4 ✅** — launch config: `eas.json`; `app.json` bundle IDs `club.sapiens.app` +
  expo-notifications plugin; `lib/push.ts` token registration (no-ops in Expo Go, activates in
  EAS build) wired in `(main)/_layout`; added `expo-notifications`/`expo-device`. PostHog was
  already wired (add key). **`docs/PRELAUNCH_CHECKLIST.md`** = the launch source of truth.

**P1 features still owed (not launch blockers):** voice notes + photos in chat (text-only so
far); leaderboard area filters (need stored home area). **Launch tasks:** see
`docs/PRELAUNCH_CHECKLIST.md` (teardown, confirm-email ON, EAS build + push send Edge Function,
replace KYC/OTP/SMS stubs, legal/DPDP/POCSO/DLT gate).

---

## 5. Phases remaining (P1)

**All P1 phases (0–8) are built.** Remaining before public launch = the
`docs/PRELAUNCH_CHECKLIST.md` items (owner + lawyer + a few code swaps) and the two owed
features above.

---

## 6. Deliberately deferred (still owed within P1)

- **Chat photos + voice notes** (PRD 4.4/6.6) — active-request AND inbox chats are
  text-only so far. Voice notes matter for accessibility. Small follow-up.
- **Leaderboard area filters** (zip/city/state/country) — need a stored user "home area";
  v1 is global (fine for closed-community launch).
- **Milestone notifications to connections** (PRD 5.8) — Phase 6 with the bell.

---

## 7. Stubs / seams for real vendors (P1 mocks, swap later)

- **KYC**: `app/lib/kyc/kycProvider.ts` `KycProvider` interface + `StubKycProvider`;
  `apply_mock_kyc` RPC flips verified server-side. Real vendor (Aadhaar/DL + liveness)
  swaps one file. Face-match against KYC selfie stubbed (auto-accept) in
  `set_display_photo`.
- **Phone OTP**: `app/lib/auth/phoneOtp.ts` stub; real SMS + DLT later (with KYC).
- **SMS provider / DLT**: not chosen; needed for phone OTP + SOS SMS.

---

## 8. P2 / LATER — DO NOT BUILD (leave hooks only)

[P2]: Premium Choice (seeker picks helper) · masked calling · SOS Layer 3 community
responders · E2E inbox + client-side reporting · retroactive help-logging · voice-input
category/sentiment · anti-collusion layer · embedded map · real-world Moneta redemption.
[LATER]: formal background checks · behavioural trust gates · direct DigiLocker · cash
rewards/City Saviour tooling · Hindi/regional (keep i18n-ready) · disappearing messages ·
arbitrary group chats · comments.
[GATE — blocks public launch]: legal entity, liability/ToS, DPDP, POCSO, IT Rules,
insurance, Moneta-redemption regulation (§2.4 G1–G7); App Store review; DLT SMS
registration. **Owner + lawyer tasks, not code.**

---

## 9. Operational gotchas & how-tos (IMPORTANT)

- **pg_cron must be enabled** for the dispatch tick to run (widen waves, expire requests,
  lapse, auto-confirm). Enable: Supabase Dashboard → Database → Extensions → `pg_cron`
  ON, then SQL editor:
  `select cron.schedule('sapiens-dispatch-tick', '* * * * *', 'select public.dispatch_tick();');`
  Without it: requests never expire → stuck "open" shown as "expired" in UI; no later
  waves. (This caused the "can't cancel / not matching" issues.)
- **Testing a match needs the helper findable BEFORE the request is raised**: verified +
  category in Ways-I-help + location synced (open "Help someone" first to sync). Both
  test accounts at same location → distance ~0.
- **Don't Cancel+Report+Block between the two main test accounts** — it *permanently*
  blocks the pair (by design); they'll never match again. Clear via reset if needed.
- **Migrations**: owner runs `npx supabase db push` (needs DB password; CLI already
  linked). `create or replace view` can't insert columns mid-list → use DROP+CREATE.
  Supabase blocks bare UPDATE/DELETE without WHERE (even inside functions) → always add
  a WHERE. Enum columns need explicit `::enum_type` cast when set from a CASE of text.
- **Keyboard handling: `KeyboardAvoidingView` must use `behavior="padding"` on BOTH
  platforms.** The app is edge-to-edge (SDK 54 default), so Android never auto-resizes
  the window for the keyboard — the old `Platform.OS === 'ios' ? 'padding' : undefined`
  pattern leaves inputs hidden behind the keyboard on Android. Fixed app-wide
  2026-08-10; `Sheet` lifts itself via its own internal KeyboardAvoidingView.
- **expo-router typed routes**: adding a new route makes `tsc` fail on the path literal
  until types regen. Regen by running the dev server briefly (background `expo start`,
  wait for `.expo/types/router.d.ts`, kill). `expo export` does NOT regen them.
- **Every chunk**: `tsc --noEmit` + `expo export --platform ios` (bundle check) before
  commit. Restart dev server with `npx expo start -c` after native/config changes.
- **Fully restart the app** (kill Expo Go + `expo start -c`) after data resets — the app
  caches stale requests/matches otherwise.

---

## 10. Dev scripts (in `app/scripts/`, run from `app/` with `node scripts/<x>.mjs`)

All read Supabase URL + **service key** from `../admin/.env.local`; never print secrets.
- `dispatch-harness.mjs` — seeds helpers around a point, proves the dispatch engine
  (eligibility, radius growth, prefer-women). Cleans up.
- `moneta-harness.mjs` — proves the unique-help rule (repeat earns nothing).
- `connect-harness.mjs` — proves connect_offer end-to-end as two real users.
- `diagnose-help.mjs` — READ-ONLY: blocks, matches by status, requests by status, helper
  location/verified state. Run this first when matching misbehaves.
- `reset-help-data.mjs` — full fresh slate: calls `admin_reset_help_data` (TRUNCATEs past
  the append-only ledger — normal deletes are blocked by design), resets reputation
  counters + locations, removes leftover `@sapiens.test` seed accounts. **Keeps** real
  profiles, Ways-I-help, trusted contacts.
- `preview-journey.mjs <email> <n>` — sets a profile's unique-helps to see the moon/sun
  at any stage (DEV visual only; run with 0 to reset).

**`admin_reset_help_data` (SQL function) is DEV/STAGING ONLY — REMOVE before launch**
(add to pre-launch checklist; it truncates all help data).

---

## 11. Current DB state (as of this checkpoint)

Help data was fully reset (0 requests, 0 matches, seed accounts removed). Real accounts:
- `pragamankumar@gmail.com` — verified, 8 categories, radius 10km.
- `sapiensclub1@gmail.com` — verified, 8 categories, radius 5km.
- `pragaman@noboruworld.com` — NOT verified.
No blocks. pg_cron: **enable it** if not already (see §9).

---

## 12. Key product decisions locked (so we don't re-litigate)

- Auth Phase 0 = email+password (not OTP) for testing.
- KYC + face-match + phone OTP = mocked behind clean seams.
- Moneta rewards the **helper** only, flat 1, unique-pair only; append-only ledger.
- Goodness curve k = 280. Celestial ladder: new moon 0 · crescent 10 · half 50 · full
  100 · sunrise 500 · golden sun 1000.
- Ratings double-blind; Connect offer rating-gated (both ≥3★), double opt-in, silent
  decline, 7-day expiry.
- Active-request chat carries over into the inbox on connection.
- Dispatch never ranks by badge/reputation — nearest-first + fairness only.
- Leaderboard ranks by unique people (never raw count); global for now.
