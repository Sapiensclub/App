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

import { identifyUser, resetAnalytics, track } from '../analytics';
import { supabase } from '../supabase';

type SignUpResult = { needsEmailConfirmation: boolean };

type AuthContextValue = {
  /** Current signed-in session, or null. */
  session: Session | null;
  /** True until we've checked storage for an existing session at startup. */
  initializing: boolean;
  /** Create an account with email + password. */
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>;
  /** Sign in with email + password. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /**
   * Email a recovery code (length = the project's Email OTP setting, 6–10).
   * Requires the Supabase "Reset password" email template to include
   * {{ .Token }} (see docs/PRELAUNCH_CHECKLIST.md).
   */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Verify the emailed code + set the new password. Signs the user in. */
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

// NOTE (Phase 0): email + password is a deliberately simple auth path for
// testing — no email delivery required to log in. The real flow is email OTP /
// magic link (added once a proper email provider is configured). Both are just
// different Supabase auth calls behind this same context, so screens don't
// change when we swap. Phone OTP remains stubbed in ./phoneOtp.

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
    //    Also tie the analytics identity to the session here.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next?.user) {
        identifyUser(next.user.id, { email: next.user.email ?? null });
      } else if (event === 'SIGNED_OUT') {
        resetAnalytics();
      }
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
    async signUpWithPassword(email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      track('signed_up', { method: 'email_password' });
      // If "Confirm email" is ON in Supabase, signUp returns a user but no
      // session (they must confirm first). With it OFF (recommended for Phase
      // 0 testing), a session is returned and onAuthStateChange logs them in.
      return { needsEmailConfirmation: !data.session };
    },
    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      track('signed_in', { method: 'email_password' });
    },
    async requestPasswordReset(email) {
      // No redirectTo: we use the CODE path (verifyOtp), not a magic link —
      // codes work the same in Expo Go, a store build, and on web.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      track('password_reset_requested');
    },
    async resetPasswordWithCode(email, code, newPassword) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery',
      });
      if (verifyError) throw verifyError;
      // verifyOtp established a session; now store the new password on it.
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      track('password_reset_completed');
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
