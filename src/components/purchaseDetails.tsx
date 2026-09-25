import React, { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { persistDocumentUri } from '../lib/documents';
import { deadlineStatus, deriveProtection, documentKindLabel, formatDate, formatMoney, isoDate, protectionLabel } from '../lib/purchaseSelectors';
import type { DocumentKind, FeatherIconName, Purchase, PurchaseDocument } from '../types/purchase';
import { Badge, Button, Card, Chip, IconButton, Sheet, type BadgeTone } from './ui';
import { ProductTile } from './purchaseComponents';
import { PurchaseAssistant } from './purchaseAssistant';
import { ClaimGenerator } from './claimGenerator';
import { DocumentViewer, type ViewableDocument } from './documentViewer';

function protectionTone(status: Purchase['protectionStatus']): BadgeTone { return status === 'protected' ? 'success' : status === 'attention' ? 'warning' : 'neutral'; }

function windowBadge(date: string | null): { label: string; tone: BadgeTone } {
  const status = deadlineStatus(date);
  if (!date || !status) return { label: 'Not added', tone: 'neutral' };
  if (status.status === 'overdue') return { label: 'Passed', tone: 'danger' };
  if (status.status === 'today') return { label: 'Last day', tone: 'danger' };
  if (status.status === 'urgent') return { label: `${status.days} days left`, tone: 'warning' };
  return { label: `${status.days} days left`, tone: 'success' };
}

export function PurchaseDetails({ purchase, onClose, onEdit, onDelete, onUpdate, onNotify }: { purchase: Purchase | null; onClose: () => void; onEdit: (purchase: Purchase) => void; onDelete: (purchase: Purchase) => void; onUpdate: (purchase: Purchase) => void; onNotify: (message: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState<'assistant' | 'claim' | null>(null);
  const [addingDocument, setAddingDocument] = useState(false);
  const [pickingKind, setPickingKind] = useState<DocumentKind | null>(null);
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);

  if (!purchase) return null;
  const returnBadge = windowBadge(purchase.returnDeadline);
  const warrantyBadge = windowBadge(purchase.warrantyEnd);
  const extraDeadlines = purchase.deadlines.filter((deadline) => deadline.type === 'rebate' || deadline.type === 'custom');

  const toggle = (section: 'assistant' | 'claim') => setExpanded((current) => (current === section ? null : section));

  const attachDocument = async (kind: DocumentKind) => {
    setPickingKind(null); setAddingDocument(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
      if (!result.canceled) {
        const asset = result.assets[0];
        const uri = asset.uri ? await persistDocumentUri(asset.uri, asset.name) : null;
        const document: PurchaseDocument = { id: `document-${Date.now()}`, name: asset.name, kind, mimeType: asset.mimeType ?? null, uri, addedAt: isoDate(new Date()) };
        const documents = [...purchase.documents, document];
        onUpdate({ ...purchase, documents, hasReceipt: purchase.hasReceipt || kind === 'receipt', hasWarrantyInfo: purchase.hasWarrantyInfo || kind === 'warranty', protectionStatus: deriveProtection({ returnDeadline: purchase.returnDeadline, warrantyEnd: purchase.warrantyEnd, hasReceipt: purchase.hasReceipt || kind === 'receipt' }) });
        onNotify(`${documentKindLabel(kind)} attached to ${purchase.name}.`);
      }
    } catch { onNotify('That file could not be read. Try a PDF or image.'); } finally { setAddingDocument(false); }
  };

  return (
    <Sheet visible onClose={onClose} wide eyebrow={purchase.merchant.toUpperCase()} title={purchase.name} subtitle={`${formatMoney(purchase.price)} · Purchased ${formatDate(purchase.purchaseDate)}`}>
      <View style={styles.headerRow}>
        <ProductTile purchase={purchase} size={52} />
        <View style={{ flex: 1, gap: 6 }}>
          <Badge label={protectionLabel(purchase.protectionStatus)} tone={protectionTone(purchase.protectionStatus)} icon="shield" />
          <Text style={type.bodySmall}>{purchase.category}{purchase.documents.length ? ` · ${purchase.documents.length} document${purchase.documents.length === 1 ? '' : 's'}` : ' · No documents yet'}</Text>
        </View>
        <View style={styles.headerActions}>
          <Button size="sm" variant="secondary" icon="edit-2" label="Edit" onPress={() => onEdit(purchase)} />
          <Button size="sm" variant="secondary" icon="paperclip" label="Add document" loading={addingDocument} onPress={() => setPickingKind((current) => (current ? null : 'receipt'))} />
        </View>
      </View>

      {pickingKind ? (
        <View style={styles.kindPicker}>
          <Text style={type.bodySmall}>What are you attaching?</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Chip label="Receipt" onPress={() => attachDocument('receipt')} />
            <Chip label="Warranty document" onPress={() => attachDocument('warranty')} />
            <Chip label="Product document" onPress={() => attachDocument('manual')} />
          </View>
        </View>
      ) : null}

      <View style={styles.protectionGrid}>
        <Card style={styles.protectionCard}>
          <View style={styles.protectionHead}>
            <View style={styles.protectionIcon}><Feather name="corner-up-left" size={17} color={colors.brandDark} /></View>
            <Text style={type.label}>Return window</Text>
            <View style={{ marginLeft: 'auto' }}><Badge label={returnBadge.label} tone={returnBadge.tone} /></View>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm }]}>
            {purchase.returnDeadline ? `Return by ${formatDate(purchase.returnDeadline)}.` : 'No return deadline saved.'}
          </Text>
          <Text style={type.caption}>{purchase.returnDeadline ? 'Check the merchant’s policy for exact terms.' : 'Add one while editing to track it here.'}</Text>
        </Card>
        <Card style={styles.protectionCard}>
          <View style={styles.protectionHead}>
            <View style={styles.protectionIcon}><Feather name="shield" size={17} color={colors.brandDark} /></View>
            <Text style={type.label}>Warranty</Text>
            <View style={{ marginLeft: 'auto' }}><Badge label={warrantyBadge.label} tone={warrantyBadge.tone} /></View>
          </View>
          <Text style={[type.body, { marginTop: spacing.sm }]}>
            {purchase.warrantyEnd ? `Coverage through ${formatDate(purchase.warrantyEnd)}${purchase.warrantyProvider ? `, provided by ${purchase.warrantyProvider}` : ''}.` : 'No warranty information saved.'}
          </Text>
          <Text style={type.caption}>{purchase.warrantyEnd ? 'Calculated from the saved expiration date.' : 'Add provider and dates while editing.'}</Text>
        </Card>
      </View>

      {extraDeadlines.length ? (
        <Card style={styles.section}>
          <Text style={type.label}>Other deadlines</Text>
          {extraDeadlines.map((deadline) => { const badge = windowBadge(deadline.date); return (
            <View key={deadline.id} style={styles.factRow}>
              <Text style={type.body}>{deadline.title}</Text>
              <Text style={type.bodySmall}>{formatDate(deadline.date)}</Text>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
          ); })}
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text style={type.label}>Purchase facts</Text>
        <View style={styles.factGrid}>
          <Fact label="Merchant" value={purchase.merchant} />
          <Fact label="Price" value={formatMoney(purchase.price)} />
          <Fact label="Purchase date" value={formatDate(purchase.purchaseDate)} />
          <Fact label="Category" value={purchase.category} />
          <Fact label="Serial number" value={purchase.serial ?? 'Not added'} missing={!purchase.serial} />
          <Fact label="Model number" value={purchase.model ?? 'Not added'} missing={!purchase.model} />
          {purchase.warrantyProvider ? <Fact label="Warranty provider" value={purchase.warrantyProvider} /> : null}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={type.label}>Documents</Text>
          <Text style={type.caption}>Files stay on this device</Text>
        </View>
        {purchase.documents.length ? purchase.documents.map((document) => (
          <DocumentRow key={document.id} document={document} onOpen={() => setViewing({ ...document, purchaseName: purchase.name })} />
        )) : <Text style={[type.bodySmall, { marginTop: spacing.sm }]}>No documents yet. Use “Add document” to attach a receipt or warranty file.</Text>}
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
      {expanded === 'claim' ? <ClaimGenerator purchase={purchase} onSaveDraft={(document) => { onUpdate({ ...purchase, documents: [...purchase.documents, document] }); onNotify('Claim draft saved to your Vault.'); }} /> : null}

      <View style={styles.dangerZone}>
        {confirmDelete ? (
          <Card style={styles.deleteCard}>
            <Text style={type.label}>Delete this purchase?</Text>
            <Text style={[type.bodySmall, { marginTop: 4 }]}>This permanently removes the record and its local documents.</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button size="sm" label="Keep purchase" variant="secondary" onPress={() => setConfirmDelete(false)} />
              <Button size="sm" label="Delete permanently" icon="trash-2" variant="danger" onPress={() => onDelete(purchase)} />
            </View>
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={type.caption}>Record ID: {String(purchase.id)}</Text>
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
      <Text style={type.caption}>{label.toUpperCase()}</Text>
      <Text style={[type.label, { marginTop: 2 }, missing && { color: colors.subtle, fontWeight: '400' }]}>{value}</Text>
    </View>
  );
}

function ExpandableHeader({ icon, title, open, onToggle }: { icon: FeatherIconName; title: string; open: boolean; onToggle: () => void }) {
  return (
    <Button variant="secondary" fullWidth icon={icon} label={open ? `Close ${title.toLowerCase()}` : title} accessibilityLabel={`${open ? 'Close' : 'Open'} ${title}`} onPress={onToggle} style={{ marginTop: spacing.md }} />
  );
}

function DocumentRow({ document, onOpen }: { document: PurchaseDocument; onOpen: () => void }) {
  return (
    <View style={styles.documentRow}>
      <Feather name={document.kind === 'claim' ? 'file-text' : document.kind === 'receipt' ? 'credit-card' : 'file'} size={16} color={colors.brandDark} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={type.label}>{document.name}</Text>
        <Text style={type.caption}>{documentKindLabel(document.kind)}{document.addedAt ? ` · added ${formatDate(document.addedAt)}` : ''}</Text>
      </View>
      {document.content ? <Badge label="viewable" tone="info" /> : null}
      <IconButton icon="external-link" label={`Open ${document.name}`} size={34} onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kindPicker: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
  protectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  protectionCard: { flex: 1, flexBasis: 260, padding: spacing.lg, minWidth: 0 },
  protectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  protectionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  section: { padding: spacing.lg, marginTop: spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  factCell: { flexGrow: 1, flexBasis: '46%', paddingVertical: spacing.sm, paddingRight: spacing.md },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  documentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  dangerZone: { marginTop: spacing.xl },
  deleteCard: { padding: spacing.lg, borderColor: '#F0C7CC', backgroundColor: colors.dangerSurface },
});
