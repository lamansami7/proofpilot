import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../design/tokens';
import { documentKindLabel, formatDate } from '../lib/purchaseSelectors';
import { openDocumentFile } from '../lib/documents';
import { isBrowserDocument, readBrowserDocument } from '../lib/browserDocuments';
import type { PurchaseDocument } from '../types/purchase';
import { Badge, Banner, Button, Sheet } from './ui';

export type ViewableDocument = PurchaseDocument & { purchaseName?: string };

const isImageDoc = (document: PurchaseDocument) => Boolean(document.mimeType?.startsWith('image/')) || /\.(png|jpe?g|gif|webp)$/i.test(document.name);

export function DocumentViewer({ document, onClose }: { document: ViewableDocument | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'unavailable'>('idle');
  const [shared, setShared] = useState(false);

  useEffect(() => { setCopied(false); setOpenFailed(false); setCopyError(false); setShared(false); }, [document?.id]);

  // Resolve an imageable preview: object URLs for IndexedDB blobs, direct URIs elsewhere.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewUrl(null); setPreviewState('idle');
    const uri = document?.uri;
    if (!document || !uri || !isImageDoc(document)) return;
    const direct = uri.startsWith('data:') || uri.startsWith('blob:') || (Platform.OS !== 'web' && uri.startsWith('file://'));
    if (direct) { setPreviewUrl(uri); return; }
    if (Platform.OS === 'web' && isBrowserDocument(uri)) {
      setPreviewState('loading');
      readBrowserDocument(uri).then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl); setPreviewState('idle');
      }).catch(() => { if (!cancelled) setPreviewState('unavailable'); });
    } else {
      setPreviewState('unavailable');
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document?.id, document?.uri, document?.name, document?.mimeType]);

  if (!document) return null;

  const copy = async () => {
    if (!document.content) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(document.content); setCopied(true); setTimeout(() => setCopied(false), 2200); }
      else { setCopyError(true); }
    } catch { setCopyError(true); }
  };

  const open = async () => { setOpenFailed(false); const ok = await openDocumentFile(document); if (!ok) setOpenFailed(true); };

  const share = async () => {
    try {
      if (document.content) { await Share.share({ title: document.name, message: document.content }); setShared(true); return; }
      // Browsers have no native share sheet for local files — offer the download instead.
      if (Platform.OS === 'web') { await open(); return; }
      const ok = await openDocumentFile(document);
      if (!ok) setOpenFailed(true); else setShared(true);
    } catch { /* user cancelled */ }
  };

  return (
    <Sheet visible onClose={onClose} eyebrow={documentKindLabel(document.kind).toUpperCase()} title={document.name} subtitle={document.purchaseName ?? undefined}>
      <View style={styles.metaRow}>
        <Badge label={documentKindLabel(document.kind)} tone="brand" />
        {document.addedAt ? <Text style={type.caption}>Added {formatDate(document.addedAt)}</Text> : null}
        {document.mimeType ? <Text style={type.caption}>{document.mimeType}</Text> : null}
      </View>
      {isImageDoc(document) && previewUrl ? (
        <View style={styles.previewFrame}>
          <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" accessibilityLabel={`Preview of ${document.name}`} />
        </View>
      ) : isImageDoc(document) && previewState === 'loading' ? (
        <View style={styles.previewLoading} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.brandDark} />
          <Text style={type.bodySmall}>Loading preview from this device…</Text>
        </View>
      ) : null}
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
          <View style={styles.actionRow}>
            <Button label={Platform.OS === 'web' ? 'Open / download file' : 'Open file'} icon="external-link" onPress={open} style={{ flex: 1 }} />
            <Button label={shared ? 'Ready' : Platform.OS === 'web' ? 'Download' : 'Share'} icon={shared ? 'check' : 'share'} variant="secondary" onPress={share} style={{ flex: 1 }} />
          </View>
          {openFailed ? <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}>This file can’t be opened right now — its local copy may have been cleared. Retry, or reattach the original from the purchase record.</Text> : null}
        </>
      ) : (
        <Banner tone="warning" icon="info" title="Only the document details were saved" message="This record keeps the document’s name and type so your purchase file stays organized, but the file itself was not stored in this build. Re-attach it from the purchase screen if you need it." />
      )}
      {previewState === 'unavailable' ? <Text style={[type.caption, { marginTop: spacing.sm }]}>A thumbnail preview isn’t available for this file — use Open / download to view it.</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, flexWrap: 'wrap' },
  previewFrame: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.md },
  previewImage: { width: '100%', height: 260, backgroundColor: colors.surfaceMuted },
  previewLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  textFrame: { maxHeight: 340, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  textContent: { ...type.body, color: colors.ink },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
