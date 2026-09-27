import {registerOfflineShell} from '../offlineShell.web';
const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const originalSecure=Object.getOwnPropertyDescriptor(window,'isSecureContext');
const service={getRegistration:jest.fn(),register:jest.fn()};
beforeEach(()=>{
 jest.resetAllMocks();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:service}});
 Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
});
afterAll(()=>{
 if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else Reflect.deleteProperty(globalThis,'navigator');
 if(originalSecure)Object.defineProperty(window,'isSecureContext',originalSecure);else Reflect.deleteProperty(window,'isSecureContext');
});
test('active shell is available without a network preflight',async()=>{
 service.getRegistration.mockResolvedValue({active:{}});
 expect(await registerOfflineShell()).toBe(true);expect(service.register).not.toHaveBeenCalled();
});
test('failed first installation settles false and removes the listener',async()=>{
 service.getRegistration.mockResolvedValue(undefined);
 const worker={state:'redundant',addEventListener:jest.fn(),removeEventListener:jest.fn()};
 service.register.mockResolvedValue({installing:worker});
 expect(await registerOfflineShell()).toBe(false);expect(worker.removeEventListener).toHaveBeenCalledTimes(1);
});
test('new activated installation resolves true',async()=>{
 service.getRegistration.mockResolvedValue(undefined);
 const worker={state:'activated',addEventListener:jest.fn(),removeEventListener:jest.fn()};
 service.register.mockResolvedValue({installing:worker});
 expect(await registerOfflineShell()).toBe(true);expect(worker.removeEventListener).toHaveBeenCalledTimes(1);
});
test('registration rejection is a truthful unavailable result',async()=>{
 service.register.mockRejectedValue(new Error('Offline on first visit'));
 expect(await registerOfflineShell()).toBe(false);
});
