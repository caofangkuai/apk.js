/**
 * 打包产物回归：确保 apk.min.js（核心引擎）与 android-framework.min.js（宿主类 + 模拟器）
 * 的分层关系、导出面与运行链路没有被改坏。
 *
 * 需要先 `npm run build`；没有产物时直接跳过，方便单独跑其它测试。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corePath = path.join(root, 'dist/apk.min.js');
const frameworkPath = path.join(root, 'dist/android-framework.min.js');

if (!fs.existsSync(corePath) || !fs.existsSync(frameworkPath)) {
  console.log('bundle smoke skipped: dist/ 不存在，先运行 npm run build');
  process.exit(0);
}

const coreSource = fs.readFileSync(corePath, 'utf8');
const frameworkSource = fs.readFileSync(frameworkPath, 'utf8');

/* ---------------- 静态分层检查 ---------------- */
assert.ok(/export\s*\{/.test(coreSource), 'apk.min.js 应当是 ESM 并导出符号');
assert.ok(
  /from\s*"\.\/apk\.min\.js"/.test(frameworkSource),
  'android-framework.min.js 应当从 ./apk.min.js 导入核心引擎'
);
for (const name of ['createSimulator', 'ApkSimulator', 'EmulatorEngine', 'XposedHelpers', 'XposedBridge', 'XC_MethodHook']) {
  assert.ok(frameworkSource.includes(name), `android-framework.min.js 缺少导出 ${name}`);
}
for (const name of ['loadApkFiles', 'DexFile', 'JavaVM', 'XposedRuntime', 'MethodHookParam']) {
  assert.ok(coreSource.includes(name), `apk.min.js 缺少导出 ${name}`);
}
// 核心引擎不应带上宿主类/页面逻辑
for (const forbidden of ['ApkSimulator', 'createSimulator', 'autoInitDemo', 'Landroid/widget/TextView;']) {
  assert.ok(!coreSource.includes(forbidden), `apk.min.js 不应包含 ${forbidden}`);
}
// 框架包不应重复打包核心引擎：DEX 解析器只应出现在 apk.min.js 里
assert.ok(
  !frameworkSource.includes('仅支持小端 DEX'),
  'android-framework.min.js 重复打包了 DEX 解析器，dependOn 分层失效'
);

/* ---------------- 运行时检查 ---------------- */
const core = await import(pathToFileURL(corePath).href);
assert.equal(typeof core.loadApkFiles, 'function', '核心引擎应导出 loadApkFiles');
assert.equal(typeof core.JavaVM, 'function', '核心引擎应导出 JavaVM');
assert.equal(typeof core.DexFile, 'function', '核心引擎应导出 DexFile');
assert.equal(typeof core.XposedHelpers, 'function', '核心引擎应导出 XposedHelpers');
assert.equal(typeof core.XposedRuntime, 'function', '核心引擎应导出 XposedRuntime');
assert.equal(core.ApkSimulator, undefined, '核心引擎不应导出 ApkSimulator');

const framework = await import(pathToFileURL(frameworkPath).href);
assert.equal(typeof framework.createSimulator, 'function', '框架包应导出 createSimulator');
assert.equal(typeof framework.ApkSimulator, 'function', '框架包应导出 ApkSimulator');
assert.equal(typeof framework.EmulatorEngine, 'function', '框架包应导出 EmulatorEngine');
assert.equal(typeof framework.XC_MethodHook, 'function', '框架包应导出 XC_MethodHook');
// 两个包共享同一份核心实现
assert.equal(framework.loadApkFiles, core.loadApkFiles, '两个包应当共享同一份 loadApkFiles');

const sim = framework.createSimulator({});
assert.ok(sim instanceof framework.ApkSimulator);
assert.equal(typeof sim.xposed.helpers.findAndHookMethod, 'function');
const handle = sim.xposed.helpers.findAndHookMethod('java.lang.String', null, 'trim', {
  afterHookedMethod(param) {
    param.setResult('x');
  },
});
assert.equal(handle.deferred, true, 'VM 未创建时应延迟注册');
assert.equal(sim.xposed.pending.length, 1);
handle.unhook();
assert.equal(sim.xposed.pending.length, 0);

console.log('bundle smoke OK', {
  coreKb: Math.round(coreSource.length / 1024),
  frameworkKb: Math.round(frameworkSource.length / 1024),
});
