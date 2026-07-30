import { supabase } from '@/lib/supabase';
import type { KycResult } from './kycProvider';

// Persists a verification result. Goes through the SECURITY DEFINER RPC because
// verified/over_18/token are locked from direct client writes by RLS. When the
// real provider lands, this is replaced by its server-side webhook path.
export async function persistVerification(result: KycResult): Promise<void> {
  const { error } = await supabase.rpc('apply_mock_kyc', {
    p_name: result.verifiedName,
    p_token: result.token,
    p_over_18: result.over18,
  });
  if (error) throw error;
}
