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

type Step = 'email' | 'code';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSendCode() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Alert.alert('Check your email', 'Please enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await sendEmailCode(trimmed);
      setStep('code');
    } catch (e) {
      Alert.alert('Could not send code', messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    if (code.trim().length < 6) {
      Alert.alert('Enter the code', 'The code is 6 digits.');
      return;
    }
    setBusy(true);
    try {
      // On success the auth listener updates the session and the app swaps
      // to the signed-in area automatically — nothing to navigate here.
      await verifyEmailCode(email, code);
    } catch (e) {
      Alert.alert('That code did not work', messageOf(e));
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

          {step === 'email' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Sign in with your email</Text>
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
                returnKeyType="go"
                onSubmitEditing={onSendCode}
              />
              <PrimaryButton
                label="Send me a code"
                onPress={onSendCode}
                busy={busy}
              />
              <Pressable onPress={onPhoneInstead} hitSlop={12}>
                <Text style={styles.link}>Use phone instead</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Enter the 6-digit code</Text>
              <Text style={styles.hint}>We emailed it to {email}.</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor={colors.inkSoft}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={onVerify}
                autoFocus
              />
              <PrimaryButton label="Verify" onPress={onVerify} busy={busy} />
              <Pressable
                onPress={onSendCode}
                hitSlop={12}
                disabled={busy}
              >
                <Text style={styles.link}>Resend code</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('email');
                  setCode('');
                }}
                hitSlop={12}
                disabled={busy}
              >
                <Text style={styles.link}>Change email</Text>
              </Pressable>
            </View>
          )}
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
  hint: { fontSize: 15, color: colors.inkSoft, marginTop: -8 },
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
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },
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
});
