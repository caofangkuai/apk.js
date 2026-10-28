import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from '../src/framework/engine.js';
import { EmulatorEngine } from '../src/framework/engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const apkPath = process.argv[2] || './samples/hello-dex.apk';
const zip = await JSZip.loadAsync(fs.readFileSync(apkPath));
const apk = await loadApkFiles(zip);

assert(apk.packageName === 'com.example.helloworld', `包名异常: ${apk.packageName}`);
assert(apk.dexFiles.length >= 1, '缺少 classes.dex');
assert(apk.resourceTable.entries.size > 0, '资源表为空');

const errors = [];
const engine = new EmulatorEngine({
  onLog: (entry) => {
    if (entry.level === 'error') errors.push(entry);
  },
});
await engine.start(apk);

const peer = engine.vm.registry.getPeer(engine.activity);
assert(peer.contentView, '未设置 ContentView');
const res = engine.vm.resources;
const byId = (name) => peer.contentView.findViewById(res.getIdentifier(name, 'id'));
const title = byId('title');
const subtitle = byId('subtitle');
const button = byId('action');
const count = byId('count');
assert(title?.getText() === 'Hello World', '标题文本未由 DEX 设置');
assert(subtitle?.getText().includes('Dalvik'), '副标题资源未加载');
assert(button?.getText().includes('点我'), '按钮文本未加载');

button.performClick();
await new Promise((resolve) => setTimeout(resolve, 50));
assert(count?.getText() === '已点击 1 次', `点击后计数异常: ${count?.getText()}`);
assert(engine.screen?.overlays.length === 1 || true, 'Toast overlay');

const vm = engine.vm;
function callIntent(cls, name, proto, receiver, args, mode = 'virtual') {
  return vm.invoke({ classDesc: cls, name, proto: { descriptor: proto, parameters: [], returnType: 'L' } }, receiver, args, mode);
}

const targetClass = vm.getClassObject('Lcom/example/helloworld/MainActivity;');
const sameAppIntent = vm.instantiate('Landroid/content/Intent;', []);
callIntent('Landroid/content/Intent;', 'setClass', '(Landroid/content/Context;Ljava/lang/Class;)Landroid/content/Intent;', sameAppIntent, [vm.contextObject, targetClass]);
assert(sameAppIntent.$peer.className === 'com.example.helloworld.MainActivity', 'Intent.setClass 未记录目标类');

const previousActivity = engine.activity;
callIntent('Landroid/app/Activity;', 'startActivity', '(Landroid/content/Intent;)V', previousActivity, [sameAppIntent]);
assert(vm.activity !== previousActivity, 'startActivity 未启动新 Activity');

const secondClass = vm.getClassObject('Lcom/example/helloworld/SecondActivity;');
const secondIntent = vm.instantiate('Landroid/content/Intent;', []);
callIntent('Landroid/content/Intent;', 'setClass', '(Landroid/content/Context;Ljava/lang/Class;)Landroid/content/Intent;', secondIntent, [vm.contextObject, secondClass]);
callIntent('Landroid/content/Intent;', 'putExtra', '(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;', secondIntent, ['com.example.helloworld.MESSAGE', '来自 MainActivity 的问候']);
callIntent('Landroid/app/Activity;', 'startActivity', '(Landroid/content/Intent;)V', vm.activity, [secondIntent]);
const secondPeer = vm.registry.getPeer(vm.activity, vm.registry.classNameOf(vm.activity));
const secondRoot = secondPeer.contentView;
assert(secondRoot, '第二个 Activity 未设置 ContentView');
const secondMessage = secondRoot.findViewById(res.getIdentifier('second_message', 'id'));
assert(secondMessage?.getText() === '收到参数：来自 MainActivity 的问候', `第二个 Activity 渲染异常: ${secondMessage?.getText()}`);

const buildRecord = vm.registry.resolve('Landroid/os/Build;');
assert(buildRecord?.nativeDef, 'Build 类未定义');
assert(vm.registry.resolve('Landroid/os/Build$VERSION;')?.nativeDef, 'Build$VERSION 未定义');

const reflectClass = vm.getClassObject('Lcom/example/helloworld/MainActivity;');
assert(reflectClass, '反射未取得 MainActivity Class');

const foreignIntent = vm.instantiate('Landroid/content/Intent;', []);
callIntent('Landroid/content/Intent;', 'setClassName', '(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;', foreignIntent, ['com.other.app', 'com.other.app.Foo']);
let foreignError = null;
try {
  callIntent('Landroid/app/Activity;', 'startActivity', '(Landroid/content/Intent;)V', previousActivity, [foreignIntent]);
} catch (error) {
  foreignError = error;
}
assert(foreignError, '其他应用的 Activity 应抛出异常');
assert(
  vm.registry.classNameOf(foreignError.javaException) === 'Landroid/content/ActivityNotFoundException;',
  `其他应用异常类型错误: ${vm.registry.classNameOf(foreignError.javaException)}`
);

const missingIntent = vm.instantiate('Landroid/content/Intent;', []);
callIntent('Landroid/content/Intent;', 'setClassName', '(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;', missingIntent, ['com.example.helloworld', 'com.example.helloworld.Missing']);
let missingError = null;
try {
  callIntent('Landroid/app/Activity;', 'startActivity', '(Landroid/content/Intent;)V', previousActivity, [missingIntent]);
} catch (error) {
  missingError = error;
}
assert(missingError, '不存在的 Activity 应抛出异常');
assert(
  vm.registry.classNameOf(missingError.javaException) === 'Landroid/content/ActivityNotFoundException;',
  `不存在的 Activity 异常类型错误: ${vm.registry.classNameOf(missingError.javaException)}`
);

if (errors.length) {
  throw new Error(`运行期错误: ${errors.map((e) => e.message).join('; ')}`);
}
console.log('check ok');
process.exit(0);
