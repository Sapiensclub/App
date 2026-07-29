import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, fonts, type } from '@/theme/tokens';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'small';
type Tone = 'ink' | 'soft' | 'faint' | 'spark' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: keyof typeof fonts;
  center?: boolean;
  /** Cabin Sketch — celebratory moments only (PRD 10.2). */
  celebrate?: boolean;
};

const toneColor: Record<Tone, string> = {
  ink: colors.ink,
  soft: colors.inkSoft,
  faint: colors.inkFaint,
  spark: colors.spark,
  inverse: colors.cloud,
};

// Default weight per variant (all Nunito Sans unless `celebrate`).
const variantWeight: Record<Variant, keyof typeof fonts> = {
  display: 'extrabold',
  title: 'bold',
  heading: 'bold',
  body: 'regular',
  label: 'semibold',
  small: 'regular',
};

/**
 * The single text primitive. Applies the brand font, type scale, and tone so
 * screens never hand-roll fontFamily/among sizes. Use `celebrate` sparingly.
 */
export function Text({
  variant = 'body',
  tone = 'ink',
  weight,
  center,
  celebrate,
  style,
  ...rest
}: TextProps) {
  const fontFamily = celebrate
    ? fonts.celebrate
    : fonts[weight ?? variantWeight[variant]];

  return (
    <RNText
      style={[
        type[variant],
        { fontFamily, color: toneColor[tone] },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}
