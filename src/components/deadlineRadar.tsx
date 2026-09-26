import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { deadlineTypeLabel, formatDate, groupDeadlines, type DeadlineGroup, type NormalizedDeadline } from '../lib/purchaseSelectors';
import type { DeadlineType, Purchase } from '../types/purchase';
import { Badge, Button, Card, Chip, EmptyState, Input, Sheet, type BadgeTone } from './ui';
import { ProductTile } from './purchaseComponents';

type Filter = 'all' | DeadlineType;
type Sort = 'urgency' | 'date' | 'purchase';
const filters: Array<[Filter, string]> = [['all', 'All deadlines'], ['return', 'Returns'], ['warranty', 'Warranties'], ['rebate', 'Rebates'], ['custom', 'Custom']];
const groupOrder: Array<{ id: DeadlineGroup; title: string; detail: string }> = [
  { id: 'overdue', title: 'Overdue', detail: 'Needs attention now' },
  { id: 'today', title: 'Today', detail: 'Due by midnight' },
  { id: 'week', title: 'This week', detail: 'Next 7 days' },
  { id: 'month', title: 'This month', detail: 'Later this month' },
  { id: 'later', title: 'Later', detail: 'Future deadlines' },
];
const tone = (status: NormalizedDeadline['status']): BadgeTone => status === 'overdue' || status === 'today' ? 'danger' : status === 'urgent' ? 'warning' : 'success';
const days = (deadline: NormalizedDeadline) => deadline.completed ? 'Completed' : deadline.days < 0 ? `${Math.abs(deadline.days)} days overdue` : deadline.days === 0 ? 'Due today' : deadline.days === 1 ? '1 day remaining' : `${deadline.days} days remaining`;

export function DeadlineRadar({ deadlines, onOpenPurchase, onAdd, onUpdate }: { deadlines: NormalizedDeadline[]; onUpdate: (purchase: Purchase) => Promise<void>; onOpenPurchase: (purchase: Purchase) => void; onAdd: () => void }) {
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('urgency');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<NormalizedDeadline | null>(null);

  const filtered = useMemo(() => deadlines
    .filter((deadline) => Boolean(deadline.completed) === completed && (filter === 'all' || deadline.type === filter) && `${deadline.purchase.name} ${deadline.purchase.merchant} ${deadlineTypeLabel(deadline.type)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'purchase' ? a.purchase.name.localeCompare(b.purchase.name) : sort === 'date' ? a.date.localeCompare(b.date) : a.days - b.days || a.purchase.name.localeCompare(b.purchase.name)), [deadlines, filter, query, sort, completed]);
  const grouped = useMemo(() => groupDeadlines(filtered), [filtered]);
  const counts = useMemo(() => groupDeadlines(deadlines.filter(d => !d.completed)), [deadlines]);
  const overdueCount = counts.overdue.length + counts.today.length;

  if (deadlines.length === 0) {
    return (
      <>
        <PageHeader onAdd={onAdd} />
        <EmptyState icon="calendar" title="No deadlines tracked yet" message="When you protect a purchase with a return window or warranty date, it appears here automatically — grouped by urgency." actionLabel="Protect a purchase" onAction={onAdd} />
      </>
    );
  }

  return (
    <>
      <PageHeader onAdd={onAdd} />
      <View style={styles.summaryRow}>
        <SummaryPill tone={overdueCount ? 'danger' : 'neutral'} label={String(counts.overdue.length + counts.today.length)} caption="need action" />
        <SummaryPill tone={counts.week.length ? 'warning' : 'neutral'} label={String(counts.week.length)} caption="this week" />
        <SummaryPill tone="neutral" label={String(counts.month.length)} caption="this month" />
        <SummaryPill tone="neutral" label={String(counts.later.length)} caption="later" />
      </View>

      <Card style={styles.controls}>
        <View style={styles.sortRow}><Chip label="Active" selected={!completed} onPress={() => setCompleted(false)} /><Chip label={`Completed (${deadlines.filter(d => d.completed).length})`} selected={completed} onPress={() => setCompleted(true)} /></View>
        <Input accessibilityLabel="Search deadlines" value={query} onChangeText={setQuery} placeholder="Search product, merchant, or deadline type" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map(([value, label]) => <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />)}
        </ScrollView>
        <View style={styles.sortRow}>
          <Text style={type.caption}>Sort by</Text>
          {(['urgency', 'date', 'purchase'] as Sort[]).map((value) => (
            <Chip key={value} label={value[0].toUpperCase() + value.slice(1)} selected={sort === value} onPress={() => setSort(value)} />
          ))}
        </View>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState compact icon="search" title="No deadlines match" message="Try a different search or filter — your other deadlines are still being tracked." />
      ) : completed ? (
        <View style={styles.grid}>{filtered.map(deadline => <DeadlineCard key={`${deadline.purchase.id}-${deadline.id}`} deadline={deadline} onPress={() => { setSelected(deadline); setError(''); }} />)}</View>
      ) : (
        <View style={styles.groups}>
          {groupOrder.filter((group) => grouped[group.id].length > 0).map((group) => (
            <View key={group.id}>
              <View style={styles.groupHeader}>
                <Text style={type.heading}>{completed ? 'Completed · ' + group.title : group.title}</Text>
                <Text style={type.bodySmall}>{group.detail} · {grouped[group.id].length}</Text>
              </View>
              <View style={styles.grid}>
                {grouped[group.id].map((deadline) => <DeadlineCard key={deadline.id} deadline={deadline} onPress={() => { setSelected(deadline); setError(''); }} />)}
              </View>
            </View>
          ))}
        </View>
      )}

      <Sheet visible={Boolean(selected)} onClose={() => setSelected(null)} eyebrow="DEADLINE DETAIL" title={selected ? deadlineTypeLabel(selected.type) : undefined} subtitle={selected ? `${days(selected)} · ${formatDate(selected.date)}` : undefined}>
        {selected ? (
          <>
            <View style={styles.detailProduct}>
              <ProductTile purchase={selected.purchase} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{selected.purchase.name}</Text>
                <Text style={type.bodySmall}>{selected.purchase.merchant}</Text>
              </View>
              <Badge label={days(selected)} tone={tone(selected.status)} />
            </View>
            <Card style={styles.detailCard}>
              <DetailRow label="Deadline" value={deadlineTypeLabel(selected.type)} />
              <DetailRow label="Exact date" value={formatDate(selected.date)} />
              <DetailRow label="Purchase" value={`${selected.purchase.name} · ${selected.purchase.merchant}`} />
              <DetailRow label="Documents on file" value={selected.purchase.documents.length ? selected.purchase.documents.map((document) => document.name).join(', ') : 'None added'} />
            </Card>
            <View style={styles.reminderNote}>
              <Feather name="bell-off" size={15} color={colors.inkSecondary} />
              <Text style={type.bodySmall}>Reminders are not connected in this build — nothing has been scheduled or sent. Track this date here until notifications are enabled.</Text>
            </View>
            <Text style={[type.caption, { marginTop: spacing.md }]}>Completing a deadline removes it from action lists. It does not extend coverage or submit a claim.</Text>
            {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
            <Button label={selected.completed ? 'Reopen deadline' : 'Mark completed'} icon={selected.completed ? 'rotate-ccw' : 'check'} loading={saving} onPress={async () => {
              setSaving(true); setError('');
              try { await onUpdate({ ...selected.purchase, deadlines: selected.purchase.deadlines.map(d => d.id === selected.id ? { ...d, completed: !selected.completed } : d) }); setSelected(null); }
              catch { setError('Could not save. Your deadline has not changed. Try again.'); }
              finally { setSaving(false); }
            }} style={{ marginTop: spacing.md }} fullWidth />
            <Button label="Open purchase record" icon="arrow-right" onPress={() => { onOpenPurchase(selected.purchase); setSelected(null); }} style={{ marginTop: spacing.lg }} fullWidth />
          </>
        ) : null}
      </Sheet>
    </>
  );
}

function PageHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.title}>
      <View style={{ flex: 1 }}>
        <Text style={type.eyebrow}>STAY ONE STEP AHEAD</Text>
        <Text style={type.display}>Deadline Radar</Text>
        <Text style={[type.body, styles.subtitle]}>Every return window, warranty, and custom date — sorted by how soon it needs you.</Text>
      </View>
      <Button label="Protect a purchase" icon="plus" onPress={onAdd} />
    </View>
  );
}

function SummaryPill({ label, caption, tone: pillTone }: { label: string; caption: string; tone: 'danger' | 'warning' | 'neutral' }) {
  const backgrounds = { danger: colors.dangerSurface, warning: colors.warningSurface, neutral: colors.surface };
  const text = { danger: colors.danger, warning: colors.warning, neutral: colors.ink };
  return (
    <View style={[styles.summaryPill, { backgroundColor: backgrounds[pillTone] }]}>
      <Text style={[styles.summaryValue, { color: text[pillTone] }]}>{label}</Text>
      <Text style={type.caption}>{caption}</Text>
    </View>
  );
}

function DeadlineCard({ deadline, onPress }: { deadline: NormalizedDeadline; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`View ${deadlineTypeLabel(deadline.type)} for ${deadline.purchase.name}, ${days(deadline)}`} style={styles.deadlineCard}>
      <View style={styles.cardTop}>
        <ProductTile purchase={deadline.purchase} />
        <Badge label={days(deadline)} tone={tone(deadline.status)} />
      </View>
      <Text style={[type.caption, styles.cardType]}>{deadlineTypeLabel(deadline.type).toUpperCase()}</Text>
      <Text numberOfLines={1} style={styles.product}>{deadline.purchase.name}</Text>
      <Text numberOfLines={1} style={type.bodySmall}>{deadline.purchase.merchant}</Text>
      <View style={styles.date}>
        <Feather name="calendar" size={14} color={colors.muted} />
        <Text style={type.label}>{formatDate(deadline.date)}</Text>
      </View>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={type.bodySmall}>{label}</Text>
      <Text style={[type.label, styles.detailValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.xl, flexWrap: 'wrap' },
  subtitle: { marginTop: spacing.sm, maxWidth: 570 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  summaryPill: { minWidth: 108, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: 2 },
  summaryValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.7 },
  controls: { padding: spacing.lg, marginBottom: spacing.xl, gap: spacing.md },
  filterRow: { gap: spacing.sm },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  groups: { gap: spacing.xl },
  groupHeader: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  deadlineCard: { padding: spacing.lg, flexBasis: 245, flexGrow: 1, maxWidth: 400 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardType: { marginTop: spacing.lg },
  product: { ...type.heading, fontSize: 16, marginTop: 3 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  detailProduct: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailCard: { padding: spacing.lg, marginTop: spacing.lg },
  detailRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, gap: 4 },
  detailValue: { color: colors.inkSecondary, textAlign: 'right', flexShrink: 1 },
  reminderNote: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
});
