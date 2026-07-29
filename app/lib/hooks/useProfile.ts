import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

// A minimal view of the owner's own profile row. (Full generated DB types
// come later; this is the handful of fields Phase 0 screens actually read.)
export type MyProfile = {
  id: string;
  display_name: string | null;
  display_photo_url: string | null;
  celestial_stage: string;
  unique_helps: number;
  total_helps: number;
  member_since: string;
  verified: boolean;
};

/**
 * Loads the current user's own profile row (owner-only via RLS). Returns the
 * profile, a loading flag, and a refetch fn.
 */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, display_name, display_photo_url, celestial_stage, unique_helps, total_helps, member_since, verified',
      )
      .eq('id', userId)
      .single();
    if (!error) setProfile(data as MyProfile);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, loading, refetch: load };
}
