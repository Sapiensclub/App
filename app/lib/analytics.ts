import PostHog from 'posthog-react-native';

// PostHog analytics. The key is OPTIONAL: if EXPO_PUBLIC_POSTHOG_KEY is unset
// (or you haven't filled .env.local yet), analytics quietly no-ops and the app
// runs normally — nothing here ever throws or blocks the UI.
//
// Trust over engagement (the constitution): we track product health, never
// build dopamine loops. Keep events few and meaningful.

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

export const analyticsEnabled = !!apiKey;

const posthog = apiKey
  ? new PostHog(apiKey, {
      host,
      // Send promptly so events show up during testing (low volume app).
      flushAt: 1,
    })
  : null;

// JSON-safe property values (what PostHog accepts).
type Props = Record<string, string | number | boolean | null>;

/** Record a product event. No-ops when analytics is disabled. */
export function track(event: string, properties?: Props) {
  posthog?.capture(event, properties);
}

/** Associate subsequent events with a signed-in user. */
export function identifyUser(distinctId: string, properties?: Props) {
  posthog?.identify(distinctId, properties);
}

/** Clear identity on sign-out so the next person is a fresh anonymous user. */
export function resetAnalytics() {
  posthog?.reset();
}
