import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, type } from '../design/tokens';
import { deriveProtection, documentInventory, formatDate, type IndexedDocument } from '../lib/purchaseSelectors';
import type { FeatherIconName, Purchase } from '../types/purchase';
import { deleteDocumentFile } from '../lib/documents';
import { Badge, Banner, Button, Card, Chip, EmptyState, IconButton, Input, Sheet } from './ui';
import { DocumentViewer, type ViewableDocument } from './documentViewer';

export function VaultScreen({ items, onAdd, onOpenPurchase, onUpdatePurchase }: { items: Purchase[]; onAdd: () => void; onOpenPurchase: (purchase: Purchase) => void; onUpdatePurchase: (purchase: Purchase) => Promise<void> }) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IndexedDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const inventory = useMemo(() => documentInventory(items), [items]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const keep = (document: IndexedDocument) => (kind === 'all' || document.kind === kind || (kind === 'manual' && document.kind === 'other')) && (!term || `${document.name} ${document.purchase.name} ${document.purchase.merchant} ${document.kind}`.toLocaleLowerCase().includes(term));
    return { receipts: inventory.receipts.filter(keep), warranty: inventory.warranty.filter(keep), product: inventory.product.filter(keep), claims: inventory.claims.filter(keep) };
  }, [inventory, query, kind]);
  const removeDocument = async (document: IndexedDocument) => {
    setBusy(true); setError('');
    try {
    const documents = document.purchase.documents.filter((item) => item.id !== document.id);
    const hasReceipt = documents.some((item) => item.kind === 'receipt');
    await onUpdatePurchase({ ...document.purchase, documents, hasReceipt, protectionStatus: deriveProtection({ returnDeadline: document.purchase.returnDeadline, warrantyEnd: document.purchase.warrantyEnd, hasReceipt }) });
    if (viewing?.id === document.id) setViewing(null);
    // Commit the record before removing its file. A failed save never destroys evidence.
    const shared = items.some(p => p.documents.some(d => d.uri && d.uri === document.uri && !(p.id === document.purchase.id && d.id === document.id)));
    if (!shared) await deleteDocumentFile(document).catch(() => setError('Record removed; the unused file could not be cleaned up on this device.'));
    setPendingDelete(null);
    } catch { setError('Nothing was deleted. The record could not be saved. Please retry.'); }
    finally { setBusy(false); }
  };

  if (items.length === 0) {
    return (
      <>
        <VaultHeader />
        <EmptyState icon="archive" title="Your Vault is empty" message="Documents live with the purchases they belong to. Protect a purchase and attach a receipt — it will be waiting for you here." actionLabel="Protect a purchase" onAction={onAdd} />
      </>
    );
  }

  return (
    <>
      <VaultHeader />
      <Banner tone="info" icon="hard-drive" title="Documents are stored on this device" message="Files stay in this browser or app and are not uploaded. Signed-in accounts sync document details, not file contents. Clearing site or app data removes local files; keep your originals." />
      <View style={styles.search}><Input accessibilityLabel="Search documents" value={query} onChangeText={setQuery} placeholder="Search documents, purchases, or merchants" /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        {[['all', 'All documents'], ['receipt', 'Receipts'], ['warranty', 'Warranties'], ['manual', 'Product documents'], ['claim', 'Claim drafts']].map(([value, label]) => <Chip key={value} label={label} selected={kind === value} onPress={() => setKind(value)} />)}
      </View>
      {error && !pendingDelete ? <Banner tone="warning" icon="alert-circle" title="Document storage" message={error} /> : null}
      {query && !Object.values(visible).some(docs => docs.length) ? <EmptyState compact icon="search" title="No documents match" message="Try a different filename, purchase, or document type." actionLabel="Reset search and filters" onAction={() => { setQuery(''); setKind('all'); }} /> : null}
      <View style={styles.summary}>
        <VaultTile icon="credit-card" label="Receipts" value={inventory.receipts.length} />
        <VaultTile icon="shield" label="Warranty documents" value={inventory.warranty.length} />
        <VaultTile icon="file" label="Product documents" value={inventory.product.length} />
        <VaultTile icon="file-text" label="Claim drafts" value={inventory.claims.length} />
      </View>

      {kind === 'all' || kind === 'receipt' ? <DocumentSection title="Receipts" detail="Proof of purchase — the backbone of every return and claim" documents={visible.receipts} empty="Attach a receipt from any purchase screen, or while adding a purchase." onView={setViewing} onOpenPurchase={onOpenPurchase} onDelete={(document) => { setError(''); setPendingDelete(document); }} /> : null}
      {kind === 'all' || kind === 'warranty' ? <DocumentSection title="Warranty documents" detail="Coverage terms and certificates" documents={visible.warranty} empty="Add a warranty document from a purchase’s record to keep coverage terms in reach." onView={setViewing} onOpenPurchase={onOpenPurchase} onDelete={(document) => { setError(''); setPendingDelete(document); }} /> : null}
      {kind === 'all' || kind === 'manual' ? <DocumentSection title="Product documents" detail="Manuals, order confirmations, and anything else" documents={visible.product} empty="Product manuals and other files you attach will appear here." onView={setViewing} onOpenPurchase={onOpenPurchase} onDelete={(document) => { setError(''); setPendingDelete(document); }} /> : null}
      {kind === 'all' || kind === 'claim' ? <DocumentSection title="Claim drafts" detail="Editable drafts created with the Claim generator" documents={visible.claims} empty="Generate a return or warranty draft from any purchase — saved drafts land here." onView={setViewing} onOpenPurchase={onOpenPurchase} onDelete={(document) => { setError(''); setPendingDelete(document); }} /> : null}

      <Sheet visible={Boolean(pendingDelete)} onClose={() => { if (!busy) setPendingDelete(null); }} eyebrow="REMOVE DOCUMENT" title="Delete this document?" subtitle={pendingDelete?.name}>
        <Text style={type.body}>This removes the document from its purchase and this device. Removing a receipt can change the purchase’s protection status. This cannot be undone.</Text>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: spacing.md }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
          <Button variant="secondary" label="Keep document" disabled={busy} onPress={() => setPendingDelete(null)} />
          <Button variant="danger" label="Delete document" loading={busy} onPress={() => { if (pendingDelete) void removeDocument(pendingDelete); }} />
        </View>
      </Sheet>
      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function VaultHeader() {
  return (
    <View style={styles.title}>
      <Text style={type.eyebrow}>DOCUMENT CENTER</Text>
      <Text style={type.display}>Protection Vault</Text>
      <Text style={[type.body, styles.subtitle]}>Every receipt, warranty, and draft — organized by what it is, linked to what it protects.</Text>
    </View>
  );
}

function VaultTile({ icon, label, value }: { icon: FeatherIconName; label: string; value: number }) {
  return (
    <Card style={styles.tile}>
      <View style={styles.tileIcon}><Feather name={icon} size={17} color={colors.brandDark} /></View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={type.bodySmall}>{label}</Text>
    </Card>
  );
}

function DocumentSection({ title, detail, documents, empty, onView, onOpenPurchase, onDelete }: { title: string; detail: string; documents: IndexedDocument[]; empty: string; onView: (document: ViewableDocument) => void; onOpenPurchase: (purchase: Purchase) => void; onDelete: (document: IndexedDocument) => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{title}</Text>
          <Text style={type.bodySmall}>{detail}</Text>
        </View>
        <Badge label={String(documents.length)} tone={documents.length ? 'brand' : 'neutral'} />
      </View>
      {documents.length ? (
        <Card>
          {documents.map((document, index) => (
            <View key={document.id} style={[styles.documentRow, index > 0 && styles.documentRowBorder]}>
              <Feather name={document.kind === 'claim' ? 'file-text' : document.kind === 'receipt' ? 'credit-card' : 'file'} size={17} color={colors.brandDark} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={type.label}>{document.name}</Text>
                <Text numberOfLines={1} style={type.bodySmall}>{document.purchase.name} · {document.purchase.merchant}{document.addedAt ? ` · added ${formatDate(document.addedAt)}` : ''}</Text>
              </View>
              {document.content ? <Badge label="viewable" tone="info" /> : null}
              <IconButton icon="external-link" label={`Open ${document.name}`} size={36} onPress={() => onView({ ...document, purchaseName: document.purchase.name })} />
              <Button size="sm" variant="ghost" label="Purchase" accessibilityLabel={`Open purchase ${document.purchase.name}`} onPress={() => onOpenPurchase(document.purchase)} />
              <IconButton icon="trash-2" label={`Delete ${document.name}`} size={36} onPress={() => onDelete(document)} />
            </View>
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyCard}><Feather name="inbox" size={15} color={colors.subtle} /><Text style={type.bodySmall}>{empty}</Text></Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  subtitle: { marginTop: spacing.sm, maxWidth: 620 },
  search: { marginTop: spacing.lg, maxWidth: 560 },
  summary: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.lg, flexWrap: 'wrap' },
  tile: { flex: 1, minWidth: 140, padding: spacing.lg, gap: 3 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  tileValue: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  documentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  documentRowBorder: { borderTopWidth: 1, borderColor: colors.border },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surfaceMuted, borderStyle: 'dashed' },
});
