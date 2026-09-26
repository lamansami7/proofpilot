import { contextFor, claimTemplate } from '../services/ai/purchaseContext';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { createAIService, type AIService, type ClaimType } from '../services/ai/AIService';
import { colors, radius, spacing, type } from '../design/tokens';
import { formatDate, formatMoney, isoDate } from '../lib/purchaseSelectors';
import type { Purchase, PurchaseDocument } from '../types/purchase';
import { Badge, Banner, Button, Card, Input } from './ui';


function factsFor(p: Purchase, claimType: ClaimType): Array<[string, string]> {
  return [
    ['Product', p.name],
    ['Merchant', p.merchant],
    ['Purchase date', formatDate(p.purchaseDate)],
    ['Price', formatMoney(p.price)],
    [claimType === 'return' ? 'Return deadline' : 'Warranty expiration', formatDate(claimType === 'return' ? p.returnDeadline : p.warrantyEnd)],
    ...(claimType === 'warranty' && p.warrantyProvider ? [['Warranty provider', p.warrantyProvider] as [string, string]] : []),
    ...(p.serial ? [['Serial number', p.serial] as [string, string]] : []),
    ['Documents', p.documents.length ? `${p.documents.length} saved` : 'None saved'],
  ];
}
function missingFor(p: Purchase, claimType: ClaimType): string[] {
  return [
    claimType === 'return' && !p.returnDeadline ? 'return deadline or the merchant’s return policy' : '',
    claimType === 'warranty' && !p.warrantyEnd ? 'warranty expiration or terms' : '',
    claimType === 'warranty' && !p.warrantyProvider ? 'warranty provider' : '',
    !p.documents.some(d => d.kind === 'receipt') ? 'receipt or proof of purchase' : '',
    claimType === 'warranty' && !p.serial ? 'serial number, if the provider requires it' : '',
  ].filter(Boolean);
}

export function ClaimGenerator({ purchase, onSaveDraft, assistant = createAIService() }: { purchase: Purchase; onSaveDraft?: (document: PurchaseDocument) => Promise<void>; assistant?: AIService }) {
  const [claimType, setClaimType] = useState<ClaimType>('return');
  const [issue, setIssue] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'unavailable' | 'error' | 'ready'>('idle');
  const [extraMissing, setExtraMissing] = useState<string[]>([]);
  const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [source, setSource] = useState<'AI' | 'Template'>('Template');
  const [copied, setCopied] = useState(false);

  const facts = useMemo(() => factsFor(purchase, claimType), [purchase, claimType]);
  const missing = [...new Set([...missingFor(purchase, claimType), ...extraMissing])];

  const select = (next: ClaimType) => { setClaimType(next); setDraft(''); setExtraMissing([]); setStatus('idle'); };
  const generate = async () => {
    setStatus('loading'); setSource('AI');
    try {
      const result = await assistant.generateClaim(contextFor(purchase), claimType, issue.trim() || undefined);
      setDraft(result.draft); setExtraMissing(result.missingInformation); setStatus('ready');
    } catch (error) {
      setStatus(error instanceof Error && (error as { code?: string }).code === 'unavailable' ? 'unavailable' : 'error');
    }
  };

  const copy = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    } catch { /* clipboard unavailable */ }
  };
  const share = async () => {
    try { await Share.share({ title: `${purchase.name} claim draft`, message: draft }); } catch { /* user cancelled or unsupported */ }
  };
  const copyFacts = async () => {
    const text = facts.map(([label, value]) => `${label}: ${value}`).join('\n');
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    } catch { /* clipboard unavailable */ }
  };
  const saveToVault = async () => {
    if (!onSaveDraft) return;
    setVaultState('saving');
    try { await onSaveDraft({
      id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${claimType === 'return' ? 'Return' : 'Warranty'} claim draft — ${purchase.name} (${isoDate(new Date())})`,
      kind: 'claim',
      mimeType: 'text/plain',
      content: draft,
      addedAt: isoDate(new Date()),
    }); setVaultState('saved'); } catch { setVaultState('error'); }
  };

  return (
    <Card style={styles.card}>
      <Banner tone="info" icon="file-text" title="Drafts, never submissions" message="Saved facts are user-entered, not independently verified. Review every statement and policy before sending. No claim is submitted by ProofPilot." />
      <View style={styles.heading}>
        <View style={styles.icon}><Feather name="file-text" size={18} color={colors.brandDark} /></View>
        <View style={styles.flex}>
          <Text style={type.heading}>Claim generator</Text>
          <Text style={type.bodySmall}>Drafts built only from your verified purchase facts.</Text>
        </View>
      </View>
      <ClaimStepper active={status === 'ready' ? 3 : status === 'loading' ? 2 : issue.trim() ? 1 : 0} />

      <View style={styles.tabs}>
        {(['return', 'warranty'] as ClaimType[]).map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === claimType }} accessibilityHint={item === claimType ? 'Selected' : `Switch to ${item} claim`} onPress={() => select(item)} style={[styles.tab, item === claimType ? styles.tabActive : null]}>
            <Text style={item === claimType ? styles.tabActiveText : type.label}>{item === 'return' ? 'Return claim' : 'Warranty claim'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.eyebrow}>SAVED PURCHASE FACTS</Text>
      <View style={styles.factGrid}>
        {facts.map(([label, value]) => (
          <View key={label} style={styles.fact}>
            <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
            <Text style={type.bodySmall}>{value}</Text>
          </View>
        ))}
      </View>

      {missing.length ? (
        <View style={styles.missing}>
          <Feather name="info" size={16} color={colors.warning} style={{ marginTop: 1 }} />
          <View style={styles.flex}>
            <Text style={type.label}>Missing information</Text>
            <Text style={type.bodySmall}>Check these before sending: {missing.join(' · ')}</Text>
          </View>
        </View>
      ) : <Banner tone="success" icon="check-circle" title="Core purchase fields are saved" message="The merchant or provider may still require more information." />}

      {status === 'ready' ? (
        <View style={styles.draftBlock}>
          <Badge label={`${source === 'AI' ? 'AI-GENERATED' : 'TEMPLATE'} DRAFT — REVIEW BEFORE SENDING`} tone="warning" icon="alert-triangle" />
          <Text style={type.caption}>{source === 'AI' ? 'AI-generated draft · may contain errors · verify every claim against your documents' : 'Deterministic template · built only from the saved facts above'}</Text>
          <TextInput accessibilityLabel="Editable claim draft" value={draft} onChangeText={value => { setDraft(value); setVaultState('idle'); }} multiline textAlignVertical="top" style={styles.editor} />
          {vaultState === 'error' ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>Draft could not be saved. Your text is still here; retry.</Text> : null}
          {vaultState === 'saved' ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success }}>Draft saved to Vault.</Text> : null}
          <View style={styles.actions}>
            <Button size="sm" label={copied ? 'Copied' : 'Copy draft'} icon={copied ? 'check' : 'copy'} variant="secondary" onPress={copy} />
            <Button size="sm" label="Share / export" icon="share" variant="secondary" onPress={share} />
            {onSaveDraft ? <Button size="sm" label="Save to Vault" loading={vaultState === 'saving'} disabled={vaultState === 'saved'} icon="archive" variant="secondary" onPress={saveToVault} /> : null}
            <Button size="sm" label="Start over" icon="edit-2" variant="ghost" onPress={() => { setDraft(''); setStatus('idle'); setVaultState('idle'); }} />
            <Button size="sm" label="Regenerate" icon="refresh-cw" variant="ghost" onPress={generate} disabled={!assistant.isConfigured} />
          </View>
          <Text style={type.caption}>ProofPilot never sends this claim for you — review, edit, and send it yourself.</Text>
        </View>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Input label="WHAT WENT WRONG? (OPTIONAL)" value={issue} onChangeText={setIssue} placeholder="e.g. The monitor flickers after 20 minutes of use" multiline containerStyle={{ marginBottom: spacing.md }} />
          <Button variant="secondary" icon="file-text" label="Create from saved facts (no AI)" onPress={() => { setDraft(claimTemplate(purchase, claimType, issue)); setSource('Template'); setStatus('ready'); setVaultState('idle'); }} fullWidth />
          {assistant.isConfigured ? (
            status === 'loading' ? (
              <View accessibilityLiveRegion="polite" style={styles.status}>
                <ActivityIndicator size="small" color={colors.brandDark} />
                <Text style={type.bodySmall}>Creating a draft using only the saved facts above…</Text>
              </View>
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                <Button label={`Generate ${claimType} claim draft with AI`} icon="file-text" onPress={generate} fullWidth />
              </View>
            )
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <Banner tone="info" icon="lock" title="AI generation is not connected" message="Use the saved-facts template above, or copy these fields into your own message. Templates do not require AI." />
              <Button label={copied ? 'Facts copied' : 'Copy saved facts'} icon={copied ? 'check' : 'copy'} variant="secondary" onPress={copyFacts} style={{ marginTop: spacing.md }} fullWidth />
            </View>
          )}
          {status === 'unavailable' ? <Banner tone="info" icon="lock" title="The secure AI service is temporarily unavailable" message="Try again shortly, or use the saved-facts template instead. Your purchase data has not changed." /> : null}
          {status === 'error' ? <Banner tone="danger" icon="alert-circle" title="ProofPilot could not create a draft right now" message="Your purchase data has not changed. Try again, or use the saved-facts template." /> : null}
        </View>
      )}
    </Card>
  );
}

const claimSteps = ['Verify facts', 'Add issue', 'Draft', 'Review & export'];

function ClaimStepper({ active }: { active: number }) {
  return (
    <View accessibilityLabel={`Step ${active + 1} of ${claimSteps.length}: ${claimSteps[active]}`} style={styles.stepper}>
      {claimSteps.map((label, index) => (
        <React.Fragment key={label}>
          <View style={[styles.step, index <= active && styles.stepActive]}>
            <Text style={[styles.stepText, index <= active && styles.stepTextActive]} numberOfLines={1}>{index + 1}. {label}</Text>
          </View>
          {index < claimSteps.length - 1 ? <Feather name="chevron-right" size={12} color={colors.subtle} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, marginTop: spacing.sm },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  icon: { height: 38, width: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandMuted },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: colors.surface, ...({ shadowColor: '#1C2A3A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } } as object) },
  tabActiveText: { ...type.label, color: colors.brandDark },
  eyebrow: { ...type.eyebrow, marginTop: spacing.lg, marginBottom: spacing.sm },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  fact: { flexGrow: 1, flexBasis: 170, padding: spacing.sm + 2, borderBottomWidth: 1, borderRightWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  factLabel: { ...type.caption, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 3 },
  missing: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSurface },
  status: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  draftBlock: { marginTop: spacing.lg, gap: spacing.sm },
  editor: { minHeight: 210, padding: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.ink, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md, flexWrap: 'wrap' },
  step: { paddingHorizontal: spacing.sm + 2, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  stepActive: { backgroundColor: colors.brandMuted, borderColor: colors.brand },
  stepText: { ...type.caption, fontSize: 10.5, fontWeight: '700' },
  stepTextActive: { color: colors.ink, fontWeight: '800' },
});
