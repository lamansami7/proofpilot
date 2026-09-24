import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { breakpoints, colors, radius, shadows, sizing, spacing, type, webTransition } from '../design/tokens';
import type { FeatherIconName } from '../types/purchase';

/** react-native-web extends the pressable state with hovered/focused on web. */
export type InteractiveState = { pressed: boolean; hovered?: boolean; focused?: boolean };
const hoverStyle: ViewStyle = { backgroundColor: 'rgba(21, 34, 54, 0.045)' };
const focusStyle: ViewStyle = Platform.OS === 'web' ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.borderFocus, outlineOffset: 1 } as unknown as ViewStyle) : {};
export function interactive(base: StyleProp<ViewStyle> | ReadonlyArray<StyleProp<ViewStyle>>, opts: { hover?: ViewStyle; pressed?: ViewStyle } = {}) {
  const hover = opts.hover ?? hoverStyle;
  const pressed = opts.pressed ?? { opacity: 0.78 };
  const bases = (Array.isArray(base) ? base : [base]).filter(Boolean) as ViewStyle[];
  return (state: InteractiveState): ViewStyle[] => [
    ...bases,
    webTransition,
    ...(state.pressed ? [pressed] : []),
    ...(Platform.OS === 'web' && state.hovered && !state.pressed ? [hover] : []),
    ...(Platform.OS === 'web' && state.focused ? [focusStyle] : []),
  ];
}

type ButtonProps = { label: string; onPress: () => void; icon?: FeatherIconName; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm'; loading?: boolean; disabled?: boolean; fullWidth?: boolean; accessibilityLabel?: string; style?: ViewStyle };
export function Button({ label, onPress, icon, variant = 'primary', size = 'md', loading, disabled, fullWidth, accessibilityLabel, style }: ButtonProps) {
  const base: ViewStyle = { ...styles.button, ...(size === 'sm' ? styles.buttonSm : null), ...(fullWidth ? { alignSelf: 'stretch' } : null) };
  const tone = variant === 'primary' ? styles.buttonPrimary : variant === 'secondary' ? styles.buttonSecondary : variant === 'danger' ? styles.buttonDanger : styles.buttonGhost;
  const hover: ViewStyle = variant === 'primary' ? { backgroundColor: colors.brandStrong } : variant === 'danger' ? { backgroundColor: '#F3D3D7' } : hoverStyle;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: Boolean(disabled || loading) }} disabled={disabled || loading} onPress={onPress} style={interactive([base, tone], { hover })}>
      {loading ? <ActivityIndicator size="small" color={variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.brandDark} /> : icon ? <Feather name={icon} color={variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.brandDark} size={size === 'sm' ? 15 : 17} /> : null}
      <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, variant !== 'primary' ? { color: variant === 'danger' ? colors.danger : colors.brandDark } : null, disabled && { opacity: 0.5 }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tone = 'default', size = sizing.iconButton, disabled }: { icon: FeatherIconName; label: string; onPress: () => void; tone?: 'default' | 'ghost'; size?: number; disabled?: boolean }) {
  const base: ViewStyle = { ...styles.iconButton, height: size, width: size, ...(tone === 'ghost' ? { borderWidth: 0, backgroundColor: 'transparent' } : null) };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={interactive(base)}>
      <Feather name={icon} size={size >= 40 ? 18 : 16} color={colors.ink} />
    </Pressable>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const extra = style == null ? [] : Array.isArray(style) ? style : [style];
  if (onPress) {
    return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={interactive([styles.card, ...extra], { hover: { ...styles.cardHover }, pressed: { opacity: 0.92 } })}>{children}</Pressable>;
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral';
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: FeatherIconName }) {
  return (
    <View accessibilityLabel={label} style={[styles.badge, styles[`badge_${tone}` as const]]}>
      {icon ? <Feather name={icon} size={11} color={(styles[`badgeText_${tone}` as const] as ViewStyle & { color?: string }).color ?? colors.ink} /> : null}
      <Text style={[styles.badgeText, styles[`badgeText_${tone}` as const]]}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ title, detail, actionLabel, onAction }: { title: string; detail?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={[type.bodySmall, { marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={interactive(styles.textAction, { pressed: { opacity: 0.7 } })}>
          <Text style={styles.textActionLabel}>{actionLabel}</Text>
          <Feather name="arrow-right" color={colors.brandDark} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type InputProps = TextInputProps & { label?: string; error?: string; prefix?: string; hint?: string; containerStyle?: ViewStyle };
export function Input(props: InputProps) {
  const { label, error, prefix, hint, containerStyle, ...inputProps } = props;
  return (
    <View style={[inputProps.multiline ? { flex: 1 } : null, containerStyle]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputShell, error ? styles.inputShellError : null, inputProps.multiline && styles.inputShellMultiline]}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput placeholderTextColor={colors.subtle} {...inputProps} style={[styles.input, prefix ? { paddingLeft: 6 } : null, inputProps.multiline && styles.inputMultiline, inputProps.style]} />
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.inputError}><Feather name="alert-circle" size={12} color={colors.danger} /> {error}</Text> : hint ? <Text style={styles.inputHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: FeatherIconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} onPress={onPress} style={interactive([styles.chip, ...(selected ? [styles.chipActive] : [])], { hover: { backgroundColor: selected ? colors.brand : colors.surfaceMuted } })}>
      {icon ? <Feather name={icon} size={13} color={selected ? colors.ink : colors.muted} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Unified modal surface: bottom sheet on phones, centered dialog elsewhere. */
export function Sheet({ visible, onClose, title, subtitle, eyebrow, wide, children }: { visible: boolean; onClose: () => void; title?: string; subtitle?: string; eyebrow?: string; wide?: boolean; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const phone = width <= breakpoints.phone;
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.sheetRoot, phone ? null : styles.sheetRootCentered]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.sheetSurface, wide ? styles.sheetSurfaceWide : null, phone ? null : styles.sheetSurfaceDialog]}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1 }}>
              {eyebrow ? <Text style={type.eyebrow}>{eyebrow}</Text> : null}
              {title ? <Text style={type.heading}>{title}</Text> : null}
              {subtitle ? <Text style={[type.bodySmall, { marginTop: 2 }]}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="x" label="Close dialog" onPress={onClose} tone="ghost" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Banner({ tone = 'info', icon = 'info', title, message, children }: { tone?: 'info' | 'warning' | 'success' | 'danger' | 'brand'; icon?: FeatherIconName; title: string; message?: string; children?: React.ReactNode }) {
  const surfaces = { info: colors.infoSurface, warning: colors.warningSurface, success: colors.successSurface, danger: colors.dangerSurface, brand: colors.brandMuted };
  const icons = { info: colors.info, warning: colors.warning, success: colors.success, danger: colors.danger, brand: colors.brandDark };
  return (
    <View style={[styles.banner, { backgroundColor: surfaces[tone] }]}>
      <Feather name={icon} size={17} color={icons[tone]} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{title}</Text>
        {message ? <Text style={[type.bodySmall, { marginTop: 2, color: colors.inkSecondary }]}>{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, message, actionLabel, onAction, secondaryLabel, onSecondary, compact }: { icon: FeatherIconName; title: string; message: string; actionLabel?: string; onAction?: () => void; secondaryLabel?: string; onSecondary?: () => void; compact?: boolean }) {
  return (
    <Card style={compact ? [styles.state, styles.stateCompact] : styles.state}>
      <View style={styles.stateIcon}><Feather name={icon} size={22} color={colors.brandDark} /></View>
      <Text style={type.heading}>{title}</Text>
      <Text style={[type.body, styles.stateMessage]}>{message}</Text>
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <View style={styles.stateActions}>
          {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} icon="plus" /> : null}
          {secondaryLabel && onSecondary ? <Button label={secondaryLabel} onPress={onSecondary} variant="secondary" /> : null}
        </View>
      ) : null}
    </Card>
  );
}

export function LoadingState({ label = 'Loading your vault…' }: { label?: string }) {
  return (
    <Card style={styles.state}>
      <ActivityIndicator color={colors.brandDark} />
      <Text style={[type.body, styles.stateMessage]}>{label}</Text>
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerSurface }]}><Feather name="alert-circle" size={22} color={colors.danger} /></View>
      <Text style={type.heading}>We couldn’t load this</Text>
      <Text style={[type.body, styles.stateMessage]}>{message}</Text>
      <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh-cw" style={{ marginTop: spacing.lg }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: sizing.touch, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  buttonSm: { minHeight: sizing.touchCompact, paddingHorizontal: spacing.md, borderRadius: radius.sm, gap: 6 },
  buttonPrimary: { backgroundColor: colors.brand }, buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong }, buttonGhost: { backgroundColor: 'transparent' }, buttonDanger: { backgroundColor: colors.dangerSurface },
  buttonText: { ...type.label, color: colors.ink }, buttonTextSm: { fontSize: 12.5 },
  iconButton: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, ...shadows.card },
  cardHover: { borderColor: colors.borderStrong, ...shadows.raised },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  badge_success: { backgroundColor: colors.successSurface }, badgeText_success: { color: colors.success },
  badge_warning: { backgroundColor: colors.warningSurface }, badgeText_warning: { color: colors.warning },
  badge_danger: { backgroundColor: colors.dangerSurface }, badgeText_danger: { color: colors.danger },
  badge_info: { backgroundColor: colors.infoSurface }, badgeText_info: { color: colors.info },
  badge_brand: { backgroundColor: colors.brandMuted }, badgeText_brand: { color: colors.brandDark },
  badge_neutral: { backgroundColor: colors.surfaceMuted }, badgeText_neutral: { color: colors.inkSecondary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  textAction: { minHeight: sizing.touchCompact, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  textActionLabel: { ...type.label, color: colors.brandDark },
  inputLabel: { ...type.eyebrow, marginBottom: 6 },
  inputShell: { minHeight: sizing.touch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  inputShellError: { borderColor: colors.danger },
  inputShellMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  inputPrefix: { fontSize: 14, fontWeight: '700', color: colors.muted },
  input: { flex: 1, width: '100%', minHeight: sizing.touch - 2, color: colors.ink, fontSize: 14, paddingVertical: 0 },
  inputMultiline: { minHeight: 84, paddingTop: 4 },
  inputError: { fontSize: 12, lineHeight: 17, color: colors.danger, marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  inputHint: { fontSize: 11.5, lineHeight: 16, color: colors.muted, marginTop: 5 },
  chip: { minHeight: sizing.touchCompact, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.inkSecondary, fontSize: 12.5 }, chipTextActive: { color: colors.ink },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.overlay },
  sheetRootCentered: { justifyContent: 'center', padding: spacing.xl },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheetSurface: { width: '100%', maxWidth: sizing.sheetMax, maxHeight: '94%', backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, ...shadows.floating },
  sheetSurfaceWide: { maxWidth: sizing.sheetWide },
  sheetSurfaceDialog: { borderRadius: radius.xl, maxHeight: '90%' },
  sheetGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, marginTop: spacing.md },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sheetBody: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 40 },
  banner: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  state: { alignItems: 'center', padding: spacing.xxl, textAlign: 'center' },
  stateCompact: { padding: spacing.xl },
  stateIcon: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  stateMessage: { textAlign: 'center', maxWidth: 400, marginTop: spacing.sm },
  stateActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap', justifyContent: 'center' },
});
