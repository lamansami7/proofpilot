import {indexedDB,IDBDatabase} from 'fake-indexeddb';
import {Blob as NodeBlob} from 'node:buffer';
import {listBrowserDocuments,readBrowserDocument} from '../browserDocuments';
const prior=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
const priorBlob=Object.getOwnPropertyDescriptor(globalThis,'Blob');
beforeAll(()=>{
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:indexedDB});
 Object.defineProperty(globalThis,'Blob',{configurable:true,value:NodeBlob});
});
afterAll(()=>{
 if(prior)Object.defineProperty(globalThis,'indexedDB',prior);else Reflect.deleteProperty(globalThis,'indexedDB');
 if(priorBlob)Object.defineProperty(globalThis,'Blob',priorBlob);else Reflect.deleteProperty(globalThis,'Blob');
});
afterEach(()=>jest.restoreAllMocks());
test('transaction setup failure closes the open connection',async()=>{
 await listBrowserDocuments();
 const closed=jest.spyOn(IDBDatabase.prototype,'close');
 jest.spyOn(IDBDatabase.prototype,'transaction').mockImplementationOnce(()=>{throw new Error('Schema unavailable');});
 await expect(listBrowserDocuments()).rejects.toThrow('Schema unavailable');
 expect(closed).toHaveBeenCalledTimes(1);
});
test('corrupt attachment values are rejected instead of returned as files',async()=>{
 await new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open('proofpilot-documents',1);r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result;const tx=db.transaction('files','readwrite');tx.objectStore('files').put('not a Blob','corrupt');tx.oncomplete=()=>{db.close();resolve();};};
 });
 await expect(readBrowserDocument('proofpilot-file:corrupt')).rejects.toThrow('unreadable');
});

test('late success after a blocked open closes the abandoned database',async()=>{
 const close=jest.fn();
 const request={result:{close},onblocked:null as null|(()=>void),onsuccess:null as null|(()=>void)};
 jest.spyOn(indexedDB,'open').mockReturnValue(request as unknown as IDBOpenDBRequest);
 const pending=listBrowserDocuments();
 request.onblocked!();await expect(pending).rejects.toThrow('blocked');
 request.onsuccess!();expect(close).toHaveBeenCalledTimes(1);
});

test.each([
 ['html',new NodeBlob(['<h1>Untrusted</h1>'],{type:'text/html'})],
 ['empty',new NodeBlob([],{type:'image/png'})],
 ['oversized',new NodeBlob([new Uint8Array(20*1024*1024+1)],{type:'image/png'})],
])('rejects a corrupted %s Blob read from persistent storage',async(key,blob)=>{
 await listBrowserDocuments();
 await new Promise<void>((resolve,reject)=>{
  const r=indexedDB.open('proofpilot-documents',1);r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result;const tx=db.transaction('files','readwrite');tx.objectStore('files').put(blob,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 });
 await expect(readBrowserDocument(`proofpilot-file:${key}`)).rejects.toThrow();
});
