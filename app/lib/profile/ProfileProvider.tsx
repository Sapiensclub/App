import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

// A minimal view of the owner's own profile row. (Full generated DB types
// come later; this is the handful of fields the app currently reads.)
export type MyProfile = {
  id: string;
  display_name: string | null;
  display_photo_url: string | null;
  bio: string | null;
  celestial_stage: string;
  unique_helps: number;
  total_helps: number;
  member_since: string;
  verified: boolean;
  onboarded_at: string | null;
};

const COLUMNS =
  'id, display_name, display_photo_url, bio, celestial_stage, unique_helps, total_helps, member_since, verified, onboarded_at';

type ProfileContextValue = {
  profile: MyProfile | null;
  /** null = not yet known (still loading for a signed-in user). */
  onboarded: boolean | null;
  loading: boolean;
  refetch: () => Promise<void>;
  /** Mark the first-run flow complete (owner-writable). */
  markOnboarded: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
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
      .select(COLUMNS)
      .eq('id', userId)
      .single();
    if (!error) setProfile(data as MyProfile);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const markOnboarded = useCallback(async () => {
    if (!userId) return;
    const stamp = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ onboarded_at: stamp })
      .eq('id', userId);
    if (!error) {
      setProfile((p) => (p ? { ...p, onboarded_at: stamp } : p));
    }
  }, [userId]);

  const onboarded: boolean | null = !userId
    ? null
    : profile
      ? profile.onboarded_at !== null
      : loading
        ? null
        : false;

  return (
    <ProfileContext.Provider
      value={{ profile, onboarded, loading, refetch: load, markOnboarded }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
