import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, type } from '../design/tokens';
import { documentInventory, formatDate, type IndexedDocument } from '../lib/purchaseSelectors';
import type { FeatherIconName, Purchase } from '../types/purchase';
import { Badge, Banner, Button, Card, EmptyState, IconButton } from './ui';
import { DocumentViewer, type ViewableDocument } from './documentViewer';

export function VaultScreen({ items, onAdd, onOpenPurchase }: { items: Purchase[]; onAdd: () => void; onOpenPurchase: (purchase: Purchase) => void }) {
  const [viewing, setViewing] = useState<ViewableDocument | null>(null);
  const inventory = useMemo(() => documentInventory(items), [items]);

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
      <Banner tone="info" icon="hard-drive" title="Documents are stored on this device" message="Files stay in this app and are not uploaded anywhere in this build. Cloud storage activates when Supabase sync is configured." />
      <View style={styles.summary}>
        <VaultTile icon="credit-card" label="Receipts" value={inventory.receipts.length} />
        <VaultTile icon="shield" label="Warranty documents" value={inventory.warranty.length} />
        <VaultTile icon="file" label="Product documents" value={inventory.product.length} />
        <VaultTile icon="file-text" label="Claim drafts" value={inventory.claims.length} />
      </View>

      <DocumentSection title="Receipts" detail="Proof of purchase — the backbone of every return and claim" documents={inventory.receipts} empty="Attach a receipt from any purchase screen, or while adding a purchase." onView={setViewing} onOpenPurchase={onOpenPurchase} />
      <DocumentSection title="Warranty documents" detail="Coverage terms and certificates" documents={inventory.warranty} empty="Add a warranty document from a purchase’s record to keep coverage terms in reach." onView={setViewing} onOpenPurchase={onOpenPurchase} />
      <DocumentSection title="Product documents" detail="Manuals, order confirmations, and anything else" documents={inventory.product} empty="Product manuals and other files you attach will appear here." onView={setViewing} onOpenPurchase={onOpenPurchase} />
      <DocumentSection title="Claim drafts" detail="Editable drafts created with the Claim generator" documents={inventory.claims} empty="Generate a return or warranty draft from any purchase — saved drafts land here." onView={setViewing} onOpenPurchase={onOpenPurchase} />

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

function DocumentSection({ title, detail, documents, empty, onView, onOpenPurchase }: { title: string; detail: string; documents: IndexedDocument[]; empty: string; onView: (document: ViewableDocument) => void; onOpenPurchase: (purchase: Purchase) => void }) {
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
