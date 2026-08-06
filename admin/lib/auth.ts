import { redirect } from 'next/navigation';

import { createSupabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';

export type AdminUser = { id: string; email: string | null };

/** The signed-in admin, or null (not signed in, or not on the allowlist). */
export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = supabaseService();
  const { data: row } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!row) return null;

  return { id: user.id, email: user.email ?? null };
}

/** Gate a page: returns the admin, or redirects to /login. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect('/login');
  return admin;
}
