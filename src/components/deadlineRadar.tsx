import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, type } from '../design/tokens';
import {
  deadlineTypeLabel,
  formatDate,
  groupDeadlines,
  type DeadlineGroup,
  type NormalizedDeadline,
} from '../lib/purchaseSelectors';
import type { DeadlineType, Purchase } from '../types/purchase';
import { Badge, Button, Card, Chip, EmptyState, Input, PageHeader, Sheet, type BadgeTone } from './ui';
import { ProductTile } from './purchaseComponents';

type Filter = 'all' | DeadlineType;
type Sort = 'urgency' | 'date' | 'purchase';
const filters: Array<[Filter, string]> = [
  ['all', 'All deadlines'],
  ['return', 'Returns'],
  ['warranty', 'Warranties'],
  ['rebate', 'Rebates'],
  ['custom', 'Custom'],
];
const groupOrder: Array<{ id: DeadlineGroup; title: string; detail: string; icon: string }> = [
  { id: 'overdue', title: 'Overdue / expired', detail: 'Past the recorded date', icon: 'alert-circle' },
  { id: 'today', title: 'Today', detail: 'Due by midnight', icon: 'clock' },
  { id: 'week', title: 'This week', detail: 'Next 7 days', icon: 'calendar' },
  { id: 'month', title: 'This month', detail: 'Later this month', icon: 'calendar' },
  { id: 'later', title: 'Later', detail: 'Future deadlines', icon: 'clock' },
];
const tone = (status: NormalizedDeadline['status']): BadgeTone =>
  status === 'overdue' || status === 'today' ? 'danger' : status === 'urgent' ? 'warning' : 'success';
const days = (deadline: NormalizedDeadline) =>
  deadline.completed
    ? 'Completed'
    : deadline.days < 0
      ? `${Math.abs(deadline.days)} days overdue`
      : deadline.days === 0
        ? 'Due today'
        : deadline.days === 1
          ? '1 day remaining'
          : `${deadline.days} days remaining`;

export function DeadlineRadar({
  deadlines,
  onOpenPurchase,
  onAdd,
  onUpdate,
}: {
  deadlines: NormalizedDeadline[];
  onUpdate: (purchase: Purchase) => Promise<void>;
  onOpenPurchase: (purchase: Purchase) => void;
  onAdd: () => void;
}) {
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('urgency');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<NormalizedDeadline | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState(false);

  const filtered = useMemo(
    () =>
      deadlines
        .filter(
          (deadline) =>
            Boolean(deadline.completed) === completed &&
            (filter === 'all' || deadline.type === filter) &&
            `${deadline.purchase.name} ${deadline.purchase.merchant} ${deadlineTypeLabel(deadline.type)}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'purchase'
            ? a.purchase.name.localeCompare(b.purchase.name)
            : sort === 'date'
              ? a.date.localeCompare(b.date)
              : a.days - b.days || a.purchase.name.localeCompare(b.purchase.name),
        ),
    [deadlines, filter, query, sort, completed],
  );
  const grouped = useMemo(() => groupDeadlines(filtered), [filtered]);
  const counts = useMemo(() => groupDeadlines(deadlines.filter((d) => !d.completed)), [deadlines]);
  const overdueCount = counts.overdue.length + counts.today.length;
  const totalActive = deadlines.filter((d) => !d.completed).length;

  if (deadlines.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="STAY ONE STEP AHEAD"
          title="Deadline Radar"
          description="Your personal purchase-protection command center. Every return window, warranty, and custom date — sorted by how soon it needs you."
          actionLabel="Protect a purchase"
          actionIcon="plus"
          onAction={onAdd}
        />
        <EmptyState
          icon="calendar"
          title="No deadlines tracked yet"
          message="When you protect a purchase with a return window or warranty date, it appears here automatically — grouped by urgency. The most urgent rise to the top."
          actionLabel="Protect a purchase"
          onAction={onAdd}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="STAY ONE STEP AHEAD"
        title="Deadline Radar"
        description={`Every return window, warranty, and custom date — ${totalActive} active · sorted by how soon it needs you.`}
        actionLabel="Protect a purchase"
        actionIcon="plus"
        onAction={onAdd}
      />

      <View style={styles.summaryRow}>
        <SummaryPill tone={overdueCount ? 'danger' : 'neutral'} label={String(counts.overdue.length + counts.today.length)} caption="need action" />
        <SummaryPill tone={counts.week.length ? 'warning' : 'neutral'} label={String(counts.week.length)} caption="this week" />
        <SummaryPill tone="neutral" label={String(counts.month.length)} caption="this month" />
        <SummaryPill tone="neutral" label={String(counts.later.length)} caption="later" />
        <View style={styles.summaryTotal}>
          <Text style={type.caption}>
            {deadlines.filter((d) => d.completed).length} completed
          </Text>
        </View>
      </View>

      <Card style={styles.controls}>
        <View style={styles.sortRow}>
          <Chip label="Active" selected={!completed} onPress={() => setCompleted(false)} />
          <Chip label={`Completed (${deadlines.filter((d) => d.completed).length})`} selected={completed} onPress={() => setCompleted(true)} />
          <View style={{ flex: 1 }} />
          <Text style={type.caption}>{filtered.length} result{filtered.length === 1 ? '' : 's'}</Text>
        </View>
        <Input
          accessibilityLabel="Search deadlines"
          value={query}
          onChangeText={setQuery}
          placeholder="Search product, merchant, or deadline type"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map(([value, label]) => (
            <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />
          ))}
        </ScrollView>
        <View style={styles.sortRow}>
          <Text style={type.caption}>Sort by</Text>
          {(['urgency', 'date', 'purchase'] as Sort[]).map((value) => (
            <Chip
              key={value}
              label={value[0].toUpperCase() + value.slice(1)}
              selected={sort === value}
              onPress={() => setSort(value)}
            />
          ))}
        </View>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon="search"
          title="No deadlines match"
          message="Try a different search or filter — your other deadlines are still being tracked. Nothing has been removed."
        />
      ) : completed ? (
        <View style={styles.grid}>
          {filtered.map((deadline) => (
            <DeadlineCard
              key={`${deadline.purchase.id}-${deadline.id}`}
              deadline={deadline}
              onPress={() => {
                setSelected(deadline);
                setError('');
                setConfirmingComplete(false);
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.groups}>
          {groupOrder
            .filter((group) => grouped[group.id].length > 0)
            .map((group) => (
              <View key={group.id} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupIcon, group.id === 'overdue' && styles.groupIconDanger, group.id === 'today' && styles.groupIconDanger]}>
                    <Feather name={group.icon as any} size={14} color={group.id === 'overdue' || group.id === 'today' ? colors.danger : colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={type.heading}>{group.title}</Text>
                    <Text style={type.bodySmall}>{group.detail} · {grouped[group.id].length}</Text>
                  </View>
                  <Badge label={String(grouped[group.id].length)} tone={group.id === 'overdue' || group.id === 'today' ? 'danger' : 'neutral'} />
                </View>
                <View style={styles.grid}>
                  {grouped[group.id].map((deadline) => (
                    <DeadlineCard
                      key={deadline.id}
                      deadline={deadline}
                      onPress={() => {
                        setSelected(deadline);
                        setError('');
                        setConfirmingComplete(false);
                      }}
                    />
                  ))}
                </View>
              </View>
            ))}
        </View>
      )}

      <Sheet
        visible={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setConfirmingComplete(false);
        }}
        eyebrow="DEADLINE DETAIL"
        title={selected ? deadlineTypeLabel(selected.type) : undefined}
        subtitle={selected ? `${days(selected)} · ${formatDate(selected.date)}` : undefined}
      >
        {selected ? (
          <>
            <View style={styles.detailProduct}>
              <ProductTile purchase={selected.purchase} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.label}>{selected.purchase.name}</Text>
                <Text style={type.bodySmall} numberOfLines={1}>{selected.purchase.merchant} · {formatDate(selected.date)}</Text>
              </View>
              <Badge label={days(selected)} tone={tone(selected.status)} />
            </View>
            <Card style={styles.detailCard}>
              <DetailRow label="Deadline" value={deadlineTypeLabel(selected.type)} />
              <DetailRow label="Exact date" value={formatDate(selected.date)} />
              <DetailRow label="Purchase" value={`${selected.purchase.name} · ${selected.purchase.merchant}`} />
              <DetailRow
                label="Documents on file"
                value={
                  selected.purchase.documents.length
                    ? selected.purchase.documents.map((d) => d.name).join(', ')
                    : 'None added — add a receipt to strengthen this record'
                }
              />
              <DetailRow label="Status" value={selected.completed ? 'Completed by you' : `${days(selected)} · ${selected.status}`} />
            </Card>
            <View style={styles.reminderNote}>
              <Feather name="bell-off" size={15} color={colors.inkSecondary} />
              <Text style={type.bodySmall}>
                Reminders are not connected in this build — nothing has been scheduled or sent. Track this date here until notifications are enabled.
              </Text>
            </View>
            <Text style={[type.caption, { marginTop: spacing.md }]}>
              Completing a deadline removes it from action lists. It does not extend coverage or submit a claim. You can reopen it anytime.
            </Text>
            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: spacing.sm }}>
                {error}
              </Text>
            ) : null}
            {!selected.completed && confirmingComplete ? (
              <View accessibilityLiveRegion="polite" style={styles.confirmNote}>
                <Feather name="help-circle" size={15} color={colors.info} />
                <Text style={type.bodySmall}>
                  Mark this deadline as completed? It will leave active lists (you can reopen it anytime) — coverage dates on the purchase do not change.
                </Text>
              </View>
            ) : null}
            <Button
              label={!selected.completed ? (confirmingComplete ? 'Confirm — mark completed' : 'Mark completed') : 'Reopen deadline'}
              icon={!selected.completed ? (confirmingComplete ? 'check-circle' : 'check') : 'rotate-ccw'}
              variant={confirmingComplete ? 'primary' : 'secondary'}
              loading={saving}
              onPress={async () => {
                if (!selected.completed && !confirmingComplete) {
                  setConfirmingComplete(true);
                  return;
                }
                setSaving(true);
                setError('');
                try {
                  await onUpdate({
                    ...selected.purchase,
                    deadlines: selected.purchase.deadlines.map((d) => (d.id === selected.id ? { ...d, completed: !selected.completed } : d)),
                  });
                  setSelected(null);
                  setConfirmingComplete(false);
                } catch {
                  setError('Could not save. Your deadline has not changed. Try again.');
                } finally {
                  setSaving(false);
                }
              }}
              style={{ marginTop: spacing.md }}
              fullWidth
            />
            <Button
              label="Open purchase record"
              icon="arrow-right"
              variant="tint"
              onPress={() => {
                onOpenPurchase(selected.purchase);
                setSelected(null);
              }}
              style={{ marginTop: spacing.sm }}
              fullWidth
            />
          </>
        ) : null}
      </Sheet>
    </>
  );
}

function SummaryPill({ label, caption, tone: pillTone }: { label: string; caption: string; tone: 'danger' | 'warning' | 'neutral' }) {
  const backgrounds = { danger: colors.dangerSurface, warning: colors.warningSurface, neutral: colors.surface };
  const text = { danger: colors.danger, warning: colors.warning, neutral: colors.ink };
  const borders = { danger: colors.dangerBorder, warning: colors.warningBorder, neutral: colors.border };
  return (
    <View style={[styles.summaryPill, { backgroundColor: backgrounds[pillTone], borderColor: borders[pillTone] }]}>
      <Text style={[styles.summaryValue, { color: text[pillTone] }]}>{label}</Text>
      <Text style={type.caption}>{caption}</Text>
    </View>
  );
}

function DeadlineCard({ deadline, onPress }: { deadline: NormalizedDeadline; onPress: () => void }) {
  const urgent = deadline.status === 'overdue' || deadline.status === 'today' || deadline.status === 'urgent';
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`View ${deadlineTypeLabel(deadline.type)} for ${deadline.purchase.name}, ${days(deadline)}`}
      style={[styles.deadlineCard, urgent && styles.deadlineCardUrgent]}
    >
      <View style={styles.cardTop}>
        <ProductTile purchase={deadline.purchase} />
        <Badge label={days(deadline)} tone={tone(deadline.status)} />
      </View>
      <Text style={[type.caption, styles.cardType]}>{deadlineTypeLabel(deadline.type).toUpperCase()}</Text>
      <Text numberOfLines={1} style={styles.product}>
        {deadline.purchase.name}
      </Text>
      <Text numberOfLines={1} style={type.bodySmall}>
        {deadline.purchase.merchant}
      </Text>
      <View style={styles.date}>
        <Feather name="calendar" size={13} color={colors.muted} />
        <Text style={type.label}>{formatDate(deadline.date)}</Text>
      </View>
      {deadline.completed ? (
        <View style={styles.completedPill}>
          <Feather name="check-circle" size={12} color={colors.success} />
          <Text style={styles.completedText}>Completed</Text>
        </View>
      ) : null}
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={type.caption}>{label.toUpperCase()}</Text>
      <Text style={[type.body, styles.detailValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap', alignItems: 'center' },
  summaryPill: { minWidth: 104, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 2, alignItems: 'flex-start' },
  summaryValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.7 },
  summaryTotal: { marginLeft: 'auto', paddingHorizontal: spacing.md },
  controls: { padding: spacing.lg, marginBottom: spacing.xl, gap: spacing.md, borderColor: colors.borderSubtle },
  filterRow: { gap: spacing.sm, paddingVertical: 2 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  groups: { gap: spacing.xl },
  group: { gap: spacing.md },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  groupIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  groupIconDanger: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  deadlineCard: { padding: spacing.lg, flexBasis: 248, flexGrow: 1, maxWidth: 400, gap: spacing.sm, ...shadows.card },
  deadlineCardUrgent: { borderColor: colors.warningBorder, backgroundColor: '#FFFBF5', ...shadows.raised },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardType: { marginTop: spacing.sm, letterSpacing: 0.7, fontWeight: '700' as const },
  product: { ...type.heading, fontSize: 15, marginTop: 2, letterSpacing: -0.2 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.sm, alignSelf: 'flex-start' },
  completedPill: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: spacing.sm, backgroundColor: colors.successSurface, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.successBorder },
  completedText: { fontSize: 11, fontWeight: '700', color: colors.success },
  detailProduct: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceMuted, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  detailCard: { padding: spacing.lg, marginTop: spacing.lg, gap: 0 },
  detailRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.borderSubtle, gap: 4 },
  detailValue: { color: colors.ink, fontWeight: '600' },
  reminderNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.infoBorder,
  },
});
