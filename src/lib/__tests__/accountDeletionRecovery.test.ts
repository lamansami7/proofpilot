import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumeConfirmedPurges } from '../accountDeletion';
import { storageKeyFor } from '../localPurchaseStore';
import { removeUnreferencedFile } from '../fileMaintenance';
jest.mock('../supabase', () => ({supabase:null}));
jest.mock('../fileMaintenance', () => ({removeUnreferencedFile:jest.fn(async () => {})}));
const key='proofpilot.v1.account-purge.owner';
const receipt='C'.repeat(43);
const fetchMock=jest.fn();
const originalFetch=global.fetch;
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); fetchMock.mockReset(); global.fetch=fetchMock; });
afterEach(() => { global.fetch=originalFetch; });
const status=(body:unknown) => fetchMock.mockResolvedValue({ok:true,json:async () => body});
test('unknown response is not silently treated as a successful purge', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original']}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled(); // no receipt, so no probe can even run
});
test('confirmed purge retries file removal before dropping its ledger', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:true,files:['managed']}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'cache');
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:0});
  expect(removeUnreferencedFile).toHaveBeenCalledWith('managed');
  expect(await AsyncStorage.getItem(key)).toBeNull();
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
test('nonboolean confirmation fails closed', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:'false',files:['original']}));
  await expect(resumeConfirmedPurges()).rejects.toThrow();
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
test('restart after a lost final response confirms via the matching server receipt, then purges', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'stale-cache');
  status({deleted:true,state:'completed',userId:'owner'});
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:0});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(removeUnreferencedFile).toHaveBeenCalledWith('original');
  expect(await AsyncStorage.getItem(key)).toBeNull();
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBeNull();
});
test('restart with a pending receipt stays blocked and keeps local data', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  status({deleted:false,state:'pending',userId:'owner'});
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
  expect((JSON.parse((await AsyncStorage.getItem(key))!)).confirmed).toBe(false);
});
test('restart with an unknown receipt stays blocked and keeps local data', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  status({deleted:false,state:'unknown'});
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
test('offline restart keeps the receipt ledger blocked instead of guessing', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect((JSON.parse((await AsyncStorage.getItem(key))!)).confirmed).toBe(false);
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
test('a receipt bound to another account id never unblocks this ledger', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  status({deleted:true,state:'completed',userId:'intruder'});
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
test('a malformed receipt ledger fails closed without any probe', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original'],receipt:'broken'}));
  await expect(resumeConfirmedPurges()).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
