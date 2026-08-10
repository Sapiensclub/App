import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { radius as radii, spacing } from '@/theme/tokens';

/**
 * A photo message inside a chat bubble: thumbnail → tap → full-screen viewer
 * (tap anywhere to close). url is a short-lived signed URL; if it's missing
 * (expired sign, purged photo) we say so instead of showing a broken image.
 */
export function PhotoBubble({ url }: { url: string | null }) {
  const [open, setOpen] = useState(false);

  if (!url) {
    return (
      <Text variant="small" tone="faint" style={styles.missing}>
        Photo unavailable
      </Text>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="Photo. Tap to view full screen."
      >
        <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" transition={150} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.viewer}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Image source={{ uri: url }} style={styles.full} contentFit="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 200, height: 200, borderRadius: radii.md },
  missing: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(11, 10, 24, 0.94)', // celestial-night-deep dim
    justifyContent: 'center',
  },
  full: { width: '100%', height: '85%' },
});
