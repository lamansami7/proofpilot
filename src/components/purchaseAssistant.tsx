import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { createAIService, type AIService, type PurchaseAnswer, type PurchaseContext } from '../services/ai/AIService';
import { colors, radius, spacing, type } from '../design/tokens';
import { formatDate } from '../lib/purchaseSelectors';
import type { Purchase } from '../types/purchase';
import { Banner, Button, Card, Input, interactive } from './ui';

type Message = { id: string; role: 'user' | 'assistant'; text: string; answer?: PurchaseAnswer };
const questions = ['Can I still return this?', 'Is this still under warranty?', 'What should I do if it breaks?', 'What documents do I need?', 'What information is missing from this purchase?'];

function contextFor(p: Purchase): PurchaseContext { return { productName: p.name, merchant: p.merchant, purchaseDate: p.purchaseDate ?? undefined, price: p.price ?? undefined, returnDeadline: p.returnDeadline ?? undefined, warrantyEnd: p.warrantyEnd ?? undefined, warrantyProvider: p.warrantyProvider ?? undefined, serialNumber: p.serial ?? undefined, modelNumber: p.model ?? undefined, documents: p.documents.map((d) => d.name), notes: p.notes ?? undefined }; }

function knownFacts(p: Purchase): Array<[string, string]> {
  return [
    ['Merchant', p.merchant],
    ['Purchased', p.purchaseDate ? formatDate(p.purchaseDate) : ''],
    ['Price', p.price !== null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p.price) : ''],
    ['Return deadline', p.returnDeadline ? formatDate(p.returnDeadline) : ''],
    ['Warranty expiration', p.warrantyEnd ? formatDate(p.warrantyEnd) : ''],
    ['Warranty provider', p.warrantyProvider ?? ''],
    ['Serial number', p.serial ?? ''],
    ['Documents', p.documents.length ? `${p.documents.length} saved` : ''],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
}
function missingFacts(p: Purchase): string[] {
  const missing: string[] = [];
  if (!p.purchaseDate) missing.push('purchase date');
  if (p.price === null) missing.push('price');
  if (!p.returnDeadline) missing.push('return deadline');
  if (!p.warrantyEnd) missing.push('warranty expiration');
  if (!p.warrantyProvider) missing.push('warranty provider');
  if (!p.serial) missing.push('serial number');
  if (!p.documents.length) missing.push('receipt or documents');
  return missing;
}

export function PurchaseAssistant({ purchase, onEditPurchase, assistant = createAIService() }: { purchase: Purchase; onEditPurchase?: () => void; assistant?: AIService }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable' | 'error'>('idle');
  const known = useMemo(() => knownFacts(purchase), [purchase]);
  const missing = useMemo(() => missingFacts(purchase), [purchase]);

  const ask = async (value: string) => {
    const text = value.trim();
    if (!text || state === 'loading') return;
    setMessages((items) => [...items, { id: `question-${Date.now()}`, role: 'user', text }]);
    setQuestion(''); setState('loading');
    try {
      const answer = await assistant.answerPurchaseQuestion(text, contextFor(purchase));
      setMessages((items) => [...items, { id: `answer-${Date.now()}`, role: 'assistant', text: answer.answer, answer }]);
      setState('idle');
    } catch (error) {
      setState(error instanceof Error && error.name === 'AIServiceError' && (error as { code?: string }).code === 'unavailable' ? 'unavailable' : 'error');
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><Feather name="message-circle" size={18} color={colors.brandDark} /></View>
        <View style={styles.flex}>
          <Text style={type.heading}>Ask ProofPilot</Text>
          <Text style={type.bodySmall}>Scoped to this purchase — never general policy guesses.</Text>
        </View>
      </View>

      <View style={styles.factsBlock}>
        <View style={styles.factsColumn}>
          <Text style={styles.eyebrow}>KNOWN FROM YOUR RECORD</Text>
          {known.length ? known.map(([label, value]) => (
            <Text key={label} style={styles.fact}><Text style={styles.factName}>{label}: </Text>{value}</Text>
          )) : <Text style={type.caption}>Almost nothing is saved yet.</Text>}
        </View>
        <View style={styles.factsColumn}>
          <Text style={styles.eyebrow}>MISSING</Text>
          {missing.length ? missing.map((item) => (
            <Text key={item} style={styles.factMissing}>· {item}</Text>
          )) : <Text style={[styles.fact, { color: colors.success }]}>Record looks complete.</Text>}
        </View>
      </View>

      {assistant.isConfigured ? (
        <>
          {messages.length === 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.eyebrow}>SUGGESTED QUESTIONS</Text>
              {questions.map((item) => (
                <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Ask: ${item}`} onPress={() => ask(item)} style={interactive(styles.question, { hover: { backgroundColor: colors.surfaceMuted } })}>
                  <Text style={styles.questionText}>{item}</Text>
                  <Feather name="arrow-up-right" size={14} color={colors.brandDark} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.conversation}>
              {messages.map((message) => (
                <View key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.answerMessage]}>
                  <Text style={message.role === 'user' ? styles.userText : type.body}>{message.text}</Text>
                  {message.answer ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <Text style={styles.generated}>AI-GENERATED GUIDANCE · VERIFY WITH YOUR DOCUMENTS</Text>
                      {message.answer.knownFacts.length ? <Text style={type.caption}>Based on: {message.answer.knownFacts.join(' · ')}</Text> : null}
                      {message.answer.missingInformation.length ? <Text style={[type.caption, { marginTop: 3 }]}>Still needed: {message.answer.missingInformation.join(' · ')}</Text> : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
          {state === 'loading' ? (
            <View accessibilityLiveRegion="polite" style={styles.status}>
              <ActivityIndicator size="small" color={colors.brandDark} />
              <Text style={type.bodySmall}>Reviewing only this purchase’s saved information…</Text>
            </View>
          ) : null}
          {state === 'error' ? (
            <Banner tone="danger" icon="alert-circle" title="ProofPilot could not answer right now" message="Your purchase details were not changed. Try again shortly." />
          ) : null}
          <View style={styles.composer}>
            <Input accessibilityLabel="Ask a question about this purchase" value={question} onChangeText={setQuestion} placeholder="Ask about this purchase" onSubmitEditing={() => ask(question)} returnKeyType="send" containerStyle={{ flex: 1 }} />
            <Button label="Ask" icon="send" onPress={() => ask(question)} />
          </View>
        </>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <Banner tone="info" icon="lock" title="AI answers are not connected in this build" message="ProofPilot never invents answers. Once a secure AI service is configured, it will respond here using only the facts shown above — and it will say clearly when something is missing." />
          {missing.length && onEditPurchase ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
              <Text style={type.bodySmall}>Meanwhile, you can strengthen this record:</Text>
              <Button size="sm" variant="secondary" icon="edit-2" label={`Add: ${missing.slice(0, 2).join(', ')}`} onPress={onEditPurchase} />
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.brandMuted, borderColor: '#DCE9CA' },
  heading: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1 },
  icon: { height: 38, width: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCEFC6' },
  factsBlock: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  factsColumn: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, minWidth: 0 },
  eyebrow: { ...type.eyebrow, marginBottom: 6 },
  fact: { ...type.bodySmall, marginTop: 3 },
  factName: { fontWeight: '800', color: colors.ink },
  factMissing: { ...type.bodySmall, marginTop: 3, color: colors.warning },
  suggestions: { marginTop: spacing.lg },
  question: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  questionText: { ...type.label, color: colors.brandDark, flex: 1 },
  conversation: { marginTop: spacing.lg, gap: spacing.sm },
  message: { padding: spacing.md, borderRadius: radius.md },
  userMessage: { alignSelf: 'flex-end', backgroundColor: colors.navy, maxWidth: '88%' },
  answerMessage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  userText: { ...type.body, color: colors.surface, fontWeight: '700' },
  generated: { ...type.eyebrow, fontSize: 9, marginBottom: 4 },
  status: { minHeight: 42, marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  composer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignItems: 'center' },
  pressed: { opacity: 0.74 },
});
