import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import * as Picker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {SettingsScreen} from '../components/settingsScreen';
import {Button} from '../components/ui';
import {createBackup} from '../lib/backup';
import {demoPurchases} from '../data/demoPurchases';
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('expo-file-system',()=>({cacheDirectory:'file:///cache/',readAsStringAsync:jest.fn(),writeAsStringAsync:jest.fn(),deleteAsync:jest.fn()}));
jest.mock('expo-sharing',()=>({isAvailableAsync:jest.fn(),shareAsync:jest.fn()}));
let renderer:ReactTestRenderer;const notify=jest.fn();const restore=jest.fn();
const button=(name:string)=>renderer.root.findAllByType(Button).find(n=>n.props.label===name)!;
async function press(name:string){await act(async()=>{await button(name).props.onPress();});}
beforeEach(()=>{
 jest.clearAllMocks();jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);jest.mocked(Sharing.shareAsync).mockResolvedValue();jest.mocked(FileSystem.deleteAsync).mockResolvedValue();
 jest.mocked(Picker.getDocumentAsync).mockResolvedValue({canceled:false,assets:[{name:'backup.json',uri:'file:///backup.json',size:1000}]});
 jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(JSON.stringify(createBackup([demoPurchases[0]])));
 act(()=>{renderer=create(<SettingsScreen items={[demoPurchases[0]]} settings={{defaultReturnWindowDays:30,sampleBannerDismissed:false,onboardingCompleted:true}} updateSettings={jest.fn()} userEmail={null} configured={false} syncStatus="local" syncError={null} online onSignOut={jest.fn()} onRestoreSamples={jest.fn()} onDeleteAll={jest.fn()} onNotify={notify} onRestoreBackup={restore}/>);});
});
afterEach(()=>act(()=>renderer.unmount()));
test('a rejected replacement backup cannot restore the previously selected file',async()=>{
 await press('Choose backup');expect(button('Confirm restore')).toBeDefined();
 jest.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('not JSON');await press('Choose backup');
 expect(button('Confirm restore')).toBeUndefined();expect(restore).not.toHaveBeenCalled();expect(notify).toHaveBeenCalledWith(expect.stringContaining('Invalid backup'),'danger');
});
test('same-frame duplicate backup selection opens only one picker',async()=>{
 let resolve!:(value:Picker.DocumentPickerResult)=>void;jest.mocked(Picker.getDocumentAsync).mockReturnValueOnce(new Promise(yes=>{resolve=yes;}));
 const choose=button('Choose backup').props.onPress;let pending!:Promise<void>;act(()=>{pending=choose();void choose();});
 expect(Picker.getDocumentAsync).toHaveBeenCalledTimes(1);await act(async()=>{resolve({canceled:true,assets:null});await pending;});
});
test('failed native share still deletes its temporary personal-data export',async()=>{
 jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('Sharing failed'));await press('Export');
 const path=jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0][0];
 expect(path).toMatch(/^file:\/\/\/cache\/proofpilot-export-.+\.json$/);
 expect(FileSystem.deleteAsync).toHaveBeenCalledWith(path,{idempotent:true});expect(notify).toHaveBeenCalledWith('Export failed — your data has not changed.');
});
test('duplicate export is guarded and later exports use independent temporary files',async()=>{
 let resolve!:()=>void;jest.mocked(Sharing.shareAsync).mockReturnValueOnce(new Promise<void>(yes=>{resolve=yes;}));
 const exportFile=button('Export').props.onPress;let pending!:Promise<void>;
 act(()=>{pending=exportFile();void exportFile();});await act(async()=>{});
 expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve();await pending;});await press('Export');
 const paths=jest.mocked(FileSystem.writeAsStringAsync).mock.calls.map(args=>args[0]);expect(new Set(paths).size).toBe(2);expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
});
test('cleanup failure is surfaced without claiming the temporary copy was removed',async()=>{
 jest.mocked(FileSystem.deleteAsync).mockRejectedValueOnce(new Error('Disk unavailable'));await press('Export');
 expect(notify).toHaveBeenCalledWith(expect.stringContaining('Temporary export cleanup failed'),'danger');
});
