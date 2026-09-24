import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, type } from '../design/tokens';
import { formatMoney } from '../lib/purchaseSelectors';
import type { Purchase } from '../types/purchase';
import { Button, Card, Chip, EmptyState } from './ui';
import { PurchaseCard } from './purchaseComponents';

type Sort = 'recent' | 'name' | 'price';

export function PurchasesScreen({ items, total, query, onAdd, onOpen }: { items: Purchase[]; total: number; query: string; onAdd: () => void; onOpen: (purchase: Purchase) => void }) {
  const [sort, setSort] = useState<Sort>('recent');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))).sort(), [items]);
  const visible = useMemo(() => {
    const inCategory = category ? items.filter((item) => item.category === category) : items;
    return [...inCategory].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'price' ? (b.price ?? -1) - (a.price ?? -1) : (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? ''));
  }, [items, sort, category]);
  const totalValue = useMemo(() => visible.reduce((sum, item) => sum + (item.price ?? 0), 0), [visible]);

  return (
    <>
      <View style={styles.title}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>YOUR COLLECTION</Text>
          <Text style={type.display}>Your purchases</Text>
          <Text style={[type.body, styles.subtitle]}>Everything you own, with the details that protect it.</Text>
        </View>
        <Button label="Protect a purchase" icon="plus" onPress={onAdd} />
      </View>

      {total === 0 ? (
        <EmptyState icon="shopping-bag" title="No purchases yet" message="Protect your first purchase and it will appear here with its receipts, return window, and warranty." actionLabel="Protect a purchase" onAction={onAdd} />
      ) : (
        <>
          <Card style={styles.controls}>
            <View style={styles.controlsTop}>
              <Text style={type.bodySmall}>{visible.length} of {total} item{total === 1 ? '' : 's'}{visible.length ? ` · ${formatMoney(totalValue)}` : ''}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={type.caption}>Sort</Text>
                <Chip label="Recent" selected={sort === 'recent'} onPress={() => setSort('recent')} />
                <Chip label="Name" selected={sort === 'name'} onPress={() => setSort('name')} />
                <Chip label="Price" selected={sort === 'price'} onPress={() => setSort('price')} />
              </View>
            </View>
            {categories.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                <Chip label="All categories" selected={!category} onPress={() => setCategory(null)} />
                {categories.map((item) => <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(category === item ? null : item)} />)}
              </ScrollView>
            ) : null}
          </Card>

          {visible.length ? (
            <View style={styles.grid}>
              {visible.map((purchase) => <PurchaseCard key={purchase.id} item={purchase} onPress={() => onOpen(purchase)} />)}
            </View>
          ) : (
            <EmptyState compact icon="search" title="No matches" message={query ? `Nothing matches “${query}”${category ? ` in ${category}` : ''}. Try another product, merchant, serial number, or note.` : `Nothing in ${category} yet.`} />
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.lg, marginBottom: spacing.xl, flexWrap: 'wrap' },
  subtitle: { marginTop: spacing.sm, maxWidth: 560 },
  controls: { padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md },
  controlsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  categoryRow: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
