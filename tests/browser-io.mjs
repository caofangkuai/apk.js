import assert from 'node:assert/strict';
import { browserPickSpec, handleBrowserIntent, storeBrowserFiles, uriVirtualPath, showFileChooser } from '../src/framework/browser-io.js';
import { JAVA_CORE_CLASSES, VIRTUAL_FS } from '../src/framework/java-core.js';
import { uriObject } from '../src/framework/webkit.js';

function fakeVm() {
  const calls = [];
  const vm = {
    calls,
    log() {},
    allocateRawObject(descriptor) {
      return { descriptor, $fields: new Map(), $peer: null };
    },
    newArray(type, length, initial) {
      const data = Array.isArray(initial) ? [...initial] : new Array(length).fill(null);
      return { descriptor: type, $data: data };
    },
    invokeByName(name, signature, target, args) {
      calls.push({ name, signature, target, args });
      return undefined;
    },
    screen: { invalidate() {}, decorView: { requestLayout() {} } },
  };
  return vm;
}

function fakeIntent(peer) {
  return { $peer: { extras: new Map(), categories: [], ...peer } };
}

/** 最小 DOM 桩：input.click() 后异步派发 change，file 带真实字节。 */
function installFakeDom(files) {
  const created = [];
  const document = {
    createElement(tag) {
      const element = {
        tag,
        style: {},
        children: [],
        listeners: new Map(),
        files: [],
        append(...nodes) { element.children.push(...nodes); },
        appendChild(node) { element.children.push(node); return node; },
        remove() {},
        setAttribute(name, value) { element[name] = value; },
        addEventListener(name, handler) { element.listeners.set(name, handler); },
        click() {
          setTimeout(() => {
            element.files = files.map((file) => ({
              name: file.name,
              type: file.type,
              arrayBuffer: async () => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength),
            }));
            element.listeners.get('change')?.();
          }, 0);
        },
      };
      created.push(element);
      return element;
    },
    body: { appendChild() {} },
  };
  globalThis.document = document;
  return created;
}

function removeFakeDom() {
  delete globalThis.document;
}

// 1. Intent 识别：GET_CONTENT / IMAGE_CAPTURE / CHOOSER 都能推导出浏览器动作
{
  const getContent = fakeIntent({ action: 'android.intent.action.GET_CONTENT', type: 'image/*', extras: new Map([['android.intent.extra.ALLOW_MULTIPLE', true]]) });
  const spec = browserPickSpec(getContent);
  assert.equal(spec.kind, 'file');
  assert.equal(spec.accept, 'image/*');
  assert.equal(spec.multiple, true);
  assert.equal(spec.category, 'image');

  const capture = fakeIntent({ action: 'android.media.action.IMAGE_CAPTURE' });
  assert.equal(browserPickSpec(capture).kind, 'photo');

  const inner = fakeIntent({ action: 'android.intent.action.PICK', type: 'video/*' });
  const chooser = fakeIntent({ action: 'android.intent.action.CHOOSER', extras: new Map([['android.intent.extra.INTENT', inner]]) });
  const chooserSpec = browserPickSpec(chooser);
  assert.equal(chooserSpec.kind, 'file');
  assert.equal(chooserSpec.accept, 'video/*');

  assert.equal(browserPickSpec(fakeIntent({ action: 'android.intent.action.VIEW' })), null);
}

// 2. 文件选择结果：写入 VIRTUAL_FS、回调 onActivityResult、Uri 可回读
{
  const bytes = new Uint8Array([1, 2, 3, 4]);
  installFakeDom([{ name: 'report.bin', type: 'application/octet-stream', bytes }]);
  const vm = fakeVm();
  const activity = { descriptor: 'Lcom/example/Main;' };
  const intent = fakeIntent({ action: 'android.intent.action.GET_CONTENT', type: '*/*' });
  assert.equal(handleBrowserIntent(vm, activity, intent, 7), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  removeFakeDom();

  const call = vm.calls.find((item) => item.name === 'onActivityResult');
  assert(call, '应回调 onActivityResult');
  assert.equal(call.args[0], 7);
  assert.equal(call.args[1], -1);
  const resultIntent = call.args[2];
  assert(resultIntent, '结果 Intent 不能为空');
  const path = uriVirtualPath(resultIntent.$peer.data);
  assert(path, '结果 data 应能映射成路径');
  assert.deepEqual(Array.from(VIRTUAL_FS.read(path)), [1, 2, 3, 4]);
  assert.equal(resultIntent.$peer.extras.get('data'), undefined);
}

// 3. 拍照 EXTRA_OUTPUT：直接写到指定 Uri，结果 data 为空
{
  installFakeDom([{ name: 'shot.jpg', type: 'image/jpeg', bytes: new Uint8Array([9, 8, 7]) }]);
  const vm = fakeVm();
  const outputUri = uriObject(vm, 'file:///storage/emulated/0/DCIM/out.jpg');
  const spec = {
    kind: 'photo',
    intent: { action: 'android.media.action.IMAGE_CAPTURE', type: null, extras: new Map([['android.intent.extra.OUTPUT', outputUri]]) },
    multiple: false,
    output: outputUri,
  };
  const intent = { $peer: { action: 'android.media.action.IMAGE_CAPTURE', extras: spec.intent.extras } };
  assert.equal(handleBrowserIntent(vm, { descriptor: 'Lcom/example/Camera;' }, intent, 3), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  removeFakeDom();
  assert.deepEqual(Array.from(VIRTUAL_FS.read('/storage/emulated/0/DCIM/out.jpg')), [9, 8, 7]);
  const call = vm.calls.find((item) => item.name === 'onActivityResult');
  assert.equal(call.args[1], -1);
}

// 4. storeBrowserFiles 去重命名
{
  VIRTUAL_FS.write('/storage/emulated/0/Download/same.txt', new Uint8Array([1]));
  const stored = storeBrowserFiles([{ name: 'same.txt', type: 'text/plain', bytes: new Uint8Array([2]) }], 'document');
  assert.notEqual(stored[0].path, '/storage/emulated/0/Download/same.txt');
  assert.deepEqual(Array.from(VIRTUAL_FS.read(stored[0].path)), [2]);
}

// 5. ContentResolver 输出流 close 后落盘（OutputStream 宿主真实写入 VIRTUAL_FS）
{
  const def = JAVA_CORE_CLASSES['Ljava/io/OutputStream;'];
  const object = { $buffer: [65, 66], $targetPath: '/storage/emulated/0/Download/sink.txt' };
  def.methods.get('close()V')(object, []);
  assert.equal(new TextDecoder().decode(VIRTUAL_FS.read('/storage/emulated/0/Download/sink.txt')), 'AB');
}

// 6. WebChromeClient.onShowFileChooser：回调收到 Uri 数组
{
  installFakeDom([{ name: 'upload.txt', type: 'text/plain', bytes: new Uint8Array([4, 5]) }]);
  const vm = fakeVm();
  let received = null;
  const callback = { descriptor: 'Landroid/webkit/ValueCallback;' };
  vm.invokeByName = (name, signature, target, args) => {
    if (name === 'onReceiveValue') received = args[0];
  };
  showFileChooser(vm, callback, { $acceptTypes: ['text/plain'], $mode: 0 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  removeFakeDom();
  assert(received, 'onReceiveValue 应被调用');
  assert.equal(received.$data.length, 1);
}

console.log('browser-io ok');
