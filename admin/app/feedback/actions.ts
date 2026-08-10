'use server';

import { revalidatePath } from 'next/cache';

import { getAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

async function assertAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new Error('not authorized');
}

/** Move a feedback note through new → seen → done. */
export async function setFeedbackStatus(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !['new', 'seen', 'done'].includes(status)) throw new Error('bad input');

  const svc = supabaseService();
  const { error } = await svc.from('feedback').update({ status }).eq('id', id);
  if (error) throw error;
  revalidatePath('/feedback');
}
