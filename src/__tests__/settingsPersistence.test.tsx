import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAppSettings} from '../hooks/useAppSettings';
let current:ReturnType<typeof useAppSettings>;let renderer:ReactTestRenderer;
function Harness(){current=useAppSettings();return null;}
beforeEach(async()=>{await AsyncStorage.clear();jest.clearAllMocks();});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
test('settings patch rereads disk and preserves a different tab change',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 await AsyncStorage.setItem('proofpilot.v1.settings',JSON.stringify({defaultReturnWindowDays:90,onboardingCompleted:true}));
 await act(async()=>{await current.update({sampleBannerDismissed:true});});
 expect(current.settings).toEqual({defaultReturnWindowDays:90,onboardingCompleted:true,sampleBannerDismissed:true});
});
test('corrupt settings cannot be overwritten by a subsequent update',async()=>{
 await AsyncStorage.setItem('proofpilot.v1.settings','{broken');
 await act(async()=>{renderer=create(<Harness/>);});
 await act(async()=>{await expect(current.update({onboardingCompleted:true})).rejects.toThrow();});
 expect(await AsyncStorage.getItem('proofpilot.v1.settings')).toBe('{broken');
 expect(current.error).toContain('not saved');
});
test('rapid queued settings patches preserve both successful changes',async()=>{
 await act(async()=>{renderer=create(<Harness/>);});
 await act(async()=>{await Promise.all([current.update({defaultReturnWindowDays:60}),current.update({onboardingCompleted:true})]);});
 expect(current.settings).toMatchObject({defaultReturnWindowDays:60,onboardingCompleted:true});
});
