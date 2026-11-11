import assert from 'node:assert/strict';
import { formatJavaString } from '../src/framework/java-core.js';

assert.equal(formatJavaString('%.01f mA', [0]), '0.0 mA');
assert.equal(formatJavaString('%.2f', [3.14159]), '3.14');
assert.equal(formatJavaString('%d%%', [42]), '42%');
assert.equal(formatJavaString('%s', ['ok']), 'ok');
assert.equal(formatJavaString('%.01f', [{ $peer: { value: 42 } }]), '42.0');
console.log('format OK');
