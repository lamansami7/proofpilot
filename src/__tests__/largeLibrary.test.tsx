import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {Dashboard} from '../components/dashboard';
import {VaultScreen} from '../components/vaultScreen';
import {DeadlineRadar} from '../components/deadlineRadar';
import {Pressable} from 'react-native';
import {Button,Card,IconButton,Input} from '../components/ui';
import {demoPurchases} from '../data/demoPurchases';
import {normalizedDeadlines} from '../lib/purchaseSelectors';
const items=Array.from({length:80},(_,i)=>({...demoPurchases[0],id:`purchase-${i}`,name:`Purchase ${i}`,documents:[{id:'shared-child-id',kind:'receipt' as const,name:`Receipt ${i}.png`,mimeType:'image/png'}],deadlines:[{id:'shared-child-id',title:`Deadline ${i}`,date:'2099-12-31',type:'custom' as const}]}));
let renderer:ReactTestRenderer;
afterEach(()=>{act(()=>renderer.unmount());jest.restoreAllMocks();});
const more=()=>renderer.root.findAllByType(Button).find(n=>n.props.label.startsWith('Show more'))!;
test('Vault bounds initial rows, retains scoped IDs, and can reveal/search the last document',()=>{
 const errors=jest.spyOn(console,'error');act(()=>{renderer=create(<VaultScreen items={items} onAdd={jest.fn()} onOpenPurchase={jest.fn()} onUpdatePurchase={jest.fn()}/>);});
 const rows=()=>renderer.root.findAllByType(IconButton).filter(n=>n.props.label.startsWith('Open Receipt'));
 expect(rows()).toHaveLength(50);act(()=>more().props.onPress());expect(rows()).toHaveLength(80);
 act(()=>renderer.root.findAllByType(Input).find(n=>n.props.accessibilityLabel==='Search documents')!.props.onChangeText('Receipt 79'));
 expect(rows()).toHaveLength(1);expect(rows()[0].props.label).toBe('Open Receipt 79.png');expect(errors).not.toHaveBeenCalled();
});
test('Deadline Radar bounds each group and reveals all records without duplicate React keys',()=>{
 const errors=jest.spyOn(console,'error');act(()=>{renderer=create(<DeadlineRadar deadlines={normalizedDeadlines(items)} onUpdate={jest.fn()} onOpenPurchase={jest.fn()} onAdd={jest.fn()}/>);});
 expect(renderer.root.findAllByType(Pressable).filter(node=>node.props.accessibilityLabel?.startsWith('View '))).toHaveLength(50);act(()=>more().props.onPress());expect(renderer.root.findAllByType(Pressable).filter(node=>node.props.accessibilityLabel?.startsWith('View '))).toHaveLength(80);
 expect(more()).toBeUndefined();expect(errors).not.toHaveBeenCalled();
});

test('dashboard rows scope deadline IDs to their purchase',()=>{
 const errors=jest.spyOn(console,'error');const noop=jest.fn();
 act(()=>{renderer=create(<Dashboard items={items.slice(0,3)} isPhone={false} sampleVisible={false} aiConfigured={false} onAdd={noop} onOpen={noop} onPurchases={noop} onDeadlines={noop} onVault={noop} onDismissSample={noop} onClearSamples={noop} onRestoreSamples={noop}/>);});
 expect(renderer.root.findAllByType(Card).filter(node=>/Deadline \d+ for Purchase/.test(node.props.accessibilityLabel ?? ''))).toHaveLength(3);
 expect(errors).not.toHaveBeenCalled();
});
