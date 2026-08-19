# Sapiens — Project Guide (CLAUDE.md)

> Full-project context for future sessions. Written 2026-08-10 from a complete
> read of the codebase. For the phase-by-phase build log and locked product
> decisions, see [`context.md`](context.md) — this file is the structural map;
> `context.md` is the narrative history. When they disagree, trust the code.

Sapiens is a hyperlocal **mutual-aid** mobile app (India-first): verified real
people help each other **in person, for free**. Six non-negotiable rules
("the constitution") are enforced **in data (RLS), not just UI**: no money for
help ever; no profile surfing (info is earned step-by-step); everyone is a
verified human; trust is the product; never endanger the protected person;
no attention-farming (no feeds/streaks/dopamine loops).

Source-of-truth product docs: `docs/Sapiens_App_MVP_Build_Spec.pdf` (build spec),
`docs/Sapiens PRD.pdf` (behavioural design). All P1 phases (0–8) are built;
remaining work is the `docs/PRELAUNCH_CHECKLIST.md` items.

---

## 1. Tech stack

**Monorepo, three parts** — no root `package.json`; each app is independent.

### `/app` — mobile app (the product)
| Area | Choice |
|---|---|
| Framework | **Expo SDK 54** (React Native 0.81.5) + **expo-router 6** (file-based) |
| Language | TypeScript 5.9 (strict), React 19.1, new architecture on, React Compiler on |
| State/data | Supabase JS client + React context providers; realtime via `postgres_changes` |
| Auth | Supabase Auth (**email + password** in P1; phone-OTP stubbed behind a seam) |
| Session storage | `expo-secure-store` (device Keychain/Keystore); AsyncStorage fallback on web |
| Analytics | **PostHog** (`posthog-react-native`) — wired, no-ops until key added |
| Push | `expo-notifications` — client registration wired, activates only in EAS build |
| Fonts | `@expo-google-fonts` — **Nunito Sans** (UI), **Cabin Sketch** (display) |
| UI libs | `react-native-svg` (logo, celestial journey), `react-native-reanimated`, `react-native-gesture-handler`, `@react-navigation/bottom-tabs` |
| Device APIs | `expo-location`, `expo-image-picker`, `expo-file-system`, `expo-haptics`, `expo-sms`, `expo-web-browser`, `expo-linking`, `expo-device`, `@react-native-community/slider` |
| Web target | `output: "single"` (client-only SPA) — used as a second test user (`w` in expo) |

> **Do not upgrade the Expo SDK** past 54 until the App Store Expo Go supports it.
> `create-expo-app@latest` gives SDK 57, which Expo Go can't load.

### `/admin` — Trust & Safety dashboard
| Area | Choice |
|---|---|
| Framework | **Next.js 16.2.12** (App Router; `middleware`→`proxy`, cookies async) |
| Language | TypeScript 5, React 19.2 |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`) |
| Data | `@supabase/ssr` (per-request cookie-auth client) + `@supabase/supabase-js` (service-role client) |
| Auth | Supabase login + `admins` allowlist table |

> `admin/AGENTS.md` warns: this Next.js has breaking changes vs. training data —
> read `node_modules/next/dist/docs/` before writing code here. Same for
> `app/AGENTS.md` re: Expo SDK 54 (read the versioned docs at docs.expo.dev/versions/v54.0.0).

### `/supabase` — backend (the real engine)
Postgres + **RLS** + **Realtime** + **Auth** + **Storage** + **PostGIS**, all
via the Supabase CLI. Business logic lives in SQL: `SECURITY DEFINER` functions
+ triggers + disclosure views. 34 migrations, phase-ordered by timestamp.

---

## 2. Architecture map

```
Sapiens App/
├─ context.md              ← phase-by-phase build log + locked decisions (READ THIS)
├─ CLAUDE.md               ← this file
├─ logo.svg                ← footprint-S brand mark (rendered via react-native-svg)
├─ docs/
│  ├─ Sapiens PRD.pdf, Sapiens_App_MVP_Build_Spec.pdf   ← product source of truth
│  ├─ PRELAUNCH_CHECKLIST.md   ← the launch runbook
│  └─ security-review.md       ← Phase 8 RLS/disclosure audit
│
├─ app/                    ← EXPO MOBILE APP
│  ├─ app/                 ← expo-router screens (routes = folders)
│  │  ├─ _layout.tsx       ← root: providers (Auth, Profile), fonts, theme
│  │  ├─ (auth)/           ← sign-in/up (email+password)
│  │  ├─ (onboarding)/     ← walkthrough + trusted contacts + welcome
│  │  ├─ (main)/           ← the 4 tabs: index(Home), moments, inbox, you
│  │  ├─ request/          ← raise-help flow (new, [id] waiting screen)
│  │  ├─ help/             ← help-someone flow (index list, [requestId])
│  │  ├─ chat/[requestId]  ← active-request chat
│  │  ├─ connections/      ← connections list, [otherId] profile, inbox/[otherId] chat
│  │  ├─ leaderboard/, notifications/, rate/[matchId], moment/new, sos/
│  ├─ lib/                 ← all business logic + provider seams (see §3 below)
│  ├─ components/          ← ui/ kit + journey/ (celestial) + profile/ + kyc/ + help/
│  ├─ theme/               ← tokens (light/dark), fonts, useTheme()
│  ├─ scripts/             ← *.mjs DEV harnesses (use service key from admin/.env.local)
│  └─ app.json, eas.json   ← Expo + EAS build config
│
├─ admin/                  ← NEXT.JS DASHBOARD (localhost for now)
│  ├─ app/                 ← login/, page(overview), reports/, users/, suggestions/
│  │                         each feature has page.tsx + actions.ts (server actions)
│  ├─ components/AdminShell.tsx
│  └─ lib/  auth.ts (getAdmin/requireAdmin), supabase/{server,service}.ts
│
└─ supabase/
   ├─ migrations/*.sql     ← schema + RLS + functions + views (phase-ordered)
   ├─ PRELAUNCH_TEARDOWN.sql  ← drops dev backdoors (run manually before launch)
   └─ config.toml
```

**Where things live:**
- **Screens/routes** → `app/app/**` (expo-router file conventions; `(group)` = layout groups, `[param]` = dynamic).
- **Client business logic** → `app/lib/**` — one file/folder per domain. Vendor-swappable concerns are behind **provider seams**: `lib/auth/`, `lib/kyc/`, `lib/location/`, `lib/sos/`, `lib/photo/`.
- **Server business logic** → **Postgres functions/triggers** in `supabase/migrations/**` (dispatch engine, moneta, ratings, notifications, moderation). The client mostly calls RPCs and reads disclosure views; it never orchestrates matching.
- **Admin mutations** → Next.js **server actions** (`admin/app/*/actions.ts`), each re-checking `getAdmin()`.

**Realtime rule:** every `postgres_changes` subscription goes through
`app/lib/realtime.ts` `useRealtime()` (unique channel per subscribe, callback via
ref) — avoids the "cannot add postgres_changes callbacks after subscribe()" crash.

---

## 3. `app/lib` domains (client logic + seams)
- `supabase.ts` / `env.ts` — client + fail-loud env reader.
- `auth/AuthProvider.tsx`, `auth/phoneOtp.ts` (**stub**) — auth seam.
- `profile/ProfileProvider.tsx` — current user's profile context.
- `kyc/kycProvider.ts` (**StubKycProvider**), `kyc/persist.ts` — KYC seam.
- `location/locationProvider.ts`, `location/useLocationSync.ts` — GPS, geocode, ETA text, `showLocation()` deep-links to external maps (no embedded map in P1).
- `help/matching.ts`, `help/timeAgo.ts` — help-flow client helpers.
- `chat/chat.ts`, `inbox.ts`, `connections.ts` — messaging + social graph.
- `moments.ts`, `ratings.ts`, `celestial.ts` — reward/celebration surfaces.
- `sos/sos.ts`, `sos/sosAlerter.ts` (**device-native SMS**) — SOS seam.
- `photo/displayPhoto.ts`, `photo/momentPhoto.ts` — Storage uploads.
- `notifications.ts` (notification copy), `push.ts` (token registration), `moderation.ts`, `analytics.ts`, `realtime.ts`.

---

## 4. Features (what a user can do, end-to-end)

1. **Sign up / in** — email + password (Supabase). New user auto-gets a `profiles` + `helper_preferences` row (`handle_new_user` trigger).
2. **Onboard** — walkthrough → add 1–3 trusted contacts → welcome.
3. **Get verified** — mock KYC gate (`apply_mock_kyc` RPC flips `verified`); set a display photo (face-match auto-accepts, stubbed). Verification is the hard gate to give/receive help.
4. **Set up as a helper** — "Ways I help" (category opt-in), reach slider (1–10 km), quiet hours, suggest missing categories.
5. **Ask for help (3 taps)** — category grid → what/when (Now/Scheduled, urgency, prefer-women, group + participant cap) → send. Live waiting screen (expiry countdown, cancel, try-again).
6. **Help someone** — see nearby pings (limited pre-accept info), raise hand (`raise_hand`). Seeker **vetoes/confirms** (veto, not pick).
7. **Coordinate** — active-request text chat (realtime, server-readable evidence), with a Cancel+Report+Block escape hatch.
8. **Meet & complete** — helper on-my-way → arrived → mark-done; seeker sees status + ETA text ("~400 m · ~6 min", never a live dot); seeker confirms or it auto-confirms; chat dissolves. Group activities end via `group_end`.
9. **Earn reputation** — helper earns **1 Moneta only on first-ever help with a given person** (append-only ledger); double-blind star ratings reveal only when both submit.
10. **See your journey** — You tab: Celestial Journey (moon→sun SVG), Goodness gauge, Trust stars, impact numbers; monthly **leaderboard** (ranked by unique people reached).
11. **Connect** — after both rate ≥3★, a double-opt-in connect offer (7-day expiry, silent decline). Connections list + fuller profile.
12. **Inbox** — persistent chat with connections (active-request messages carry over on connection); nicknames, disconnect, block, mark-read.
13. **Directed / connections-first help** — "Ask [name] for help" pings one connection first, falls back to open dispatch; normal requests can ping connections before strangers.
14. **SOS** — hold-to-activate guarded button; one-tap **Call 112** (device dialer, offline); opens SMS composer to trusted contacts with a maps location link; "I'm safe" resolve; soft daily limit surfaced (not enforced).
15. **Moments feed** — anonymous "help happened near you" tiles + milestone tiles; ❤️ appreciate (count hidden); double-opt-in selfie moments (visible only when both consent, removable by either).
16. **Notifications** — in-app bell (unread dot, realtime) + center; 5 trigger types, per-type daily caps.
17. **Admin (separate web app)** — login (allowlist), overview counts, reports queue + read-only flagged-chat evidence + resolve, member search + suspend/ban/lift, category-suggestion approve/reject.

---

## 5. Data model (Postgres, ~25 tables)

`id` on `profiles` mirrors `auth.users(id)`. Every table has RLS enabled.
Enum vocabularies are defined once in the Phase 0 migration.

**Identity & profile**
- `profiles` — one per human. Editable by owner: only `display_name`, `bio` (column grants). Server-only cached counters: `verified`, `over_18`, `unique_helps`, `total_helps`, `moneta_lifetime`, `moneta_balance`, `trust_rating_avg`, `goodness_score`, `celestial_stage`. Plus `suspended_until`/`banned_at`/`moderation_note` (Phase 7).
- `helper_preferences` — `categories uuid[]`, `radius_max_m`, `quiet_hours jsonb`, `snoozed_until`.
- `trusted_contacts` — 1–3 per user (slot 1–3), for SOS.
- `categories` — the taxonomy as data (dispatch attributes per row); `category_suggestions` — the "missing category" input pipe.

**Requests & dispatch**
- `requests` — seeker request; PostGIS `meetpoint_geo` generated column; `is_directed`/`directed_to`, `prefer_women`, `participant_cap`, `expires_at`.
- `dispatch_targets` — one row per (request, pinged helper); wave number + outcome.
- `request_responses` — raised hands (insert requires verified + actually-pinged).
- `dispatch_config` — tunables (wave radii, caps, retention windows) as data.

**Matches & reputation**
- `matches` — created at confirm; status ladder (confirmed→on_the_way→arrived→completed); `meetup_code`; group → multiple matches per request.
- `ratings` — double-blind (`revealed` flips when both submit).
- `moneta_ledger` — **append-only** (update/delete forbidden by trigger); partial unique index `(user_id, counterparty_id) where type='earned'` enforces one-earn-per-pair.

**Social graph & communication**
- `connections` — the only relationship; canonical `user_a < user_b`; `connection_nicknames`.
- `blocks` — hard separation; dispatch never matches a blocked pair.
- `chats` (kind `active`|`inbox`) + `chat_participants` (supports groups) + `messages`.

**Safety, celebration, delivery**
- `reports` (with `evidence_chat_id`), `sos_events` (daily_count, resolved).
- `moments` (double-consent selfies, `visible` gate) + `appreciations` (hidden count).
- `notifications`, `push_tokens`, `admins` (dashboard allowlist).

**Disclosure boundary (SECURITY DEFINER views — the "info is earned" enforcement):**
`profiles_public` (5 safe cols for strangers) · `helper_pings` (pre-accept ping payload, no seeker id/coords) · `request_candidates` (seeker sees a raised hand) · `match_details` (precise meetpoint released **only post-confirm**) · `my_connections` · `my_inbox` · `moments_feed` (first names, no ids) · `my_pending_moments` · `leaderboard_month` (`is_me` boolean, no user_id leak).

**Key server functions:** `dispatch_wave`/`dispatch_tick`/`dispatch_directed`/`dispatch_connections` (engine), `raise_hand`/`confirm_helper`/`veto_helper`, `helper_on_my_way`/`arrived`/`mark_done`/`seeker_confirm_done`, `cancel_report_block`, `award_on_completion` + `celestial_stage_for` (moneta), `on_rating_submitted`, `connect_offer`/`connect_decline`, `fire_sos`/`resolve_sos`, `notify` (capped writer) + 5 `notify_*` triggers, `retention_sweep`, admin `admin_ban/suspend/lift_user`, `admin_approve/reject_suggestion`.

---

## 6. Integrations & environment variables

**External services:** Supabase (DB/Auth/Realtime/Storage/PostGIS) · PostHog
(analytics) · Expo Push / EAS (build + notifications) · device SMS/dialer (SOS).
**Stubbed / not yet chosen:** KYC vendor, SMS provider + DLT, server-sent push.

Env vars are documented in `*.env.example` files; real values live in gitignored
`.env.local`. **Never print secret values.** `**/.env*` is gitignored (except
`*.env.example`); no `.env.local` is tracked (verified).

`app/.env.local` (client — `EXPO_PUBLIC_*` are bundled, safe to expose):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_POSTHOG_KEY` (empty until launch)
- `EXPO_PUBLIC_POSTHOG_HOST` (e.g. `https://us.i.posthog.com`)

`admin/.env.local` (server):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_KEY` ⚠️ **service-role, bypasses RLS — server only.** Guarded by `import 'server-only'` in `admin/lib/supabase/service.ts`.

`supabase/.env.local` (Edge Functions / scripts — all empty/later):
- `EXPO_ACCESS_TOKEN`, `KYC_PROVIDER_KEY`, `SMS_PROVIDER_KEY`, `SMS_DLT_TEMPLATE_IDS`

---

## 7. Deployment

- **GitHub:** `origin` → `https://github.com/Sapiensclub/App.git` (branch `main`). Push after each committed chunk.
- **Mobile:** Expo/EAS. `eas.json` has development / preview / production profiles (`appVersionSource: remote`). Bundle IDs `club.sapiens.app` (iOS + Android). Not yet run: `eas init` (adds `projectId`, activates push), `eas build`. Currently developed via Expo Go on iOS (SDK 54) + web SPA as second tester.
- **Backend:** Supabase cloud; migrations applied with `npx supabase db push` (CLI already linked; needs DB password). **`pg_cron` must be enabled** for `dispatch_tick` (every minute) and `retention_sweep` (daily) — without it, requests never expire.
- **Admin:** Next.js, **localhost only** for now (`npm run dev`). Needs HTTPS + proxy-based session refresh + deployment auth before hosting anywhere public.
- No CI/CD config present (no GitHub Actions / Vercel config found).

---

## 8. Health check (incomplete / risky / noteworthy)

**Intentional stubs (documented, behind seams — swap before launch):**
- KYC + liveness + face-match → `app/lib/kyc/kycProvider.ts` (`StubKycProvider`), `apply_mock_kyc`, face-match auto-accept in `set_display_photo`.
- Phone OTP → `app/lib/auth/phoneOtp.ts` (throws "not available yet").
- SOS alerts → device-native SMS (`sosAlerter.ts`); no server SMS yet.
- Push **send** side → not built (client registration is done); needs an Edge Function reading `notifications` → Expo Push API.

**Dev backdoors (must be removed before public launch — `PRELAUNCH_TEARDOWN.sql`):**
- `admin_reset_help_data()` — TRUNCATEs all help data (DEV/STAGING ONLY).
- `admin_set_helper_location()` — test-harness location setter.
- `app/scripts/*.mjs` use the **service key** (read from `admin/.env.local`) — must never be deployed. `preview-journey.mjs` writes counters directly.

**Security posture (from `docs/security-review.md`, Phase 8):** all ~25 tables RLS-scoped; profile writes column-locked; disclosure views leak-checked; all `SECURITY DEFINER` funcs pin `search_path`; service key can't reach the browser (`server-only` guard). No exposed secrets found in the repo. One prior leak (`leaderboard_month.user_id`) already fixed to an `is_me` boolean.

**Owed within P1 (not launch blockers):**
- Chat **photos + voice notes** — both active-request and inbox chats are text-only (voice matters for accessibility). Schema (`message_type`, `media_url`) already supports it.
- **Leaderboard area filters** — need a stored "home area"; v1 is global.

**Operational gotchas (from `context.md` §9 — real footguns):**
- Enable `pg_cron` or requests never expire / no later waves.
- Testing a match needs the helper findable *before* the request is raised (verified + category opted-in + location synced).
- **Don't Cancel+Report+Block between your two test accounts** — permanently blocks the pair by design.
- expo-router typed routes: adding a route fails `tsc` on the path literal until types regen (run dev server briefly).
- Migrations: `create or replace view` can't add columns mid-list (use DROP+CREATE); Supabase blocks bare UPDATE/DELETE without WHERE; enum columns need explicit `::enum_type` casts.

**Duplication note:** several functions/views are redefined across phase migrations
(e.g. `dispatch_wave`, `dispatch_tick`, `confirm_helper`, `connect_offer`,
`leaderboard_month`, `match_details`) — this is expected append-only migration
evolution, not dead code. The **latest** definition wins; read the highest-timestamp
migration for a given object's current shape.

---

## 9. Open questions (couldn't determine from code alone)

1. **KYC/SMS/push vendors** — none chosen yet. Which providers, and what's the target date for swapping the stubs?
2. **Admin hosting** — where will the Next.js dashboard live (Vercel? self-host?), and is anyone building the proxy-based session refresh it still needs?
3. ~~`pg_cron`~~ — ✅ RESOLVED (Aug 2026): enabled, both jobs active. "Confirm email" still OFF (correct for the closed test; ON at launch).
4. ~~EAS project~~ — ✅ RESOLVED (Aug 2026): `eas init` done (projectId in app.json), Android preview build live, push verified end-to-end. Custom SMTP still pending (Supabase built-in mailer can't edit templates → in-app password reset dormant; `scripts/reset-password.mjs` is the interim).
5. **PostHog key** — added yet, and US or EU region?
6. **Test-account state** — `context.md` §11 lists specific seed/real accounts; is that still current, or has data been reset since?
7. **Legal/compliance gate** — the launch-blocking legal items (entity, DPDP, POCSO, IT Rules, DLT, insurance) are owner+lawyer tasks; what's their status?

---

## 10. Working style (owner)

Solo, non-expert mobile dev. Work in **small chunks**; after each, **STOP**,
explain plainly what was built + exact test steps, and wait for confirmation.
Prefer clear over clever code. **Never print secret values** (owner pastes keys
into `.env.local`). Terminal is **Windows PowerShell 5.1** — no `&&` (use `;`),
quote paths with spaces. Push to GitHub after each committed chunk; commit
messages avoid embedded quotes/backticks (PowerShell here-string parsing).
