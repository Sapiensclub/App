import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';

import { sketch, spacing, HIT_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'night';

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  left?: React.ReactNode;
};

/**
 * The one button — hand-drawn "wobble" corners, high contrast, large target.
 * primary = spark fill · secondary = ink outline · ghost = text only ·
 * night = gold fill (for celestial/night surfaces). All labels are onAccent
 * (dark) text — spark/gold are fills, never small colored text (contrast).
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  left,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || busy;

  const fill: Record<Variant, object> = {
    primary: { backgroundColor: colors.accent },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: colors.textPrimary,
    },
    ghost: { backgroundColor: 'transparent' },
    night: { backgroundColor: colors.gold },
  };
  // ghost sits on the page → primary text; the rest sit on a light fill/outline.
  const tone = variant === 'ghost' ? 'primary' : variant === 'secondary' ? 'primary' : 'onAccent';
  const spinner = variant === 'primary' || variant === 'night' ? colors.onAccent : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      style={({ pressed }) => [
        styles.base,
        variant !== 'ghost' && sketch.button,
        fill[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={spinner} />
      ) : (
        <View style={styles.content}>
          {left}
          <Text variant="label" weight="bold" tone={tone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_TARGET,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
