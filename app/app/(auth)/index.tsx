import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth/AuthProvider';
import { phoneOtp, PhoneOtpNotAvailableError } from '@/lib/auth/phoneOtp';
import { colors } from '@/theme/tokens';

type Mode = 'signin' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export default function SignIn() {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function onSubmit() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Check your email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      Alert.alert(
        'Password too short',
        `Use at least ${MIN_PASSWORD} characters.`,
      );
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { needsEmailConfirmation } = await signUpWithPassword(
          trimmed,
          password,
        );
        if (needsEmailConfirmation) {
          Alert.alert(
            'Confirm your email',
            'Account created. Email confirmation is turned on, so check your ' +
              'inbox to confirm before signing in. (You can turn this off in ' +
              'Supabase for easier testing.)',
          );
        }
        // Otherwise the auth listener logs us in and the app swaps screens.
      } else {
        await signInWithPassword(trimmed, password);
      }
    } catch (e) {
      Alert.alert(
        isSignup ? 'Could not create account' : 'Could not sign in',
        messageOf(e),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPhoneInstead() {
    // Demonstrates the phone-OTP seam. The stub throws a friendly error in
    // Phase 0; the real SMS provider replaces it later with no UI change.
    try {
      await phoneOtp.sendCode('+910000000000');
    } catch (e) {
      const msg =
        e instanceof PhoneOtpNotAvailableError ? e.message : messageOf(e);
      Alert.alert('Phone sign-in', msg);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={styles.brand}>Sapiens</Text>
            <Text style={styles.tagline}>People helping people, nearby.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>
              {isSignup ? 'Create your account' : 'Welcome back'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              returnKeyType="next"
            />

            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                textContentType={isSignup ? 'newPassword' : 'password'}
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={10}
                style={styles.showBtn}
              >
                <Text style={styles.showText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>

            <PrimaryButton
              label={isSignup ? 'Create account' : 'Sign in'}
              onPress={onSubmit}
              busy={busy}
            />

            <Pressable
              onPress={() => setMode(isSignup ? 'signin' : 'signup')}
              hitSlop={12}
              disabled={busy}
            >
              <Text style={styles.link}>
                {isSignup
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
              </Text>
            </Pressable>

            <Pressable onPress={onPhoneInstead} hitSlop={12} disabled={busy}>
              <Text style={styles.linkMuted}>Use phone instead</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        busy && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.cloud} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    gap: 40,
  },
  header: { alignItems: 'center', gap: 8 },
  brand: { fontSize: 44, fontWeight: '800', color: colors.ink },
  tagline: { fontSize: 17, color: colors.inkSoft, textAlign: 'center' },
  form: { gap: 16 },
  label: { fontSize: 20, fontWeight: '700', color: colors.ink },
  input: {
    backgroundColor: colors.cloud,
    borderWidth: 1,
    borderColor: '#E3DACB',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 18,
    color: colors.ink,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cloud,
    borderWidth: 1,
    borderColor: '#E3DACB',
    borderRadius: 14,
    paddingRight: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 18,
    color: colors.ink,
  },
  showBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  showText: { color: colors.spark, fontSize: 15, fontWeight: '700' },
  button: {
    backgroundColor: colors.spark,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.cloud, fontSize: 18, fontWeight: '700' },
  link: {
    color: colors.spark,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
  },
  linkMuted: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
