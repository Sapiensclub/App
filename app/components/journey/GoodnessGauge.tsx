import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

// A half-circle gauge for the Goodness meter (0–100). The needle moves for a
// normal helper (the curve is tuned so ~100 unique helps approaches 100).
const W = 200;
const H = 116;
const R = 82;
const CX = 100;
const CY = 100;
const ARC = 'M 18 100 A 82 82 0 0 1 182 100'; // left → top → right
const LEN = Math.PI * R; // arc length

export function GoodnessGauge({ score }: { score: number }) {
  const { colors } = useTheme();
  const frac = Math.max(0, Math.min(1, score / 100));

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={ARC} stroke={colors.surfaceEdge} strokeWidth={12} strokeLinecap="round" fill="none" />
        <Path
          d={ARC}
          stroke={colors.gold}
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${frac * LEN} ${LEN}`}
        />
      </Svg>
      <View style={{ marginTop: -H * 0.42, alignItems: 'center' }}>
        <Text variant="display" weight="extrabold" style={{ color: colors.gold }}>
          {Math.round(score)}
        </Text>
        <Text variant="small" tone="faint">
          out of 100
        </Text>
      </View>
    </View>
  );
}
