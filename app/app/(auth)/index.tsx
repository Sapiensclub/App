import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Logo } from '@/components/Logo';
import { Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { phoneOtp, PhoneOtpNotAvailableError } from '@/lib/auth/phoneOtp';
import { radius, spacing, type as typeScale } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Mode = 'signin' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export default function SignIn() {
  const { colors } = useTheme();
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
      Alert.alert('Password too short', `Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { needsEmailConfirmation } = await signUpWithPassword(trimmed, password);
        if (needsEmailConfirmation) {
          Alert.alert(
            'Confirm your email',
            'Account created. Email confirmation is on, so check your inbox to ' +
              'confirm before signing in. (You can turn this off in Supabase for testing.)',
          );
        }
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
    try {
      await phoneOtp.sendCode('+910000000000');
    } catch (e) {
      const msg = e instanceof PhoneOtpNotAvailableError ? e.message : messageOf(e);
      Alert.alert('Phone sign-in', msg);
    }
  }

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View style={styles.header}>
            <Logo height={72} />
            <Text variant="display" center style={styles.brand}>
              Sapiens
            </Text>
            <Text variant="body" tone="secondary" center>
              People helping people, nearby.
            </Text>
          </View>

          <View style={styles.form}>
            <Text variant="heading" weight="bold">
              {isSignup ? 'Create your account' : 'Welcome back'}
            </Text>

            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              returnKeyType="next"
            />

            <View
              style={[
                styles.passwordRow,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <TextInput
                style={[styles.passwordInput, { color: colors.textPrimary }]}
                placeholder="Password"
                placeholderTextColor={colors.textFaint}
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
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10} style={styles.showBtn}>
                <Text variant="small" weight="bold" tone="accent">
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>

            <Button
              label={isSignup ? 'Create account' : 'Sign in'}
              onPress={onSubmit}
              busy={busy}
            />

            <Pressable
              onPress={() => setMode(isSignup ? 'signin' : 'signup')}
              hitSlop={12}
              disabled={busy}
              style={styles.linkBtn}
            >
              <Text variant="label" weight="semibold" center style={underline(colors.accent)}>
                {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </Text>
            </Pressable>

            <Pressable onPress={onPhoneInstead} hitSlop={12} disabled={busy} style={styles.linkBtn}>
              <Text variant="small" weight="semibold" tone="faint" center>
                Use phone instead
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function underline(color: string) {
  return {
    textDecorationLine: 'underline' as const,
    textDecorationColor: color,
  };
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: spacing.xxxl },
  header: { alignItems: 'center', gap: spacing.sm },
  brand: { marginTop: spacing.sm },
  form: { gap: spacing.lg },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: typeScale.body.fontSize,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingRight: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: typeScale.body.fontSize,
  },
  showBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  linkBtn: { paddingVertical: 4 },
});
