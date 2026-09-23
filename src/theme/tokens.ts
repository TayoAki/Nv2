import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens from the Nyoni Couture plan v2 (section 02, "Brand evidence and design system").
 * These are the proposed values; the plan's written tokens take precedence over details
 * that appear in the generated screen concepts.
 */
export const palette = {
  ink: '#0B0B0C', // Primary text, dark surfaces, buttons
  ivory: '#F4F0E8', // Main shopping background
  white: '#FFFFFF', // Product media and clean surfaces
  champagne: '#C4A46A', // Accent / primary action on dark (always with ink text)
  bronze: '#806431', // Small accent text on ivory
  silver: '#C8C8C6', // Decorative borders on dark
  muted: '#62605C', // Secondary text on ivory
  error: '#9B342D',
  success: '#2C654B',
} as const;

/**
 * Semantic colors. The derived tones (surface, media, hairline…) are not in the plan's
 * token table; they were sampled from the screen concepts and should be confirmed by design.
 */
export const colors = {
  ...palette,
  background: palette.ivory,
  surface: '#FBF9F5', // cards and rows on ivory (derived)
  surfaceSunken: '#ECE6DC', // segmented-control track, tags (derived)
  media: '#E8E1D5', // garment image wells (derived)
  hairline: '#DED7CB', // dividers (derived)
  border: '#CDC5B8', // input, chip and outline-button borders (derived)
  text: palette.ink,
  textMuted: palette.muted,
  textOnDark: palette.ivory,
  accent: palette.champagne,
  accentText: palette.bronze,
  disabledBg: '#DAD5CC',
  disabledText: '#7E7A73',
  errorBg: '#F5E6E3',
  successBg: '#E2EDE7',
  noticeBg: '#F2E9D5',
  scrim: 'rgba(11, 11, 12, 0.5)',
} as const;

/** Spacing scale: 4, 8, 12, 16, 24, 32, 48. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Horizontal screen margin measured from the concepts. */
export const gutter = 20;

export const radius = {
  control: 10, // buttons, inputs
  card: 12, // cards and media
  sheet: 20,
  pill: 999,
} as const;

/** Controls are at least 48 logical pixels high. */
export const controlHeight = {
  min: 48,
  button: 52,
  chip: 40,
} as const;

/**
 * Georgia for editorial headings (plan suggestion), platform sans-serif for controls.
 * Android has no Georgia, so it falls back to the platform serif. To use a licensed
 * brand face, load it with expo-font and change `serif` here.
 */
export const fonts = {
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Georgia, "Times New Roman", serif',
  }),
  sans: Platform.select({
    ios: undefined,
    android: undefined,
    default: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  }),
} as const;

/**
 * Type scale. Plan values: body 16/24, secondary 14/20, title 32/36, product title 24/30.
 * `display` is an addition for hero headlines, matching the editorial concepts.
 */
export const typography = {
  display: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 46, letterSpacing: -0.6 },
  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  productTitle: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 27 },
  price: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40 },
  bodyLarge: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  secondary: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.serif,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 22, fontWeight: '500' },
  label: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 20, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export const shadow = {
  card: { boxShadow: '0 1px 3px rgba(11, 11, 12, 0.06)' },
  raised: { boxShadow: '0 6px 20px rgba(11, 11, 12, 0.14)' },
} as const;
