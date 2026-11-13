import assert from 'node:assert/strict';
import { HookBus, hookResult } from '../src/runtime/hooks.js';
import { JavaVM } from '../src/runtime/vm.js';
import { ApkSimulator } from '../apk.js';

const bus = new HookBus();
let count = 0;
const off = bus.on('ping', (payload) => { count += payload; });
assert.equal(bus.emit('ping', 2), undefined);
assert.equal(count, 2);
assert.equal(off(), true);
assert.equal(bus.emit('ping', 3), undefined);
let onceCount = 0;
bus.once('once', () => { onceCount += 1; });
bus.emit('once');
bus.emit('once');
assert.equal(onceCount, 1);
assert.throws(() => bus.on('', () => {}), TypeError);
assert.equal(bus.emit('missing'), undefined);
const errorBus = new HookBus({ bad: () => { throw new Error('boom'); } });
errorBus.onError = () => {};
assert.equal(errorBus.emit('bad'), undefined);

const events = [];
const hooks = new HookBus({
  'invoke:before': () => { events.push('before'); },
  'invoke:after': () => { events.push('after'); },
  log: () => { events.push('log'); },
});
const vm = new JavaVM({ hooks });
vm.invoke({ classDesc: 'Lx/Y;', name: 'missing', proto: { descriptor: '()V', returnType: 'V', parameters: [] } }, null, [], 'static');
assert.ok(events.includes('before'));
assert.ok(events.includes('after'));
assert.ok(events.includes('log'));
const shortHooks = new HookBus({ 'invoke:before': () => hookResult(42) });
const shortVm = new JavaVM({ hooks: shortHooks });
assert.equal(shortVm.invoke({ classDesc: 'Lx/Y;', name: 'missing', proto: { descriptor: '()V', returnType: 'V', parameters: [] } }, null, [], 'static'), 42);

const simulator = new ApkSimulator({});
let hookCalls = 0;
const dispose = simulator.on('start:before', () => { hookCalls += 1; });
assert.equal(simulator.hooks.has('start:before'), true);
simulator.hooks.emit('start:before', {});
assert.equal(hookCalls, 1);
dispose();
assert.equal(simulator.hooks.has('start:before'), false);
console.log('hooks OK', { events, shortCircuit: 42, publicApi: true });
