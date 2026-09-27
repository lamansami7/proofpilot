import React from 'react';
import {Text, TextInput, Pressable, Share} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {ClaimGenerator} from '../components/claimGenerator';
import {Button} from '../components/ui';
import {demoPurchases} from '../data/demoPurchases';
import type {AIService, ClaimDraft} from '../services/ai/AIService';
const assistant = (): AIService => ({isConfigured:true,extractReceipt:jest.fn(),analyzeWarranty:jest.fn(),analyzeReturnPolicy:jest.fn(),answerPurchaseQuestion:jest.fn(),generateClaim:jest.fn(),summarizeDocument:jest.fn()});
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};}
let renderer:ReactTestRenderer;
function render(service:AIService,onSaveDraft=jest.fn(async()=>{})) {act(()=>{renderer=create(<ClaimGenerator purchase={demoPurchases[0]} assistant={service} onSaveDraft={onSaveDraft}/>);});}
function button(label:string) {return renderer.root.findAllByType(Button).find(node=>node.props.label===label)!;}
function press(label:string) {let task:Promise<void>|undefined;act(()=>{task=button(label).props.onPress();});return task;}
function editor(){return renderer.root.findAllByType(TextInput).find(node=>node.props.accessibilityLabel==='Editable claim draft')!;}
function selectWarranty(){act(()=>renderer.root.findAllByType(Pressable).find(node=>node.props.accessibilityHint==='Switch to warranty claim')!.props.onPress());}
function text(){return renderer.root.findAllByType(Text).map(node=>node.props.children).flat().join(' ');}
afterEach(()=>{act(()=>renderer.unmount());jest.restoreAllMocks();});

test.each(['resolve','reject'] as const)('late AI %s cannot replace or hide a user-created template',async outcome=>{
 const request=deferred<ClaimDraft>();const service=assistant();service.generateClaim=jest.fn(()=>request.promise);render(service);
 const pending=press('Generate return claim draft with AI');press('Create from saved facts (no AI)');const template=editor().props.value;
 await act(async()=>{if(outcome==='resolve')request.resolve({draft:'Late AI text',knownFacts:[],missingInformation:[]});else request.reject(new Error('Late failure'));await pending;});
 expect(editor().props.value).toBe(template);expect(text()).toContain('TEMPLATE');
});
test('changing claim type invalidates an in-flight response',async()=>{
 const request=deferred<ClaimDraft>();const service=assistant();service.generateClaim=jest.fn(()=>request.promise);render(service);
 const pending=press('Generate return claim draft with AI');selectWarranty();
 await act(async()=>{request.resolve({draft:'Wrong return claim',knownFacts:[],missingInformation:[]});await pending;});
 expect(editor()).toBeUndefined();expect(button('Generate warranty claim draft with AI')).toBeDefined();
});
test('same-frame duplicate generation starts only one request',async()=>{
 const request=deferred<ClaimDraft>();const service=assistant();service.generateClaim=jest.fn(()=>request.promise);render(service);
 const generate=button('Generate return claim draft with AI').props.onPress;let pending!:Promise<void>;
 act(()=>{pending=generate();void generate();});expect(service.generateClaim).toHaveBeenCalledTimes(1);
 await act(async()=>{request.resolve({draft:'Draft',knownFacts:[],missingInformation:[]});await pending;});
});
test('editing while saving does not mark the newer text as saved',async()=>{
 const saving=deferred<void>();const save=jest.fn(()=>saving.promise);render(assistant(),save);press('Create from saved facts (no AI)');
 const pending=press('Save to Vault');act(()=>editor().props.onChangeText('New unsaved text'));
 await act(async()=>{saving.resolve();await pending;});
 expect(editor().props.value).toBe('New unsaved text');expect(text()).not.toContain('Draft saved to Vault.');expect(button('Save to Vault').props.disabled).toBe(false);
});
test('same-frame duplicate save creates only one Vault document',async()=>{
 const saving=deferred<void>();const save=jest.fn(()=>saving.promise);render(assistant(),save);press('Create from saved facts (no AI)');
 const commit=button('Save to Vault').props.onPress;let pending!:Promise<void>;act(()=>{pending=commit();void commit();});
 expect(save).toHaveBeenCalledTimes(1);await act(async()=>{saving.resolve();await pending;});
});
test('a new claim type does not inherit saved status',async()=>{
 render(assistant());press('Create from saved facts (no AI)');await act(async()=>{await press('Save to Vault');});
 expect(button('Save to Vault').props.disabled).toBe(true);selectWarranty();press('Create from saved facts (no AI)');
 expect(button('Save to Vault').props.disabled).toBe(false);expect(text()).not.toContain('Draft saved to Vault.');
});
test('failed regeneration keeps the previous editable text and source',async()=>{
 const service=assistant();service.generateClaim=jest.fn(async()=>{throw new Error('Offline');});render(service);press('Create from saved facts (no AI)');
 act(()=>editor().props.onChangeText('Reviewed manual draft'));await act(async()=>{await press('Regenerate');});
 expect(editor().props.value).toBe('Reviewed manual draft');expect(text()).toContain('TEMPLATE');expect(text()).toContain('existing text has been kept');
});
test('sharing failures give a recovery message instead of disappearing',async()=>{
 jest.spyOn(Share,'share').mockRejectedValue(new Error('Unsupported'));render(assistant());press('Create from saved facts (no AI)');
 await act(async()=>{await press('Share / export');});expect(text()).toContain('Select the text manually');
});
test('empty edited drafts cannot be saved',()=>{
 const save=jest.fn(async()=>{});render(assistant(),save);press('Create from saved facts (no AI)');act(()=>editor().props.onChangeText('   '));
 expect(button('Save to Vault').props.disabled).toBe(true);press('Save to Vault');expect(save).not.toHaveBeenCalled();
});

test('a late generation cannot populate a different purchase draft',async()=>{
 const request=deferred<ClaimDraft>();const service=assistant();service.generateClaim=jest.fn(()=>request.promise);render(service);
 const pending=press('Generate return claim draft with AI');
 act(()=>renderer.update(<ClaimGenerator purchase={{...demoPurchases[0],id:'another-record'}} assistant={service}/>));
 await act(async()=>{request.resolve({draft:'Old purchase draft',knownFacts:[],missingInformation:[]});await pending;});
 expect(editor()).toBeUndefined();expect(text()).not.toContain('Old purchase draft');
});
