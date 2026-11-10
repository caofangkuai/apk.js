import assert from 'node:assert/strict';
import { loadApkFiles } from '../src/framework/engine.js';

const many = {};
for (let i = 0; i < 5; i++) many[`file${i}`] = { dir: false, _data: { uncompressedSize: 1 } };
await assert.rejects(() => loadApkFiles({ files: many }, { maxEntries: 4 }), /条目过多/);

const big = { 'classes.dex': { dir: false, _data: { uncompressedSize: 32 * 1024 * 1024 } } };
await assert.rejects(() => loadApkFiles({ files: big }, { maxTotalSize: 16 * 1024 * 1024 }), /体积超过上限/);

console.log('zip limits OK');
