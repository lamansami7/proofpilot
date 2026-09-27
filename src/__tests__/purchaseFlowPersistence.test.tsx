import React from 'react';
import {Pressable} from 'react-native';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import * as DocumentPicker from 'expo-document-picker';
import {PurchaseFlow} from '../components/purchaseFlow';
import {Button} from '../components/ui';
import {demoPurchases} from '../data/demoPurchases';
import {persistDocumentUri} from '../lib/documents';
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('../lib/documents',()=>({persistDocumentUri:jest.fn(async()=> 'proofpilot-file:test-copy')}));
const base={visible:true,initialPurchase:null,merchants:[],defaultReturnDays:30,onClose:jest.fn(),onSave:jest.fn(),onDone:jest.fn()};
let renderer:ReactTestRenderer;
afterEach(()=>{if(renderer)act(()=>renderer.unmount());jest.clearAllMocks();});
function button(label:string){return renderer.root.findAllByType(Button).find(b=>b.props.label===label)!;}
test('picker results from a closed form never populate a new purchase form',async()=>{
 let resolve!:(result:DocumentPicker.DocumentPickerResult)=>void;
 jest.mocked(DocumentPicker.getDocumentAsync).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 await act(async()=>{renderer=create(<PurchaseFlow {...base}/>);});
 let pick!:Promise<void>;act(()=>{pick=renderer.root.findAllByType(Pressable).find(p=>p.props.accessibilityLabel==='Upload a receipt or document')!.props.onPress();});
 await act(async()=>{renderer.update(<PurchaseFlow {...base} visible={false}/>);});
 await act(async()=>{renderer.update(<PurchaseFlow {...base}/>);});
 await act(async()=>{resolve({canceled:false,assets:[{name:'old-receipt.png',uri:'blob:old',mimeType:'image/png',size:25}]});await pick;});
 expect(persistDocumentUri).not.toHaveBeenCalled();
 expect(renderer.root.findAllByType(Pressable).some(p=>p.props.accessibilityLabel==='Enter details manually')).toBe(true);
});
test('duplicate save activation commits only one purchase',async()=>{
 let resolve!:()=>void;const save=jest.fn(()=>new Promise<void>(r=>{resolve=r;}));
 await act(async()=>{renderer=create(<PurchaseFlow {...base} initialPurchase={demoPurchases[0]} onSave={save}/>);});
 await act(async()=>{button('Review purchase').props.onPress();});
 const commit=button('Save purchase').props.onPress;let first!:Promise<void>;let second!:Promise<void>;
 act(()=>{first=commit();second=commit();});
 expect(save).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve();await Promise.all([first,second]);});
});
