import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '../supabase';

type AuthContextValue = {
  /** Current signed-in session, or null. */
  session: Session | null;
  /** True until we've checked storage for an existing session at startup. */
  initializing: boolean;
  /** Email a 6-digit sign-in code (creates the account on first use). */
  sendEmailCode: (email: string) => Promise<void>;
  /** Verify the emailed code; on success the session is set automatically. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // 1. Load any persisted session from secure storage at startup.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    // 2. Keep in sync with every future auth change (sign-in, sign-out, token
    //    refresh) — this is what makes "still logged in after restart" work.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // 3. React Native best practice: only auto-refresh tokens while the app is
    //    in the foreground, to avoid needless background network churn.
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
      appState.current = next;
    };
    const appSub = AppState.addEventListener('change', onAppStateChange);
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();

    return () => {
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    initializing,
    async sendEmailCode(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // Allow new users to be created by signing in — this is both sign-up
        // and sign-in. (KYC verification is a separate gate, added in Phase 1.)
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    },
    async verifyEmailCode(email, code) {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
