# Sapiens — Capacity & Limits Report

> Written 2026-08-20, verified against (a) the live `dispatch_config` values in
> your database, (b) the code as of commit `c58b952`, and (c) Supabase's
> published plan limits (checked 2026-08-20). Assumes the **Supabase Free
> plan** — if the project is upgraded to Pro ($25/mo), use the Pro column.
> Re-check plan numbers at supabase.com/pricing before launch; they shift.

---

## 1. The headline answers

| Question | Answer (Free plan today) | First wall you'd hit |
|---|---|---|
| **Concurrent users (app open at once)** | **~200** — every open app holds one realtime socket | Supabase Realtime: 200 concurrent (Pro: 500, then $10/1000) |
| **Daily active users supported** | ~1,000–2,000 comfortably (peak-online is usually 5–10% of DAU) | Same realtime wall |
| **Users onboarded (total accounts)** | Effectively unlimited for your horizon (50,000 monthly-active auth users included; profile rows are tiny) | DB size fills from *messages/media*, not people |
| **Requests raised at the same time** | Hundreds simultaneously is fine; thousands/day fine | Shared CPU on Free compute (dispatch is indexed PostGIS — light) |
| **Chat volume (texting)** | Bursts of hundreds of messages/sec are fine; ~300–500K **stored** messages total fit in the Free DB | 500 MB database (Pro: 8 GB) + 2M realtime deliveries/month |
| **Media shared (photos/voice)** | 5 MB/file cap (enforced); ~3,000–5,000 photos **or** ~10–15 h of voice total | 1 GB storage (Pro: 100 GB); 5 GB/month egress for viewing |
| **Push notifications** | **Unlimited and free** (Expo Push) | Not a constraint at any scale you'll reach |
| **Emails (signup/reset)** | 100/day (Resend free) — only password resets today; becomes the **signup cap** when confirm-email turns ON at launch | Resend paid (~$20/mo → 50K/month) |

---

## 2. Infrastructure limits by service

### Supabase (the backbone) — Free vs Pro ($25/mo)
| Dimension | Free (now) | Pro |
|---|---|---|
| Database size | 500 MB (shared CPU, 500 MB RAM) | 8 GB incl., then $0.125/GB |
| File storage (photos, voice, avatars, moments) | 1 GB | 100 GB incl. |
| Egress (media viewing, API traffic) | 5 GB/mo | 250 GB/mo |
| Auth monthly active users | 50,000 | 100,000 incl. |
| Realtime concurrent connections | **200** | **500**, then $10/1000 |
| Realtime message deliveries | 2M/mo | 5M/mo |
| Edge Function invocations (push-send) | 500K/mo | 2M/mo |
| **Project pausing** | ⚠️ **Paused after 1 week of inactivity** — app fully dead until manually restored | Never pauses |
| **Backups** | ⚠️ **None** | Daily, 7-day retention |

### Everything else
| Service | Free limit | Notes |
|---|---|---|
| Expo Push | Unlimited | Genuinely free at any volume |
| EAS Update (OTA fixes to testers) | 1,000 monthly active users | Beyond → paid Expo plan (~$19/mo) |
| EAS Build | ~30 builds/mo, queued | Fine — you rebuild rarely; updates are OTA |
| Resend (auth emails) | 100/day, 3,000/mo | Verified domain sapiens.club |
| PostHog (analytics) | 1M events/mo | Plenty; key still not set |
| SOS SMS | Uses the member's own phone | Zero infra, zero cost, no limit |

---

## 3. Product-level limits (your own dials, live values)

These are **in `dispatch_config` — changeable with one SQL row, no app update**:

| Dial | Live value | Meaning |
|---|---|---|
| `wave_size` | sos 25 · urgent 6 · everyday 4 · casual 3 | Helpers pinged per dispatch wave (in-person) |
| `daily_ping_cap` | 20 | Max pings one helper receives per day (SOS exempt) |
| `location_max_age_minutes` | 60 | Helper invisible if location older than this |
| `online_wave_size` | *(no row = unlimited)* | Online requests ping **everyone** opted in — add the row (e.g. 15) when that gets noisy |
| `chat_retention_days` | 60 | Closed active-chat messages + their media purged after this (inbox is permanent) |
| notification caps | per-type daily caps | Bell/push flood protection |

Hard-coded in app/storage: **5 MB per chat file** (images + audio only), **120 s max voice note**, photos re-encoded to ~150–400 KB, 1–3 trusted contacts, group cap 2–8.

---

## 4. What breaks first — the three walls, in order

1. **Realtime 200 concurrent** — the first real wall. At ~150 simultaneously-open apps, upgrade to Pro (500) and later paid tiers. Nothing needs code changes.
2. **Database 500 MB** — messages accumulate (inbox is permanent by design). At ~350 MB used (dashboard → Database → Usage), upgrade to Pro for 8 GB.
3. **Media storage 1 GB / egress 5 GB/mo** — a photo-happy community hits this before the DB wall. Pro solves both.

**Special mention — not size but survival:**
- ⚠️ **Free projects pause after 7 quiet days.** During active testing you're safe; a quiet week silently kills the app.
- ⚠️ **No backups on Free.** One bad migration or accidental deletion is unrecoverable. This alone justifies Pro the day real strangers' data exists.

---

## 5. Known soft spots in *our own code* (fix before scale, fine for the test)

1. **No per-user request rate limit** — a verified member could spam unlimited requests; each triggers dispatch + pushes. Fix: small per-user hourly cap in a trigger (config-driven). Not needed for a trusted test group.
2. **Inbox tab subscribes to ALL message inserts** (`realtime` on the whole `messages` table, RLS-filtered per subscriber) — every message notifies every client sitting on the Inbox tab. Fine at test scale; the first realtime-efficiency refactor at growth (subscribe per-chat or filter server-side).
3. **Online dispatch pings everyone** by deliberate owner choice — revisit `online_wave_size` when the community outgrows one city.
4. **Admin dashboard is localhost-only** — one operator (you), no hosted access.
5. **Single region** — the DB lives in one Supabase region; latency for India depends on the region picked at project creation (check dashboard → Settings → General).

---

## 6. Recommendations by milestone

| Milestone | Action |
|---|---|
| **Now (closed test, ~10–50 testers)** | Free tier is genuinely fine. Just don't go a full week without any traffic. |
| **When strangers' real data exists** | **Upgrade to Pro ($25/mo)** — primarily for daily backups + never-pausing; the 8 GB/500-connection headroom is a bonus. |
| **Public launch** | Pro + Resend paid (signup emails) + set `online_wave_size` + add the per-user request cap + host the admin dashboard. |
| **~1–2K daily actives** | Watch realtime concurrency in the dashboard; buy connection packs as needed; refactor the inbox realtime subscription. |
