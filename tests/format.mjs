import assert from 'node:assert/strict';
import { formatJavaString } from '../src/framework/java-core.js';
import { decodeComplex } from '../src/res/axml.js';

assert.equal(formatJavaString('%.01f mA', [0]), '0.0 mA');
assert.equal(formatJavaString('%.2f', [3.14159]), '3.14');
assert.equal(formatJavaString('%d%%', [42]), '42%');
assert.equal(formatJavaString('%s', ['ok']), 'ok');
assert.equal(formatJavaString('%.01f', [{ $peer: { value: 42 } }]), '42.0');

// ARSC/AXML complex 值：mantissa 是左移 8 位的有符号整数，负值不能被二次符号修正
assert.deepEqual(decodeComplex(0x00000801), { value: 8, unit: 'dp', raw: 0x00000801 });
assert.deepEqual(decodeComplex(0xffffb701), { value: -73, unit: 'dp', raw: 0xffffb701 });
assert.equal(decodeComplex(((0xfffffe << 8) | 1) >>> 0).value, -2);
assert.equal(decodeComplex((1 << 8) | (3 << 4) | 2).value, 1 / 8388608);
console.log('format OK');
