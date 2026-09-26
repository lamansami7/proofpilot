import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumeConfirmedPurges } from '../accountDeletion';
import { storageKeyFor } from '../localPurchaseStore';
import { removeUnreferencedFile } from '../fileMaintenance';
jest.mock('../supabase', () => ({supabase:null}));
jest.mock('../fileMaintenance', () => ({removeUnreferencedFile:jest.fn(async () => {})}));
const key='proofpilot.v1.account-purge.owner';
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });
test('unknown response is not silently treated as a successful purge', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:false,files:['original']}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'keep');
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:1});
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBe('keep');
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
test('confirmed purge retries file removal before dropping its ledger', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:true,files:['managed']}));
  await AsyncStorage.setItem(storageKeyFor('owner'),'cache');
  expect(await resumeConfirmedPurges()).toEqual({unconfirmed:0});
  expect(removeUnreferencedFile).toHaveBeenCalledWith('managed');
  expect(await AsyncStorage.getItem(key)).toBeNull();
  expect(await AsyncStorage.getItem(storageKeyFor('owner'))).toBeNull();
});
test('nonboolean confirmation fails closed', async () => {
  await AsyncStorage.setItem(key,JSON.stringify({userId:'owner',confirmed:'false',files:['original']}));
  await expect(resumeConfirmedPurges()).rejects.toThrow();
  expect(removeUnreferencedFile).not.toHaveBeenCalled();
});
