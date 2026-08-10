import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Hard cap so a forgotten recording can't run (and upload) forever. */
const MAX_SECONDS = 120;

type Props = {
  disabled?: boolean;
  /** Lets the parent hide the text input while recording. */
  onRecordingChange: (recording: boolean) => void;
  /** Upload + insert the message; recorder shows a spinner until it resolves. */
  onSend: (localUri: string, seconds: number) => Promise<void>;
};

/**
 * The voice-note control for chat input bars. Deliberately tap-based (tap to
 * start, explicit Cancel / Send buttons) rather than press-and-hold — hold
 * gestures fail the 70-year-old accessibility test. While recording it
 * expands to a full row (parent hides its other controls).
 */
export function VoiceRecorder({ disabled, onRecordingChange, onSend }: Props) {
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);

  // Auto-send at the cap. The ref dance keeps the effect's dependency list
  // honest without re-running it every render.
  const finishRef = useRef<() => void>(() => {});
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (recording && !busy && seconds >= MAX_SECONDS) finishRef.current();
  }, [recording, busy, seconds]);

  async function start() {
    if (disabled) return;
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow microphone access in Settings to send a voice note.');
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      onRecordingChange(true);
    } catch {
      Alert.alert('Could not record', 'Please try again.');
    }
  }

  /** Stop the recorder + leave recording audio mode; returns the file uri. */
  async function stopRecorder(): Promise<string | null> {
    try {
      await recorder.stop();
    } catch {
      // already stopped — fine
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch {
      // audio mode reset is best-effort
    }
    return recorder.uri ?? null;
  }

  async function cancel() {
    await stopRecorder();
    setRecording(false);
    onRecordingChange(false);
  }

  async function finish() {
    const secs = Math.max(1, seconds);
    setBusy(true);
    const uri = await stopRecorder();
    if (!uri) {
      setBusy(false);
      setRecording(false);
      onRecordingChange(false);
      Alert.alert('Voice note not sent', 'Please try again.');
      return;
    }
    try {
      await onSend(uri, secs);
    } catch {
      Alert.alert('Voice note not sent', 'Please try again.');
    } finally {
      setBusy(false);
      setRecording(false);
      onRecordingChange(false);
    }
  }

  if (recording || busy) {
    return (
      <View style={styles.recRow}>
        <View style={[styles.dot, { backgroundColor: colors.danger }]} />
        <Text variant="body" weight="semibold">
          {fmt(seconds)}
        </Text>
        <Text variant="small" tone="faint" style={styles.recHint}>
          {busy ? 'Sending…' : 'Recording…'}
        </Text>
        <Pressable
          onPress={cancel}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Cancel recording"
          style={styles.recBtn}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={finish}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Send voice note"
          style={[styles.recBtn, { backgroundColor: colors.accent }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={start}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note"
      style={styles.micBtn}
    >
      <Ionicons name="mic-outline" size={26} color={colors.textSecondary} />
    </Pressable>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  micBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  recHint: { flex: 1 },
  recBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
