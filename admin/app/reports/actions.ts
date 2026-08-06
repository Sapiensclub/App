'use server';

import { revalidatePath } from 'next/cache';

import { getAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

// Resolve a report. Re-checks admin server-side — never trust the client.
export async function resolveReport(formData: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin) throw new Error('not authorized');

  const reportId = String(formData.get('reportId') ?? '');
  const status = String(formData.get('status') ?? '');
  const resolution = String(formData.get('resolution') ?? '').trim() || null;
  if (!reportId || !['reviewing', 'actioned', 'dismissed'].includes(status)) {
    throw new Error('bad input');
  }

  const svc = supabaseService();
  await svc.from('reports').update({ status, resolution }).eq('id', reportId);

  revalidatePath('/reports');
  revalidatePath(`/reports/${reportId}`);
  revalidatePath('/');
}
