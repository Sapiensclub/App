import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, sketch, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
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
 * On the spark-filled tile, text/icon are ink (website rule: spark is a fill).
 */
export function Tile({ label, hint, icon, onPress, variant = 'plain' }: TileProps) {
  const { colors } = useTheme();
  const filled = variant === 'filled';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        filled
          ? { backgroundColor: colors.accent }
          : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceEdge },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: filled ? 'rgba(20,20,20,0.14)' : colors.accentSoft },
        ]}
      >
        <Ionicons name={icon} size={28} color={filled ? colors.onAccent : colors.accent} />
      </View>
      <View style={styles.textWrap}>
        <Text variant="heading" weight="bold" tone={filled ? 'onAccent' : 'primary'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" tone={filled ? 'onAccent' : 'secondary'}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    ...sketch.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    minHeight: 88,
  },
  pressed: { opacity: 0.9 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, gap: 2 },
});
