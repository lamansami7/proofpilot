import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {usePurchaseStore} from '../hooks/usePurchaseStore';
import {demoPurchases} from '../data/demoPurchases';
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>jest.fn())}));
jest.mock('../lib/supabase',()=>({clientForAccount:jest.fn(async()=>{throw new Error('Offline test');})}));
let current:ReturnType<typeof usePurchaseStore>;let renderer:ReactTestRenderer;
function Harness({owner=null}:{owner?:string|null}){current=usePurchaseStore(owner);return null;}
beforeEach(async()=>{await AsyncStorage.clear();jest.clearAllMocks();});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
test('native hydration does not assume the global window implements DOM listeners',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 expect(current.hydrated).toBe(true);expect(current.storageError).toBeNull();
});
test('stale guest edit cannot recreate a deleted purchase',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 await act(async()=>{await current.upsert(demoPurchases[0]);});
 await act(async()=>{await current.remove(demoPurchases[0].id);});
 await act(async()=>{await expect(current.upsert(demoPurchases[0],true)).rejects.toThrow('removed');});
 expect(current.items).toEqual([]);
});
test('callbacks captured before an account switch cannot write into the new account',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 const oldSave=current.upsert;
 await act(async()=>{renderer.update(<Harness owner="test-account"/>);});
 await act(async()=>{await expect(oldSave(demoPurchases[0])).rejects.toThrow('account changed');});
 expect(current.items).toEqual([]);
});

test('bulk removal rereads disk instead of replacing records from a stale hook render',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 const sample={...demoPurchases[0],id:'sample'};
 await act(async()=>{await current.upsert(sample);});
 const newer={...demoPurchases[0],id:'new-other-tab',name:'Saved in the other tab'};
 await AsyncStorage.setItem('proofpilot.v1.purchases',JSON.stringify({version:2,items:[sample,newer],pending:[],deleted:[]}));
 await act(async()=>{await current.removeMany(['sample']);});
 expect(current.items).toHaveLength(1);expect(current.items[0]).toMatchObject({id:newer.id,name:newer.name});
});
