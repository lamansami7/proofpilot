import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { breakpoints, colors, radius, shadows, sizing, spacing, type, webTransition } from '../design/tokens';
import type { FeatherIconName } from '../types/purchase';

/** react-native-web extends the pressable state with hovered/focused on web. */
export type InteractiveState = { pressed: boolean; hovered?: boolean; focused?: boolean };
const hoverStyle: ViewStyle = { backgroundColor: 'rgba(21, 34, 54, 0.045)' };
const focusStyle: ViewStyle = Platform.OS === 'web'
  ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.borderFocus, outlineOffset: 1 } as unknown as ViewStyle)
  : {};
export function interactive(
  base: StyleProp<ViewStyle> | ReadonlyArray<StyleProp<ViewStyle>>,
  opts: { hover?: ViewStyle; pressed?: ViewStyle } = {},
) {
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

// ---------------------------------------------------------------------------
// Button — premium, consistent, accessible
// ---------------------------------------------------------------------------
type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: FeatherIconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'tint';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const base: ViewStyle = {
    ...styles.button,
    ...(size === 'sm' ? styles.buttonSm : null),
    ...(fullWidth ? { alignSelf: 'stretch' } : null),
    ...(style ?? null),
  };
  const tone =
    variant === 'primary'
      ? styles.buttonPrimary
      : variant === 'secondary'
        ? styles.buttonSecondary
        : variant === 'danger'
          ? styles.buttonDanger
          : variant === 'tint'
            ? styles.buttonTint
            : styles.buttonGhost;
  const hover: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: colors.brandStrong }
      : variant === 'danger'
        ? { backgroundColor: '#F3D3D7' }
        : variant === 'tint'
          ? { backgroundColor: colors.brandMuted }
          : hoverStyle;
  const iconColor =
    variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.brandDark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={interactive([base, tone, disabled && { opacity: 0.5 }], { hover })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : icon ? (
        <Feather name={icon} color={iconColor} size={size === 'sm' ? 14 : 16} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          size === 'sm' && styles.buttonTextSm,
          variant !== 'primary'
            ? { color: variant === 'danger' ? colors.danger : colors.brandDark }
            : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'default',
  size = sizing.iconButton,
  disabled,
}: {
  icon: FeatherIconName;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'ghost' | 'tint';
  size?: number;
  disabled?: boolean;
}) {
  const base: ViewStyle = {
    ...styles.iconButton,
    height: Math.max(size, 44),
    width: Math.max(size, 44),
    ...(tone === 'ghost' ? { borderWidth: 0, backgroundColor: 'transparent' } : null),
    ...(tone === 'tint' ? { backgroundColor: colors.brandMuted, borderColor: colors.brandMuted } : null),
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={interactive([base, disabled && { opacity: 0.45 }])}
    >
      <Feather name={icon} size={size >= 40 ? 18 : 16} color={colors.ink} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card — calm elevation, consistent press
// ---------------------------------------------------------------------------
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const extra = style == null ? [] : Array.isArray(style) ? style : [style];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={interactive([styles.card, ...extra], {
          hover: { ...styles.cardHover },
          pressed: { opacity: 0.96, transform: [{ scale: 0.998 }] } as unknown as ViewStyle,
        })}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral';
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: FeatherIconName }) {
  return (
    <View accessibilityLabel={label} style={[styles.badge, styles[`badge_${tone}` as const]]}>
      {icon ? (
        <Feather
          name={icon}
          size={11}
          color={(styles[`badgeText_${tone}` as const] as ViewStyle & { color?: string }).color ?? colors.ink}
        />
      ) : null}
      <Text style={[styles.badgeText, styles[`badgeText_${tone}` as const]]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: BadgeTone;
  icon?: FeatherIconName;
}) {
  return <Badge label={label} tone={tone} icon={icon} />;
}

// ---------------------------------------------------------------------------
// PageHeader — contextual, breadcrumb-aware
// ---------------------------------------------------------------------------
export function PageHeader({
  eyebrow,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: FeatherIconName;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Text style={type.eyebrow}>{eyebrow}</Text> : null}
        <Text style={type.display}>{title}</Text>
        {description ? <Text style={[type.body, styles.pageHeaderDesc]}>{description}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <View style={styles.pageHeaderActions}>
          {secondaryLabel && onSecondary ? (
            <Button variant="secondary" label={secondaryLabel} onPress={onSecondary} />
          ) : null}
          <Button label={actionLabel} icon={actionIcon ?? 'plus'} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function SectionHeader({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={[type.bodySmall, { marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={interactive(styles.textAction, { pressed: { opacity: 0.7 } })}
        >
          <Text style={styles.textActionLabel}>{actionLabel}</Text>
          <Feather name="arrow-right" color={colors.brandDark} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs — strict, accessible
// ---------------------------------------------------------------------------
export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  prefix?: string;
  hint?: string;
  containerStyle?: ViewStyle;
};
export const Input = React.forwardRef<TextInput, InputProps>(function Input(props, ref) {
  const { label, error, prefix, hint, containerStyle, ...inputProps } = props;
  return (
    <View style={[inputProps.multiline ? { flex: 1 } : null, containerStyle]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View
        style={[
          styles.inputShell,
          error ? styles.inputShellError : null,
          inputProps.multiline && styles.inputShellMultiline,
        ]}
      >
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          placeholderTextColor={colors.subtle}
          {...inputProps}
          style={[
            styles.input,
            prefix ? { paddingLeft: 6 } : null,
            inputProps.multiline && styles.inputMultiline,
            inputProps.style,
          ]}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.inputError}>
          <Feather name="alert-circle" size={12} color={colors.danger} /> {error}
        </Text>
      ) : hint ? (
        <Text style={styles.inputHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
  accessibilityLabel = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.searchBar}>
      <Feather name="search" size={16} color={colors.muted} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        style={styles.searchInput}
      />
      {value ? (
        <IconButton icon="x" label="Clear search" size={30} tone="ghost" onPress={() => onChange('')} />
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: FeatherIconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={interactive([styles.chip, ...(selected ? [styles.chipActive] : [])], {
        hover: { backgroundColor: selected ? colors.brand : colors.surfaceMuted },
      })}
    >
      {icon ? <Feather name={icon} size={13} color={selected ? colors.ink : colors.muted} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function FilterBar({
  children,
  actionLabel,
  onAction,
}: {
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.filterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBarContent}
      >
        {children}
      </ScrollView>
      {actionLabel && onAction ? (
        <Button size="sm" variant="ghost" label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheet — bottom sheet on phones, centered dialog elsewhere
// ---------------------------------------------------------------------------
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  eyebrow,
  wide,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const phone = width <= breakpoints.phone;
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReducedMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.sheetRoot, phone ? null : styles.sheetRootCentered]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={styles.sheetBackdrop}
        />
        <View
          style={[
            styles.sheetSurface,
            wide ? styles.sheetSurfaceWide : null,
            phone ? null : styles.sheetSurfaceDialog,
          ]}
        >
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {eyebrow ? <Text style={type.eyebrow}>{eyebrow}</Text> : null}
              {title ? <Text style={type.heading}>{title}</Text> : null}
              {subtitle ? <Text style={[type.bodySmall, { marginTop: 2 }]}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="x" label="Close dialog" onPress={onClose} tone="ghost" />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetBody}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Banner({
  tone = 'info',
  icon = 'info',
  title,
  message,
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger' | 'brand';
  icon?: FeatherIconName;
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const surfaces = {
    info: colors.infoSurface,
    warning: colors.warningSurface,
    success: colors.successSurface,
    danger: colors.dangerSurface,
    brand: colors.brandMuted,
  };
  const icons = {
    info: colors.info,
    warning: colors.warning,
    success: colors.success,
    danger: colors.danger,
    brand: colors.brandDark,
  };
  const borders = {
    info: colors.infoBorder,
    warning: colors.warningBorder,
    success: colors.successBorder,
    danger: colors.dangerBorder,
    brand: '#DCE9CA',
  };
  return (
    <View style={[styles.banner, { backgroundColor: surfaces[tone], borderColor: borders[tone] }]}>
      <Feather name={icon} size={17} color={icons[tone]} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{title}</Text>
        {message ? <Text style={[type.bodySmall, { marginTop: 2, color: colors.inkSecondary }]}>{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact,
}: {
  icon: FeatherIconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
}) {
  return (
    <Card style={compact ? [styles.state, styles.stateCompact] : styles.state}>
      <View style={styles.stateIcon}>
        <Feather name={icon} size={22} color={colors.brandDark} />
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, styles.stateMessage]}>{message}</Text>
      {(actionLabel && onAction) || (secondaryLabel && onSecondary) ? (
        <View style={styles.stateActions}>
          {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} icon="plus" /> : null}
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} onPress={onSecondary} variant="secondary" />
          ) : null}
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

export function ErrorState({
  title = 'Something went wrong',
  message = 'We couldn’t load that. Your saved data is still safe.',
  actionLabel = 'Try again',
  onAction,
  onSecondary,
  secondaryLabel,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <Card style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerSurface }]}>
        <Feather name="alert-circle" size={22} color={colors.danger} />
      </View>
      <Text style={type.heading}>{title}</Text>
      <Text style={[type.body, styles.stateMessage]}>{message}</Text>
      {onAction || onSecondary ? (
        <View style={styles.stateActions}>
          {onAction ? <Button label={actionLabel} onPress={onAction} icon="refresh-cw" /> : null}
          {onSecondary && secondaryLabel ? (
            <Button label={secondaryLabel} onPress={onSecondary} variant="secondary" />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — restrained, accessible
// ---------------------------------------------------------------------------
export function Skeleton({ width, height, radius: r = 8, style }: { width?: number | string; height: number; radius?: number; style?: ViewStyle }) {
  return <View style={[{ width: width as any, height, borderRadius: r, backgroundColor: colors.surfaceMuted, opacity: 0.9 }, style]} />;
}

export function SkeletonCard() {
  return (
    <Card style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <Skeleton width={46} height={46} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="64%" height={14} />
          <Skeleton width="44%" height={12} />
        </View>
      </View>
      <Skeleton width="100%" height={1} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={80} height={18} />
        <Skeleton width={90} height={22} radius={999} />
      </View>
    </Card>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizing.touch,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonSm: { minHeight: sizing.touchCompact, paddingHorizontal: spacing.md, borderRadius: radius.sm, gap: 6 },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder },
  buttonTint: { backgroundColor: colors.brandMuted, borderWidth: 1, borderColor: '#DCE9CA' },
  buttonText: { ...type.label, color: colors.ink },
  buttonTextSm: { fontSize: 12.5 },
  iconButton: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  cardHover: { borderColor: colors.borderStrong, ...shadows.raised },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  badge_success: { backgroundColor: colors.successSurface, borderWidth: 1, borderColor: colors.successBorder },
  badgeText_success: { color: colors.success },
  badge_warning: { backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder },
  badgeText_warning: { color: colors.warning },
  badge_danger: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder },
  badgeText_danger: { color: colors.danger },
  badge_info: { backgroundColor: colors.infoSurface, borderWidth: 1, borderColor: colors.infoBorder },
  badgeText_info: { color: colors.info },
  badge_brand: { backgroundColor: colors.brandMuted, borderWidth: 1, borderColor: '#DCE9CA' },
  badgeText_brand: { color: colors.brandDark },
  badge_neutral: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  badgeText_neutral: { color: colors.inkSecondary },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.xl, flexWrap: 'wrap' },
  pageHeaderDesc: { marginTop: spacing.sm, maxWidth: 620 },
  pageHeaderActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  textAction: {
    minHeight: sizing.touchCompact,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  textActionLabel: { ...type.label, color: colors.brandDark },
  inputLabel: { ...type.eyebrow, marginBottom: 6 },
  inputShell: {
    minHeight: sizing.touch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  inputShellError: { borderColor: colors.danger },
  inputShellMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  inputPrefix: { fontSize: 14, fontWeight: '700', color: colors.muted },
  input: {
    flex: 1,
    width: '100%',
    minHeight: sizing.touch - 2,
    color: colors.ink,
    fontSize: 14,
    paddingVertical: 0,
  },
  inputMultiline: { minHeight: 84, paddingTop: 4 },
  inputError: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputHint: { fontSize: 11.5, lineHeight: 16, color: colors.muted, marginTop: 5 },
  chip: {
    minHeight: sizing.touchCompact,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.inkSecondary, fontSize: 12.5 },
  chipTextActive: { color: colors.ink },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: sizing.touchCompact + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flex: 1,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14, minHeight: sizing.touchCompact },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  filterBarContent: { gap: spacing.sm, alignItems: 'center', flexDirection: 'row' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.overlay },
  sheetRootCentered: { justifyContent: 'center', padding: spacing.xl },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheetSurface: {
    width: '100%',
    maxWidth: sizing.sheetMax,
    maxHeight: '94%',
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  sheetSurfaceWide: { maxWidth: sizing.sheetWide },
  sheetSurfaceDialog: { borderRadius: radius.xl, maxHeight: '90%' },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.md,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  sheetBody: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 40 },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  state: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  stateCompact: { padding: spacing.xl },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stateMessage: { textAlign: 'center', maxWidth: 420, marginTop: 2 },
  stateActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
