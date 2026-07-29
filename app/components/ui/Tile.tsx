import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';
import { Text } from './Text';

type TileProps = {
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** 'filled' = spark background (the primary action); 'plain' = card look. */
  variant?: 'filled' | 'plain';
};

/**
 * A big, friendly tappable tile — the raise-help home actions and (later) the
 * category grid. Icon + plain words, generous target (PRD 10.5 accessibility).
 */
export function Tile({ label, hint, icon, onPress, variant = 'plain' }: TileProps) {
  const filled = variant === 'filled';
  const fg = filled ? colors.cloud : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        filled ? styles.filled : styles.plain,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, filled ? styles.iconWrapFilled : styles.iconWrapPlain]}>
        <Ionicons name={icon} size={28} color={filled ? colors.cloud : colors.spark} />
      </View>
      <View style={styles.textWrap}>
        <Text variant="heading" weight="bold" style={{ color: fg }}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" style={{ color: filled ? colors.sparkSoft : colors.inkSoft }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.xl,
    minHeight: 88,
  },
  filled: { backgroundColor: colors.spark },
  plain: {
    backgroundColor: colors.cloud,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  pressed: { opacity: 0.9 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFilled: { backgroundColor: 'rgba(255,255,255,0.18)' },
  iconWrapPlain: { backgroundColor: colors.sparkSoft },
  textWrap: { flex: 1, gap: 2 },
});
