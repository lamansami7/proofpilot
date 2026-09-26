import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, type } from '../design/tokens';
import { actionNeeded, deadlineStatus, documentInventory, formatDate, formatMoney, greeting, protectionSummary, recentPurchases, todayLine, upcomingDeadlines, type NormalizedDeadline } from '../lib/purchaseSelectors';
import type { ActionNeeded, FeatherIconName, Purchase } from '../types/purchase';
import { Badge, Banner, Button, Card, EmptyState, SectionHeader } from './ui';
import { AttentionRow, DeadlineRow, ProductTile, PurchaseCard } from './purchaseComponents';

type DashboardProps = {
  items: Purchase[];
  isPhone: boolean;
  userEmail?: string | null;
  sampleVisible: boolean;
  aiConfigured: boolean;
  onAdd: () => void;
  onOpen: (purchase: Purchase) => void;
  onPurchases: () => void;
  onDeadlines: () => void;
  onVault: () => void;
  onDismissSample: () => void;
  onClearSamples: () => void;
  onRestoreSamples: () => void;
};

export function Dashboard(props: DashboardProps) {
  const { items, isPhone, userEmail, sampleVisible, aiConfigured, onAdd, onOpen, onPurchases, onDeadlines, onVault, onDismissSample, onClearSamples, onRestoreSamples } = props;
  const summary = protectionSummary(items);
  const actions = actionNeeded(items);
  const upcoming = upcomingDeadlines(items);
  const docs = documentInventory(items);
  const recent = recentPurchases(items).slice(0, 3);

  return (
    <>
      <View style={[styles.header, isPhone && styles.headerPhone]}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>{todayLine().toUpperCase()}</Text>
          <Text style={type.display}>{greeting()}{userEmail ? `, ${userEmail.split('@')[0]}` : ''}.</Text>
          <Text style={[type.body, { marginTop: spacing.sm, maxWidth: 620 }]}>
            {items.length === 0 ? 'Keep track of everything you buy — receipts, return windows, warranties, and the dates that matter.' : `You have ${summary.total} purchase${summary.total === 1 ? '' : 's'} on record${summary.attention + summary.unprotected ? `, and ${summary.attention + summary.unprotected} could use a little attention` : ''}.`}
          </Text>
        </View>
        <Button label="Protect a purchase" icon="plus" onPress={onAdd} />
      </View>

      {sampleVisible ? (
        <View style={{ marginBottom: spacing.xl }}>
          <Banner tone="brand" icon="eye" title="You’re looking at sample data" message="Sample purchases are included in these totals. Add your own, or clear only the samples; your own purchases are kept.">
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
              <Button size="sm" label="Add my first purchase" icon="plus" onPress={() => { onDismissSample(); onAdd(); }} />
              <Button size="sm" variant="secondary" label="Clear samples" onPress={onClearSamples} />
              <Button size="sm" variant="ghost" label="Keep them" onPress={onDismissSample} />
            </View>
          </Banner>
        </View>
      ) : null}

      {items.length === 0 ? (
        <>
          <EmptyState icon="shield" title="Protect your first purchase" message="Add a receipt or purchase details and ProofPilot will track its return window, warranty, and documents — ready the moment you need them." actionLabel="Protect a purchase" onAction={onAdd} secondaryLabel="Load sample data" onSecondary={onRestoreSamples} />
          <Card style={styles.featureCard}>
            <Feature icon="corner-up-left" title="Never miss a return window" body="Return deadlines and warranty expirations are grouped by urgency in Deadline Radar." />
            <Feature icon="archive" title="Every receipt in one vault" body="Receipts, warranty documents, and claim drafts stay attached to the purchase they belong to." />
            <Feature icon="message-circle" title="Answers from your own records" body="Give the optional AI assistant your saved purchase fields. Review its answers against the merchant’s terms." />
          </Card>
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <View style={styles.heroKicker}><Feather name="shield" size={15} color={colors.brand} /><Text style={styles.heroEyebrow}>YOUR PURCHASES. BETTER PROTECTED.</Text></View>
              <Text style={styles.heroTitle}>Keep the proof.
Stay ahead of the dates.</Text>
              <Text style={styles.heroBody}>A clear picture of what you own, what’s covered, and what needs your attention next.</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' }}><Button label="Open Deadline Radar" icon="arrow-up-right" onPress={onDeadlines} /></View>
            </View>
            <View style={styles.heroAside}>
              <View style={styles.heroShield}><Feather name="shield" size={34} color={colors.brand} /></View>
              <Text style={styles.heroNumber}>{summary.protected}<Text style={{ fontSize: 22, color: '#B5C6C2' }}> / {summary.total}</Text></Text>
              <Text style={styles.heroAsideLabel}>actively protected</Text>
              <Text style={styles.heroAsideNote}>Receipt on record + an active
return or warranty window</Text>
            </View>
          </View>
          <View style={styles.metrics}>
            <Metric icon="shopping-bag" value={summary.total} label="Purchases tracked" detail="Your collection, in one place" onPress={onPurchases} />
            <Metric icon="shield" value={summary.protected} label="Actively protected" detail="Recorded dates, not a guarantee" onPress={onPurchases} />
            <Metric icon="calendar" value={upcoming.filter(d => d.days <= 30).length} label="Deadlines in 30 days" detail="Incomplete · including today" onPress={onDeadlines} />
            <Metric icon="clock" value={items.filter(p => p.warrantyEnd && deadlineStatus(p.warrantyEnd)!.days >= 0 && deadlineStatus(p.warrantyEnd)!.days <= 30).length} label="Warranties ending soon" detail="Within the next 30 days" onPress={onDeadlines} />
          </View>
          <ProtectionOverview summary={summary} upcoming={upcoming} actions={actions} isPhone={isPhone} onDeadlines={onDeadlines} onPurchases={onPurchases} />

          {actions.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Needs your attention" detail={actions.length === 1 ? 'One item needs a quick review' : `${actions.length} items need a quick review`} actionLabel="Deadline Radar" onAction={onDeadlines} />
              <View style={{ gap: spacing.sm }}>
                {actions.slice(0, 4).map((action: ActionNeeded) => <AttentionRow key={action.id} action={action} onPress={() => onOpen(action.purchase)} />)}
              </View>
            </View>
          ) : (
            <Card style={styles.allClear}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <Text style={type.label}>Everything is up to date</Text>
              <Text style={type.bodySmall}>No urgent deadlines and no missing essentials.</Text>
            </Card>
          )}

          <View style={[styles.columns, isPhone && styles.columnsPhone]}>
            <View style={styles.column}>
              <SectionHeader title="Upcoming deadlines" detail={upcoming.length ? `Next: ${formatDate(upcoming[0].date)}` : undefined} actionLabel="See all" onAction={onDeadlines} />
              {upcoming.length ? (
                <View style={{ gap: spacing.sm }}>
                  {upcoming.slice(0, 3).map((deadline: NormalizedDeadline) => <DeadlineRow key={deadline.id} deadline={deadline} onPress={() => onOpen(deadline.purchase)} />)}
                </View>
              ) : <EmptyState compact icon="calendar" title="No upcoming deadlines" message="Add return or warranty dates to a purchase and they will appear here." actionLabel="Protect a purchase" onAction={onAdd} />}
            </View>
            <View style={styles.column}>
              <SectionHeader title="Recent purchases" actionLabel={`All ${items.length}`} onAction={onPurchases} />
              <View style={styles.recentGrid}>
                {recent.map((purchase) => <PurchaseCard key={purchase.id} item={purchase} onPress={() => onOpen(purchase)} />)}
              </View>
            </View>
          </View>

          <Card onPress={onVault} accessibilityLabel="Open your document Vault" style={styles.vaultStrip}>
            <View style={styles.vaultIcon}><Feather name="archive" size={20} color={colors.brandDark} /></View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Your Vault</Text>
              <Text style={type.bodySmall}>{docs.receipts.length} receipt{docs.receipts.length === 1 ? '' : 's'} · {docs.warranty.length} warranty · {docs.product.length} product · {docs.claims.length} claim draft{docs.claims.length === 1 ? '' : 's'}</Text>
            </View>
            <Feather name="arrow-right" size={18} color={colors.brandDark} />
          </Card>

          <Card style={styles.assistantCard}>
            <View style={styles.assistantHead}>
              <View style={styles.assistantIcon}><Feather name="message-circle" size={20} color={colors.brandDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.heading}>Ask ProofPilot</Text>
                <Text style={type.bodySmall}>{aiConfigured ? 'The assistant receives your saved purchase fields. Always review AI answers.' : 'Answers use your saved facts once the secure AI service is connected — until then, ProofPilot shows exactly what it knows and what’s missing.'}</Text>
              </View>
            </View>
            <View style={styles.assistantChips}>
              {recent.map((purchase) => (
                <Card key={`ask-${purchase.id}`} onPress={() => onOpen(purchase)} accessibilityLabel={`Ask about ${purchase.name}`} style={styles.assistantChip}>
                  <ProductTile purchase={purchase} size={30} />
                  <Text numberOfLines={1} style={styles.assistantChipText}>{purchase.name}</Text>
                  <Feather name="arrow-up-right" size={13} color={colors.brandDark} />
                </Card>
              ))}
            </View>
          </Card>
        </>
      )}
    </>
  );
}

function ProtectionOverview({ summary, upcoming, actions, isPhone, onDeadlines, onPurchases }: { summary: ReturnType<typeof protectionSummary>; upcoming: NormalizedDeadline[]; actions: ActionNeeded[]; isPhone: boolean; onDeadlines: () => void; onPurchases: () => void }) {
  const protectedPct = summary.total ? summary.protected / summary.total : 0;
  const attentionPct = summary.total ? summary.attention / summary.total : 0;
  return (
    <Card style={styles.overview}>
      <View style={styles.overviewTop}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>PROTECTION OVERVIEW</Text>
          <Text style={styles.overviewTitle}>{summary.protected} of {summary.total} purchases protected</Text>
          <Text style={[type.bodySmall, { marginTop: 2 }]}>{formatMoney(summary.valueProtected)} recorded value with active coverage and a receipt</Text>
        </View>
        {actions.length > 0 ? <Button size="sm" variant="secondary" label={`${actions.length} to review`} icon="alert-circle" onPress={onDeadlines} /> : <Badge label="All clear" tone="success" icon="check-circle" />}
      </View>
      <View accessibilityLabel={`${summary.protected} protected, ${summary.attention} need attention, ${summary.unprotected} unprotected`} style={styles.progressTrack}>
        <View style={[styles.progressSegment, { flexBasis: `${protectedPct * 100}%`, backgroundColor: colors.brandStrong }]} />
        <View style={[styles.progressSegment, { flexBasis: `${attentionPct * 100}%`, backgroundColor: '#E4B15E' }]} />
        <View style={[styles.progressSegment, { flex: 1, backgroundColor: colors.borderStrong }]} />
      </View>
      <View style={[styles.overviewStats, isPhone && styles.overviewStatsPhone]}>
        <LegendDot color={colors.brandStrong} label={`${summary.protected} protected`} />
        <LegendDot color="#E4B15E" label={`${summary.attention} need attention`} />
        <LegendDot color={colors.borderStrong} label={`${summary.unprotected} unprotected`} />
        <View style={styles.overviewMeta}>
          <Text style={type.bodySmall}>{upcoming.length} upcoming deadline{upcoming.length === 1 ? '' : 's'} · {summary.missingReceipts} missing receipt{summary.missingReceipts === 1 ? '' : 's'}</Text>
          <Button size="sm" variant="ghost" label="View purchases" onPress={onPurchases} />
        </View>
      </View>
    </Card>
  );
}

function Metric({ icon, value, label, detail, onPress }: { icon: FeatherIconName; value: number; label: string; detail: string; onPress: () => void }) {
  return <Card onPress={onPress} accessibilityLabel={`${value} ${label}. ${detail}`} style={styles.metric}>
    <View style={styles.metricTop}><Feather name={icon} size={18} color={colors.brandDark} /><Feather name="arrow-up-right" size={14} color={colors.muted} /></View>
    <Text style={styles.metricValue}>{value}</Text><Text style={type.label}>{label}</Text><Text style={[type.caption, { marginTop: 5 }]}>{detail}</Text>
  </Card>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={type.bodySmall}>{label}</Text>
    </View>
  );
}

function Feature({ icon, title, body }: { icon: 'corner-up-left' | 'archive' | 'message-circle'; title: string; body: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}><Feather name={icon} size={17} color={colors.brandDark} /></View>
      <Text style={type.label}>{title}</Text>
      <Text style={[type.bodySmall, { marginTop: 2 }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, backgroundColor: '#193831', padding: spacing.xxl, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, overflow: 'hidden' },
  heroCopy: { flex: 1, flexBasis: 300, minWidth: 0 },
  heroKicker: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  heroEyebrow: { color: '#C6E0BD', fontSize: 10, letterSpacing: 1.4, fontWeight: '700', flexShrink: 1 },
  heroTitle: { fontSize: 33, lineHeight: 39, letterSpacing: -1, color: '#FFFFFF', fontWeight: '800', marginTop: spacing.lg },
  heroBody: { color: '#CCDAD4', fontSize: 14, lineHeight: 22, marginTop: spacing.md, maxWidth: 450 },
  heroAside: { flexGrow: 1, flexBasis: 180, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#25483E', padding: spacing.xl },
  heroShield: { width: 66, height: 66, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#345A46' },
  heroNumber: { color: '#FFFFFF', fontWeight: '800', fontSize: 44, letterSpacing: -2, marginTop: 10 },
  heroAsideLabel: { color: '#E2EFDD', fontSize: 14, fontWeight: '700' },
  heroAsideNote: { color: '#BECEC6', textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.lg },
  metric: { flex: 1, flexBasis: 180, padding: spacing.lg, minWidth: 0 },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between' },
  metricValue: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -1, marginTop: spacing.lg, marginBottom: 5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.xl, marginBottom: spacing.xl, flexWrap: 'wrap' },
  headerPhone: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.md },
  section: { marginTop: spacing.xl },
  allClear: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.xl },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, marginTop: spacing.xl },
  columnsPhone: { flexDirection: 'column' },
  column: { flex: 1, flexBasis: 320, minWidth: 0 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  overview: { padding: spacing.xl },
  overviewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overviewTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6, color: colors.ink, marginTop: 4 },
  progressTrack: { flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.surfaceMuted, marginTop: spacing.lg, gap: 3 },
  progressSegment: { height: 10, borderRadius: radius.pill },
  overviewStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md, flexWrap: 'wrap' },
  overviewStatsPhone: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm },
  overviewMeta: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  vaultStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, marginTop: spacing.xl },
  vaultIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  assistantCard: { padding: spacing.lg, marginTop: spacing.md, backgroundColor: colors.brandMuted, borderColor: '#DCE9CA' },
  assistantHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  assistantIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: '#DCEFC6', alignItems: 'center', justifyContent: 'center' },
  assistantChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  assistantChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingRight: spacing.md, flexGrow: 1, flexBasis: 190, maxWidth: 300, ...shadows.card },
  assistantChipText: { ...type.label, flex: 1 },
  featureCard: { flexDirection: 'row', gap: spacing.lg, padding: spacing.xl, marginTop: spacing.lg, flexWrap: 'wrap' },
  feature: { flex: 1, minWidth: 200, gap: spacing.sm },
  featureIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
});
