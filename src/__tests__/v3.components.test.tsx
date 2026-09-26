import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Onboarding } from '../components/onboarding';
import { Dashboard } from '../components/dashboard';
import { PurchasesScreen } from '../components/purchasesScreen';
import { VaultScreen } from '../components/vaultScreen';
import { DeadlineRadar } from '../components/deadlineRadar';
import { PurchaseDetails } from '../components/purchaseDetails';
import { Card, Badge, EmptyState, LoadingState, ErrorState, Skeleton, Banner } from '../components/ui';
import { demoPurchases } from '../data/demoPurchases';
import type { Purchase } from '../types/purchase';

const items = demoPurchases as Purchase[];
const noop = () => {};
const asyncNoop = async () => {};

function render(node: React.ReactElement) {
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
  return renderer.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
function hasText(renderer: TestRenderer.ReactTestRenderer, needle: string) {
  return texts(renderer).some((v) => v.includes(needle));
}

describe('Onboarding V3', () => {
  test('renders three steps with trust message', () => {
    const renderer = render(<Onboarding onAddPurchase={noop} onLoadSamples={noop} onDismiss={noop} />);
    expect(hasText(renderer, 'Keep your purchase proof organized')).toBe(true);
    expect(hasText(renderer, 'Step 1 of 3')).toBe(true);
    expect(hasText(renderer, 'Local-first')).toBe(true);
  });

  test('advances steps and shows final actions', () => {
    const renderer = render(<Onboarding onAddPurchase={noop} onLoadSamples={noop} onDismiss={noop} />);
    const nextButtons = renderer.root.findAll((n) => n.props.label === 'Next');
    expect(nextButtons.length).toBeGreaterThan(0);
    act(() => { (nextButtons[0].props.onPress as () => void)(); });
    expect(hasText(renderer, 'See your saved deadlines in one place')).toBe(true);
    act(() => {
      const btn = renderer.root.findAll((n) => n.props.label === 'Next')[0];
      (btn.props.onPress as () => void)();
    });
    expect(hasText(renderer, 'Build stronger warranty')).toBe(true);
    expect(hasText(renderer, 'Protect my first purchase')).toBe(true);
    expect(hasText(renderer, 'Explore sample data')).toBe(true);
  });
});

describe('Premium UI primitives V3', () => {
  test('Card renders children', () => {
    const renderer = render(<Card><Text>hello card</Text></Card>);
    expect(hasText(renderer, 'hello card')).toBe(true);
  });

  test('Badge tones render', () => {
    (['success', 'warning', 'danger', 'info', 'brand', 'neutral'] as const).forEach((tone) => {
      const r = render(<Badge label={`badge-${tone}`} tone={tone} />);
      expect(hasText(r, `badge-${tone}`)).toBe(true);
    });
  });

  test('EmptyState shows title and actions', () => {
    const renderer = render(<EmptyState icon="shield" title="Empty title" message="Empty message" actionLabel="Do action" onAction={noop} />);
    expect(hasText(renderer, 'Empty title')).toBe(true);
    expect(hasText(renderer, 'Do action')).toBe(true);
  });

  test('LoadingState shows label', () => {
    const renderer = render(<LoadingState label="Loading test" />);
    expect(hasText(renderer, 'Loading test')).toBe(true);
  });

  test('ErrorState shows title and retry', () => {
    const renderer = render(<ErrorState title="Oops" message="Failed" actionLabel="Retry" onAction={noop} />);
    expect(hasText(renderer, 'Oops')).toBe(true);
    expect(hasText(renderer, 'Retry')).toBe(true);
  });

  test('Skeleton renders without crashing', () => {
    const renderer = render(<Skeleton width={100} height={20} />);
    expect(renderer.toJSON()).toBeTruthy();
  });

  test('Banner renders tone correctly', () => {
    const renderer = render(<Banner tone="success" title="Success banner" message="All good" />);
    expect(hasText(renderer, 'Success banner')).toBe(true);
  });
});

describe('Dashboard V3 premium structure', () => {
  const base = {
    isPhone: false, userEmail: 'ada@example.com', sampleVisible: false, aiConfigured: true,
    onAdd: noop, onOpen: noop, onPurchases: noop, onDeadlines: noop, onVault: noop,
    onDismissSample: noop, onClearSamples: noop, onRestoreSamples: noop,
  };
  test('shows hero with protection ratio', () => {
    const renderer = render(<Dashboard {...base} items={items} />);
    expect(hasText(renderer, 'Keep the proof')).toBe(true);
    expect(hasText(renderer, 'actively protected')).toBe(true);
    expect(hasText(renderer, 'Protected')).toBe(true);
  });

  test('responsive header handles phone', () => {
    const renderer = render(<Dashboard {...base} isPhone={true} items={items} />);
    expect(hasText(renderer, 'Good')).toBe(true);
  });
});

describe('Vault V3 secure messaging', () => {
  test('shows document center and local-storage honesty', () => {
    const renderer = render(<VaultScreen onAdd={noop} onOpenPurchase={noop} onUpdatePurchase={asyncNoop} items={items} />);
    expect(hasText(renderer, 'Protection Vault')).toBe(true);
    expect(hasText(renderer, 'stored on this device') || hasText(renderer, 'Documents are stored')).toBe(true);
    expect(hasText(renderer, 'Receipts')).toBe(true);
  });

  test('shows empty with honest message', () => {
    const renderer = render(<VaultScreen onAdd={noop} onOpenPurchase={noop} onUpdatePurchase={asyncNoop} items={[]} />);
    expect(hasText(renderer, 'Your Vault is empty')).toBe(true);
  });
});

describe('DeadlineRadar V3 command center', () => {
  test('shows need action pills', () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    const deadline = { ...items[0].deadlines[0], date: soon, completed: false } as any;
    const renderer = render(
      <DeadlineRadar
        deadlines={[{ ...deadline, purchase: items[0], days: 2, status: 'urgent' as const }]}
        onUpdate={asyncNoop}
        onOpenPurchase={noop}
        onAdd={noop}
      />,
    );
    expect(hasText(renderer, 'need action') || hasText(renderer, 'Need action')).toBe(true);
    expect(hasText(renderer, 'Deadline Radar')).toBe(true);
  });
});

describe('PurchaseDetails V3 timeline', () => {
  test('shows proof header and timeline', () => {
    const renderer = render(<PurchaseDetails purchase={items[0]} onClose={noop} onEdit={noop} onDelete={noop} onUpdate={asyncNoop} onNotify={noop} />);
    expect(hasText(renderer, 'Proof of purchase')).toBe(true);
    expect(hasText(renderer, 'Important dates')).toBe(true);
    expect(hasText(renderer, 'Purchase facts')).toBe(true);
    expect(hasText(renderer, 'Documents')).toBe(true);
  });
});

describe('PurchasesScreen V3 filtering', () => {
  test('shows filter bar and sort controls', () => {
    const renderer = render(<PurchasesScreen items={items} total={items.length} query="" onAdd={noop} onOpen={noop} />);
    expect(hasText(renderer, 'All protection') || hasText(renderer, 'Protected')).toBe(true);
    expect(hasText(renderer, 'Sort')).toBe(true);
    expect(hasText(renderer, 'Filters active') || hasText(renderer, 'Reset')).toBe(false); // no filters initially
  });

  test('shows recoverable no-results when list is empty', () => {
    const renderer = render(<PurchasesScreen items={[]} total={items.length} query="nonexistentquery123" onAdd={noop} onOpen={noop} />);
    expect(hasText(renderer, 'No matches') || hasText(renderer, 'Nothing matches')).toBe(true);
  });
});
