'use server';

import { revalidatePath } from 'next/cache';

import { getAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

async function assertAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error('not authorized');
}

export async function approveSuggestion(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const parent = String(formData.get('parent') ?? '') || null;
  const icon = String(formData.get('icon') ?? '').trim() || null;
  if (!id || !label) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.rpc('admin_approve_suggestion', {
    p_id: id,
    p_label: label,
    p_parent: parent,
    p_icon: icon,
  });
  if (error) throw error;
  revalidatePath('/suggestions');
  revalidatePath('/');
}

export async function rejectSuggestion(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.rpc('admin_reject_suggestion', { p_id: id });
  if (error) throw error;
  revalidatePath('/suggestions');
  revalidatePath('/');
}
