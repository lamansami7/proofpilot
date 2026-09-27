import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {AuthScreen,PasswordRecovery,friendlyAuthError} from '../components/authScreen';
import {Button,Input} from '../components/ui';
let renderer:ReactTestRenderer;
afterEach(()=>{if(renderer)act(()=>renderer.unmount());});
function fill(label:string,value:string){act(()=>renderer.root.findAllByType(Input).find(n=>n.props.label===label)!.props.onChangeText(value));}
function button(label:string){return renderer.root.findAllByType(Button).find(n=>n.props.label===label)!;}
test.each(['Sign in','Forgot password?'])('duplicate %s shares a guard with other auth actions',async label=>{
 let resolve!:()=>void;const pending=new Promise<void>(yes=>{resolve=yes;});const submit=jest.fn(()=>pending);const reset=jest.fn(()=>pending);
 act(()=>{renderer=create(<AuthScreen onSubmit={submit} onResetPassword={reset}/>);});fill('EMAIL','qa@example.test');fill('PASSWORD','test-only-password');
 const signIn=button('Sign in').props.onPress;const recover=button('Forgot password?').props.onPress;
 const action=label==='Sign in'?signIn:recover;let task!:Promise<void>;act(()=>{task=action();void action();void(label==='Sign in'?recover:signIn)();});
 expect(submit.mock.calls.length+reset.mock.calls.length).toBe(1);expect(renderer.root.findAllByType(Input).every(n=>n.props.editable===false)).toBe(true);
 await act(async()=>{resolve();await task;});expect(button('Sign in').props.loading).toBe(false);
});
test('password recovery rejects duplicate updates but permits retry after failure',async()=>{
 let reject!:(error:Error)=>void;const save=jest.fn(()=>new Promise<void>((_yes,no)=>{reject=no;}));
 act(()=>{renderer=create(<PasswordRecovery onSave={save}/>);});fill('NEW PASSWORD','test-only-new-password');
 const commit=button('Save new password').props.onPress;let task!:Promise<void>;act(()=>{task=commit();void commit();});expect(save).toHaveBeenCalledTimes(1);
 await act(async()=>{reject(new Error('Temporary failure'));await task;});
 expect(renderer.root.findAllByType(Input).find(n=>n.props.label==='NEW PASSWORD')!.props.error).toBe('Password change could not be confirmed. Retry or request a new recovery link.');
 save.mockResolvedValueOnce();await act(async()=>{await button('Save new password').props.onPress();});expect(save).toHaveBeenCalledTimes(2);
});
test('signup wording alone does not falsely claim registration is disabled',()=>{
 expect(friendlyAuthError('Signup requires an invitation')).toBe('Signup requires an invitation');
 expect(friendlyAuthError('Signups not allowed for this instance')).toContain('disabled');
});
test.each(['Unable to generate a recovery token','Signup requires at least one invitation'])('does not invent a cause for an unrelated provider error: %s',message=>{
 expect(friendlyAuthError(message)).toBe(message);
});
