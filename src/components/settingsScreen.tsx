import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { createBackup, parseBackup, prepareRestoration, MAX_BACKUP_BYTES } from '../lib/backup';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { APP_VERSION, colors, radius, spacing, type } from '../design/tokens';
import { cloudAvailable } from '../lib/purchaseRepository';
import { protectionSummary } from '../lib/purchaseSelectors';
import { createAIService } from '../services/ai/AIService';
import type { AppSettings } from '../hooks/useAppSettings';
import type { SyncStatus } from '../hooks/usePurchaseStore';
import type { FeatherIconName, Purchase } from '../types/purchase';
import { Badge, Banner, Button, Card, Input } from './ui';

type SettingsProps = {
  items: Purchase[];
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  userEmail: string | null;
  configured: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  online: boolean;
  onSignOut: () => void;
  onRestoreSamples: () => void;
  onRestoreBackup?: (records: Purchase[]) => Promise<void>;
  onDeleteAll: () => void;
  onNotify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
};

export function SettingsScreen({ items, settings, updateSettings, userEmail, configured, syncStatus, syncError, online, onSignOut, onRestoreSamples, onRestoreBackup, onDeleteAll, onNotify }: SettingsProps) {
  const [restore, setRestore] = useState<Purchase[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [returnDays, setReturnDays] = useState(String(settings.defaultReturnWindowDays));
  const [saving, setSaving] = useState(false);
  useEffect(() => setReturnDays(String(settings.defaultReturnWindowDays)), [settings.defaultReturnWindowDays]);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const summary = protectionSummary(items);
  const ai = createAIService();
  // Honest five-state sync indicator: Local, Syncing, Synced, Error, Offline.
  const syncState: 'Local' | 'Syncing' | 'Synced' | 'Error' | 'Offline' =
    !configured ? 'Local' : !online ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Error' : 'Local';
  const syncTone = syncState === 'Error' ? 'danger' : syncState === 'Synced' ? 'success' : syncState === 'Offline' ? 'warning' : syncState === 'Syncing' ? 'info' : 'neutral';
  const openSupport = async () => {
    try { await Linking.openURL('https://github.com/lamansami7/proofpilot/issues'); }
    catch { onNotify('Could not open the support page. Visit github.com/lamansami7/proofpilot/issues', 'danger'); }
  };

  const saveReturnDays = async () => {
    const parsed = Number(returnDays);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) { onNotify('Return window must be between 1 and 365 days.'); return; }
    setSaving(true);
    try { await updateSettings({ defaultReturnWindowDays: parsed }); onNotify(`Suggested return window saved: ${parsed} days.`); }
    catch { onNotify('Settings could not be saved. Try again.'); }
    finally { setSaving(false); }
  };

  const selectBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.size || asset.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON backup up to 5 MB with a readable file size.');
      const raw = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await FileSystem.readAsStringAsync(asset.uri);
      setRestore(parseBackup(raw));
    } catch (e) { onNotify(e instanceof Error ? e.message : 'Could not read this backup. Nothing was restored.', 'danger'); }
  };
  const confirmRestore = async () => {
    if (!restore || !onRestoreBackup) return;
    setRestoring(true);
    try {
      const prefix = `restored-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let index = 0;
      await onRestoreBackup(prepareRestoration(restore, () => `${prefix}-${index++}`));
      setRestore(null); onNotify('Backup records added. Original document files must be reattached.');
    } catch { onNotify('Restore did not finish. Previous saved records are unchanged.', 'danger'); }
    finally { setRestoring(false); }
  };

  const exportData = async () => {
    const payload = JSON.stringify(createBackup(items), null, 2);
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `proofpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        onNotify('Your data export has been downloaded.');
      } else {
        await Share.share({ title: 'ProofPilot data export', message: payload });
      }
    } catch { onNotify('Export failed — your data has not changed.'); }
  };

  return (
    <>
      <View style={styles.title}>
        <Text style={type.eyebrow}>MAKE IT YOURS</Text>
        <Text style={type.display}>Settings</Text>
        <Text style={[type.body, styles.subtitle]}>Your account, protection preferences, and data — no mystery toggles.</Text>
      </View>

      <Section icon="user" title="Account" detail={configured ? 'Signed in with Supabase' : 'Local device mode'}>
        {configured && userEmail ? (
          <>
            <Card style={styles.innerCard}>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{userEmail}</Text>
                <Text style={type.bodySmall}>Your purchases stay tied to this account. Signing out switches back to on-device records; your account records reappear the next time you sign in.</Text>
              </View>
              {confirmSignOut ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button size="sm" variant="secondary" label="Stay signed in" onPress={() => setConfirmSignOut(false)} />
                  <Button size="sm" variant="danger" icon="log-out" label="Sign out" onPress={() => { setConfirmSignOut(false); onSignOut(); }} />
                </View>
              ) : (
                <Button size="sm" variant="secondary" icon="log-out" label="Sign out" onPress={() => setConfirmSignOut(true)} />
              )}
            </Card>
          </>
        ) : (
          <Banner tone="info" icon="smartphone" title="You’re using ProofPilot on this device" message="Cloud sync is not configured in this build, so your record lives in local storage. Add your Supabase credentials to enable account sign-in and sync." />
        )}
      </Section>

      <Section icon="shield" title="Protection" detail="Defaults used when you add purchases">
        <Card style={styles.innerCard}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Suggested return window</Text>
            <Text style={type.bodySmall}>Offered as a quick-fill when protecting a purchase.</Text>
          </View>
          <View style={styles.returnRow}>
            <Input accessibilityLabel="Suggested return window in days" value={returnDays} onChangeText={setReturnDays} keyboardType="number-pad" containerStyle={{ width: 78 }} />
            <Text style={type.bodySmall}>days</Text>
            <Button size="sm" variant="secondary" label="Save" loading={saving} onPress={saveReturnDays} />
          </View>
        </Card>
      </Section>

      <Section icon="cloud" title="Cloud sync" detail={cloudAvailable() ? 'Supabase configured (not a connectivity test)' : 'Not configured'}>
        <View style={styles.syncRow}>
          <Text style={type.label}>Current status</Text>
          <Badge label={syncState} tone={syncTone} icon={syncState === 'Synced' ? 'check-circle' : syncState === 'Error' ? 'alert-circle' : syncState === 'Offline' ? 'cloud-off' : syncState === 'Syncing' ? 'refresh-cw' : 'hard-drive'} />
        </View>
        {cloudAvailable() ? (
          <Banner tone={syncState === 'Error' ? 'warning' : syncState === 'Synced' ? 'success' : syncState === 'Offline' ? 'warning' : 'info'} icon={syncState === 'Error' ? 'alert-circle' : syncState === 'Synced' ? 'check-circle' : syncState === 'Offline' ? 'cloud-off' : 'refresh-cw'}
            title={syncState === 'Error' ? 'Cloud sync needs attention' : syncState === 'Offline' ? 'Offline — saved on this device' : syncState === 'Synced' ? 'Cloud check finished · no pending uploads' : syncState === 'Syncing' ? 'Cloud sync in progress' : 'Cloud sync waiting'}
            message={syncState === 'Offline' ? 'You appear to be offline. Changes stay safe on this device and sync automatically when you reconnect.' : syncError ?? 'Purchases are saved locally first, then synchronized to your private Supabase account.'} />
        ) : (
          <Banner tone="info" icon="cloud-off" title="Cloud sync is off" message="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then run the migration in /supabase. Until then, everything you add is saved on this device only." />
        )}
        <Text style={[type.caption, { marginTop: spacing.sm }]}>Document files are always stored on this device in this build — they are never uploaded.</Text>
      </Section>

      <Section icon="bell" title="Notifications" detail="Not connected in this build">
        <Banner tone="info" icon="bell-off" title="No reminders are being sent" message="Deadline reminders need a notification service, which is not wired up yet. Deadline Radar keeps every date visible instead — nothing is quietly scheduled behind the scenes." />
      </Section>

      <Section icon="lock" title="Privacy & security" detail="How your data is handled">
        <Card style={styles.innerCard}>
          <PrivacyRow text="Local purchase records are not encrypted by ProofPilot. Protect access to your device and browser profile." />
          <PrivacyRow text="Cloud account isolation requires all documented database migrations and verified row-level security policies." />
          <PrivacyRow text={`AI features ${ai.isConfigured ? 'send purchase context to your configured secure endpoint. Provider keys never ship inside the app.' : 'are not connected; no data is sent to an AI provider. Cloud sync, if configured, is separate.'}`} />
          <PrivacyRow text="No advertising SDK or payment flow is implemented in this build. Cloud and optional AI services process the data you send." />
        </Card>
      </Section>

      <Banner tone="warning" icon="info" title="Account deletion unavailable in this build" message="Delete all purchases is not account deletion. A verified account-deletion service and private support channel are required before public launch." />

      <Section icon="database" title="Data" detail={`${summary.total} purchases · ${summary.total ? 'local-first' : 'nothing stored'}`}>
        <Card style={styles.innerCard}>
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Export my data</Text>
              <Text style={type.bodySmall}>Versioned JSON with records and claim text. No document files or device paths.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="download" label="Export" onPress={exportData} disabled={items.length === 0} />
          </View>
          {onRestoreBackup ? <View style={styles.dataRow}>
            <View style={{ flex: 1 }}><Text style={type.label}>Restore a JSON backup</Text><Text style={type.bodySmall}>Adds new copies to the current account; never replaces records. Files are not included. Repeated restores create copies.</Text></View>
            <Button label="Choose backup" variant="secondary" onPress={selectBackup} disabled={restoring} />
          </View> : null}
          {restore ? <Banner tone="warning" icon="alert-circle" title={`Add ${restore.length} purchases?`} message="These records will belong to the current account and sync if signed in. Document files must be reattached.">
            <Button label="Cancel restore" variant="ghost" onPress={() => setRestore(null)} disabled={restoring} />
            <Button label="Confirm restore" onPress={confirmRestore} loading={restoring} />
          </Banner> : null}
          {__DEV__ ? <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Restore sample data</Text>
              <Text style={type.bodySmall}>Add missing sample purchases without replacing your own records.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="refresh-cw" label="Restore" onPress={onRestoreSamples} />
          </View> : null}
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Delete all purchases</Text>
              <Text style={type.bodySmall}>Removes these records locally and queues cloud deletion when signed in. Does not delete your account or all stored file bytes.</Text>
            </View>
            {confirmWipe ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button size="sm" variant="secondary" label="Keep" onPress={() => setConfirmWipe(false)} />
                <Button size="sm" variant="danger" icon="trash-2" label="Delete all" onPress={() => { setConfirmWipe(false); onDeleteAll(); }} />
              </View>
            ) : (
              <Button size="sm" variant="danger" icon="trash-2" label="Delete all" onPress={() => setConfirmWipe(true)} disabled={items.length === 0} />
            )}
          </View>
        </Card>
      </Section>

      <Section icon="life-buoy" title="Support" detail="Get help with ProofPilot">
        <Card style={styles.innerCard}>
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Report a problem or request a feature</Text>
              <Text style={type.bodySmall}>Opens the ProofPilot GitHub issues page in your browser. Include what you expected and what happened.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="external-link" label="Open support" onPress={() => { void openSupport(); }} />
          </View>
          <PrivacyRow text="GitHub issues are public. Never attach purchase exports, receipts, serial numbers, passwords, or other private data." />
        </Card>
      </Section>

      <Section icon="help-circle" title="Help" detail="How ProofPilot decides what is protected">
        <Card style={styles.innerCard}>
          <PrivacyRow text="Protected — the purchase has a return or warranty date and a receipt attached." />
          <PrivacyRow text="Needs attention — coverage dates exist, but no receipt is attached yet." />
          <PrivacyRow text="Protection incomplete — no return or warranty dates have been saved." />
          <PrivacyRow text="Deadlines are calculated from the dates you save. ProofPilot never invents dates, prices, or policies." />
        </Card>
        <View style={styles.versionRow}>
          <Badge label={`ProofPilot ${APP_VERSION}`} tone="neutral" />
          <Badge label={ai.isConfigured ? 'AI service: configured' : 'AI service: not configured'} tone={ai.isConfigured ? 'success' : 'neutral'} />
          <Badge label={cloudAvailable() ? 'Supabase: configured' : 'Supabase: not configured'} tone={cloudAvailable() ? 'success' : 'neutral'} />
        </View>
      </Section>
    </>
  );
}

function Section({ icon, title, detail, children }: { icon: FeatherIconName; title: string; detail: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}><Feather name={icon} size={17} color={colors.brandDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>{title}</Text>
          <Text style={type.bodySmall}>{detail}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function PrivacyRow({ text }: { text: string }) {
  return (
    <View style={styles.privacyRow}>
      <Feather name="check" size={14} color={colors.success} style={{ marginTop: 2 }} />
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm, maxWidth: 620 },
  section: { marginBottom: spacing.xxl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  sectionIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.brandMuted, alignItems: 'center', justifyContent: 'center' },
  innerCard: { padding: spacing.lg, gap: spacing.md },
  returnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md, flexWrap: 'wrap' },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  privacyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  versionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
});
