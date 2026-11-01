Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 12, deviceMemory: 16 }, configurable: true, writable: true });
const m = await import('./src/framework/java-core.js');
console.log('keys with device', Object.keys(m).filter(k => /device|Capab/i.test(k)));
