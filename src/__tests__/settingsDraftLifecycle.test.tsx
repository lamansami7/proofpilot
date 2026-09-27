import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {SettingsScreen} from '../components/settingsScreen';
import {Button,Input} from '../components/ui';
const props={items:[],settings:{defaultReturnWindowDays:30,sampleBannerDismissed:false,onboardingCompleted:true},updateSettings:jest.fn(async()=>{}),userEmail:null,configured:false,syncStatus:'local' as const,syncError:null,online:true,onSignOut:jest.fn(),onRestoreSamples:jest.fn(),onDeleteAll:jest.fn(),onNotify:jest.fn()};
let renderer:ReactTestRenderer;
const input=()=>renderer.root.findAllByType(Input).find(n=>n.props.accessibilityLabel==='Suggested return window in days')!;
const save=()=>renderer.root.findAllByType(Button).find(n=>n.props.label==='Save')!;
afterEach(()=>{act(()=>renderer.unmount());jest.clearAllMocks();});
test('remote settings update refreshes clean input without erasing an unsaved draft',()=>{
 act(()=>{renderer=create(<SettingsScreen {...props}/>);});
 act(()=>renderer.update(<SettingsScreen {...props} settings={{...props.settings,defaultReturnWindowDays:45}}/>));expect(input().props.value).toBe('45');
 act(()=>input().props.onChangeText('90'));
 act(()=>renderer.update(<SettingsScreen {...props} settings={{...props.settings,defaultReturnWindowDays:60}}/>));expect(input().props.value).toBe('90');
});
test('a completed settings save does not erase a newly typed value',async()=>{
 let resolve!:()=>void;const update=jest.fn(()=>new Promise<void>(yes=>{resolve=yes;}));
 act(()=>{renderer=create(<SettingsScreen {...props} updateSettings={update}/>);});act(()=>input().props.onChangeText('45'));
 let pending!:Promise<void>;act(()=>{pending=save().props.onPress();});act(()=>input().props.onChangeText('90'));
 await act(async()=>{renderer.update(<SettingsScreen {...props} updateSettings={update} settings={{...props.settings,defaultReturnWindowDays:45}}/>);resolve();await pending;});
 expect(input().props.value).toBe('90');expect(update).toHaveBeenCalledWith({defaultReturnWindowDays:45});
});
test('same-frame duplicate settings save persists only once',async()=>{
 let resolve!:()=>void;const update=jest.fn(()=>new Promise<void>(yes=>{resolve=yes;}));
 act(()=>{renderer=create(<SettingsScreen {...props} updateSettings={update}/>);});act(()=>input().props.onChangeText('45'));
 const commit=save().props.onPress;let pending!:Promise<void>;act(()=>{pending=commit();void commit();});expect(update).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve();await pending;});
});
