import React from 'react';
import {act,create,ReactTestRenderer} from 'react-test-renderer';
import {AuthScreen,PasswordRecovery,friendlyAuthError} from '../components/authScreen';
import {AUTH_ATTEMPT_LIMIT} from '../lib/authThrottle';
import {Banner,Button,Input} from '../components/ui';
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

// --- Confirmation resend (audit item C) -------------------------------------
test('confirmation resend is offered only in sign-up mode and reports a neutral result',async()=>{
 const resend=jest.fn(async()=>{});
 act(()=>{renderer=create(<AuthScreen onSubmit={jest.fn()} onResendConfirmation={resend}/>);});
 const find=(label:string)=>renderer.root.findAllByType(Button).find(n=>n.props.label===label);
 const banner=()=>renderer.root.findAllByType(Banner).find(n=>typeof n.props.message==='string'&&n.props.message.includes('confirmation'));
 expect(find('Resend confirmation email')).toBeUndefined();
 act(()=>{find('Create an account instead')!.props.onPress();});
 expect(find('Resend confirmation email')).toBeDefined();
 fill('EMAIL','person@example.test');
 await act(async()=>{await find('Resend confirmation email')!.props.onPress();});
 expect(resend).toHaveBeenCalledWith('person@example.test');
 // Wording must be identical whether or not the address actually has an account.
 expect(banner()!.props.message).toContain('If an account is waiting for confirmation');
});
test('a refused resend never reveals whether the address has an account',async()=>{
 act(()=>{renderer=create(<AuthScreen onSubmit={jest.fn()} onResendConfirmation={async()=>{throw new Error('User not found');}}/>);});
 const find=(label:string)=>renderer.root.findAllByType(Button).find(n=>n.props.label===label);
 act(()=>{find('Create an account instead')!.props.onPress();});
 fill('EMAIL','stranger@example.test');
 await act(async()=>{await find('Resend confirmation email')!.props.onPress();});
 const error=renderer.root.findAllByType(Banner).find(n=>n.props.tone==='danger')!.props.message;
 expect(error).not.toMatch(/no account|does not exist|unknown user|not registered|already/i);
 expect(error).not.toContain('stranger@example.test');
});
test('confirmation resend requires an email and shares the duplicate-action guard',async()=>{
 let resolve!:()=>void;const pending=new Promise<void>(yes=>{resolve=yes;});const resend=jest.fn(()=>pending);
 act(()=>{renderer=create(<AuthScreen onSubmit={jest.fn()} onResendConfirmation={resend}/>);});
 const find=(label:string)=>renderer.root.findAllByType(Button).find(n=>n.props.label===label);
 act(()=>{find('Create an account instead')!.props.onPress();});
 await act(async()=>{await find('Resend confirmation email')!.props.onPress();});
 expect(resend).not.toHaveBeenCalled();
 expect(renderer.root.findAllByType(Input).find(n=>n.props.label==='EMAIL')!.props.error).toBe('Enter your email first.');
 fill('EMAIL','person@example.test');
 let task!:Promise<void>;act(()=>{task=find('Resend confirmation email')!.props.onPress();void find('Resend confirmation email')!.props.onPress();});
 expect(resend).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve();await task;});
});

// --- Client-side attempt pacing (audit item A) -----------------------------
test('repeated failures are paced so a real person cannot hammer the provider',async()=>{
 const submit=jest.fn(async()=>{throw new Error('Invalid login credentials');});
 act(()=>{renderer=create(<AuthScreen onSubmit={submit} onResetPassword={jest.fn()}/>);});
 fill('EMAIL','person@example.test');fill('PASSWORD','wrong-password');
 for(let attempt=0;attempt<AUTH_ATTEMPT_LIMIT;attempt++)await act(async()=>{await button('Sign in').props.onPress();});
 expect(submit).toHaveBeenCalledTimes(AUTH_ATTEMPT_LIMIT);
 const paused=renderer.root.findAllByType(Banner).find(n=>n.props.tone==='danger'&&/Too many attempts/.test(String(n.props.message)));
 expect(paused).toBeDefined();
 // Further taps are refused locally and never reach the provider again.
 await act(async()=>{await button('Sign in').props.onPress();});
 expect(submit).toHaveBeenCalledTimes(AUTH_ATTEMPT_LIMIT);
});
test('a provider rate-limit response is honoured without blocking the recovery link',async()=>{
 const submit=jest.fn(async()=>{throw new Error('Too many requests, please wait');});const reset=jest.fn(async()=>{});
 act(()=>{renderer=create(<AuthScreen onSubmit={submit} onResetPassword={reset}/>);});
 fill('EMAIL','person@example.test');fill('PASSWORD','wrong-password');
 await act(async()=>{await button('Sign in').props.onPress();});
 const cooldown=renderer.root.findAllByType(Banner).find(n=>n.props.tone==='danger'&&/Too many attempts/.test(String(n.props.message)));
 expect(cooldown).toBeDefined();
 expect(cooldown!.props.message).toMatch(/Wait \d+ seconds? before trying again/);
 // Nothing is cached to disk: a remount starts a clean window.
 act(()=>renderer.unmount());
 act(()=>{renderer=create(<AuthScreen onSubmit={submit} onResetPassword={reset}/>);});
 fill('EMAIL','person@example.test');fill('PASSWORD','wrong-password');
 await act(async()=>{await button('Sign in').props.onPress();});
 expect(submit).toHaveBeenCalledTimes(2);
});
