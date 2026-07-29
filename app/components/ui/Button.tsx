import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';

import { colors, radius, spacing, HIT_TARGET } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  /** Optional leading element (e.g. an icon). */
  left?: React.ReactNode;
};

/**
 * The one button. Large touch target, high contrast, clear pressed + busy
 * states. `primary` = filled spark; `secondary` = outlined; `ghost` = text.
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
  const isDisabled = disabled || busy;
  const tone = variant === 'primary' ? 'inverse' : 'spark';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.cloud : colors.spark} />
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
    borderRadius: radius.lg,
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
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.spark },
  secondary: {
    backgroundColor: colors.cloud,
    borderWidth: 1.5,
    borderColor: colors.spark,
  },
  ghost: { backgroundColor: 'transparent' },
});
