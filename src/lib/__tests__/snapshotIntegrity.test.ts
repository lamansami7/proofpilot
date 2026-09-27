import { readSnapshot, snapshotFor, LocalPurchaseStore } from '../localPurchaseStore';
import { demoPurchases } from '../../data/demoPurchases';
const purchase = {...demoPurchases[0],documents:[],deadlines:[]};
test.each([
 [purchase,null],
 [purchase,{...purchase,name:''}],
 [purchase,{...purchase}],
 [{...purchase,documents:[null]}],
 [{...purchase,documents:'lost'}],
 [{...purchase,deadlines:[{date:'not-a-date'}]}],
].map(items => ({items})))('corrupt records are not silently normalized into data loss: %#', ({items}) => {
 expect(() => readSnapshot(JSON.stringify({...snapshotFor(),items}))).toThrow();
});
test.each([{pending:[null]},{deleted:[{}]},{cleanup:'not-an-array'},{cleanup:[null]}])('corrupt queues stop writes: %#', patch => {
 expect(()=>readSnapshot(JSON.stringify({...snapshotFor(),...patch}))).toThrow();
});
test('legacy optional properties still migrate without discarding records',()=>{
 expect(readSnapshot(JSON.stringify([{id:'legacy',name:'Receipt'}])).items[0]).toMatchObject({id:'legacy',name:'Receipt',documents:[]});
});
test('a failed reload prevents a subsequent mutation from overwriting corrupt disk data',async()=>{
 const write=jest.fn();const store=new LocalPurchaseStore(write,async()=>readSnapshot('{"version":2,"items":[null],"pending":[],"deleted":[]}'));
 await expect(store.mutate(s=>({...s,items:[purchase]}))).rejects.toThrow();expect(write).not.toHaveBeenCalled();
});

test.each(['documents','deadlines'] as const)('ambiguous %s IDs block mutations without overwriting disk',async collection=>{
 const child=collection==='documents'?{id:'repeated',name:'Original.pdf',kind:'receipt'}:{id:'repeated',date:'2099-01-01',type:'custom',title:'Original deadline'};
 const raw=JSON.stringify(snapshotFor([{...purchase,[collection]:[child,{...child}]}]));
 const write=jest.fn();const store=new LocalPurchaseStore(write,async()=>readSnapshot(raw));
 await expect(store.mutate(s=>({...s,items:[]}))).rejects.toThrow('duplicate');expect(write).not.toHaveBeenCalled();
});
test.each(['documents','deadlines'] as const)('blank %s IDs cannot make multiple entries indistinguishable',collection=>{
 const child=collection==='documents'?{id:' ',name:'Original.pdf',kind:'receipt'}:{id:' ',date:'2099-01-01',type:'custom',title:'Original deadline'};
 expect(()=>readSnapshot(JSON.stringify(snapshotFor([{...purchase,[collection]:[child]}])))).toThrow('IDs');
});
test('the same child ID in different purchases remains valid',()=>{
 const child={id:'scoped',name:'Original.pdf',kind:'receipt' as const,mimeType:'application/pdf'};
 expect(readSnapshot(JSON.stringify(snapshotFor([{...purchase,id:'one',documents:[child]},{...purchase,id:'two',documents:[child]}]))).items).toHaveLength(2);
});

test('invalid mutation output cannot poison an otherwise readable snapshot',async()=>{
 const write=jest.fn();const store=new LocalPurchaseStore(write);store.snapshot=snapshotFor([purchase]);const previous=store.snapshot;
 const child={id:'duplicate',name:'Original.pdf',kind:'receipt' as const,mimeType:'application/pdf'};
 await expect(store.mutate(s=>({...s,items:[{...purchase,documents:[child,child]}]}))).rejects.toThrow('duplicate');
 expect(write).not.toHaveBeenCalled();expect(store.snapshot).toBe(previous);
});
