// Reads the public env vars Expo injects at build time. Fails loudly if a
// required one is missing, so a blank .env.local gives a clear message instead
// of a confusing network error later.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy app/.env.example to app/.env.local and fill it in, ` +
        `then restart the dev server (env vars only load at startup).`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
};
