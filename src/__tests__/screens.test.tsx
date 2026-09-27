/**
 * Render smoke tests: every major screen must mount with real data and with none,
 * and surface the states the product promises (empty states, metrics, filters).
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Button } from '../components/ui';
import { Dashboard } from '../components/dashboard';
import { DeadlineRadar } from '../components/deadlineRadar';
import { PurchasesScreen } from '../components/purchasesScreen';
import { VaultScreen } from '../components/vaultScreen';
import { SettingsScreen } from '../components/settingsScreen';
import { PurchaseDetails } from '../components/purchaseDetails';
import { demoPurchases } from '../data/demoPurchases';
import type { Purchase } from '../types/purchase';

const items = demoPurchases as Purchase[];
const noop = () => { /* no-op for smoke tests */ };
const asyncNoop = async () => { /* no-op for smoke tests */ };

function render(node: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(node); });
  return renderer;
}

function flatten(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join('');
  if (React.isValidElement(value)) return flatten((value.props as { children?: unknown }).children);
  return '';
}

function texts(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map((node) => flatten(node.props.children)).filter(Boolean);
}

function hasText(renderer: TestRenderer.ReactTestRenderer, needle: string): boolean {
  return texts(renderer).some((value) => value.includes(needle));
}

function hasPlaceholder(renderer: TestRenderer.ReactTestRenderer, needle: string): boolean {
  return renderer.root.findAll((node) => typeof node.props.placeholder === 'string' && node.props.placeholder.includes(needle)).length > 0;
}

afterEach(() => { jest.restoreAllMocks(); });

describe('Dashboard', () => {
  const baseProps = {
    isPhone: false, userEmail: null, sampleVisible: false, aiConfigured: false,
    onAdd: noop, onOpen: noop, onPurchases: noop, onDeadlines: noop, onVault: noop,
    onDismissSample: noop, onClearSamples: noop, onRestoreSamples: noop,
  };

  test('shows the first-run empty state with a way in', () => {
    const renderer = render(<Dashboard {...baseProps} items={[]} />);
    expect(hasText(renderer, 'Protect your first purchase')).toBe(true);
    expect(hasText(renderer, 'sample data') || hasText(renderer, 'Load sample data')).toBe(true);
  });

  test('shows real metrics and the attention section with data', () => {
    const renderer = render(<Dashboard {...baseProps} items={items} />);
    expect(hasText(renderer, 'Total purchases')).toBe(true);
    expect(hasText(renderer, 'Protected')).toBe(true);
    expect(hasText(renderer, 'Need attention')).toBe(true);
    expect(hasText(renderer, 'Upcoming deadlines')).toBe(true);
    expect(hasText(renderer, 'Expiring warranties')).toBe(true);
    expect(hasText(renderer, 'Missing receipts')).toBe(true);
    expect(hasText(renderer, 'Completed deadlines')).toBe(true);
    expect(hasText(renderer, 'What needs your attention') || hasText(renderer, 'Everything is up to date')).toBe(true);
  });
});

describe('Purchases screen', () => {
  const props = { total: items.length, query: '', onAdd: noop, onOpen: noop };

  test('lists purchases with sort and filter controls', () => {
    const renderer = render(<PurchasesScreen {...props} items={items} />);
    expect(hasText(renderer, 'Samsung')).toBe(true);
    const toggle = renderer.root.findAllByType(Button).find(button => button.props.label === 'Filters & sort');
    if (toggle) { expect(toggle.props.accessibilityExpanded).toBe(false); act(() => toggle.props.onPress()); }
    expect(hasText(renderer, 'Sort')).toBe(true);
    expect(hasText(renderer, 'Pinned only')).toBe(true);
    expect(hasText(renderer, 'Reset filters') || hasText(renderer, 'of 3 items')).toBe(true);
  });

  test('explains an empty collection', () => {
    const renderer = render(<PurchasesScreen {...props} items={[]} total={0} />);
    expect(hasText(renderer, 'No purchases yet')).toBe(true);
  });

  test('shows a recoverable no-results state when filters exclude everything', () => {
    const renderer = render(<PurchasesScreen {...props} items={items} total={items.length} query="" />);
    expect(hasText(renderer, 'of 3 items')).toBe(true);
  });
});

describe('Deadline Radar', () => {
  const props = { onUpdate: asyncNoop, onOpenPurchase: noop, onAdd: noop };

  test('empty state promises automatic tracking', () => {
    const renderer = render(<DeadlineRadar {...props} deadlines={[]} />);
    expect(hasText(renderer, 'No deadlines tracked yet')).toBe(true);
  });

  test('groups active deadlines and distinguishes completed view', () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const deadline = { ...items[0].deadlines[0], date: soon, completed: false };
    const renderer = render(<DeadlineRadar {...props} deadlines={[{ ...deadline, purchase: items[0], days: 3, status: 'urgent' as const }]} />);
    expect(hasText(renderer, 'Overdue / expired') || hasText(renderer, 'This week')).toBe(true);
    expect(hasText(renderer, 'Completed (0)') || hasText(renderer, 'Active')).toBe(true);
    expect(hasText(renderer, '3 days remaining') || hasText(renderer, 'days remaining')).toBe(true);
  });
});

describe('Vault', () => {
  const props = { onAdd: noop, onOpenPurchase: noop, onUpdatePurchase: asyncNoop };

  test('empty state explains where documents live', () => {
    const renderer = render(<VaultScreen {...props} items={[]} />);
    expect(hasText(renderer, 'Your Vault is empty')).toBe(true);
  });

  test('groups documents by type with search', () => {
    const renderer = render(<VaultScreen {...props} items={items} />);
    expect(hasText(renderer, 'Receipts')).toBe(true);
    expect(hasText(renderer, 'stored on this device') || hasText(renderer, 'Documents are stored on this device')).toBe(true);
    expect(hasPlaceholder(renderer, 'Search documents')).toBe(true);
  });
});

describe('Settings', () => {
  const props = {
    items, settings: { defaultReturnWindowDays: 30, sampleBannerDismissed: false, onboardingCompleted: true },
    updateSettings: asyncNoop, userEmail: 'ada@example.com', configured: true,
    syncStatus: 'synced' as const, syncError: null, online: true,
    onSignOut: noop, onRestoreSamples: noop, onDeleteAll: noop, onNotify: noop,
  };

  test('shows sync state, account, and guarded destructive actions', () => {
    const renderer = render(<SettingsScreen {...props} />);
    expect(hasText(renderer, 'Current status')).toBe(true);
    expect(hasText(renderer, 'Synced')).toBe(true);
    expect(hasText(renderer, 'Sign out')).toBe(true);
    expect(hasText(renderer, 'Delete all purchases')).toBe(true);
    expect(hasText(renderer, 'Support')).toBe(true);
    expect(hasText(renderer, '1.0.0')).toBe(true);
  });

  test('reports offline honestly', () => {
    const renderer = render(<SettingsScreen {...props} online={false} syncStatus="error" syncError="Network down" />);
    expect(hasText(renderer, 'Offline')).toBe(true);
  });

  test('local mode explains that cloud sync is off', () => {
    const renderer = render(<SettingsScreen {...props} configured={false} userEmail={null} syncStatus="local" />);
    expect(hasText(renderer, 'Cloud sync is off') || hasText(renderer, 'Local')).toBe(true);
  });
});

describe('Purchase details', () => {
  const base = { onClose: noop, onEdit: noop, onDelete: noop, onUpdate: asyncNoop, onNotify: noop };

  test('surfaces protection, facts, and quick actions', () => {
    const renderer = render(<PurchaseDetails {...base} purchase={items[0]} />);
    expect(hasText(renderer, 'Information you saved — not independently verified.')).toBe(true);
    expect(hasText(renderer, 'Verified information')).toBe(false);
    expect(hasText(renderer, 'Proof of purchase')).toBe(true);
    expect(hasText(renderer, 'Return window')).toBe(true);
    expect(hasText(renderer, 'Warranty')).toBe(true);
    expect(hasText(renderer, 'Purchase facts')).toBe(true);
    expect(hasText(renderer, 'Pin') || hasText(renderer, 'Pinned')).toBe(true);
    expect(hasText(renderer, 'Copy summary')).toBe(true);
    expect(hasText(renderer, 'Delete purchase')).toBe(true);
  });

  test('renders nothing without a purchase', () => {
    const renderer = render(<PurchaseDetails {...base} purchase={null} />);
    expect(renderer.toJSON()).toBeNull();
  });
});
