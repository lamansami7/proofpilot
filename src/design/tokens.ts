import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  canvas: '#F6F7F3', canvasDeep: '#EFF2EA', surface: '#FFFFFF', surfaceMuted: '#F0F3ED', ink: '#152236', inkSecondary: '#53606E', muted: '#62707B', subtle: '#6C7881',
  border: '#E4E9E2', borderStrong: '#D6DED4', borderFocus: '#5B7FA6', brand: '#B8ED65', brandStrong: '#9EDB3F', brandDark: '#314522', brandMuted: '#EAF4DB',
  navy: '#1E2E45', navyRaised: '#2A3D59', overlay: 'rgba(16, 27, 39, 0.48)',
  success: '#2C6E49', successSurface: '#E8F4EB', warning: '#A85F18', warningSurface: '#FFF1DF', danger: '#B13F4B', dangerSurface: '#FDEBED', info: '#3C6397', infoSurface: '#EAF0FA',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const sizing = { touch: 44, touchCompact: 38, iconButton: 42, sidebar: 226, contentMax: 1180, sheetMax: 660, sheetWide: 780 } as const;
export const breakpoints = { phone: 759, tablet: 899, desktop: 1100 } as const;
export const shadows: Record<'card' | 'raised' | 'floating', ViewStyle> = {
  card: { shadowColor: '#1C2A3A', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  raised: { shadowColor: '#1C2A3A', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  floating: { shadowColor: '#1C2A3A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 9 },
};
export const type: Record<'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodySmall' | 'label' | 'caption' | 'eyebrow', TextStyle> = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '800', letterSpacing: -1.2, color: colors.ink },
  title: { fontSize: 26, lineHeight: 33, fontWeight: '800', letterSpacing: -0.9, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3, color: colors.ink },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary },
  bodySmall: { fontSize: 12.5, lineHeight: 18, color: colors.muted },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.ink },
  caption: { fontSize: 11.5, lineHeight: 16, color: colors.muted },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 1.15, color: colors.muted },
};

/** Web-only niceties; ignored on native. */
export const webTransition: ViewStyle = { transitionProperty: 'background-color, border-color, opacity, box-shadow', transitionDuration: '130ms' } as ViewStyle;

/** Keep in sync with package.json and app.json (expo.version). */
export const APP_VERSION = '2.0.0';
