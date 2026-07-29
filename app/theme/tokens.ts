// Sapiens design tokens — matched to the sapiens.club website design system
// (website build spec §2), adapted for mobile ergonomics + the 70-year-old
// accessibility test (PRD 10.1).
//
// Colors are defined as two palettes (light "day" + dark "night") with the
// SAME semantic keys. Components read the active palette via useTheme();
// everything else here (spacing, radius, fonts, type) is theme-independent.

// ── Palettes ────────────────────────────────────────────────────────────────
// Semantic names, not raw color names, so a component says `colors.accent`
// and automatically gets spark in light and the right value in dark.

export const lightColors = {
  bg: '#F7F4EC', // warm paper — screen background
  bgDawn: '#FBF3E4', // dawn-tinted paper (softer surfaces)
  surface: '#FFFFFF', // cards lifted off paper
  surfaceEdge: '#E7DFCF', // hairline borders / dividers

  textPrimary: '#141414', // ink
  textSecondary: '#57534B',
  textFaint: '#8A857C', // hints, placeholders

  accent: '#F59E2D', // spark — THE accent
  accentSoft: '#FDECD3', // spark tint for soft fills / selected states
  onAccent: '#141414', // text/icons on an accent fill (spark is a fill, ink text)

  // Celestial night surface (the Journey / celebratory) — dark in both themes.
  night: '#17142E',
  nightEdge: 'rgba(205,214,255,0.14)',
  moonlight: '#CDD6FF', // text on night
  moonlightStrong: '#FFFFFF',
  gold: '#F0C078', // sun / milestone / Goodness fill

  clay: '#D85A30', // rare warm secondary (badges)
  danger: '#C0392B', // SOS / destructive (Phase 5)
  success: '#2E7D5B',

  inputBg: '#FFFFFF',
  inputBorder: '#E3DACB',

  tabBar: '#FFFFFF',
};

// Same keys as lightColors, values are plain strings (so the dark palette can
// hold different values without fighting literal types).
export type Palette = Record<keyof typeof lightColors, string>;

export const darkColors: Palette = {
  bg: '#0D0B1A', // deep indigo-black night
  bgDawn: '#0D0B1A',
  surface: '#181530', // elevated card
  surfaceEdge: '#2C2950',

  textPrimary: '#F0EEF8',
  textSecondary: '#B4B8D8',
  textFaint: '#7E82A6',

  accent: '#F59E2D', // spark still THE accent — pops on dark
  accentSoft: 'rgba(245,158,45,0.16)',
  onAccent: '#141414', // spark/gold are light fills → dark text

  night: '#201C42', // lifted so the Journey card reads against the dark bg
  nightEdge: 'rgba(205,214,255,0.18)',
  moonlight: '#CDD6FF',
  moonlightStrong: '#FFFFFF',
  gold: '#F0C078',

  clay: '#E0713F',
  danger: '#E0655A',
  success: '#4BB183',

  inputBg: '#181530',
  inputBorder: '#2C2950',

  tabBar: '#131126',
};

// ── Layout ────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

// Hand-drawn "wobble" corners — the website's sketch-border signature,
// approximated in RN with uneven per-corner radii.
export const sketch = {
  button: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 8,
  },
  card: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 14,
  },
} as const;

// ── Type ────────────────────────────────────────────────────────────────
export const fonts = {
  regular: 'NunitoSans_400Regular',
  medium: 'NunitoSans_500Medium',
  semibold: 'NunitoSans_600SemiBold',
  bold: 'NunitoSans_700Bold',
  extrabold: 'NunitoSans_800ExtraBold',
  // Cabin Sketch — display / headlines / celebratory only (never below ~28px).
  display: 'CabinSketch_700Bold',
  displayLight: 'CabinSketch_400Regular',
  celebrate: 'CabinSketch_700Bold',
} as const;

export const type = {
  display: { fontSize: 42, lineHeight: 48 },
  title: { fontSize: 32, lineHeight: 38 },
  heading: { fontSize: 23, lineHeight: 29 },
  body: { fontSize: 17, lineHeight: 26 },
  label: { fontSize: 16, lineHeight: 20 },
  small: { fontSize: 14, lineHeight: 19 },
} as const;

export const HIT_TARGET = 52;
