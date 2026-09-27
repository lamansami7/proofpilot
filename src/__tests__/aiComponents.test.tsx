/**
 * AI trust-boundary component tests: the UI must never fabricate an answer,
 * must label drafts honestly, and must recover cleanly from malformed responses.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PurchaseAssistant } from '../components/purchaseAssistant';
import { ClaimGenerator } from '../components/claimGenerator';
import { AIServiceError, type AIService, type PurchaseAnswer, type ClaimType } from '../services/ai/AIService';
import { demoPurchases } from '../data/demoPurchases';
import type { Purchase } from '../types/purchase';

const purchase = demoPurchases[0] as Purchase;

function flatten(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join('');
  if (React.isValidElement(value)) return flatten((value.props as { children?: unknown }).children);
  return '';
}

function hasText(renderer: TestRenderer.ReactTestRenderer, needle: string): boolean {
  return renderer.root.findAllByType(Text).map((node) => flatten(node.props.children)).some((value) => value.includes(needle));
}

function press(renderer: TestRenderer.ReactTestRenderer, label: string): void {
  const targets = renderer.root.findAll((node) => node.props.accessibilityLabel === label || (typeof node.props.label === 'string' && node.props.label === label));
  expect(targets.length).toBeGreaterThan(0);
  act(() => { (targets[0].props.onPress as () => void)(); });
}

function service(overrides: Partial<AIService> = {}): AIService {
  return {
    isConfigured: true,
    extractReceipt: jest.fn(),
    analyzeWarranty: jest.fn(),
    analyzeReturnPolicy: jest.fn(),
    answerPurchaseQuestion: jest.fn(),
    generateClaim: jest.fn(),
    summarizeDocument: jest.fn(),
    ...overrides,
  } as AIService;
}

describe('Ask ProofPilot trust boundary', () => {
  test('unconfigured assistant explains itself and generates nothing', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={service({ isConfigured: false })} />); });
    expect(hasText(renderer, 'AI answers are not connected')).toBe(true);
    expect(hasText(renderer, 'AI-GENERATED GUIDANCE')).toBe(false);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  test('labels AI answers and cites the saved facts they used', async () => {
    const assistant = service({
      answerPurchaseQuestion: jest.fn().mockResolvedValue({
        answer: 'Your saved return deadline is still ahead.\n\nConfirm the policy with the merchant.',
        knownFacts: ['Return deadline: Sep 30, 2026'],
        missingInformation: ['Receipt'],
      }),
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={assistant} />); });
    await act(async () => { press(renderer, 'Ask: Can I still return this?'); });
    expect(hasText(renderer, 'AI-GENERATED GUIDANCE')).toBe(true);
    expect(hasText(renderer, 'Based on: Merchant: Best Buy')).toBe(true); // cites locally saved facts, not server-supplied ones
    expect(hasText(renderer, 'Your saved return deadline is still ahead.')).toBe(true);
    expect(assistant.answerPurchaseQuestion).toHaveBeenCalledWith(
      'Can I still return this?',
      expect.objectContaining({ productName: purchase.name }),
    );
  });

  test('a failed question returns to the composer with an honest error — no fabricated answer', async () => {
    const assistant = service({
      answerPurchaseQuestion: jest.fn().mockRejectedValue(new AIServiceError('invalid', 'invalid_response')),
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={assistant} />); });
    await act(async () => { press(renderer, 'Ask: What documents do I need?'); });
    expect(hasText(renderer, 'could not answer right now')).toBe(true);
    expect(hasText(renderer, 'no answer was generated') || hasText(renderer, 'No answer')).toBe(true);
    expect(hasText(renderer, 'AI-GENERATED GUIDANCE')).toBe(false);
    const inputs = renderer.root.findAllByType(TextInput);
    expect(inputs[inputs.length - 1].props.value).toBe('What documents do I need?');
    expect(hasText(renderer, 'Retry last question')).toBe(true);
  });
});

describe('Claim generator trust boundary', () => {
  test('template drafts are labeled as templates and never sent', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ClaimGenerator purchase={purchase} assistant={service({ isConfigured: false })} />); });
    await act(async () => { press(renderer, 'Create from saved facts (no AI)'); });
    expect(hasText(renderer, 'TEMPLATE DRAFT')).toBe(true);
    expect(hasText(renderer, 'never sends this claim for you')).toBe(true);
    const editors = renderer.root.findAllByType(TextInput);
    expect(editors.length).toBeGreaterThan(0);
    expect(String(editors[0].props.value)).toContain('Nothing has been submitted');
  });

  test('malformed AI responses surface an error without inventing a draft', async () => {
    const assistant = service({
      generateClaim: jest.fn().mockRejectedValue(new AIServiceError('bad shape', 'invalid_response')),
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ClaimGenerator purchase={purchase} assistant={assistant} />); });
    await act(async () => { press(renderer, 'Generate return claim draft with AI'); });
    expect(hasText(renderer, 'could not create a draft right now')).toBe(true);
    expect(hasText(renderer, 'TEMPLATE DRAFT') || hasText(renderer, 'AI-GENERATED DRAFT')).toBe(false);
    expect(hasText(renderer, 'Create from saved facts (no AI)')).toBe(true);
  });

  test('AI drafts are labeled AI-generated and keep verified facts visible', async () => {
    const assistant = service({
      generateClaim: jest.fn().mockResolvedValue({ draft: 'Dear Best Buy, …', knownFacts: ['Merchant: Best Buy'], missingInformation: [] }),
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ClaimGenerator purchase={purchase} assistant={assistant} />); });
    await act(async () => { press(renderer, 'Generate return claim draft with AI'); });
    expect(hasText(renderer, 'AI-GENERATED')).toBe(true);
    expect(hasText(renderer, 'may contain errors')).toBe(true);
    expect(hasText(renderer, 'SAVED PURCHASE FACTS')).toBe(true);
    const draftType: ClaimType = 'return';
    expect(assistant.generateClaim).toHaveBeenCalledWith(expect.objectContaining({ productName: purchase.name }), draftType, undefined);
  });
});

test('failed AI question preserves a newer unsent composer draft',async()=>{
 let reject!:(reason:Error)=>void;
 const assistant=service({answerPurchaseQuestion:jest.fn(()=>new Promise((_resolve,no)=>{reject=no;}))});
 let renderer!:TestRenderer.ReactTestRenderer;act(()=>{renderer=TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={assistant}/>);});
 press(renderer,'Ask: Can I still return this?');
 act(()=>renderer.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Ask a question about this purchase')!.props.onChangeText('My next unsent question'));
 await act(async()=>{reject(new Error('Network failed'));});
 expect(renderer.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel==='Ask a question about this purchase')!.props.value).toBe('My next unsent question');
 expect(hasText(renderer,'Retry last question')).toBe(true);act(()=>renderer.unmount());
});
test('duplicate assistant activation in one frame starts only one request',async()=>{
 let resolve!:(value:PurchaseAnswer)=>void;const assistant=service({answerPurchaseQuestion:jest.fn(()=>new Promise(yes=>{resolve=yes;}))});
 let renderer!:TestRenderer.ReactTestRenderer;act(()=>{renderer=TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={assistant}/>);});
 const action=renderer.root.findAll(n=>n.props.accessibilityLabel==='Ask: Can I still return this?')[0].props.onPress;
 act(()=>{action();action();});expect(assistant.answerPurchaseQuestion).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve({answer:'Saved facts only',knownFacts:[],missingInformation:[]});});act(()=>renderer.unmount());
});

test('a late answer cannot leak into a different purchase conversation',async()=>{
 let resolve!:(value:PurchaseAnswer)=>void;const assistant=service({answerPurchaseQuestion:jest.fn(()=>new Promise(yes=>{resolve=yes;}))});
 let renderer!:TestRenderer.ReactTestRenderer;act(()=>{renderer=TestRenderer.create(<PurchaseAssistant purchase={purchase} assistant={assistant}/>);});
 press(renderer,'Ask: Can I still return this?');
 act(()=>renderer.update(<PurchaseAssistant purchase={{...purchase,id:'different-purchase',name:'Another purchase',merchant:'Different merchant'}} assistant={assistant}/>));
 await act(async()=>{resolve({answer:'Answer for the old record',knownFacts:[],missingInformation:[]});});
 expect(hasText(renderer,'Answer for the old record')).toBe(false);expect(hasText(renderer,'Different merchant')).toBe(true);act(()=>renderer.unmount());
});
