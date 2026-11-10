import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['tools/diagnose-apk.mjs', 'samples/hello-dex.apk'], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || 'diagnose 执行失败');
assert.match(result.stdout, /logs=\d+ interesting=\d+/);
assert.match(result.stdout, /interesting=0/, '示例 APK 不应有异常日志');
console.log('diagnose OK');
