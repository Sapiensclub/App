# Sapiens — Pre-Launch Checklist

Everything that must happen before the app is open to the public. Grouped by
who does it. Items marked **[code done]** are built; the rest are your / vendor /
lawyer tasks. Nothing here should be skipped for a public launch.

---

## 1. Technical — flip to production

- [ ] **Remove dev backdoors**: run `supabase/PRELAUNCH_TEARDOWN.sql` once in the
      Supabase SQL editor (drops `admin_reset_help_data`, `admin_set_helper_location`).
      Verify with the query at the bottom of that file.
- [ ] **Do not deploy `app/scripts/*`** — the harnesses/seeders use the service key.
      They live only in the repo for local dev.
- [ ] **Make email confirmation actually WORK before launch** (it is ON as of
      Sep 2026; closed-test signups are created pre-confirmed via
      `app/scripts/create-tester.mjs` instead). For self-serve signup to work:
      (1) Auth → URL Configuration → set **Site URL** to the hosted web app
      (default localhost:3000 breaks every confirmation link) + add redirect
      allowlist entries; (2) verify the **Confirm signup** template sends and
      lands (check Resend Emails log + spam; only the Reset template was
      customized) — or switch it to a {{ .Token }} code + in-app entry, same
      pattern as password reset; (3) Auth → Rate Limits → raise emails/hour
      (custom-SMTP default 30/h is too low for launch); (4) consider phone-OTP
      instead (the seam is `app/lib/auth/phoneOtp.ts`).
- [ ] **Custom SMTP for auth emails** (Auth → SMTP) — REQUIRED, not optional
      (learned 2026-08-10): Supabase's built-in mailer no longer allows editing
      email templates at all, so the in-app password-reset flow (needs the
      {{ .Token }} 6-digit code in the "Reset password" template) is DORMANT
      until custom SMTP exists (free options: Resend w/ verified domain, Brevo).
      Interim workaround for testing: `app/scripts/reset-password.mjs <email>
      <new-password>` (service-key dev script — never deploy).
- [ ] **Rotate PUSH_WEBHOOK_SECRET** (it appeared in a testing screenshot):
      `npx supabase secrets set PUSH_WEBHOOK_SECRET=<new>` + update the
      `push_fn_secret` row in `dispatch_config`.
- [ ] **Enable the pg_cron jobs** and confirm both are scheduled:
      `sapiens-dispatch-tick` (every minute) and `sapiens-retention-sweep` (daily).
- [ ] **PostHog**: add `EXPO_PUBLIC_POSTHOG_KEY` to `app/.env.local` (analytics is
      wired and no-ops until then). **[code done]**
- [ ] **Confirm secrets**: the service key lives ONLY in `admin/.env.local` (server)
      and never in the mobile bundle; all `.env.local` files stay gitignored.
- [ ] **Admin dashboard hardening** (before hosting anywhere but localhost): add
      proxy-based session refresh, lock down deployment auth, serve over HTTPS.

## 2. Replace the stubs with real vendors

Each is isolated behind a seam so it's a small swap:
- [ ] **KYC / liveness** — `app/lib/kyc/kycProvider.ts` (currently `StubKycProvider`
      + `apply_mock_kyc`). Wire the real vendor (Aadhaar/DL + liveness) and the
      face-match against the KYC selfie in `set_display_photo`.
- [ ] **Phone OTP** — `app/lib/auth/phoneOtp.ts` (stub) + a real SMS provider.
- [ ] **SOS alerts** — currently device-native SMS (`app/lib/sos/sosAlerter.ts`).
      Optionally add server-sent SMS once a provider + DLT registration exist.
- [ ] **Push send side** — **[code done]** (2026-08-10): DB triggers (pings,
      bell notifications, chat messages) → `pg_net` → `push-send` Edge Function →
      Expo Push API, with dead-token cleanup. To activate: deploy the function,
      set `PUSH_WEBHOOK_SECRET` (+ optional `EXPO_ACCESS_TOKEN`), and set the
      `push_fn_url` / `push_fn_secret` keys in `dispatch_config` (exact SQL in
      the T1 migration header). Client registration is **[code done]**
      (`app/lib/push.ts`) and activates automatically in an EAS build.

## 3. Build & ship the app (EAS)

- [ ] `eas.json` present with development / preview / production profiles. **[code done]**
- [ ] Confirm the **bundle IDs** in `app.json` (`club.sapiens.app` for iOS + Android) —
      these are permanent once published; change now if you want a different one.
- [ ] `eas init` (adds the EAS `projectId`, which also activates push tokens), then
      `eas build --profile preview` for an installable test build, and
      `eas build --profile production` for the stores.
- [ ] Install a preview build on a real device and verify **push notifications**
      actually arrive (they can't be tested in Expo Go).

## 4. Store submission

- [ ] App icon + splash — **[code done]** (assets in `app/assets/images`).
- [ ] Screenshots (real device), listing title/subtitle/description, keywords.
- [ ] **Privacy policy + Terms URLs** (required by both stores).
- [ ] Apple **App Privacy** questionnaire + Google Play **Data safety** form
      (declare: location, photos, contacts, name — all first-party, no ads/tracking).
- [ ] App Store safety review notes: explain KYC-gated, in-person mutual aid; the SOS
      button and its limits; no payments for help.

## 5. Legal / compliance GATE — blocks public launch (you + a lawyer)

These are **not code** and must be in place before real users:
- [ ] Legal entity + Terms of Service + Privacy Policy.
- [ ] **DPDP Act** (India data protection) compliance; data-processing records.
- [ ] **POCSO** + child-safety posture (the `over_18` gate exists; policy/process needed).
- [ ] **AGE POLICY DECISION (PRD 2.3 + G4)** — decide with counsel BEFORE launch:
      (A) launch **18+ only** — under-18 KYC result → verification refused; simplest
      POCSO/DPDP posture (recommended for v1), or (B) build PRD 2.3 **child mode**
      (group-only, no 1:1 with unknown adults) — NOTE: KYC-ing a minor = processing
      a child's identity data → DPDP requires a verifiable parental-consent flow
      (its own build). Plumbing ready either way: the KYC seam already carries
      `over_18` end-to-end; NOTHING enforces it yet — enforcement ships with the
      real KYC integration.
- [ ] **IT Rules 2021** intermediary obligations (grievance officer, takedown SLAs) —
      the reports/admin flow supports this operationally.
- [ ] Liability & insurance for in-person help; incident-response plan for SOS.
- [ ] **DLT SMS registration** (required to send templated SMS in India).
- [ ] Moneta: confirm it stays non-monetary / non-redeemable, or get regulatory
      advice before any real-world redemption (that feature is [P2] regardless).

---

## Still owed within P1 (features, not launch-blockers)

- ~~Voice notes + photos in chat~~ — **done** (2026-08-10), both chat surfaces.
- **Leaderboard area filters** — need a stored "home area"; v1 is global (fine for a
  closed-community launch).

## Deferred by design — do NOT build for launch
Premium Choice · masked calling · SOS Layer-3 community responders · E2E inbox ·
retroactive help logging · embedded map · real-world Moneta redemption. (See
`context.md` §8 for the full [P2]/[LATER] list.)
