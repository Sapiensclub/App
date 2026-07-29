// Sapiens design tokens.
// Design language inherits the website (PRD 10.2): warm paper / ink / spark
// + celestial night. Nunito Sans is the workhorse for ALL UI text; Cabin
// Sketch is reserved for celebratory moments only. Built for the 70-year-old
// test (PRD 10.1): large touch targets, high contrast, generous spacing.

export const colors = {
  paper: '#FAF6EF', // warm background
  paperEdge: '#EFE8DA', // subtle borders/dividers on paper
  ink: '#221D16', // primary text
  inkSoft: '#6B6257', // secondary text
  inkFaint: '#9A9084', // hints, placeholders
  spark: '#E8622C', // spark-orange accent (primary actions)
  sparkSoft: '#FBE9E0', // spark tint (pressed/selected fills)
  night: '#1B2440', // celestial night (Journey / celebratory)
  cloud: '#FFFFFF', // cards on paper
  success: '#2E7D5B',
  danger: '#C0392B', // SOS / destructive (used from Phase 5)
} as const;

// 4-point spacing scale. Use these instead of raw numbers so screens stay
// consistent.
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

// Font family keys — must match the names registered in useAppFonts().
export const fonts = {
  // Nunito Sans — all functional/body/UI text.
  regular: 'NunitoSans_400Regular',
  medium: 'NunitoSans_500Medium',
  semibold: 'NunitoSans_600SemiBold',
  bold: 'NunitoSans_700Bold',
  extrabold: 'NunitoSans_800ExtraBold',
  // Cabin Sketch — celebratory moments ONLY (milestones, the Journey).
  celebrate: 'CabinSketch_700Bold',
} as const;

// Type scale (fontSize / lineHeight), tuned large for older eyes.
export const type = {
  display: { fontSize: 40, lineHeight: 46 },
  title: { fontSize: 30, lineHeight: 36 },
  heading: { fontSize: 22, lineHeight: 28 },
  body: { fontSize: 17, lineHeight: 25 },
  label: { fontSize: 16, lineHeight: 20 },
  small: { fontSize: 14, lineHeight: 19 },
} as const;

// Minimum tappable height for interactive controls (accessibility).
export const HIT_TARGET = 52;
