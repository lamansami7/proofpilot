import React, { useEffect, useMemo, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { deriveProtection, formatDate, formatMoney, isValidIsoDate, isoDate, isoDaysFrom, protectionLabel } from '../lib/purchaseSelectors';
import type { DocumentKind, FeatherIconName, Purchase, PurchaseDocument } from '../types/purchase';
import { Badge, Banner, Button, Chip, IconButton, Input, interactive, Sheet } from './ui';

type Form = { name: string; merchant: string; price: string; purchaseDate: string; category: string; serial: string; model: string; returnDeadline: string; warrantyEnd: string; warrantyProvider: string; notes: string };
type Field = keyof Form;
type FlowStep = 'start' | 'form' | 'review' | 'success';
type UploadState = 'idle' | 'processing' | 'success' | 'error';

const blankForm: Form = { name: '', merchant: '', price: '', purchaseDate: '', category: 'Other', serial: '', model: '', returnDeadline: '', warrantyEnd: '', warrantyProvider: '', notes: '' };
export const categoryOptions = ['Electronics', 'Appliances', 'Furniture', 'Clothing', 'Tools', 'Household', 'Other'];
const categoryIcons: Record<string, FeatherIconName> = { Electronics: 'monitor', Appliances: 'wind', Furniture: 'briefcase', Clothing: 'shopping-bag', Tools: 'tool', Household: 'home', Other: 'package' };
const tints = ['#E7EDFF', '#FAE8DB', '#E3F1E9', '#FBE9EA', '#F1E8FA', '#EAF2F8', '#F6F0DD'];

function formFor(purchase: Purchase): Form { return { name: purchase.name, merchant: purchase.merchant, price: purchase.price?.toString() ?? '', purchaseDate: purchase.purchaseDate ?? '', category: purchase.category, serial: purchase.serial ?? '', model: purchase.model ?? '', returnDeadline: purchase.returnDeadline ?? '', warrantyEnd: purchase.warrantyEnd ?? '', warrantyProvider: purchase.warrantyProvider ?? '', notes: purchase.notes ?? '' }; }
function sanitizePrice(value: string): string { const cleaned = value.replace(/[^0-9.]/g, ''); const firstDot = cleaned.indexOf('.'); if (firstDot === -1) return cleaned; return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2); }
function documentFor(asset: DocumentPicker.DocumentPickerAsset, kind: DocumentKind): PurchaseDocument { return { id: `document-${Date.now()}`, name: asset.name, kind, mimeType: asset.mimeType ?? null, uri: asset.uri ?? null, addedAt: isoDate(new Date()) }; }

function purchaseFromForm(form: Form, documents: PurchaseDocument[], defaultReturnDays: number, existing?: Purchase): Purchase {
  const price = Number(form.price);
  const returnDeadline = form.returnDeadline || null;
  const warrantyEnd = form.warrantyEnd || null;
  const hasReceipt = documents.some((document) => document.kind === 'receipt');
  const id = existing?.id ?? `local-${Date.now()}`;
  const carriedDeadlines = (existing?.deadlines ?? []).filter((deadline) => deadline.type === 'custom' || deadline.type === 'rebate');
  return {
    id,
    name: form.name.trim(), merchant: form.merchant.trim(), price, purchaseDate: form.purchaseDate || null,
    category: form.category.trim() || 'Other',
    icon: categoryIcons[form.category.trim()] ?? existing?.icon ?? 'package',
    tint: existing?.tint ?? tints[Math.abs(form.name.trim().length + form.merchant.trim().length) % tints.length],
    protectionStatus: deriveProtection({ returnDeadline, warrantyEnd, hasReceipt }),
    warrantyEnd, warrantyProvider: form.warrantyProvider.trim() || null, returnDeadline,
    serial: form.serial.trim() || null, model: form.model.trim() || null,
    hasReceipt, hasWarrantyInfo: Boolean(warrantyEnd),
    notes: form.notes.trim() || null, documents,
    deadlines: [
      ...(returnDeadline ? [{ id: `return-${id}`, type: 'return' as const, date: returnDeadline, title: 'Return window closes' }] : []),
      ...(warrantyEnd ? [{ id: `warranty-${id}`, type: 'warranty' as const, date: warrantyEnd, title: 'Warranty expires' }] : []),
      ...carriedDeadlines,
    ],
  };
}

export function PurchaseFlow({ visible, initialPurchase, merchants, defaultReturnDays, onClose, onSave, onDone }: { visible: boolean; initialPurchase: Purchase | null; merchants: string[]; defaultReturnDays: number; onClose: () => void; onSave: (purchase: Purchase) => void; onDone: (purchase: Purchase) => void }) {
  const editing = Boolean(initialPurchase);
  const [step, setStep] = useState<FlowStep>('start');
  const [form, setForm] = useState<Form>(blankForm);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [documents, setDocuments] = useState<PurchaseDocument[]>([]);
  const [upload, setUpload] = useState<UploadState>('idle');
  const [pendingKind, setPendingKind] = useState<DocumentKind>('receipt');
  const [saved, setSaved] = useState<Purchase | null>(null);

  useEffect(() => { if (visible) { setForm(initialPurchase ? formFor(initialPurchase) : blankForm); setDocuments(initialPurchase?.documents ?? []); setErrors({}); setUpload('idle'); setSaved(null); setStep(initialPurchase ? 'form' : 'start'); } }, [visible, initialPurchase]);

  const update = (field: Field, value: string) => { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined })); };

  const pickDocument = async (kind: DocumentKind) => {
    setPendingKind(kind); setUpload('processing');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) { setUpload('idle'); return; }
      setDocuments((current) => (kind === 'receipt' ? [...current.filter((document) => document.kind !== 'receipt'), documentFor(result.assets[0], kind)] : [...current, documentFor(result.assets[0], kind)]));
      setUpload('success');
    } catch { setUpload('error'); }
  };

  const scanReceipt = async () => {
    setUpload('processing');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setUpload('error'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled) { setUpload('idle'); return; }
      const asset = result.assets[0];
      setDocuments((current) => [...current.filter((document) => document.kind !== 'receipt'), { id: `receipt-${Date.now()}`, name: asset.fileName ?? 'Scanned receipt.jpg', kind: 'receipt', mimeType: asset.mimeType ?? 'image/jpeg', uri: asset.uri ?? null, addedAt: isoDate(new Date()) }]);
      setUpload('success'); setStep('form');
    } catch { setUpload('error'); }
  };

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!form.name.trim()) next.name = 'Enter the product name.';
    if (!form.merchant.trim()) next.merchant = 'Enter the merchant.';
    if (!form.price.trim() || !Number.isFinite(Number(form.price)) || Number(form.price) < 0) next.price = 'Enter a valid price, like 129.99.';
    if (!isValidIsoDate(form.purchaseDate)) next.purchaseDate = 'Use YYYY-MM-DD, or tap one of the quick dates.';
    (['returnDeadline', 'warrantyEnd'] as Field[]).forEach((field) => { if (form[field] && !isValidIsoDate(form[field])) next[field] = 'Use YYYY-MM-DD, or clear the field.'; });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = () => { const purchase = purchaseFromForm(form, documents, defaultReturnDays, initialPurchase ?? undefined); setSaved(purchase); onSave(purchase); setStep('success'); };
  const merchantSuggestions = useMemo(() => { const typed = form.merchant.trim().toLowerCase(); return merchants.filter((merchant) => !typed || merchant.toLowerCase().includes(typed)).filter((merchant) => merchant.toLowerCase() !== typed).slice(0, 3); }, [merchants, form.merchant]);

  return (
    <Sheet visible={visible} onClose={onClose} wide eyebrow={editing ? 'EDIT RECORD' : 'NEW RECORD'} title={editing ? 'Edit purchase' : 'Protect a purchase'} subtitle={editing ? 'Keep this purchase record accurate and complete.' : 'Receipts, return windows, and warranties — one safe place.'}>
      {step === 'start' ? <StartStep onManual={() => setStep('form')} onScan={scanReceipt} onUpload={() => pickDocument('receipt')} upload={upload} /> : null}
      {step === 'form' ? (
        <FormStep form={form} errors={errors} documents={documents} upload={upload} pendingKind={pendingKind} update={update} onPickDocument={pickDocument} onRemoveDocument={(id) => { setDocuments((current) => current.filter((document) => document.id !== id)); setUpload('idle'); }} merchantSuggestions={merchantSuggestions} defaultReturnDays={defaultReturnDays} onNext={() => { if (validate()) setStep('review'); }} />
      ) : null}
      {step === 'review' ? <ReviewStep purchase={purchaseFromForm(form, documents, defaultReturnDays, initialPurchase ?? undefined)} onEdit={() => setStep('form')} onSave={save} /> : null}
      {step === 'success' && saved ? <SuccessStep purchase={saved} editing={editing} onDone={() => onDone(saved)} /> : null}
    </Sheet>
  );
}

function StartStep({ onManual, onScan, onUpload, upload }: { onManual: () => void; onScan: () => void; onUpload: () => void; upload: UploadState }) {
  const cameraUnavailable = Platform.OS === 'web';
  return (
    <>
      <Method icon="camera" title="Scan a receipt" detail={cameraUnavailable ? 'Camera capture is available in the mobile app — upload or enter details here.' : 'Photograph the receipt with your camera.'} onPress={cameraUnavailable ? onUpload : onScan} disabled={cameraUnavailable} state={upload} />
      <Method icon="upload" title="Upload a receipt or document" detail="PDF or image. Stored on this device." onPress={onUpload} state={upload} />
      <Method icon="edit-3" title="Enter details manually" detail="The fastest way if the receipt isn’t handy." onPress={onManual} />
      <Banner tone="brand" icon="info" title="Automatic receipt reading is not connected in this build" message="Your file is attached as-is. Enter or confirm the purchase details yourself — nothing is guessed." />
    </>
  );
}

function Method({ icon, title, detail, onPress, state, disabled }: { icon: FeatherIconName; title: string; detail: string; onPress: () => void; state?: UploadState; disabled?: boolean }) {
  const status = state === 'processing' ? 'Attaching file…' : state === 'success' ? 'Document attached — confirm the details below.' : state === 'error' ? 'Could not read that file. Try again or continue without it.' : detail;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: Boolean(disabled) }} onPress={onPress} style={interactive([styles.method, disabled ? { opacity: 0.72 } : null], { hover: { ...styles.method, borderColor: colors.borderStrong, backgroundColor: colors.surface } })}>
      <View style={styles.methodIcon}><Feather name={icon} size={20} color={colors.brandDark} /></View>
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{title}</Text>
        <Text style={[type.bodySmall, { marginTop: 2 }, state === 'error' ? { color: colors.danger } : null, state === 'success' ? { color: colors.success } : null]}>{status}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.subtle} />
    </Pressable>
  );
}

function DateField({ label, value, error, onChange, hint, children }: { label: string; value: string; error?: string; onChange: (value: string) => void; hint?: string; children?: React.ReactNode }) {
  const valid = value !== '' && isValidIsoDate(value);
  return (
    <View style={{ flex: 1 }}>
      <Input label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" error={error} hint={valid ? `→ ${formatDate(value)}` : hint} keyboardType="numbers-and-punctuation" autoCapitalize="none" />
      {children ? <View style={styles.dateChips}>{children}</View> : null}
    </View>
  );
}

function FormStep({ form, errors, documents, upload, pendingKind, update, onPickDocument, onRemoveDocument, merchantSuggestions, defaultReturnDays, onNext }: { form: Form; errors: Partial<Record<Field, string>>; documents: PurchaseDocument[]; upload: UploadState; pendingKind: DocumentKind; update: (field: Field, value: string) => void; onPickDocument: (kind: DocumentKind) => void; onRemoveDocument: (id: string) => void; merchantSuggestions: string[]; defaultReturnDays: number; onNext: () => void }) {
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  return (
    <>
      <Text style={styles.stepHeading}>Purchase details</Text>
      <Input label="PRODUCT NAME — REQUIRED" value={form.name} onChangeText={(value) => update('name', value)} placeholder="e.g. Samsung Smart Monitor M7" error={errors.name} returnKeyType="next" />
      <View style={{ height: spacing.md }} />
      <Input label="MERCHANT — REQUIRED" value={form.merchant} onChangeText={(value) => update('merchant', value)} placeholder="e.g. Best Buy" error={errors.merchant} autoCapitalize="words" />
      {merchantSuggestions.length ? (
        <View style={styles.suggestionRow}>
          {merchantSuggestions.map((merchant) => <Chip key={merchant} label={merchant} onPress={() => update('merchant', merchant)} />)}
        </View>
      ) : null}
      <View style={{ height: spacing.md }} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Input label="PRICE — REQUIRED" value={form.price} onChangeText={(value) => update('price', sanitizePrice(value))} placeholder="0.00" prefix="$" keyboardType="decimal-pad" error={errors.price} hint={form.price && !errors.price && Number.isFinite(Number(form.price)) ? formatMoney(Number(form.price)) : undefined} />
        </View>
        <View style={{ flex: 1.2 }}>
          <DateField label="PURCHASE DATE — REQUIRED" value={form.purchaseDate} error={errors.purchaseDate} onChange={(value) => update('purchaseDate', value)}>
            <Chip label="Today" selected={form.purchaseDate === isoDate(new Date())} onPress={() => update('purchaseDate', isoDate(new Date()))} />
          </DateField>
        </View>
      </View>
      <View style={{ height: spacing.md }} />
      <Input label="CATEGORY" value={form.category} onChangeText={(value) => update('category', value)} placeholder="e.g. Electronics" autoCapitalize="words" />
      <View style={styles.suggestionRow}>
        {categoryOptions.map((category) => <Chip key={category} label={category} selected={form.category === category} onPress={() => update('category', category)} />)}
      </View>

      <Text style={styles.stepHeading}>Protection</Text>
      <Text style={[type.bodySmall, styles.sectionHint]}>Optional, but these dates power Deadline Radar and your claim drafts.</Text>
      <View style={styles.row}>
        <DateField label="RETURN DEADLINE" value={form.returnDeadline} error={errors.returnDeadline} onChange={(value) => update('returnDeadline', value)} hint="Last day the merchant accepts returns">
          <Chip label={`+${defaultReturnDays} days`} onPress={() => update('returnDeadline', isoDaysFrom(form.purchaseDate || null, defaultReturnDays))} />
          <Chip label="+15 days" onPress={() => update('returnDeadline', isoDaysFrom(form.purchaseDate || null, 15))} />
          {form.returnDeadline ? <Chip label="Clear" onPress={() => update('returnDeadline', '')} /> : null}
        </DateField>
        <DateField label="WARRANTY EXPIRATION" value={form.warrantyEnd} error={errors.warrantyEnd} onChange={(value) => update('warrantyEnd', value)} hint="When manufacturer coverage ends">
          <Chip label="+1 year" onPress={() => update('warrantyEnd', isoDaysFrom(form.purchaseDate || null, 365))} />
          <Chip label="+2 years" onPress={() => update('warrantyEnd', isoDaysFrom(form.purchaseDate || null, 730))} />
          {form.warrantyEnd ? <Chip label="Clear" onPress={() => update('warrantyEnd', '')} /> : null}
        </DateField>
      </View>
      <View style={{ height: spacing.md }} />
      <Input label="WARRANTY PROVIDER" value={form.warrantyProvider} onChangeText={(value) => update('warrantyProvider', value)} placeholder="e.g. Samsung, AppleCare" autoCapitalize="words" />

      <Text style={styles.stepHeading}>Product & documents</Text>
      <View style={styles.row}>
        <Input label="SERIAL NUMBER" value={form.serial} onChangeText={(value) => update('serial', value)} placeholder="Optional" autoCapitalize="characters" />
        <Input label="MODEL NUMBER" value={form.model} onChangeText={(value) => update('model', value)} placeholder="Optional" />
      </View>
      <View style={{ height: spacing.md }} />
      <Input label="NOTES" value={form.notes} onChangeText={(value) => update('notes', value)} placeholder="Anything else worth remembering" multiline />

      <View style={styles.documentCard}>
        <View style={styles.documentHeader}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Documents</Text>
            <Text style={type.bodySmall}>Receipts and warranty files stay on this device.</Text>
          </View>
          {kindPickerOpen ? (
            <View style={styles.kindPicker}>
              <Button size="sm" variant="secondary" label="Receipt" onPress={() => { setKindPickerOpen(false); onPickDocument('receipt'); }} />
              <Button size="sm" variant="secondary" label="Warranty" onPress={() => { setKindPickerOpen(false); onPickDocument('warranty'); }} />
              <Button size="sm" variant="secondary" label="Other" onPress={() => { setKindPickerOpen(false); onPickDocument('manual'); }} />
            </View>
          ) : (
            <Button size="sm" variant="secondary" icon="paperclip" label="Attach file" onPress={() => setKindPickerOpen(true)} loading={upload === 'processing'} />
          )}
        </View>
        {documents.length ? documents.map((document) => (
          <View key={document.id} style={styles.documentRow}>
            <Feather name="file-text" size={16} color={colors.success} />
            <Text numberOfLines={1} style={[type.bodySmall, { flex: 1 }]}>{document.name}</Text>
            <Badge label={document.kind === 'manual' ? 'product' : document.kind} tone="brand" />
            <IconButton icon="x" label={`Remove ${document.name}`} size={30} tone="ghost" onPress={() => onRemoveDocument(document.id)} />
          </View>
        )) : <Text style={[type.caption, { marginTop: spacing.sm }]}>Nothing attached yet. A receipt makes this purchase “Protected”.</Text>}
        {upload === 'error' ? <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm }]}><Feather name="alert-circle" size={12} color={colors.danger} /> That file couldn’t be read. Try another file, or continue without it.</Text> : null}
      </View>

      <View style={styles.footerActions}>
        <Button label="Review purchase" icon="arrow-right" onPress={onNext} fullWidth />
      </View>
    </>
  );
}

function ReviewStep({ purchase, onEdit, onSave }: { purchase: Purchase; onEdit: () => void; onSave: () => void }) {
  const rows: Array<[string, string]> = [
    ['Product', purchase.name], ['Merchant', purchase.merchant], ['Price', formatMoney(purchase.price)], ['Purchase date', formatDate(purchase.purchaseDate)], ['Category', purchase.category],
    ['Return deadline', purchase.returnDeadline ? formatDate(purchase.returnDeadline) : 'Not added'], ['Warranty', purchase.warrantyEnd ? `${formatDate(purchase.warrantyEnd)}${purchase.warrantyProvider ? ` · ${purchase.warrantyProvider}` : ''}` : 'Not added'],
    ['Serial / model', [purchase.serial, purchase.model].filter(Boolean).join(' · ') || 'Not added'], ['Documents', purchase.documents.length ? `${purchase.documents.length} attached` : 'None attached'],
  ];
  const statusTone = purchase.protectionStatus === 'protected' ? 'success' : purchase.protectionStatus === 'attention' ? 'warning' : 'neutral';
  return (
    <>
      <Text style={styles.stepHeading}>Review before saving</Text>
      <View style={styles.reviewStatus}>
        <Badge label={protectionLabel(purchase.protectionStatus)} tone={statusTone} />
        <Text style={[type.bodySmall, { flex: 1 }]}>
          {purchase.protectionStatus === 'protected' ? 'Coverage dates and a receipt are on file.' : purchase.protectionStatus === 'attention' ? 'Coverage dates are set, but no receipt is attached yet.' : 'No return or warranty dates yet — add them to start tracking.'}
        </Text>
      </View>
      <View style={styles.reviewCard}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.reviewRow}>
            <Text style={type.bodySmall}>{label}</Text>
            <Text style={[type.label, styles.reviewValue]}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        <Button label="Back to edit" icon="edit-2" variant="secondary" onPress={onEdit} style={{ flex: 1 }} />
        <Button label="Save purchase" icon="shield" onPress={onSave} style={{ flex: 1 }} />
      </View>
    </>
  );
}

function SuccessStep({ purchase, editing, onDone }: { purchase: Purchase; editing: boolean; onDone: () => void }) {
  const returnInfo = purchase.returnDeadline ? `Return window closes ${formatDate(purchase.returnDeadline)}` : 'No return deadline saved';
  const warrantyInfo = purchase.warrantyEnd ? `Warranty coverage through ${formatDate(purchase.warrantyEnd)}` : 'No warranty date saved';
  return (
    <View style={styles.success}>
      <View style={styles.successIcon}><Feather name="check" size={30} color={colors.success} /></View>
      <Text style={type.title}>{editing ? 'Purchase updated' : 'Purchase protected'}</Text>
      <Text style={[type.body, styles.successCopy]}>{editing ? 'Your record is up to date.' : `${purchase.name} is now part of your protection record.`}</Text>
      <View style={styles.successCard}>
        <View style={styles.successRow}><Feather name="corner-up-left" size={16} color={colors.inkSecondary} /><Text style={type.body}>{returnInfo}</Text></View>
        <View style={styles.successRow}><Feather name="shield" size={16} color={colors.inkSecondary} /><Text style={type.body}>{warrantyInfo}</Text></View>
        <View style={styles.successRow}><Feather name="file-text" size={16} color={colors.inkSecondary} /><Text style={type.body}>{purchase.documents.length ? `${purchase.documents.length} document${purchase.documents.length === 1 ? '' : 's'} in your Vault` : 'No documents yet — add them anytime'}</Text></View>
      </View>
      <Button label={editing ? 'Done' : 'View purchase record'} icon="arrow-right" onPress={onDone} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  method: { minHeight: 74, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  methodIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  stepHeading: { ...type.heading, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionHint: { marginBottom: spacing.md, marginTop: -spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  dateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  documentCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  documentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  kindPicker: { flexDirection: 'row', gap: spacing.sm },
  documentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  footerActions: { marginTop: spacing.xl },
  reviewStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
  reviewCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderColor: colors.border },
  reviewValue: { textAlign: 'right', flexShrink: 1 },
  success: { alignItems: 'center', paddingVertical: spacing.xl, maxWidth: 460, alignSelf: 'center', width: '100%' },
  successIcon: { height: 66, width: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSurface, marginBottom: spacing.lg },
  successCopy: { textAlign: 'center', marginTop: spacing.sm },
  successCard: { alignSelf: 'stretch', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xl, gap: spacing.md },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
