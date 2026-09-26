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
  onDeleteAll: () => void;
  onNotify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
};

export function SettingsScreen({ items, settings, updateSettings, userEmail, configured, syncStatus, syncError, online, onSignOut, onRestoreSamples, onDeleteAll, onNotify }: SettingsProps) {
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

  const exportData = async () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'ProofPilot', purchases: items }, null, 2);
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

      <Section icon="cloud" title="Cloud sync" detail={cloudAvailable() ? 'Supabase connection detected' : 'Not configured'}>
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
          <PrivacyRow text="Purchase records are stored locally on this device and are private to you." />
          <PrivacyRow text="If cloud sync is configured, the Supabase schema enforces row-level security — only your account can read your rows." />
          <PrivacyRow text={`AI features ${ai.isConfigured ? 'send purchase context to your configured secure endpoint. Provider keys never ship inside the app.' : 'are not connected, so no purchase data leaves this app.'}`} />
          <PrivacyRow text="Nothing is sold, shared, or used for advertising. There are no payment or billing features in this build." />
        </Card>
      </Section>

      <Section icon="database" title="Data" detail={`${summary.total} purchases · ${summary.total ? 'local-first' : 'nothing stored'}`}>
        <Card style={styles.innerCard}>
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Export my data</Text>
              <Text style={type.bodySmall}>Download every purchase as a JSON file.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="download" label="Export" onPress={exportData} disabled={items.length === 0} />
          </View>
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Restore sample data</Text>
              <Text style={type.bodySmall}>Add missing sample purchases without replacing your own records.</Text>
            </View>
            <Button size="sm" variant="secondary" icon="refresh-cw" label="Restore" onPress={onRestoreSamples} />
          </View>
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Delete all purchases</Text>
              <Text style={type.bodySmall}>Permanently clears your record from this device.</Text>
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
          <PrivacyRow text="When you export your data (above), you can attach the JSON to a bug report — it contains only your own purchase records." />
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
          <Badge label={ai.isConfigured ? 'AI service: connected' : 'AI service: not configured'} tone={ai.isConfigured ? 'success' : 'neutral'} />
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
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  privacyRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  versionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
});
