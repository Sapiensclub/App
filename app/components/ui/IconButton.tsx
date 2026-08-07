import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useTheme } from '@/theme/useTheme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required — screen readers announce this (icon-only buttons have no text). */
  label: string;
  size?: number;
  color?: string;
};

/**
 * An icon-only button that's actually accessible: it's a real button to a
 * screen reader, carries a spoken label, and has a generous touch area
 * (hitSlop) without changing the visual layout.
 */
export function IconButton({ name, onPress, label, size = 26, color, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={styles.btn}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color ?? colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
});
