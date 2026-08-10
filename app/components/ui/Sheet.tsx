import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/**
 * A bottom sheet for lightweight, focused choices (confirmations, pickers).
 * Slides up over a dimmed backdrop; tap outside or the handle area to close.
 * Lifts itself above the keyboard when a child input focuses — needed
 * explicitly because Android (edge-to-edge) no longer resizes for keyboards.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView style={styles.sheetWrap} behavior="padding" pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={[styles.handle, { backgroundColor: colors.surfaceEdge }]} />
          {title ? (
            <Text variant="heading" weight="bold" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 10, 24, 0.55)', // celestial-night-deep dim
  },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  title: { marginBottom: spacing.xs },
});
