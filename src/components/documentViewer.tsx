import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { documentKindLabel, formatDate } from '../lib/purchaseSelectors';
import { openDocumentFile } from '../lib/documents';
import type { PurchaseDocument } from '../types/purchase';
import { Badge, Banner, Button, Sheet } from './ui';

export type ViewableDocument = PurchaseDocument & { purchaseName?: string };

export function DocumentViewer({ document, onClose }: { document: ViewableDocument | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { setCopied(false); setOpenFailed(false); setCopyError(false); }, [document?.id]);
  if (!document) return null;

  const copy = async () => {
    if (!document.content) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(document.content); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    else { setCopyError(true); }
    } catch { setCopyError(true); }
  };

  const open = async () => { setOpenFailed(false); const ok = await openDocumentFile(document); if (!ok) setOpenFailed(true); };

  return (
    <Sheet visible onClose={onClose} eyebrow={documentKindLabel(document.kind).toUpperCase()} title={document.name} subtitle={document.purchaseName ?? undefined}>
      <View style={styles.metaRow}>
        <Badge label={documentKindLabel(document.kind)} tone="brand" />
        {document.addedAt ? <Text style={type.caption}>Added {formatDate(document.addedAt)}</Text> : null}
        {document.mimeType ? <Text style={type.caption}>{document.mimeType}</Text> : null}
      </View>
      {document.content ? (
        <>
          <ScrollView style={styles.textFrame} nestedScrollEnabled>
            <Text selectable style={styles.textContent}>{document.content}</Text>
          </ScrollView>
          {copyError ? <Text accessibilityRole="alert" style={type.bodySmall}>Clipboard unavailable. Select the text above to copy it manually.</Text> : null}
          <Button label={copied ? 'Copied to clipboard' : 'Copy text'} icon={copied ? 'check' : 'copy'} variant="secondary" onPress={copy} style={{ marginTop: spacing.md }} fullWidth />
        </>
      ) : document.uri ? (
        <>
          <Banner tone="info" icon="hard-drive" title="Stored on this device" message="This file was captured from your device and is not uploaded anywhere in this build." />
          <Button label={Platform.OS === 'web' ? "Open / download file" : "Open file"} icon="external-link" onPress={open} style={{ marginTop: spacing.md }} fullWidth />
          {openFailed ? <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}>This file can’t be opened right now — its local copy may have been cleared. Retry, or reattach the original from the purchase record.</Text> : null}
        </>
      ) : (
        <Banner tone="warning" icon="info" title="Only the document details were saved" message="This record keeps the document’s name and type so your purchase file stays organized, but the file itself was not stored in this build. Re-attach it from the purchase screen if you need it." />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, flexWrap: 'wrap' },
  textFrame: { maxHeight: 340, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  textContent: { ...type.body, color: colors.ink },
});
