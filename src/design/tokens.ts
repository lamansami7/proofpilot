import type { TextStyle, ViewStyle } from 'react-native';

/**
 * ProofPilot — premium, calm, trustworthy design system.
 * Semantic tokens ensure accessible contrast and consistent intent.
 * Backwards-compatible: legacy keys remain as aliases.
 */
export const colors = {
  // Canvas & surfaces
  canvas: '#F6F7F3',
  canvasDeep: '#EFF2EA',
  canvasWarm: '#F3F5F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F3ED',
  surfaceHover: '#FAFBF9',
  elevated: '#FFFFFF',
  elevatedHover: '#FDFDFC',
  // Text
  ink: '#152236',
  inkSecondary: '#3D4B5C',
  secondary: '#53606E',
  muted: '#62707B',
  subtle: '#6C7881',
  faint: '#8A96A1',
  // Borders
  border: '#E4E9E2',
  borderStrong: '#D6DED4',
  borderSubtle: '#EDF1EA',
  borderFocus: '#5B7FA6',
  // Brand / accent
  brand: '#B8ED65',
  brandStrong: '#9EDB3F',
  brandDark: '#314522',
  brandMuted: '#EAF4DB',
  brandSubtle: '#F0F7E6',
  brandBorder: '#DCE9CA',
  brandTint: '#DCEFC6',
  accent: '#2D5016',
  accentMuted: '#EAF4DB',
  // Semantic states
  success: '#2C6E49',
  successSurface: '#E8F4EB',
  successBorder: '#C5E6CC',
  warning: '#8F4E10',
  warningSurface: '#FFF1DF',
  warningBorder: '#FFE0B8',
  danger: '#B13F4B',
  dangerSurface: '#FDEBED',
  dangerBorder: '#F7CBD0',
  info: '#3C6397',
  infoSurface: '#EAF0FA',
  infoBorder: '#D0DEFA',
  // Protection semantics
  protected: '#2C6E49',
  protectedSurface: '#E8F4EB',
  protectedBorder: '#BFE0C6',
  attention: '#8A6A1A',
  attentionSurface: '#FFF1DF',
  attentionBorder: '#FFE0B8',
  attentionSegment: '#E4B15E',
  overdue: '#B13F4B',
  overdueSurface: '#FDEBED',
  completed: '#53606E',
  completedSurface: '#F0F3ED',
  offline: '#62707B',
  offlineSurface: '#F0F2F4',
  syncing: '#3C6397',
  syncingSurface: '#EAF0FA',
  error: '#B13F4B',
  errorSurface: '#FDEBED',
  hero: '#193831',
  heroDeep: '#25483E',
  heroMuted: '#2F5D4A',
  // Dark / navy
  navy: '#1E2E45',
  navyRaised: '#2A3D59',
  navySoft: '#E8EEF4',
  overlay: 'rgba(16, 27, 39, 0.52)',
  overlaySoft: 'rgba(16, 27, 39, 0.24)',
  // Utility
  transparent: 'transparent',
  focus: '#5B7FA6',
  focusRing: 'rgba(91,127,166,0.18)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  // semantic aliases
  '2xs': 4,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  modal: 22,
  pill: 999,
  // backwards-compatible aliases
  small: 8,
  medium: 12,
  large: 16,
} as const;

export const sizing = {
  touch: 44,
  touchCompact: 44,
  iconButton: 44,
  sidebar: 248,
  sidebarCollapsed: 72,
  contentMax: 1220,
  contentNarrow: 760,
  sheetMax: 660,
  sheetWide: 780,
  header: 68,
  bottomNav: 72,
  fab: 56,
} as const;

export const breakpoints = {
  phone: 759,
  tablet: 899,
  desktop: 1100,
  wide: 1280,
  ultra: 1440,
} as const;

export const shadows: Record<'card' | 'raised' | 'floating' | 'soft', ViewStyle> = {
  card: { shadowColor: '#1C2A3A', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  raised: { shadowColor: '#1C2A3A', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  floating: { shadowColor: '#1C2A3A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 9 },
  soft: { shadowColor: '#1C2A3A', shadowOpacity: 0.04, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
};

export const type: Record<'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodySmall' | 'label' | 'caption' | 'eyebrow', TextStyle> & {
  pageTitle: TextStyle;
  sectionTitle: TextStyle;
  cardTitle: TextStyle;
  secondary: TextStyle;
  button: TextStyle;
} = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '800', letterSpacing: -1.2, color: colors.ink },
  title: { fontSize: 26, lineHeight: 33, fontWeight: '800', letterSpacing: -0.9, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary },
  secondary: { fontSize: 13, lineHeight: 19, color: colors.muted },
  bodySmall: { fontSize: 12.5, lineHeight: 18, color: colors.muted },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.ink },
  caption: { fontSize: 11.5, lineHeight: 16, color: colors.muted },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.15, color: colors.muted },
  // aliases for page/section/card titles
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9, color: colors.ink },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', letterSpacing: -0.25, color: colors.ink },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: -0.2, color: colors.ink },
  button: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.ink },
};

export const motion = {
  fast: 140,
  base: 200,
  slow: 320,
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/** Web-only niceties; ignored on native. */
export const webTransition: ViewStyle = {
  transitionProperty: 'background-color, border-color, opacity, box-shadow, transform',
  transitionDuration: '150ms',
  transitionTimingFunction: motion.ease,
} as ViewStyle;

export const focusRing: ViewStyle = {
  outlineStyle: 'solid',
  outlineWidth: 2,
  outlineColor: colors.focus,
  outlineOffset: 2,
} as unknown as ViewStyle;

/** Keep in sync with package.json and app.json (expo.version). Public launch is 1.0.0 — pre-launch polish stays internal. */
export const APP_VERSION = '1.0.0';
