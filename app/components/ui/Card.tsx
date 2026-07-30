import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { sketch, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type CardProps = {
  children: ReactNode;
  /** 'night' = celestial dark surface, for the Journey / celebratory moments. */
  tone?: 'surface' | 'night';
  style?: StyleProp<ViewStyle>;
};

/** A soft, hand-drawn rounded container that sits on the page background. */
export function Card({ children, tone = 'surface', style }: CardProps) {
  const { colors } = useTheme();

  const toneStyle: ViewStyle =
    tone === 'night'
      ? { backgroundColor: colors.night, borderWidth: 1, borderColor: colors.nightEdge }
      : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceEdge };

  return <View style={[styles.base, toneStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    ...sketch.card,
    padding: spacing.xl,
  },
});
