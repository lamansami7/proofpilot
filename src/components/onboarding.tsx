import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../design/tokens';
import { Button, Card } from './ui';
import type { FeatherIconName } from '../types/purchase';

type Step = { icon: FeatherIconName; title: string; body: string; accent: string };

const steps: Step[] = [
  {
    icon: 'archive',
    title: 'Keep your purchase proof organized.',
    body: 'Receipts, warranties, serial numbers — one calm place. No more digging through email or drawers when you need them.',
    accent: '#EAF4DB',
  },
  {
    icon: 'calendar',
    title: 'Never miss an important deadline.',
    body: 'Return windows and warranty expirations are tracked automatically and grouped by urgency in Deadline Radar.',
    accent: '#FFF1DF',
  },
  {
    icon: 'file-text',
    title: 'Build stronger warranty and return claims.',
    body: 'Verified facts from your records power honest, reviewable claim drafts. Nothing is sent without your approval.',
    accent: '#EAF0FA',
  },
];

export function Onboarding({
  onAddPurchase,
  onLoadSamples,
  onDismiss,
}: {
  onAddPurchase: () => void;
  onLoadSamples: () => void;
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]}
          />
        ))}
        <Text style={type.caption}>
          Step {index + 1} of {steps.length}
        </Text>
      </View>

      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: step.accent }]}>
          <Feather name={step.icon} size={28} color={colors.brandDark} />
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={[type.body, styles.body]}>{step.body}</Text>

        <View style={styles.actions}>
          {!last ? (
            <>
              <Button variant="ghost" label="Skip" onPress={onDismiss} />
              <Button label="Next" icon="arrow-right" onPress={() => setIndex((v) => v + 1)} />
            </>
          ) : (
            <>
              <Button variant="secondary" label="Explore sample data" onPress={onLoadSamples} />
              <Button label="Protect my first purchase" icon="plus" onPress={onAddPurchase} />
            </>
          )}
        </View>

        {last ? (
          <View style={styles.hint}>
            <Feather name="info" size={14} color={colors.muted} />
            <Text style={type.caption}>Sample data shows what ProofPilot can do. Remove it anytime without touching your own records.</Text>
          </View>
        ) : null}
      </Card>

      <View style={styles.trust}>
        <Feather name="shield" size={14} color={colors.success} />
        <Text style={type.caption}>Local-first. Private. Your data stays on this device until you connect an account.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg, maxWidth: 640, alignSelf: 'center', width: '100%' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 28, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brandDark, width: 32 },
  dotDone: { backgroundColor: colors.brand, width: 24 },
  card: { padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...type.title, textAlign: 'center', maxWidth: 420 },
  body: { textAlign: 'center', maxWidth: 460 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  hint: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  trust: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
});
