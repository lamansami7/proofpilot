import React, { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type, shadows } from '../design/tokens';
import { persistDocumentUri } from '../lib/documents';
import {
  deadlineStatus,
  deriveProtection,
  documentKindLabel,
  formatDate,
  formatMoney,
  isoDate,
  nextDeadlineFor,
  protectionLabel,
} from '../lib/purchaseSelectors';
import type { DocumentKind, FeatherIconName, Purchase, PurchaseDocument } from '../types/purchase';
import { Badge, Button, Card, Chip, IconButton, Sheet, type BadgeTone } from './ui';
import { ProductTile } from './purchaseComponents';
import { PurchaseAssistant } from './purchaseAssistant';
import { ClaimGenerator } from './claimGenerator';
import { DocumentViewer, type ViewableDocument } from './documentViewer';

function protectionTone(status: Purchase['protectionStatus']): BadgeTone {
  return status === 'protected' ? 'success' : status === 'attention' ? 'warning' : 'neutral';
}

function windowBadge(date: string | null): { label: string; tone: BadgeTone } {
  const status = deadlineStatus(date);
  if (!date || !status) return { label: 'Not added', tone: 'neutral' };
  if (status.status === 'overdue') return { label: 'Passed', tone: 'danger' };
  if (status.status === 'today') return { label: 'Last day', tone: 'danger' };
  if (status.status === 'urgent') return { label: `${status.days} days left`, tone: 'warning' };
  return { label: `${status.days} days left`, tone: 'success' };
}

export function PurchaseDetails({
  purchase,
  onClose,
  onEdit,
  onDelete,
  onUpdate,
  onNotify,
}: {
  purchase: Purchase | null;
  onClose: () => void;
  onEdit: (purchase: Purchase) => void;
  onDelete: (purchase: Purchase) => void;
  onUpdate: (purchase: Purchase) => Promise<void>;
  onNotify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState<'assistant' | 'claim' | null>(null);
  const [addingDocument, setAddingDocument] = useState(false);
  const [pickingKind, setPickingKind] = useState<DocumentKind | null>(null);
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!purchase) return null;
  const returnBadge = windowBadge(purchase.returnDeadline);
  const warrantyBadge = windowBadge(purchase.warrantyEnd);
  const extraDeadlines = purchase.deadlines.filter((d) => d.type === 'rebate' || d.type === 'custom');
  const nextDeadline = nextDeadlineFor(purchase);

  const toggle = (section: 'assistant' | 'claim') => setExpanded((cur) => (cur === section ? null : section));

  const togglePin = async () => {
    setBusy(true);
    try {
      await onUpdate({ ...purchase, pinned: !purchase.pinned });
      onNotify(purchase.pinned ? `${purchase.name} unpinned.` : `${purchase.name} pinned to the top of your lists.`, 'success');
    } catch {
      onNotify('The pin could not be saved. Your record is unchanged.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const copySummary = async () => {
    const lines = [
      `${purchase.name} — ${purchase.merchant}`,
      `Price: ${formatMoney(purchase.price)}`,
      `Purchase date: ${formatDate(purchase.purchaseDate)}`,
      `Return deadline: ${purchase.returnDeadline ? formatDate(purchase.returnDeadline) : 'Not added'}`,
      `Warranty: ${purchase.warrantyEnd ? `coverage through ${formatDate(purchase.warrantyEnd)}${purchase.warrantyProvider ? ` (${purchase.warrantyProvider})` : ''}` : 'Not added'}`,
      purchase.serial ? `Serial: ${purchase.serial}` : null,
      purchase.model ? `Model: ${purchase.model}` : null,
      `Documents on file: ${purchase.documents.length}`,
      `Protection status: ${protectionLabel(purchase.protectionStatus)} — calculated from saved dates and receipts.`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(lines);
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2200);
        onNotify('Record summary copied to clipboard.', 'success');
      } else {
        await Share.share({ title: `${purchase.name} summary`, message: lines });
      }
    } catch {
      onNotify('Could not copy the summary. Your record is unchanged.', 'danger');
    }
  };

  const attachDocument = async (kind: DocumentKind) => {
    setPickingKind(null);
    setAddingDocument(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled) {
        const asset = result.assets[0];
        const uri = asset.uri ? await persistDocumentUri(asset.uri, asset.name) : null;
        const document: PurchaseDocument = {
          id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: asset.name,
          kind,
          mimeType: asset.mimeType ?? null,
          uri,
          addedAt: isoDate(new Date()),
        };
        const documents = [...purchase.documents, document];
        await onUpdate({
          ...purchase,
          documents,
          hasReceipt: purchase.hasReceipt || kind === 'receipt',
          hasWarrantyInfo: purchase.hasWarrantyInfo || kind === 'warranty',
          protectionStatus: deriveProtection({
            returnDeadline: purchase.returnDeadline,
            warrantyEnd: purchase.warrantyEnd,
            hasReceipt: purchase.hasReceipt || kind === 'receipt',
          }),
        });
        onNotify(`${documentKindLabel(kind)} attached to ${purchase.name}.`);
      }
    } catch {
      onNotify('The document could not be attached or saved. Try a PDF or image under 20 MB, and check device storage.');
    } finally {
      setAddingDocument(false);
    }
  };

  // Timeline for important dates
  const timeline = [
    purchase.purchaseDate ? { label: 'Purchased', date: purchase.purchaseDate, icon: 'shopping-bag' as const, done: true } : null,
    purchase.returnDeadline
      ? { label: 'Return deadline', date: purchase.returnDeadline, icon: 'corner-up-left' as const, done: false, badge: returnBadge }
      : null,
    purchase.warrantyEnd
      ? { label: 'Warranty expiration', date: purchase.warrantyEnd, icon: 'shield' as const, done: false, badge: warrantyBadge }
      : null,
    ...extraDeadlines.map((d) => ({
      label: d.title,
      date: d.date,
      icon: 'calendar' as const,
      done: Boolean(d.completed),
      badge: windowBadge(d.date),
    })),
  ].filter(Boolean) as Array<{ label: string; date: string; icon: FeatherIconName; done: boolean; badge?:{label:string;tone:BadgeTone} }>;

  return (
    <Sheet
      visible
      onClose={onClose}
      wide
      eyebrow={purchase.merchant.toUpperCase()}
      title={purchase.name}
      subtitle={`${formatMoney(purchase.price)} · Purchased ${formatDate(purchase.purchaseDate)} · ${purchase.category}`}
    >
      {/* Back affordance */}
      <View style={styles.breadcrumb}>
        <Feather name="chevron-left" size={14} color={colors.muted} />
        <Text style={type.caption}>Purchases</Text>
        <Text style={type.caption}>·</Text>
        <Text style={[type.caption, { color: colors.ink, fontWeight: '700' }]} numberOfLines={1}>{purchase.name}</Text>
      </View>

      <View style={styles.headerRow}>
        <ProductTile purchase={purchase} size={56} />
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
            <Badge label={protectionLabel(purchase.protectionStatus)} tone={protectionTone(purchase.protectionStatus)} icon="shield" />
            {purchase.pinned ? <Badge label="Pinned" tone="brand" icon="bookmark" /> : null}
            {nextDeadline ? (
              <Badge
                label={`${nextDeadline.days < 0 ? 'Past due' : nextDeadline.days === 0 ? 'Due today' : `${nextDeadline.days}d left`} · ${nextDeadline.title}`}
                tone={nextDeadline.days <= 2 ? 'danger' : nextDeadline.days <= 14 ? 'warning' : 'info'}
                icon="clock"
              />
            ) : null}
          </View>
          <Text style={type.bodySmall}>
            {purchase.merchant} · {purchase.category}
            {purchase.documents.length ? ` · ${purchase.documents.length} document${purchase.documents.length === 1 ? '' : 's'}` : ' · No documents yet'}
            {purchase.serial ? ` · ${purchase.serial}` : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button
            size="sm"
            variant={purchase.pinned ? 'primary' : 'secondary'}
            icon="bookmark"
            label={purchase.pinned ? 'Pinned' : 'Pin'}
            loading={busy}
            onPress={() => void togglePin()}
            accessibilityLabel={purchase.pinned ? `Unpin ${purchase.name}` : `Pin ${purchase.name} to the top of lists`}
          />
          <Button size="sm" variant="secondary" icon={copiedSummary ? 'check' : 'copy'} label={copiedSummary ? 'Copied' : 'Copy summary'} onPress={() => void copySummary()} />
          <Button size="sm" variant="secondary" icon="edit-2" label="Edit" onPress={() => onEdit(purchase)} />
          <Button
            size="sm"
            variant="secondary"
            icon="paperclip"
            label="Add document"
            loading={addingDocument}
            onPress={() => setPickingKind((cur) => (cur ? null : 'receipt'))}
          />
        </View>
      </View>

      {pickingKind ? (
        <View style={styles.kindPicker}>
          <Text style={type.label}>What are you attaching?</Text>
          <Text style={type.bodySmall}>Files stay on this device — they are never uploaded in this build.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm }}>
            <Chip label="Receipt" selected onPress={() => attachDocument('receipt')} />
            <Chip label="Warranty" onPress={() => attachDocument('warranty')} />
            <Chip label="Product doc" onPress={() => attachDocument('manual')} />
          </View>
        </View>
      ) : null}

      <Card style={[styles.proofCard]}>
        <View style={styles.proofHead}>
          <View style={styles.proofIcon}><Feather name="file-text" size={18} color={colors.brandDark} /></View>
          <Text style={type.heading}>Proof of purchase</Text>
          <View style={{ marginLeft: 'auto' }}>
            <Badge label={purchase.hasReceipt ? 'Receipt on record' : 'Receipt missing'} tone={purchase.hasReceipt ? 'success' : 'warning'} icon={purchase.hasReceipt ? 'check-circle' : 'alert-circle'} />
          </View>
        </View>
        <Text style={[type.body, { marginTop: spacing.sm }]}>
          {purchase.hasReceipt
            ? `${purchase.documents.filter((d) => d.kind === 'receipt').length} receipt record(s) attached. Verified information is saved with this purchase and powers your protection status.`
            : 'No receipt on record. Add your proof of purchase so it’s easy to find when you need it — it also upgrades this purchase to “Protected” when an active window exists.'}
        </Text>
        <Text style={[type.caption, { marginTop: spacing.sm, color: colors.muted }]}>
          Protection status uses your recorded dates and receipt records. It is not verification of a file, merchant policy, or claim eligibility.
        </Text>
      </Card>

      <View style={styles.protectionGrid}>
        <Card style={styles.protectionCard}>
          <View style={styles.protectionHead}>
            <View style={[styles.protectionIcon, { backgroundColor: colors.warningSurface }]}><Feather name="corner-up-left" size={16} color={colors.warning} /></View>
            <Text style={type.label}>Return window</Text>
            <View style={{ marginLeft: 'auto' }}><Badge label={returnBadge.label} tone={returnBadge.tone} /></View>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm, fontWeight: '600' as const }]}>
            {purchase.returnDeadline ? `Return by ${formatDate(purchase.returnDeadline)}.` : 'No return deadline saved.'}
          </Text>
          <Text style={type.caption}>{purchase.returnDeadline ? 'Check the merchant’s policy for exact terms and condition requirements.' : 'Add one while editing to track it in Deadline Radar.'}</Text>
        </Card>
        <Card style={styles.protectionCard}>
          <View style={styles.protectionHead}>
            <View style={styles.protectionIcon}><Feather name="shield" size={16} color={colors.brandDark} /></View>
            <Text style={type.label}>Warranty</Text>
            <View style={{ marginLeft: 'auto' }}><Badge label={warrantyBadge.label} tone={warrantyBadge.tone} /></View>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm, fontWeight: '600' as const }]}>
            {purchase.warrantyEnd
              ? `Coverage through ${formatDate(purchase.warrantyEnd)}${purchase.warrantyProvider ? ` · ${purchase.warrantyProvider}` : ''}.`
              : 'No warranty information saved.'}
          </Text>
          <Text style={type.caption}>{purchase.warrantyEnd ? 'Calculated from the saved expiration date. Provider terms still apply.' : 'Add provider and expiration while editing.'}</Text>
        </Card>
      </View>

      <Card style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={type.heading}>Important dates</Text>
          <Text style={type.caption}>Timeline</Text>
        </View>
        {timeline.length ? (
          <View style={styles.timeline}>
            {timeline.map((item, idx) => (
              <View key={item.label + item.date} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, item.done ? styles.timelineDotDone : item.badge?.tone === 'danger' ? styles.timelineDotDanger : styles.timelineDotPending]}>
                    <Feather name={item.icon} size={11} color={item.done ? colors.success : colors.muted} />
                  </View>
                  {idx < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={type.label}>{item.label}</Text>
                  <Text style={type.bodySmall}>{formatDate(item.date)}</Text>
                </View>
                {item.badge ? <Badge label={item.badge.label} tone={item.badge.tone} /> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={type.bodySmall}>No dates saved yet. Add return or warranty dates to see a timeline.</Text>
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={type.label}>Purchase facts</Text>
        <Text style={type.caption}>Verified information you saved — not inferred.</Text>
        <View style={styles.factGrid}>
          <Fact label="Merchant" value={purchase.merchant} />
          <Fact label="Price" value={formatMoney(purchase.price)} />
          <Fact label="Purchase date" value={formatDate(purchase.purchaseDate)} />
          <Fact label="Category" value={purchase.category} />
          <Fact label="Serial number" value={purchase.serial ?? 'Not added'} missing={!purchase.serial} />
          <Fact label="Model number" value={purchase.model ?? 'Not added'} missing={!purchase.model} />
          {purchase.warrantyProvider ? <Fact label="Warranty provider" value={purchase.warrantyProvider} /> : null}
          {purchase.notes ? <Fact label="Notes" value={purchase.notes} /> : null}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHead}>
          <View>
            <Text style={type.label}>Documents</Text>
            <Text style={type.caption}>Files stay on this device · {purchase.documents.length} total</Text>
          </View>
          <Button size="sm" variant="ghost" label="Add" icon="plus" onPress={() => setPickingKind((c) => (c ? null : 'receipt'))} />
        </View>
        {purchase.documents.length ? (
          purchase.documents.map((document) => (
            <DocumentRow key={document.id} document={document} onOpen={() => setViewing({ ...document, purchaseName: purchase.name })} />
          ))
        ) : (
          <View style={styles.emptyDoc}>
            <Feather name="file-minus" size={18} color={colors.subtle} />
            <Text style={[type.bodySmall, { textAlign: 'center' }]}>No documents yet. Use “Add document” to attach a receipt or warranty file.</Text>
          </View>
        )}
      </Card>

      {purchase.notes ? (
        <Card style={styles.section}>
          <Text style={type.label}>Notes</Text>
          <Text style={[type.body, { marginTop: spacing.sm }]}>{purchase.notes}</Text>
        </Card>
      ) : null}

      <ExpandableHeader icon="message-circle" title="Ask ProofPilot" open={expanded === 'assistant'} onToggle={() => toggle('assistant')} />
      {expanded === 'assistant' ? <PurchaseAssistant purchase={purchase} onEditPurchase={() => onEdit(purchase)} /> : null}

      <ExpandableHeader icon="file-text" title="Claim generator" open={expanded === 'claim'} onToggle={() => toggle('claim')} />
      {expanded === 'claim' ? (
        <ClaimGenerator
          purchase={purchase}
          onSaveDraft={async (document) => {
            await onUpdate({ ...purchase, documents: [...purchase.documents, document] });
            onNotify('Claim draft saved to your Vault.', 'success');
          }}
        />
      ) : null}

      <View style={styles.dangerZone}>
        {confirmDelete ? (
          <Card style={styles.deleteCard}>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <View style={styles.deleteIcon}><Feather name="alert-triangle" size={16} color={colors.danger} /></View>
              <Text style={type.label}>Delete this purchase?</Text>
            </View>
            <Text style={[type.bodySmall, { marginTop: spacing.sm }]}>
              This removes the purchase record and its document references. Cloud deletion is queued when signed in. Keep original files separately — JSON export does not include binary files.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button size="sm" label="Keep purchase" variant="secondary" onPress={() => setConfirmDelete(false)} />
              <Button size="sm" label="Delete permanently" icon="trash-2" variant="danger" onPress={() => onDelete(purchase)} />
            </View>
          </Card>
        ) : (
          <View style={styles.dangerRow}>
            <Text style={type.caption}>Record ID: {String(purchase.id)} · Protected content is local-first</Text>
            <Button size="sm" variant="ghost" icon="trash-2" label="Delete purchase" accessibilityLabel="Delete this purchase" onPress={() => setConfirmDelete(true)} />
          </View>
        )}
      </View>
      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </Sheet>
  );
}

function Fact({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <View style={styles.factCell}>
      <Text style={[type.caption, { letterSpacing: 0.6, fontWeight: '700' as const }]}>{label.toUpperCase()}</Text>
      <Text style={[type.label, { marginTop: 3 }, missing && { color: colors.subtle, fontWeight: '400' }]}>{value}</Text>
    </View>
  );
}

function ExpandableHeader({ icon, title, open, onToggle }: { icon: FeatherIconName; title: string; open: boolean; onToggle: () => void }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Button
        variant="secondary"
        fullWidth
        icon={icon}
        label={open ? `Close ${title.toLowerCase()}` : title}
        accessibilityLabel={`${open ? 'Close' : 'Open'} ${title}`}
        onPress={onToggle}
        style={{ justifyContent: 'flex-start' }}
      />
      {!open ? <Text style={[type.caption, { marginTop: 6 }]}>Tap to expand — content is scoped to this purchase only.</Text> : null}
    </View>
  );
}

function DocumentRow({ document, onOpen }: { document: PurchaseDocument; onOpen: () => void }) {
  return (
    <View style={styles.documentRow}>
      <View style={styles.docIcon}>
        <Feather
          name={document.kind === 'claim' ? 'file-text' : document.kind === 'receipt' ? 'credit-card' : 'file'}
          size={14}
          color={colors.brandDark}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={type.label}>
          {document.name}
        </Text>
        <Text style={type.caption}>
          {documentKindLabel(document.kind)}
          {document.addedAt ? ` · added ${formatDate(document.addedAt)}` : ''}
          {document.mimeType ? ` · ${document.mimeType}` : ''}
        </Text>
      </View>
      {document.content ? <Badge label="viewable" tone="info" /> : document.uri ? <Badge label="on-device" tone="neutral" /> : null}
      <IconButton icon="external-link" label={`Open ${document.name}`} size={34} onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: 'auto' },
  kindPicker: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  proofCard: { padding: spacing.xl, backgroundColor: colors.surface, borderColor: colors.borderSubtle, marginBottom: spacing.md, ...shadows.soft, borderLeftWidth: 3, borderLeftColor: colors.brand },
  proofHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  proofIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.brandBorder },
  protectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  protectionCard: { flex: 1, flexBasis: 260, padding: spacing.lg, minWidth: 0, ...shadows.card },
  protectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  protectionIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  section: { padding: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, gap: 0 },
  factCell: { flexGrow: 1, flexBasis: '46%', paddingVertical: spacing.sm, paddingRight: spacing.md, borderBottomWidth: 1, borderColor: colors.borderSubtle, minWidth: 140 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  docIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  emptyDoc: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: spacing.sm },
  timeline: { gap: 0, marginTop: spacing.md },
  timelineRow: { flexDirection: 'row', gap: spacing.md, minHeight: 54 },
  timelineLeft: { width: 20, alignItems: 'center' },
  timelineDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  timelineDotDone: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  timelineDotDanger: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder },
  timelineDotPending: { backgroundColor: colors.surface },
  timelineLine: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 4 },
  timelineContent: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  dangerZone: { marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderColor: colors.borderSubtle },
  dangerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  deleteCard: { padding: spacing.lg, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface },
  deleteIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.dangerBorder },
});
