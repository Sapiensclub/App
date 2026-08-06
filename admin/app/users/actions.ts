'use server';

import { revalidatePath } from 'next/cache';

import { getAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

async function assertAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error('not authorized');
}

export async function suspendUser(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get('userId') ?? '');
  const days = Number(formData.get('days') ?? 0);
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!userId || !Number.isFinite(days) || days < 1) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.rpc('admin_suspend_user', { p_user: userId, p_days: days, p_note: note });
  if (error) throw error;
  revalidatePath(`/users/${userId}`);
}

export async function banUser(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get('userId') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!userId) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.rpc('admin_ban_user', { p_user: userId, p_note: note });
  if (error) throw error;
  revalidatePath(`/users/${userId}`);
}

export async function liftUser(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get('userId') ?? '');
  if (!userId) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.rpc('admin_lift_user', { p_user: userId });
  if (error) throw error;
  revalidatePath(`/users/${userId}`);
}
