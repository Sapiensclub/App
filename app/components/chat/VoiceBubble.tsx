import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = {
  /** Short-lived signed URL (null → expired sign or purged file). */
  url: string | null;
  /** Whether this is the caller's own bubble (accent background → light controls). */
  mine: boolean;
  /** Length in seconds from message.body — shown before the audio loads. */
  durationHint?: number | null;
};

/** A voice-note message: play/pause + progress + duration. */
export function VoiceBubble({ url, mine, durationHint }: Props) {
  const { colors } = useTheme();
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  if (!url) {
    return (
      <Text variant="small" tone={mine ? 'onAccent' : 'faint'}>
        Voice note unavailable
      </Text>
    );
  }

  const total = status.duration > 0 ? status.duration : (durationHint ?? 0);
  const progress = total > 0 ? Math.min(status.currentTime / total, 1) : 0;
  const fg = mine ? colors.onAccent : colors.textPrimary;

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // iOS: respect the moment — but a deliberately tapped voice note should be
    // audible even with the silent switch on.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (total > 0 && status.currentTime >= total - 0.05) player.seekTo(0); // replay
    player.play();
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={
          status.playing ? 'Pause voice note' : `Play voice note, ${fmt(total)}`
        }
        style={[styles.playBtn, { borderColor: fg }]}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={fg} />
      </Pressable>
      <View style={styles.trackWrap}>
        <View style={[styles.track, { backgroundColor: fg, opacity: 0.3 }]} />
        <View
          style={[
            styles.track,
            styles.trackFill,
            { backgroundColor: fg, width: `${progress * 100}%` },
          ]}
        />
      </View>
      <Text variant="small" tone={mine ? 'onAccent' : 'secondary'} style={styles.time}>
        {fmt(status.playing || status.currentTime > 0 ? status.currentTime : total)}
      </Text>
    </View>
  );
}

function fmt(s: number) {
  const whole = Math.max(0, Math.round(s));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 200,
    minHeight: 44,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrap: { flex: 1, height: 5, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 5,
    borderRadius: 2.5,
  },
  trackFill: { right: undefined },
  time: { minWidth: 34, textAlign: 'right' },
});
