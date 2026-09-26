import { demoPurchases } from '../../data/demoPurchases';
import { snapshotFor, LocalPurchaseStore, removeItem, replaceItems } from '../localPurchaseStore';
import { queueRemovedFiles, eligibleOrphans } from '../documentCleanup';
const purchase = { ...demoPurchases[0], documents:[{ id:'file',name:'receipt.pdf',kind:'receipt' as const,mimeType:'application/pdf',uri:'proofpilot-file:123-file' }] };
test('purchase removal persists cleanup intent in same write', async () => {
  const write = jest.fn(async () => {}); const store = new LocalPurchaseStore(write); store.snapshot=snapshotFor([purchase]);
  await store.mutate(s => removeItem(s,purchase.id,true));
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ items:[],deleted:[purchase.id],cleanup:['proofpilot-file:123-file'] }));
});
test('failed record save neither deletes file nor publishes cleanup',async () => {
  const store = new LocalPurchaseStore(async () => {throw new Error('quota');});store.snapshot=snapshotFor([purchase]);
  await expect(store.mutate(s => removeItem(s,purchase.id,false))).rejects.toThrow();
  expect(store.snapshot.items).toHaveLength(1);expect(store.snapshot.cleanup).toBeUndefined();
});
test('shared file remains while another purchase references it',() => {
  const before=snapshotFor([purchase,{...purchase,id:'other'}]);
  expect(queueRemovedFiles(before,removeItem(before,purchase.id,false)).cleanup).toBeUndefined();
});
test('bulk replacement preserves earlier failed cleanup intent',() => {
  const before={...snapshotFor([purchase]),cleanup:['proofpilot-file:old']};
  expect(queueRemovedFiles(before,replaceItems(before,[],true)).cleanup).toEqual(['proofpilot-file:old','proofpilot-file:123-file']);
});
test('orphan sweep ignores recent, referenced and unknown-age files',() => {
  const now=200000000;const files=[{uri:'old',createdAt:1},{uri:'recent',createdAt:now-1000},{uri:'referenced',createdAt:1},{uri:'unknown',createdAt:NaN}];
  expect(eligibleOrphans(files,new Set(['referenced']),now).map(f=>f.uri)).toEqual(['old']);
});
test('two stores reload under a shared lock, preventing lost tab writes',async () => {
  let disk=snapshotFor();let lock=Promise.resolve<unknown>(undefined);
  const exclusive=<T,>(f:()=>Promise<T>)=> {const task=lock.then(f);lock=task.catch(()=>undefined);return task;};
  const make=()=>new LocalPurchaseStore(async next=>{disk=next;},async()=>disk,exclusive);
  const a=make(),b=make();
  await Promise.all([a.mutate(s=>({...s,items:[...s.items,purchase]})),b.mutate(s=>({...s,items:[...s.items,{...purchase,id:'second'}]}))]);
  expect(disk.items).toHaveLength(2);
});
