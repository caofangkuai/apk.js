import assert from 'node:assert/strict';
import { ApkSimulator } from '../apk.js';

const sim = new ApkSimulator({});
await assert.rejects(() => sim.loadFromUrl('not a url'), /地址无效/);
await assert.rejects(() => sim.loadFromUrl('ftp://example.com/app.apk'), /HTTP\(S\)/);
assert.doesNotThrow(() => sim.assertSize(51 * 1024 * 1024));
const limited = new ApkSimulator({ device: { maxApkSize: 1024 * 1024 } });
assert.throws(() => limited.assertSize(2 * 1024 * 1024), /大小上限/);
assert.throws(() => sim.capture(), /不支持截图/);
const withCanvas = new ApkSimulator({ canvas: { toDataURL: () => 'data:image/png;base64,AA==' } });
assert.equal(withCanvas.capture(), 'data:image/png;base64,AA==');
console.log('api validation OK');
