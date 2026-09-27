import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {Platform,Text} from 'react-native';
import {DocumentViewer} from '../components/documentViewer';
import {Button} from '../components/ui';
import {openDocumentFile} from '../lib/documents';
import type {PurchaseDocument} from '../types/purchase';
jest.mock('../lib/documents',()=>({openDocumentFile:jest.fn()}));
const original:PurchaseDocument={id:'first',name:'first.pdf',kind:'receipt',mimeType:'application/pdf',uri:'file:///first.pdf'};
let renderer:ReactTestRenderer;
const button=(label:string)=>renderer.root.findAllByType(Button).find(n=>n.props.label===label)!;
afterEach(()=>{act(()=>renderer.unmount());jest.mocked(openDocumentFile).mockReset();});
test('duplicate document actions launch only one platform operation',async()=>{
 let resolve!:(value:boolean)=>void;jest.mocked(openDocumentFile).mockReturnValue(new Promise(yes=>{resolve=yes;}));
 act(()=>{renderer=create(<DocumentViewer document={original} onClose={jest.fn()}/>);});
 const open=button('Open / share file').props.onPress;let task!:Promise<void>;act(()=>{task=open();void open();});
 expect(openDocumentFile).toHaveBeenCalledTimes(1);await act(async()=>{resolve(true);await task;});
});
test.each([true,false])('late document result %s cannot affect a replacement document',async result=>{
 let resolve!:(value:boolean)=>void;jest.mocked(openDocumentFile).mockReturnValue(new Promise(yes=>{resolve=yes;}));
 act(()=>{renderer=create(<DocumentViewer document={original} onClose={jest.fn()}/>);});
 let task!:Promise<void>;act(()=>{task=button('Share').props.onPress();});
 act(()=>renderer.update(<DocumentViewer document={{...original,id:'second',name:'second.pdf'}} onClose={jest.fn()}/>));
 await act(async()=>{resolve(result);await task;});
 expect(button('Ready')).toBeUndefined();expect(button('Share')).toBeDefined();
 expect(renderer.root.findAllByType(Text).some(node=>String(node.props.children).includes('can’t be opened'))).toBe(false);
});

test.each(['file:///private/another-account.png','data:image/svg+xml,<svg/>'])('does not preview an unsupported document URI: %s',uri=>{
 act(()=>{renderer=create(<DocumentViewer document={{...original,name:'image.png',mimeType:'image/png',uri}} onClose={jest.fn()}/>);});
 expect(renderer.root.findAll(node=>node.props.accessibilityLabel==='Preview of image.png')).toHaveLength(0);
 expect(renderer.root.findAllByType(Text).some(node=>String(node.props.children).includes('thumbnail preview isn’t available'))).toBe(true);
});

test('unmount cancels the clipboard acknowledgement timer',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');const platform=jest.replaceProperty(Platform,'OS','web');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:jest.fn(async()=>{})}}});jest.useFakeTimers();
 try {
  await act(async()=>{renderer=create(<DocumentViewer document={{...original,content:'Saved inline draft'}} onClose={jest.fn()}/>);});
  const before=jest.getTimerCount();await act(async()=>{await button('Copy text').props.onPress();});
  expect(button('Copied to clipboard')).toBeDefined();expect(jest.getTimerCount()).toBe(before+1);
  act(()=>renderer.unmount());expect(jest.getTimerCount()).toBe(before);
 } finally {jest.useRealTimers();platform.restore();if(prior)Object.defineProperty(globalThis,'navigator',prior);else Reflect.deleteProperty(globalThis,'navigator');}
});
