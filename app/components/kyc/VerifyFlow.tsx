import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components/ui';
import { track } from '@/lib/analytics';
import { kyc, type KycIdType } from '@/lib/kyc/kycProvider';
import { persistVerification } from '@/lib/kyc/persist';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Step = 'intro' | 'form' | 'processing' | 'success';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after the profile is verified (parent should refetch the profile). */
  onVerified: () => void;
};

/**
 * The verification gate (PRD 2.1) + the mock KYC flow. Framing: "Verification
 * isn't a hurdle. It's the foundation." The steps mirror a real provider
 * (choose ID → confirm name → liveness) but nothing real is checked yet.
 */
export function VerifyFlow({ visible, onClose, onVerified }: Props) {
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('intro');
  const [idType, setIdType] = useState<KycIdType>('aadhaar');
  const [name, setName] = useState('');

  function reset() {
    setStep('intro');
    setName('');
    setIdType('aadhaar');
  }

  function close() {
    reset();
    onClose();
  }

  async function runVerify() {
    if (!name.trim()) {
      Alert.alert('Your name', 'Please enter your name as it appears on your ID.');
      return;
    }
    setStep('processing');
    track('verification_started', { id_type: idType });
    try {
      const result = await kyc.verify({ name, idType });
      await persistVerification(result);
      track('verified', { method: 'mock' });
      setStep('success');
    } catch {
      Alert.alert('Verification failed', 'Something went wrong. Please try again.');
      setStep('form');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
        {step !== 'processing' && step !== 'success' ? (
          <View style={styles.topBar}>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.topBarSpacer} />
        )}

        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
        >
          {step === 'intro' ? (
            <View style={styles.body}>
              <View style={styles.center}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="shield-checkmark-outline" size={48} color={colors.accent} />
                </View>
                <Text variant="title" center>
                  Verify to continue
                </Text>
                <Text variant="body" tone="secondary" center style={styles.copy}>
                  Everyone on Sapiens is a verified real person before they give
                  or receive help. It is what keeps every meeting safe.
                </Text>
                <Text variant="heading" weight="bold" center celebrate style={styles.tagline}>
                  Verification isn&apos;t a hurdle. It&apos;s the foundation.
                </Text>
              </View>
              <View style={styles.footer}>
                {kyc.isStub ? (
                  <Text variant="small" tone="faint" center>
                    Demo verification — no real ID is checked yet. The real
                    Aadhaar / Driving Licence + liveness check drops in later.
                  </Text>
                ) : null}
                <Button label="Verify now" onPress={() => setStep('form')} />
                <Pressable onPress={close} hitSlop={12} style={styles.ghostLink}>
                  <Text variant="label" weight="semibold" tone="faint" center>
                    Not now
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 'form' ? (
            <View style={styles.body}>
              <View style={styles.formTop}>
                <Text variant="heading" weight="bold">
                  Choose your ID
                </Text>
                <View style={styles.segment}>
                  <SegmentButton
                    label="Aadhaar"
                    active={idType === 'aadhaar'}
                    onPress={() => setIdType('aadhaar')}
                  />
                  <SegmentButton
                    label="Driving Licence"
                    active={idType === 'driving_licence'}
                    onPress={() => setIdType('driving_licence')}
                  />
                </View>

                <TextField
                  label="Your name (as on your ID)"
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="go"
                  onSubmitEditing={runVerify}
                />

                <Text variant="small" tone="faint">
                  Mock verification for testing — a real ID scan and liveness
                  selfie will run here in a later build.
                </Text>
              </View>
              <View style={styles.footer}>
                <Button label="Verify" onPress={runVerify} />
              </View>
            </View>
          ) : null}

          {step === 'processing' ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text variant="heading" weight="bold" center style={{ marginTop: spacing.lg }}>
                Verifying…
              </Text>
              <Text variant="body" tone="secondary" center>
                Checking your ID and liveness.
              </Text>
            </View>
          ) : null}

          {step === 'success' ? (
            <View style={styles.body}>
              <View style={styles.center}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="checkmark-circle" size={64} color={colors.success} />
                </View>
                <Text variant="title" center>
                  You&apos;re verified
                </Text>
                <Text variant="body" tone="secondary" center style={styles.copy}>
                  You can now ask for help and help others nearby.
                </Text>
              </View>
              <View style={styles.footer}>
                <Button
                  label="Continue"
                  onPress={() => {
                    onVerified();
                    reset();
                  }}
                />
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segmentBtn,
        {
          backgroundColor: active ? colors.accentSoft : 'transparent',
          borderColor: active ? colors.accent : colors.surfaceEdge,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text variant="label" weight="semibold" tone={active ? 'accent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, alignItems: 'flex-start' },
  topBarSpacer: { height: spacing.xxl },
  body: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  copy: { maxWidth: 340 },
  tagline: { maxWidth: 340, marginTop: spacing.md },
  formTop: { paddingTop: spacing.xl, gap: spacing.lg },
  segment: { flexDirection: 'row', gap: spacing.md },
  segmentBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  footer: { gap: spacing.md, paddingBottom: spacing.lg },
  ghostLink: { paddingVertical: spacing.sm },
});
