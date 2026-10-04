import { accountDeletionEnabled } from '../lib/accountDeletion';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { findUnusedFiles, deleteUnusedFiles } from '../lib/fileMaintenance';
import * as FileSystem from 'expo-file-system';
import { createBackup, parseBackup, prepareRestoration, MAX_BACKUP_BYTES } from '../lib/backup';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from './Feather';
import { APP_VERSION, colors, radius, spacing, type } from '../design/tokens';
import { cloudAvailable } from '../lib/purchaseRepository';
import { protectionSummary } from '../lib/purchaseSelectors';
import { createAIService } from '../services/ai/AIService';
import type { AppSettings } from '../hooks/useAppSettings';
import type { SyncStatus } from '../hooks/usePurchaseStore';
import type { FeatherIconName, Purchase } from '../types/purchase';
import { Badge, Banner, Button, Card, Input, PasswordInput, Sheet } from './ui';

type SettingsProps = {
  items: Purchase[];
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  userEmail: string | null;
  configured: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  online: boolean;
  offlineShellReady?: boolean;
  onSignOut: () => void;
  onRestoreSamples: () => void;
  onDeleteAccount?: (password: string) => Promise<void>;
  onRestoreBackup?: (records: Purchase[]) => Promise<void>;
  onDeleteAll: () => void;
  onNotify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
};

export function SettingsScreen({ items, settings, updateSettings, userEmail, configured, syncStatus, syncError, online, offlineShellReady, onSignOut, onRestoreSamples, onRestoreBackup, onDeleteAccount, onDeleteAll, onNotify }: SettingsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [unusedFiles, setUnusedFiles] = useState<string[] | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [restore, setRestore] = useState<Purchase[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const restoreLock = useRef(false);
  const selectionLock = useRef(false);
  const exportLock = useRef(false);
  const active = useRef(true);
  const [choosingBackup, setChoosingBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [returnDays, setReturnDays] = useState(String(settings.defaultReturnWindowDays));
  const [saving, setSaving] = useState(false);
  const [returnDaysDirty, setReturnDaysDirty] = useState(false);
  const returnRevision = useRef(0);
  const returnSaveLock = useRef(false);
  useEffect(() => { if (!returnDaysDirty) setReturnDays(String(settings.defaultReturnWindowDays)); }, [settings.defaultReturnWindowDays, returnDaysDirty]);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const summary = protectionSummary(items);
  const ai = createAIService();
  // Honest five-state sync indicator: Local, Syncing, Synced, Error, Offline.
  const syncState: 'Local' | 'Syncing' | 'Synced' | 'Error' | 'Offline' =
    !configured ? 'Local' : !online ? 'Offline' : syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'synced' ? 'Synced' : syncStatus === 'error' ? 'Error' : 'Local';
  const syncTone = syncState === 'Error' ? 'danger' : syncState === 'Synced' ? 'success' : syncState === 'Offline' ? 'warning' : syncState === 'Syncing' ? 'info' : 'neutral';
  const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  const openPrivacy = async () => {
    try {
      const url = new URL(privacyUrl ?? '');
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid policy URL');
      await Linking.openURL(url.href);
    } catch { onNotify('The privacy policy could not be opened. Contact the operator privately.', 'danger'); }
  };
  const openPrivateSupport = async () => {
    try { if (!supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new Error(); await Linking.openURL(`mailto:${encodeURIComponent(supportEmail)}`); }
    catch { onNotify('Private support could not be opened. Do not post private data on public issues.', 'danger'); }
  };
  const openSupport = async () => {
    try { await Linking.openURL('https://github.com/lamansami7/proofpilot/issues'); }
    catch { onNotify('Could not open the support page. Visit github.com/lamansami7/proofpilot/issues', 'danger'); }
  };

  const saveReturnDays = async () => {
    if (returnSaveLock.current) return;
    const parsed = Number(returnDays);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) { onNotify('Return window must be between 1 and 365 days.'); return; }
    const owner = returnRevision.current;
    returnSaveLock.current = true; setSaving(true);
    try { await updateSettings({ defaultReturnWindowDays: parsed }); if (owner === returnRevision.current) setReturnDaysDirty(false); onNotify(`Suggested return window saved: ${parsed} days.`); }
    catch { onNotify('Settings could not be saved. Try again.'); }
    finally { returnSaveLock.current = false; setSaving(false); }
  };

  const selectBackup = async () => {
    if (selectionLock.current || restoreLock.current) return;
    selectionLock.current = true; setChoosingBackup(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', multiple: false, copyToCacheDirectory: true });
      if (!active.current || result.canceled) return;
      setRestore(null);
      const asset = result.assets[0];
      if (!asset.size || asset.size > MAX_BACKUP_BYTES) throw new Error('Choose a JSON backup up to 5 MB with a readable file size.');
      const raw = Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await FileSystem.readAsStringAsync(asset.uri);
      const records = parseBackup(raw);
      if (active.current) setRestore(records);
    } catch (e) { if (active.current) onNotify(e instanceof Error ? e.message : 'Could not read this backup. Nothing was restored.', 'danger'); }
    finally { selectionLock.current = false; if (active.current) setChoosingBackup(false); }
  };
  const confirmRestore = async () => {
    if (!restore || !onRestoreBackup || restoreLock.current || selectionLock.current) return;
    restoreLock.current = true;
    setRestoring(true);
    try {
      const prefix = `restored-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let index = 0;
      await onRestoreBackup(prepareRestoration(restore, () => `${prefix}-${index++}`));
      setRestore(null); onNotify('Backup records added. Original document files must be reattached.');
    } catch { onNotify('Restore did not finish. Previous saved records are unchanged.', 'danger'); }
    finally { restoreLock.current = false; setRestoring(false); }
  };

  const exportData = async () => {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true);
    let temporaryFile: string | null = null;
    try {
      const payload = JSON.stringify(createBackup(items), null, 2);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `proofpilot-export-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        onNotify('Download requested. Check your browser downloads for the JSON backup.');
      } else {
        if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) throw new Error('File sharing unavailable');
        const uri = `${FileSystem.cacheDirectory}proofpilot-export-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
        temporaryFile = uri;
        await FileSystem.writeAsStringAsync(uri, payload);
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save your ProofPilot backup', UTI: 'public.json' });
      }
    } catch { if (active.current) onNotify('Export failed — your data has not changed.'); }
    finally {
      if (temporaryFile) {
        try { await FileSystem.deleteAsync(temporaryFile, { idempotent: true }); }
        catch { if (active.current) onNotify('Temporary export cleanup failed. A backup copy may remain in this device’s app cache. Keep the device private.', 'danger'); }
      }
      exportLock.current = false;
      if (active.current) setExporting(false);
    }
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
          <Banner tone="info" icon="smartphone" title="You’re using ProofPilot on this device" message="Your records live in this browser or app. Export regularly and keep your original documents. Cloud accounts are not enabled in this build." />
        )}
      </Section>

      <Section icon="shield" title="Protection" detail="Defaults used when you add purchases">
        <Card style={styles.innerCard}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Suggested return window</Text>
            <Text style={type.bodySmall}>Offered as a quick-fill when protecting a purchase.</Text>
          </View>
          <View style={styles.returnRow}>
            <Input accessibilityLabel="Suggested return window in days" value={returnDays} onChangeText={value => { returnRevision.current++; setReturnDaysDirty(true); setReturnDays(value); }} keyboardType="number-pad" containerStyle={{ width: 78 }} />
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
          <Banner tone="info" icon="cloud-off" title="Cloud sync is off" message="Everything you add is saved on this device only. A JSON export backs up your purchase details, not your document files." />
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

      {accountDeletionEnabled && onDeleteAccount ? <Section icon="user-x" title="Delete account" detail="Permanent cloud and current-device deletion">
        <Card style={styles.innerCard}><Text style={type.bodySmall}>Deletes this account, cloud purchase records, cloud document files, and this device’s account cache. Export first. Other devices must reconnect and remove their local caches separately.</Text>
          <Button label="Delete my account" variant="danger" onPress={() => { setDeleteError(''); setDeleteOpen(true); }} />
        </Card>
        <Sheet visible={deleteOpen} onClose={() => { if (!deleting) { setDeleteOpen(false); setDeletePassword(''); setDeleteConfirmation(''); } }} title="Permanently delete your account?" eyebrow="IRREVERSIBLE ACTION">
          <Banner tone="danger" title="Keep a backup before continuing" message="You cannot undo this. Cloud writes pause once deletion starts. If cleanup fails, retry; signing out is not proof that deletion completed." />
          <PasswordInput label="CURRENT PASSWORD" value={deletePassword} onChangeText={setDeletePassword} autoComplete="password" />
          <Input label="TYPE DELETE TO CONFIRM" value={deleteConfirmation} onChangeText={setDeleteConfirmation} autoCapitalize="characters" />
          {deleteError ? <Text accessibilityRole="alert" style={type.bodySmall}>{deleteError}</Text> : null}
          <Button label="Permanently delete account" variant="danger" disabled={deleteConfirmation !== 'DELETE' || !deletePassword} loading={deleting} onPress={async () => {
            setDeleting(true); setDeleteError('');
            try { await onDeleteAccount(deletePassword); setDeleteOpen(false); }
            catch (error) { setDeleteError(error instanceof Error ? error.message : 'Deletion did not finish. Retry.'); }
            finally { setDeletePassword(''); setDeleting(false); }
          }} />
        </Sheet>
      </Section> : <Banner tone="warning" icon="info" title="Account deletion unavailable in this build" message="Delete all purchases is not account deletion. The operator must deploy and verify the account-deletion service before enabling account signup for public launch." />}

      <Section icon="database" title="Data" detail={`${summary.total} purchases · ${summary.total ? 'local-first' : 'nothing stored'}`}>
        <Card style={styles.innerCard}>
          <View style={styles.dataRow}>
            <View style={{ flex: 1, minWidth: 170 }}>
              <Text style={type.label}>Export my data</Text>
              <Text style={type.bodySmall}>Versioned JSON with records and claim text. No document files or device paths.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="download" label="Export" loading={exporting} onPress={exportData} disabled={items.length === 0} />
          </View>          {onRestoreBackup ? <View style={styles.dataRow}>
            <View style={{ flex: 1, minWidth: 170 }}><Text style={type.label}>Restore a JSON backup</Text><Text style={type.bodySmall}>Adds new copies to the current account; never replaces records. Files are not included. Repeated restores create copies.</Text></View>
            <Button label="Choose backup" variant="secondary" onPress={selectBackup} disabled={restoring || choosingBackup} />
          </View> : null}
          {restore ? <Banner tone="warning" icon="alert-circle" title={`Add ${restore.length} purchases?`} message="These records will belong to the current account and sync if signed in. Document files must be reattached.">
            <Button label="Cancel restore" variant="ghost" onPress={() => setRestore(null)} disabled={restoring} />
            <Button label="Confirm restore" onPress={confirmRestore} disabled={choosingBackup} loading={restoring} />
          </Banner> : null}
          {__DEV__ ? <View style={styles.dataRow}>
            <View style={{ flex: 1, minWidth: 170 }}>
              <Text style={type.label}>Restore sample data</Text>
              <Text style={type.bodySmall}>Add missing sample purchases without replacing your own records.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="refresh-cw" label="Restore" onPress={onRestoreSamples} />
          </View> : null}
          <View style={styles.dangerDataRow}>
            <View style={{ flex: 1, minWidth: 170 }}>
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

      <Section icon="hard-drive" title="Device storage" detail="Keep originals; manage only app-owned copies">
        {Platform.OS === 'web' ? <Text style={type.bodySmall}>{offlineShellReady ? 'Offline start is available in this browser. Cloud and AI still require a connection.' : 'Offline start is not available yet. Keep this tab open to work without a connection.'}</Text> : null}
        <Card style={styles.innerCard}>
          <Text style={type.bodySmall}>Find files no saved purchase uses in any account on this device. Only files older than 24 hours are eligible, so newly attached files stay safe.</Text>
          <Button label="Find unused files" variant="secondary" loading={maintenanceBusy} onPress={async () => {
            setMaintenanceBusy(true);
            try { setUnusedFiles(await findUnusedFiles()); }
            catch { onNotify('Storage inventory could not be read. No files were removed.', 'danger'); }
            finally { setMaintenanceBusy(false); }
          }} />
          {unusedFiles ? <><Text style={type.label}>{unusedFiles.length} unused files found</Text>
            <Button label="Delete unused copies" variant="danger" disabled={!unusedFiles.length || maintenanceBusy} onPress={async () => {
              setMaintenanceBusy(true);
              try { await deleteUnusedFiles(unusedFiles); setUnusedFiles(null); onNotify('Unused-file cleanup finished. Originals were not touched.'); }
              catch { onNotify('Cleanup did not finish. Find unused files again to retry.', 'danger'); }
              finally { setMaintenanceBusy(false); }
            }} />
            <Button label="Keep files" variant="ghost" onPress={() => setUnusedFiles(null)} disabled={maintenanceBusy} />
          </> : null}
        </Card>
      </Section>

      <Section icon="life-buoy" title="Support" detail="Get help with ProofPilot">
        {privacyUrl ? <Button label="Privacy policy" variant="secondary" icon="external-link" onPress={openPrivacy} /> : <Text style={type.bodySmall}>A public privacy policy has not been configured for this build.</Text>}
        {supportEmail ? <Button label="Contact private support" variant="secondary" icon="mail" onPress={openPrivateSupport} /> : <Text style={type.bodySmall}>Private account support is not configured. Do not send sensitive data through public issues.</Text>}
        <Card style={styles.innerCard}>
          <View style={styles.dataRow}>
            <View style={{ flex: 1, minWidth: 170 }}>
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
  dataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  dangerDataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  privacyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  versionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
});
