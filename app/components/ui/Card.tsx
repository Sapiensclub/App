import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type CardProps = {
  children: ReactNode;
  /** 'night' = celestial dark surface, for the Journey / celebratory moments. */
  tone?: 'cloud' | 'night';
  style?: ViewStyle;
};

/** A soft rounded container that sits on the paper background. */
export function Card({ children, tone = 'cloud', style }: CardProps) {
  return (
    <View style={[styles.base, tone === 'night' ? styles.night : styles.cloud, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  cloud: {
    backgroundColor: colors.cloud,
    borderWidth: 1,
    borderColor: colors.paperEdge,
  },
  night: {
    backgroundColor: colors.night,
  },
});
