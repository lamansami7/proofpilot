import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { deriveProtection, formatDate, formatMoney, nextDeadlineFor, protectionLabel, type NormalizedDeadline } from '../lib/purchaseSelectors';
import type { ActionNeeded, Purchase } from '../types/purchase';
import { Badge, Card } from './ui';

export function ProductTile({ purchase, size = 42 }: { purchase: Purchase; size?: number }) {
  return (
    <View style={[styles.productTile, { width: size, height: size, borderRadius: size >= 44 ? radius.md : radius.sm, backgroundColor: purchase.tint }]}>
      <Feather name={purchase.icon} size={Math.round(size * 0.46)} color={colors.inkSecondary} />
    </View>
  );
}

const deadlineTone = (status: NormalizedDeadline['status']) => status === 'overdue' || status === 'today' ? 'danger' : status === 'urgent' ? 'warning' : 'success';
const daysLabel = (days: number) => days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`;

export function DeadlineRow({ deadline, onPress }: { deadline: NormalizedDeadline; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${daysLabel(deadline.days)}: ${deadline.title} for ${deadline.purchase.name}`} style={styles.rowCard}>
      <View style={styles.row}>
        <ProductTile purchase={deadline.purchase} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={type.label}>{deadline.title}</Text>
          <Text numberOfLines={1} style={type.bodySmall}>{deadline.purchase.name} · {formatDate(deadline.date)}</Text>
        </View>
        <Badge tone={deadlineTone(deadline.status)} label={daysLabel(deadline.days)} />
        <Feather name="chevron-right" size={17} color={colors.subtle} />
      </View>
    </Card>
  );
}

export function AttentionRow({ action, onPress }: { action: ActionNeeded; onPress: () => void }) {
  const urgent = action.kind === 'deadline';
  return (
    <Card onPress={onPress} accessibilityLabel={`${action.title} for ${action.purchase.name}. ${action.description}. ${action.actionLabel} — opens the purchase record.`} style={styles.rowCard}>
      <View style={styles.row}>
        <ProductTile purchase={action.purchase} />
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={type.label}>{action.title}</Text>
          <Text numberOfLines={1} style={type.bodySmall}>{action.purchase.name} · {action.description}</Text>
        </View>
        {/* A single pressable row (no nested buttons) keeps screen readers and keyboards simple. */}
        <View style={[styles.actionHint, urgent && styles.actionHintUrgent]}>
          <Text style={[styles.actionHintText, urgent && { color: colors.warning }]}>{action.actionLabel}</Text>
          <Feather name="chevron-right" size={14} color={urgent ? colors.warning : colors.brandDark} />
        </View>
      </View>
    </Card>
  );
}

export function PurchaseCard({ item, onPress }: { item: Purchase; onPress: () => void }) {
  const next = nextDeadlineFor(item);
  const statusTone = deriveProtection(item) === 'protected' ? 'success' : deriveProtection(item) === 'attention' ? 'warning' : 'neutral';
  return (
    <PressableCard item={item} onPress={onPress} statusTone={statusTone} next={next} />
  );
}

function PressableCard({ item, onPress, statusTone, next }: { item: Purchase; onPress: () => void; statusTone: 'success' | 'warning' | 'neutral'; next: NormalizedDeadline | null }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`Open ${item.name} from ${item.merchant}${item.pinned ? ', pinned' : ''}`} style={styles.purchaseCard}>
      {typeof item.id === 'number' && [1, 2, 3].includes(item.id) ? <Text style={[type.eyebrow, { marginBottom: 8 }]}>SAMPLE PURCHASE</Text> : null}
      <View style={styles.purchaseTop}>
        <ProductTile purchase={item} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text numberOfLines={2} style={styles.purchaseTitle}>{item.name}</Text>
            {item.pinned ? <View style={styles.pinFlag}><Feather name="bookmark" size={11} color={colors.brandDark} /><Text style={styles.pinFlagText}>PINNED</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={type.bodySmall}>{item.merchant}{item.purchaseDate ? ` · ${formatDate(item.purchaseDate)}` : ''}</Text>
        </View>
      </View>
      <View style={styles.purchaseDivider} />
      <View style={styles.purchaseBottom}>
        <Text style={styles.price}>{formatMoney(item.price)}</Text>
        <Badge label={protectionLabel(deriveProtection(item))} tone={statusTone} />
      </View>
      <View style={[styles.nextDeadline, { flexWrap: 'wrap' }]}>
        <Feather name={item.hasReceipt ? 'check-circle' : 'file-minus'} size={13} color={item.hasReceipt ? colors.success : colors.warning} />
        <Text style={type.caption}>{item.hasReceipt ? 'Receipt on record' : 'Receipt missing'} · {item.documents.length} document{item.documents.length === 1 ? '' : 's'}</Text>
      </View>
      {next ? (
        <View style={styles.nextDeadline}>
          <Feather name="clock" size={13} color={next.status === 'urgent' || next.status === 'today' ? colors.warning : colors.muted} />
          <Text numberOfLines={1} style={[styles.nextDeadlineText, (next.status === 'urgent' || next.status === 'today') && { color: colors.warning, fontWeight: '700' }]}>{next.title} · {daysLabel(next.days)}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  productTile: { alignItems: 'center', justifyContent: 'center' },
  rowCard: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  actionHint: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: spacing.sm + 2, borderRadius: radius.pill, backgroundColor: colors.brandMuted },
  actionHintUrgent: { backgroundColor: colors.warningSurface },
  actionHintText: { fontSize: 12, fontWeight: '800', color: colors.brandDark },
  purchaseCard: { padding: spacing.lg, flexBasis: 250, flexGrow: 1, maxWidth: 420 },
  purchaseTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  purchaseTitle: { ...type.label, fontSize: 14, marginBottom: 2, flex: 1 },
  pinFlag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandMuted },
  pinFlagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: colors.brandDark },
  purchaseDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  purchaseBottom: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' },
  price: { fontSize: 16, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  nextDeadline: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: spacing.sm },
  nextDeadlineText: { ...type.bodySmall, flexShrink: 1 },
});
