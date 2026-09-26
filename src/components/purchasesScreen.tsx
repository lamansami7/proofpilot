import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import {
  filterPurchases,
  formatMoney,
  sortPurchases,
  type PurchaseFilters,
  type PurchaseSortKey,
  type SortDirection,
} from '../lib/purchaseSelectors';
import type { Purchase, ProtectionStatus } from '../types/purchase';
import { Button, Card, Chip, EmptyState, PageHeader } from './ui';
import { PurchaseCard } from './purchaseComponents';

const PAGE_SIZE = 18;
const defaultFilters: PurchaseFilters = { protection: 'all', category: null, receipt: 'all', pinnedOnly: false };
const sortLabels: Array<[PurchaseSortKey, string]> = [
  ['date', 'Date'],
  ['name', 'Name'],
  ['price', 'Price'],
  ['deadline', 'Next deadline'],
  ['warranty', 'Warranty end'],
];

export function PurchasesScreen({
  items,
  total,
  query,
  onAdd,
  onOpen,
}: {
  items: Purchase[];
  total: number;
  query: string;
  onAdd: () => void;
  onOpen: (purchase: Purchase) => void;
}) {
  const [filters, setFilters] = useState<PurchaseFilters>(defaultFilters);
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))).sort(), [items]);
  const visible = useMemo(() => sortPurchases(filterPurchases(items, filters), sortKey, direction), [items, filters, sortKey, direction]);
  const totalValue = useMemo(() => visible.reduce((sum, item) => sum + (item.price ?? 0), 0), [visible]);

  const filtersActive = filters.protection !== 'all' || filters.category !== null || filters.receipt !== 'all' || filters.pinnedOnly;
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filters, sortKey, direction, query]);
  const resetFilters = () => {
    setFilters(defaultFilters);
    setSortKey('date');
    setDirection('desc');
  };
  const setFilter = <K extends keyof PurchaseFilters>(key: K, value: PurchaseFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const shown = visible.slice(0, limit);

  return (
    <>
      <PageHeader
        eyebrow="YOUR COLLECTION"
        title="Your purchases"
        description="Everything you own, with the details that protect it."
        actionLabel="Protect a purchase"
        actionIcon="plus"
        onAction={onAdd}
      />

      {total === 0 ? (
        <EmptyState
          icon="shopping-bag"
          title="No purchases yet"
          message="Protect your first purchase and it will appear here with its receipts, return window, and warranty — organized and ready when you need it."
          actionLabel="Protect a purchase"
          onAction={onAdd}
        />
      ) : (
        <>
          <Card style={styles.controls}>
            <View style={styles.controlsTop}>
              <View style={styles.controlsMeta}>
                <Feather name="layers" size={14} color={colors.muted} />
                <Text style={type.bodySmall}>
                  {visible.length} of {total} item{total === 1 ? '' : 's'}
                  {visible.length ? ` · ${formatMoney(totalValue)}` : ''}
                  {visible.length > limit ? ` · showing first ${limit}` : ''}
                </Text>
                {filtersActive ? <View style={styles.dot} /> : null}
                {filtersActive ? <Text style={[type.caption, { color: colors.brandDark, fontWeight: '700' }]}>Filters active</Text> : null}
              </View>
              <View style={styles.sortRow}>
                <Text style={type.caption}>Sort</Text>
                {sortLabels.map(([value, label]) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={sortKey === value}
                    onPress={() => {
                      if (sortKey === value) setDirection((c) => (c === 'asc' ? 'desc' : 'asc'));
                      else {
                        setSortKey(value);
                        setDirection(value === 'name' || value === 'warranty' ? 'asc' : 'desc');
                      }
                    }}
                  />
                ))}
                <Chip
                  icon={direction === 'asc' ? 'arrow-up' : 'arrow-down'}
                  label={direction === 'asc' ? 'Ascending' : 'Descending'}
                  selected={false}
                  onPress={() => setDirection((c) => (c === 'asc' ? 'desc' : 'asc'))}
                />
              </View>
            </View>

            <View style={styles.filterRow}>
              {(
                [
                  ['all', 'All protection'],
                  ['protected', 'Protected'],
                  ['attention', 'Needs receipt'],
                  ['unprotected', 'No active window'],
                ] as Array<[ProtectionStatus | 'all', string]>
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  selected={filters.protection === value}
                  onPress={() => setFilter('protection', filters.protection === value && value !== 'all' ? 'all' : value)}
                />
              ))}
              <View style={styles.filterDivider} />
              {(
                [
                  ['all', 'Receipt: any'],
                  ['present', 'Has receipt'],
                  ['missing', 'Missing receipt'],
                ] as Array<[PurchaseFilters['receipt'], string]>
              ).map(([value, label]) => (
                <Chip key={value} label={label} selected={filters.receipt === value} onPress={() => setFilter('receipt', value)} />
              ))}
              <Chip icon="bookmark" label="Pinned only" selected={filters.pinnedOnly} onPress={() => setFilter('pinnedOnly', !filters.pinnedOnly)} />
              {filtersActive ? <Button size="sm" variant="ghost" label="Reset" onPress={resetFilters} /> : null}
            </View>

            {categories.length > 1 || filters.category ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                <Chip label="All categories" selected={!filters.category} onPress={() => setFilter('category', null)} />
                {categories.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    selected={filters.category === item}
                    onPress={() => setFilter('category', filters.category === item ? null : item)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </Card>

          {visible.length ? (
            <>
              <View style={styles.grid}>
                {shown.map((purchase) => (
                  <PurchaseCard key={purchase.id} item={purchase} onPress={() => onOpen(purchase)} />
                ))}
              </View>
              {visible.length > limit ? (
                <View style={styles.moreRow}>
                  <Button
                    variant="secondary"
                    icon="chevrons-down"
                    label={`Show ${Math.min(PAGE_SIZE, visible.length - limit)} more of ${visible.length - limit} remaining`}
                    onPress={() => setLimit((v) => v + PAGE_SIZE)}
                  />
                  <Text style={type.caption}>Large lists stay fast — incremental rendering with one press.</Text>
                </View>
              ) : null}
              {visible.length > 6 ? (
                <Text style={[type.caption, { textAlign: 'center', marginTop: spacing.md }]}>
                  Showing {shown.length} of {visible.length} · {formatMoney(totalValue)} total value
                </Text>
              ) : null}
            </>
          ) : (
            <EmptyState
              compact
              icon="search"
              title="No matches"
              message={[
                query ? `Nothing matches “${query}”` : 'No purchases match the current filters',
                filters.category ? ` in ${filters.category}` : '',
                filters.pinnedOnly ? ' · pinned only' : '',
                filters.receipt !== 'all' ? ` · receipt ${filters.receipt === 'present' ? 'present' : 'missing'}` : '',
                filters.protection !== 'all' ? ' · protection filter active' : '',
                '.',
              ].join('')}
              actionLabel={filtersActive || query ? 'Clear filters' : undefined}
              onAction={filtersActive || query ? resetFilters : undefined}
            />
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  controls: { padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md, borderColor: colors.borderSubtle, borderRadius: radius.lg },
  controlsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  controlsMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.brandStrong },
  sortRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  filterDivider: { width: 1, backgroundColor: colors.border, alignSelf: 'stretch', marginVertical: 2, minHeight: 24, borderRadius: radius.pill },
  categoryRow: { gap: spacing.sm, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  moreRow: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm },
});
