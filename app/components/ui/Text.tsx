import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { fonts, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'small';
type Tone = 'primary' | 'secondary' | 'faint' | 'accent' | 'moonlight' | 'onAccent';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: keyof typeof fonts;
  center?: boolean;
  /** Force Cabin Sketch (celebratory body-size text, e.g. a milestone line). */
  celebrate?: boolean;
};

// Font per variant. display + title are the Cabin Sketch headlines; heading and
// below stay in Nunito Sans (kept under Cabin Sketch's ~28px size floor).
const variantFont: Record<Variant, keyof typeof fonts> = {
  display: 'display',
  title: 'display',
  heading: 'bold',
  body: 'regular',
  label: 'semibold',
  small: 'regular',
};

/**
 * The single text primitive — applies the brand fonts, type scale, and a
 * theme-aware tone so screens never hand-roll fontFamily/sizes/colors.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  center,
  celebrate,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  const toneColor: Record<Tone, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    faint: colors.textFaint,
    accent: colors.accent, // use only at >=24px on paper (contrast); fine on night
    moonlight: colors.moonlight, // secondary text on night surfaces
    onAccent: colors.onAccent,
  };

  const fontFamily = celebrate
    ? fonts.celebrate
    : fonts[weight ?? variantFont[variant]];

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
