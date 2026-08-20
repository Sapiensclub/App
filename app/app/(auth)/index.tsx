import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export default function SignIn() {
  const { colors } = useTheme();
  const { signInWithPassword, signUpWithPassword, requestPasswordReset, resetPasswordWithCode } =
    useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
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

  async function onSendResetCode() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Check your email', 'Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(trimmed);
      Alert.alert(
        'Code sent',
        'Check your email for a 6-digit code. It can take a minute to arrive.',
      );
      setMode('reset');
      setPassword('');
    } catch (e) {
      Alert.alert('Could not send the code', messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    // Supabase's OTP length is a project setting (6–10 digits) — accept any.
    if (code.trim().length < 6) {
      Alert.alert('Check the code', 'Enter the full code from the email.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      Alert.alert('Password too short', `Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    try {
      // Success signs the user straight in — the root layout takes over.
      await resetPasswordWithCode(email, code, password);
    } catch (e) {
      Alert.alert('Could not reset', messageOf(e));
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
        behavior="padding"
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
              {mode === 'signup'
                ? 'Create your account'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : mode === 'reset'
                    ? 'Enter the code'
                    : 'Welcome back'}
            </Text>

            {mode === 'forgot' ? (
              <Text variant="body" tone="secondary">
                We&apos;ll email you a code so you can set a new password.
              </Text>
            ) : null}
            {mode === 'reset' ? (
              <Text variant="body" tone="secondary">
                We emailed a code to {email.trim() || 'your address'}. Enter it
                below with your new password.
              </Text>
            ) : null}

            {mode !== 'reset' ? (
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
            ) : (
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary },
                ]}
                placeholder="Code from the email"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={10}
                value={code}
                onChangeText={setCode}
                editable={!busy}
              />
            )}

            {mode !== 'forgot' ? (
              <View
                style={[
                  styles.passwordRow,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: colors.textPrimary }]}
                  placeholder={mode === 'reset' ? 'New password' : 'Password'}
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPassword}
                  textContentType={mode === 'signin' ? 'password' : 'newPassword'}
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  returnKeyType="go"
                  onSubmitEditing={mode === 'reset' ? onResetPassword : onSubmit}
                />
                <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10} style={styles.showBtn}>
                  <Text variant="small" weight="bold" tone="accent">
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Button
              label={
                mode === 'signup'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Email me a code'
                    : mode === 'reset'
                      ? 'Set new password'
                      : 'Sign in'
              }
              onPress={
                mode === 'forgot' ? onSendResetCode : mode === 'reset' ? onResetPassword : onSubmit
              }
              busy={busy}
            />

            {mode === 'signin' ? (
              <Pressable onPress={() => setMode('forgot')} hitSlop={12} disabled={busy} style={styles.linkBtn}>
                <Text variant="label" weight="semibold" center style={underline(colors.accent)}>
                  Forgot password?
                </Text>
              </Pressable>
            ) : null}

            {mode === 'signin' || mode === 'signup' ? (
              <>
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
              </>
            ) : (
              <>
                {mode === 'reset' ? (
                  <Pressable onPress={onSendResetCode} hitSlop={12} disabled={busy} style={styles.linkBtn}>
                    <Text variant="small" weight="semibold" tone="faint" center>
                      Send a new code
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setMode('signin')}
                  hitSlop={12}
                  disabled={busy}
                  style={styles.linkBtn}
                >
                  <Text variant="label" weight="semibold" center style={underline(colors.accent)}>
                    Back to sign in
                  </Text>
                </Pressable>
              </>
            )}
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
  // Short, human auth messages pass through ("Invalid login credentials",
  // "For security purposes, you can only request this after 60 seconds").
  // Server hiccups arrive as raw response dumps — never show those to a person.
  if (
    e instanceof Error &&
    e.message &&
    e.message.length <= 160 &&
    !e.message.trim().startsWith('{')
  ) {
    return e.message;
  }
  return 'Something went wrong on our side. Please try again in a minute.';
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
