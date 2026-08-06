import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Per-request Supabase client bound to the admin's auth cookies. Used to read
// WHO is signed in (getUser validates the token with the auth server). Setting
// cookies only works in Server Actions / Route Handlers — in a Server Component
// render the setAll throws and is safely ignored (the session still resolves
// for that request).
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render — ignore (no cookie writes here).
          }
        },
      },
    },
  );
}
