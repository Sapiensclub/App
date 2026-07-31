import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

// Trust meter (PRD 7.7): the average star rating from people you've met.
export function TrustStars({ avg }: { avg: number | null }) {
  const { colors } = useTheme();
  const value = avg ?? 0;

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= Math.round(value);
          return (
            <Ionicons
              key={n}
              name={filled ? 'star' : 'star-outline'}
              size={20}
              color={filled ? colors.gold : colors.textFaint}
            />
          );
        })}
      </View>
      <Text variant="body" weight="bold">
        {avg == null ? 'New' : avg.toFixed(1)}
      </Text>
    </View>
  );
}
