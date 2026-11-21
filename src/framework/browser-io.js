import { Bitmap } from './graphics.js';
import { uriObject } from './webkit.js';
import { VIRTUAL_FS } from './java-core.js';

/**
 * Android 文件选择 / 拍照 / 录像的浏览器转接层。
 *
 * 浏览器里没有系统相册和相机应用，这里统一映射到 H5 能力：
 * - GET_CONTENT / OPEN_DOCUMENT / PICK → `<input type="file">`
 * - IMAGE_CAPTURE → `navigator.mediaDevices.getUserMedia` + canvas 截帧，
 *   不可用时退回带 capture 的文件输入
 * - VIDEO_CAPTURE → `MediaRecorder` 录制，不可用时退回文件输入
 * 选中的字节写入 VIRTUAL_FS，返回 `file://` Uri，让应用的
 * ContentResolver.openInputStream 能真正读到内容。
 */

const ACTION_GET_CONTENT = 'android.intent.action.GET_CONTENT';
const ACTION_OPEN_DOCUMENT = 'android.intent.action.OPEN_DOCUMENT';
const ACTION_PICK = 'android.intent.action.PICK';
const ACTION_IMAGE_CAPTURE = 'android.media.action.IMAGE_CAPTURE';
const ACTION_VIDEO_CAPTURE = 'android.media.action.VIDEO_CAPTURE';
const ACTION_VIEW = 'android.intent.action.VIEW';
const ACTION_SEND = 'android.intent.action.SEND';
const ACTION_SEND_MULTIPLE = 'android.intent.action.SEND_MULTIPLE';
const ACTION_SENDTO = 'android.intent.action.SENDTO';
const ACTION_DIAL = 'android.intent.action.DIAL';
const ACTION_CREATE_DOCUMENT = 'android.intent.action.CREATE_DOCUMENT';
const EXTRA_ALLOW_MULTIPLE = 'android.intent.extra.ALLOW_MULTIPLE';
const EXTRA_OUTPUT = 'android.intent.extra.OUTPUT';
const EXTRA_INTENT = 'android.intent.extra.INTENT';
const EXTRA_TEXT = 'android.intent.extra.TEXT';
const EXTRA_SUBJECT = 'android.intent.extra.SUBJECT';
const EXTRA_STREAM = 'android.intent.extra.STREAM';
const EXTRA_TITLE = 'android.intent.extra.TITLE';
const RESULT_OK = -1;
const RESULT_CANCELED = 0;

/** 等待应用写入完成后再触发浏览器下载的路径。 */
const pendingDownloads = new Set();

function triggerDownload(path, bytes) {
  if (!hasDom()) return;
  const name = String(path).split('/').pop() || 'download';
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

VIRTUAL_FS.onWrite = (path, bytes) => {
  if (!pendingDownloads.has(path)) return;
  pendingDownloads.delete(path);
  triggerDownload(path, bytes);
};

/** DownloadManager.enqueue 的浏览器出口：直接触发一次真实下载。 */
export function triggerBrowserDownload(name, bytes) {
  triggerDownload(`/${String(name || 'download')}`, bytes);
}

function hasDom() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function browserIoAvailable() {
  return hasDom();
}

function intentPeer(intent) {
  return intent?.$peer ?? intent ?? {};
}

function peerExtra(peer, key) {
  const extras = peer?.extras;
  if (!extras || typeof extras.get !== 'function') return undefined;
  return extras.get(key);
}

/** 把 Uri 对象 / 字符串还原成 VIRTUAL_FS 绝对路径（不支持时返回 null）。 */
export function uriVirtualPath(uri) {
  if (!uri) return null;
  const value = String(uri?.$peer?.$value ?? uri?.$value ?? uri);
  if (!value) return null;
  if (value.startsWith('file://')) return decodeURIComponent(value.slice(7));
  if (value.startsWith('/')) return value;
  if (value.startsWith('content://')) {
    // 本模拟器的 content:// 由 VIRTUAL_FS 承载，取最后一个路径段定位。
    const rest = value.slice('content://'.length);
    const slash = rest.indexOf('/');
    if (slash < 0) return null;
    const path = decodeURIComponent(rest.slice(slash));
    return path.startsWith('/') ? path : `/${path}`;
  }
  return null;
}

/** 由 Intent action/type/extra 推导出浏览器侧的选择动作；不是选择类 Intent 返回 null。 */
export function browserPickSpec(intent) {
  const peer = intentPeer(intent);
  let action = typeof peer.action === 'string' ? peer.action : null;
  let source = peer;
  if (action === 'android.intent.action.CHOOSER') {
    const inner = peerExtra(peer, EXTRA_INTENT);
    if (!inner) return null;
    source = intentPeer(inner);
    action = typeof source.action === 'string' ? source.action : null;
  }
  if (!action) return null;
  const type = typeof source.type === 'string' ? source.type : null;
  const multiple = !!peerExtra(source, EXTRA_ALLOW_MULTIPLE);
  const capture = source?.extras?.get?.('android.intent.extra.capture') ?? false;
  if (action === ACTION_IMAGE_CAPTURE) {
    return { kind: 'photo', intent: source, multiple: false, output: peerExtra(source, EXTRA_OUTPUT) };
  }
  if (action === ACTION_VIDEO_CAPTURE) {
    return { kind: 'video', intent: source, multiple: false, output: peerExtra(source, EXTRA_OUTPUT) };
  }
  if (action === ACTION_GET_CONTENT || action === ACTION_OPEN_DOCUMENT || action === ACTION_PICK) {
    const accept = type && type !== '*/*' ? type : null;
    const category = type?.startsWith('image/') ? 'image' : (type?.startsWith('video/') ? 'video' : 'document');
    return { kind: 'file', accept, multiple, capture, category, intent: source, output: null };
  }
  if (action === ACTION_CREATE_DOCUMENT) {
    return {
      kind: 'create',
      intent: source,
      multiple: false,
      output: null,
      title: String(jsText(peerExtra(source, EXTRA_TITLE)) || 'document'),
      mime: type || 'application/octet-stream',
    };
  }
  return null;
}

/** CharSequence / String 统一成 JS 字符串。 */
function jsText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value.$string === 'string') return value.$string;
  if (typeof value.$peer?.text === 'string') return value.$peer.text;
  if (Array.isArray(value.$data)) return value.$data.map((code) => String.fromCharCode(code & 0xffff)).join('');
  return String(value);
}

/** ACTION_VIEW / DIAL / SENDTO 等在浏览器里的真实出口。 */
function handleViewLike(vm, intent) {
  const peer = intentPeer(intent);
  const action = typeof peer.action === 'string' ? peer.action : '';
  const data = String(peer.data?.$peer?.$value ?? peer.data?.$value ?? '');
  if (action === ACTION_VIEW) {
    if (!/^(https?|mailto|tel|sms):/i.test(data)) return false;
    if (typeof window !== 'undefined' && typeof window.open === 'function') window.open(data, '_blank', 'noopener');
    return true;
  }
  if (action === ACTION_DIAL || action === ACTION_SENDTO) {
    const target = /^(tel|sms|mailto|smsto):/i.test(data) ? data : `tel:${encodeURIComponent(data)}`;
    if (typeof window !== 'undefined' && typeof window.open === 'function') window.open(target, '_blank', 'noopener');
    return true;
  }
  if (action === ACTION_SEND || action === ACTION_SEND_MULTIPLE) {
    const text = jsText(peerExtra(peer, EXTRA_TEXT));
    const title = jsText(peerExtra(peer, EXTRA_SUBJECT));
    shareFromBrowser(vm, peer, { text, title }).catch((error) => {
      vm.log?.('warn', 'BrowserIO', `分享失败: ${error?.message ?? error}`);
    });
    return true;
  }
  return false;
}

function streamUris(peer) {
  const stream = peerExtra(peer, EXTRA_STREAM);
  if (!stream) return [];
  if (Array.isArray(stream)) return stream;
  const list = stream?.$peer?.items;
  if (Array.isArray(list)) return list;
  return [stream];
}

async function shareFromBrowser(vm, peer, { text, title }) {
  const uris = streamUris(peer);
  const files = [];
  for (const uri of uris) {
    const path = uriVirtualPath(uri);
    const bytes = path ? VIRTUAL_FS.read(path) : null;
    if (!bytes) continue;
    const name = String(path).split('/').pop() || 'file';
    files.push(new File([bytes], name, { type: peer.type || 'application/octet-stream' }));
  }
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.share) {
    try {
      await nav.share(files.length ? { files, title, text } : { title, text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  if (text && nav?.clipboard?.writeText) await nav.clipboard.writeText(text);
  void vm;
}

function fileBytes(file) {
  if (file.arrayBuffer) return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => resolve(new Uint8Array(0));
    reader.readAsArrayBuffer(file);
  });
}

/** 打开浏览器文件选择器，返回 [{name, type, bytes}]。必须在用户手势内同步调用。 */
export function chooseFiles({ accept = null, multiple = false, capture = false } = {}) {
  if (!hasDom()) return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    if (multiple) input.multiple = true;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.top = '0';
    document.body.appendChild(input);
    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (!files.length) {
        finish([]);
        return;
      }
      Promise.all(files.map(async (file) => ({
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        bytes: await fileBytes(file),
      }))).then(finish).catch(() => finish([]));
    });
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}

function makeOverlay() {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:sans-serif;';
  return root;
}

function overlayButton(text, primary) {
  const button = document.createElement('button');
  button.textContent = text;
  button.style.cssText = `min-width:132px;padding:12px 20px;border-radius:24px;border:0;font-size:16px;cursor:pointer;background:${primary ? '#6200ee' : '#3c3c3c'};color:#fff;`;
  return button;
}

/** 摄像头取景拍照，返回与文件选择一致的 [{name, type, bytes}]；不可用时退回文件输入。 */
export async function capturePhoto() {
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!hasDom() || !media?.getUserMedia) return chooseFiles({ accept: 'image/*', capture: true });
  let stream = null;
  try {
    stream = await media.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (_) {
    return chooseFiles({ accept: 'image/*', capture: true });
  }
  return new Promise((resolve) => {
    const root = makeOverlay();
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.style.cssText = 'max-width:92vw;max-height:70vh;border-radius:12px;background:#000;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:16px;';
    const shoot = overlayButton('拍照', true);
    const cancel = overlayButton('取消', false);
    actions.append(shoot, cancel);
    root.append(video, actions);
    document.body.appendChild(root);
    const close = () => {
      for (const track of stream.getTracks()) track.stop();
      root.remove();
    };
    cancel.addEventListener('click', () => { close(); resolve([]); });
    shoot.addEventListener('click', () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(video, 0, 0, width, height);
      const name = `IMG_${Date.now()}.jpg`;
      const done = (bytes) => { close(); resolve([{ name, type: 'image/jpeg', bytes }]); };
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (!blob) { done(new Uint8Array(0)); return; }
          fileBytes(blob).then(done).catch(() => done(new Uint8Array(0)));
        }, 'image/jpeg', 0.92);
      } else {
        const data = canvas.toDataURL('image/jpeg', 0.92);
        done(Uint8Array.from(atob(data.split(',')[1] || ''), (c) => c.charCodeAt(0)));
      }
    });
    video.play?.().catch(() => undefined);
  });
}

/** 摄像头录像（MediaRecorder），返回 [{name, type:'video/mp4', bytes}]。 */
export async function captureVideo() {
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!hasDom() || !media?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return chooseFiles({ accept: 'video/*', capture: true });
  }
  let stream = null;
  try {
    stream = await media.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
  } catch (_) {
    return chooseFiles({ accept: 'video/*', capture: true });
  }
  return new Promise((resolve) => {
    const root = makeOverlay();
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.style.cssText = 'max-width:92vw;max-height:70vh;border-radius:12px;background:#000;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:16px;';
    const recButton = overlayButton('开始录制', true);
    const cancel = overlayButton('取消', false);
    actions.append(recButton, cancel);
    root.append(video, actions);
    document.body.appendChild(root);
    const chunks = [];
    let recorder = null;
    const close = () => {
      for (const track of stream.getTracks()) track.stop();
      root.remove();
    };
    cancel.addEventListener('click', () => { try { recorder?.stop(); } catch (_) { /* ignore */ } close(); resolve([]); });
    recButton.addEventListener('click', () => {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
      }
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/mp4' });
        fileBytes(blob).then((bytes) => {
          close();
          resolve([{ name: `VID_${Date.now()}.mp4`, type: 'video/mp4', bytes }]);
        }).catch(() => { close(); resolve([]); });
      };
      recorder.start();
      recButton.textContent = '停止录制';
    });
    video.play?.().catch(() => undefined);
  });
}

function uniquePath(dir, name) {
  const base = VIRTUAL_FS.normalize(`${dir}/${name}`);
  if (!VIRTUAL_FS.exists(base)) return base;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 10000; i += 1) {
    const candidate = VIRTUAL_FS.normalize(`${dir}/${stem}_${i}${ext}`);
    if (!VIRTUAL_FS.exists(candidate)) return candidate;
  }
  return base;
}

/** 把浏览器拿到的文件写入虚拟存储，返回 [{path, uri:'file://…', name, type, bytes}]。 */
export function storeBrowserFiles(files, category = 'document') {
  const dirs = {
    image: '/storage/emulated/0/DCIM/Camera',
    video: '/storage/emulated/0/DCIM/Camera',
    document: '/storage/emulated/0/Download',
  };
  const dir = dirs[category] || dirs.document;
  return (files || []).map((file) => {
    const safeName = String(file.name || 'file').replace(/[\\/:*?"<>|]/g, '_');
    const path = uniquePath(dir, safeName);
    VIRTUAL_FS.write(path, file.bytes);
    return { ...file, path, uri: `file://${encodeURI(path)}` };
  });
}

function clipDataObject(vm, uris) {
  const object = vm.allocateRawObject('Landroid/content/ClipData;');
  const items = uris.map((uri) => {
    const item = vm.allocateRawObject('Landroid/content/ClipData$Item;');
    item.$peer = { $uri: uri, $text: null, $htmlText: null, $intent: null };
    return item;
  });
  const description = vm.allocateRawObject('Landroid/content/ClipDescription;');
  description.$peer = { $label: '', $mimeTypes: ['*/*'] };
  object.$peer = { $items: items, $description: description };
  return object;
}

function resultIntent(vm, stored, spec) {
  const peer = intentPeer(spec.intent);
  const object = vm.allocateRawObject('Landroid/content/Intent;');
  const uris = stored.map((file) => uriObject(vm, file.uri));
  const extras = new Map();
  if (stored.length) extras.set('android.intent.extra.STREAM', uris[0]);
  if (spec.multiple) extras.set(EXTRA_ALLOW_MULTIPLE, true);
  object.$peer = {
    vm,
    action: peer.action ?? null,
    component: null,
    className: null,
    packageName: null,
    data: uris[0] ?? null,
    type: stored[0]?.type ?? peer.type ?? null,
    identifier: null,
    categories: [],
    selector: null,
    clipData: uris.length > 1 ? clipDataObject(vm, uris) : null,
    sourceBounds: null,
    extras,
    flags: 1,
    setClass(className) { this.className = className; return this; },
  };
  return object;
}

async function bitmapObject(vm, file) {
  const object = vm.allocateRawObject('Landroid/graphics/Bitmap;');
  const bitmap = new Bitmap(null, 0, 0, file?.name ?? null);
  object.$peer = bitmap;
  const loader = vm?.resources?.apk?.imageLoader || vm?.engine?.apk?.imageLoader;
  if (file && loader) {
    try {
      const image = await loader(file.bytes, file.name);
      bitmap.image = image;
      bitmap.width = image?.width ?? 0;
      bitmap.height = image?.height ?? 0;
    } catch (_) {
      // 解码失败时保留空位图，调用方拿到的尺寸为 0。
    }
  }
  return object;
}

async function deliver(vm, activityObject, spec, files, requestCode, options = {}) {
  const stored = options.preStored
    ? files
    : storeBrowserFiles(files, spec.category || (spec.kind === 'photo' ? 'image' : (spec.kind === 'video' ? 'video' : 'document')));
  const output = spec.output ?? peerExtra(spec.intent, EXTRA_OUTPUT);
  let intent = null;
  if (stored.length) {
    if (output) {
      const path = uriVirtualPath(output);
      if (path) {
        VIRTUAL_FS.write(path, stored[0].bytes);
        // 相机类 Intent 指定 EXTRA_OUTPUT 时，结果 Intent 的 data 为空。
        intent = resultIntent(vm, [], spec);
      } else {
        intent = resultIntent(vm, stored, spec);
      }
    } else {
      intent = resultIntent(vm, stored, spec);
    }
    if (spec.kind === 'photo' && !output && intent) {
      const bitmap = await bitmapObject(vm, stored[0]);
      intent.$peer.extras.set('data', bitmap);
    }
  }
  const activity = activityObject?.$object || activityObject?.object || activityObject;
  if (activity && typeof vm.invokeByName === 'function') {
    try {
      vm.invokeByName('onActivityResult', '(IILandroid/content/Intent;)V', activity, [requestCode | 0, stored.length ? RESULT_OK : RESULT_CANCELED, intent]);
    } catch (error) {
      vm.log?.('warn', 'BrowserIO', `onActivityResult 派发失败: ${error?.message ?? error}`);
    }
  }
  vm.screen?.invalidate?.();
  vm.screen?.decorView?.requestLayout?.();
}

/**
 * 拦截文件选择 / 拍照 / 录像 Intent，交给浏览器能力完成，并把结果回投 onActivityResult。
 * 返回 true 表示已接管，调用方不要再走 Activity 跳转。
 */
export function handleBrowserIntent(vm, activityObject, intent, requestCode = -1) {
  if (handleViewLike(vm, intent)) return true;
  const spec = browserPickSpec(intent);
  if (!spec) return false;
  if (!hasDom()) {
    const peer = intentPeer(spec.intent);
    vm.log?.('warn', 'BrowserIO', `非浏览器环境无法处理 ${peer.action}`);
    return true;
  }
  if (spec.kind === 'create') {
    const name = spec.title && /\.[a-z0-9]{2,5}$/i.test(spec.title) ? spec.title : `${spec.title}.bin`;
    const path = uniquePath('/storage/emulated/0/Download', String(name).replace(/[\\/:*?"<>|]/g, '_'));
    pendingDownloads.add(path);
    deliver(vm, activityObject, { ...spec, output: null }, [{ path, uri: `file://${encodeURI(path)}`, name, type: spec.mime, bytes: new Uint8Array(0) }], requestCode, { preStored: true });
    return true;
  }
  const finish = (files) => deliver(vm, activityObject, spec, files || [], requestCode).catch((error) => {
    vm.log?.('warn', 'BrowserIO', `结果派发失败: ${error?.message ?? error}`);
  });
  if (spec.kind === 'photo') capturePhoto().then(finish);
  else if (spec.kind === 'video') captureVideo().then(finish);
  else chooseFiles(spec).then(finish);
  return true;
}

/** WebChromeClient.onShowFileChooser 的宿主默认实现。 */
export function showFileChooser(vm, callback, params) {
  const acceptTypes = params?.$acceptTypes ?? params?.acceptTypes ?? null;
  const accept = Array.isArray(acceptTypes) && acceptTypes.length ? acceptTypes.join(',') : null;
  const multiple = (params?.$mode | 0) === 1;
  const capture = !!params?.$capture;
  chooseFiles({ accept, multiple, capture }).then((files) => {
    const stored = storeBrowserFiles(files, 'document');
    const uris = stored.map((file) => uriObject(vm, file.uri));
    const array = vm.newArray('[Landroid/net/Uri;', uris.length, uris);
    if (!callback) return;
    try {
      vm.invokeByName('onReceiveValue', '(Ljava/lang/Object;)V', callback, [uris.length ? array : null]);
    } catch (error) {
      vm.log?.('warn', 'BrowserIO', `onReceiveValue 失败: ${error?.message ?? error}`);
    }
  });
}
