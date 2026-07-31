import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

// A half-circle gauge for the Goodness meter (0–100). Sizes itself to its
// container so it never touches the card edges.
const VB_W = 200;
const VB_H = 116;
const R = 82;
const ARC = 'M 18 100 A 82 82 0 0 1 182 100'; // left → top → right
const LEN = Math.PI * R;

export function GoodnessGauge({ score }: { score: number }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const frac = Math.max(0, Math.min(1, score / 100));
  const h = (w * VB_H) / VB_W;

  return (
    <View
      style={{ width: '100%', alignItems: 'center' }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 ? (
        <View style={{ width: w, height: h }}>
          <Svg width={w} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`}>
            <Path d={ARC} stroke={colors.surfaceEdge} strokeWidth={13} strokeLinecap="round" fill="none" />
            <Path
              d={ARC}
              stroke={colors.gold}
              strokeWidth={13}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${frac * LEN} ${LEN}`}
            />
          </Svg>
          <View style={{ position: 'absolute', left: 0, right: 0, top: h * 0.4, alignItems: 'center' }}>
            <Text variant="heading" weight="extrabold" style={{ color: colors.gold }}>
              {Math.round(score)}
            </Text>
            <Text variant="small" tone="faint">
              out of 100
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
