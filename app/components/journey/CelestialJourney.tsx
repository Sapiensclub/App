import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  RadialGradient,
  Stop,
} from 'react-native-svg';

// The Celestial Journey visual (PRD 7.8 / website §8): a moon that waxes from
// new → full across the first 100 unique helps, then warms into a rayed sun
// from 500. Driven purely by `unique` (people reached), rendered on the night
// surface. These celestial colors are brand-fixed (identical in both themes).

const MOONLIGHT = '#CDD6FF';
const MOON_HI = '#F3F1FA';
const MOON_EDGE = '#8E97C8';
const GOLD = '#F0C078';
const SUN_HI = '#FFEFC0';
const SUN_EDGE = '#E68A2E';
const SHADOW = '#0B0A18';

const VB_W = 220;
const VB_H = 150;
const CX = 110;
const CY = 74;
const R = 50;

const STARS = [
  { x: 26, y: 28, r: 1.6, o: 0.7 },
  { x: 188, y: 34, r: 2.2, o: 0.9 },
  { x: 54, y: 120, r: 1.4, o: 0.6 },
  { x: 196, y: 104, r: 1.8, o: 0.8 },
  { x: 110, y: 16, r: 1.5, o: 0.7 },
  { x: 20, y: 84, r: 2, o: 0.85 },
  { x: 204, y: 66, r: 1.3, o: 0.6 },
  { x: 40, y: 54, r: 1.2, o: 0.5 },
];

export function CelestialJourney({ unique, width = 300 }: { unique: number; width?: number }) {
  const height = (width * VB_H) / VB_W;
  const isSun = unique >= 500;
  const phaseFrac = Math.min(unique / 100, 1); // 0 = new moon, 1 = full moon
  const shadowCx = CX - phaseFrac * 2 * R; // shadow slides off to reveal the disc

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <RadialGradient id="moon" cx="42%" cy="38%" r="70%">
          <Stop offset="0%" stopColor={MOON_HI} />
          <Stop offset="70%" stopColor={MOONLIGHT} />
          <Stop offset="100%" stopColor={MOON_EDGE} />
        </RadialGradient>
        <RadialGradient id="sun" cx="42%" cy="38%" r="72%">
          <Stop offset="0%" stopColor={SUN_HI} />
          <Stop offset="60%" stopColor={GOLD} />
          <Stop offset="100%" stopColor={SUN_EDGE} />
        </RadialGradient>
        <ClipPath id="disc">
          <Circle cx={CX} cy={CY} r={R} />
        </ClipPath>
      </Defs>

      {STARS.map((s, i) => (
        <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={MOONLIGHT} opacity={s.o} />
      ))}

      <Circle cx={CX} cy={CY} r={R + 8} fill={isSun ? GOLD : MOONLIGHT} opacity={0.14} />

      {isSun
        ? Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            return (
              <Line
                key={i}
                x1={CX + Math.cos(a) * (R + 6)}
                y1={CY + Math.sin(a) * (R + 6)}
                x2={CX + Math.cos(a) * (R + 20)}
                y2={CY + Math.sin(a) * (R + 20)}
                stroke={GOLD}
                strokeWidth={3}
                strokeLinecap="round"
                opacity={0.85}
              />
            );
          })
        : null}

      <Circle cx={CX} cy={CY} r={R} fill={isSun ? 'url(#sun)' : 'url(#moon)'} />

      {!isSun ? (
        <G clipPath="url(#disc)">
          <Circle cx={shadowCx} cy={CY} r={R} fill={SHADOW} opacity={0.92} />
        </G>
      ) : null}
    </Svg>
  );
}
