import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { AuthScreen } from './src/components/authScreen';
import { Dashboard } from './src/components/dashboard';
import { DeadlineRadar } from './src/components/deadlineRadar';
import { PurchaseDetails } from './src/components/purchaseDetails';
import { PurchaseFlow } from './src/components/purchaseFlow';
import { PurchasesScreen } from './src/components/purchasesScreen';
import { SettingsScreen } from './src/components/settingsScreen';
import { VaultScreen } from './src/components/vaultScreen';
import { IconButton, Input, LoadingState, interactive } from './src/components/ui';
import { demoPurchases } from './src/data/demoPurchases';
import { colors, radius, shadows, sizing, spacing, type } from './src/design/tokens';
import { useAppSettings } from './src/hooks/useAppSettings';
import { useBreakpoint } from './src/hooks/useBreakpoint';
import { usePurchaseStore } from './src/hooks/usePurchaseStore';
import { useSession } from './src/hooks/useSession';
import { documentInventory, initialsFor, normalizedDeadlines, urgentDeadlines } from './src/lib/purchaseSelectors';
import { createAIService } from './src/services/ai/AIService';
import type { FeatherIconName, Purchase } from './src/types/purchase';

type Tab = 'Home' | 'Purchases' | 'Deadlines' | 'Vault' | 'Settings';
type NavItem = { label: Tab; icon: FeatherIconName; badge?: number; muted?: boolean };
type Toast = { message: string; tone: 'success' | 'danger' | 'info' };

export default function App() {
  const viewport = useBreakpoint();
  const session = useSession();
  const store = usePurchaseStore();
  const { settings, update: updateSettings } = useAppSettings();
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
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => { if (store.storageError) notify('Device storage is unavailable — changes may not persist between sessions.', 'danger'); }, [store.storageError]);

  const items = store.items;
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const deadlines = useMemo(() => normalizedDeadlines(items), [items]);
  const urgentCount = useMemo(() => urgentDeadlines(items).length, [items]);
  const documentCount = useMemo(() => documentInventory(items).all.length, [items]);
  const merchants = useMemo(() => Array.from(new Set(items.map((item) => item.merchant))).sort(), [items]);
  const aiConfigured = useMemo(() => createAIService().isConfigured, []);
  const userEmail = session.user?.email ?? null;

  const sampleVisible = useMemo(() => {
    if (settings.sampleBannerDismissed || items.length !== demoPurchases.length || items.length === 0) return false;
    return items.every((item) => demoPurchases.some((demo) => demo.id === item.id));
  }, [items, settings.sampleBannerDismissed]);

  const filtered = useMemo(() => items.filter((item) => [item.name, item.merchant, item.category, item.serial, item.model, item.notes].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())), [items, query]);

  const openPurchase = (purchase: Purchase) => setSelectedId(purchase.id);
  const openAddFlow = () => { setEditing(null); setFlowOpen(true); };
  const openEditFlow = (purchase: Purchase) => { setSelectedId(null); setEditing(purchase); setFlowOpen(true); };
  const savePurchase = (purchase: Purchase) => { store.upsert(purchase); notify(editing ? 'Purchase record updated.' : `${purchase.name} is now protected.`); };
  const updatePurchase = (purchase: Purchase) => store.upsert(purchase);
  const deletePurchase = (purchase: Purchase) => { store.remove(purchase.id); setSelectedId(null); notify(`${purchase.name} was deleted.`, 'info'); };

  const onSearch = (value: string) => { setQuery(value); if (value && tab !== 'Purchases') setTab('Purchases'); };
  const restoreSamples = () => { store.restoreSamples(); updateSettings({ sampleBannerDismissed: false }); };

  if (session.configured && session.loading) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <View style={styles.boot}>
          <View style={styles.brand}><View style={styles.logo}><Feather name="shield" size={20} color={colors.ink} /></View><Text style={styles.brandName}>ProofPilot</Text></View>
          <LoadingState label="Checking your session…" />
        </View>
      </SafeAreaView>
    );
  }

  if (session.configured && !session.user) {
    return (
      <SafeAreaView style={styles.app}>
        <StatusBar style="dark" />
        <AuthScreen onSubmit={async (email, password, signUp) => {
          const { data, error } = signUp ? await session.signUp(email, password) : await session.signIn(email, password);
          if (error) throw error;
          if (signUp && !data.session) return { info: 'We sent a confirmation link to your email. Confirm it, then sign in here.' };
        }} />
      </SafeAreaView>
    );
  }

  const navGroups: Array<{ label: string; items: NavItem[] }> = [
    { label: 'OVERVIEW', items: [{ label: 'Home', icon: 'home' }] },
    { label: 'PROTECTION', items: [
      { label: 'Purchases', icon: 'shopping-bag', badge: items.length },
      { label: 'Deadlines', icon: 'calendar', badge: urgentCount, muted: urgentCount === 0 },
      { label: 'Vault', icon: 'archive', badge: documentCount, muted: documentCount === 0 },
    ] },
    { label: 'ACCOUNT', items: [{ label: 'Settings', icon: 'settings' }] },
  ];

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.frame}>
        {!viewport.isPhone ? (
          <Sidebar groups={navGroups} active={tab} onSelect={setTab} userEmail={userEmail} configured={session.configured} onSignOut={() => session.signOut().catch(() => notify('Could not sign out. Try again.', 'danger'))} itemCount={items.length} />
        ) : null}
        <View style={styles.main}>
          <Topbar query={query} onSearch={onSearch} urgentCount={urgentCount} userEmail={userEmail} compact={viewport.isPhone} onDeadlines={() => setTab('Deadlines')} onAccount={() => setTab('Settings')} />
          <ScrollView contentContainerStyle={[styles.content, viewport.isPhone && styles.contentPhone]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!store.hydrated ? <LoadingState label="Loading your protection record…" /> : (
              <>
                {tab === 'Home' ? <Dashboard items={items} isPhone={viewport.isPhone} userEmail={userEmail} sampleVisible={sampleVisible} aiConfigured={aiConfigured} onAdd={openAddFlow} onOpen={openPurchase} onPurchases={() => setTab('Purchases')} onDeadlines={() => setTab('Deadlines')} onVault={() => setTab('Vault')} onDismissSample={() => updateSettings({ sampleBannerDismissed: true })} onClearSamples={() => { store.replaceAll([]); updateSettings({ sampleBannerDismissed: true }); notify('Sample data cleared.', 'info'); }} onRestoreSamples={() => { restoreSamples(); notify('Sample data loaded.'); }} /> : null}
                {tab === 'Purchases' ? <PurchasesScreen items={filtered} total={items.length} query={query} onAdd={openAddFlow} onOpen={openPurchase} /> : null}
                {tab === 'Deadlines' ? <DeadlineRadar deadlines={deadlines} onOpenPurchase={openPurchase} onAdd={openAddFlow} /> : null}
                {tab === 'Vault' ? <VaultScreen items={items} onAdd={openAddFlow} onOpenPurchase={openPurchase} /> : null}
                {tab === 'Settings' ? <SettingsScreen items={items} settings={settings} updateSettings={updateSettings} userEmail={userEmail} configured={session.configured} onSignOut={() => session.signOut().catch(() => notify('Could not sign out. Try again.', 'danger'))} onRestoreSamples={() => { restoreSamples(); notify('Sample data restored.'); }} onDeleteAll={() => { store.replaceAll([]); notify('All purchases deleted from this device.', 'info'); }} onNotify={notify} /> : null}
              </>
            )}
          </ScrollView>
          {viewport.isPhone ? <BottomNav active={tab} onSelect={setTab} urgentCount={urgentCount} /> : null}
        </View>
      </View>

      {viewport.isPhone ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Protect a purchase" onPress={openAddFlow} style={interactive(styles.fab, { hover: { backgroundColor: colors.brandStrong }, pressed: { opacity: 0.88 } })}>
          <Feather name="plus" size={25} color={colors.ink} />
        </Pressable>
      ) : null}

      <PurchaseFlow visible={flowOpen} initialPurchase={editing} merchants={merchants} defaultReturnDays={settings.defaultReturnWindowDays} onClose={() => { setFlowOpen(false); setEditing(null); }} onSave={savePurchase} onDone={(purchase) => { setFlowOpen(false); setEditing(null); setSelectedId(purchase.id); }} />
      <PurchaseDetails purchase={selected} onClose={() => setSelectedId(null)} onEdit={openEditFlow} onDelete={deletePurchase} onUpdate={updatePurchase} onNotify={notify} />

      {toast ? (
        <View accessibilityLiveRegion="polite" style={[styles.toast, viewport.isPhone && styles.toastPhone]}>
          <Feather name={toast.tone === 'danger' ? 'alert-circle' : toast.tone === 'info' ? 'info' : 'check-circle'} color={toast.tone === 'danger' ? '#F2B8BD' : toast.tone === 'info' ? '#B9CFEA' : colors.brand} size={17} />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Sidebar({ groups, active, onSelect, userEmail, configured, onSignOut, itemCount }: { groups: Array<{ label: string; items: NavItem[] }>; active: Tab; onSelect: (tab: Tab) => void; userEmail: string | null; configured: boolean; onSignOut: () => void; itemCount: number }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <View style={styles.logo}><Feather name="shield" size={20} color={colors.ink} /></View>
        <View>
          <Text style={styles.brandName}>ProofPilot</Text>
          <Text style={styles.brandTag}>PURCHASE PROTECTION</Text>
        </View>
      </View>
      <View style={styles.nav}>
        {groups.map((group) => (
          <View key={group.label} style={styles.navGroup}>
            <Text style={styles.navGroupLabel}>{group.label}</Text>
            {group.items.map((item) => {
              const selectedTab = active === item.label;
              return (
                <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: selectedTab }} onPress={() => onSelect(item.label)} style={interactive([styles.navItem, selectedTab ? styles.navActive : null], { hover: { backgroundColor: selectedTab ? colors.brandMuted : 'rgba(21,34,54,0.045)' } })}>
                  {selectedTab ? <View style={styles.navIndicator} /> : null}
                  <Feather name={item.icon} size={18} color={selectedTab ? colors.brandDark : colors.muted} />
                  <Text style={[styles.navText, selectedTab && styles.navTextActive]}>{item.label}</Text>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <View style={[styles.navBadge, item.label === 'Deadlines' ? { backgroundColor: colors.warningSurface } : null]}>
                      <Text style={[styles.navBadgeText, item.label === 'Deadlines' ? { color: colors.warning } : null]}>{item.badge}</Text>
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
          <Feather name={configured ? 'cloud' : 'hard-drive'} size={16} color={colors.brandDark} />
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{configured ? 'Cloud ready' : 'Local mode'}</Text>
            <Text style={type.caption}>{configured ? 'Supabase configured' : `${itemCount} purchase${itemCount === 1 ? '' : 's'} stored on this device`}</Text>
          </View>
        </View>
        <View style={styles.profile}>
          <View style={styles.avatar}><Feather name={userEmail ? 'user' : 'smartphone'} size={15} color={colors.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={type.label}>{userEmail ?? 'This device'}</Text>
            <Text style={type.caption}>{userEmail ? 'Signed in' : 'No cloud account'}</Text>
          </View>
          {userEmail ? <IconButton icon="log-out" label="Sign out" size={34} tone="ghost" onPress={onSignOut} /> : null}
        </View>
      </View>
    </View>
  );
}

function Topbar({ query, onSearch, urgentCount, userEmail, compact, onDeadlines, onAccount }: { query: string; onSearch: (value: string) => void; urgentCount: number; userEmail: string | null; compact: boolean; onDeadlines: () => void; onAccount: () => void }) {
  return (
    <View style={styles.topbar}>
      {compact ? (
        <View style={styles.mobileBrand}>
          <View style={styles.logoSmall}><Feather name="shield" size={15} color={colors.ink} /></View>
          <Text style={styles.brandName}>ProofPilot</Text>
        </View>
      ) : null}
      <View style={styles.search}>
        <Feather name="search" size={17} color={colors.muted} />
        <Input accessibilityLabel="Search your purchases" value={query} onChangeText={onSearch} placeholder={compact ? 'Search purchases' : 'Search purchases, merchants, serial numbers…'} containerStyle={{ flex: 1 }} style={styles.searchInput} />
        {query ? <IconButton icon="x" label="Clear search" size={30} tone="ghost" onPress={() => onSearch('')} /> : null}
      </View>
      <View>
        <IconButton icon="bell" label={urgentCount ? `View deadlines: ${urgentCount} urgent` : 'View deadlines'} onPress={onDeadlines} />
        {urgentCount > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{urgentCount}</Text></View> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Account and settings" onPress={onAccount} style={interactive(styles.topAvatar)}>
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
    <View style={styles.bottomNav}>
      {items.map((item) => {
        const selectedTab = active === item.label;
        return (
          <Pressable key={item.label} accessibilityRole="tab" accessibilityState={{ selected: selectedTab }} onPress={() => onSelect(item.label)} style={interactive(styles.bottomItem, { hover: { backgroundColor: 'transparent' } })}>
            <View style={[styles.bottomIconWrap, selectedTab && styles.bottomIconWrapActive]}>
              <Feather name={item.icon} size={19} color={selectedTab ? colors.brandDark : colors.muted} />
              {item.badge ? <View style={styles.bottomBadge}><Text style={styles.bottomBadgeText}>{item.badge}</Text></View> : null}
            </View>
            <Text style={[styles.bottomText, selectedTab && styles.bottomTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.canvas },
  boot: { flex: 1, justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  frame: { flex: 1, flexDirection: 'row', width: '100%', alignSelf: 'center' },
  main: { flex: 1, minWidth: 0 },
  sidebar: { width: sizing.sidebar, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  logo: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  logoSmall: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  brandName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  brandTag: { fontSize: 8, fontWeight: '800', letterSpacing: 1.05, color: colors.subtle, marginTop: 2 },
  nav: { marginTop: spacing.xl, flex: 1 },
  navGroup: { marginBottom: spacing.lg },
  navGroupLabel: { ...type.eyebrow, fontSize: 9.5, paddingHorizontal: spacing.md, marginBottom: 6 },
  navItem: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, position: 'relative', marginBottom: 2 },
  navActive: { backgroundColor: colors.brandMuted },
  navIndicator: { position: 'absolute', left: -spacing.lg, width: 3, height: 22, borderRadius: 2, backgroundColor: colors.brandDark },
  navText: { ...type.body, flex: 1 },
  navTextActive: { color: colors.ink, fontWeight: '800' },
  navBadge: { minWidth: 22, height: 20, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  navBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.inkSecondary },
  sidebarBottom: { gap: spacing.md },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  avatar: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2E7DD' },
  avatarText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  topbar: { minHeight: 68, paddingHorizontal: spacing.xl, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: { minHeight: sizing.touchCompact + 4, maxWidth: 560, flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md, paddingRight: spacing.xs, gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0, height: '100%', minHeight: 0 },
  bellBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { fontSize: 10, fontWeight: '800', color: colors.surface },
  topAvatar: { minWidth: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2E7DD', paddingHorizontal: 6 },
  content: { width: '100%', maxWidth: sizing.contentMax, alignSelf: 'center', padding: spacing.xl, paddingBottom: 72 },
  contentPhone: { padding: spacing.lg, paddingBottom: 108 },
  bottomNav: { height: 72, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xs, paddingBottom: Platform.OS === 'ios' ? spacing.sm : 0 },
  bottomItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomIconWrap: { width: 46, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bottomIconWrapActive: { backgroundColor: colors.brandMuted },
  bottomBadge: { position: 'absolute', top: -3, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bottomBadgeText: { fontSize: 9, fontWeight: '800', color: colors.surface },
  bottomText: { fontSize: 10.5, color: colors.muted },
  bottomTextActive: { color: colors.brandDark, fontWeight: '800' },
  fab: { position: 'absolute', bottom: 88, right: spacing.lg, height: 56, width: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, ...shadows.floating },
  toast: { position: 'absolute', bottom: 28, maxWidth: 430, alignSelf: 'center', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: '#203125', flexDirection: 'row', gap: spacing.sm, alignItems: 'center', ...shadows.floating },
  toastPhone: { bottom: 100 },
  toastText: { color: colors.surface, fontSize: 12.5, flexShrink: 1 },
});
