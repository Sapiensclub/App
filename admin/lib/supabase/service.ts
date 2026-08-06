import { createClient } from '@supabase/supabase-js';

import 'server-only';

// Service-role client — bypasses RLS, so it can read reports, flagged chats,
// and every profile. SERVER-SIDE ONLY: the 'server-only' import makes this file
// a build error if it is ever imported into client code, so the service key can
// never reach the browser.
export function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
