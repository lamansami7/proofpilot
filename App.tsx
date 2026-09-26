import { registerOfflineShell } from './src/lib/offlineShell';
import { deleteCurrentAccount, resumeConfirmedPurges } from './src/lib/accountDeletion';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from './src/components/Feather';
import { StatusBar } from 'expo-status-bar';
import { AuthScreen, PasswordRecovery } from './src/components/authScreen';
import { Dashboard } from './src/components/dashboard';
import { DeadlineRadar } from './src/components/deadlineRadar';
import { PurchaseDetails } from './src/components/purchaseDetails';
import { PurchaseFlow } from './src/components/purchaseFlow';
import { PurchasesScreen } from './src/components/purchasesScreen';
import { SettingsScreen } from './src/components/settingsScreen';
import { VaultScreen } from './src/components/vaultScreen';
import { Onboarding } from './src/components/onboarding';
import { Banner, Button, IconButton, Input, LoadingState, interactive } from './src/components/ui';
import { demoPurchases } from './src/data/demoPurchases';
import { colors, radius, shadows, sizing, spacing, type } from './src/design/tokens';
import { useAppSettings } from './src/hooks/useAppSettings';
import { useBreakpoint } from './src/hooks/useBreakpoint';
import { usePurchaseStore } from './src/hooks/usePurchaseStore';
import { useSession } from './src/hooks/useSession';
import {
  deriveProtection,
  documentInventory,
  initialsFor,
  matchesPurchaseSearch,
  normalizedDeadlines,
  urgentDeadlines,
} from './src/lib/purchaseSelectors';
import { createAIService } from './src/services/ai/AIService';
import type { FeatherIconName, Purchase } from './src/types/purchase';

type Tab = 'Home' | 'Purchases' | 'Deadlines' | 'Vault' | 'Settings';
type NavItem = { label: Tab; icon: FeatherIconName; badge?: number; muted?: boolean };
type Toast = { message: string; tone: 'success' | 'danger' | 'info' };

export default function App() {
  const [offlineShellReady, setOfflineShellReady] = useState(false);
  useEffect(() => { void registerOfflineShell().then(setOfflineShellReady); }, []);
  const [purgeChecked, setPurgeChecked] = useState(false);
  const [purgeError, setPurgeError] = useState(false);
  const finishCleanup = () => resumeConfirmedPurges().then(result => { setPurgeError(result.unconfirmed > 0); }).catch(() => setPurgeError(true)).finally(() => setPurgeChecked(true));
  useEffect(() => { void finishCleanup(); }, []);
  const scrollRef = useRef<ScrollView>(null);
  const viewport = useBreakpoint();
  const session = useSession();
  const store = usePurchaseStore(session.user?.id, purgeChecked && !purgeError);
  const { settings, update: persistSettings, hydrated: settingsReady, error: settingsError } = useAppSettings();
  const updateSettings = async (patch: Parameters<typeof persistSettings>[0]) => {
    await persistSettings(patch);
  };
  const dismissSample = () =>
    updateSettings({ sampleBannerDismissed: true }).catch(() => notify('Settings could not be saved.', 'danger'));
  const completeOnboarding = () =>
    updateSettings({ onboardingCompleted: true }).catch(() => notify('Settings could not be saved.', 'danger'));

  // Re-derive date-sensitive state at least once a minute.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClockTick((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const [tab, setTab] = useState<Tab>('Home');
  const [selectedId, setSelectedId] = useState<Purchase['id'] | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string, tone: Toast['tone'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (store.storageError) notify('Device storage is unavailable — changes may not persist between sessions.', 'danger');
  }, [store.storageError]);

  const items = useMemo(
    () => store.items.map((item) => ({ ...item, protectionStatus: deriveProtection(item) })),
    [store.items, clockTick],
  );
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const deadlines = useMemo(() => normalizedDeadlines(items), [items]);
  const urgentCount = useMemo(() => urgentDeadlines(items).length, [items]);
  const documentCount = useMemo(() => documentInventory(items).all.length, [items]);
  const merchants = useMemo(() => Array.from(new Set(items.map((item) => item.merchant))).sort(), [items]);
  const aiConfigured = useMemo(() => createAIService().isConfigured, []);
  const userEmail = session.user?.email ?? null;

  // Discard account-scoped UI state when identity changes, including open drafts.
  useEffect(() => {
    setSelectedId(null); setEditing(null); setFlowOpen(false); setQuery(''); setTab('Home'); setToast(null);
  }, [session.user?.id]);

  const sampleVisible =
    items.some((item) => demoPurchases.some((demo) => demo.id === item.id)) && !settings.sampleBannerDismissed;

  const filtered = useMemo(() => items.filter((item) => matchesPurchaseSearch(item, query)), [items, query]);

  const openPurchase = (purchase: Purchase) => setSelectedId(purchase.id);
  const openAddFlow = () => {
    setEditing(null);
    setFlowOpen(true);
  };
  const openEditFlow = (purchase: Purchase) => {
    setSelectedId(null);
    setEditing(purchase);
    setFlowOpen(true);
  };
  const savePurchase = async (purchase: Purchase) => {
    await store.upsert(purchase);
    notify(editing ? 'Purchase record updated.' : `${purchase.name} was saved.`);
  };
  const updatePurchase = (purchase: Purchase) => store.upsert(purchase);
  const deletePurchase = async (purchase: Purchase) => {
    try {
      await store.remove(purchase.id);
      setSelectedId(null);
      notify(`${purchase.name} was deleted.`, 'info');
    } catch {
      notify('The purchase could not be deleted.', 'danger');
    }
  };

  const onSearch = (value: string) => {
    setQuery(value);
    if (value && tab !== 'Purchases') setTab('Purchases');
  };
  const restoreSamples = async () => {
    try {
      await store.restoreSamples();
      await updateSettings({ sampleBannerDismissed: false, onboardingCompleted: true });
      notify('Sample records added. Existing purchases were kept.');
    } catch {
      notify('Samples could not be saved.', 'danger');
    }
  };
  const clearRecords = async (samplesOnly = false) => {
    try {
      await store.replaceAll(samplesOnly ? items.filter((item) => !demoPurchases.some((d) => d.id === item.id)) : []);
      notify(
        samplesOnly ? 'Sample records cleared.' : 'Records deleted on this device. Cloud changes are queued when signed in.',
        'info',
      );
    } catch {
      notify('Could not delete records. Your saved data is unchanged.', 'danger');
    }
  };

  const showOnboarding = store.hydrated && settingsReady && items.length === 0 && !settings.onboardingCompleted;
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab, showOnboarding]);

  if (!purgeChecked) return <SafeAreaView style={styles.app}><LoadingState label="Checking device cleanup…" /></SafeAreaView>;

  if (purgeError) return (
    <SafeAreaView style={styles.app}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.lg }}>
          <Text accessibilityRole="header" style={type.title}>ProofPilot</Text>
          <Banner tone="danger" icon="alert-circle" title="Device cleanup needs attention" message="Cloud deletion may have completed, but device cleanup is not confirmed. Keep this device private and retry. Contact private support to verify the account status before clearing site/app data. Clearing also removes other accounts’ local records and files; keep independent originals." />
          <Button label="Retry device cleanup" onPress={() => { void finishCleanup(); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (session.configured && session.loading) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <View style={styles.boot}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Feather name="shield" size={20} color={colors.ink} />
            </View>
            <Text style={styles.brandName}>ProofPilot</Text>
          </View>
          <LoadingState label="Checking your session…" />
        </View>
      </SafeAreaView>
    );
  }

  if (session.error) return <SafeAreaView style={styles.app}><Banner tone="danger" icon="alert-circle" title="Session unavailable" message={session.error} /><Button label="Retry session" onPress={session.retry} /></SafeAreaView>;
  if (session.recovery) return <SafeAreaView style={styles.app}><PasswordRecovery onSave={session.updatePassword} /></SafeAreaView>;

  if (session.configured && !session.user) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <AuthScreen
          onResetPassword={session.resetPassword}
          onSubmit={async (email, password, signUp) => {
            const { data, error } = signUp
              ? await session.signUp(email, password)
              : await session.signIn(email, password);
            if (error) throw error;
            if (signUp && !data.session)
              return { info: 'We sent a confirmation link to your email. Confirm it, then sign in here.' };
          }}
        />
      </SafeAreaView>
    );
  }

  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    { label: 'OVERVIEW', items: [{ label: 'Home', icon: 'home' }] },
    {
      label: 'PROTECTION',
      items: [
        { label: 'Purchases', icon: 'shopping-bag', badge: items.length },
        { label: 'Deadlines', icon: 'calendar', badge: urgentCount, muted: urgentCount === 0 },
        { label: 'Vault', icon: 'archive', badge: documentCount, muted: documentCount === 0 },
      ],
    },
    { label: 'ACCOUNT', items: [{ label: 'Settings', icon: 'settings' }] },
  ];

  const breadcrumb = `Home › ${tab}${selected ? ` › ${selected.name}` : ''}${query ? ` · “${query}”` : ''}`;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.frame}>
        {!viewport.isPhone ? (
          <Sidebar
            groups={navGroups}
            active={tab}
            onSelect={setTab}
            userEmail={userEmail}
            configured={session.configured}
            onSignOut={() => session.signOut().catch(() => notify('Could not sign out. Try again.', 'danger'))}
            itemCount={items.length}
          />
        ) : null}
        <View style={styles.main}>
          <Topbar
            query={query}
            onSearch={onSearch}
            urgentCount={urgentCount}
            userEmail={userEmail}
            compact={viewport.isPhone}
            onDeadlines={() => setTab('Deadlines')}
            onAccount={() => setTab('Settings')}
          />
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.content, viewport.isPhone && styles.contentPhone]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!store.hydrated || !settingsReady ? (
              <LoadingState label="Loading your protection record…" />
            ) : showOnboarding ? (
              <View style={{ paddingTop: spacing.xl }}>
                <Text style={[type.eyebrow, { textAlign: 'center' }]}>WELCOME TO PROOFPILOT</Text>
                <Text style={[type.display, { textAlign: 'center', marginTop: spacing.sm }]}>Let’s protect something you own.</Text>
                <Text style={[type.body, { textAlign: 'center', maxWidth: 560, alignSelf: 'center', marginTop: spacing.sm }]}>
                  A few quick steps — then your receipts, return windows, and warranties will live in one calm, searchable place.
                </Text>
                <View style={{ marginTop: spacing.xxl }}>
                  <Onboarding
                    onAddPurchase={() => {
                      void completeOnboarding();
                      openAddFlow();
                    }}
                    onLoadSamples={() => {
                      void restoreSamples();
                    }}
                    onDismiss={() => {
                      void completeOnboarding();
                    }}
                  />
                </View>
              </View>
            ) : (
              <>
                {store.storageError || settingsError ? (
                  <View style={{ marginBottom: spacing.lg }}>
                    <Banner
                      tone="danger"
                      icon="alert-circle"
                      title="Device storage needs attention"
                      message={store.storageError ?? settingsError!}
                    />
                  </View>
                ) : null}

                {store.cleanupError ? <Banner tone="warning" icon="alert-circle" title="File cleanup pending" message={store.cleanupError}><Button label="Retry file cleanup" onPress={() => void store.retryCleanup()} variant="secondary" /></Banner> : null}
                {/* Breadcrumb & sync status */}
                <View style={styles.statusStrip}>
                  <Text accessibilityLabel={`Location: ${breadcrumb}`} numberOfLines={1} ellipsizeMode="tail" style={[type.caption, { flex: 1 }]}>
                    {breadcrumb}
                  </Text>
                  <View style={styles.syncPill}>
                    <Feather
                      name={
                        store.syncStatus === 'error' || (session.user && !store.online)
                          ? 'cloud-off'
                          : session.user
                            ? 'cloud'
                            : 'hard-drive'
                      }
                      size={13}
                      color={store.syncStatus === 'error' ? colors.danger : colors.muted}
                    />
                    <Text style={[type.caption, store.syncStatus === 'error' && { color: colors.danger }]}>
                      {store.saving
                        ? 'Saving…'
                        : session.user && !store.online
                          ? 'Offline · saved locally'
                          : !session.user
                            ? store.syncStatus === 'syncing'
                              ? 'Syncing…'
                              : 'Local storage'
                            : store.syncStatus === 'syncing'
                              ? 'Syncing…'
                              : store.syncStatus === 'error'
                                ? 'Sync needs attention'
                                : store.syncStatus === 'synced'
                                  ? 'Synced'
                                  : 'Local storage'}
                    </Text>
                    {store.syncStatus === 'error' && store.online ? (
                      <Button size="sm" variant="danger" label="Retry" onPress={() => void store.retrySync()} />
                    ) : null}
                  </View>
                </View>

                {tab === 'Home' ? (
                  <Dashboard
                    items={items}
                    isPhone={viewport.isPhone}
                    userEmail={userEmail}
                    sampleVisible={sampleVisible}
                    aiConfigured={aiConfigured}
                    onAdd={openAddFlow}
                    onOpen={openPurchase}
                    onPurchases={() => setTab('Purchases')}
                    onDeadlines={() => setTab('Deadlines')}
                    onVault={() => setTab('Vault')}
                    onDismissSample={dismissSample}
                    onClearSamples={() => void clearRecords(true)}
                    onRestoreSamples={restoreSamples}
                  />
                ) : null}
                {tab === 'Purchases' ? (
                  <PurchasesScreen items={filtered} total={items.length} query={query} onAdd={openAddFlow} onOpen={openPurchase} />
                ) : null}
                {tab === 'Deadlines' ? (
                  <DeadlineRadar onUpdate={updatePurchase} deadlines={deadlines} onOpenPurchase={openPurchase} onAdd={openAddFlow} />
                ) : null}
                {tab === 'Vault' ? (
                  <VaultScreen
                    items={items}
                    onAdd={openAddFlow}
                    onOpenPurchase={openPurchase}
                    onUpdatePurchase={updatePurchase}
                  />
                ) : null}
                {tab === 'Settings' ? (
                  <SettingsScreen
                    items={items}
                    settings={settings}
                    updateSettings={updateSettings}
                    userEmail={userEmail}
                    configured={session.configured}
                    syncStatus={store.syncStatus}
                    syncError={store.syncError}
                    online={store.online}
                    offlineShellReady={offlineShellReady}
                    onSignOut={() => session.signOut().catch(() => notify('Could not sign out. Try again.', 'danger'))}
                    onRestoreSamples={restoreSamples}
                    onDeleteAccount={async password => {
                      await store.suspend();
                      try { const result = await deleteCurrentAccount(password); if (result.localCleanupPending) setPurgeError(true); }
                      finally { await finishCleanup(); store.reload(); }
                    }}
                    onRestoreBackup={store.restoreBackup}
                    onDeleteAll={() => void clearRecords()}
                    onNotify={notify}
                  />
                ) : null}
              </>
            )}
          </ScrollView>
          {viewport.isPhone ? <BottomNav active={tab} onSelect={setTab} urgentCount={urgentCount} /> : null}
        </View>
      </View>

      {viewport.isPhone && !showOnboarding && items.length > 0 && tab !== 'Settings' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Protect a purchase"
          accessibilityHint="Opens the form to add a new purchase with receipts and deadlines"
          onPress={openAddFlow}
          style={interactive(styles.fab, {
            hover: { backgroundColor: colors.brandStrong },
            pressed: { opacity: 0.88 },
          })}
        >
          <Feather name="plus" size={24} color={colors.ink} />
        </Pressable>
      ) : null}

      <PurchaseFlow
        visible={flowOpen}
        initialPurchase={editing}
        merchants={merchants}
        defaultReturnDays={settings.defaultReturnWindowDays}
        onClose={() => {
          setFlowOpen(false);
          setEditing(null);
        }}
        onSave={savePurchase}
        onDone={(purchase) => {
          setFlowOpen(false);
          setEditing(null);
          setSelectedId(purchase.id);
        }}
      />
      <PurchaseDetails
        key={selected?.id ?? 'none'}
        purchase={selected}
        onClose={() => setSelectedId(null)}
        onEdit={openEditFlow}
        onDelete={deletePurchase}
        onUpdate={updatePurchase}
        onNotify={notify}
      />

      {toast ? (
        <View accessibilityLiveRegion="polite" style={[styles.toast, viewport.isPhone && styles.toastPhone]}>
          <Feather
            name={toast.tone === 'danger' ? 'alert-circle' : toast.tone === 'info' ? 'info' : 'check-circle'}
            color={toast.tone === 'danger' ? '#F2B8BD' : toast.tone === 'info' ? '#B9CFEA' : colors.brand}
            size={17}
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Sidebar({
  groups,
  active,
  onSelect,
  userEmail,
  configured,
  onSignOut,
  itemCount,
}: {
  groups: Array<{ label: string; items: NavItem[] }>;
  active: Tab;
  onSelect: (tab: Tab) => void;
  userEmail: string | null;
  configured: boolean;
  onSignOut: () => void;
  itemCount: number;
}) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Feather name="shield" size={20} color={colors.ink} />
        </View>
        <View>
          <Text style={styles.brandName}>ProofPilot</Text>
          <Text style={styles.brandTag}>PURCHASE PROTECTION</Text>
        </View>
      </View>
      <View accessibilityRole="tablist" accessibilityLabel="Main navigation" style={styles.nav}>
        {groups.map((group) => (
          <View key={group.label} style={styles.navGroup}>
            <Text style={styles.navGroupLabel}>{group.label}</Text>
            {group.items.map((item) => {
              const selectedTab = active === item.label;
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selectedTab }}
            tabIndex={selectedTab ? 0 : -1}
            {...(Platform.OS === 'web' ? { onKeyDown: (event: React.KeyboardEvent) => {
              const labels: Tab[] = ['Home','Purchases','Deadlines','Vault','Settings'];
              const index = labels.indexOf(item.label);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? labels.length - 1 : ['ArrowRight','ArrowDown'].includes(event.key) ? (index + 1) % labels.length : ['ArrowLeft','ArrowUp'].includes(event.key) ? (index + labels.length - 1) % labels.length : -1;
              if (next >= 0) { event.preventDefault(); onSelect(labels[next]); (event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus(); }
            } } : {})}
                  aria-selected={selectedTab}
                  onPress={() => onSelect(item.label)}
                  style={interactive([styles.navItem, selectedTab ? styles.navActive : null], {
                    hover: { backgroundColor: selectedTab ? colors.brandMuted : 'rgba(21,34,54,0.045)' },
                  })}
                >
                  {selectedTab ? <View style={styles.navIndicator} /> : null}
                  <Feather name={item.icon} size={18} color={selectedTab ? colors.brandDark : colors.muted} />
                  <Text style={[styles.navText, selectedTab && styles.navTextActive]}>{item.label}</Text>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <View
                      style={[
                        styles.navBadge,
                        item.label === 'Deadlines' ? { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder } : null,
                      ]}
                    >
                      <Text
                        style={[styles.navBadgeText, item.label === 'Deadlines' ? { color: colors.warning } : null]}
                      >
                        {item.badge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.sidebarBottom}>
        <View style={styles.syncCard}>
          <View style={styles.syncIcon}>
            <Feather name={configured ? 'cloud' : 'hard-drive'} size={16} color={colors.brandDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{configured ? 'Account connected' : 'Local mode'}</Text>
            <Text style={type.caption}>
              {configured
                ? 'Your records sync securely'
                : `${itemCount} purchase${itemCount === 1 ? '' : 's'} stored locally`}
            </Text>
          </View>
        </View>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Feather name={userEmail ? 'user' : 'smartphone'} size={15} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={type.label}>
              {userEmail ?? 'This device'}
            </Text>
            <Text style={type.caption}>{userEmail ? 'Signed in' : 'No cloud account'}</Text>
          </View>
          {userEmail ? <IconButton icon="log-out" label="Sign out" size={34} tone="ghost" onPress={onSignOut} /> : null}
        </View>
      </View>
    </View>
  );
}

function Topbar({
  query,
  onSearch,
  urgentCount,
  userEmail,
  compact,
  onDeadlines,
  onAccount,
}: {
  query: string;
  onSearch: (value: string) => void;
  urgentCount: number;
  userEmail: string | null;
  compact: boolean;
  onDeadlines: () => void;
  onAccount: () => void;
}) {
  return (
    <View style={[styles.topbar, compact && styles.topbarCompact]}>
      {compact ? (
        <View style={styles.mobileBrand}>
          <View style={styles.logoSmall}>
            <Feather name="shield" size={15} color={colors.ink} />
          </View>
          <Text style={styles.brandName}>ProofPilot</Text>
        </View>
      ) : null}
      <View style={[styles.search, compact && styles.searchCompact]}>
        <Feather name="search" size={17} color={colors.muted} />
        <Input
          accessibilityLabel="Search your purchases"
          accessibilityHint="Filters the Purchases list as you type and switches to Purchases when needed"
          returnKeyType="search"
          value={query}
          onChangeText={onSearch}
          placeholder={compact ? 'Search purchases' : 'Search purchases, merchants, serial numbers…'}
          containerStyle={{ flex: 1 }}
          style={styles.searchInput}
        />
        {query ? <IconButton icon="x" label="Clear search" size={30} tone="ghost" onPress={() => onSearch('')} /> : null}
      </View>
      <View>
        <IconButton
          icon="bell"
          label={urgentCount ? `View deadlines: ${urgentCount} urgent` : 'View deadlines'}
          onPress={onDeadlines}
        />
        {urgentCount > 0 ? (
          <View accessibilityLabel={`${urgentCount} urgent deadlines`} style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{urgentCount > 99 ? '99+' : String(urgentCount)}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account and settings"
        onPress={onAccount}
        style={interactive(styles.topAvatar)}
      >
        {userEmail ? <Text style={styles.avatarText}>{initialsFor(userEmail)}</Text> : <Feather name="smartphone" size={15} color={colors.ink} />}
      </Pressable>
    </View>
  );
}

function BottomNav({ active, onSelect, urgentCount }: { active: Tab; onSelect: (tab: Tab) => void; urgentCount: number }) {
  const items: NavItem[] = [
    { label: 'Home', icon: 'home' },
    { label: 'Purchases', icon: 'shopping-bag' },
    { label: 'Deadlines', icon: 'calendar', badge: urgentCount },
    { label: 'Vault', icon: 'archive' },
    { label: 'Settings', icon: 'settings' },
  ];
  return (
    <View accessibilityRole="tablist" accessibilityLabel="Main navigation" style={styles.bottomNav}>
      {items.map((item) => {
        const selectedTab = active === item.label;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedTab }}
            tabIndex={selectedTab ? 0 : -1}
            {...(Platform.OS === 'web' ? { onKeyDown: (event: React.KeyboardEvent) => {
              const labels: Tab[] = ['Home','Purchases','Deadlines','Vault','Settings'];
              const index = labels.indexOf(item.label);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? labels.length - 1 : ['ArrowRight','ArrowDown'].includes(event.key) ? (index + 1) % labels.length : ['ArrowLeft','ArrowUp'].includes(event.key) ? (index + labels.length - 1) % labels.length : -1;
              if (next >= 0) { event.preventDefault(); onSelect(labels[next]); (event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus(); }
            } } : {})}
            aria-selected={selectedTab}
            onPress={() => onSelect(item.label)}
            style={interactive(styles.bottomItem, { hover: { backgroundColor: 'transparent' } })}
          >
            <View style={[styles.bottomIconWrap, selectedTab && styles.bottomIconWrapActive]}>
              <Feather name={item.icon} size={19} color={selectedTab ? colors.brandDark : colors.muted} />
              {item.badge ? (
                <View accessibilityLabel={`${item.badge} urgent`} style={styles.bottomBadge}>
                  <Text style={styles.bottomBadgeText}>{item.badge > 99 ? '99+' : String(item.badge)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.bottomText, selectedTab && styles.bottomTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  statusStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    minHeight: 24,
    flexWrap: 'wrap',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  app: { flex: 1, backgroundColor: colors.canvas },
  boot: { flex: 1, justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  frame: { flex: 1, flexDirection: 'row', width: '100%', alignSelf: 'center' },
  main: { flex: 1, minWidth: 0 },
  sidebar: {
    width: sizing.sidebar,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    ...shadows.card,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  logoSmall: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  brandName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  brandTag: { fontSize: 8, fontWeight: '800', letterSpacing: 1.05, color: colors.subtle, marginTop: 2 },
  nav: { marginTop: spacing.xl, flex: 1 },
  navGroup: { marginBottom: spacing.lg },
  navGroupLabel: { ...type.eyebrow, fontSize: 9.5, paddingHorizontal: spacing.md, marginBottom: 6 },
  navItem: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    position: 'relative',
    marginBottom: 2,
  },
  navActive: { backgroundColor: colors.brandMuted },
  navIndicator: {
    position: 'absolute',
    left: -spacing.lg,
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: colors.brandDark,
  },
  navText: { ...type.body, flex: 1, color: colors.inkSecondary },
  navTextActive: { color: colors.ink, fontWeight: '800' },
  navBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.inkSecondary },
  sidebarBottom: { gap: spacing.md },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E7DD',
  },
  avatarText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  topbar: {
    minHeight: sizing.header,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  topbarCompact: {
    paddingHorizontal: spacing.lg,
    flexWrap: 'wrap',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  mobileBrand: { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: {
    minHeight: sizing.touchCompact + 4,
    maxWidth: 560,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
  },
  searchCompact: { minWidth: 120 },
  searchInput: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    height: '100%',
    minHeight: 0,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { fontSize: 10, fontWeight: '800', color: colors.surface },
  topAvatar: {
    minWidth: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E7DD',
    paddingHorizontal: 6,
  },
  content: { width: '100%', maxWidth: sizing.contentMax, alignSelf: 'center', padding: spacing.xl, paddingBottom: 72 },
  contentPhone: { padding: spacing.lg, paddingBottom: 108 },
  bottomNav: {
    height: sizing.bottomNav,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
    paddingBottom: Platform.OS === 'ios' ? spacing.sm : 0,
  },
  bottomItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomIconWrap: {
    width: 46,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomIconWrapActive: { backgroundColor: colors.brandMuted },
  bottomBadge: {
    position: 'absolute',
    top: -3,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bottomBadgeText: { fontSize: 9, fontWeight: '800', color: colors.surface },
  bottomText: { fontSize: 10.5, color: colors.muted },
  bottomTextActive: { color: colors.brandDark, fontWeight: '800' },
  fab: {
    position: 'absolute',
    bottom: 88,
    right: spacing.lg,
    height: sizing.fab,
    width: sizing.fab,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    ...shadows.floating,
  },
  toast: {
    position: 'absolute',
    bottom: 28,
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#203125',
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    ...shadows.floating,
  },
  toastPhone: { bottom: 100 },
  toastText: { color: colors.surface, fontSize: 12.5, flexShrink: 1 },
});
