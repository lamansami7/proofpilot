import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { deleteCurrentAccount, resumeConfirmedPurges } from '../accountDeletion';
import { storageKeyFor, snapshotFor } from '../localPurchaseStore';
import { removeUnreferencedFile } from '../fileMaintenance';
jest.mock('../supabase', () => {
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED = 'true';
  return {supabase:{auth:{getUser:jest.fn(),getSession:jest.fn(),signInWithPassword:jest.fn(),signOut:jest.fn()}}};
});
jest.mock('../fileMaintenance', () => ({removeUnreferencedFile:jest.fn(async () => {})}));
const auth = supabase!.auth;
const key = 'proofpilot.v1.account-purge.owner';
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalWrite = (AsyncStorage.setItem as jest.Mock).getMockImplementation();
const ledger = async () => JSON.parse((await AsyncStorage.getItem(key))!);
beforeEach(async () => {
  jest.clearAllMocks(); fetchMock.mockReset(); (AsyncStorage.setItem as jest.Mock).mockReset().mockImplementation(originalWrite!); await AsyncStorage.clear(); global.fetch = fetchMock;
  (auth.getUser as jest.Mock).mockResolvedValue({data:{user:{id:'owner',email:'qa@example.test'}},error:null});
  (auth.signInWithPassword as jest.Mock).mockResolvedValue({data:{user:{id:'owner'},session:{access_token:'test-only'}},error:null});
  (auth.getSession as jest.Mock).mockResolvedValue({data:{session:{user:{id:'owner'}}},error:null});
  (auth.signOut as jest.Mock).mockResolvedValue({error:null});
  fetchMock.mockResolvedValue({ok:true,json:async () => ({deleted:true})});
  await AsyncStorage.setItem(storageKeyFor('owner'),JSON.stringify({...snapshotFor(),cleanup:['managed']}));
});
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });
test('wrong password never starts remote deletion or writes a ledger', async () => {
  (auth.signInWithPassword as jest.Mock).mockResolvedValue({data:{},error:new Error('denied')});
  await expect(deleteCurrentAccount('not-stored')).rejects.toThrow('Password verification');
  expect(fetchMock).not.toHaveBeenCalled(); expect(await AsyncStorage.getItem(key)).toBeNull();
});
test('failed durable intent write prevents any remote deletion', async () => {
  jest.spyOn(AsyncStorage,'setItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(deleteCurrentAccount('not-stored')).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['network','invalid JSON','not confirmed','server error'])('%s retains unknown ledger and local data', async failure => {
  if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('lost response'));
  else fetchMock.mockResolvedValueOnce({ok:failure !== 'server error',json:async () => {
    if (failure === 'invalid JSON') throw new Error('invalid'); return {deleted:false};
  }});
  await expect(deleteCurrentAccount('not-stored')).rejects.toThrow();
  expect((await ledger()).confirmed).toBe(false);
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).not.toBeNull();
  expect(removeUnreferencedFile).not.toHaveBeenCalled(); expect(auth.signOut).not.toHaveBeenCalled();
});
test('returned sign-out failure preserves confirmed ledger and cache for retry', async () => {
  (auth.signOut as jest.Mock).mockResolvedValueOnce({error:new Error('secure storage failed')});
  expect(await deleteCurrentAccount('not-stored')).toEqual({localCleanupPending:true});
  expect((await ledger()).confirmed).toBe(true);
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).not.toBeNull();
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:0});
  expect(await AsyncStorage.getItem(key)).toBeNull();
});
test('file failure retains confirmation and resumes without deleting remotely twice', async () => {
  (removeUnreferencedFile as jest.Mock).mockRejectedValueOnce(new Error('file busy'));
  expect(await deleteCurrentAccount('not-stored')).toEqual({localCleanupPending:true});
  expect((await ledger()).confirmed).toBe(true);
  await resumeConfirmedPurges(); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(key)).toBeNull();
});
test('confirmation write failure never clears data or claims complete local cleanup', async () => {
  const write = originalWrite!;
  jest.spyOn(AsyncStorage,'setItem').mockImplementation(async (key,value) => {
    if (key.includes('account-purge') && JSON.parse(value).confirmed) throw new Error('disk full');
    return write(key,value);
  });
  expect(await deleteCurrentAccount('not-stored')).toEqual({localCleanupPending:true});
  expect((await ledger()).confirmed).toBe(false); expect(auth.signOut).not.toHaveBeenCalled();
});
test('purging a confirmed old account does not sign out the current account', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:true,files:[]}));
  (auth.getSession as jest.Mock).mockResolvedValue({data:{session:{user:{id:'other'}}},error:null});
  await resumeConfirmedPurges(); expect(auth.signOut).not.toHaveBeenCalled();
});
test('malformed previous ledger never initiates remote deletion', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'other',confirmed:false,files:[]}));
  await expect(deleteCurrentAccount('not-stored')).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
});
