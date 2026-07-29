# Sapiens

A hyperlocal mutual-aid app: verified real people help each other in person, for free.
No money for help. No profiles to surf. No feed to scroll. Trust is built by helping.

The full design lives in [`docs/Sapiens PRD.pdf`](docs) and the build plan in
[`docs/Sapiens_App_MVP_Build_Spec.pdf`](docs).

## Repository layout (monorepo)

| Folder      | What it is                                                        |
| ----------- | ----------------------------------------------------------------- |
| `/app`      | The mobile app — React Native + Expo (TypeScript), `expo-router`  |
| `/admin`    | Trust & Safety dashboard — Next.js (stub until Phase 7)           |
| `/supabase` | Database migrations (SQL + RLS), Edge Functions, seed data        |
| `/docs`     | The PRD and MVP build specification (source of truth)             |

## Running the mobile app

```
cd app
npm install
npx expo start
```

Then scan the QR code with your phone (Expo Go must be installed).

## Secrets

Real keys live only in `.env.local` files, which are **gitignored**.
Each project folder has a committed `.env.example` listing the keys it needs —
copy it to `.env.local` and fill in the values from the service dashboards.
Never commit a real key.

## Build phases

Built strictly in the phase order of the build spec §7, one phase at a time.

- **Phase 0 — Foundation** ← _current_: monorepo, schema + RLS, auth (email OTP;
  phone OTP stubbed), themed component kit, PostHog.
- Phase 1 — Identity & profile (KYC stubbed, provider swaps in later)
- Phase 2 — The spine: requests + dispatch engine
- Phase 3 — Reward & reputation
- Phase 4 — Connections & inbox
- Phase 5 — SOS
- Phase 6 — Community & notifications
- Phase 7 — Admin / Trust & Safety dashboard
- Phase 8 — Hardening & store prep
