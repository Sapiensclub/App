'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServer } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';

export type LoginState = { error: string } | null;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: 'Wrong email or password.' };

  // Allowlist check — a valid account is not enough; you must be an admin.
  const svc = supabaseService();
  const { data: row } = await svc.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) {
    await supabase.auth.signOut();
    return { error: 'This account is not authorized for the admin dashboard.' };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
