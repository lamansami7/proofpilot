import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  canvas: '#F6F7F3', surface: '#FFFFFF', surfaceMuted: '#F0F3ED', ink: '#152236', inkSecondary: '#53606E', muted: '#73808C', subtle: '#9AA4AC',
  border: '#E4E9E2', borderStrong: '#D6DED4', brand: '#B8ED65', brandDark: '#314522', brandMuted: '#EAF4DB',
  navy: '#1E2E45', success: '#2C6E49', successSurface: '#E8F4EB', warning: '#A85F18', warningSurface: '#FFF1DF', danger: '#B13F4B', dangerSurface: '#FDEBED', info: '#3C6397', infoSurface: '#EAF0FA',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const sizing = { touch: 44, iconButton: 42, sidebar: 252, contentMax: 1240 } as const;
export const breakpoints = { phone: 599, tablet: 899, desktop: 1100 } as const;
export const shadows: Record<'card' | 'floating', ViewStyle> = {
  card: { shadowColor: '#1C2A3A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  floating: { shadowColor: '#1C2A3A', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
};
export const type: Record<'eyebrow' | 'title' | 'heading' | 'body' | 'bodySmall' | 'label', TextStyle> = {
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, color: colors.muted },
  title: { fontSize: 32, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1, color: colors.ink },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -0.35, color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary },
  bodySmall: { fontSize: 12, lineHeight: 18, color: colors.muted },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.ink },
};
