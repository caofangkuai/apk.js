import { JavaVM, descriptorOfValue, parseParameterDescriptors } from '../runtime/vm.js';
import { floatBitsToNumber, numberToFloatBits, toInt } from '../runtime/values.js';
import { applyCompatMethods } from './compat.js';
import { NativeClassDef } from '../runtime/class-registry.js';
import { JAVA_CORE_CLASSES, deviceCapabilities, hardwareIdentity, jsString, nativeDef, VIRTUAL_FS, readFsText } from './java-core.js';
import {
  LayoutInflater,
  buildLayoutParamsViaDex,
  coerceLayoutParams,
  layoutParamsDescriptorFor,
} from './layout-inflater.js';
import { Resources, convertDimension, parseColorString } from './resources.js';
import { ATTR_IDS } from '../res/axml.js';
import { Handler, Looper, Message, MessageQueue } from './os.js';
import { Toast } from './toast.js';
import { installSensorSources, readSensorValues } from './sensors.js';
import { ActivityHost } from './app.js';
import { viewObject, unwrapView } from './bridge.js';
import { Paint, Canvas, Bitmap, Rect, RectF, Point, cssColor } from './graphics.js';
import {
  MeasureSpec,
  VISIBILITY,
  View,
  ViewGroup,
  colorToCss,
  resolveSize,
  getDefaultSize,
  getChildMeasureSpec,
  createMotionEventObject,
  toMotionEventObject,
} from './view.js';
import {
  AbsoluteLayout,
  FrameLayout,
  GridLayout,
  HorizontalScrollView,
  LinearLayout,
  ListView,
  RelativeLayout,
} from './layouts.js';
import {
  Button,
  EditText,
  ImageView,
  ProgressBar,
  AnalogClock,
  TimePicker,
  DatePicker,
  CalendarView,
  NumberPicker,
  ScrollView,
  TextView,
  WebView,
  resolveStateListColor,
} from './widgets.js';
import { DecorView, SurfaceScreen, Window, createCanvasAdapter } from './window.js';
import { DRAWABLE_CLASSES, OUTLINE_CLASSES, SHADER_CLASSES, drawableObject } from './drawables.js';
import { WEBKIT_CLASSES, uriObject } from './webkit.js';
import { OPENGL_CLASSES } from './opengl.js';

export const FRAMEWORK_CLASSES = {};

function readNavigator() {
  try {
    if (typeof navigator !== 'undefined' && navigator) return navigator;
  } catch (error) {
    void error;
  }
  return null;
}

function detectPlatformName() {
  const nav = readNavigator();
  const raw = String(nav?.userAgentData?.platform || nav?.platform || '').trim();
  if (!raw) return 'browser';
  return raw.toLowerCase().replace(/\s+/g, '_');
}

function detectSocPlatform() {
  const arch = String(readNavigator()?.userAgentData?.architecture || '').toLowerCase();
  if (arch.includes('arm') || arch === '') return 'qcom';
  return 'qcom';
}

function browserMarketName(nav) {
  const agent = String(nav?.userAgent || '');
  const platform = String(nav?.platform || '');
  const match = /\(([^)]+)\)/.exec(agent);
  if (match) {
    const parts = match[1].split(';').map((part) => part.trim()).filter(Boolean);
    const candidate = parts.find((part) => /^[A-Z][A-Za-z0-9 _.+\-]{2,}$/.test(part) && !/Linux|Windows|Macintosh|Android|Mobile|X11/i.test(part));
    if (candidate) return candidate;
  }
  if (platform) return platform;
  return 'apk.js Browser';
}

function browserModelName(nav) {
  const agent = String(nav?.userAgent || '');
  if (/Edg\//.test(agent)) return 'Edge';
  if (/Firefox\//.test(agent)) return 'Firefox';
  if (/OPR\/|Opera/.test(agent)) return 'Opera';
  if (/Chrome\//.test(agent)) return 'Chrome';
  if (/Safari\//.test(agent)) return 'Safari';
  return 'Browser';
}

function buildSystemProperties() {
  const nav = readNavigator();
  const platform = detectPlatformName();
  const soc = detectSocPlatform();
  const language = String(nav?.language || 'en-US');
  return {
    'ro.product.brand': 'apk.js',
    'ro.product.manufacturer': 'apk.js',
    'ro.product.model': browserModelName(nav),
    'ro.product.nickname': browserMarketName(nav),
    'ro.product.odm.marketname': browserMarketName(nav),
    'ro.product.marketname': browserMarketName(nav),
    'ro.product.device': platform,
    'ro.product.name': platform,
    'ro.product.board': platform,
    'ro.product.cpu.abi': 'arm64-v8a',
    'ro.product.cpu.abilist': 'arm64-v8a,armeabi-v7a,armeabi',
    'ro.build.version.sdk': '31',
    'ro.build.version.release': '12',
    'ro.build.version.incremental': '1',
    'ro.build.id': 'SQ3A.220705.004',
    'ro.build.display.id': 'SQ3A.220705.004',
    'ro.build.fingerprint': `apk.js/${platform}/${platform}:12/SQ3A.220705.004/1:user/release-keys`,
    'ro.build.type': 'user',
    'ro.build.tags': 'release-keys',
    'ro.build.characteristics': 'default',
    'ro.hardware': soc,
    'ro.hardware.chipname': soc,
    'ro.board.platform': soc,
    'ro.soc.model': 'apk.js SoC',
    'ro.soc.manufacturer': 'apk.js',
    'ro.chipname': soc,
    'ro.serialno': 'unknown',
    'ro.bootloader': 'unknown',
    'ro.debuggable': '0',
    'persist.sys.timezone': 'Asia/Shanghai',
    'ro.product.locale': language,
    'ro.product.locale.language': language.split('-')[0] || 'en',
    'ro.product.locale.region': language.split('-')[1] || 'US',
  };
}

let cachedSystemProperties = null;

let cachedSystemFeatures = null;

export function systemFeatureNames() {
  if (cachedSystemFeatures) return cachedSystemFeatures;
  const capabilities = deviceCapabilities();
  const names = [
    'android.hardware.audio.output',
    'android.hardware.audio.low_latency',
    'android.hardware.audio.pro',
    'android.hardware.bluetooth',
    'android.hardware.camera',
    'android.hardware.camera.any',
    'android.hardware.faketouch',
    'android.hardware.fingerprint',
    'android.hardware.location',
    'android.hardware.location.network',
    'android.hardware.screen.landscape',
    'android.hardware.screen.portrait',
    'android.hardware.sensor.accelerometer',
    'android.hardware.sensor.gyroscope',
    'android.hardware.sensor.light',
    'android.hardware.sensor.proximity',
    'android.hardware.touchscreen',
    'android.hardware.type.television',
    'android.hardware.usb.host',
    'android.hardware.wifi',
    'android.software.webview',
  ];
  if (capabilities.touchPoints > 0) names.push('android.hardware.touchscreen.multitouch', 'android.hardware.touchscreen.multitouch.jazzhand');
  if (capabilities.cores >= 2) names.push('android.hardware.sensor.stepcounter');
  return (cachedSystemFeatures = names);
}

function systemProperties() {
  if (cachedSystemProperties) return cachedSystemProperties;
  const built = buildSystemProperties();
  if (readNavigator()) cachedSystemProperties = built;
  return built;
}

function systemProperty(key) {
  const properties = systemProperties();
  if (Object.prototype.hasOwnProperty.call(properties, key)) return properties[key];
  return '';
}

/** 深度优先查找当前持有焦点的子视图（对应 AOSP 的 mFocused 链路）。 */
function findFocusedDescendant(view) {
  if (!view) return null;
  if (view.focused === true) return view;
  for (const child of view.children || []) {
    const found = findFocusedDescendant(child);
    if (found) return found;
  }
  return view.child ? findFocusedDescendant(view.child) : null;
}

/** 把 0..1 的通道值打包成 ARGB 整数（对应 AOSP Color.rgb / Color.argb）。 */
function packArgb(alpha, red, green, blue) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round(Number(value) * 255)));
  return (((channel(alpha) << 24) | (channel(red) << 16) | (channel(green) << 8) | channel(blue)) >>> 0);
}

/** 本模拟器使用「低 32 位 ARGB + 第 32 位标记」的 64 位颜色表示，保证 pack/toArgb 往返一致。 */
function colorLongFromArgb(argb) {
  return (BigInt(argb >>> 0) | (1n << 32n));
}

function colorArgb(color) {
  try {
    return Number(BigInt.asUintN(64, BigInt(color)) & 0xffffffffn) >>> 0;
  } catch (_) {
    return toInt(color) >>> 0;
  }
}

function colorObject(vm, argb) {
  const object = vm.allocateRawObject('Landroid/graphics/Color;');
  object.$peer = { vm, argb: argb >>> 0 };
  return object;
}

function colorLuminance(argb) {
  return 0.2126 * (((argb >>> 16) & 0xff) / 255) + 0.7152 * (((argb >>> 8) & 0xff) / 255) + 0.0722 * ((argb & 0xff) / 255);
}

/** RGB→HSV，输入输出均为 0..1（对应 AOSP Color.RGBToHSV 的 float 约定）。 */
function rgbToHsv(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }
  return [hue, max === 0 ? 0 : delta / max, max];
}

function writeHsv(out, hsv) {
  if (!out?.$data) return;
  for (let i = 0; i < 3; i++) out.$data[i] = hsv[i];
}

function hsvToArgb(alpha, hsv) {
  const values = hsv?.$data || [];
  const hue = ((Number(values[0]) || 0) % 1 + 1) % 1;
  const saturation = Math.max(0, Math.min(1, Number(values[1]) || 0));
  const value = Math.max(0, Math.min(1, Number(values[2]) || 0));
  const sector = hue * 6;
  const index = Math.floor(sector) % 6;
  const fraction = sector - Math.floor(sector);
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * fraction);
  const t = value * (1 - saturation * (1 - fraction));
  const table = [[value, t, p], [q, value, p], [p, value, t], [p, q, value], [t, p, value], [value, p, q]];
  const [r, g, b] = table[index] || [0, 0, 0];
  const alphaByte = Math.max(0, Math.min(255, Math.round(Number(alpha) || 0)));
  return (((alphaByte << 24) | (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)) >>> 0);
}

/** 读取 Java Rect 对象的边界，并补上 Canvas 适配器需要的 width()/height()。 */
function rectPeerBounds(rect) {
  const peer = rect?.$peer ?? rect;
  if (!peer) return null;
  const left = Number(peer.left) || 0;
  const top = Number(peer.top) || 0;
  const right = Number(peer.right) || 0;
  const bottom = Number(peer.bottom) || 0;
  return { left, top, right, bottom, width: () => right - left, height: () => bottom - top };
}

function makeRectObject(vm, left, top, right, bottom) {
  const object = vm.allocateRawObject('Landroid/graphics/Rect;');
  const peer = object.$peer || (object.$peer = {});
  peer.rect = new Rect(left | 0, top | 0, right | 0, bottom | 0);
  if (!Object.prototype.hasOwnProperty.call(peer, 'left')) {
    for (const name of ['left', 'top', 'right', 'bottom']) {
      Object.defineProperty(peer, name, {
        configurable: true,
        enumerable: true,
        get: () => peer.rect[name],
        set: (value) => { peer.rect[name] = value | 0; },
      });
    }
  }
  return object;
}

/** Paint.breakText 的共用实现：按字符宽度累加，返回放得下的字符数并把宽度写入 measured。 */
function breakTextImpl(self, data, index, count, maxWidth, measured, forwards) {
  const limit = Number(maxWidth) || 0;
  const start = toInt(index);
  const total = toInt(count);
  let used = 0;
  let taken = 0;
  for (let i = 0; i < total; i++) {
    const offset = forwards ? start + i : start + total - 1 - i;
    const char = String.fromCharCode((data[offset] | 0) & 0xffff);
    const width = self.paint.measureText(char);
    if (used + width > limit) break;
    used += width;
    taken++;
  }
  if (measured?.$data) {
    if (measured.$data.length) measured.$data[0] = numberToFloatBits(used);
  }
  return taken;
}

function appendPathText(self, path, text, x, y) {
  const peer = path?.$peer;
  if (peer) {
    if (!Array.isArray(peer.textRuns)) peer.textRuns = [];
    peer.textRuns.push({ text: String(text || ''), x: Number(x) || 0, y: Number(y) || 0, textSize: Number(self.paint?.textSize) || 14 });
  }
}

function writeTextBounds(self, text, rect) {
  const peer = rect?.$peer;
  if (!peer) return;
  const metrics = self.paint.getFontMetricsInt();
  peer.rect = new Rect(0, metrics.ascent | 0, Math.round(self.paint.measureText(String(text || ''))), metrics.descent | 0);
}

function offsetForAdvance(self, text, advance) {
  const value = String(text || '');
  const limit = Number(advance) || 0;
  let used = 0;
  for (let i = 0; i < value.length; i++) {
    const width = self.paint.measureText(value[i]);
    if (used + width / 2 >= limit) return i;
    used += width;
  }
  return value.length;
}

const SHELL_LS_LINE = (name) => `lrwxrwxrwx 1 root root 16 2026-01-01 00:00 ${name} -> /dev/block/mmcblk0p1`;

function runShellCommand(command) {
  const text = String(command || '').trim();
  if (text.startsWith('ls ')) {
    const raw = text.slice(3).trim().replace(/^-{1,2}[a-zA-Z]+\s+/, '').trim();
    if (!raw) return '';
    const target = raw.replace(/["']/g, '');
    return VIRTUAL_FS.list(target)
      .map((name) => SHELL_LS_LINE(name))
      .join('\n');
  }
  if (text.startsWith('cat ')) {
    const target = text.slice(4).trim().split(/\s+/)[0].replace(/["']/g, '');
    const value = readFsText(target);
    return value ?? '';
  }
  if (text === 'mount' || text.startsWith('mount ')) {
    return readFsText('/proc/mounts').trim().split('\n').map((line) => {
      const [device, mountPoint, fsType, options] = line.split(/\s+/);
      return `${device} on ${mountPoint} type ${fsType} (${options})`;
    }).join('\n');
  }
  if (text.startsWith('getprop')) {
    const key = text.replace(/^getprop\s*/, '').replace(/["']/g, '').trim();
    if (!key) {
      return Object.entries(systemProperties()).map(([k, v]) => `[${k}]: [${v}]`).join('\n');
    }
    return systemProperty(key);
  }
  if (text.startsWith('echo ')) {
    return text.slice(5).trim().replace(/["']/g, '') + '\n';
  }
  return '';
}

class MessagePeer {
  constructor(vm) {
    this.vm = vm;
    this.what = 0;
    this.obj = null;
    this.callback = null;
  }
}

const RUNTIME_SINGLETON = { current: null };

function ensureRuntimeSingleton(vm) {
  if (RUNTIME_SINGLETON.current) return RUNTIME_SINGLETON.current;
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Ljava/lang/Runtime;');
  RUNTIME_SINGLETON.current = object;
  return object;
}

function makeFakeProcess(vm, command) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Ljava/lang/Process;');
  const output = new TextEncoder().encode(runShellCommand(command));
  object.$command = command;
  object.$output = output;
  object.$fields?.set('command', command);
  return object;
}

function makeSinkStream(vm) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Ljava/io/OutputStream;');
  object.$buffer = [];
  return object;
}

const INPUT_DEVICE_DEFINITIONS = (() => {
  const identity = hardwareIdentity();
  return [
  { id: 1, name: 'apk.js Touchscreen', vendorId: 1, productId: 1, descriptor: 'a1b2c3d4e5f60718', sources: 0x00001002 },
  { id: 2, name: 'apk.js Touch Keys', vendorId: 1, productId: 2, descriptor: 'b1b2c3d4e5f60719', sources: 0x00000101 },
  { id: 3, name: 'gpio-keys', vendorId: 1, productId: 3, descriptor: 'c1b2c3d4e5f6071a', sources: 0x00000101 },
    { id: 4, name: `${identity.soundCard} -snd-card`, vendorId: 1, productId: 4, descriptor: 'd1b2c3d4e5f6071b', sources: 0x00000001 },
    { id: 5, name: `${identity.soundCard} -snd-card`, vendorId: 1, productId: 5, descriptor: 'e1b2c3d4e5f6071c', sources: 0x00000001 },
  ];
})();

const SENSOR_DEFINITIONS = [
  { type: 1, name: 'Accelerometer', vendor: 'apk.js', stringType: 'android.sensor.accelerometer', power: 0.13, resolution: 0.0383, maxRange: 156.8 },
  { type: 4, name: 'Gyroscope', vendor: 'apk.js', stringType: 'android.sensor.gyroscope', power: 0.13, resolution: 0.0005, maxRange: 34.9 },
  { type: 2, name: 'Magnetometer', vendor: 'apk.js', stringType: 'android.sensor.magnetic_field', power: 0.75, resolution: 0.3, maxRange: 4912 },
  { type: 5, name: 'Light sensor', vendor: 'apk.js', stringType: 'android.sensor.light', power: 0.175, resolution: 1, maxRange: 40960 },
  { type: 8, name: 'Proximity sensor', vendor: 'apk.js', stringType: 'android.sensor.proximity', power: 0.175, resolution: 1, maxRange: 5 },
  { type: 3, name: 'Orientation sensor', vendor: 'apk.js', stringType: 'android.sensor.orientation', power: 0.25, resolution: 0.1, maxRange: 360 },
];

function toFloatArray(vm, values) {
  const numbers = Array.isArray(values)
    ? values.map((value) => Number(value) || 0)
    : [Number(values?.x) || 0, Number(values?.y) || 0, Number(values?.z) || 0];
  const array = vm.newArray('[F', numbers.length, 0);
  const target = array?.$data || array;
  for (let i = 0; i < numbers.length; i++) target[i] = numbers[i];
  return array;
}

function stopSensorTimer(self, listener) {
  const timers = self && self.$sensorTimers;
  if (!timers) return;
  const timer = timers.get(listener);
  if (timer !== undefined) {
    clearInterval(timer);
    timers.delete(listener);
  }
}

function buildSensors(vm) {
  return SENSOR_DEFINITIONS.map((def) => {
    const object = vm.allocateRawObject('Landroid/hardware/Sensor;');
    object.name = def.name;
    object.type = def.type;
    object.vendor = def.vendor;
    object.version = 1;
    object.power = def.power;
    object.resolution = def.resolution;
    object.maxRange = def.maxRange;
    object.minDelay = 10000;
    object.stringType = def.stringType;
    return { ...def, version: 1, minDelay: 10000, $object: object };
  });
}

const NATIVE_VIEW_CLASSES = {
  'Landroid/view/View;': View,
  'Landroid/view/ViewGroup;': ViewGroup,
  'Landroid/widget/FrameLayout;': FrameLayout,
  'Landroid/widget/GridLayout;': GridLayout,
  'Landroid/widget/LinearLayout;': LinearLayout,
  'Landroid/widget/RelativeLayout;': RelativeLayout,
  'Landroid/widget/HorizontalScrollView;': HorizontalScrollView,
  'Landroid/widget/TextView;': TextView,
  'Landroid/widget/CheckedTextView;': TextView,
  'Landroid/widget/Button;': Button,
  'Landroid/widget/EditText;': EditText,
  'Landroid/widget/ImageView;': ImageView,
  'Landroid/widget/ScrollView;': ScrollView,
  'Landroid/widget/ListView;': ListView,
  'Landroid/widget/ViewAnimator;': FrameLayout,
  'Landroid/widget/ViewFlipper;': FrameLayout,
  'Landroid/widget/AdapterViewFlipper;': FrameLayout,
  'Landroid/widget/ViewSwitcher;': FrameLayout,
  'Landroid/widget/TextSwitcher;': FrameLayout,
  'Landroid/widget/ImageSwitcher;': FrameLayout,
  'Landroid/widget/ProgressBar;': ProgressBar,
  'Landroid/widget/AbsoluteLayout;': AbsoluteLayout,
  'Landroid/widget/Switch;': Button,
  'Landroid/widget/AnalogClock;': AnalogClock,
  'Landroid/widget/TimePicker;': TimePicker,
  'Landroid/widget/DatePicker;': DatePicker,
  'Landroid/widget/CalendarView;': CalendarView,
  'Landroid/widget/NumberPicker;': NumberPicker,
  'Landroid/widget/CompoundButton;': Button,
  'Landroid/webkit/WebView;': WebView,
};

function stateSetStatic(ids) {
  return {
    lazy(vm) {
      const array = vm.newArray('[I', ids.length);
      for (let i = 0; i < ids.length; i++) array.$data[i] = ids[i] | 0;
      return array;
    },
  };
}

const RELATIVE_RULE_NAMES = {
  0: 'leftOf', 1: 'rightOf', 2: 'above', 3: 'below',
  4: 'alignBaseline', 5: 'alignLeft', 6: 'alignTop', 7: 'alignRight', 8: 'alignBottom',
  9: 'alignParentLeft', 10: 'alignParentTop', 11: 'alignParentRight', 12: 'alignParentBottom',
  13: 'centerInParent', 14: 'centerHorizontal', 15: 'centerVertical',
  16: 'alignStart', 17: 'alignEnd', 18: 'alignParentStart', 19: 'alignParentEnd',
  20: 'startOf', 21: 'endOf',
};

function ruleVerb(rule) {
  return RELATIVE_RULE_NAMES[rule >>> 0] || `rule${rule >>> 0}`;
}

function rectField(rect, name) {
  if (!rect) return 0;
  if (rect.$peer?.rect) return Number(rect.$peer.rect[name]) || 0;
  const v = rect.$fields?.get('Landroid/graphics/Rect;->' + name + ':I');
  return Number(v) || 0;
}

function setRectField(rect, name, value) {
  if (!rect) return;
  if (rect.$peer?.rect) rect.$peer.rect[name] = value | 0;
  if (rect.$peer) rect.$peer[name] = value | 0;
  if (!rect.$fields) return;
  let wrote = false;
  for (const key of rect.$fields.keys()) {
    if (key.endsWith('->' + name + ':I')) { rect.$fields.set(key, value | 0); wrote = true; }
  }
  if (!wrote) rect.$fields.set('Landroid/graphics/Rect;->' + name + ':I', value | 0);
}

function applyGravity(gravity, width, height, container, out, layoutDirection = 0) {
  if (!out) return;
  let g = gravity;
  if (layoutDirection === 1) {
    if ((g & 0x00800003) === 0x00800003) g = (g & ~0x00800003) | 0x00800005;
    else if ((g & 0x00800005) === 0x00800005) g = (g & ~0x00800005) | 0x00800003;
  }
  const cl = rectField(container, 'left');
  const ct = rectField(container, 'top');
  const cr = rectField(container, 'right');
  const cb = rectField(container, 'bottom');
  const containerW = cr - cl;
  const containerH = cb - ct;
  let x = 0;
  let y = 0;
  const absoluteGravity = g & 0x07;
  if ((absoluteGravity & 0x07) === 0x05) x = containerW - width;
  else if ((absoluteGravity & 0x07) !== 0x03) x = Math.trunc((containerW - width) / 2);
  const vgravity = g & 0x70;
  if (vgravity === 0x50) y = containerH - height;
  else if (vgravity !== 0x30) y = Math.trunc((containerH - height) / 2);
  setRectField(out, 'left', cl + x);
  setRectField(out, 'top', ct + y);
  setRectField(out, 'right', cl + x + width);
  setRectField(out, 'bottom', ct + y + height);
}

function popupLayout(peer) {
  const view = unwrapView(peer.contentView);
  if (!view) return null;
  const screen = peer.vm?.screen || null;
  const maxWidth = screen?.width || 360;
  const maxHeight = screen?.height || 640;
  const left = Math.max(0, Math.min(peer.$left | 0, maxWidth - 1));
  const top = Math.max(0, Math.min(peer.$top | 0, maxHeight - 1));
  const availableWidth = Math.max(0, maxWidth - left - 4);
  const availableHeight = Math.max(0, maxHeight - top - 4);
  let width = peer.width > 0 ? peer.width | 0 : 0;
  let height = peer.height > 0 ? peer.height | 0 : 0;
  const widthSpec = width > 0
    ? MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY)
    : MeasureSpec.makeMeasureSpec(availableWidth, MeasureSpec.AT_MOST);
  const heightSpec = height > 0
    ? MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    : MeasureSpec.makeMeasureSpec(availableHeight, MeasureSpec.AT_MOST);
  try {
    view.measure(widthSpec, heightSpec);
    if (!width) width = Math.min(view.getMeasuredWidth(), availableWidth);
    if (!height) height = Math.min(view.getMeasuredHeight(), availableHeight);
    view.layout(0, 0, width, height);
  } catch {
    return null;
  }
  peer.$width = width;
  peer.$height = height;
  return { view, left, top, width, height };
}

function dismissPopup(peer) {
  if (!peer || !peer.showing) return;
  const content = unwrapView(peer.contentView);
  if (content) delete content.$dismissPopup;
  peer.showing = false;
  const screen = peer.vm?.screen;
  if (peer.overlay && screen?.removeOverlay) screen.removeOverlay(peer.overlay);
  peer.overlay = null;
  const listener = peer.dismissListener;
  if (listener && peer.vm) {
    try {
      peer.vm.invokeByName('onDismiss', '()V', listener, []);
    } catch {
      /* 忽略回调异常 */
    }
  }
}

function dialogEnsureWindow(peer, vm) {
  if (!peer.windowObject) {
    const windowObject = vm.allocateRawObject('Landroid/view/Window;');
    windowObject.$peer = { dialog: peer, vm };
    peer.windowObject = windowObject;
  }
  return peer.windowObject;
}
function dialogRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Dialog 的配色一律取自当前主题，而不是写死深浅两套色值。
 * 之前的 peer.night 从未被赋值，暗色主题下对话框永远是白底。
 */
/** 读取清单属性并归一成字符串：字符串直接用，对象取 reference/stringValue。 */
function manifestAttrText(node, ...names) {
  for (const name of names) {
    const raw = node?.getAttribute?.(name);
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'object') {
      if (typeof raw.stringValue === 'string') return raw.stringValue;
      if (raw.value !== undefined && raw.value !== null) return String(raw.value);
      if (raw.reference !== undefined) return String(raw.reference);
    }
  }
  return '';
}

/** 清单里的类名可能是简写（`.MainActivity` / `MainActivity`），按包名补全。 */
function manifestClassName(rawName, packageName) {
  const name = String(rawName || '');
  if (!name) return '';
  if (name.startsWith('.')) return `${packageName}${name}`;
  if (!name.includes('.')) return `${packageName}.${name}`;
  return name;
}

function manifestApplicationEntries(vm, tagName) {
  const application = vm?.apk?.manifest?.findChild?.('application');
  return application?.findAll?.(tagName) || [];
}

/** 按 AOSP IntentFilter.match 的 action / category 语义匹配清单节点。 */
function intentFilterMatches(intent, filter) {
  const actions = (filter?.findAll?.('action') || [])
    .map((node) => manifestAttrText(node, 'android:name', 'name'))
    .filter(Boolean);
  const action = intent?.action ?? null;
  if (action) {
    if (!actions.includes(action)) return false;
  } else if (!actions.length) {
    return false;
  }
  const categories = (filter?.findAll?.('category') || [])
    .map((node) => manifestAttrText(node, 'android:name', 'name'))
    .filter(Boolean);
  for (const category of intent?.categories || []) {
    if (!categories.includes(category)) return false;
  }
  return true;
}

/** 解析 Intent 的目标组件：显式 className 优先，其次扫描清单里的 intent-filter。 */
function resolveIntentComponent(vm, intent, _pm) {
  if (!vm) return null;
  const packageName = intent?.packageName || vm.packageName || '';
  if (intent?.className) return { name: intent.className, packageName };
  for (const node of manifestApplicationEntries(vm, 'activity')) {
    const name = manifestClassName(manifestAttrText(node, 'android:name', 'name'), packageName);
    const filters = node?.findAll?.('intent-filter') || [];
    if (filters.some((filter) => intentFilterMatches(intent, filter))) return { name, packageName };
  }
  if (!intent?.action && !(intent?.categories || []).length) {
    const main = vm.findMainActivity?.(vm.apk?.manifest);
    if (main) {
      return { name: manifestClassName(manifestAttrText(main, 'android:name', 'name'), packageName), packageName };
    }
  }
  return null;
}

function activityInfoObject(vm, info) {
  const object = vm.allocateRawObject('Landroid/content/pm/ActivityInfo;');
  object.$peer = { vm, name: info.name, packageName: info.packageName };
  return object;
}

/** 组装 ResolveInfo：activityInfo / resolvePackageName / isDefault 与 AOSP 的字段对应。 */
function resolveInfoObject(vm, info, intent) {
  const object = vm.allocateRawObject('Landroid/content/pm/ResolveInfo;');
  object.$peer = {
    vm,
    activityInfo: activityInfoObject(vm, info),
    resolvePackageName: info.packageName,
    isDefault: false,
    priority: 0,
    preferredOrder: 0,
    match: 0,
    specificIndex: -1,
    labelRes: 0,
    nonLocalizedLabel: null,
    icon: 0,
    banner: 0,
    logo: 0,
    intent,
  };
  return object;
}

/** 从清单 `<application android:icon|banner|logo>` 取资源 id 并包成 Drawable。 */
function manifestDrawable(vm, attribute) {
  const application = vm?.apk?.manifest?.findChild?.('application');
  if (!application) return null;
  const raw = application.getAttribute?.(`android:${attribute}`) ?? application.getAttribute?.(attribute);
  let resId = 0;
  if (typeof raw === 'number') resId = raw >>> 0;
  else if (raw && typeof raw === 'object' && raw.reference !== undefined) resId = raw.reference >>> 0;
  if (!resId) return null;
  const description = vm.resources?.getDrawable?.(resId);
  return description ? drawableObject(vm, description) : null;
}

function applicationIconDrawable(vm) {
  return manifestDrawable(vm, 'icon');
}

function applicationBannerDrawable(vm) {
  return manifestDrawable(vm, 'banner') ?? manifestDrawable(vm, 'icon');
}

function applicationLogoDrawable(vm) {
  return manifestDrawable(vm, 'logo') ?? manifestDrawable(vm, 'icon');
}

/** 按 AOSP 顺序把事件从后往前派发给子视图，任一子视图消费即返回 true。 */
function dispatchToHostChildren(self, method, ...args) {
  const children = self?.view?.children || [];
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!child || child.visibility === 8) continue;
    if (typeof child[method] === 'function' && child[method](...args)) return true;
  }
  return false;
}

/** 与 IntentPeer 结构一致的裸对象，供静态工厂方法使用。 */
function makeIntentObject(vm) {
  const object = vm.allocateRawObject('Landroid/content/Intent;');
  object.$peer = {
    vm,
    action: null,
    component: null,
    className: null,
    packageName: null,
    data: null,
    type: null,
    identifier: null,
    categories: [],
    selector: null,
    clipData: null,
    sourceBounds: null,
    extras: new Map(),
    flags: 0,
    setClass(className) {
      this.className = normalizeClassName(className, this.vm?.packageName);
      this.packageName = packageOfClassName(this.className) || this.vm?.packageName || null;
      return this;
    },
  };
  return object;
}

function cloneIntent(vm, peer) {
  const object = vm.allocateRawObject('Landroid/content/Intent;');
  const copy = Object.assign(Object.create(Object.getPrototypeOf(peer)), peer);
  copy.extras = new Map(peer.extras || []);
  copy.categories = [...(peer.categories || [])];
  object.$peer = copy;
  return object;
}

function normalizeMimeType(type) {
  if (type === null || type === undefined) return null;
  const normalized = String(type).split(';')[0].trim().toLowerCase();
  return normalized || null;
}

function intentUriString(peer) {
  let result = 'intent:';
  if (peer?.className) result += `#Intent;component=${peer.packageName || ''}/${peer.className};`;
  else result += '#Intent;';
  if (peer?.action) result += `action=${peer.action};`;
  return `${result}end`;
}

/**
 * 清单 `<application>` 下的 `<meta-data>`：值可能是字符串、数字，或资源引用。
 * 资源引用先查资源表，查不到就保留 null（调用方按缺失处理）。
 */
function manifestMetaDataMap(vm, application) {
  const values = new Map();
  for (const node of application?.children || []) {
    if (!node || node.name !== 'meta-data') continue;
    const name = manifestAttrText(node, 'name');
    if (!name) continue;
    const raw = node.getAttribute?.('value');
    let value = null;
    if (typeof raw === 'string' || typeof raw === 'number') {
      value = raw;
    } else if (raw && typeof raw === 'object') {
      if (typeof raw.stringValue === 'string') value = raw.stringValue;
      else if (raw.reference !== undefined) {
        try {
          const resolved = vm?.resources?.resolve?.(raw.reference >>> 0);
          if (typeof resolved === 'string' || typeof resolved === 'number') value = resolved;
          else if (resolved && resolved.value !== undefined) value = resolved.value;
        } catch (_error) {
          value = null;
        }
      } else if (raw.value !== undefined) value = raw.value;
    }
    values.set(name, value);
  }
  return values;
}

function dialogTheme(peer) {
  const theme = peer.vm?.themeAttributes || {};
  const night = theme.isLightTheme === false;
  const surface = typeof theme.colorSurface === 'number' ? theme.colorSurface >>> 0 : (night ? 0xff1e1e1e : 0xffffffff);
  const onSurface = typeof theme.colorOnSurface === 'number' ? theme.colorOnSurface >>> 0 : (night ? 0xffffffff : 0xff212121);
  const accent = typeof theme.colorPrimary === 'number' ? theme.colorPrimary >>> 0 : 0xff3f51b5;
  return { night, surface, onSurface, accent, css: colorToCss(surface), onSurfaceCss: colorToCss(onSurface), accentCss: colorToCss(accent) };
}

function dialogLayout(peer, screen) {
  const sw = screen?.width || 360;
  const sh = screen?.height || 640;
  const density = Number(peer.vm?.resources?.displayMetrics?.density) || 1;
  const margin = 24 * density;
  const maxWidth = Math.max(1, sw - margin * 2);
  const width = Math.min(maxWidth, Math.max(280 * density, Math.round(sw * 0.86)));
  const message = String(peer.message ?? '');
  const messageLines = Math.max(1, Math.ceil(message.length / Math.max(16, Math.floor((width - 48 * density) / (8 * density)))));
  const titleHeight = peer.title ? 56 * density : 0;
  const messageHeight = message ? messageLines * 22 * density + 8 * density : 0;
  const contentHeight = peer.contentView ? Math.min(Math.round(sh * 0.56), 420 * density) : 0;
  const itemCount = Array.isArray(peer.items) ? peer.items.length : (peer.adapter ? Number(peer.adapterCount) || 0 : 0);
  const itemHeight = Math.min(Math.round(sh * 0.56), itemCount * 48 * density);
  const buttons = [peer.neutralText, peer.negativeText, peer.positiveText].filter(Boolean).length;
  const buttonHeight = buttons ? 52 * density : 0;
  const height = Math.min(sh - margin * 2, Math.max(96 * density, titleHeight + messageHeight + contentHeight + itemHeight + buttonHeight + 24 * density));
  return { width, height, left: Math.round((sw - width) / 2), top: Math.round((sh - height) / 2), density, titleHeight, messageHeight, buttonHeight, contentHeight, itemHeight };
}
function dialogDismiss(peer) {
  if (!peer.showing) return;
  peer.showing = false;
  const screen = peer.vm?.screen;
  if (screen && peer.overlay) screen.removeOverlay?.(peer.overlay);
  try { peer.vm?.invokeInterface?.(peer.dismissListener, 'onDismiss', '(Landroid/content/DialogInterface;)V', [peer.dialogObject || peer]); } catch (_) {}
}
function dialogShow(peer) {
  const vm = peer.vm;
  const screen = vm?.screen;
  if (!screen) return;
  peer.showing = true;
  peer.overlay = {
    draw: (ctx) => {
      const layout = dialogLayout(peer, screen);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(0, 0, screen.width, screen.height);
      const radius = 28 * (layout.density || 1);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 24 * (layout.density || 1);
      ctx.shadowOffsetY = 8 * (layout.density || 1);
      const theme = dialogTheme(peer);
      ctx.fillStyle = theme.css;
      dialogRoundRect(ctx, layout.left, layout.top, layout.width, layout.height, radius);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = theme.onSurfaceCss;
      ctx.font = 'bold ' + Math.round(20 * (layout.density || 1)) + 'px sans-serif';
      if (peer.title) ctx.fillText(String(peer.title), layout.left + 24 * (layout.density || 1), layout.top + 38 * (layout.density || 1));
      ctx.font = Math.round(14 * (layout.density || 1)) + 'px sans-serif';
      const message = String(peer.message ?? '');
      const words = message.split(/\s+/);
      let line = '';
      let y = layout.top + (peer.title ? 66 : 34);
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width > layout.width - 40) { ctx.fillText(line, layout.left + 20, y); y += 20; line = word; }
        else line = next;
      }
      if (line) ctx.fillText(line, layout.left + 20, y);
      if (peer.contentView) {
        const view = unwrapView(peer.contentView);
        if (view) {
          const contentWidth = layout.width - 40;
          const heightSpec = Math.round((layout.height - 40) * 0.65);
          view.measure(MeasureSpec.makeMeasureSpec(contentWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(heightSpec, MeasureSpec.AT_MOST));
          view.layout(0, 0, contentWidth, Math.max(view.getMeasuredHeight(), 0));
          ctx.save();
          ctx.translate(layout.left + 20, layout.top + 20);
          view.draw(createCanvasAdapter(ctx, screen));
          ctx.restore();
        }
      }
      peer.itemRects = [];
      if (peer.adapter) {
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.onSurfaceCss;
        const count = Number(peer.adapterCount) || 0;
        for (let index = 0; index < count; index += 1) {
          const top = layout.top + 20 + index * 44;
          const value = peer.adapterItems?.[index] ?? String(index);
          ctx.fillText(String(value), layout.left + 20, top + 26);
          peer.itemRects.push({ left: layout.left, top, right: layout.left + layout.width, bottom: top + 44, index });
        }
      } else if (Array.isArray(peer.items)) {
        ctx.textAlign = 'left';
        ctx.fillStyle = theme.onSurfaceCss;
        peer.items.forEach((item, index) => {
          const top = layout.top + 20 + index * 44;
          let prefix = '';
          if (peer.choiceMode === 'single') prefix = (peer.checkedIndex | 0) === index ? '● ' : '○ ';
          else if (peer.choiceMode === 'multi') prefix = peer.multiChecked?.[index] ? '☑ ' : '☐ ';
          ctx.fillText(prefix + String(item), layout.left + 20, top + 26);
          peer.itemRects.push({ left: layout.left, top, right: layout.left + layout.width, bottom: top + 44, index });
        });
      }
      const buttons = [
        peer.neutralText ? { label: String(peer.neutralText), kind: 'neutral' } : null,
        peer.negativeText ? { label: String(peer.negativeText), kind: 'negative' } : null,
        peer.positiveText ? { label: String(peer.positiveText), kind: 'positive' } : null,
      ].filter(Boolean);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#00796b';
      const density = layout.density || 1;
      let bx = layout.left + layout.width - 20 * density;
      peer.buttonRects = [];
      for (const button of buttons.reverse()) {
        const w = ctx.measureText(button.label).width;
        ctx.fillText(button.label, bx, layout.top + layout.height - 18 * density);
        peer.buttonRects.push({ left: bx - w - 12 * density, top: layout.top + layout.height - 48 * density, right: bx + 4, bottom: layout.top + layout.height - 8 * density, label: button.label, kind: button.kind });
        bx -= w + 32 * density;
      }
      ctx.textAlign = 'left';
      ctx.restore();
    },
    handleTouch: (event) => {
      if (event.action !== 'up') return true;
      const layout = dialogLayout(peer, screen);
      const inside = event.x >= layout.left && event.x <= layout.left + layout.width && event.y >= layout.top && event.y <= layout.top + layout.height;
      if (inside) {
        for (const rect of peer.itemRects || []) {
          if (event.x >= rect.left && event.x <= rect.right && event.y >= rect.top && event.y <= rect.bottom) {
            if (typeof peer.onItemSelected === 'function') {
              dialogDismiss(peer);
              peer.onItemSelected(rect.index);
              return true;
            }
            if (peer.choiceMode === 'multi') {
              peer.multiChecked[rect.index] = !peer.multiChecked[rect.index];
              try { peer.vm.invokeInterface(peer.multiListener, 'onClick', '(Landroid/content/DialogInterface;IZ)V', [peer.dialogObject || peer, rect.index, peer.multiChecked[rect.index]]); } catch (_) {}
              screen.invalidate?.();
              return true;
            }
            const listener = peer.itemListener;
            if (peer.choiceMode === 'single') peer.checkedIndex = rect.index;
            dialogDismiss(peer);
            try { peer.vm.invokeInterface(listener, 'onClick', '(Landroid/content/DialogInterface;I)V', [peer.dialogObject || peer, rect.index]); } catch (_) {}
            return true;
          }
        }
        for (const rect of peer.buttonRects || []) {
          if (event.x >= rect.left && event.x <= rect.right && event.y >= rect.top && event.y <= rect.bottom) {
            const kind = rect.kind || 'positive';
            const listener = kind === 'positive' ? peer.positiveListener : (kind === 'negative' ? peer.negativeListener : peer.neutralListener);
            dialogDismiss(peer);
            try { peer.vm.invokeInterface(listener, 'onClick', '(Landroid/content/DialogInterface;I)V', [peer.dialogObject || peer, kind === 'positive' ? -1 : (kind === 'negative' ? -2 : -3)]); } catch (_) {}
            return true;
          }
        }
        return true;
      }
      if (peer.cancelable !== false) dialogDismiss(peer);
      return true;
    },
  };
  screen.addOverlay(peer.overlay);
  try { peer.vm?.invokeInterface?.(peer.showListener, 'onShow', '(Landroid/content/DialogInterface;)V', [peer.dialogObject || peer]); } catch (_) {}
  screen.invalidate?.();
}

const CAMERA_KEY_NAMES = [
  'LENS_FACING', 'SENSOR_ORIENTATION', 'SENSOR_INFO_ACTIVE_ARRAY_SIZE',
  'SENSOR_INFO_PIXEL_ARRAY_SIZE', 'SENSOR_INFO_PHYSICAL_SIZE', 'SENSOR_INFO_SENSITIVITY_RANGE',
  'SCALER_STREAM_CONFIGURATION_MAP', 'SCALER_AVAILABLE_MAX_DIGITAL_ZOOM',
  'CONTROL_AF_AVAILABLE_MODES', 'LENS_INFO_AVAILABLE_APERTURES',
  'LENS_INFO_AVAILABLE_FOCAL_LENGTHS', 'LENS_INFO_MINIMUM_FOCUS_DISTANCE',
  'FLASH_INFO_AVAILABLE', 'INFO_SUPPORTED_HARDWARE_LEVEL', 'INFO_VERSION',
];

function cameraKey(name) {
  return { $descriptor: 'Landroid/hardware/camera2/CameraCharacteristics$Key;', $peer: { name } };
}

function cameraInstance(vm, id) {
  const object = vm.allocateRawObject('Landroid/hardware/Camera;');
  object.$peer = { vm, id: id | 0 };
  return object;
}

function cameraBox(vm, descriptor, value) {
  return vm.wrapPeer({ value, constructor: { $descriptor: descriptor } });
}

function cameraIntList(vm, values) {
  const list = vm.allocateRawObject('Ljava/util/ArrayList;');
  list.$peer = { items: values.map((value) => cameraBox(vm, 'Ljava/lang/Integer;', value | 0)) };
  return list;
}

function cameraSize(vm, width, height) {
  const object = vm.allocateRawObject('Landroid/hardware/Camera$Size;');
  object.$peer = { width, height };
  object.$fields?.set('width:I', width);
  object.$fields?.set('height:I', height);
  return object;
}

function cameraSizeList(vm, sizes) {
  const list = vm.allocateRawObject('Ljava/util/ArrayList;');
  list.$peer = { items: sizes.map(([w, h]) => cameraSize(vm, w, h)) };
  return list;
}

function cameraSizeArray(vm) {
  const sizes = [[4000, 3000], [1920, 1080], [1280, 720]];
  const array = vm.newArray('[Landroid/util/Size;', sizes.length, null);
  sizes.forEach(([w, h], index) => { array.$data[index] = cameraSize(vm, w, h); });
  return array;
}

function cameraStringList(vm, values) {
  const list = vm.allocateRawObject('Ljava/util/ArrayList;');
  list.$peer = { items: values.map((value) => jsString(value)) };
  return list;
}

function emptyJavaList(vm) {
  const list = vm.allocateRawObject('Ljava/util/ArrayList;');
  list.$peer = { items: [] };
  return list;
}

/** 由模拟器配置里的 locale（如 zh-CN）推出 ISO 国家码，供电话/网络信息使用。 */
function localeRegion(vm) {
  const locale = String(vm?.resources?.getConfiguration?.()?.locale || 'en-US');
  const region = locale.split(/[-_]/)[1];
  return (region || 'us').toLowerCase();
}

function telephonyObject(vm, descriptor) {
  const object = vm.allocateRawObject(descriptor);
  object.$peer = { vm };
  return object;
}

function buildSignalStrength(vm) {
  return telephonyObject(vm, 'Landroid/telephony/SignalStrength;');
}

function buildServiceState(vm) {
  return telephonyObject(vm, 'Landroid/telephony/ServiceState;');
}

function cameraParameters(vm) {
  const object = vm.allocateRawObject('Landroid/hardware/Camera$Parameters;');
  object.$peer = { vm };
  return object;
}

function cameraCharacteristicValue(vm, key, self) {
  const name = key?.$peer?.name || key?.name || jsString(key);
  const facing = self?.$peer?.facing ?? 1;
  if (name === 'LENS_FACING') return cameraBox(vm, 'Ljava/lang/Integer;', facing ? 1 : 0);
  if (name === 'SENSOR_ORIENTATION') return cameraBox(vm, 'Ljava/lang/Integer;', 90);
  if (name === 'SENSOR_INFO_ACTIVE_ARRAY_SIZE') {
    const rect = vm.allocateRawObject('Landroid/graphics/Rect;');
    rect.$peer = { left: 0, top: 0, right: 4000, bottom: 3000 };
    return rect;
  }
  if (name === 'SENSOR_INFO_PIXEL_ARRAY_SIZE') {
    const size = vm.allocateRawObject('Landroid/util/Size;');
    size.$peer = { width: 4000, height: 3000 };
    return size;
  }
  if (name === 'SENSOR_INFO_PHYSICAL_SIZE') {
    const size = vm.allocateRawObject('Landroid/util/SizeF;');
    size.$peer = { width: 5.6, height: 4.2 };
    return size;
  }
  if (name === 'SENSOR_INFO_SENSITIVITY_RANGE') {
    const range = vm.allocateRawObject('Landroid/util/Range;');
    range.$peer = { lower: 100, upper: 3200 };
    return range;
  }
  if (name === 'SCALER_AVAILABLE_MAX_DIGITAL_ZOOM') return cameraBox(vm, 'Ljava/lang/Float;', 8);
  if (name === 'CONTROL_AF_AVAILABLE_MODES') return vm.newArray('[I', 3, [1, 2, 3]);
  if (name === 'LENS_INFO_AVAILABLE_APERTURES') return toFloatArray(vm, [1.8]);
  if (name === 'LENS_INFO_AVAILABLE_FOCAL_LENGTHS') return toFloatArray(vm, [4.2]);
  if (name === 'LENS_INFO_MINIMUM_FOCUS_DISTANCE') return cameraBox(vm, 'Ljava/lang/Float;', 0.1);
  if (name === 'FLASH_INFO_AVAILABLE') return cameraBox(vm, 'Ljava/lang/Boolean;', facing === 1);
  if (name === 'INFO_SUPPORTED_HARDWARE_LEVEL') return cameraBox(vm, 'Ljava/lang/Integer;', 1);
  if (name === 'INFO_VERSION') return '3.2';
  if (name === 'SCALER_STREAM_CONFIGURATION_MAP') {
    const map = vm.allocateRawObject('Landroid/hardware/camera2/params/StreamConfigurationMap;');
    map.$peer = { vm };
    return map;
  }
  return null;
}

function applicationLabel(vm, fallback) {
  const application = vm.apk?.manifest?.findChild?.('application');
  if (!application) return fallback;
  const raw = application.getAttribute?.('android:label') ?? application.getAttribute?.('label');
  if (raw === null || raw === undefined || raw === '') return fallback;
  const resolveId = (id) => {
    try { return vm.resources?.getString?.(id >>> 0) ?? null; } catch (_) { return null; }
  };
  if (typeof raw === 'object' && raw !== null && 'reference' in raw) return resolveId(raw.reference) || fallback;
  if (typeof raw === 'number') return resolveId(raw) || fallback;
  if (typeof raw === 'string') {
    const match = raw.match(/^@(0x[0-9a-f]+|\d+)$/i);
    if (match) return resolveId(match[1].startsWith('0x') ? parseInt(match[1], 16) : parseInt(match[1], 10)) || fallback;
    return raw;
  }
  return fallback;
}

function makeColorStateList(vm, info) {
  const object = vm.allocateRawObject('Landroid/content/res/ColorStateList;');
  object.$peer = { states: info.states, colors: info.colors, color: info.color };
  return object;
}

function showPopup(peer, left, top) {
  const vm = peer?.vm;
  const screen = vm?.screen;
  if (!screen || !peer.contentView) return;
  dismissPopup(peer);
  const maxWidth = screen.width || 360;
  const maxHeight = screen.height || 640;
  let resolvedLeft = Math.max(0, Math.min(left | 0, Math.max(0, maxWidth - 16)));
  if ((left | 0) < 0 || (left | 0) + (peer.width > 0 ? peer.width : 0) > maxWidth) {
    resolvedLeft = Math.max(0, maxWidth - (peer.width > 0 ? peer.width : 0) - 4);
  }
  peer.$left = resolvedLeft;
  peer.$top = Math.max(0, Math.min(top | 0, Math.max(0, maxHeight - 16)));
  peer.overlay = {
    draw: (ctx) => {
      const layout = popupLayout(peer);
      if (!layout || !layout.width || !layout.height) return;
      const { view, width, height } = layout;
      const x = peer.$left | 0;
      const y = peer.$top | 0;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, width, height);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      ctx.translate(x, y);
      view.draw(createCanvasAdapter(ctx, screen));
      ctx.restore();
    },
    handleTouch: (event) => {
      const layout = popupLayout(peer);
      if (!layout) {
        dismissPopup(peer);
        return true;
      }
      const x = peer.$left | 0;
      const y = peer.$top | 0;
      const inside = event.x >= x && event.x < x + layout.width && event.y >= y && event.y < y + layout.height;
      if (inside) {
        const target = layout.view;
        const local = { ...event, x: event.x - x, y: event.y - y };
        try {
          target.dispatchTouchEvent(local);
        } catch {
          /* 忽略内容视图异常 */
        }
        return true;
      }
      dismissPopup(peer);
      return true;
    },
  };
  const contentView = unwrapView(peer.contentView);
  if (contentView) contentView.$dismissPopup = () => dismissPopup(peer);
  peer.showing = true;
  screen.addOverlay(peer.overlay);
  screen.invalidate?.();
}

function showPopupAsDropDown(peer, anchor, xoff, yoff) {
  const anchorView = unwrapView(anchor);
  if (!anchorView) return;
  const point = [0, 0];
  anchorView.getLocationOnScreen(point);
  const anchorHeight = anchorView.getHeight?.() || 0;
  showPopup(peer, point[0] + (xoff | 0), point[1] + anchorHeight + (yoff | 0));
}

function showPopupAtLocation(peer, parent, gravity, x, y) {
  const screen = peer.vm?.screen;
  const maxWidth = screen?.width || 360;
  const maxHeight = screen?.height || 640;
  let left = x | 0;
  let top = y | 0;
  if ((gravity | 0) & 0x01) left = Math.round((maxWidth - (peer.width > 0 ? peer.width : maxWidth / 2)) / 2);
  if ((gravity | 0) & 0x10) top = Math.round((maxHeight - (peer.height > 0 ? peer.height : maxHeight / 2)) / 2);
  showPopup(peer, left, top);
}

class PopupWindowPeer {
  constructor(vm, object) {
    this.vm = vm;
    this.object = object;
    this.contentView = null;
    this.width = 0;
    this.height = 0;
    this.focusable = false;
    this.outsideTouchable = false;
    this.touchable = true;
    this.touchModal = false;
    this.clippingEnabled = true;
    this.overlapAnchor = false;
    this.showing = false;
    this.overlay = null;
    this.dismissListener = null;
    this.background = null;
    this.animationStyle = 0;
    this.elevation = 0;
    this.inputMethodMode = 0;
    this.softInputMode = 0;
    this.windowLayoutType = 0;
    this.windowLayoutMode = 0;
    this.$left = 0;
    this.$top = 0;
    this.$width = 0;
    this.$height = 0;
  }
}

function viewPeerConstructor(descriptor, superDescriptor = null) {
  const ViewClass = NATIVE_VIEW_CLASSES[descriptor]
    || (superDescriptor ? NATIVE_VIEW_CLASSES[superDescriptor] : null)
    || View;
  return class NativeViewPeer {
    constructor(vm, object) {
      this.vm = vm;
      this.object = object;
      if (!object.$view) {
        const context = vm.contextObject || null;
        object.$view = new ViewClass(context);
        object.$view.$vm = vm;
        object.$view.$javaObject = object;
        const viewDescriptor = object.$runtimeClass?.descriptor || object.$nativeClass || descriptor;
        object.$view.$descriptor = viewDescriptor;
        if (!object.$nativeClass) object.$nativeClass = viewDescriptor;
        viewDescriptor && object.$fields?.set(
          `${viewDescriptor}->$view:Landroid/view/View;`,
          object.$view
        );
      }
      this.view = object.$view;
    }
  };
}

function adoptLayoutParams(vm, self, params) {
  const object = self && self.object;
  if (!vm || !object || typeof vm.invokeByName !== 'function') return params;
  try {
    if (!params) {
      return vm.invokeByName(
        'generateDefaultLayoutParams',
        '()Landroid/view/ViewGroup$LayoutParams;',
        object,
        []
      ) || params;
    }
    const valid = vm.invokeByName(
      'checkLayoutParams',
      '(Landroid/view/ViewGroup$LayoutParams;)Z',
      object,
      [params]
    );
    if (!valid) {
      return vm.invokeByName(
        'generateLayoutParams',
        '(Landroid/view/ViewGroup$LayoutParams;)Landroid/view/ViewGroup$LayoutParams;',
        object,
        [params]
      ) || params;
    }
  } catch {
    return params;
  }
  return params;
}

function jsonBox(vm, value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return jsonMake(vm, 'Lorg/json/JSONArray;', 'items', value);
  if (typeof value === 'object') return jsonMake(vm, 'Lorg/json/JSONObject;', 'map', value);
  return value;
}
function jsonMake(vm, descriptor, field, value) {
  if (value === null || value === undefined) return null;
  const object = vm.allocateRawObject(descriptor);
  object.$peer = { [field]: field === 'items' ? (Array.isArray(value) ? value : []) : (value && typeof value === 'object' ? value : Object.create(null)) };
  return object;
}
function jsonUnbox(vm, value) {
  if (value && typeof value === 'object') {
    if (value.$peer?.items) return value.$peer.items;
    if (value.$peer?.map) return value.$peer.map;
  }
  return value;
}

export function nativeClass(descriptor, options) {
  return new NativeClassDef(descriptor, options);
}

export function registerFrameworkNativeClasses(vm) {
  const definitions = buildFrameworkDefinitions(vm);
  for (const def of definitions) vm.registry.registerNative(def);
  injectViewConstructors(vm);
  return vm;
}

function computeVelocity(peer, units, maxVelocity) {
  if (!peer) return;
  const scale = Number(units) || 1;
  const samples = Array.isArray(peer.samples) ? peer.samples : [];
  if (samples.length < 2) {
    peer.xVelocity = 0;
    peer.yVelocity = 0;
    return;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = last.t - first.t;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    peer.xVelocity = 0;
    peer.yVelocity = 0;
    return;
  }
  let vx = ((last.x - first.x) / elapsed) * scale;
  let vy = ((last.y - first.y) / elapsed) * scale;
  const limit = Number(maxVelocity) || 0;
  if (limit > 0) {
    vx = Math.max(-limit, Math.min(limit, vx));
    vy = Math.max(-limit, Math.min(limit, vy));
  }
  peer.xVelocity = vx;
  peer.yVelocity = vy;
}

function isViewDescriptor(vm, descriptor) {
  if (!descriptor || !descriptor.startsWith('L')) return false;
  if (Object.prototype.hasOwnProperty.call(NATIVE_VIEW_CLASSES, descriptor)) return true;
  const seen = new Set();
  let desc = descriptor;
  while (desc && !seen.has(desc)) {
    seen.add(desc);
    if (desc === 'Landroid/view/View;' || desc === 'Landroid/view/ViewGroup;') return true;
    desc = vm?.registry?.findDexClass?.(desc)?.superclass || null;
  }
  return false;
}

const VIEW_CONSTRUCTOR_SIGNATURES = [
  '()V',
  '(Landroid/content/Context;)V',
  '(Landroid/content/Context;Landroid/util/AttributeSet;)V',
  '(Landroid/content/Context;Landroid/util/AttributeSet;I)V',
];

function injectViewConstructors(vm) {
  for (const [descriptor, def] of vm.registry.nativeDefs) {
    if (!def || !def.ctor) continue;
    if (!isViewDescriptor(vm, descriptor)) continue;
    for (const signature of VIEW_CONSTRUCTOR_SIGNATURES) {
      const key = `<init>${signature}`;
      if (def.methods.has(key)) continue;
      if (signature === '(Landroid/content/Context;)V' || signature === '(Landroid/content/Context;Landroid/util/AttributeSet;)V' || signature === '(Landroid/content/Context;Landroid/util/AttributeSet;I)V') {
        def.methods.set(key, (self, args) => {
          const context = args && args[0];
          if (self && self.$view && context) {
            self.$view.context = context;
            if (context.vm || context.$vm) self.$view.vm = context.vm || context.$vm;
          }
          return undefined;
        });
        continue;
      }
      def.methods.set(key, () => undefined);
    }
  }
}

function normalizeClassName(name, packageName) {
  if (name === null || name === undefined) return null;
  let text = String(name);
  if (text.startsWith('L') && text.endsWith(';') && text.includes('/')) {
    text = text.slice(1, -1).replace(/\//g, '.');
  }
  if (text.startsWith('.')) return `${packageName || ''}${text}`;
  if (!text.includes('.')) return `${packageName || ''}.${text}`;
  return text;
}

function packageOfClassName(className) {
  if (!className) return null;
  const index = className.lastIndexOf('.');
  return index < 0 ? null : className.slice(0, index);
}

function metricsValue(metrics, name, fallback = 0) {
  if (!metrics) return fallback;
  if (metrics.$fields) {
    for (const [key, value] of metrics.$fields) {
      if (key.endsWith(`->${name}:F`)) return floatBitsToNumber(Number(value) | 0);
      if (key.endsWith(`->${name}:I`)) return Number(value) | 0;
    }
  }
  if (metrics.$peer && metrics.$peer[name] !== undefined) {
    const value = Number(metrics.$peer[name]);
    return Number.isFinite(value) ? value : fallback;
  }
  const direct = Number(metrics[name]);
  return Number.isFinite(direct) ? direct : fallback;
}

function rectFNumber(bits) {
  return floatBitsToNumber(Number(bits) | 0);
}

function rectFBits(value) {
  return numberToFloatBits(Number(value) || 0);
}

function readRectF(vm, rect) {
  const stored = !!(rect && (rect.$peer || rect.$fields));
  const read = (name) => {
    let raw;
    if (typeof vm?.getField === 'function') {
      raw = vm.getField(rect, { classDesc: 'Landroid/graphics/RectF;', name, type: 'F' });
    } else {
      raw = rect?.$peer?.[name] ?? rect?.[name];
    }
    return stored ? floatBitsToNumber(Number(raw) | 0) : Number(raw) || 0;
  };
  return [read('left'), read('top'), read('right'), read('bottom')];
}

function writeRectF(vm, rect, left, top, right, bottom) {
  if (!rect) return;
  const values = { left, top, right, bottom };
  for (const [name, value] of Object.entries(values)) {
    if (typeof vm?.setField === 'function') {
      vm.setField(rect, { classDesc: 'Landroid/graphics/RectF;', name, type: 'F' }, numberToFloatBits(value));
    } else if (rect.$peer) {
      rect.$peer[name] = numberToFloatBits(value);
    }
  }
}

function resolveBitmapPeer(vm, bitmap) {
  if (!bitmap) return null;
  const peer = bitmap.$peer || bitmap;
  if (peer.image) return peer;
  if (peer.bitmap?.image) return peer.bitmap;
  if (bitmap.$peer?.bitmap?.image) return bitmap.$peer.bitmap;
  return peer;
}

function toIntValue(vm, fieldPeer, args) {
  const [target] = args || [];
  const value = fieldPeer.isStatic
    ? vm.getStaticField({ classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type })
    : vm.getField(target, { classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type });
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function setFieldValue(vm, fieldPeer, target, value) {
  const field = { classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type };
  if (fieldPeer.isStatic) {
    vm.setStaticField(field, value);
    return;
  }
  if (target === null || target === undefined) {
    vm.throwException('Ljava/lang/NullPointerException;', `写入字段 ${fieldPeer.name} 时对象为空`);
  }
  vm.setField(target, field, value);
}

function syncDexViewField(self, vm, name, type, value) {
  const object = self && self.object;
  if (!object || !object.$fields) return;
  const engine = self.vm || vm || object.$vm;
  if (!engine || typeof engine.setField !== 'function') return;
  try {
    engine.setField(object, { classDesc: 'Landroid/view/View;', name, type }, value);
  } catch {}
}

export function buildFrameworkDefinitions(vm) {
  const defs = [];
  defs.push(
    nativeDef('Landroid/app/Activity;', {
      super: 'Landroid/content/ContextThemeWrapper;',
      interfaces: ['Landroid/view/Window$Callback;'],
      instanceFields: new Map([
        ['$activity', null],
        ['$window', null],
        ['$contentView', null],
        ['$decorView', null],
        ['$title', null],
      ]),
      ctor: class ActivityPeer extends ActivityHost {
        constructor(vm, object) {
          super(vm, object);
          this.activity = this;
        }

        getContextObject() {
          return this.object;
        }

        setContentViewView(view) {
          this.setContentView(unwrapView(view) || view);
        }

        finishActivity() {
          this.finish();
        }
      },
      methods: {
        'showDialog(I)Landroid/app/Dialog;': (self, [id], vm) => {
          const activity = self.object || self.$object || vm.activity;
          if (!vm.$activityDialogs) vm.$activityDialogs = new Map();
          let dialog = vm.$activityDialogs.get(id | 0);
          if (!dialog) {
            try { dialog = vm.invokeByName('onCreateDialog', '(I)Landroid/app/Dialog;', activity, [id | 0]); } catch (_) { dialog = null; }
            if (dialog) vm.$activityDialogs.set(id | 0, dialog);
          }
          if (dialog) {
            try { vm.invokeByName('onPrepareDialog', '(ILandroid/app/Dialog;)V', activity, [id | 0, dialog]); } catch (_) {}
            try { vm.invokeByName('show', '()V', dialog, []); } catch (_) {}
          }
          return dialog ?? null;
        },
        'showDialog(ILandroid/os/Bundle;)Landroid/app/Dialog;': (self, [id], vm) => vm.invokeByName('showDialog', '(I)Landroid/app/Dialog;', self.object || self.$object || vm.activity, [id]),
        'dismissDialog(I)V': (self, [id], vm) => {
          const dialog = vm.$activityDialogs?.get(id | 0);
          if (dialog) { try { vm.invokeByName('dismiss', '()V', dialog, []); } catch (_) {} }
        },
        'removeDialog(I)V': (self, [id], vm) => {
          const dialog = vm.$activityDialogs?.get(id | 0);
          if (dialog) { try { vm.invokeByName('dismiss', '()V', dialog, []); } catch (_) {} vm.$activityDialogs.delete(id | 0); }
        },

        'requestPermissions([Ljava/lang/String;I)V': (self, [permissions, requestCode], vm) => {
          const count = permissions?.$data?.length ?? 0;
          const granted = vm.newArray('I', count, new Array(count).fill(0));
          const activity = self.object || self.$object || vm.activity;
          try { vm.invokeByName('onRequestPermissionsResult', '(I[Ljava/lang/String;[I)V', activity, [requestCode | 0, permissions, granted]); } catch (_) {}
        },
        'checkCallingOrSelfPermission(Ljava/lang/String;)I': () => 0,
        'checkCallingPermission(Ljava/lang/String;)I': () => 0,
        'onCreatePanelView(I)Landroid/view/View;': () => null,
        'onCreatePanelMenu(ILandroid/view/Menu;)Z': (self, [featureId, menu], vm) => {
          if ((featureId | 0) !== 0 || !menu) return false;
          try {
            return !!vm.invokeByName('onCreateOptionsMenu', '(Landroid/view/Menu;)Z', self.object || self, [menu]);
          } catch {
            return false;
          }
        },
        'onPreparePanel(ILandroid/view/View;Landroid/view/Menu;)Z': (self, [featureId, view, menu], vm) => {
          if ((featureId | 0) !== 0 || !menu) return false;
          try {
            return vm.invokeByName('onPrepareOptionsMenu', '(Landroid/view/Menu;)Z', self.object || self, [menu]) !== false;
          } catch {
            return true;
          }
        },
        'onMenuOpened(ILandroid/view/Menu;)Z': () => true,
        'onPanelClosed(ILandroid/view/Menu;)V': () => undefined,
        'onMenuItemSelected(ILandroid/view/MenuItem;)Z': (self, [featureId, item], vm) => {
          try {
            if ((featureId | 0) === 0) {
              return !!vm.invokeByName('onOptionsItemSelected', '(Landroid/view/MenuItem;)Z', self.object || self, [item]);
            }
            if ((featureId | 0) === 6) {
              return !!vm.invokeByName('onContextItemSelected', '(Landroid/view/MenuItem;)Z', self.object || self, [item]);
            }
          } catch {
            return false;
          }
          return false;
        },
        'dispatchKeyEvent(Landroid/view/KeyEvent;)Z': (self, [event], vm) => dispatchActivityKeyEvent(self, event, vm),
        'dispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': (self, [event], vm) => dispatchActivityKeyEvent(self, event, vm),

        '<init>()V': () => undefined,
        'onCreate(Landroid/os/Bundle;)V': (self, _args, vm) => {
          vm.log('info', 'Activity', '默认 onCreate（未覆写）');
        },
        'onStart()V': () => undefined,
        'onPostResume()V': () => undefined,
        'onResume()V': () => undefined,
        'invalidateOptionsMenu()V': () => undefined,
        'getApplication()Landroid/app/Application;': (self, _args, vm) => vm.applicationObject ?? null,
        'registerActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'onPause()V': () => undefined,
        'onStop()V': () => undefined,
        'onDestroy()V': () => undefined,
        'onRestart()V': () => undefined,
        'onBackPressed()V': (self) => {
          self.finish?.();
        },
        'getCurrentFocus()Landroid/view/View;': (self) => {
          const focused = findFocusedDescendant(self.decorView);
          return focused ? viewObject(self.vm, focused) : null;
        },
        'attachBaseContext(Landroid/content/Context;)V': (self, [context]) => {
          self.base = context ?? null;
        },
        'getParent()Landroid/app/Activity;': () => null,
        'isChild()Z': () => false,
        'getLoaderManager()Landroid/app/LoaderManager;': () => null,
        'getAutofillClient()Landroid/view/autofill/AutofillManager$AutofillClient;': () => null,
        'getContentCaptureClient()Landroid/view/contentcapture/ContentCaptureManager$ContentCaptureClient;': () => null,
        'getSplashScreen()Landroid/window/SplashScreen;': () => null,
        'setSplashScreenView(Landroid/window/SplashScreenView;)V': () => undefined,
        'setLocusContext(Landroid/content/LocusId;Landroid/os/Bundle;)V': () => undefined,
        'onCreate(Landroid/os/Bundle;Landroid/os/PersistableBundle;)V': (self, [state], vm) => {
          try { vm.invokeByName('onCreate', '(Landroid/os/Bundle;)V', self.object || self, [state ?? null]); } catch (_error) { /* 应用未覆写 */ }
        },
        'onPostCreate(Landroid/os/Bundle;)V': () => undefined,
        'onPostCreate(Landroid/os/Bundle;Landroid/os/PersistableBundle;)V': (self, [state], vm) => {
          try { vm.invokeByName('onPostCreate', '(Landroid/os/Bundle;)V', self.object || self, [state ?? null]); } catch (_error) { /* 应用未覆写 */ }
        },
        'onSaveInstanceState(Landroid/os/Bundle;Landroid/os/PersistableBundle;)V': (self, [state], vm) => {
          try { vm.invokeByName('onSaveInstanceState', '(Landroid/os/Bundle;)V', self.object || self, [state ?? null]); } catch (_error) { /* 应用未覆写 */ }
        },
        'onRestoreInstanceState(Landroid/os/Bundle;Landroid/os/PersistableBundle;)V': (self, [state], vm) => {
          try { vm.invokeByName('onRestoreInstanceState', '(Landroid/os/Bundle;)V', self.object || self, [state ?? null]); } catch (_error) { /* 应用未覆写 */ }
        },
        'onNewIntent(Landroid/content/Intent;)V': (self, [intent]) => {
          self.intent = intent ?? null;
        },
        'onStateNotSaved()V': () => undefined,
        'onTopResumedActivityChanged(Z)V': () => undefined,
        'onUserLeaveHint()V': () => undefined,
        'onMultiWindowModeChanged(Z)V': () => undefined,
        'onMultiWindowModeChanged(ZLandroid/content/res/Configuration;)V': () => undefined,
        'isInMultiWindowMode()Z': () => false,
        'onPictureInPictureModeChanged(Z)V': () => undefined,
        'onPictureInPictureModeChanged(ZLandroid/content/res/Configuration;)V': () => undefined,
        'onPictureInPictureUiStateChanged(Landroid/app/PictureInPictureUiState;)V': () => undefined,
        'isInPictureInPictureMode()Z': () => false,
        'enterPictureInPictureMode()V': () => undefined,
        'enterPictureInPictureMode(Landroid/app/PictureInPictureParams;)Z': () => false,
        'setPictureInPictureParams(Landroid/app/PictureInPictureParams;)V': () => undefined,
        'getMaxNumPictureInPictureActions()I': () => 0,
        'onPictureInPictureRequested()Z': () => false,
        'isVoiceInteraction()Z': () => false,
        'isVoiceInteractionRoot()Z': () => false,
        'getVoiceInteractor()Landroid/app/VoiceInteractor;': () => null,
        'isLocalVoiceInteractionSupported()Z': () => false,
        'startLocalVoiceInteraction(Landroid/os/Bundle;)V': () => undefined,
        'stopLocalVoiceInteraction()V': () => undefined,
        'onLocalVoiceInteractionStarted()V': () => undefined,
        'onLocalVoiceInteractionStopped()V': () => undefined,
        'onMovedToDisplay(ILandroid/content/res/Configuration;)V': () => undefined,
        'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
        'getChangingConfigurations()I': () => 0,
        'getLastNonConfigurationInstance()Ljava/lang/Object;': () => null,
        'onRetainNonConfigurationInstance()Ljava/lang/Object;': () => null,
        'onLowMemory()V': () => undefined,
        'onTrimMemory(I)V': () => undefined,
        'onCreateThumbnail(Landroid/graphics/Bitmap;Landroid/graphics/Canvas;)Z': () => false,
        'onCreateDescription()Ljava/lang/CharSequence;': () => null,
        'onProvideAssistData(Landroid/os/Bundle;)V': () => undefined,
        'onProvideAssistContent(Landroid/app/assist/AssistContent;)V': () => undefined,
        'onGetDirectActions(Landroid/os/CancellationSignal;Ljava/util/function/Consumer;)V': () => undefined,
        'onPerformDirectAction(Ljava/lang/String;Landroid/os/Bundle;Landroid/os/CancellationSignal;Ljava/util/function/Consumer;)V': () => undefined,
        'onProvideKeyboardShortcuts(Ljava/util/List;Landroid/view/Menu;I)V': () => undefined,
        'requestShowKeyboardShortcuts()V': () => undefined,
        'dismissKeyboardShortcutsHelper()V': () => undefined,
        'showAssist(Landroid/os/Bundle;)Z': () => false,
        'reportFullyDrawn()V': () => undefined,
        'unregisterActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'getNextAutofillId()I': (self) => {
          const next = Number(self.$nextAutofillId) || 1;
          self.$nextAutofillId = next + 1;
          return next;
        },
        'autofillClientGetNextAutofillId()Landroid/view/autofill/AutofillId;': () => null,
        'onSaveInstanceState(Landroid/os/Bundle;)V': () => undefined,
        'onRestoreInstanceState(Landroid/os/Bundle;)V': () => undefined,
        'setContentView(I)V': (self, [resId], vm) => {
          const inflater = new LayoutInflater(vm.contextObject);
          inflater.vm = vm;
          const view = inflater.inflate(resId);
          self.setContentView(view);
        },
        'setContentView(Landroid/view/View;)V': (self, [view]) => {
          self.setContentView(unwrapView(view) || view);
        },
        'setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view]) => {
          self.setContentView(unwrapView(view) || view);
        },
        'getContentView()Landroid/view/View;': (self) => (self.contentView ? viewObject(self.vm, self.contentView) : null),
        'findViewById(I)Landroid/view/View;': (self, [id]) => self.findViewById(id),
        'getWindow()Landroid/view/Window;': (self) => self.getWindowObject(),
        'getFragmentManager()Landroid/app/FragmentManager;': (self, _args, vm) => getFragmentManagerObject(vm),
        'getWindowManager()Landroid/view/WindowManager;': (self) => ({ $descriptor: 'Landroid/view/WindowManager;' }),
        'getLayoutInflater()Landroid/view/LayoutInflater;': (self, _args, vm) => { const li = new LayoutInflater(vm.contextObject); li.vm = vm; return li; },
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => vm.resources,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;': (self, [name], vm) => {
          const prefs = vm.allocateRawObject('Landroid/content/SharedPreferences;');
          prefs.$peer = { name: jsString(name) };
          return prefs;
        },
        'getFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile?.('/data/user/0/' + (vm.packageName || 'app') + '/files') ?? null,
        'getCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile?.('/data/user/0/' + (vm.packageName || 'app') + '/cache') ?? null,
        'getDir(Ljava/lang/String;I)Ljava/io/File;': (self, [name], vm) =>
          vm.makeFile?.('/data/user/0/' + (vm.packageName || 'app') + '/app_' + jsString(name)) ?? null,
        'getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;': (self, [type], vm) => {
          const suffix = type ? '/' + jsString(type) : '';
          return vm.makeFile?.('/storage/emulated/0/Android/data/' + (vm.packageName || 'app') + '/files' + suffix) ?? null;
        },
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
          return vm.classLoaderObject;
        },
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.packageName || '',
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self, _args, vm) => {
          const info = vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;');
          info.$peer = { packageName: vm.packageName || '' };
          return info;
        },
        'getPackageManager()Landroid/content/pm/PackageManager;': (self, _args, vm) => {
          if (!vm.packageManagerObject) {
            vm.packageManagerObject = vm.allocateRawObject('Landroid/content/pm/PackageManager;');
            vm.packageManagerObject.$peer = { vm };
          }
          return vm.packageManagerObject;
        },
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => {
          const key = jsString(name);
          return vm.getSystemService?.(key) ?? null;
        },
        'getSystemService(Ljava/lang/Class;)Ljava/lang/Object;': (self, [clazz], vm) => vm.getSystemServiceByClass?.(clazz) ?? null,
        'getMainLooper()Landroid/os/Looper;': (self, _args, vm) => vm.mainLooper ?? null,
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args], vm) => vm.resources.getString(resId >>> 0),
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => vm.resources.getColor(resId >>> 0),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => drawableObject(vm, vm.resources.getDrawable(resId >>> 0)),
        'getApplicationContext()Landroid/content/Context;': (self, _args, vm) => {
          if (!vm.applicationObject && vm.contextObject) return vm.contextObject;
          return vm.applicationObject ?? vm.contextObject;
        },
        'getIntent()Landroid/content/Intent;': (self) => self.intent,
        'setIntent(Landroid/content/Intent;)V': (self, [intent]) => {
          self.intent = intent;
        },
        'getComponentName()Landroid/content/ComponentName;': (self, _args, vm) => {
          const activityDescriptor = vm.registry.classNameOf(self.object);
          const className = activityDescriptor?.startsWith('L')
            ? activityDescriptor.slice(1, -1).replace(/\//g, '.')
            : (vm.packageName || '');
          const packageName = vm.packageName || '';
          const object = vm.allocateRawObject('Landroid/content/ComponentName;');
          object.$peer = {
            vm,
            constructor: { $descriptor: 'Landroid/content/ComponentName;' },
            pkg: packageName,
            cls: className,
          };
          return object;
        },
        'getCallingActivity()Landroid/content/ComponentName;': () => null,
        'getCallingPackage()Ljava/lang/String;': () => null,
        'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
        if (self.dialog) { self.dialog.title = jsString(title); return; }
          self.title = jsString(title);
          self.screen?.invalidate();
        },
        'setTitle(I)V': (self, [resId], vm) => {
          self.title = vm.resources.getString(resId >>> 0);
          self.screen?.invalidate();
        },
        'getTitle()Ljava/lang/CharSequence;': (self) => self.title,
        'runOnUiThread(Ljava/lang/Runnable;)V': (self, [runnable], vm) => {
          vm.handler.post(() => vm.runRunnable(runnable));
        },
        'isFinishing()Z': (self) => !!self.finished,
        'finish()V': (self) => self.finish(),
        'startActivity(Landroid/content/Intent;)V': (self, [intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityForResult(Landroid/content/Intent;I)V': (self, [intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityIfNeeded(Landroid/content/Intent;I)Z': (self, [intent], vm) => {
          vm.startActivity(intent, self);
          return true;
        },
        'requestWindowFeature(I)Z': () => true,
        'setRequestedOrientation(I)V': () => undefined,
        'onCreateOptionsMenu(Landroid/view/Menu;)Z': () => false,
        'onPrepareOptionsMenu(Landroid/view/Menu;)Z': () => true,
        'onOptionsItemSelected(Landroid/view/MenuItem;)Z': () => false,
        'onContextItemSelected(Landroid/view/MenuItem;)Z': () => false,

        // —— Window.Callback 与按键/触摸派发 ——
        'showDialog(I)V': (self, [id], vm) => {
          const activity = self.object || self.$object || vm.activity;
          if (!vm.$activityDialogs) vm.$activityDialogs = new Map();
          let dialog = vm.$activityDialogs.get(id | 0);
          if (!dialog) {
            try { dialog = vm.invokeByName('onCreateDialog', '(I)Landroid/app/Dialog;', activity, [id | 0]); } catch (_) { dialog = null; }
            if (dialog) vm.$activityDialogs.set(id | 0, dialog);
          }
          if (dialog) {
            try { vm.invokeByName('onPrepareDialog', '(ILandroid/app/Dialog;)V', activity, [id | 0, dialog]); } catch (_) { /* 应用未覆写 */ }
            try { vm.invokeByName('show', '()V', dialog, []); } catch (_) { /* Dialog 未就绪 */ }
          }
        },
        'showDialog(ILandroid/os/Bundle;)Z': (self, [id, state], vm) => {
          const activity = self.object || self.$object || vm.activity;
          if (!vm.$activityDialogs) vm.$activityDialogs = new Map();
          let dialog = vm.$activityDialogs.get(id | 0);
          if (!dialog) {
            try { dialog = vm.invokeByName('onCreateDialog', '(ILandroid/os/Bundle;)Landroid/app/Dialog;', activity, [id | 0, state ?? null]); } catch (_) { dialog = null; }
            if (dialog) vm.$activityDialogs.set(id | 0, dialog);
          }
          if (!dialog) return false;
          try { vm.invokeByName('onPrepareDialog', '(ILandroid/app/Dialog;Landroid/os/Bundle;)V', activity, [id | 0, dialog, state ?? null]); } catch (_) { /* 应用未覆写 */ }
          try { vm.invokeByName('show', '()V', dialog, []); } catch (_) { /* Dialog 未就绪 */ }
          return true;
        },
        'onCreateDialog(I)Landroid/app/Dialog;': () => null,
        'onCreateDialog(ILandroid/os/Bundle;)Landroid/app/Dialog;': () => null,
        'onPrepareDialog(ILandroid/app/Dialog;)V': () => undefined,
        'onPrepareDialog(ILandroid/app/Dialog;Landroid/os/Bundle;)V': () => undefined,

        'onKeyDown(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyLongPress(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyUp(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyMultiple(IILandroid/view/KeyEvent;)Z': () => false,
        'onKeyShortcut(ILandroid/view/KeyEvent;)Z': () => false,
        'onTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onUserInteraction()V': () => undefined,
        'dispatchTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.decorView?.dispatchTouchEvent?.(event) ?? false,
        'dispatchTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchPopulateAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)Z': () => false,
        'onWindowAttributesChanged(Landroid/view/WindowManager$LayoutParams;)V': () => undefined,
        'onContentChanged()V': () => undefined,
        'onWindowFocusChanged(Z)V': (self, [hasFocus]) => { self.$windowFocus = !!hasFocus; },
        'hasWindowFocus()Z': (self) => self.$windowFocus !== false,
        'onAttachedToWindow()V': () => undefined,
        'onDetachedFromWindow()V': () => undefined,
        'takeKeyEvents(Z)V': () => undefined,
        'setDefaultKeyMode(I)V': (self, [mode]) => { self.$defaultKeyMode = mode | 0; },

        // —— 菜单 / 上下文菜单 / 搜索 / ActionMode ——
        'onOptionsMenuClosed(Landroid/view/Menu;)V': () => undefined,
        'openOptionsMenu()V': () => undefined,
        'closeOptionsMenu()V': () => undefined,
        'onCreateContextMenu(Landroid/view/ContextMenu;Landroid/view/View;Landroid/view/ContextMenu$ContextMenuInfo;)V': () => undefined,
        'registerForContextMenu(Landroid/view/View;)V': () => undefined,
        'unregisterForContextMenu(Landroid/view/View;)V': () => undefined,
        'openContextMenu(Landroid/view/View;)V': () => undefined,
        'closeContextMenu()V': () => undefined,
        'onContextMenuClosed(Landroid/view/Menu;)V': () => undefined,
        'onSearchRequested(Landroid/view/SearchEvent;)Z': () => false,
        'onSearchRequested()Z': () => false,
        'getSearchEvent()Landroid/view/SearchEvent;': () => null,
        'startSearch(Ljava/lang/String;ZLandroid/os/Bundle;Z)V': () => undefined,
        'triggerSearch(Ljava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'startActionMode(Landroid/view/ActionMode$Callback;)Landroid/view/ActionMode;': () => null,
        'startActionMode(Landroid/view/ActionMode$Callback;I)Landroid/view/ActionMode;': () => null,
        'onWindowStartingActionMode(Landroid/view/ActionMode$Callback;)Landroid/view/ActionMode;': () => null,
        'onWindowStartingActionMode(Landroid/view/ActionMode$Callback;I)Landroid/view/ActionMode;': () => null,
        'onActionModeStarted(Landroid/view/ActionMode;)V': () => undefined,
        'onActionModeFinished(Landroid/view/ActionMode;)V': () => undefined,
        'getMenuInflater()Landroid/view/MenuInflater;': (self, _args, vm) => {
          const inflater = vm.allocateRawObject('Landroid/view/MenuInflater;');
          inflater.$peer = { vm, context: vm.contextObject };
          return inflater;
        },
        'getActionBar()Landroid/app/ActionBar;': () => null,
        'setActionBar(Landroid/widget/Toolbar;)V': () => undefined,
        'setFeatureDrawableResource(II)V': () => undefined,
        'setFeatureDrawableUri(ILandroid/net/Uri;)V': () => undefined,
        'setFeatureDrawable(ILandroid/graphics/drawable/Drawable;)V': () => undefined,
        'setFeatureDrawableAlpha(II)V': () => undefined,
        'onApplyThemeResource(Landroid/content/res/Resources$Theme;IZ)V': () => undefined,

        // —— 视图与内容 ——
        'requireViewById(I)Landroid/view/View;': (self, [id]) => {
          const view = self.findViewById(id);
          if (!view) throw new Error(`requireViewById: 找不到 id 0x${(id >>> 0).toString(16)}`);
          return view;
        },
        'addContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view]) => {
          self.setContentView(unwrapView(view) || view);
        },
        'getContentTransitionManager()Landroid/transition/TransitionManager;': () => null,
        'setContentTransitionManager(Landroid/transition/TransitionManager;)V': () => undefined,
        'getContentScene()Landroid/transition/Scene;': () => null,
        'setFinishOnTouchOutside(Z)V': () => undefined,
        'onAttachFragment(Landroid/app/Fragment;)V': () => undefined,
        'managedQuery(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;': () => null,
        'startManagingCursor(Landroid/database/Cursor;)V': () => undefined,
        'stopManagingCursor(Landroid/database/Cursor;)V': () => undefined,
        'onCreateView(Ljava/lang/String;Landroid/content/Context;Landroid/util/AttributeSet;)Landroid/view/View;': () => null,
        'onCreateView(Landroid/view/View;Ljava/lang/String;Landroid/content/Context;Landroid/util/AttributeSet;)Landroid/view/View;': () => null,

        // —— 启动 Activity / 结果 ——
        'startActivityForResult(Landroid/content/Intent;ILandroid/os/Bundle;)V': (self, [intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityIfNeeded(Landroid/content/Intent;ILandroid/os/Bundle;)Z': (self, [intent], vm) => {
          vm.startActivity(intent, self);
          return true;
        },
        'startNextMatchingActivity(Landroid/content/Intent;)Z': () => false,
        'startNextMatchingActivity(Landroid/content/Intent;Landroid/os/Bundle;)Z': () => false,
        'startActivityFromChild(Landroid/app/Activity;Landroid/content/Intent;I)V': (self, [child, intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityFromChild(Landroid/app/Activity;Landroid/content/Intent;ILandroid/os/Bundle;)V': (self, [child, intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityFromFragment(Landroid/app/Fragment;Landroid/content/Intent;I)V': (self, [fragment, intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityFromFragment(Landroid/app/Fragment;Landroid/content/Intent;ILandroid/os/Bundle;)V': (self, [fragment, intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startIntentSenderForResult(Landroid/content/IntentSender;ILandroid/content/Intent;III)V': () => undefined,
        'startIntentSenderForResult(Landroid/content/IntentSender;ILandroid/content/Intent;IIILandroid/os/Bundle;)V': () => undefined,
        'startIntentSenderFromChild(Landroid/app/Activity;Landroid/content/IntentSender;ILandroid/content/Intent;III)V': () => undefined,
        'startIntentSenderFromChild(Landroid/app/Activity;Landroid/content/IntentSender;ILandroid/content/Intent;IIILandroid/os/Bundle;)V': () => undefined,
        'overridePendingTransition(II)V': () => undefined,
        'setResult(I)V': (self, [resultCode]) => { self.$resultCode = resultCode | 0; },
        'setResult(ILandroid/content/Intent;)V': (self, [resultCode, data]) => {
          self.$resultCode = resultCode | 0;
          self.$resultData = data ?? null;
        },
        'onActivityResult(IILandroid/content/Intent;)V': () => undefined,
        'onActivityReenter(ILandroid/content/Intent;)V': () => undefined,
        'createPendingResult(ILandroid/content/Intent;I)Landroid/app/PendingIntent;': () => null,
        'finishActivity(I)V': () => undefined,
        'finishActivityFromChild(Landroid/app/Activity;I)V': () => undefined,
        'finishFromChild(Landroid/app/Activity;)V': () => undefined,
        'onRequestPermissionsResult(I[Ljava/lang/String;[I)V': () => undefined,
        'shouldShowRequestPermissionRationale(Ljava/lang/String;)Z': () => false,

        // —— 导航 / 任务 / 生命周期 ——
        'onNavigateUp()Z': (self) => { self.finish?.(); return true; },
        'onNavigateUpFromChild(Landroid/app/Activity;)Z': () => false,
        'navigateUpTo(Landroid/content/Intent;)Z': () => false,
        'navigateUpToFromChild(Landroid/app/Activity;Landroid/content/Intent;)Z': () => false,
        'shouldUpRecreateTask(Landroid/content/Intent;)Z': () => false,
        'getParentActivityIntent()Landroid/content/Intent;': () => null,
        'onCreateNavigateUpTaskStack(Landroid/app/TaskStackBuilder;)V': () => undefined,
        'onPrepareNavigateUpTaskStack(Landroid/app/TaskStackBuilder;)V': () => undefined,
        'isActivityTransitionRunning()Z': () => false,
        'setEnterSharedElementCallback(Landroid/app/SharedElementCallback;)V': () => undefined,
        'setExitSharedElementCallback(Landroid/app/SharedElementCallback;)V': () => undefined,
        'postponeEnterTransition()V': () => undefined,
        'startPostponedEnterTransition()V': () => undefined,
        'requestDragAndDropPermissions(Landroid/view/DragEvent;)Landroid/view/DragAndDropPermissions;': () => null,
        'getReferrer()Landroid/net/Uri;': () => null,
        'onProvideReferrer()Landroid/net/Uri;': () => null,
        'setVisible(Z)V': () => undefined,
        'isDestroyed()Z': (self) => !!self.destroyed,
        'isChangingConfigurations()Z': () => false,
        'recreate()V': () => undefined,
        'finishAffinity()V': (self) => self.finish?.(),
        'finishAfterTransition()V': (self) => self.finish?.(),
        'finishAndRemoveTask()V': (self) => self.finish?.(),
        'releaseInstance()Z': () => false,
        'getRequestedOrientation()I': (self) => self.$requestedOrientation ?? -1,
        'getTaskId()I': () => 1,
        'isTaskRoot()Z': () => true,
        'moveTaskToBack(Z)Z': () => false,
        'isLaunchedFromBubble()Z': () => false,
        'getLocalClassName()Ljava/lang/String;': (self, _args, vm) => {
          const descriptor = vm.registry.classNameOf(self.object);
          const name = descriptor?.startsWith('L') ? descriptor.slice(1, -1).replace(/\//g, '.') : '';
          const prefix = `${vm.packageName || ''}.`;
          return name.startsWith(prefix) ? name.slice(prefix.length) : name;
        },
        'getPreferences(I)Landroid/content/SharedPreferences;': (self, _args, vm) => {
          const descriptor = vm.registry.classNameOf(self.object);
          const name = descriptor?.startsWith('L') ? descriptor.slice(1, -1).replace(/\//g, '.') : 'activity';
          const prefs = vm.allocateRawObject('Landroid/content/SharedPreferences;');
          prefs.$peer = { name };
          return prefs;
        },
        'startLockTask()V': () => undefined,
        'stopLockTask()V': () => undefined,
        'showLockTaskEscapeMessage()V': () => undefined,
        'setShowWhenLocked(Z)V': () => undefined,
        'setInheritShowWhenLocked(Z)V': () => undefined,
        'setTurnScreenOn(Z)V': () => undefined,
        'setImmersive(Z)V': (self, [value]) => { self.$immersive = !!value; },
        'isImmersive()Z': (self) => !!self.$immersive,
        'setTranslucent(Z)Z': () => true,
        'requestVisibleBehind(Z)Z': () => false,
        'onVisibleBehindCanceled()V': () => undefined,
        'onEnterAnimationComplete()V': () => undefined,
        'setVrModeEnabled(ZLandroid/content/ComponentName;)V': () => undefined,

        // —— 标题 / 进度 / 音量 ——
        'setTitleColor(I)V': (self, [color]) => {
          self.$titleColor = color | 0;
          self.screen?.invalidate();
        },
        'getTitleColor()I': (self) => self.$titleColor ?? 0,
        'onTitleChanged(Ljava/lang/CharSequence;I)V': (self, [title, color]) => {
          self.title = jsString(title);
          self.$titleColor = color | 0;
          self.screen?.invalidate();
        },
        'onChildTitleChanged(Landroid/app/Activity;Ljava/lang/CharSequence;)V': () => undefined,
        'setTaskDescription(Landroid/app/ActivityManager$TaskDescription;)V': () => undefined,
        'setProgressBarVisibility(Z)V': () => undefined,
        'setProgressBarIndeterminateVisibility(Z)V': () => undefined,
        'setProgressBarIndeterminate(Z)V': () => undefined,
        'setProgress(I)V': () => undefined,
        'setSecondaryProgress(I)V': () => undefined,
        'setVolumeControlStream(I)V': (self, [stream]) => { self.$volumeControlStream = stream | 0; },
        'getVolumeControlStream()I': (self) => self.$volumeControlStream ?? 3,
        'setMediaController(Landroid/media/session/MediaController;)V': (self, [controller]) => { self.$mediaController = controller ?? null; },
        'getMediaController()Landroid/media/session/MediaController;': (self) => self.$mediaController ?? null,
        'dump(Ljava/lang/String;Ljava/io/FileDescriptor;Ljava/io/PrintWriter;[Ljava/lang/String;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/Context;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;)Landroid/content/Intent;': (self, [receiver, filter], vm) => {
          const action = filter?.actions?.[0] || filter?.action || 'android.intent.action.BATTERY_CHANGED';
          if (action !== 'android.intent.action.BATTERY_CHANGED') return null;
          const intent = vm.allocateRawObject('Landroid/content/Intent;');
          intent.$peer = { vm, action, extras: new Map([
            ['level', 87], ['scale', 100], ['voltage', 4200], ['temperature', 300],
            ['status', 2], ['health', 2], ['plugged', 1], ['present', true], ['technology', 'Li-ion'],
          ]), flags: 0 };
          if (receiver) { try { vm.invokeInterface(receiver, 'onReceive', '(Landroid/content/Context;Landroid/content/Intent;)V', [self.$object || self, intent]); } catch (_) {} }
          return intent;
        },
        'registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;I)Landroid/content/Intent;': (self, [receiver, filter], vm) => {
          const action = filter?.actions?.[0] || filter?.action || 'android.intent.action.BATTERY_CHANGED';
          if (action !== 'android.intent.action.BATTERY_CHANGED') return null;
          const intent = vm.allocateRawObject('Landroid/content/Intent;');
          intent.$peer = { vm, action, extras: new Map([
            ['level', 87], ['scale', 100], ['voltage', 4200], ['temperature', 300],
            ['status', 2], ['health', 2], ['plugged', 1], ['present', true], ['technology', 'Li-ion'],
          ]), flags: 0 };
          if (receiver) { try { vm.invokeInterface(receiver, 'onReceive', '(Landroid/content/Context;Landroid/content/Intent;)V', [self.$object || self, intent]); } catch (_) {} }
          return intent;
        },
        'registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;Ljava/lang/String;Landroid/os/Handler;)Landroid/content/Intent;': (self, [receiver, filter], vm) => {
          const action = filter?.actions?.[0] || filter?.action || 'android.intent.action.BATTERY_CHANGED';
          if (action !== 'android.intent.action.BATTERY_CHANGED') return null;
          const intent = vm.allocateRawObject('Landroid/content/Intent;');
          intent.$peer = { vm, action, extras: new Map([
            ['level', 87], ['scale', 100], ['voltage', 4200], ['temperature', 300],
            ['status', 2], ['health', 2], ['plugged', 1], ['present', true], ['technology', 'Li-ion'],
          ]), flags: 0 };
          if (receiver) { try { vm.invokeInterface(receiver, 'onReceive', '(Landroid/content/Context;Landroid/content/Intent;)V', [self.$object || self, intent]); } catch (_) {} }
          return intent;
        },
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => self.resources || vm.resources,
        'getColorStateList(ILandroid/content/res/Resources$Theme;)Landroid/content/res/ColorStateList;': (self, [id], vm) => {
          const resources = vm?.resources || self.resources;
          const info = resources?.getColorStateList?.(id >>> 0);
          return info ? makeColorStateList(vm, info) : null;
        },
        'getColorStateList(I)Landroid/content/res/ColorStateList;': (self, [id], vm) => {
          const resources = vm?.resources || self.resources;
          const info = resources?.getColorStateList?.(id >>> 0);
          return info ? makeColorStateList(vm, info) : null;
        },
        'checkPermission(Ljava/lang/String;II)I': () => 0,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => (self.resources || vm.resources)?.getAssets(),
        'getApplicationContext()Landroid/content/Context;': (self, _args, vm) => self.contextObject || self,
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.packageName,
        'getContentResolver()Landroid/content/ContentResolver;': (self, _args, vm) => {
          if (!self.contentResolver || self.contentResolver === null) {
            const resolver = vm.allocateRawObject('Landroid/content/ContentResolver;');
            resolver.$peer = { vm };
            self.contentResolver = resolver;
          }
          return self.contentResolver;
        },
        'isRestricted()Z': () => false,
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => (self.resources || vm.resources).getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args]) => {
          const values = Array.isArray(args) ? args : args?.$data || [];
          return (self.resources || vm.resources).getString(resId >>> 0, ...values);
        },
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => (self.resources || vm.resources).getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => (self.resources || vm.resources).getColor(resId >>> 0),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => drawableObject(vm, (self.resources || vm.resources).getDrawable(resId >>> 0)),
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => vm.getSystemService?.(jsString(name)) ?? null,
        'getSystemService(Ljava/lang/Class;)Ljava/lang/Object;': (self, [clazz], vm) => vm.getSystemServiceByClass?.(clazz) ?? null,
        'getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;': (self, [name], vm) => {
          const prefs = vm.allocateRawObject('Landroid/content/SharedPreferences;');
          prefs.$peer = { name: jsString(name) };
          return prefs;
        },
        'getFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/files'),
        'getCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/cache'),
        'getDir(Ljava/lang/String;I)Ljava/io/File;': (self, [name], vm) =>
          vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/app_' + jsString(name)),
        'getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;': (self, [type], vm) => {
          const suffix = type ? '/' + jsString(type) : '';
          return vm.makeFile('/storage/emulated/0/Android/data/' + (vm.packageName || 'app') + '/files' + suffix);
        },
        'getNoBackupFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/no_backup'),
        'getDataDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile(dataDir(vm)),
        'getCodeCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile(dataDir(vm) + '/code_cache'),
        'getObbDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile(externalDir(vm) + '/obb'),
        'getObbDirs()[Ljava/io/File;': (self, _args, vm) => fileArray(vm, [externalDir(vm) + '/obb']),
        'getExternalCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile(externalDir(vm) + '/cache'),
        'getExternalCacheDirs()[Ljava/io/File;': (self, _args, vm) => fileArray(vm, [externalDir(vm) + '/cache']),
        'getExternalFilesDirs(Ljava/lang/String;)[Ljava/io/File;': (self, [type], vm) =>
          fileArray(vm, [externalDir(vm) + '/files' + (type ? '/' + jsString(type) : '')]),
        'getExternalMediaDirs()[Ljava/io/File;': (self, _args, vm) => fileArray(vm, [externalDir(vm) + '/media']),
        'getFileStreamPath(Ljava/lang/String;)Ljava/io/File;': (self, [name], vm) => vm.makeFile(dataDir(vm) + '/files/' + jsString(name)),
        'openFileInput(Ljava/lang/String;)Ljava/io/FileInputStream;': (self, [name], vm) => {
          const bytes = VIRTUAL_FS.read(dataDir(vm) + '/files/' + jsString(name)) || new Uint8Array(0);
          return makeAssetStream(vm, bytes);
        },
        'openFileOutput(Ljava/lang/String;I)Ljava/io/FileOutputStream;': (self, [name, mode], vm) =>
          makeFileOutput(vm, dataDir(vm) + '/files/' + jsString(name), (mode | 0) === 1),
        'deleteFile(Ljava/lang/String;)Z': (self, [name], vm) => {
          const path = VIRTUAL_FS.normalize(dataDir(vm) + '/files/' + jsString(name));
          return VIRTUAL_FS.files.delete(path);
        },
        'fileList()[Ljava/lang/String;': (self, _args, vm) => {
          const names = VIRTUAL_FS.list(dataDir(vm) + '/files');
          return vm.newArray('[Ljava/lang/String;', names.length, names);
        },
        'getDatabasePath(Ljava/lang/String;)Ljava/io/File;': (self, [name], vm) => vm.makeFile(dataDir(vm) + '/databases/' + jsString(name)),
        'databaseList()[Ljava/lang/String;': (self, _args, vm) => vm.newArray('[Ljava/lang/String;', 0, []),
        'deleteDatabase(Ljava/lang/String;)Z': () => false,
        'openOrCreateDatabase(Ljava/lang/String;ILandroid/database/sqlite/SQLiteDatabase$CursorFactory;)Landroid/database/sqlite/SQLiteDatabase;': () => null,
        'openOrCreateDatabase(Ljava/lang/String;ILandroid/database/sqlite/SQLiteDatabase$CursorFactory;Landroid/database/DatabaseErrorHandler;)Landroid/database/sqlite/SQLiteDatabase;': () => null,
        'moveDatabaseFrom(Landroid/content/Context;Ljava/lang/String;)Z': () => false,
        'moveSharedPreferencesFrom(Landroid/content/Context;Ljava/lang/String;)Z': () => false,
        'deleteSharedPreferences(Ljava/lang/String;)Z': () => false,
        'getPackageResourcePath()Ljava/lang/String;': (_self, _args, vm) => '/data/app/' + (vm.packageName || 'app') + '/base.apk',
        'getPackageCodePath()Ljava/lang/String;': (_self, _args, vm) => '/data/app/' + (vm.packageName || 'app') + '/base.apk',
        'getOpPackageName()Ljava/lang/String;': (_self, _args, vm) => vm.packageName,
        'getAttributionTag()Ljava/lang/String;': () => null,
        'getAttributionSource()Landroid/content/AttributionSource;': () => null,
        'getParams()Landroid/content/ContextParams;': () => null,
        'registerComponentCallbacks(Landroid/content/ComponentCallbacks;)V': () => undefined,
        'unregisterComponentCallbacks(Landroid/content/ComponentCallbacks;)V': () => undefined,
        'getSystemServiceName(Ljava/lang/Class;)Ljava/lang/String;': (_self, [clazz], vm) => vm.getSystemServiceNameByClass?.(clazz) ?? null,
        'checkCallingOrSelfPermission(Ljava/lang/String;)I': () => 0,
        'checkCallingPermission(Ljava/lang/String;)I': () => 0,
        'enforcePermission(Ljava/lang/String;IILjava/lang/String;)V': () => undefined,
        'enforceCallingPermission(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'enforceCallingOrSelfPermission(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'checkUriPermission(Landroid/net/Uri;III)I': () => 0,
        'checkUriPermission(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;III)I': () => 0,
        'checkCallingUriPermission(Landroid/net/Uri;I)I': () => 0,
        'checkCallingOrSelfUriPermission(Landroid/net/Uri;I)I': () => 0,
        'checkUriPermissions(Ljava/util/List;III)[I': (_self, [list], vm) => {
          const size = Array.isArray(list?.$peer?.items) ? list.$peer.items.length : 0;
          return vm.newArray('[I', size, new Array(size).fill(0));
        },
        'checkCallingUriPermissions(Ljava/util/List;I)[I': (_self, [list], vm) => {
          const size = Array.isArray(list?.$peer?.items) ? list.$peer.items.length : 0;
          return vm.newArray('[I', size, new Array(size).fill(0));
        },
        'checkCallingOrSelfUriPermissions(Ljava/util/List;I)[I': (_self, [list], vm) => {
          const size = Array.isArray(list?.$peer?.items) ? list.$peer.items.length : 0;
          return vm.newArray('[I', size, new Array(size).fill(0));
        },
        'grantUriPermission(Ljava/lang/String;Landroid/net/Uri;I)V': () => undefined,
        'revokeUriPermission(Landroid/net/Uri;I)V': () => undefined,
        'revokeUriPermission(Ljava/lang/String;Landroid/net/Uri;I)V': () => undefined,
        'enforceUriPermission(Landroid/net/Uri;IIILjava/lang/String;)V': () => undefined,
        'enforceUriPermission(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;IIILjava/lang/String;)V': () => undefined,
        'enforceCallingUriPermission(Landroid/net/Uri;ILjava/lang/String;)V': () => undefined,
        'enforceCallingOrSelfUriPermission(Landroid/net/Uri;ILjava/lang/String;)V': () => undefined,
        'sendBroadcast(Landroid/content/Intent;)V': () => undefined,
        'sendBroadcast(Landroid/content/Intent;Ljava/lang/String;)V': () => undefined,
        'sendBroadcastWithMultiplePermissions(Landroid/content/Intent;[Ljava/lang/String;)V': () => undefined,
        'sendOrderedBroadcast(Landroid/content/Intent;Ljava/lang/String;)V': () => undefined,
        'sendOrderedBroadcast(Landroid/content/Intent;Ljava/lang/String;Landroid/content/BroadcastReceiver;Landroid/os/Handler;ILjava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'sendOrderedBroadcast(Landroid/content/Intent;Ljava/lang/String;Ljava/lang/String;Landroid/content/BroadcastReceiver;Landroid/os/Handler;ILjava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'sendBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;)V': () => undefined,
        'sendBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;Ljava/lang/String;)V': () => undefined,
        'sendOrderedBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;Ljava/lang/String;Landroid/content/BroadcastReceiver;Landroid/os/Handler;ILjava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'sendStickyBroadcast(Landroid/content/Intent;)V': () => undefined,
        'sendStickyBroadcast(Landroid/content/Intent;Landroid/os/Bundle;)V': () => undefined,
        'sendStickyOrderedBroadcast(Landroid/content/Intent;Landroid/content/BroadcastReceiver;Landroid/os/Handler;ILjava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'sendStickyBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;)V': () => undefined,
        'sendStickyOrderedBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;Landroid/content/BroadcastReceiver;Landroid/os/Handler;ILjava/lang/String;Landroid/os/Bundle;)V': () => undefined,
        'removeStickyBroadcast(Landroid/content/Intent;)V': () => undefined,
        'removeStickyBroadcastAsUser(Landroid/content/Intent;Landroid/os/UserHandle;)V': () => undefined,
        'registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;Ljava/lang/String;Landroid/os/Handler;I)Landroid/content/Intent;': () => null,
        'unregisterReceiver(Landroid/content/BroadcastReceiver;)V': () => undefined,
        'startActivities([Landroid/content/Intent;)V': () => undefined,
        'startActivities([Landroid/content/Intent;Landroid/os/Bundle;)V': () => undefined,
        'startIntentSender(Landroid/content/IntentSender;Landroid/content/Intent;III)V': () => undefined,
        'startIntentSender(Landroid/content/IntentSender;Landroid/content/Intent;IIILandroid/os/Bundle;)V': () => undefined,
        'startService(Landroid/content/Intent;)Landroid/content/ComponentName;': () => null,
        'startForegroundService(Landroid/content/Intent;)Landroid/content/ComponentName;': () => null,
        'stopService(Landroid/content/Intent;)Z': () => false,
        'bindService(Landroid/content/Intent;Landroid/content/ServiceConnection;I)Z': () => false,
        'bindService(Landroid/content/Intent;ILjava/util/concurrent/Executor;Landroid/content/ServiceConnection;)Z': () => false,
        'bindIsolatedService(Landroid/content/Intent;ILjava/lang/String;Ljava/util/concurrent/Executor;Landroid/content/ServiceConnection;)Z': () => false,
        'bindServiceAsUser(Landroid/content/Intent;Landroid/content/ServiceConnection;ILandroid/os/UserHandle;)Z': () => false,
        'updateServiceGroup(Landroid/content/ServiceConnection;II)V': () => undefined,
        'unbindService(Landroid/content/ServiceConnection;)V': () => undefined,
        'startInstrumentation(Landroid/content/ComponentName;Ljava/lang/String;Landroid/os/Bundle;)Z': () => false,
        'getWallpaper()Landroid/graphics/drawable/Drawable;': () => null,
        'peekWallpaper()Landroid/graphics/drawable/Drawable;': () => null,
        'getWallpaperDesiredMinimumWidth()I': () => 0,
        'getWallpaperDesiredMinimumHeight()I': () => 0,
        'setWallpaper(Landroid/graphics/Bitmap;)V': () => undefined,
        'setWallpaper(Ljava/io/InputStream;)V': () => undefined,
        'clearWallpaper()V': () => undefined,
        'createPackageContext(Ljava/lang/String;I)Landroid/content/Context;': (self) => self.contextObject || self,
        'createContextForSplit(Ljava/lang/String;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createConfigurationContext(Landroid/content/res/Configuration;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createDisplayContext(Landroid/view/Display;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createWindowContext(ILandroid/os/Bundle;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createWindowContext(Landroid/view/Display;ILandroid/os/Bundle;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createContext(Landroid/content/ContextParams;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createAttributionContext(Ljava/lang/String;)Landroid/content/Context;': (self) => self.contextObject || self,
        'createDeviceProtectedStorageContext()Landroid/content/Context;': (self) => self.contextObject || self,
        'isDeviceProtectedStorage()Z': () => false,
        'isUiContext()Z': () => true,
        'getDisplay()Landroid/view/Display;': () => null,
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
          return vm.classLoaderObject;
        },
        'getPackageManager()Landroid/content/pm/PackageManager;': (self, _args, vm) => {
          if (!vm.packageManagerObject) {
            const object = vm.allocateRawObject('Landroid/content/pm/PackageManager;');
            object.$peer = { vm, constructor: { $descriptor: 'Landroid/content/pm/PackageManager;' } };
            vm.packageManagerObject = object;
          }
          return vm.packageManagerObject;
        },
        'getMainLooper()Landroid/os/Looper;': (self, _args, vm) => vm.mainLooper,
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self) => ({ $descriptor: 'Landroid/content/pm/ApplicationInfo;' }),
        'checkSelfPermission(Ljava/lang/String;)I': () => 0,
        'startActivity(Landroid/content/Intent;)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'startActivity(Landroid/content/Intent;Landroid/os/Bundle;)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'startActivityForResult(Landroid/content/Intent;I)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'getTheme()Landroid/content/res/Resources$Theme;': (self, _args, vm) => getThemeObject(vm),
        'setTheme(I)V': (self, [styleId], vm) => {
          if (typeof styleId === 'number' && styleId) loadThemeFromStyleId(vm, styleId >>> 0);
        },
        'setTheme(Landroid/content/res/Resources$Theme;)V': () => undefined,
        'obtainStyledAttributes([I)Landroid/content/res/TypedArray;': (self, [attrs], vm) => createTypedArray(vm, attrs),
        'obtainStyledAttributes(I[I)Landroid/content/res/TypedArray;': (self, [styleId, attrs], vm) => createTypedArray(vm, attrs, styleId >>> 0),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[I)Landroid/content/res/TypedArray;': (self, [set, attrs], vm) => createTypedArray(vm, attrs, 0, set),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [set, attrs, defStyleAttr, defStyleRes], vm) => createTypedArray(vm, attrs, defStyleRes >>> 0, set, defStyleAttr),
        'obtainStyledAttributes([IIII)Landroid/content/res/TypedArray;': (self, [attrs], vm) => createTypedArray(vm, attrs),
      },
    })
  );

  defs.push(nativeDef('Landroid/content/ContextWrapper;', { super: 'Landroid/content/Context;' }));
  defs.push(nativeDef('Landroid/content/ContextThemeWrapper;', {
    super: 'Landroid/content/ContextWrapper;',
    ctor: class ContextThemeWrapperPeer { constructor(vm, context) { this.vm = vm; this.base = context ?? null; this.theme = null; } },
    methods: {
      '<init>(Landroid/content/Context;)V': (self, [context]) => { self.base = context ?? null; },
      '<init>(Landroid/content/Context;I)V': (self, [context, styleId], vm) => {
        self.base = context ?? null;
        if (typeof styleId === 'number' && styleId) loadThemeFromStyleId(vm, styleId >>> 0);
      },
      '<init>(Landroid/content/Context;Landroid/content/res/Resources$Theme;)V': (self, [context, theme]) => { self.base = context ?? null; self.theme = theme ?? null; },
      'getTheme()Landroid/content/res/Resources$Theme;': (self, _args, vm) => {
        if (!self.theme) self.theme = getThemeObject(vm);
        return self.theme;
      },
      'setTheme(I)V': () => undefined,
    },
  }));

  defs.push(
    nativeDef('Landroid/app/Application;', {
      super: 'Landroid/content/ContextWrapper;',
      ctor: class ApplicationPeer {
        static $descriptor = 'Landroid/app/Application;';
        constructor(vm) {
          this.vm = vm;
          this.resources = vm?.resources ?? null;
          this.contextObject = vm?.contextObject ?? this;
        }
      },
      methods: {
        'onCreate()V': () => undefined,
        'onTerminate()V': () => undefined,
        'onLowMemory()V': () => undefined,
        'onTrimMemory(I)V': () => undefined,
        'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
        'registerActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'unregisterActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'registerOnProvideAssistDataListener(Landroid/app/Application$OnProvideAssistDataListener;)V': () => undefined,
        'unregisterOnProvideAssistDataListener(Landroid/app/Application$OnProvideAssistDataListener;)V': () => undefined,
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => self.resources ?? vm.resources,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.apk?.manifest?.packageName ?? '',
        'getApplicationContext()Landroid/content/Context;': (self) => self,
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self, _args, vm) =>
          vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;'),
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => contextSystemService(vm, jsString(name)),
        'getSystemService(Ljava/lang/Class;)Ljava/lang/Object;': (self, [clazz], vm) => vm.getSystemServiceByClass?.(clazz) ?? null,
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) {
            vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
            vm.classLoaderObject.$peer = { vm, constructor: { $descriptor: 'Ljava/lang/ClassLoader;' } };
          }
          return vm.classLoaderObject;
        },
        'isRestricted()Z': () => false,
        'getProcessName()Ljava/lang/String;': (self, _args, vm) => vm.apk?.manifest?.packageName ?? '',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/TypedArray;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'length()I': (self) => self.length?.() ?? self.values?.size ?? 0,
        'getIndexCount()I': (self) => self.getIndexCount?.() ?? self.values?.size ?? 0,
        'hasValue(I)Z': (self, [index]) => !!self.hasValue?.(index | 0),
        'getBoolean(IZ)Z': (self, [index, fallback]) => self.getBoolean?.(index | 0, !!fallback) ?? !!fallback,
        'getInt(II)I': (self, [index, fallback]) => self.getInt?.(index | 0, fallback | 0) ?? (fallback | 0),
        'getInteger(II)I': (self, [index, fallback]) => self.getInteger?.(index | 0, fallback | 0) ?? (fallback | 0),
        'getFloat(IF)F': (self, [index, fallback]) => self.getFloat?.(index | 0, Number(fallback) || 0) ?? (Number(fallback) || 0),
        'getResourceId(II)I': (self, [index, fallback]) => (self.getResourceId?.(index | 0, fallback >>> 0) ?? fallback) >>> 0,
        'getDimension(IF)F': (self, [index, fallback]) => self.getDimension?.(index | 0, Number(fallback) || 0) ?? 0,
        'getDimensionPixelSize(II)I': (self, [index, fallback]) => self.getDimensionPixelSize?.(index | 0, fallback | 0) ?? 0,
        'getDimensionPixelOffset(II)I': (self, [index, fallback]) => self.getDimensionPixelOffset?.(index | 0, fallback | 0) ?? 0,
        'getLayoutDimension(II)I': (self, [index, fallback]) => self.getLayoutDimension?.(index | 0, fallback | 0) ?? 0,
        'getColor(II)I': (self, [index, fallback]) => (self.getColor?.(index | 0, fallback >>> 0) ?? fallback) >>> 0,
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [index]) => self.getDrawable?.(index | 0) ?? null,
        'getColorStateList(I)Landroid/content/res/ColorStateList;': (self, [index]) => {
          const vm = self.$vm || null;
          const resId = (self.getResourceId?.(index | 0) ?? 0) >>> 0;
          if (resId && vm?.resources?.getColorStateList) {
            const fromXml = vm.resources.getColorStateList(resId);
            if (fromXml) {
              const object = vm.allocateRawObject ? vm.allocateRawObject('Landroid/content/res/ColorStateList;') : null;
              if (object) {
                if (object.$fields instanceof Map) {
                  object.$fields.set('states', fromXml.states);
                  object.$fields.set('colors', fromXml.colors);
                }
                if (vm?.registry?.getPeer) {
                  const peer = vm.registry.getPeer(object, 'Landroid/content/res/ColorStateList;');
                  if (peer) { peer.states = fromXml.states; peer.colors = fromXml.colors; }
                }
                object.color = fromXml.color;
                object.states = fromXml.states;
                object.colors = fromXml.colors;
                return object;
              }
              return { $descriptor: 'Landroid/content/res/ColorStateList;', color: fromXml.color, states: fromXml.states, colors: fromXml.colors };
            }
          }
          const color = self.getColor?.(index | 0);
          if (color === undefined || color === null) return null;
          const object = vm?.allocateRawObject ? vm.allocateRawObject('Landroid/content/res/ColorStateList;') : null;
          const states = [[]];
          const colors = [color >>> 0];
          if (object) {
            if (object.$fields instanceof Map) object.$fields.set('states', states), object.$fields.set('colors', colors);
            if (vm?.registry?.getPeer) {
              const peer = vm.registry.getPeer(object, 'Landroid/content/res/ColorStateList;');
              if (peer) { peer.states = states; peer.colors = colors; }
            }
            object.color = color >>> 0;
            return object;
          }
          return { $descriptor: 'Landroid/content/res/ColorStateList;', color: color >>> 0, states, colors };
        },
        'getString(I)Ljava/lang/String;': (self, [index]) => self.getString?.(index | 0) ?? null,
        'getNonResourceString(I)Ljava/lang/String;': (self, [index]) => self.getNonResourceString?.(index | 0) ?? null,
        'getText(I)Ljava/lang/CharSequence;': (self, [index]) => self.getText?.(index | 0) ?? null,
        'getFraction(IIF)F': (self, [index, base, fallback]) => self.getFraction?.(index | 0, base | 0, Number(fallback) || 0) ?? 0,
        'peekValue(I)Landroid/util/TypedValue;': (self, [index]) => self.peekValue?.(index | 0) ?? null,
        'getValue(ILandroid/util/TypedValue;)Z': (self, [index, out]) => !!self.getValue?.(index | 0, out),
        'recycle()V': (self) => self.recycle?.(),
        'close()V': (self) => self.close?.(),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/Resources$Theme;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'applyStyle(IZ)V': (self) => self.applyStyle?.(),
        'setTo(Landroid/content/res/Resources$Theme;)V': (self) => self.setTo?.(),
        'resolveAttribute(ILandroid/util/TypedValue;Z)Z': (self, [attrId, out, resolveRefs]) =>
          !!self.resolveAttribute?.(attrId >>> 0, out, !!resolveRefs),
        'obtainStyledAttributes([I)Landroid/content/res/TypedArray;': (self, [attrs], vm) =>
          self.obtainStyledAttributes?.(attrs) ?? createTypedArray(vm, attrs),
        'obtainStyledAttributes(I[I)Landroid/content/res/TypedArray;': (self, [styleId, attrs], vm) =>
          self.obtainStyledAttributesWithStyle?.(styleId, attrs, vm) ?? createTypedArray(vm, attrs),
        'obtainStyledAttributes(ILandroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [styleId, set, attrs, defStyleAttr, defStyleRes], vm) =>
          createTypedArray(vm, attrs, (styleId >>> 0) || (defStyleRes >>> 0), set, defStyleAttr),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [set, attrs, defStyleAttr, defStyleRes], vm) =>
          createTypedArray(vm, attrs, defStyleRes >>> 0, set, defStyleAttr),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/TypedValue;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getFloat()F': (self) => Number(self.data) || 0,
      },
      staticMethods: {
        'applyDimension(IFLandroid/util/DisplayMetrics;)F': (_self, [unit, value, metrics]) => {
          const v = Number(value) || 0;
          const density = metricsValue(metrics, 'density', 1) || 1;
          const scaledDensity = metricsValue(metrics, 'scaledDensity', density) || density;
          switch (unit | 0) {
            case 1: return v * density;
            case 2: return v * scaledDensity;
            case 3: return v * 72 / 160 * density;
            case 4: return v * 72 / 160 * scaledDensity;
            case 5: return v;
            case 0: return v;
            default: return v;
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/database/Observable;', {
      super: 'Ljava/lang/Object;',
      methods: {
        '<init>()V': (self, _args, vm) => {
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          list.$peer = { items: [] };
          if (self && self.$fields) {
            self.$fields.set('Landroid/database/Observable;->mObservers:Ljava/util/ArrayList;', list);
          }
        },
        'registerObserver(Ljava/lang/Object;)V': (self, [observer], vm) => {
          const key = 'Landroid/database/Observable;->mObservers:Ljava/util/ArrayList;';
          let list = self?.$fields?.get(key);
          if (!list) {
            list = vm.allocateRawObject('Ljava/util/ArrayList;');
            list.$peer = { items: [] };
            self?.$fields?.set(key, list);
          }
          if (!list.$peer) list.$peer = { items: [] };
          list.$peer.items.push(observer);
        },
        'unregisterObserver(Ljava/lang/Object;)V': (self, [observer]) => {
          const list = self?.$fields?.get('Landroid/database/Observable;->mObservers:Ljava/util/ArrayList;');
          const items = list?.$peer?.items;
          if (Array.isArray(items)) {
            const idx = items.indexOf(observer);
            if (idx >= 0) items.splice(idx, 1);
          }
        },
        'notifyChanged()V': (self, _args, vm) => {
          const list = self?.$fields?.get('Landroid/database/Observable;->mObservers:Ljava/util/ArrayList;');
          const items = list?.$peer?.items || [];
          for (const observer of [...items]) {
            try { vm.invoke({ classDesc: 'Landroid/database/DataSetObserver;', name: 'onChanged', proto: { descriptor: '()V', parameters: [], returnType: 'V' } }, observer, [], 'virtual'); } catch { /* ignore */ }
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/Xml;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'asAttributeSet(Lorg/xmlpull/v1/XmlPullParser;)Landroid/util/AttributeSet;': (_self, [parser], vm) => {
          const node = xmlParserCurrent(parser).node;
          const object = vm.allocateRawObject('Landroid/util/AttributeSet;');
          object.$attrNode = node;
          object.$attrParser = parser;
          object.$attrResources = vm.resources;
          return object;
        },
        'newPullParser()Lorg/xmlpull/v1/XmlPullParser;': () => null,
        'findEncoding(Ljava/lang/String;)Ljava/lang/String;': (_self, [buf]) => 'UTF-8',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/AttributeSet;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getAttributeCount()I': (self) => attributeSetNode(self)?.attrs?.length ?? 0,
        'getAttributeName(I)Ljava/lang/String;': (self, [i]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          return a ? localAttrName(a) : null;
        },
        'getAttributeNamespace(I)Ljava/lang/String;': (self, [i]) => attributeSetNode(self)?.attrs?.[i | 0]?.namespace ?? null,
        'getAttributeNameResource(I)I': (self, [i]) => (attributeSetNode(self)?.attrs?.[i | 0]?.resId | 0) || 0,
        'getAttributeValue(I)Ljava/lang/String;': (self, [i]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          if (a == null) return null;
          if (a.rawValue !== null && a.rawValue !== undefined) return String(a.rawValue);
          if (a.value === null || a.value === undefined) return null;
          return (a.value && typeof a.value === 'object') ? null : String(a.value);
        },
        'getAttributeValue(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [ns, name]) =>
          attributeValueToString(attributeSetNode(self), jsString(name)),
        'getAttributeResourceValue(Ljava/lang/String;Ljava/lang/String;I)I': (self, [_ns, name, def]) =>
          attributeResourceValueFor(attributeSetNode(self), jsString(name), def | 0),
        'getAttributeResourceValue(I)I': (self, [i]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          return a && ((a.dataType & 0xff) === 0x01) ? (a.data >>> 0) : 0;
        },
        'getAttributeBooleanValue(Ljava/lang/String;Ljava/lang/String;Z)Z': (self, [_ns, name, def]) => {
          const v = attributeValueForNode(attributeSetNode(self), jsString(name));
          return v === undefined || v === null ? !!def : !!truthyAttr(v);
        },
        'getAttributeBooleanValue(IZ)Z': (self, [i, def]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          return a ? ((a.data | 0) !== 0 || a.dataType === 0x12) : !!def;
        },
        'getAttributeIntValue(Ljava/lang/String;Ljava/lang/String;I)I': (self, [_ns, name, def]) => {
          const v = attributeValueForNode(attributeSetNode(self), jsString(name));
          return v === undefined || v === null ? def | 0 : (asInt(v) | 0);
        },
        'getAttributeIntValue(II)I': (self, [i, def]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          if (!a) return def | 0;
          if ((a.dataType & 0xff) === 0x01) return a.data | 0;
          return asInt(a.value) | 0;
        },
        'getAttributeFloatValue(Ljava/lang/String;Ljava/lang/String;F)F': (self, [_ns, name, def]) => {
          const v = attributeValueForNode(attributeSetNode(self), jsString(name));
          return v === undefined || v === null ? def : Number(asInt(v));
        },
        'getAttributeFloatValue(IF)F': (self, [i, def]) => {
          const a = attributeSetNode(self)?.attrs?.[i | 0];
          return a ? Number(asInt(a.value)) : def;
        },
        'getPositionDescription()Ljava/lang/String;': () => 'attributeSet',
        'getClassAttribute()Ljava/lang/String;': () => null,
        'getIdAttribute()Ljava/lang/String;': () => null,
        'getIdAttributeResourceValue(I)I': (self, def) => attributeResourceValueFor(attributeSetNode(self), null, def | 0),
        'getStyleAttribute()I': () => 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Bundle;', {
      super: 'Ljava/lang/Object;',
      ctor: class BundlePeer {
        constructor() {
          this.map = new Map();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.map = new Map();
        },
        '<init>(Landroid/os/Bundle;)V': (self, [other]) => {
          self.map = new Map(other?.$peer?.map || []);
        },
        '<init>(I)V': (self) => {
          self.map = new Map();
        },
        'putString(Ljava/lang/String;Ljava/lang/String;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getString(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [key, fallback]) => self.map.get(jsString(key)) ?? fallback,
        'putInt(Ljava/lang/String;I)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getInt(Ljava/lang/String;)I': (self, [key]) => self.map.get(jsString(key)) ?? 0,
        'getInt(Ljava/lang/String;I)I': (self, [key, fallback]) => self.map.get(jsString(key)) ?? fallback,
        'putBoolean(Ljava/lang/String;Z)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getBoolean(Ljava/lang/String;)Z': (self, [key]) => Boolean(self.map.get(jsString(key))),
        'getBoolean(Ljava/lang/String;Z)Z': (self, [key, fallback]) => self.map.has(jsString(key)) ? Boolean(self.map.get(jsString(key))) : fallback,
        'putLong(Ljava/lang/String;J)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getLong(Ljava/lang/String;)J': (self, [key]) => BigInt(self.map.get(jsString(key)) ?? 0),
        'putDouble(Ljava/lang/String;D)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getDouble(Ljava/lang/String;)D': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putFloat(Ljava/lang/String;F)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getFloat(Ljava/lang/String;)F': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putChar(Ljava/lang/String;C)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getChar(Ljava/lang/String;)C': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putBundle(Ljava/lang/String;Landroid/os/Bundle;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getBundle(Ljava/lang/String;)Landroid/os/Bundle;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putParcelable(Ljava/lang/String;Landroid/os/Parcelable;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getParcelable(Ljava/lang/String;)Landroid/os/Parcelable;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getParcelable(Ljava/lang/String;Ljava/lang/Class;)Ljava/lang/Object;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putSerializable(Ljava/lang/String;Ljava/io/Serializable;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getSerializable(Ljava/lang/String;)Ljava/io/Serializable;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putStringArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getStringArrayList(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putIntegerArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'putParcelableArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'containsKey(Ljava/lang/String;)Z': (self, [key]) => self.map.has(jsString(key)),
        'remove(Ljava/lang/String;)V': (self, [key]) => {
          self.map.delete(jsString(key));
        },
        'clear()V': (self) => {
          self.map.clear();
        },
        'size()I': (self) => self.map.size,
        'isEmpty()Z': (self) => self.map.size === 0,
        'keySet()Ljava/util/Set;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Ljava/util/Set;');
          object.$peer = { setItems: [...self.map.keys()] };
          return object;
        },
        'get(Ljava/lang/String;)Ljava/lang/Object;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putAll(Landroid/os/Bundle;)V': (self, [other]) => {
          const source = other?.$peer?.map;
          if (source) for (const [key, value] of source) self.map.set(key, value);
        },
        '<init>(Ljava/lang/ClassLoader;)V': (self, [loader]) => {
          self.map = new Map();
          self.classLoader = loader ?? null;
        },
        '<init>(Landroid/os/PersistableBundle;)V': (self, [other]) => {
          const source = other?.$peer?.map;
          self.map = new Map(source || []);
        },
        'setClassLoader(Ljava/lang/ClassLoader;)V': (self, [loader]) => { self.classLoader = loader ?? null; },
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!self.classLoader && vm?.allocateRawObject) {
            const loader = vm.allocateRawObject('Ljava/lang/ClassLoader;');
            loader.$peer = { vm };
            self.classLoader = loader;
          }
          return self.classLoader ?? null;
        },
        'clone()Ljava/lang/Object;': (self, _args, vm) => {
          const copy = vm.allocateRawObject('Landroid/os/Bundle;');
          copy.$peer = { map: new Map(self.map), classLoader: self.classLoader ?? null };
          return copy;
        },
        'deepCopy()Landroid/os/Bundle;': (self, _args, vm) => {
          const copy = vm.allocateRawObject('Landroid/os/Bundle;');
          copy.$peer = { map: new Map(self.map), classLoader: self.classLoader ?? null };
          return copy;
        },
        'hasFileDescriptors()Z': () => false,
        'putByte(Ljava/lang/String;B)V': (self, [key, value]) => { self.map.set(jsString(key), value); },
        'putShort(Ljava/lang/String;S)V': (self, [key, value]) => { self.map.set(jsString(key), value); },
        'putCharSequence(Ljava/lang/String;Ljava/lang/CharSequence;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putSize(Ljava/lang/String;Landroid/util/Size;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putSizeF(Ljava/lang/String;Landroid/util/SizeF;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putParcelableArray(Ljava/lang/String;[Landroid/os/Parcelable;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putSparseParcelableArray(Ljava/lang/String;Landroid/util/SparseArray;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putCharSequenceArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putByteArray(Ljava/lang/String;[B)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putShortArray(Ljava/lang/String;[S)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putCharArray(Ljava/lang/String;[C)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putFloatArray(Ljava/lang/String;[F)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putCharSequenceArray(Ljava/lang/String;[Ljava/lang/CharSequence;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'putBinder(Ljava/lang/String;Landroid/os/IBinder;)V': (self, [key, value]) => { self.map.set(jsString(key), value ?? null); },
        'getByte(Ljava/lang/String;)B': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'getByte(Ljava/lang/String;B)Ljava/lang/Byte;': (self, [key, fallback]) => self.map.has(jsString(key)) ? Number(self.map.get(jsString(key))) : fallback,
        'getChar(Ljava/lang/String;)C': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'getShort(Ljava/lang/String;)S': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'getShort(Ljava/lang/String;S)S': (self, [key, fallback]) => Number(self.map.get(jsString(key)) ?? fallback),
        'getFloat(Ljava/lang/String;F)F': (self, [key, fallback]) => Number(self.map.get(jsString(key)) ?? fallback),
        'getCharSequence(Ljava/lang/String;)Ljava/lang/CharSequence;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getCharSequence(Ljava/lang/String;Ljava/lang/CharSequence;)Ljava/lang/CharSequence;': (self, [key, fallback]) => self.map.get(jsString(key)) ?? fallback,
        'getSize(Ljava/lang/String;)Landroid/util/Size;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getSizeF(Ljava/lang/String;)Landroid/util/SizeF;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getParcelableArray(Ljava/lang/String;)[Landroid/os/Parcelable;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getParcelableArrayList(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getSparseParcelableArray(Ljava/lang/String;)Landroid/util/SparseArray;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getIntegerArrayList(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getCharSequenceArrayList(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getByteArray(Ljava/lang/String;)[B': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getShortArray(Ljava/lang/String;)[S': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getCharArray(Ljava/lang/String;)[C': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getFloatArray(Ljava/lang/String;)[F': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getCharSequenceArray(Ljava/lang/String;)[Ljava/lang/CharSequence;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getBinder(Ljava/lang/String;)Landroid/os/IBinder;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'describeContents()I': () => 0,
        'writeToParcel(Landroid/os/Parcel;I)V': () => undefined,
        'readFromParcel(Landroid/os/Parcel;)V': () => undefined,
        'toString()Ljava/lang/String;': (self) => {
          const entries = [...self.map.entries()].map(([key, value]) => `${key}=${String(value)}`);
          return `Bundle[{${entries.join(', ')}}]`;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Looper;', {
      super: 'Ljava/lang/Object;',
      ctor: class LooperPeer {
        constructor(vm) {
          this.vm = vm;
          this.queue = vm.messageQueue;
        }
      },
      methods: {
        'getQueue()Landroid/os/MessageQueue;': (self) => self.queue,
        'getThread()Ljava/lang/Thread;': (self, _args, vm) => mainThreadObject(vm),
        'isCurrentThread()Z': () => true,
        // AppCompat / Material 启动期会调用 isMainThread() 判断是否已在主线程。
        'isMainThread()Z': () => true,
        'quit()V': (self) => self.quit?.(),
        'quitSafely()V': (self) => self.quit?.(),
      },
      staticMethods: {
        'getMainLooper()Landroid/os/Looper;': (_self, _args, vm) => vm.mainLooper,
        'myLooper()Landroid/os/Looper;': (_self, _args, vm) => vm.mainLooper,
        'prepare()V': () => undefined,
        'loop()V': (_self, _args, vm) => {
          const depth = (vm.__loopDepth = (vm.__loopDepth || 0) + 1);
          if (depth > 64) {
            vm.__loopDepth = 0;
            throw new Error('vm-thread-exit');
          }
          return undefined;
        },
      },
    })
  );
  defs.push(
    nativeDef('Landroid/os/HandlerThread;', {
      super: 'Ljava/lang/Thread;',
      ctor: class HandlerThreadPeer {
        constructor(vm, name) {
          this.vm = vm;
          this.name = name || 'HandlerThread';
          this.looper = null;
        }
      },
      methods: {
        '<init>(Ljava/lang/String;)V': (self, [name]) => { self.name = jsString(name) || 'HandlerThread'; },
        '<init>(Ljava/lang/String;I)V': (self, [name]) => { self.name = jsString(name) || 'HandlerThread'; },
        'start()V': (self, _args, vm) => {
          if (self.looper) return;
          self.looper = vm.allocateRawObject('Landroid/os/Looper;');
          self.looper.$peer = { vm, queue: vm.messageQueue };
        },
        'getLooper()Landroid/os/Looper;': (self) => self.looper,
        'quit()V': (self) => { self.looper = null; },
        'quitSafely()V': (self) => { self.looper = null; },
        'getThreadId()I': () => 4242,
      },
    })
  );


  defs.push(
    nativeDef('Landroid/os/MessageQueue;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'isIdle()Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Handler;', {
      super: 'Ljava/lang/Object;',
      ctor: class HandlerPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.queue = vm.messageQueue;
          this.callbacks = new Map();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.handler = new Handler(self.vm);
        },
        '<init>(Landroid/os/Looper;)V': (self) => {
          self.handler = new Handler(self.vm);
          self.looper = self.vm.mainLooper;
        },
        'post(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.post(runnable);
          return true;
        },
        'postDelayed(Ljava/lang/Runnable;J)Z': (self, [runnable, delay]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.postDelayed(runnable, Number(delay) || 0);
          return true;
        },
        'postAtFrontOfQueue(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.post(runnable);
          return true;
        },
        'removeCallbacks(Ljava/lang/Runnable;)V': (self, [runnable]) => {
          self.handler?.removeCallbacks(runnable);
        },
        'removeCallbacksAndMessages(Ljava/lang/Object;)V': (self, [token]) => {
          self.handler?.removeCallbacksAndMessages?.(token);
        },
        'removeMessages(I)V': (self, [what]) => {
          self.handler?.removeMessages(what);
        },
        'sendEmptyMessage(I)Z': (self, [what]) => {
          self.handler?.sendMessage({ what: Number(what) });
          return true;
        },
        'sendEmptyMessageDelayed(IJ)Z': (self, [what, delay]) => {
          self.handler?.sendMessageDelayed({ what: Number(what) }, Number(delay) || 0);
          return true;
        },
        'sendMessage(Landroid/os/Message;)Z': (self, [message]) => {
          self.handler?.sendMessage(message);
          return true;
        },
        'sendMessageDelayed(Landroid/os/Message;J)Z': (self, [message, delay]) => {
          self.handler?.sendMessageDelayed(message, Number(delay) || 0);
          return true;
        },
        'obtainMessage()Landroid/os/Message;': (self, _args, vm) => new MessagePeer(vm),
        'obtainMessage(I)Landroid/os/Message;': (self, [what], vm) => {
          const message = new MessagePeer(vm);
          message.what = what | 0;
          return message;
        },
        'obtainMessage(ILjava/lang/Object;)Landroid/os/Message;': (self, [what, obj], vm) => {
          const message = new MessagePeer(vm);
          message.what = what | 0;
          message.obj = obj ?? null;
          return message;
        },
        'obtainMessage(IIILjava/lang/Object;)Landroid/os/Message;': (self, [what, arg1, arg2, obj], vm) => {
          const message = new MessagePeer(vm);
          message.what = what | 0;
          message.arg1 = arg1 | 0;
          message.arg2 = arg2 | 0;
          message.obj = obj ?? null;
          return message;
        },
        'handleMessage(Landroid/os/Message;)V': () => undefined,
        'getLooper()Landroid/os/Looper;': (self) => self.vm.mainLooper,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Message;', {
      super: 'Ljava/lang/Object;',
      ctor: MessagePeer,
      methods: {
        'toString()Ljava/lang/String;': (self) => `Message{what=${self.what}}`,
        'setAsynchronous(Z)V': (self, [value]) => { self.asynchronous = !!value; },
        'isAsynchronous()Z': (self) => !!self.asynchronous,
        'getTarget()Landroid/os/Handler;': (self) => self.target ?? null,
        'setTarget(Landroid/os/Handler;)V': (self, [handler]) => { self.target = handler ?? null; },
        'getWhen()J': (self) => BigInt(Number(self.when) || 0),
        'sendToTarget()V': (self) => { self.target?.sendMessage?.(self); },
        'recycle()V': () => undefined,
        'copyFrom(Landroid/os/Message;)V': (self, [other]) => Object.assign(self, other || {}),
      },
      staticMethods: {
        'obtain()Landroid/os/Message;': (_self, _args, vm) => new MessagePeer(vm),
        'obtain(Landroid/os/Handler;)Landroid/os/Message;': (_self, [handler], vm) => {
          const message = new MessagePeer(vm);
          message.target = handler ?? null;
          return message;
        },
        'obtain(Landroid/os/Handler;Ljava/lang/Runnable;)Landroid/os/Message;': (_self, [handler, callback], vm) => {
          const message = new MessagePeer(vm);
          message.target = handler ?? null;
          message.callback = callback ?? null;
          return message;
        },
        'obtain(Landroid/os/Message;)Landroid/os/Message;': (_self, [source], vm) => {
          const message = new MessagePeer(vm);
          if (source) Object.assign(message, source);
          return message;
        },
        'obtain(Landroid/os/Handler;I)Landroid/os/Message;': (_self, [handler, what], vm) => {
          const message = new MessagePeer(vm);
          message.target = handler ?? null;
          message.what = what | 0;
          return message;
        },
        'obtain(Landroid/os/Handler;ILjava/lang/Object;)Landroid/os/Message;': (_self, [handler, what, obj], vm) => {
          const message = new MessagePeer(vm);
          message.target = handler ?? null;
          message.what = what | 0;
          message.obj = obj ?? null;
          return message;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/SystemClock;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'uptimeMillis()J': () => BigInt(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()))),
        'elapsedRealtime()J': () => BigInt(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()))),
        'sleep(J)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Ljava/lang/Process;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getInputStream()Ljava/io/InputStream;': (self) => self,
        'getErrorStream()Ljava/io/InputStream;': (self) => self,
        'getOutputStream()Ljava/io/OutputStream;': (_self, _args, vm) => makeSinkStream(vm),
        'waitFor()I': () => 0,
        'exitValue()I': () => 0,
        'destroy()V': () => undefined,
        'available()I': (self) => (self?.$output ? self.$output.length : 0),
      },
    })
  );

  defs.push(
    nativeDef('Ljava/lang/Runtime;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getRuntime()Ljava/lang/Runtime;': (_self, _args, vm) => ensureRuntimeSingleton(vm),
        'exec(Ljava/lang/String;)Ljava/lang/Process;': (_self, [command], vm) => makeFakeProcess(vm, jsString(command)),
        'exec([Ljava/lang/String;)Ljava/lang/Process;': (_self, [argv], vm) => {
          const parts = argv?.$data || argv?._items || argv?.items || [];
          return makeFakeProcess(vm, parts.map((p) => jsString(p)).join(' '));
        },
        'availableProcessors()I': () => deviceCapabilities().cores,
        'maxMemory()J': () => BigInt(deviceCapabilities().memoryBytes),
        'totalMemory()J': () => BigInt(deviceCapabilities().memoryBytes),
        'freeMemory()J': () => BigInt(deviceCapabilities().availBytes),
        'gc()V': () => undefined,
      },
      staticMethods: {
        'getRuntime()Ljava/lang/Runtime;': (_self, _args, vm) => ensureRuntimeSingleton(vm),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/SystemProperties;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'get(Ljava/lang/String;)Ljava/lang/String;': (_self, [key]) => systemProperty(jsString(key)),
        'get(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [key, fallback]) => {
          const value = systemProperty(jsString(key));
          return value !== null && value !== '' ? value : (fallback === undefined || fallback === null ? '' : jsString(fallback));
        },
        'getInt(Ljava/lang/String;I)I': (_self, [key, fallback]) => {
          const value = Number.parseInt(systemProperty(jsString(key)) ?? '', 10);
          return Number.isFinite(value) ? value : (fallback ?? 0);
        },
        'getLong(Ljava/lang/String;J)J': (_self, [key, fallback]) => {
          const value = systemProperty(jsString(key));
          return value !== null && value !== '' ? BigInt(Math.trunc(Number(value)) || 0) : BigInt(fallback ?? 0);
        },
        'getBoolean(Ljava/lang/String;Z)Z': (_self, [key, fallback]) => {
          const value = systemProperty(jsString(key));
          if (value === null || value === '') return Boolean(fallback);
          return value === '1' || value.toLowerCase() === 'true';
        },
        'set(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/system/StructUtsname;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'sysname()Ljava/lang/String;': () => 'Linux',
        'nodename()Ljava/lang/String;': () => 'localhost',
        'release()Ljava/lang/String;': () => '4.14.0',
        'version()Ljava/lang/String;': () => '#1 SMP PREEMPT',
        'machine()Ljava/lang/String;': () => 'aarch64',
      },
      instanceFields: new Map([
        ['sysname:Ljava/lang/String;', 'Linux'],
        ['nodename:Ljava/lang/String;', 'localhost'],
        ['release:Ljava/lang/String;', '4.14.0'],
        ['version:Ljava/lang/String;', '#1 SMP PREEMPT'],
        ['machine:Ljava/lang/String;', 'aarch64'],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/system/Os;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'uname()Landroid/system/StructUtsname;': (_self, _args, vm) => {
          const uts = vm.allocateRawObject('Landroid/system/StructUtsname;');
          uts.$peer = { sysname: 'Linux', nodename: 'localhost', release: '4.14.0', version: '#1 SMP PREEMPT', machine: 'aarch64' };
          return uts;
        },
        'getpid()I': () => 1,
        'getuid()I': () => 2000,
        'geteuid()I': () => 2000,
        'getgid()I': () => 2000,
        'getegid()I': () => 2000,

        // —— 进程 / 环境 ——
        'gettid()I': () => 1,
        'getppid()I': () => 1,
        'setsid()I': () => 1,
        'getenv(Ljava/lang/String;)Ljava/lang/String;': (_self, [name]) => {
          const key = jsString(name);
          const env = { PATH: '/sbin:/system/sbin:/system/bin:/system/xbin', ANDROID_ROOT: '/system', ANDROID_DATA: '/data' };
          return Object.prototype.hasOwnProperty.call(env, key) ? env[key] : null;
        },
        'setenv(Ljava/lang/String;Ljava/lang/String;Z)V': () => undefined,
        'unsetenv(Ljava/lang/String;)V': () => undefined,
        'environ()[Ljava/lang/String;': (_self, _args, vm) => vm.newArray('Ljava/lang/String;', 0, []),
        'execv(Ljava/lang/String;[Ljava/lang/String;)V': () => undefined,
        'execve(Ljava/lang/String;[Ljava/lang/String;[Ljava/lang/String;)V': () => undefined,
        'kill(II)V': () => undefined,
        'setuid(I)V': () => undefined,
        'seteuid(I)V': () => undefined,
        'setgid(I)V': () => undefined,
        'setegid(I)V': () => undefined,
        'umask(I)I': () => 0o022,
        'sysconf(I)J': () => BigInt(1),
        'prctl(IJJJJ)I': () => 0,
        'strerror(I)Ljava/lang/String;': (_self, [errno]) => `errno ${toInt(errno)}`,
        'strsignal(I)Ljava/lang/String;': (_self, [signal]) => `signal ${toInt(signal)}`,
        'gai_strerror(I)Ljava/lang/String;': (_self, [code]) => `gai ${toInt(code)}`,

        // —— 文件系统 ——
        'access(Ljava/lang/String;I)Z': () => false,
        'chmod(Ljava/lang/String;I)V': () => undefined,
        'fchmod(Ljava/io/FileDescriptor;I)V': () => undefined,
        'chown(Ljava/lang/String;II)V': () => undefined,
        'fchown(Ljava/io/FileDescriptor;II)V': () => undefined,
        'lchown(Ljava/lang/String;II)V': () => undefined,
        'close(Ljava/io/FileDescriptor;)V': () => undefined,
        'dup(Ljava/io/FileDescriptor;)Ljava/io/FileDescriptor;': () => null,
        'dup2(Ljava/io/FileDescriptor;I)Ljava/io/FileDescriptor;': () => null,
        'fcntlInt(Ljava/io/FileDescriptor;II)I': () => 0,
        'fdatasync(Ljava/io/FileDescriptor;)V': () => undefined,
        'fsync(Ljava/io/FileDescriptor;)V': () => undefined,
        'ftruncate(Ljava/io/FileDescriptor;J)V': () => undefined,
        'posix_fallocate(Ljava/io/FileDescriptor;JJ)V': () => undefined,
        'fstat(Ljava/io/FileDescriptor;)Landroid/system/StructStat;': () => null,
        'fstatvfs(Ljava/io/FileDescriptor;)Landroid/system/StructStatVfs;': () => null,
        'stat(Ljava/lang/String;)Landroid/system/StructStat;': () => null,
        'lstat(Ljava/lang/String;)Landroid/system/StructStat;': () => null,
        'statvfs(Ljava/lang/String;)Landroid/system/StructStatVfs;': () => null,
        'isatty(Ljava/io/FileDescriptor;)Z': () => false,
        'link(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'symlink(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'readlink(Ljava/lang/String;)Ljava/lang/String;': () => null,
        'listxattr(Ljava/lang/String;)[Ljava/lang/String;': (_self, _args, vm) => vm.newArray('Ljava/lang/String;', 0, []),
        'getxattr(Ljava/lang/String;Ljava/lang/String;)[B': () => null,
        'setxattr(Ljava/lang/String;Ljava/lang/String;[BI)V': () => undefined,
        'removexattr(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'lseek(Ljava/io/FileDescriptor;JI)J': (_self, [fd, offset]) => BigInt(Math.trunc(Number(offset) || 0)),
        'memfd_create(Ljava/lang/String;I)Ljava/io/FileDescriptor;': () => null,
        'mincore(JJ[B)V': () => undefined,
        'mkdir(Ljava/lang/String;I)V': () => undefined,
        'mkfifo(Ljava/lang/String;I)V': () => undefined,
        'mlock(JJ)V': () => undefined,
        'munlock(JJ)V': () => undefined,
        'mmap(JJIILjava/io/FileDescriptor;J)J': () => BigInt(0),
        'msync(JJI)V': () => undefined,
        'munmap(JJ)V': () => undefined,
        'open(Ljava/lang/String;II)Ljava/io/FileDescriptor;': () => null,
        'pipe()[Ljava/io/FileDescriptor;': (_self, _args, vm) => vm.newArray('Ljava/io/FileDescriptor;', 2, [null, null]),
        'poll([Landroid/system/StructPollfd;I)I': () => 0,
        'pread(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;J)I': () => -1,
        'pread(Ljava/io/FileDescriptor;[BIIJ)I': () => -1,
        'pwrite(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;J)I': () => -1,
        'pwrite(Ljava/io/FileDescriptor;[BIIJ)I': () => -1,
        'read(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;)I': () => -1,
        'read(Ljava/io/FileDescriptor;[BII)I': () => -1,
        'write(Ljava/io/FileDescriptor;[BII)I': (_self, [fd, buffer, offset, count]) => {
          const length = Array.isArray(buffer?.$data) ? buffer.$data.length : 0;
          return Math.max(0, Math.min(toInt(count), length - toInt(offset)));
        },
        'write(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;)I': () => 0,
        'readv(Ljava/io/FileDescriptor;[Ljava/lang/Object;[I[I)I': () => -1,
        'writev(Ljava/io/FileDescriptor;[Ljava/lang/Object;[I[I)I': () => 0,
        'remove(Ljava/lang/String;)V': () => undefined,
        'rename(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'sendfile(Ljava/io/FileDescriptor;Ljava/io/FileDescriptor;Landroid/system/Int64Ref;J)J': () => BigInt(0),

        // —— socket / 网络 ——
        'accept(Ljava/io/FileDescriptor;Ljava/net/InetSocketAddress;)Ljava/io/FileDescriptor;': () => null,
        'bind(Ljava/io/FileDescriptor;Ljava/net/InetAddress;I)V': () => undefined,
        'bind(Ljava/io/FileDescriptor;Ljava/net/SocketAddress;)V': () => undefined,
        'connect(Ljava/io/FileDescriptor;Ljava/net/InetAddress;I)V': () => undefined,
        'connect(Ljava/io/FileDescriptor;Ljava/net/SocketAddress;)V': () => undefined,
        'getpeername(Ljava/io/FileDescriptor;)Ljava/net/SocketAddress;': () => null,
        'getsockname(Ljava/io/FileDescriptor;)Ljava/net/SocketAddress;': () => null,
        'getsockoptTimeval(Ljava/io/FileDescriptor;II)Landroid/system/StructTimeval;': () => null,
        'if_indextoname(I)Ljava/lang/String;': () => null,
        'if_nametoindex(Ljava/lang/String;)I': () => 0,
        'inet_pton(ILjava/lang/String;)Ljava/net/InetAddress;': () => null,
        'listen(Ljava/io/FileDescriptor;I)V': () => undefined,
        'recvfrom(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;ILjava/net/InetSocketAddress;)I': () => -1,
        'recvfrom(Ljava/io/FileDescriptor;[BIIILjava/net/InetSocketAddress;)I': () => -1,
        'recvmsg(Ljava/io/FileDescriptor;Landroid/system/StructMsghdr;I)I': () => -1,
        'sendmsg(Ljava/io/FileDescriptor;Landroid/system/StructMsghdr;I)I': () => -1,
        'sendto(Ljava/io/FileDescriptor;Ljava/nio/ByteBuffer;ILjava/net/InetAddress;I)I': () => -1,
        'sendto(Ljava/io/FileDescriptor;[BIIILjava/net/InetAddress;I)I': () => -1,
        'sendto(Ljava/io/FileDescriptor;[BIIILjava/net/SocketAddress;)I': () => -1,
        'setsockoptInt(Ljava/io/FileDescriptor;III)V': () => undefined,
        'setsockoptTimeval(Ljava/io/FileDescriptor;IILandroid/system/StructTimeval;)V': () => undefined,
        'shutdown(Ljava/io/FileDescriptor;I)V': () => undefined,
        'socket(III)Ljava/io/FileDescriptor;': () => null,
        'socketpair(IIILjava/io/FileDescriptor;Ljava/io/FileDescriptor;)V': () => undefined,
        'tcdrain(Ljava/io/FileDescriptor;)V': () => undefined,
        'tcsendbreak(Ljava/io/FileDescriptor;I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Toast;', {
      super: 'Ljava/lang/Object;',
      ctor: class ToastPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.text = '';
          this.duration = 0;
          this.visible = false;
          this.overlay = null;
        }
      },
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => {
          self.text = jsString(text);
        },
        'setText(I)V': (self, [resId]) => {
          self.text = self.vm.resources.getString(resId >>> 0);
        },
        'setDuration(I)V': (self, [duration]) => {
          self.duration = Number(duration) || 0;
        },
        'show()V': (self) => {
          Toast.show(self.vm, self.text, self.duration);
        },
        'cancel()V': (self) => {
          Toast.cancel(self.vm);
        },
      },
      staticMethods: {
        'makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;': (_self, [context, text, duration], vm) => {
          const toast = vm.allocateRawObject('Landroid/widget/Toast;');
          toast.$peer = {
            vm,
            text: jsString(text),
            duration: Number(duration) || 0,
            constructor: { $descriptor: 'Landroid/widget/Toast;' },
            show() {
              Toast.show(vm, this.text, this.duration);
            },
            cancel() {
              Toast.cancel(vm);
            },
          };
          return toast;
        },
        'makeText(Landroid/content/Context;I)Landroid/widget/Toast;': (_self, [context, resId], vm) => {
          const toast = vm.allocateRawObject('Landroid/widget/Toast;');
          toast.$peer = {
            vm,
            text: vm.resources.getString(resId >>> 0),
            duration: 0,
            constructor: { $descriptor: 'Landroid/widget/Toast;' },
            show() {
              Toast.show(vm, this.text, this.duration);
            },
          };
          return toast;
        },
      },
      staticFields: new Map([
        ['LENGTH_SHORT:I', 0],
        ['LENGTH_LONG:I', 1],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/content/Intent;', {
      super: 'Ljava/lang/Object;',
      ctor: class IntentPeer {
        constructor(vm) {
          this.vm = vm;
          this.action = null;
          this.component = null;
          this.className = null;
          this.packageName = null;
          this.data = null;
          this.type = null;
          this.identifier = null;
          this.categories = [];
          this.selector = null;
          this.clipData = null;
          this.sourceBounds = null;
          this.extras = new Map();
          this.flags = 0;
        }

        setClass(className) {
          this.className = normalizeClassName(className, this.vm?.packageName);
          this.packageName = packageOfClassName(this.className) || this.vm?.packageName || null;
          return this;
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.action = null;
          self.className = null;
          self.packageName = null;
          self.data = null;
          self.type = null;
          self.identifier = null;
          self.categories = [];
          self.selector = null;
          self.clipData = null;
          self.sourceBounds = null;
          self.extras = new Map();
          self.flags = 0;
        },
        '<init>(Ljava/lang/String;Landroid/net/Uri;)V': (self, [action, data]) => {
          self.action = jsString(action);
          self.data = data ?? null;
        },
        '<init>(Ljava/lang/String;Landroid/net/Uri;Landroid/content/Context;Ljava/lang/Class;)V': (self, [action, data, _context, klass]) => {
          self.action = jsString(action);
          self.data = data ?? null;
          const descriptor = klass?.$descriptor || klass?.$peer?.descriptor || null;
          if (descriptor) self.setClass(descriptor);
        },
        '<init>(Landroid/content/Context;Ljava/lang/Class;)V': (self, [context, klass]) => {
          const descriptor = klass?.$descriptor || klass?.$peer?.descriptor || null;
          if (descriptor) self.setClass(descriptor);
        },
        '<init>(Ljava/lang/String;)V': (self, [action]) => {
          self.action = jsString(action);
        },
        '<init>(Landroid/content/Intent;)V': (self, [other]) => {
          const source = other?.$peer || other;
          self.action = source?.action ?? null;
          self.component = source?.component ?? null;
          self.className = source?.className ?? null;
          self.packageName = source?.packageName ?? null;
          self.data = source?.data ?? null;
          self.type = source?.type ?? null;
          self.identifier = source?.identifier ?? null;
          self.categories = [...(source?.categories || [])];
          self.selector = source?.selector ?? null;
          self.clipData = source?.clipData ?? null;
          self.sourceBounds = source?.sourceBounds ?? null;
          self.extras = new Map(source?.extras || []);
          self.flags = source?.flags ?? 0;
        },
        'setClass(Landroid/content/Context;Ljava/lang/Class;)Landroid/content/Intent;': (self, [_context, klass]) => {
          const descriptor = klass?.$descriptor || klass?.$peer?.descriptor || null;
          if (descriptor) self.setClass(descriptor);
          return self;
        },
        'setClassName(Landroid/content/Context;Ljava/lang/String;)Landroid/content/Intent;': (self, [_context, name]) => {
          self.setClass(jsString(name));
          return self;
        },
        'setClassName(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;': (self, [pkg, name]) => {
          self.setClass(jsString(name));
          self.packageName = jsString(pkg);
          return self;
        },
        'setComponent(Landroid/content/ComponentName;)Landroid/content/Intent;': (self, [component]) => {
          const peer = component?.$peer || component;
          if (peer?.className) {
            self.className = normalizeClassName(peer.className, peer.packageName);
            self.packageName = peer.packageName || null;
          }
          return self;
        },
        'getComponent()Landroid/content/ComponentName;': (self) => {
          if (!self.className) return null;
          return { $descriptor: 'Landroid/content/ComponentName;', packageName: self.packageName, className: self.className };
        },
        'getClassName()Ljava/lang/String;': (self) => self.className ?? null,
        'setPackage(Ljava/lang/String;)Landroid/content/Intent;': (self, [pkg]) => {
          self.packageName = jsString(pkg);
          return self;
        },
        'getPackage()Ljava/lang/String;': (self) => self.packageName ?? null,
        'addFlags(I)Landroid/content/Intent;': (self, [flags]) => {
          self.flags = (self.flags | (flags | 0)) >>> 0;
          return self;
        },
        'setFlags(I)Landroid/content/Intent;': (self, [flags]) => {
          self.flags = flags >>> 0;
          return self;
        },
        'getFlags()I': (self) => self.flags | 0,
        'setAction(Ljava/lang/String;)Landroid/content/Intent;': (self, [action]) => {
          self.action = jsString(action);
          return self;
        },
        'getAction()Ljava/lang/String;': (self) => self.action ?? null,
        'putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;I)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;Z)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;J)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;F)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;Ljava/io/Serializable;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtras(Landroid/os/Bundle;)Landroid/content/Intent;': (self, [bundle]) => {
          const data = bundle?.$peer?.map || bundle?.map;
          if (data instanceof Map) for (const [key, value] of data) self.extras.set(String(key), value);
          return self;
        },
        'getStringExtra(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getIntExtra(Ljava/lang/String;I)I': (self, [key, fallback]) => {
          const value = self.extras.get(jsString(key));
          return typeof value === 'number' ? value | 0 : fallback;
        },
        'getBooleanExtra(Ljava/lang/String;Z)Z': (self, [key, fallback]) => {
          const value = self.extras.get(jsString(key));
          return typeof value === 'boolean' ? value : fallback;
        },
        'hasExtra(Ljava/lang/String;)Z': (self, [key]) => self.extras.has(jsString(key)),
        'removeExtra(Ljava/lang/String;)V': (self, [key]) => {
          self.extras.delete(jsString(key));
        },
        'getExtras()Landroid/os/Bundle;': (self, _args, vm) => {
          if (!self.extras.size) return null;
          const object = vm.allocateRawObject('Landroid/os/Bundle;');
          object.$peer = { vm, map: new Map(self.extras) };
          return object;
        },
        'addCategory(Ljava/lang/String;)Landroid/content/Intent;': (self, [category]) => {
          const value = jsString(category);
          if (value && !self.categories.includes(value)) self.categories.push(value);
          return self;
        },
        'removeCategory(Ljava/lang/String;)V': (self, [category]) => {
          const value = jsString(category);
          self.categories = (self.categories || []).filter((item) => item !== value);
        },
        'getCategories()Ljava/util/Set;': (self, _args, vm) => {
          const set = vm.allocateRawObject('Ljava/util/HashSet;');
          set.$peer = { items: [...(self.categories || [])] };
          return set;
        },
        'hasCategory(Ljava/lang/String;)Z': (self, [category]) => (self.categories || []).includes(jsString(category)),
        'getData()Landroid/net/Uri;': (self, _args, vm) => {
          if (!self.data) return null;
          if (typeof self.data === 'string') return uriObject(vm, self.data);
          return self.data;
        },
        'getDataString()Ljava/lang/String;': (self) => {
          if (!self.data) return null;
          if (typeof self.data === 'string') return self.data;
          return self.data?.$peer?.$value ?? null;
        },
        'getScheme()Ljava/lang/String;': (self) => {
          const value = self.data?.$peer?.$scheme;
          return value ?? null;
        },
        'getType()Ljava/lang/String;': (self) => self.type ?? null,
        'resolveType(Landroid/content/Context;)Ljava/lang/String;': (self) => self.type ?? null,
        'resolveType(Landroid/content/ContentResolver;)Ljava/lang/String;': (self) => self.type ?? null,
        'resolveTypeIfNeeded(Landroid/content/ContentResolver;)Ljava/lang/String;': (self) => self.type ?? null,
        'setData(Landroid/net/Uri;)Landroid/content/Intent;': (self, [data]) => {
          self.data = data ?? null;
          return self;
        },
        'setDataAndNormalize(Landroid/net/Uri;)Landroid/content/Intent;': (self, [data]) => {
          self.data = data ?? null;
          return self;
        },
        'setType(Ljava/lang/String;)Landroid/content/Intent;': (self, [type]) => {
          self.type = jsString(type);
          return self;
        },
        'setTypeAndNormalize(Ljava/lang/String;)Landroid/content/Intent;': (self, [type]) => {
          self.type = normalizeMimeType(jsString(type));
          return self;
        },
        'setDataAndType(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;': (self, [data, type]) => {
          self.data = data ?? null;
          self.type = jsString(type);
          return self;
        },
        'setDataAndTypeAndNormalize(Landroid/net/Uri;Ljava/lang/String;)Landroid/content/Intent;': (self, [data, type]) => {
          self.data = data ?? null;
          self.type = normalizeMimeType(jsString(type));
          return self;
        },
        'getIdentifier()Ljava/lang/String;': (self) => self.identifier ?? null,
        'setIdentifier(Ljava/lang/String;)Landroid/content/Intent;': (self, [identifier]) => {
          self.identifier = jsString(identifier);
          return self;
        },
        'getSelector()Landroid/content/Intent;': (self) => self.selector ?? null,
        'setSelector(Landroid/content/Intent;)V': (self, [selector]) => { self.selector = selector ?? null; },
        'getClipData()Landroid/content/ClipData;': (self) => self.clipData ?? null,
        'setClipData(Landroid/content/ClipData;)V': (self, [clipData]) => { self.clipData = clipData ?? null; },
        'setExtrasClassLoader(Ljava/lang/ClassLoader;)V': () => undefined,
        'hasFileDescriptors()Z': () => false,
        'getSourceBounds()Landroid/graphics/Rect;': (self) => self.sourceBounds ?? null,
        'setSourceBounds(Landroid/graphics/Rect;)V': (self, [bounds]) => { self.sourceBounds = bounds ?? null; },
        'getParcelableArrayExtra(Ljava/lang/String;)[Landroid/os/Parcelable;': (self, [key]) => {
          const value = self.extras.get(jsString(key));
          return Array.isArray(value) ? value : null;
        },
        'getParcelableArrayListExtra(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getIntegerArrayListExtra(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getStringArrayListExtra(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getCharSequenceArrayListExtra(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getBooleanArrayExtra(Ljava/lang/String;)[Z': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getByteArrayExtra(Ljava/lang/String;)[B': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getShortArrayExtra(Ljava/lang/String;)[S': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getCharArrayExtra(Ljava/lang/String;)[C': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getLongArrayExtra(Ljava/lang/String;)[J': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getFloatArrayExtra(Ljava/lang/String;)[F': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getDoubleArrayExtra(Ljava/lang/String;)[D': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getCharSequenceArrayExtra(Ljava/lang/String;)[Ljava/lang/CharSequence;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getBundleExtra(Ljava/lang/String;)Landroid/os/Bundle;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'putExtra(Ljava/lang/String;D)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), Number(value));
          return self;
        },
        'putExtra(Ljava/lang/String;Ljava/lang/CharSequence;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;Landroid/os/Parcelable;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[Landroid/os/Parcelable;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[Z)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[B)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[S)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[C)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[J)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[F)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[D)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;[Ljava/lang/CharSequence;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putParcelableArrayListExtra(Ljava/lang/String;Ljava/util/ArrayList;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putIntegerArrayListExtra(Ljava/lang/String;Ljava/util/ArrayList;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putStringArrayListExtra(Ljava/lang/String;Ljava/util/ArrayList;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putCharSequenceArrayListExtra(Ljava/lang/String;Ljava/util/ArrayList;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtras(Landroid/content/Intent;)Landroid/content/Intent;': (self, [other]) => {
          const source = other?.$peer || other;
          for (const [key, value] of source?.extras || []) self.extras.set(String(key), value);
          return self;
        },
        'replaceExtras(Landroid/content/Intent;)Landroid/content/Intent;': (self, [other]) => {
          const source = other?.$peer || other;
          self.extras = new Map(source?.extras || []);
          return self;
        },
        'replaceExtras(Landroid/os/Bundle;)Landroid/content/Intent;': (self, [bundle]) => {
          const data = bundle?.$peer?.map || bundle?.map;
          self.extras = new Map(data instanceof Map ? data : []);
          return self;
        },
        'removeFlags(I)V': (self, [flags]) => {
          self.flags = (self.flags & ~(flags | 0)) >>> 0;
        },
        'clone()Ljava/lang/Object;': (self, _args, vm) => cloneIntent(vm, self),
        'cloneFilter()Landroid/content/Intent;': (self, _args, vm) => {
          const copy = cloneIntent(vm, self);
          copy.$peer.extras = new Map();
          return copy;
        },
        'filterEquals(Landroid/content/Intent;)Z': (self, [other]) => {
          const peer = other?.$peer || other;
          if (!peer) return false;
          return self.action === peer.action
            && self.type === peer.type
            && self.identifier === peer.identifier
            && self.className === peer.className
            && self.packageName === peer.packageName
            && String(self.data?.$peer?.$value ?? self.data ?? '') === String(peer.data?.$peer?.$value ?? peer.data ?? '')
            && (self.categories || []).join(',') === (peer.categories || []).join(',');
        },
        'filterHashCode()I': (self) => String(`${self.action}|${self.type}|${self.className}|${self.packageName}`).length,
        'fillIn(Landroid/content/Intent;I)I': (self, [other, flags]) => {
          const peer = other?.$peer || other;
          if (!peer) return flags | 0;
          let remaining = flags | 0;
          const copyFields = [['action', 0x01], ['data', 0x02], ['type', 0x04], ['className', 0x08], ['packageName', 0x08], ['identifier', 0x10]];
          for (const [field, bit] of copyFields) {
            if ((remaining & bit) && (self[field] === null || self[field] === undefined)) {
              self[field] = peer[field] ?? null;
              remaining &= ~bit;
            }
          }
          if ((remaining & 0x20) && !(self.categories || []).length) {
            self.categories = [...(peer.categories || [])];
            remaining &= ~0x20;
          }
          return remaining;
        },
        'resolveActivity(Landroid/content/pm/PackageManager;)Landroid/content/ComponentName;': (self, [pm], vm) => {
          const info = resolveIntentComponent(vm, self, pm);
          if (!info) return null;
          return { $descriptor: 'Landroid/content/ComponentName;', packageName: info.packageName, className: info.name };
        },
        'resolveActivityInfo(Landroid/content/pm/PackageManager;I)Landroid/content/pm/ActivityInfo;': (self, [_pm, flags], vm) => {
          const info = resolveIntentComponent(vm, self, null);
          return info ? activityInfoObject(vm, info) : null;
        },
        'toURI()Ljava/lang/String;': (self) => intentUriString(self),
        'toUri(I)Ljava/lang/String;': (self) => intentUriString(self),
        'describeContents()I': () => 0,
        'writeToParcel(Landroid/os/Parcel;I)V': () => undefined,
        'readFromParcel(Landroid/os/Parcel;)V': () => undefined,
        'toString()Ljava/lang/String;': (self) =>
          `Intent { ${self.action ? `act=${self.action} ` : ''}${self.className ? `cmp=${self.packageName || ''}/${self.className}` : ''} }`,
      },
      staticMethods: {
        'createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;': (_self, [intent], vm) => {
          const chooser = vm.allocateRawObject('Landroid/content/Intent;');
          chooser.$peer = { vm, action: 'android.intent.action.CHOOSER', extras: new Map([['android.intent.extra.INTENT', intent]]) };
          return chooser;
        },
        'createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;Landroid/content/IntentSender;)Landroid/content/Intent;': (_self, [intent], vm) => {
          const chooser = vm.allocateRawObject('Landroid/content/Intent;');
          chooser.$peer = { vm, action: 'android.intent.action.CHOOSER', extras: new Map([['android.intent.extra.INTENT', intent]]) };
          return chooser;
        },
        'makeMainActivity(Landroid/content/ComponentName;)Landroid/content/Intent;': (_self, [component], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.MAIN';
          intent.$peer.categories = ['android.intent.category.LAUNCHER'];
          if (component?.$peer) {
            intent.$peer.className = component.$peer.className;
            intent.$peer.packageName = component.$peer.packageName;
          }
          return intent;
        },
        'makeMainSelectorActivity(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;': (_self, [selectorAction, selectorCategory], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.MAIN';
          intent.$peer.categories = ['android.intent.category.LAUNCHER'];
          return intent;
        },
        'makeRestartActivityTask(Landroid/content/ComponentName;)Landroid/content/Intent;': (_self, [component], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.MAIN';
          intent.$peer.flags = 0x10000000 | 0x00008000;
          if (component?.$peer) {
            intent.$peer.className = component.$peer.className;
            intent.$peer.packageName = component.$peer.packageName;
          }
          return intent;
        },
        'getIntent(Ljava/lang/String;)Landroid/content/Intent;': (_self, [uri], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.VIEW';
          intent.$peer.data = uriObject(vm, jsString(uri));
          return intent;
        },
        'getIntentOld(Ljava/lang/String;)Landroid/content/Intent;': (_self, [uri], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.VIEW';
          intent.$peer.data = uriObject(vm, jsString(uri));
          return intent;
        },
        'parseUri(Ljava/lang/String;I)Landroid/content/Intent;': (_self, [uri], vm) => {
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.VIEW';
          intent.$peer.data = uriObject(vm, jsString(uri));
          return intent;
        },
        'parseIntent(Landroid/content/res/Resources;Lorg/xmlpull/v1/XmlPullParser;Landroid/util/AttributeSet;)Landroid/content/Intent;': () => null,
        'normalizeMimeType(Ljava/lang/String;)Ljava/lang/String;': (_self, [type]) => normalizeMimeType(jsString(type)),
      },
      staticFields: new Map([
        ['ACTION_MAIN:Ljava/lang/String;', 'android.intent.action.MAIN'],
        ['ACTION_VIEW:Ljava/lang/String;', 'android.intent.action.VIEW'],
        ['ACTION_BATTERY_CHANGED:Ljava/lang/String;', 'android.intent.action.BATTERY_CHANGED'],
        ['ACTION_BATTERY_LOW:Ljava/lang/String;', 'android.intent.action.BATTERY_LOW'],
        ['ACTION_POWER_CONNECTED:Ljava/lang/String;', 'android.intent.action.ACTION_POWER_CONNECTED'],
        ['ACTION_POWER_DISCONNECTED:Ljava/lang/String;', 'android.intent.action.ACTION_POWER_DISCONNECTED'],
        ['ACTION_SEND:Ljava/lang/String;', 'android.intent.action.SEND'],
        ['ACTION_PICK:Ljava/lang/String;', 'android.intent.action.PICK'],
        ['ACTION_GET_CONTENT:Ljava/lang/String;', 'android.intent.action.GET_CONTENT'],
        ['ACTION_OPEN_DOCUMENT:Ljava/lang/String;', 'android.intent.action.OPEN_DOCUMENT'],
        ['ACTION_CREATE_DOCUMENT:Ljava/lang/String;', 'android.intent.action.CREATE_DOCUMENT'],
        ['CATEGORY_DEFAULT:Ljava/lang/String;', 'android.intent.category.DEFAULT'],
        ['CATEGORY_LAUNCHER:Ljava/lang/String;', 'android.intent.category.LAUNCHER'],
        ['FLAG_ACTIVITY_NEW_TASK:I', 0x10000000],
        ['FLAG_ACTIVITY_CLEAR_TOP:I', 0x04000000],
        ['FLAG_ACTIVITY_SINGLE_TOP:I', 0x20000000],
        ['FLAG_ACTIVITY_CLEAR_TASK:I', 0x00008000],
        ['FLAG_GRANT_READ_URI_PERMISSION:I', 0x00000001],
        ['FLAG_GRANT_WRITE_URI_PERMISSION:I', 0x00000002],
      ]),
    })
  );

  class ViewConfigurationPeer {
    constructor() {
      this.touchSlop = 8;
      this.tapTimeout = 100;
      this.longPressTimeout = 500;
      this.doubleTapTimeout = 300;
      this.doubleTapSlop = 100;
      this.scrollBarSize = 4;
      this.pressedStateDuration = 64;
      this.keyRepeatTimeout = 500;
      this.windowTouchSlop = 8;
      this.hoverSlop = 8;
    }
  }

  defs.push(
    nativeDef('Landroid/view/InputDevice;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'getDeviceIds()[I': (_self, _args, vm) => {
          if (!vm) return null;
          const ids = INPUT_DEVICE_DEFINITIONS.map((device) => device.id);
          const array = vm.newArray('[I', ids.length, 0);
          const target = array?.$data || array;
          for (let i = 0; i < ids.length; i++) target[i] = ids[i];
          return array;
        },
        'getDevice(I)Landroid/view/InputDevice;': (_self, [id], vm) => {
          const def = INPUT_DEVICE_DEFINITIONS.find((device) => device.id === (id | 0));
          if (!def || !vm) return null;
          const object = vm.allocateRawObject('Landroid/view/InputDevice;');
          object.id = def.id;
          object.name = def.name;
          object.vendorId = def.vendorId;
          object.productId = def.productId;
          object.descriptor = def.descriptor;
          object.sources = def.sources;
          return object;
        },
      },
      methods: {
        'getName()Ljava/lang/String;': (self) => self.name ?? '',
        'getId()I': (self) => self.id | 0,
        'getVendorId()I': (self) => self.vendorId | 0,
        'getProductId()I': (self) => self.productId | 0,
        'getDescriptor()Ljava/lang/String;': (self) => self.descriptor ?? '',
        'getSources()I': (self) => self.sources | 0,
        'isVirtual()Z': () => false,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/view/ViewConfiguration;', {
      super: 'Ljava/lang/Object;',
      ctor: ViewConfigurationPeer,
      methods: {
        'getScaledHorizontalScrollFactor()F': () => 1.0,
        'getScaledVerticalScrollFactor()F': () => 1.0,
        'getScaledMinimumScalingSpan()I': () => 12,
        'getScaledTouchSlop()I': (self) => self.touchSlop ?? 8,
        'getScaledDoubleTapSlop()I': (self) => self.doubleTapSlop ?? 100,
        'getScaledMinimumFlingVelocity()I': () => 50,
        'getScaledMaximumFlingVelocity()I': () => 8000,
        'getScaledScrollBarSize()I': (self) => self.scrollBarSize ?? 4,
        'getScaledPagingTouchSlop()I': (self) => (self.touchSlop ?? 8) * 2,
        'getScaledHoverSlop()I': (self) => self.hoverSlop ?? 8,
        'getScaledOverscrollDistance()I': () => 0,
        'getScaledOverflingDistance()I': () => 0,
        'getScaledWindowTouchSlop()I': (self) => self.windowTouchSlop ?? 8,
        'getTapTimeout()I': (self) => self.tapTimeout ?? 100,
        'getLongPressTimeout()I': (self) => self.longPressTimeout ?? 500,
        'getDoubleTapTimeout()I': (self) => self.doubleTapTimeout ?? 300,
        'getKeyRepeatTimeout()I': (self) => self.keyRepeatTimeout ?? 500,
        'getKeyRepeatDelay()I': () => 50,
        'getPressedStateDuration()I': (self) => self.pressedStateDuration ?? 64,
        'getJumpTapTimeout()I': () => 500,
        'hasPermanentMenuKey()Z': () => false,
        'hasShowStableMenuKey()Z': () => true,
        'hasPermanentMenuKey(I)Z': () => false,
        'getDefaultActionModeHideDuration()I': () => 300,
      },
      staticMethods: {
        'get(Landroid/content/Context;)Landroid/view/ViewConfiguration;': (_self, _args, vm) => {
          if (!vm) return null;
          if (!vm.viewConfigurationObject) {
            const object = vm.allocateRawObject('Landroid/view/ViewConfiguration;');
            object.$peer = new ViewConfigurationPeer();
            vm.viewConfigurationObject = object;
          }
          return vm.viewConfigurationObject;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewTreeObserver;', {
      super: 'Ljava/lang/Object;',
      ctor: class ViewTreeObserverPeer {
        static $descriptor = 'Landroid/view/ViewTreeObserver;';
        constructor() {
          this.onGlobalLayoutListeners = [];
          this.onPreDrawListeners = [];
          this.onDrawListeners = [];
          this.alive = true;
        }
      },
      methods: {
        'addOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)V': (self, [listener]) => {
          if (listener) self.onGlobalLayoutListeners.push(listener);
        },
        'removeOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)V': (self, [listener]) => {
          const index = self.onGlobalLayoutListeners.indexOf(listener);
          if (index >= 0) self.onGlobalLayoutListeners.splice(index, 1);
        },
        'addOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)V': (self, [listener]) => {
          if (listener) self.onPreDrawListeners.push(listener);
        },
        'removeOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)V': (self, [listener]) => {
          const index = self.onPreDrawListeners.indexOf(listener);
          if (index >= 0) self.onPreDrawListeners.splice(index, 1);
        },
        'addOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)V': (self, [listener]) => {
          if (listener) self.onDrawListeners.push(listener);
        },
        'removeOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)V': (self, [listener]) => {
          const index = self.onDrawListeners.indexOf(listener);
          if (index >= 0) self.onDrawListeners.splice(index, 1);
        },
        'addOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)V': () => undefined,
        'removeOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)V': () => undefined,
        'addOnTouchModeChangeListener(Landroid/view/ViewTreeObserver$OnTouchModeChangeListener;)V': () => undefined,
        'removeOnTouchModeChangeListener(Landroid/view/ViewTreeObserver$OnTouchModeChangeListener;)V': () => undefined,
        'isAlive()Z': (self) => !!self.alive,
        'dispatchOnGlobalLayout()V': (self, _args, vm) => {
          for (const listener of [...self.onGlobalLayoutListeners]) {
            vm.invokeByName?.('onGlobalLayout', '()V', listener, []);
          }
        },
        'dispatchOnPreDraw()Z': (self, _args, vm) => {
          let result = true;
          for (const listener of [...self.onPreDrawListeners]) {
            const value = vm.invokeByName?.('onPreDraw', '()Z', listener, []);
            if (value === false) result = false;
          }
          return result;
        },
        'dispatchOnDraw()V': (self, _args, vm) => {
          for (const listener of [...self.onDrawListeners]) {
            vm.invokeByName?.('onDraw', '()V', listener, []);
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/inputmethod/InputMethodManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'showSoftInput(Landroid/view/View;I)Z': (self, [view], vm) => {
          const target = view?.$view || view?.view || vm.focusedEditable?.();
          if (target) vm.screen?.showKeyboard?.(target);
          return !!target;
        },
        'hideSoftInputFromWindow(Landroid/os/IBinder;I)Z': (self, _args, vm) => {
          vm.screen?.hideKeyboard?.();
          return true;
        },
        'toggleSoftInput(II)V': (self, _args, vm) => {
          if (vm.screen?.isKeyboardShown?.()) vm.screen.hideKeyboard();
          else {
            const target = vm.focusedEditable?.();
            if (target) vm.screen?.showKeyboard?.(target);
          }
        },
        'isActive()Z': (self, _args, vm) => !!vm.screen?.isKeyboardShown?.(),
        'restartInput(Landroid/view/View;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/Gravity;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['NO_GRAVITY:I', 0],
        ['TOP:I', 0x30],
        ['BOTTOM:I', 0x50],
        ['LEFT:I', 0x03],
        ['RIGHT:I', 0x05],
        ['START:I', 0x00800003],
        ['END:I', 0x00800005],
        ['CENTER_VERTICAL:I', 0x10],
        ['CENTER_HORIZONTAL:I', 0x01],
        ['CENTER:I', 0x11],
        ['FILL_VERTICAL:I', 0x70],
        ['FILL_HORIZONTAL:I', 0x07],
        ['FILL:I', 0x77],
      ]),
      staticMethods: {
        'getAbsoluteGravity(II)I': (_self, [gravity, layoutDirection]) => {
          const g = Number(gravity) | 0;
          const dir = Number(layoutDirection) | 0;
          if (dir !== 1) return g;
          let result = g;
          if ((g & 0x00800003) === 0x00800003) result = (g & ~0x00800003) | 0x00800005;
          else if ((g & 0x00800005) === 0x00800005) result = (g & ~0x00800005) | 0x00800003;
          if ((g & 0x00800000) === 0x00800000) result &= ~0x00800000;
          return result | 0;
        },
        'isVertical(I)Z': (_self, [g]) => (((Number(g) | 0) & 0x70) !== 0),
        'isHorizontal(I)Z': (_self, [g]) => (((Number(g) | 0) & 0x07) !== 0),
        'apply(IIILandroid/graphics/Rect;Landroid/graphics/Rect;)V': (_self, [gravity, w, h, container, out], vm) =>
          applyGravity(gravity | 0, w | 0, h | 0, container, out),
        'apply(IIILandroid/graphics/Rect;Landroid/graphics/Rect;I)V': (_self, [gravity, w, h, container, out, dir], vm) =>
          applyGravity(gravity | 0, w | 0, h | 0, container, out, dir | 0),
      },
    })
  );

  const PORTER_DUFF_MODES = [
    ['CLEAR', 0], ['SRC', 1], ['DST', 2], ['SRC_OVER', 3], ['DST_OVER', 4],
    ['SRC_IN', 5], ['DST_IN', 6], ['SRC_OUT', 7], ['DST_OUT', 8], ['SRC_ATOP', 9],
    ['DST_ATOP', 10], ['XOR', 11], ['DARKEN', 12], ['LIGHTEN', 13], ['MULTIPLY', 14],
    ['SCREEN', 15], ['ADD', 16], ['OVERLAY', 17],
  ];
  const porterDuffModePeer = (vm, name, ordinal) => {
    if (!vm.__porterDuffModes) vm.__porterDuffModes = new Map();
    const existing = vm.__porterDuffModes.get(name);
    if (existing) return existing;
    const object = vm.allocateRawObject('Landroid/graphics/PorterDuff$Mode;');
    object.$peer = { name, ordinal };
    vm.__porterDuffModes.set(name, object);
    return object;
  };
  defs.push(
    nativeDef('Landroid/graphics/PorterDuff$Mode;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map(
        PORTER_DUFF_MODES.map(([name, ordinal]) => [
          `${name}:Landroid/graphics/PorterDuff$Mode;`,
          { lazy: (vm) => porterDuffModePeer(vm, name, ordinal) },
        ])
      ),
      staticMethods: {
        'values()[Landroid/graphics/PorterDuff$Mode;': (_self, _args, vm) => {
          const array = vm.newArray('Landroid/graphics/PorterDuff$Mode;', PORTER_DUFF_MODES.length);
          PORTER_DUFF_MODES.forEach(([name, ordinal], i) => {
            array.$data[i] = porterDuffModePeer(vm, name, ordinal);
          });
          return array;
        },
        'valueOf(Ljava/lang/String;)Landroid/graphics/PorterDuff$Mode;': (_self, [name], vm) => {
          const entry = PORTER_DUFF_MODES.find(([n]) => n === String(name));
          return entry ? porterDuffModePeer(vm, entry[0], entry[1]) : null;
        },
      },
      methods: {
        'name()Ljava/lang/String;': (self) => self.name,
        'ordinal()I': (self) => self.ordinal,
        'toString()Ljava/lang/String;': (self) => self.name,
        'hashCode()I': (self) => self.ordinal + 1,
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          if (other === self) return true;
          if (!other || typeof other !== 'object') return false;
          const peer = other.$peer || other;
          return peer.name === self.name;
        },
        'compareTo(Ljava/lang/Enum;)I': (self, [other]) => {
          const peer = other?.$peer || other;
          return self.ordinal - Number(peer?.ordinal ?? 0);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/PorterDuffColorFilter;', {
      super: 'Landroid/graphics/ColorFilter;',
      ctor: class PorterDuffColorFilterPeer {
        constructor(vm, object, color, mode) {
          this.vm = vm;
          this.object = object;
          this.color = typeof color === 'number' ? color >>> 0 : 0;
          this.mode = mode ?? null;
          this.modeOrdinal = typeof mode === 'number' ? mode : (mode?.$peer?.ordinal ?? 5);
        }
      },
      methods: {
        '<init>(ILandroid/graphics/PorterDuff$Mode;)V': (self, [color, mode]) => {
          self.color = toInt(color) >>> 0;
          self.mode = mode ?? null;
          self.modeOrdinal = typeof mode === 'number' ? mode : (mode?.$peer?.ordinal ?? 5);
        },
        'getColor()I': (self) => self.color | 0,
        'getMode()Landroid/graphics/PorterDuff$Mode;': (self) => self.mode ?? null,
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer || other;
          return !!peer && (peer.color >>> 0) === (self.color >>> 0) && (peer.modeOrdinal ?? 5) === (self.modeOrdinal ?? 5);
        },
        'hashCode()I': (self) => ((self.color | 0) * 31 + (self.modeOrdinal | 0)) | 0,
      },
    }),
    nativeDef('Landroid/graphics/ColorFilter;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/graphics/ColorMatrixColorFilter;', {
      super: 'Landroid/graphics/ColorFilter;',
      ctor: class ColorMatrixColorFilterPeer {
        constructor(vm, object, matrix) {
          this.vm = vm;
          this.object = object;
          this.matrix = matrix ?? null;
        }
      },
      methods: {
        '<init>(Landroid/graphics/ColorMatrix;)V': (self, [matrix]) => { self.matrix = matrix ?? null; },
        '<init>([F)V': (self, [matrix]) => { self.matrix = matrix ?? null; },
      },
    }),
  );

  defs.push(
    nativeDef('Landroid/widget/PopupWindow;', {
      super: 'Ljava/lang/Object;',
      ctor: PopupWindowPeer,
      methods: {
        '<init>()V': () => undefined,
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        '<init>(Landroid/view/View;)V': (self, [contentView]) => {
          self.contentView = contentView ?? null;
        },
        '<init>(Landroid/view/View;II)V': (self, [contentView, width, height]) => {
          self.contentView = contentView ?? null;
          self.width = width | 0;
          self.height = height | 0;
        },
        '<init>(Landroid/view/View;IIZ)V': (self, [contentView, width, height, focusable]) => {
          self.contentView = contentView ?? null;
          self.width = width | 0;
          self.height = height | 0;
          self.focusable = !!focusable;
        },
        '<init>(II)V': (self, [width, height]) => {
          self.width = width | 0;
          self.height = height | 0;
        },
        'getContentView()Landroid/view/View;': (self) => self.contentView,
        'setContentView(Landroid/view/View;)V': (self, [contentView]) => {
          self.contentView = contentView ?? null;
        },
        'getWidth()I': (self) => self.width | 0,
        'setWidth(I)V': (self, [width]) => {
          self.width = width | 0;
        },
        'getHeight()I': (self) => self.height | 0,
        'setHeight(I)V': (self, [height]) => {
          self.height = height | 0;
        },
        'getBackground()Landroid/graphics/drawable/Drawable;': (self) => self.background,
        'setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [background]) => {
          self.background = background ?? null;
        },
        'setAnimationStyle(I)V': (self, [style]) => {
          self.animationStyle = style | 0;
        },
        'getAnimationStyle()I': (self) => self.animationStyle | 0,
        'setFocusable(Z)V': (self, [focusable]) => {
          self.focusable = !!focusable;
        },
        'getFocusable()Z': (self) => !!self.focusable,
        'setOutsideTouchable(Z)V': (self, [outsideTouchable]) => {
          self.outsideTouchable = !!outsideTouchable;
        },
        'isOutsideTouchable()Z': (self) => !!self.outsideTouchable,
        'setTouchable(Z)V': (self, [touchable]) => {
          self.touchable = !!touchable;
        },
        'isTouchable()Z': (self) => !!self.touchable,
        'setTouchModal(Z)V': (self, [touchModal]) => {
          self.touchModal = !!touchModal;
        },
        'setClippingEnabled(Z)V': (self, [enabled]) => {
          self.clippingEnabled = !!enabled;
        },
        'getClippingEnabled()Z': (self) => !!self.clippingEnabled,
        'setOverlapAnchor(Z)V': (self, [overlap]) => {
          self.overlapAnchor = !!overlap;
        },
        'getOverlapAnchor()Z': (self) => !!self.overlapAnchor,
        'setElevation(F)V': (self, [elevation]) => {
          self.elevation = Number(elevation) || 0;
        },
        'getElevation()F': (self) => Number(self.elevation) || 0,
        'setInputMethodMode(I)V': (self, [mode]) => {
          self.inputMethodMode = mode | 0;
        },
        'getInputMethodMode()I': (self) => self.inputMethodMode | 0,
        'setSoftInputMode(I)V': (self, [mode]) => {
          self.softInputMode = mode | 0;
        },
        'getSoftInputMode()I': (self) => self.softInputMode | 0,
        'setWindowLayoutType(I)V': (self, [type]) => {
          self.windowLayoutType = type | 0;
        },
        'getWindowLayoutType()I': (self) => self.windowLayoutType | 0,
        'setWindowLayoutMode(I)V': (self, [mode]) => {
          self.windowLayoutMode = mode | 0;
        },
        'getWindowLayoutMode()I': (self) => self.windowLayoutMode | 0,
        'setAttachedInDecor(Z)V': () => undefined,
        'isAttachedInDecor()Z': () => false,
        'setIgnoreCheekPress()V': () => undefined,
        'setEnterTransition(Ljava/lang/Object;)V': () => undefined,
        'setExitTransition(Ljava/lang/Object;)V': () => undefined,
        'setTouchInterceptor(Landroid/view/View$OnTouchListener;)V': (self, [listener]) => {
          self.touchInterceptor = listener ?? null;
        },
        'setOnDismissListener(Landroid/widget/PopupWindow$OnDismissListener;)V': (self, [listener]) => {
          self.dismissListener = listener ?? null;
        },
        'setOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)V': () => undefined,
        'showAsDropDown(Landroid/view/View;)V': (self, [anchor]) => {
          showPopupAsDropDown(self, anchor, 0, 0);
        },
        'showAsDropDown(Landroid/view/View;II)V': (self, [anchor, xoff, yoff]) => {
          showPopupAsDropDown(self, anchor, xoff, yoff);
        },
        'showAsDropDown(Landroid/view/View;III)V': (self, [anchor, xoff, yoff]) => {
          showPopupAsDropDown(self, anchor, xoff, yoff);
        },
        'showAtLocation(Landroid/view/View;III)V': (self, [parent, gravity, x, y]) => {
          showPopupAtLocation(self, parent, gravity, x, y);
        },
        'showAtLocation(Landroid/os/IBinder;III)V': (self, [_token, gravity, x, y]) => {
          showPopupAtLocation(self, null, gravity, x, y);
        },
        'dismiss()V': (self) => {
          dismissPopup(self);
        },
        'isShowing()Z': (self) => !!self.showing,
        'update()V': (self) => {
          if (self.showing && self.overlay) self.vm?.screen?.invalidate?.();
        },
        'update(II)V': (self, [width, height]) => {
          self.width = width | 0;
          self.height = height | 0;
          if (self.showing && self.overlay) self.vm?.screen?.invalidate?.();
        },
        'update(III)V': (self, [width, height]) => {
          self.width = width | 0;
          self.height = height | 0;
          if (self.showing && self.overlay) self.vm?.screen?.invalidate?.();
        },
        'update(Landroid/view/View;II)V': (self, [anchor, xoff, yoff]) => {
          if (self.showing) showPopupAsDropDown(self, anchor, xoff, yoff);
        },
        'update(Landroid/view/View;IIZ)V': (self, [anchor, xoff, yoff]) => {
          if (self.showing) showPopupAsDropDown(self, anchor, xoff, yoff);
        },
        'update(Landroid/view/View;IIII)V': (self, [anchor, xoff, yoff]) => {
          if (self.showing) showPopupAsDropDown(self, anchor, xoff, yoff);
        },
        'update(Z)V': (self) => {
          if (self.showing && self.overlay) self.vm?.screen?.invalidate?.();
        },
        'update(ZZ)V': () => undefined,
        'getMaxAvailableHeight(Landroid/view/View;)I': (self) => {
          const screen = self.vm?.screen;
          return Math.floor((screen?.height || 640) * 0.8);
        },
        'getMaxAvailableHeight(Landroid/view/View;I)I': (self) => {
          const screen = self.vm?.screen;
          return Math.floor((screen?.height || 640) * 0.8);
        },
        'isAboveAnchor()Z': () => false,
        'getEnterTransition()Ljava/lang/Object;': () => null,
        'getExitTransition()Ljava/lang/Object;': () => null,
        'getTransitionEpicenter()Landroid/graphics/Rect;': () => null,
        'setEpicenterBounds(Landroid/graphics/Rect;)V': () => undefined,
        'getEpicenterBounds()Landroid/graphics/Rect;': () => null,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View;', {
      super: 'Ljava/lang/Object;',
      ctor: viewPeerConstructor('Landroid/view/View;'),
      methods: {
        ...viewMethods(),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self, _args, vm) => applyProgrammaticViewStyle(vm, self, 0),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (self, args, vm) => applyProgrammaticViewStyle(vm, self, args?.[2] | 0),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;II)V': (self, args, vm) => applyProgrammaticViewStyle(vm, self, args?.[2] | 0),
        '<init>(Landroid/content/Context;)V': () => undefined,
      },
      staticMethods: {
        'generateViewId()I': () => ++VIEW_ID_COUNTER,
        'getDefaultSize(II)I': (_self, [size, spec]) => getDefaultSize(size, spec),
        'resolveSize(II)I': (_self, [size, spec]) => resolveSize(size, spec),
        'resolveSizeAndState(III)I': (_self, [size, spec, childState]) => (((resolveSize(size, spec) | (childState & 0xff000000)) >>> 0)),
        'combineMeasuredStates(II)I': (_self, [cur, next]) => ((cur | next) >>> 0),
      },
      staticFields: new Map([
        ['VISIBLE:I', 0],
        ['INVISIBLE:I', 4],
        ['GONE:I', 8],
        ['EMPTY_STATE_SET:[I', stateSetStatic([])],
        ['SELECTED_STATE_SET:[I', stateSetStatic([0x010100a1])],
        ['ENABLED_STATE_SET:[I', stateSetStatic([0x0101009e])],
        ['ENABLED_SELECTED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x010100a1])],
        ['FOCUSED_STATE_SET:[I', stateSetStatic([0x0101009c])],
        ['ENABLED_FOCUSED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x0101009c])],
        ['FOCUSED_SELECTED_STATE_SET:[I', stateSetStatic([0x0101009c, 0x010100a1])],
        ['ENABLED_FOCUSED_SELECTED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x0101009c, 0x010100a1])],
        ['PRESSED_STATE_SET:[I', stateSetStatic([0x010100a7])],
        ['ENABLED_PRESSED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x010100a7])],
        ['PRESSED_ENABLED_STATE_SET:[I', stateSetStatic([0x010100a7, 0x0101009e])],
        ['ACTIVATED_STATE_SET:[I', stateSetStatic([0x010102fe])],
        ['ENABLED_ACTIVATED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x010102fe])],
        ['HOVERED_STATE_SET:[I', stateSetStatic([0x01010367])],
        ['ENABLED_HOVERED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x01010367])],
        ['CHECKED_STATE_SET:[I', stateSetStatic([0x010100a0])],
        ['ENABLED_CHECKED_STATE_SET:[I', stateSetStatic([0x0101009e, 0x010100a0])],
        ['CHECKED_SELECTED_STATE_SET:[I', stateSetStatic([0x010100a0, 0x010100a1])],
        ['CHECKED_FOCUSED_STATE_SET:[I', stateSetStatic([0x010100a0, 0x0101009c])],
        ['CHECKED_PRESSED_STATE_SET:[I', stateSetStatic([0x010100a0, 0x010100a7])],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/view/ViewGroup;'),
      methods: {
        'setChildrenDrawingOrderEnabled(Z)V': () => undefined,
        'onScrollChanged(IIII)V': () => undefined,
        'removeCallbacks(Ljava/lang/Runnable;)Z': () => true,
        'setScrollContainer(Z)V': () => undefined,
        'getSuggestedMinimumWidth()I': (self) => self.view?.getSuggestedMinimumWidth?.() ?? self.view?.getMinimumWidth?.() ?? 0,
        'getSuggestedMinimumHeight()I': (self) => self.view?.getSuggestedMinimumHeight?.() ?? self.view?.getMinimumHeight?.() ?? 0,
        'addView(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            const existing = child.$layoutParamsObject;
            if (existing && existing.$fields) {
              child.layoutParams = coerceLayoutParams(existing);
            } else {
              const lp = adoptLayoutParams(self.vm, self, null);
              if (lp) {
                child.layoutParams = coerceLayoutParams(lp);
                if (lp.$fields) child.$layoutParamsObject = lp;
              }
            }
            self.view.addView(child);
          }
        },
        'addView(Landroid/view/View;I)V': (self, [view, index]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            const existing = child.$layoutParamsObject;
            if (existing && existing.$fields) {
              child.layoutParams = coerceLayoutParams(existing);
            } else {
              const lp = adoptLayoutParams(self.vm, self, null);
              if (lp) {
                child.layoutParams = coerceLayoutParams(lp);
                if (lp.$fields) child.$layoutParamsObject = lp;
              }
            }
            self.view.addView(child, index | 0);
          }
        },
        'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            const lp = adoptLayoutParams(self.vm, self, params);
            if (lp) {
              child.layoutParams = coerceLayoutParams(lp);
              if (lp.$fields) child.$layoutParamsObject = lp;
            }
            self.view.addView(child);
          }
        },
        'addView(Landroid/view/View;II)V': (self, [view, width, height]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            child.layoutParams = { width: width | 0, height: height | 0 };
            self.view.addView(child);
          }
        },
        'addView(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V': (self, [view, index, params]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            const lp = adoptLayoutParams(self.vm, self, params);
            if (lp) {
              child.layoutParams = coerceLayoutParams(lp);
              if (lp.$fields) child.$layoutParamsObject = lp;
            }
            self.view.addView(child, index | 0);
          }
        },
        'addViewInLayout(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)Z': (self, [view, index, params]) => {
          if (globalThis.DBG_AVIL) console.error('AVIL self.view=', !!self?.view, 'child=', !!view, 'idx=', index);
          const child = view?.$view || view;
          if (!child || !self.view) return false;
          const lp = adoptLayoutParams(self.vm, self, params);
          if (lp && typeof lp === 'object' && !lp.$peer) {
            child.layoutParams = lp;
            if (lp.$fields) child.$layoutParamsObject = lp;
          }
          self.view.addView(child, index | 0);
          return true;
        },
        'addViewInLayout(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;Z)Z': (self, [view, index, params]) => {
          const child = view?.$view || view;
          if (!child || !self.view) return false;
          const lp = adoptLayoutParams(self.vm, self, params);
          if (lp && typeof lp === 'object' && !lp.$peer) {
            child.layoutParams = lp;
            if (lp.$fields) child.$layoutParamsObject = lp;
          }
          self.view.addView(child, index | 0);
          return true;
        },
        'removeView(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.removeView(child);
        },
        'removeViewAt(I)V': (self, [index]) => self.view?.removeViewAt?.(index | 0),
        'removeViewInLayout(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.removeView(child);
        },
        'removeAllViews()V': (self) => self.view?.removeAllViews?.(),
        'removeAllViewsInLayout()V': (self) => self.view?.removeAllViews?.(),
        'removeDetachedView(Landroid/view/View;Z)V': (self, [view, animate], vm) => {
          const child = view?.$view || view;
          if (!child || !self.view) return;
          const index = self.view.children.indexOf(child);
          if (index >= 0) {
            self.view.children.splice(index, 1);
            child.parent = null;
            if (typeof child.onDetachedFromWindow === 'function') child.onDetachedFromWindow();
            self.view.requestLayout?.();
            self.view.invalidate?.();
          }
        },
        'detachViewFromParent(I)V': (self, [index]) => {
          const child = self.view?.children?.[index | 0];
          if (!child) return;
          self.view.children.splice(index | 0, 1);
          child.parent = null;
          child.__detachedFromParent = true;
        },
        'detachViewFromParent(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (!child || !self.view) return;
          const index = self.view.children.indexOf(child);
          if (index >= 0) self.view.children.splice(index, 1);
          child.parent = null;
          child.__detachedFromParent = true;
        },
        'detachAllViewsFromParent()V': (self) => {
          for (const child of (self.view?.children || [])) {
            child.parent = null;
            child.__detachedFromParent = true;
          }
          if (self.view) self.view.children = [];
        },
        'attachViewToParent(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V': (self, [view, index, params]) => {
          const child = view?.$view || view;
          if (!child || !self.view) return;
          if (params && typeof params === 'object' && !params.$peer) child.layoutParams = params;
          child.parent = self.view;
          child.__detachedFromParent = false;
          const at = (index | 0) < 0 ? self.view.children.length : (index | 0);
          self.view.children.splice(at, 0, child);
        },
        'getChildCount()I': (self) => self.view?.getChildCount?.() ?? 0,
        'getChildAt(I)Landroid/view/View;': (self, [index], vm) => {
          if (globalThis.FV_DBG) console.error('GETCHILD self=', typeof self, 'hasView=', !!self?.view, 'idx=', index, 'kids=', self?.view?.children?.length);
          const child = self.view?.getChildAt?.(index | 0);
          return child ? viewObject(vm, child) : null;
        },
        'indexOfChild(Landroid/view/View;)I': (self, [view]) => {
          const child = view?.$view || view;
          return child && self.view ? self.view.indexOfChild(child) : -1;
        },
        'setClipChildren(Z)V': (self, [value]) => self.view?.setClipChildren?.(!!value),
        'setClipToPadding(Z)V': (self, [value]) => self.view?.setClipToPadding?.(!!value),
        'setPadding(IIII)V': (self, [l, t, r, b]) => self.view?.setPadding(l | 0, t | 0, r | 0, b | 0),
        'measureChildren(II)V': (self, [w, h]) => self.view?.measureChildren?.(w, h),
        'measureChildWithMargins(Landroid/view/View;IIII)V': (self, [child, wSpec, wUsed, hSpec, hUsed]) => {
          const view = child?.$view || child;
          self.view?.measureChildWithMargins?.(view, wSpec | 0, wUsed | 0, hSpec | 0, hUsed | 0);
        },
        'offsetChildrenTopAndBottom(I)V': (self, [offset]) => self.view?.offsetChildrenTopAndBottom?.(offset | 0),
    'offsetChildrenLeftAndRight(I)V': (self, [offset]) => self.view?.offsetChildrenLeftAndRight?.(offset | 0),
    'drawChild(Landroid/graphics/Canvas;Landroid/view/View;J)Z': (self, [canvas, child]) => {
          const hostCanvas = canvas?.$peer?.canvas || canvas;
          const hostChild = child?.$view || child?.$peer?.view || null;
          if (hostChild && hostCanvas && typeof hostChild.draw === 'function') {
            hostChild.draw(hostCanvas);
            return true;
          }
          return false;
        },
        'dispatchDraw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.dispatchDraw?.(canvas?.$peer?.canvas || canvas),
        'getBackground()Landroid/graphics/drawable/Drawable;': (self) => self.view?.getBackground() ?? null,
        'getBaseline()I': (self) => self.view?.getBaseline?.() ?? -1,
        'getFocusedChild()Landroid/view/View;': () => null,
        'hasFocus()Z': (self) => self.view?.hasFocus?.() ?? false,
        'focusSearch(Landroid/view/View;I)Landroid/view/View;': () => null,
        'requestChildFocus(Landroid/view/View;Landroid/view/View;)V': () => undefined,
        'requestDisallowInterceptTouchEvent(Z)V': () => undefined,
        'onViewAdded(Landroid/view/View;)V': () => undefined,
        'onViewRemoved(Landroid/view/View;)V': () => undefined,
        'setOnHierarchyChangeListener(Landroid/view/ViewGroup$OnHierarchyChangeListener;)V': () => undefined,
        'setDescendantFocusability(I)V': () => undefined,
        'getLayoutMode()I': () => 0,
        'setLayoutMode(I)V': () => undefined,
        'getLayoutTransition()Landroid/animation/LayoutTransition;': () => null,
        'setLayoutTransition(Landroid/animation/LayoutTransition;)V': () => undefined,
        'setMotionEventSplittingEnabled(Z)V': () => undefined,
        'isTransitionGroup()Z': () => false,
        'setTransitionGroup(Z)V': () => undefined,
        'onRequestSendAccessibilityEvent(Landroid/view/View;Landroid/view/accessibility/AccessibilityEvent;)Z': () => true,
        'startViewTransition(Landroid/view/View;)V': () => undefined,
        'endViewTransition(Landroid/view/View;)V': () => undefined,
        'checkLayoutParams(Landroid/view/ViewGroup$LayoutParams;)Z': () => true,
        // 子类不覆写时回落到 ViewGroup 默认值：WRAP_CONTENT 的宽度/高度。
        // 缺了它，控件的 layoutParams 会是空，测量时宽度直接塌成 0。
        'generateDefaultLayoutParams()Landroid/view/ViewGroup$LayoutParams;': (self, _args, vm) => {
          const params = vm.allocateRawObject('Landroid/view/ViewGroup$LayoutParams;');
          params.$peer = { width: -2, height: -2 };
          return params;
        },
        'generateLayoutParams(Landroid/util/AttributeSet;)Landroid/view/ViewGroup$LayoutParams;': (self, [attrs], vm) => {
          const params = vm.allocateRawObject('Landroid/view/ViewGroup$LayoutParams;');
          params.$peer = { width: -2, height: -2, attributeSet: attrs ?? null };
          return params;
        },
        'getNestedScrollAxes()I': () => 0,
        'setNestedScrollAxes(I)V': () => undefined,
        // NestedScrollingParent 契约：默认不拦截，交给父视图继续往上冒泡。
        // 子视图（如列表）在滑动前会先问父级要不要接手，缺了这几个方法，
        // 依赖嵌套滚动的控件在滑动手势下会完全不动。
        'onStartNestedScroll(Landroid/view/View;Landroid/view/View;I)Z': () => false,
        'onNestedScrollAccepted(Landroid/view/View;Landroid/view/View;I)V': () => undefined,
        'onStopNestedScroll(Landroid/view/View;)V': () => undefined,
        'onNestedScroll(Landroid/view/View;IIIII)V': () => undefined,
        'onNestedScroll(Landroid/view/View;IIIIII[I)V': () => undefined,
        'onNestedPreScroll(Landroid/view/View;II[I)V': () => undefined,
        'onNestedPreScroll(Landroid/view/View;II[II)V': () => undefined,
        'onNestedFling(Landroid/view/View;FFZ)Z': () => false,
        'onNestedPreFling(Landroid/view/View;FF)Z': () => false,
        'onNestedScroll(Landroid/view/View;IIII)V': () => undefined,
        // 以下按 AOSP ViewGroup 的转发语义实现：事件先给子视图，子视图不消费再返回 false。
        'focusableViewAvailable(Landroid/view/View;)V': () => undefined,
        'showContextMenuForChild(Landroid/view/View;)Z': () => false,
        'showContextMenuForChild(Landroid/view/View;FF)Z': () => false,
        'startActionModeForChild(Landroid/view/View;Landroid/view/ActionMode$Callback;)Landroid/view/ActionMode;': () => null,
        'startActionModeForChild(Landroid/view/View;Landroid/view/ActionMode$Callback;I)Landroid/view/ActionMode;': () => null,
        'requestChildRectangleOnScreen(Landroid/view/View;Landroid/graphics/Rect;Z)Z': () => false,
        'requestSendAccessibilityEvent(Landroid/view/View;Landroid/view/accessibility/AccessibilityEvent;)Z': () => true,
        'childHasTransientStateChanged(Landroid/view/View;Z)V': () => undefined,
        'dispatchUnhandledMove(Landroid/view/View;I)Z': () => false,
        'clearChildFocus(Landroid/view/View;)V': (self, [view]) => {
          const child = unwrapView(view);
          if (!self.view || !child) return;
          if (self.view.focusedChild === child) {
            self.view.focusedChild = null;
            self.view.focused = false;
            child.focused = false;
          }
        },
        'addFocusables(Ljava/util/ArrayList;II)V': (self, [list, _direction, _focusableMode], vm) => {
          const items = list?.$peer?.items || [];
          for (const child of self.view?.children || []) {
            if (child.visibility === 8 || child.focusable === false) continue;
            items.push(viewObject(vm, child));
          }
          if (list?.$peer) list.$peer.items = items;
        },
        'addKeyboardNavigationClusters(Ljava/util/Collection;I)V': () => undefined,
        'setTouchscreenBlocksFocus(Z)V': (self, [value]) => { self.touchscreenBlocksFocus = !!value; },
        'getTouchscreenBlocksFocus()Z': (self) => !!self?.touchscreenBlocksFocus,
        'findViewsWithText(Ljava/util/ArrayList;Ljava/lang/CharSequence;I)V': (self, [list, text], vm) => {
          const needle = String(text ?? '').toLowerCase();
          const items = list?.$peer?.items || [];
          const visit = (view) => {
            const content = String(view?.text ?? view?.hint ?? '').toLowerCase();
            if (content && content.includes(needle)) items.push(viewObject(vm, view));
            for (const child of view?.children || []) visit(child);
          };
          for (const child of self.view?.children || []) visit(child);
          if (list?.$peer) list.$peer.items = items;
        },
        'dispatchWindowFocusChanged(Z)V': (self, [hasFocus]) => {
          for (const child of self.view?.children || []) child.dispatchWindowFocusChanged?.(!!hasFocus);
        },
        'addTouchables(Ljava/util/ArrayList;)V': (self, [list], vm) => {
          const items = list?.$peer?.items || [];
          for (const child of self.view?.children || []) {
            if (child.visibility === 8 || child.clickable !== true) continue;
            items.push(viewObject(vm, child));
          }
          if (list?.$peer) list.$peer.items = items;
        },
        'dispatchDisplayHint(I)V': (self, [hint]) => {
          for (const child of self.view?.children || []) child.dispatchDisplayHint?.(hint | 0);
        },
        'dispatchVisibilityChanged(Landroid/view/View;I)V': (self, [source, visibility]) => {
          for (const child of self.view?.children || []) child.dispatchVisibilityChanged?.(source, visibility | 0);
        },
        'dispatchWindowVisibilityChanged(I)V': (self, [visibility]) => {
          for (const child of self.view?.children || []) child.dispatchWindowVisibilityChanged?.(visibility | 0);
        },
        'dispatchConfigurationChanged(Landroid/content/res/Configuration;)V': (self, [configuration]) => {
          for (const child of self.view?.children || []) child.dispatchConfigurationChanged?.(configuration);
        },
        'recomputeViewAttributes(Landroid/view/View;)V': () => undefined,
        'dispatchDragEvent(Landroid/view/DragEvent;)Z': () => false,
        'dispatchWindowSystemUiVisiblityChanged(I)V': (self, [visibility]) => {
          for (const child of self.view?.children || []) child.dispatchWindowSystemUiVisiblityChanged?.(visibility | 0);
        },
        'dispatchSystemUiVisibilityChanged(I)V': (self, [visibility]) => {
          for (const child of self.view?.children || []) child.dispatchSystemUiVisibilityChanged?.(visibility | 0);
        },
        'dispatchKeyEventPreIme(Landroid/view/KeyEvent;)Z': () => false,
        'dispatchKeyEvent(Landroid/view/KeyEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchKeyEvent', event),
        'dispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchKeyShortcutEvent', event),
        'dispatchTrackballEvent(Landroid/view/MotionEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchTrackballEvent', event),
        'dispatchCapturedPointerEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchPointerCaptureChanged(Z)V': (self, [hasCapture]) => {
          for (const child of self.view?.children || []) child.dispatchPointerCaptureChanged?.(!!hasCapture);
        },
        'onResolvePointerIcon(Landroid/view/MotionEvent;I)Landroid/view/PointerIcon;': () => null,
        'dispatchHoverEvent(Landroid/view/MotionEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchHoverEvent', event),
        'addChildrenForAccessibility(Ljava/util/ArrayList;)V': (self, [list], vm) => {
          const items = list?.$peer?.items || [];
          for (const child of self.view?.children || []) items.push(viewObject(vm, child));
          if (list?.$peer) list.$peer.items = items;
        },
        'onInterceptHoverEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchGenericPointerEvent(Landroid/view/MotionEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchGenericPointerEvent', event),
        'dispatchGenericFocusedEvent(Landroid/view/MotionEvent;)Z': (self, [event]) =>
          dispatchToHostChildren(self, 'dispatchGenericFocusedEvent', event),
        'onInterceptTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
        'requestFocus(ILandroid/graphics/Rect;)Z': (self) => {
          if (!self.view) return false;
          if (self.view.focusable === false) return false;
          self.view.focused = true;
          return true;
        },
        'onRequestFocusInDescendants(ILandroid/graphics/Rect;)Z': (self, [direction]) => {
          const children = self.view?.children || [];
          const forward = (direction & 0x42) !== 0 || (direction | 0) === 0x42;
          const ordered = forward ? children : [...children].reverse();
          for (const child of ordered) {
            if (child.visibility === 8) continue;
            if (child.requestFocus?.(direction | 0, null)) return true;
          }
          return false;
        },
        'restoreDefaultFocus()Z': (self) => {
          const children = self.view?.children || [];
          for (const child of children) {
            if (child.visibility === 8) continue;
            if (child.requestFocus?.()) return true;
          }
          return false;
        },
        'dispatchStartTemporaryDetach()V': (self) => {
          for (const child of self.view?.children || []) child.dispatchStartTemporaryDetach?.();
        },
        'dispatchFinishTemporaryDetach()V': (self) => {
          for (const child of self.view?.children || []) child.dispatchFinishTemporaryDetach?.();
        },
        'notifySubtreeAccessibilityStateChanged(Landroid/view/View;Landroid/view/View;I)V': () => undefined,
        'onNestedPrePerformAccessibilityAction(Landroid/view/View;ILandroid/os/Bundle;)Z': () => false,
        'dispatchSaveInstanceState(Landroid/util/SparseArray;)V': () => undefined,
        'dispatchFreezeSelfOnly(Landroid/util/SparseArray;)V': () => undefined,
        'dispatchRestoreInstanceState(Landroid/util/SparseArray;)V': () => undefined,
        'dispatchThawSelfOnly(Landroid/util/SparseArray;)V': () => undefined,
        'setChildrenDrawingCacheEnabled(Z)V': (self, [value]) => { self.childrenDrawingCacheEnabled = !!value; },
        'getOverlay()Landroid/view/ViewGroupOverlay;': () => null,
        'getChildDrawingOrder(I)I': (_self, [index]) => index | 0,
        'dispatchSetSelected(Z)V': (self, [selected]) => {
          for (const child of self.view?.children || []) child.setSelected?.(!!selected);
        },
        'dispatchSetActivated(Z)V': (self, [activated]) => {
          for (const child of self.view?.children || []) child.setActivated?.(!!activated);
        },
        'dispatchSetPressed(Z)V': (self, [pressed]) => {
          for (const child of self.view?.children || []) child.setPressed?.(!!pressed);
        },
        'dispatchDrawableHotspotChanged(FF)V': (self, [x, y]) => {
          for (const child of self.view?.children || []) child.dispatchDrawableHotspotChanged?.(Number(x), Number(y));
        },
        'setStaticTransformationsEnabled(Z)V': (self, [value]) => { self.staticTransformationsEnabled = !!value; },
        'getChildStaticTransformation(Landroid/view/View;Landroid/view/animation/Transformation;)Z': () => false,
        'updateViewLayout(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params]) => {
          const child = unwrapView(view);
          if (!child) return;
          if (params && typeof params === 'object') child.layoutParams = params.$peer ? coerceLayoutParams(params) : params;
          child.requestLayout?.();
          self.view?.requestLayout?.();
        },
        'cleanupLayoutState(Landroid/view/View;)V': (self, [view]) => {
          const child = unwrapView(view);
          if (child) child.__layoutRequested = false;
        },
        'attachLayoutAnimationParameters(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;II)V': () => undefined,
        'removeViewsInLayout(II)V': (self, [start, count]) => {
          if (self.view?.children) self.view.children.splice(start | 0, count | 0);
          self.view?.requestLayout?.();
        },
        'removeViews(II)V': (self, [start, count]) => {
          if (self.view?.children) {
            for (const child of self.view.children.splice(start | 0, count | 0)) child.parent = null;
          }
          self.view?.requestLayout?.();
          self.view?.invalidate?.();
        },
        'detachViewsFromParent(II)V': (self, [start, count]) => {
          if (!self.view?.children) return;
          for (const child of self.view.children.splice(start | 0, count | 0)) {
            child.parent = null;
            child.__detachedFromParent = true;
          }
        },
        'onDescendantInvalidated(Landroid/view/View;Landroid/view/View;)V': (self) => self.view?.invalidate?.(),
        'invalidateChild(Landroid/view/View;Landroid/graphics/Rect;)V': (self) => self.view?.invalidate?.(),
        'invalidateChildInParent([ILandroid/graphics/Rect;)Landroid/view/ViewParent;': () => null,
        'offsetRectIntoDescendantCoords(Landroid/view/View;Landroid/graphics/Rect;)V': (self, [view, rect]) => {
          const child = unwrapView(view);
          const target = rect?.$peer?.rect || rect;
          if (!child || !target) return;
          let dx = 0;
          let dy = 0;
          let node = child;
          while (node && node !== self.view) {
            dx += node.left || 0;
            dy += node.top || 0;
            node = node.parent;
          }
          target.offset(-dx, -dy);
        },
        'canAnimate()Z': () => false,
        'startLayoutAnimation()V': () => undefined,
        'scheduleLayoutAnimation()V': () => undefined,
        'setLayoutAnimation(Landroid/view/animation/LayoutAnimationController;)V': (self, [controller]) => {
          self.layoutAnimation = controller ?? null;
        },
        'getLayoutAnimation()Landroid/view/animation/LayoutAnimationController;': (self) => self?.layoutAnimation ?? null,
        'isAnimationCacheEnabled()Z': (self) => self?.animationCacheEnabled !== false,
        'setAnimationCacheEnabled(Z)V': (self, [value]) => { self.animationCacheEnabled = !!value; },
        'isAlwaysDrawnWithCacheEnabled()Z': (self) => self?.alwaysDrawnWithCache !== false,
        'setAlwaysDrawnWithCacheEnabled(Z)V': (self, [value]) => { self.alwaysDrawnWithCache = !!value; },
        'isChildrenDrawnWithCacheEnabled()Z': (self) => !!self?.childrenDrawnWithCache,
        'setChildrenDrawnWithCacheEnabled(Z)V': (self, [value]) => { self.childrenDrawnWithCache = !!value; },
        'getPersistentDrawingCache()I': (self) => self?.persistentDrawingCache ?? 2,
        'setPersistentDrawingCache(I)V': (self, [value]) => { self.persistentDrawingCache = value | 0; },
        'generateLayoutParams(Landroid/view/ViewGroup$LayoutParams;)Landroid/view/ViewGroup$LayoutParams;': (_self, [params]) => params ?? null,
        'debug(I)V': () => undefined,
        'measureChild(Landroid/view/View;II)V': (self, [view, widthSpec, heightSpec]) => {
          const child = unwrapView(view);
          self.view?.measureChild?.(child, widthSpec | 0, heightSpec | 0);
        },
        'clearDisappearingChildren()V': () => undefined,
        'suppressLayout(Z)V': (self, [suppress]) => { self.layoutSuppressed = !!suppress; },
        'isLayoutSuppressed()Z': (self) => !!self?.layoutSuppressed,
        'gatherTransparentRegion(Landroid/graphics/Region;)Z': () => false,
        'requestTransparentRegion(Landroid/view/View;)V': () => undefined,
        'dispatchWindowInsetsAnimationPrepare(Landroid/view/WindowInsetsAnimation;)V': () => undefined,
        'dispatchWindowInsetsAnimationStart(Landroid/view/WindowInsetsAnimation;Landroid/view/WindowInsetsAnimation$Bounds;)Landroid/view/WindowInsetsAnimation$Bounds;': (_self, [_animation, bounds]) => bounds ?? null,
        'dispatchWindowInsetsAnimationProgress(Landroid/view/WindowInsets;Ljava/util/List;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
        'dispatchWindowInsetsAnimationEnd(Landroid/view/WindowInsetsAnimation;)V': () => undefined,
        'dispatchScrollCaptureSearch(Landroid/graphics/Rect;Landroid/graphics/Point;Ljava/util/function/Consumer;)V': () => undefined,
        'getLayoutAnimationListener()Landroid/view/animation/Animation$AnimationListener;': (self) =>
          self?.layoutAnimationListener ?? null,
        'setLayoutAnimationListener(Landroid/view/animation/Animation$AnimationListener;)V': (self, [listener]) => {
          self.layoutAnimationListener = listener ?? null;
        },
        'onCreateDrawableState(I)[I': (self, [extraSpace], vm) => {
          const base = self.view?.getDrawableState?.() ?? [];
          const array = vm.newArray('[I', base.length + (extraSpace | 0), null);
          const target = array?.$data;
          if (Array.isArray(target)) {
            for (let i = 0; i < base.length; i++) target[i] = base[i] | 0;
          }
          return array;
        },
        'setAddStatesFromChildren(Z)V': (self, [value]) => { self.addStatesFromChildren = !!value; },
        'addStatesFromChildren()Z': (self) => !!self?.addStatesFromChildren,
        'childDrawableStateChanged(Landroid/view/View;)V': () => undefined,
        'shouldDelayChildPressedState()Z': () => true,
        'dispatchCreateViewTranslationRequest(Ljava/util/Map;[ILandroid/view/translation/TranslationCapability;Ljava/util/List;)V': () => undefined,
      },
      staticMethods: {
        'getChildMeasureSpec(III)I': (_self, [spec, padding, childDimension]) => {
          return getChildMeasureSpec(toInt(spec), toInt(padding), toInt(childDimension));
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewPropertyAnimator;', {
      super: 'Ljava/lang/Object;',
      methods: viewPropertyAnimatorMethods(),
    })
  );

  defs.push(
    nativeDef('Landroid/view/MenuInflater;', {
      super: 'Ljava/lang/Object;',
      ctor: class MenuInflaterPeer {
        constructor(vm, context) {
          this.vm = vm;
          this.context = context ?? null;
        }
      },
      methods: {
        '<init>(Landroid/content/Context;)V': (self, [context]) => { self.context = context ?? null; },
        'inflate(ILandroid/view/Menu;)V': (self, [resId, menu]) => {
          if (!menu) return;
          const vm = self.vm;
          const resources = vm?.resources;
          const parsed = resources ? parseMenuResource(resources, resId >>> 0, vm) : null;
          if (!parsed || !parsed.length) return;
          const menuPeer = menu.$peer || menu;
          const call = (target, name, proto, args) => {
            if (!target) return null;
            try {
              return vm?.invokeByName?.(name, proto, target, args) ?? null;
            } catch {
              return null;
            }
          };
          for (const item of parsed) {
            let added = null;
            if (typeof menuPeer.add === 'function') {
              added = menuPeer.add(item.groupId | 0, item.itemId | 0, item.order | 0, item.title);
            } else {
              added = call(menu, 'add', '(IIILjava/lang/CharSequence;)Landroid/view/MenuItem;', [item.groupId | 0, item.itemId | 0, item.order | 0, item.title]);
            }
            if (!added) continue;
            if (item.visible === false) call(added, 'setVisible', '(Z)Landroid/view/MenuItem;', [false]);
            if (item.enabled === false) call(added, 'setEnabled', '(Z)Landroid/view/MenuItem;', [false]);
            if (item.checkable) {
              call(added, 'setCheckable', '(Z)Landroid/view/MenuItem;', [true]);
              if (item.checked) call(added, 'setChecked', '(Z)Landroid/view/MenuItem;', [true]);
            }
            if (item.showAsAction) call(added, 'setShowAsAction', '(I)V', [item.showAsAction | 0]);
            if (item.icon) call(added, 'setIcon', '(I)Landroid/view/MenuItem;', [item.icon >>> 0]);
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/LayoutInflater;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'inflate(ILandroid/view/ViewGroup;)Landroid/view/View;': (self, [resId, root]) => {
          const inflater = new LayoutInflater(self.vm.contextObject);
          inflater.vm = self.vm;
          return viewObject(self.vm, inflater.inflate(resId, unwrapView(root) || null, !!unwrapView(root)));
        },
        'inflate(ILandroid/view/ViewGroup;Z)Landroid/view/View;': (self, [resId, root, attach]) => {
          const inflater = new LayoutInflater(self.vm.contextObject);
          inflater.vm = self.vm;
          const result = inflater.inflate(resId, unwrapView(root) || null, !!attach);
          return viewObject(self.vm, result);
        },
        'setFactory(Landroid/view/LayoutInflater$Factory;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'setFactory2(Landroid/view/LayoutInflater$Factory2;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'getFactory()Landroid/view/LayoutInflater$Factory;': (self) => self.factory ?? null,
        'getFactory2()Landroid/view/LayoutInflater$Factory2;': (self) => self.factory ?? null,
        'setPrivateFactory(Landroid/view/LayoutInflater$Factory2;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'cloneInContext(Landroid/content/Context;)Landroid/view/LayoutInflater;': (self, [context], vm) => {
          const peer = { vm, constructor: { $descriptor: 'Landroid/view/LayoutInflater;' } };
          const object = vm.allocateRawObject('Landroid/view/LayoutInflater;');
          object.$peer = peer;
          return object;
        },
      },
      staticMethods: {
      'generateViewId()I': () => ++VIEW_ID_COUNTER,
        'from(Landroid/content/Context;)Landroid/view/LayoutInflater;': (_self, [context], vm) => {
          const peer = { vm, constructor: { $descriptor: 'Landroid/view/LayoutInflater;' } };
          const object = vm.allocateRawObject('Landroid/view/LayoutInflater;');
          object.$peer = peer;
          return object;
        },
      },
    })
  );

  defs.push(nativeDef('Landroid/view/Window;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getCallback()Landroid/view/Window$Callback;': (self, _args, vm) =>
        vm?.windowCallback ?? self.callback ?? self.window?.callback ?? null,
      'setCallback(Landroid/view/Window$Callback;)V': (self, [callback], vm) => {
        self.callback = callback ?? null;
        if (vm) vm.windowCallback = callback ?? null;
        if (self.window) self.window.callback = callback ?? null;
      },
      'getDecorView()Landroid/view/View;': (self, _args, vm) => {
        if (self.dialog) { const view = unwrapView(self.dialog.contentView); return view ? viewObject(vm, view) : null; }
        return self.window?.decorView ? viewObject(self.vm, self.window.decorView) : null;
      },
      'getAttributes()Landroid/view/WindowManager$LayoutParams;': (self, _args, vm) => {
        if (self.attributes) return self.attributes;
        const definition = vm.registry.resolve('Landroid/view/WindowManager$LayoutParams;');
        const object = vm.allocateObject(definition);
        object.$peer = {
          width: -1,
          height: -1,
          x: 0,
          y: 0,
          gravity: 0,
          flags: 0,
          format: -1,
          type: 1,
          softInputMode: 0,
          layoutInDisplayCutoutMode: 0,
          horizontalMargin: 0,
          verticalMargin: 0,
          windowAnimations: 0,
          alpha: 1,
          screenBrightness: -1,
          buttonBrightness: -1,
        };
        self.attributes = object;
        return object;
      },
      'getCurrentFocus()Landroid/view/View;': () => null,
      'findViewById(I)Landroid/view/View;': (self, [id], vm) => {
        if (self.dialog) { const view = unwrapView(self.dialog.contentView); return view ? (viewObject(vm, view.findViewById(id)) || null) : null; }
        const view = self.window?.decorView?.findViewById(id >>> 0);
        return view ? viewObject(self.vm, view) : null;
      },
      'requestFeature(I)Z': () => true,
      'addFlags(I)V': () => {},
      'clearFlags(I)V': () => {},
      'setFlags(II)V': () => {},
      'setStatusBarColor(I)V': (self, [color]) => {
        if (self.window) self.window.statusBarColor = color >>> 0;
      },
      'setNavigationBarColor(I)V': (self, [color]) => {
        if (self.window) self.window.navigationBarColor = color >>> 0;
      },
      'setSoftInputMode(I)V': () => {},
      'setDecorFitsSystemWindows(Z)V': () => {},
      'peekDecorView()Landroid/view/View;': (self, _args, vm) => {
        if (!self.window) return null;
        return self.window.decorView ? viewObject(self.vm, self.window.decorView) : null;
      },
      'setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)V': () => {},
      'setBackgroundDrawableResource(I)V': () => {},
      'setLayout(II)V': (self, [width, height]) => { if (self.dialog) { self.dialog.panelWidth = width | 0; self.dialog.panelHeight = height | 0; } },
      'isFloating()Z': () => false,
      'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
        if (self.window) self.window.title = jsString(title);
      },
      'setContentView(Landroid/view/View;)V': (self, [view], vm) => {
        if (self.dialog) { self.dialog.contentView = view ?? null; return; }
        const target = unwrapView(view);
        if (!target || !self.window) return;
        self.window.setContentView?.(target);
        self.window.contentView = target;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      'setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params], vm) => {
        const target = unwrapView(view);
        if (!target || !self.window) return;
        if (params) target.layoutParams = params;
        self.window.setContentView?.(target);
        self.window.contentView = target;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      'setContentView(I)V': (self, [layoutId], vm) => {
        if (self.dialog) {
          const inflater = new LayoutInflater(vm.contextObject);
          inflater.vm = vm;
          self.dialog.contentView = inflater.inflate(layoutId >>> 0);
          return;
        }
        if (!self.window || !vm?.resources) return;
        const view = vm.resources.getLayout?.(layoutId >>> 0, vm.contextObject);
        if (!view) return;
        self.window.setContentView?.(view);
        self.window.contentView = view;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      '<init>(Landroid/content/Context;)V': (self, [context]) => {
        self.context = context ?? null;
      },
      'getContext()Landroid/content/Context;': (self, _args, vm) => self.context ?? vm?.contextObject ?? null,
      'getWindowStyle()Landroid/content/res/TypedArray;': (self, _args, vm) => createTypedArray(vm, []),
      'setContainer(Landroid/view/Window;)V': (self, [container]) => { self.container = container ?? null; },
      'getContainer()Landroid/view/Window;': (self) => self?.container ?? null,
      'hasChildren()Z': (self) => !!self?.container,
      'setWindowManager(Landroid/view/WindowManager;Landroid/os/IBinder;Ljava/lang/String;)V': (self, [manager]) => {
        self.windowManager = manager ?? null;
      },
      'setWindowManager(Landroid/view/WindowManager;Landroid/os/IBinder;Ljava/lang/String;Z)V': (self, [manager]) => {
        self.windowManager = manager ?? null;
      },
      'getWindowManager()Landroid/view/WindowManager;': (self) =>
        self?.windowManager ?? { $descriptor: 'Landroid/view/WindowManager;' },
      'addOnFrameMetricsAvailableListener(Landroid/view/Window$OnFrameMetricsAvailableListener;Landroid/os/Handler;)V': () => undefined,
      'removeOnFrameMetricsAvailableListener(Landroid/view/Window$OnFrameMetricsAvailableListener;)V': () => undefined,
      'setRestrictedCaptionAreaListener(Landroid/view/Window$OnRestrictedCaptionAreaChangedListener;)V': () => undefined,
      'setHideOverlayWindows(Z)V': () => undefined,
      'takeSurface(Landroid/view/SurfaceHolder$Callback2;)V': () => undefined,
      'takeInputQueue(Landroid/view/InputQueue$Callback;)V': () => undefined,
      'setGravity(I)V': (self, [gravity]) => {
        self.gravity = gravity | 0;
        if (self.attributes?.$peer) self.attributes.$peer.gravity = gravity | 0;
      },
      'setType(I)V': (self, [type]) => {
        self.type = type | 0;
        if (self.attributes?.$peer) self.attributes.$peer.type = type | 0;
      },
      'setFormat(I)V': (self, [format]) => {
        self.format = format | 0;
        if (self.attributes?.$peer) self.attributes.$peer.format = format | 0;
      },
      'setWindowAnimations(I)V': (self, [resId]) => {
        self.windowAnimations = resId | 0;
        if (self.attributes?.$peer) self.attributes.$peer.windowAnimations = resId | 0;
      },
      'setColorMode(I)V': (self, [mode]) => { self.colorMode = mode | 0; },
      'getColorMode()I': (self) => self?.colorMode | 0,
      'isWideColorGamut()Z': () => false,
      'setPreferMinimalPostProcessing(Z)V': () => undefined,
      'setDimAmount(F)V': (self, [amount]) => {
        self.dimAmount = Number(amount);
        if (self.attributes?.$peer) self.attributes.$peer.dimAmount = Number(amount);
      },
      'setAttributes(Landroid/view/WindowManager$LayoutParams;)V': (self, [params]) => {
        self.attributes = params ?? null;
      },
      'getForcedWindowFlags()I': () => 0,
      'hasSoftInputMode()Z': (self) => self?.softInputMode !== undefined,
      'setSustainedPerformanceMode(Z)V': () => undefined,
      'makeActive()V': (self) => { self.active = true; },
      'isActive()Z': (self) => !!self?.active,
      'requireViewById(I)Landroid/view/View;': (self, [id], vm) => {
        if (self.dialog) {
          const view = unwrapView(self.dialog.contentView);
          return view ? viewObject(vm, view.findViewById(id >>> 0)) || null : null;
        }
        const view = self.window?.decorView?.findViewById(id >>> 0);
        return view ? viewObject(self.vm, view) : null;
      },
      'addContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params], vm) => {
        const target = unwrapView(view);
        const parent = self.window?.contentView;
        if (!target || !parent || typeof parent.addView !== 'function') return;
        target.layoutParams = params ?? target.layoutParams ?? null;
        parent.addView(target);
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      'getLayoutInflater()Landroid/view/LayoutInflater;': (self, _args, vm) => layoutInflaterObject(vm),
      'setTitleColor(I)V': () => undefined,
      'openPanel(ILandroid/view/KeyEvent;)V': () => undefined,
      'closePanel(I)V': () => undefined,
      'togglePanel(ILandroid/view/KeyEvent;)V': () => undefined,
      'invalidatePanelMenu(I)V': () => undefined,
      'performPanelShortcut(IILandroid/view/KeyEvent;I)Z': () => false,
      'performPanelIdentifierAction(III)Z': () => false,
      'closeAllPanels()V': () => undefined,
      'performContextMenuIdentifierAction(II)Z': () => false,
      'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
      'setElevation(F)V': (self, [elevation]) => {
        self.elevation = Number(elevation);
        if (self.window?.decorView) self.window.decorView.elevation = Number(elevation);
      },
      'setClipToOutline(Z)V': () => undefined,
      'setBackgroundBlurRadius(I)V': () => undefined,
      'setFeatureDrawableResource(II)V': () => undefined,
      'setFeatureDrawableUri(ILandroid/net/Uri;)V': () => undefined,
      'setFeatureDrawable(ILandroid/graphics/drawable/Drawable;)V': () => undefined,
      'setFeatureDrawableAlpha(II)V': () => undefined,
      'setFeatureInt(II)V': () => undefined,
      'takeKeyEvents(Z)V': () => undefined,
      'superDispatchKeyEvent(Landroid/view/KeyEvent;)Z': () => false,
      'superDispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': () => false,
      'superDispatchTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
      'superDispatchTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
      'superDispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
      'saveHierarchyState()Landroid/os/Bundle;': (_self, _args, vm) => vm.allocateRawObject('Landroid/os/Bundle;'),
      'restoreHierarchyState(Landroid/os/Bundle;)V': () => undefined,
      'onActive()V': () => undefined,
      'getFeatures()I': (self) => self?.features | 0,
      'hasFeature(I)Z': (self, [feature]) => ((self?.features | 0) & (feature | 0)) !== 0,
      'getLocalFeatures()I': (self) => self?.localFeatures | 0,
      'setDefaultWindowFormat(I)V': (self, [format]) => { self.defaultWindowFormat = format | 0; },
      'setChildDrawable(ILandroid/graphics/drawable/Drawable;)V': () => undefined,
      'setChildInt(II)V': () => undefined,
      'isShortcutKey(ILandroid/view/KeyEvent;)Z': () => false,
      'setVolumeControlStream(I)V': (self, [stream]) => { self.volumeControlStream = stream | 0; },
      'getVolumeControlStream()I': (self) => self?.volumeControlStream | 0,
      'setMediaController(Landroid/media/session/MediaController;)V': (self, [controller]) => { self.mediaController = controller ?? null; },
      'getMediaController()Landroid/media/session/MediaController;': (self) => self?.mediaController ?? null,
      'setUiOptions(I)V': (self, [options]) => { self.uiOptions = options | 0; },
      'setUiOptions(II)V': (self, [options, mask]) => {
        self.uiOptions = ((self.uiOptions | 0) & ~(mask | 0)) | ((options | 0) & (mask | 0));
      },
      'setIcon(I)V': (self, [resId]) => { self.icon = resId | 0; },
      'setLogo(I)V': (self, [resId]) => { self.logo = resId | 0; },
      'setLocalFocus(ZZ)V': () => undefined,
      'injectInputEvent(Landroid/view/InputEvent;)V': () => undefined,
      'getTransitionManager()Landroid/transition/TransitionManager;': (self) => self?.transitionManager ?? null,
      'setTransitionManager(Landroid/transition/TransitionManager;)V': (self, [manager]) => { self.transitionManager = manager ?? null; },
      'getContentScene()Landroid/transition/Scene;': (self) => self?.contentScene ?? null,
      'setEnterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.enterTransition = value ?? null; },
      'setReturnTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.returnTransition = value ?? null; },
      'setExitTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.exitTransition = value ?? null; },
      'setReenterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.reenterTransition = value ?? null; },
      'getEnterTransition()Landroid/transition/Transition;': (self) => self?.enterTransition ?? null,
      'getReturnTransition()Landroid/transition/Transition;': (self) => self?.returnTransition ?? null,
      'getExitTransition()Landroid/transition/Transition;': (self) => self?.exitTransition ?? null,
      'getReenterTransition()Landroid/transition/Transition;': (self) => self?.reenterTransition ?? null,
      'setSharedElementEnterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.sharedEnterTransition = value ?? null; },
      'setSharedElementReturnTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.sharedReturnTransition = value ?? null; },
      'setSharedElementExitTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.sharedExitTransition = value ?? null; },
      'setSharedElementReenterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.sharedReenterTransition = value ?? null; },
      'getSharedElementEnterTransition()Landroid/transition/Transition;': (self) => self?.sharedEnterTransition ?? null,
      'getSharedElementReturnTransition()Landroid/transition/Transition;': (self) => self?.sharedReturnTransition ?? null,
      'getSharedElementExitTransition()Landroid/transition/Transition;': (self) => self?.sharedExitTransition ?? null,
      'getSharedElementReenterTransition()Landroid/transition/Transition;': (self) => self?.sharedReenterTransition ?? null,
      'setAllowEnterTransitionOverlap(Z)V': (self, [value]) => { self.allowEnterOverlap = !!value; },
      'getAllowEnterTransitionOverlap()Z': (self) => self?.allowEnterOverlap !== false,
      'setAllowReturnTransitionOverlap(Z)V': (self, [value]) => { self.allowReturnOverlap = !!value; },
      'getAllowReturnTransitionOverlap()Z': (self) => self?.allowReturnOverlap !== false,
      'getTransitionBackgroundFadeDuration()J': (self) => self?.backgroundFadeDuration ?? 0,
      'setTransitionBackgroundFadeDuration(J)V': (self, [duration]) => { self.backgroundFadeDuration = Number(duration) || 0; },
      'getSharedElementsUseOverlay()Z': (self) => self?.sharedElementsUseOverlay !== false,
      'setSharedElementsUseOverlay(Z)V': (self, [value]) => { self.sharedElementsUseOverlay = !!value; },
      'getStatusBarColor()I': (self) => self?.window?.statusBarColor ?? 0xfff8f9fa,
      'getNavigationBarColor()I': (self) => self?.window?.navigationBarColor ?? 0xffffffff,
      'setNavigationBarDividerColor(I)V': (self, [color]) => { self.navigationBarDividerColor = color >>> 0; },
      'getNavigationBarDividerColor()I': (self) => self?.navigationBarDividerColor ?? 0,
      'setStatusBarContrastEnforced(Z)V': (self, [value]) => { self.statusBarContrastEnforced = !!value; },
      'isStatusBarContrastEnforced()Z': (self) => self?.statusBarContrastEnforced !== false,
      'setNavigationBarContrastEnforced(Z)V': (self, [value]) => { self.navigationBarContrastEnforced = !!value; },
      'isNavigationBarContrastEnforced()Z': (self) => self?.navigationBarContrastEnforced !== false,
      'setSystemGestureExclusionRects(Ljava/util/List;)V': (self, [rects]) => { self.gestureExclusionRects = rects ?? null; },
      'getSystemGestureExclusionRects()Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
      'registerScrollCaptureCallback(Landroid/view/ScrollCaptureCallback;)V': () => undefined,
      'unregisterScrollCaptureCallback(Landroid/view/ScrollCaptureCallback;)V': () => undefined,
      'setDecorCaptionShade(I)V': (self, [shade]) => { self.decorCaptionShade = shade | 0; },
      'setResizingCaptionDrawable(Landroid/graphics/drawable/Drawable;)V': () => undefined,
      'getInsetsController()Landroid/view/WindowInsetsController;': () => null,
      'getRootSurfaceControl()Landroid/view/AttachedSurfaceControl;': () => null,
    },
    staticMethods: {
      'getDefaultFeatures(Landroid/content/Context;)I': () => 0x41,
    },
  }));
  defs.push(nativeDef('Landroid/view/WindowManager;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getDefaultDisplay()Landroid/view/Display;': (_self, _args, vm) => vm.displayObject(),
    },
  }));
  defs.push(nativeDef('Landroid/view/Display$Mode;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getPhysicalWidth()I': (_self, _args, vm) => vm.screen?.width || 360,
      'getPhysicalHeight()I': (_self, _args, vm) => vm.screen?.height || 720,
      'getRefreshRate()F': () => 60.0,
      'getModeId()I': () => 1,
    },
  }));
  defs.push(nativeDef('Landroid/view/Display;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getRefreshRate()F': () => 60.0,
      'getSupportedModes()[Landroid/view/Display$Mode;': (_self, _args, vm) => {
        const mode = vm.wrapPeer({ constructor: { $descriptor: 'Landroid/view/Display$Mode;' } });
        return vm.newArray('Landroid/view/Display$Mode;', 1, mode);
      },
      'getSupportedRefreshRates()[F': () => [60.0],
      'getRotation()I': () => 0,
      'getRealSize(Landroid/graphics/Point;)V': (_self, [point], vm) => {
        if (!point) return;
        const w = vm.screen?.width || vm.resources?.width || 360;
        const h = vm.screen?.height || vm.resources?.height || 720;
        point.$fields?.set('Landroid/graphics/Point;->x:I', w);
        point.$fields?.set('Landroid/graphics/Point;->y:I', h);
      },
      'getSize(Landroid/graphics/Point;)V': (_self, [point], vm) => {
        if (!point) return;
        const w = vm.screen?.width || vm.resources?.width || 360;
        const h = vm.screen?.height || vm.resources?.height || 720;
        point.$fields?.set('Landroid/graphics/Point;->x:I', w);
        point.$fields?.set('Landroid/graphics/Point;->y:I', h);
      },
      'getMetrics(Landroid/util/DisplayMetrics;)V': (_self, [metrics], vm) => {
        const src = vm.resources.getDisplayMetrics();
        if (!metrics) return;
        for (const [k, v] of Object.entries(src.$fields ? Object.fromEntries(src.$fields) : src)) {
          if (typeof v === 'number') metrics.$fields?.set('Landroid/util/DisplayMetrics;->' + k + ':' + (Number.isInteger(v) ? 'I' : 'F'), v);
        }
      },
      'getName()Ljava/lang/String;': () => 'Built-in Screen',
      'getState()I': () => 2,
      'isValid()Z': () => true,
    },
  }));
  defs.push(nativeDef('Landroid/view/Window$Callback;', { super: null }));
  defs.push(nativeDef('Landroid/view/LayoutInflater$Factory;', { super: null }));
  defs.push(nativeDef('Landroid/view/LayoutInflater$Factory2;', { super: 'Landroid/view/LayoutInflater$Factory;' }));
  defs.push(nativeDef('Landroid/view/Menu;', { super: 'Ljava/lang/Object;' }));
  defs.push(
    nativeDef('Landroid/view/MenuItem;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'setChecked(Z)Landroid/view/MenuItem;': (self) => self ?? null,
        'setVisible(Z)Landroid/view/MenuItem;': (self) => self ?? null,
        'setEnabled(Z)Landroid/view/MenuItem;': (self) => self ?? null,
        'setCheckable(Z)Landroid/view/MenuItem;': (self) => self ?? null,
        'setTitle(Ljava/lang/CharSequence;)Landroid/view/MenuItem;': (self) => self ?? null,
        'setTitleCondensed(Ljava/lang/CharSequence;)Landroid/view/MenuItem;': (self) => self ?? null,
        'setIcon(I)Landroid/view/MenuItem;': (self) => self ?? null,
        'setShowAsAction(I)V': () => undefined,
        'setOnMenuItemClickListener(Landroid/view/MenuItem$OnMenuItemClickListener;)Landroid/view/MenuItem;': (self) => self ?? null,
      },
    })
  );

  defs.push(nativeDef('Landroid/app/FragmentManager;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'findFragmentByTag(Ljava/lang/String;)Landroid/app/Fragment;': (self, [tag]) => self.findFragmentByTag?.(tag) ?? null,
      'findFragmentById(I)Landroid/app/Fragment;': (self, [id]) => self.findFragmentById?.(id) ?? null,
      'beginTransaction()Landroid/app/FragmentTransaction;': (self) => self.beginTransaction?.() ?? null,
      'executePendingTransactions()Z': (self) => self.executePendingTransactions?.() ?? true,
      'isDestroyed()Z': () => false,
      'getFragments()Ljava/util/List;': (self, _args, vm) => {
        const items = self.getFragments?.() ?? [];
        const list = emptyJavaList(vm);
        list.$peer = { items: [...items] };
        return list;
      },
    },
  }));
  defs.push(nativeDef('Landroid/app/FragmentTransaction;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'add(Landroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [fragment, tag]) => self.add?.(0, fragment, tag) ?? null,
      'add(ILandroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [id, fragment, tag]) => self.add?.(id, fragment, tag) ?? null,
      'replace(ILandroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [id, fragment, tag]) => self.replace?.(id, fragment, tag) ?? null,
      'remove(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self, [fragment]) => self.remove?.(fragment) ?? null,
      'hide(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self) => self,
      'show(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self) => self,
      'addToBackStack(Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self) => self,
      'setTransition(I)Landroid/app/FragmentTransaction;': (self) => self,
      'setReorderingAllowed(Z)Landroid/app/FragmentTransaction;': (self) => self,
      'commit()I': (self) => self.commit?.() ?? 0,
      'commitAllowingStateLoss()I': (self) => self.commitAllowingStateLoss?.() ?? 0,
      'commitNow()V': (self) => self.commitNow?.(),
      'isEmpty()Z': (self) => self.isEmpty?.() ?? true,
    },
  }));
  defs.push(nativeDef('Landroid/app/Fragment;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'equals(Ljava/lang/Object;)Z': (self, [other]) => other === self,
      'hashCode()I': (self, _args, vm) => vm.identityHash(self),
      'toString()Ljava/lang/String;': (self) => `Fragment{${self?.$tag || ''}}`,
      'getId()I': (self) => self?.$id | 0,
      'getTag()Ljava/lang/String;': (self) => self?.$tag ?? null,
      'setArguments(Landroid/os/Bundle;)V': (self, [args]) => { self.$arguments = args ?? null; },
      'getArguments()Landroid/os/Bundle;': (self) => self?.$arguments ?? null,
      'isStateSaved()Z': () => false,
      'setInitialSavedState(Landroid/app/Fragment$SavedState;)V': (self, [state]) => { self.$initialSavedState = state ?? null; },
      'setTargetFragment(Landroid/app/Fragment;I)V': (self, [fragment, code]) => {
        self.$target = fragment ?? null;
        self.$targetRequestCode = code | 0;
      },
      'getTargetFragment()Landroid/app/Fragment;': (self) => self?.$target ?? null,
      'getTargetRequestCode()I': (self) => self?.$targetRequestCode | 0,
      'getContext()Landroid/content/Context;': (self, _args, vm) => self?.$context ?? vm?.contextObject ?? null,
      'getActivity()Landroid/app/Activity;': (self, _args, vm) => self?.$activity ?? vm?.activity ?? null,
      'getHost()Ljava/lang/Object;': (self, _args, vm) => self?.$activity ?? vm?.activity ?? null,
      'getResources()Landroid/content/res/Resources;': (self, _args, vm) => vm?.resources ?? null,
      'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
      'getString(I)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
      'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args], vm) => {
        const values = Array.isArray(args?.$data) ? args.$data : Array.isArray(args) ? args : [];
        return vm.resources.getString(resId >>> 0, ...values);
      },
      'getFragmentManager()Landroid/app/FragmentManager;': (self, _args, vm) => self?.$fragmentManager ?? getFragmentManagerObject(vm),
      'getChildFragmentManager()Landroid/app/FragmentManager;': (self, _args, vm) => getFragmentManagerObject(vm),
      'getParentFragment()Landroid/app/Fragment;': (self) => self?.$parentFragment ?? null,
      'isAdded()Z': (self) => !!self?.$added,
      'isDetached()Z': (self) => !!self?.$detached,
      'isRemoving()Z': (self) => !!self?.$removing,
      'isInLayout()Z': () => false,
      'isResumed()Z': (self) => !!self?.$resumed,
      'isVisible()Z': (self) => !!self?.$added && !self?.$hidden && !!self?.$view,
      'isHidden()Z': (self) => !!self?.$hidden,
      'onHiddenChanged(Z)V': () => undefined,
      'setRetainInstance(Z)V': (self, [retain]) => { self.$retainInstance = !!retain; },
      'getRetainInstance()Z': (self) => !!self?.$retainInstance,
      'setHasOptionsMenu(Z)V': (self, [value]) => { self.$hasOptionsMenu = !!value; },
      'setMenuVisibility(Z)V': (self, [value]) => { self.$menuVisible = !!value; },
      'setUserVisibleHint(Z)V': (self, [value]) => { self.$userVisibleHint = !!value; },
      'getUserVisibleHint()Z': (self) => self?.$userVisibleHint !== false,
      'getLoaderManager()Landroid/app/LoaderManager;': () => null,
      'startActivity(Landroid/content/Intent;)V': (self, [intent], vm) => { vm.startActivity(intent, null); },
      'startActivity(Landroid/content/Intent;Landroid/os/Bundle;)V': (self, [intent], vm) => { vm.startActivity(intent, null); },
      'startActivityForResult(Landroid/content/Intent;I)V': (self, [intent], vm) => { vm.startActivity(intent, null); },
      'startActivityForResult(Landroid/content/Intent;ILandroid/os/Bundle;)V': (self, [intent], vm) => { vm.startActivity(intent, null); },
      'startIntentSenderForResult(Landroid/content/IntentSender;ILandroid/content/Intent;IIILandroid/os/Bundle;)V': () => undefined,
      'onActivityResult(IILandroid/content/Intent;)V': () => undefined,
      'requestPermissions([Ljava/lang/String;I)V': () => undefined,
      'onRequestPermissionsResult(I[Ljava/lang/String;[I)V': () => undefined,
      'shouldShowRequestPermissionRationale(Ljava/lang/String;)Z': () => false,
      'onGetLayoutInflater(Landroid/os/Bundle;)Landroid/view/LayoutInflater;': (self, _args, vm) => layoutInflaterObject(vm),
      'getLayoutInflater()Landroid/view/LayoutInflater;': (self, _args, vm) => layoutInflaterObject(vm),
      'onInflate(Landroid/util/AttributeSet;Landroid/os/Bundle;)V': () => undefined,
      'onInflate(Landroid/content/Context;Landroid/util/AttributeSet;Landroid/os/Bundle;)V': () => undefined,
      'onInflate(Landroid/app/Activity;Landroid/util/AttributeSet;Landroid/os/Bundle;)V': () => undefined,
      'onAttachFragment(Landroid/app/Fragment;)V': () => undefined,
      'onAttach(Landroid/content/Context;)V': (self, [context]) => { self.$context = context ?? null; },
      'onAttach(Landroid/app/Activity;)V': (self, [activity]) => {
        self.$activity = activity ?? null;
        self.$context = self.$context ?? activity ?? null;
      },
      'onCreateAnimator(IZI)Landroid/animation/Animator;': () => null,
      'onCreate(Landroid/os/Bundle;)V': () => undefined,
      'onCreateView(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;': () => null,
      'onViewCreated(Landroid/view/View;Landroid/os/Bundle;)V': () => undefined,
      'getView()Landroid/view/View;': (self) => self?.$view ?? null,
      'onActivityCreated(Landroid/os/Bundle;)V': () => undefined,
      'onViewStateRestored(Landroid/os/Bundle;)V': () => undefined,
      'onStart()V': () => undefined,
      'onResume()V': (self) => { self.$resumed = true; },
      'onSaveInstanceState(Landroid/os/Bundle;)V': () => undefined,
      'onMultiWindowModeChanged(ZLandroid/content/res/Configuration;)V': () => undefined,
      'onMultiWindowModeChanged(Z)V': () => undefined,
      'onPictureInPictureModeChanged(ZLandroid/content/res/Configuration;)V': () => undefined,
      'onPictureInPictureModeChanged(Z)V': () => undefined,
      'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
      'onPause()V': (self) => { self.$resumed = false; },
      'onStop()V': () => undefined,
      'onLowMemory()V': () => undefined,
      'onTrimMemory(I)V': () => undefined,
      'onDestroyView()V': (self) => { self.$view = null; },
      'onDestroy()V': () => undefined,
      'onDetach()V': (self) => { self.$context = null; self.$activity = null; },
      'onCreateOptionsMenu(Landroid/view/Menu;Landroid/view/MenuInflater;)V': () => undefined,
      'onPrepareOptionsMenu(Landroid/view/Menu;)V': () => undefined,
      'onDestroyOptionsMenu()V': () => undefined,
      'onOptionsItemSelected(Landroid/view/MenuItem;)Z': () => false,
      'onOptionsMenuClosed(Landroid/view/Menu;)V': () => undefined,
      'onCreateContextMenu(Landroid/view/ContextMenu;Landroid/view/View;Landroid/view/ContextMenu$ContextMenuInfo;)V': () => undefined,
      'registerForContextMenu(Landroid/view/View;)V': () => undefined,
      'unregisterForContextMenu(Landroid/view/View;)V': () => undefined,
      'onContextItemSelected(Landroid/view/MenuItem;)Z': () => false,
      'setEnterSharedElementCallback(Landroid/app/SharedElementCallback;)V': () => undefined,
      'setExitSharedElementCallback(Landroid/app/SharedElementCallback;)V': () => undefined,
      'setEnterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$enterTransition = value ?? null; },
      'getEnterTransition()Landroid/transition/Transition;': (self) => self?.$enterTransition ?? null,
      'setReturnTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$returnTransition = value ?? null; },
      'getReturnTransition()Landroid/transition/Transition;': (self) => self?.$returnTransition ?? null,
      'setExitTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$exitTransition = value ?? null; },
      'getExitTransition()Landroid/transition/Transition;': (self) => self?.$exitTransition ?? null,
      'setReenterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$reenterTransition = value ?? null; },
      'getReenterTransition()Landroid/transition/Transition;': (self) => self?.$reenterTransition ?? null,
      'setSharedElementEnterTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$sharedEnterTransition = value ?? null; },
      'getSharedElementEnterTransition()Landroid/transition/Transition;': (self) => self?.$sharedEnterTransition ?? null,
      'setSharedElementReturnTransition(Landroid/transition/Transition;)V': (self, [value]) => { self.$sharedReturnTransition = value ?? null; },
      'getSharedElementReturnTransition()Landroid/transition/Transition;': (self) => self?.$sharedReturnTransition ?? null,
      'setAllowEnterTransitionOverlap(Z)V': (self, [value]) => { self.$allowEnterOverlap = !!value; },
      'getAllowEnterTransitionOverlap()Z': (self) => self?.$allowEnterOverlap !== false,
      'setAllowReturnTransitionOverlap(Z)V': (self, [value]) => { self.$allowReturnOverlap = !!value; },
      'getAllowReturnTransitionOverlap()Z': (self) => self?.$allowReturnOverlap !== false,
      'postponeEnterTransition()V': () => undefined,
      'startPostponedEnterTransition()V': () => undefined,
      'dump(Ljava/lang/String;Ljava/io/FileDescriptor;Ljava/io/PrintWriter;[Ljava/lang/String;)V': () => undefined,
    },
    staticMethods: {
      'instantiate(Landroid/content/Context;Ljava/lang/String;)Landroid/app/Fragment;': (_self, [context, name], vm) =>
        instantiateFragment(vm, context, name, null),
      'instantiate(Landroid/content/Context;Ljava/lang/String;Landroid/os/Bundle;)Landroid/app/Fragment;': (_self, [context, name, args], vm) =>
        instantiateFragment(vm, context, name, args),
    },
  }));


  defs.push(nativeDef('Ljava/lang/reflect/Method;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': (self) => self.name ?? '',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getReturnType()Ljava/lang/Class;': (self, _args, vm) => {
        const type = self.proto?.returnType;
        return type && vm ? vm.getClassObject(type) : null;
      },
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = self.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'isVarArgs()Z': () => false,
      'getModifiers()I': (self) => self.$target?.accessFlags ?? 1,
      'isBridge()Z': () => false,
      'isSynthetic()Z': () => false,
      'equals(Ljava/lang/Object;)Z': (self, [other]) =>
        !!other && other.name === self.name && other.classDesc === self.classDesc
          && other.proto?.descriptor === self.proto?.descriptor,
      'hashCode()I': (self) => hashCode(`${self.classDesc}#${self.name}${self.proto?.descriptor || ''}`),
      'toString()Ljava/lang/String;': (self) =>
        `${self.classDesc || ''}.${self.name}${self.proto?.descriptor || ''}`,
      'invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;': (self, [target, args], vm) => {
        const targetMethod = self.$target;
        if (!targetMethod) {
          vm.throwException('Ljava/lang/NullPointerException;', `反射方法 ${self.name} 未绑定目标`);
        }
        const rawArgs = args?.$data || args || [];
        const argumentList = coerceReflectionArgs(vm, targetMethod.proto?.parameters || [], rawArgs);
        const isStatic = !!targetMethod.isStatic || (target === null && !targetMethod.isConstructor);
        const mode = isStatic ? 'static' : 'virtual';
        const receiver = mode === 'static' ? null : target;
        vm.ensureClassInitialized(vm.registry.resolve(targetMethod.classDesc));
        if (self.isNative) {
          return vm.invoke(
            { classDesc: targetMethod.classDesc, name: targetMethod.name, proto: targetMethod.proto },
            receiver,
            argumentList,
            mode === 'static' ? 'static' : 'virtual'
          );
        }
        if (mode === 'static') {
          return vm.executeMethod(targetMethod, null, argumentList);
        }
        return vm.invoke(
          { classDesc: targetMethod.classDesc, name: targetMethod.name, proto: targetMethod.proto },
          receiver,
          argumentList,
          'virtual'
        );
      },
    },
  }));
  defs.push(nativeDef('Ljava/lang/reflect/Field;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': (self) => self.name ?? '',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getType()Ljava/lang/Class;': (self, _args, vm) =>
        self.type && vm ? vm.getClassObject(self.type) : null,
      'getModifiers()I': () => 1,
      'isEnumConstant()Z': () => false,
      'isSynthetic()Z': () => false,
      'equals(Ljava/lang/Object;)Z': (self, [other]) =>
        !!other && other.name === self.name && other.classDesc === self.classDesc,
      'hashCode()I': (self) => hashCode(`${self.classDesc}#${self.name}`),
      'toString()Ljava/lang/String;': (self) => `${self.classDesc || ''}.${self.name}`,
      'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [target], vm) => {
        if (self.isStatic) {
          return vm.getStaticField({ classDesc: self.classDesc, name: self.name, type: self.type });
        }
        if (target === null || target === undefined) {
          vm.throwException('Ljava/lang/NullPointerException;', `读取字段 ${self.name} 时对象为空`);
        }
        return vm.getField(target, { name: self.name, type: self.type, classDesc: self.classDesc });
      },
      'getInt(Ljava/lang/Object;)I': (self, args, vm) => toIntValue(vm, self, args),
      'getLong(Ljava/lang/Object;)J': (self, args, vm) => toLong(toIntValue(vm, self, args)),
      'getBoolean(Ljava/lang/Object;)Z': (self, args, vm) => !!toIntValue(vm, self, args),
      'getFloat(Ljava/lang/Object;)F': (self, args, vm) => Number(toIntValue(vm, self, args)) || 0,
      'getDouble(Ljava/lang/Object;)D': (self, args, vm) => Number(toIntValue(vm, self, args)) || 0,
      'set(Ljava/lang/Object;Ljava/lang/Object;)V': (self, [target, value], vm) => {
        if (self.isStatic) {
          vm.setStaticField({ classDesc: self.classDesc, name: self.name, type: self.type }, value);
          return;
        }
        if (target === null || target === undefined) {
          vm.throwException('Ljava/lang/NullPointerException;', `写入字段 ${self.name} 时对象为空`);
        }
        vm.setField(target, { name: self.name, type: self.type, classDesc: self.classDesc }, value);
      },
      'setInt(Ljava/lang/Object;I)V': (self, [target, value], vm) => setFieldValue(vm, self, target, toInt(value)),
      'setLong(Ljava/lang/Object;J)V': (self, [target, value], vm) => setFieldValue(vm, self, target, toLong(value)),
      'setBoolean(Ljava/lang/Object;Z)V': (self, [target, value], vm) => setFieldValue(vm, self, target, value ? 1 : 0),
      'setFloat(Ljava/lang/Object;F)V': (self, [target, value], vm) => setFieldValue(vm, self, target, Number(value) || 0),
      'setDouble(Ljava/lang/Object;D)V': (self, [target, value], vm) => setFieldValue(vm, self, target, Number(value) || 0),
    },
  }));
  defs.push(nativeDef('Ljava/lang/reflect/Constructor;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': () => '<init>',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = self.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'getModifiers()I': (self) => self.$target?.accessFlags ?? 1,
      'isVarArgs()Z': () => false,
      'isSynthetic()Z': () => false,
      'newInstance([Ljava/lang/Object;)Ljava/lang/Object;': (self, [args], vm) => {
        const targetMethod = self.$target;
        if (!targetMethod) return null;
        const argumentList = args?.$data || args || [];
        const rc = vm.registry.resolve(self.classDesc);
        vm.ensureClassInitialized(rc);
        const object = vm.allocateObject(rc);
        vm.executeMethod(targetMethod, object, argumentList);
        return object;
      },
    },
  }));

  defs.push(
    nativeDef('Landroid/widget/TextView;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/TextView;'),
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => {
          // Android 里 setText(null) 等于清空文本；jsString(null) 会返回字面量
          // "null"，直接把控件文字变成 "null"，所以这里先挡掉空引用。
          self.view?.setText?.(text === null || text === undefined ? '' : jsString(text));
        },
        'setText(I)V': (self, [resId]) => self.view?.setText(self.vm.resources.getString(resId >>> 0)),
        'setTextAppearance(Landroid/content/Context;I)V': (self, _args, _vm, resId) => applyTextAppearance(self, _args[1]),
        'setTextAppearance(I)V': (self, [resId]) => applyTextAppearance(self, resId),
        'getText()Ljava/lang/CharSequence;': (self) => self.view?.getText() ?? '',
        'setTextSize(F)V': (self, [size]) => self.view?.setTextSize(Number(size)),
        'setTextSize(IF)V': (self, [unit, size]) => self.view?.setTextSize(convertDimension({ dimension: { value: Number(size), unit: unit === 2 ? 'sp' : 'dp' } }, self.vm.resources.density)),
        'setTextColor(I)V': (self, [color], vm) => {
          let value = color >>> 0;
          if (value >= 0x01010000 && value < 0x02000000) {
            const resolved = resolveStyleColor(vm, value);
            if (typeof resolved === 'number') value = resolved >>> 0;
          }
          self.view?.setTextColor(value);
        },
        'setGravity(I)V': (self, [gravity]) => self.view?.setGravity(gravity | 0),
        'getTransformationMethod()Landroid/text/method/TransformationMethod;': () => null,
        'getLineCount()I': (self) => self.view?.getLineCount?.() ?? 0,
        'getMaxLines()I': (self) => self.view?.maxLines ?? 0,
        'setEllipsize(Landroid/text/TextUtils$TruncateAt;)V': (self, [where]) => self.view?.setEllipsize?.(where ?? null),
        'getEllipsize()Landroid/text/TextUtils$TruncateAt;': (self) => self.view?.getEllipsize?.() ?? null,
        'setIncludeFontPadding(Z)V': (self, [include]) => self.view?.setIncludeFontPadding?.(!!include),
        'getIncludeFontPadding()Z': (self) => self.view?.includeFontPadding ?? true,
        'setLineSpacing(FF)V': (self, [extra, multiplier]) => self.view?.setLineSpacing?.(Number(extra), Number(multiplier)),
        'setCompoundDrawables(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': (self, [l, t, r, b]) => self.view?.setCompoundDrawables?.(l, t, r, b),
        'setCompoundDrawablesRelative(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': (self, [l, t, r, b]) => self.view?.setCompoundDrawables?.(l, t, r, b),
        'setCompoundDrawablesWithIntrinsicBounds(IIII)V': (self, [l, t, r, b], vm) => {
          const get = (id) => (id ? drawableObject(vm, vm.resources.getDrawable(id >>> 0)) : null);
          self.view?.setCompoundDrawables?.(get(l), get(t), get(r), get(b));
        },
        'setCompoundDrawablePadding(I)V': (self, [padding]) => { if (self.view) self.view.compoundDrawablePadding = padding | 0; },
        'getCompoundDrawablePadding()I': (self) => self.view?.compoundDrawablePadding ?? 0,
        'setMovementMethod(Landroid/text/method/MovementMethod;)V': (self, [method]) => {
          self.movementMethod = method ?? null;
        },
        'getMovementMethod()Landroid/text/method/MovementMethod;': (self) => self.movementMethod ?? null,
        'setTextColor(Landroid/content/res/ColorStateList;)V': (self, [csl]) => {
          if (!self.view) return;
          self.view.$textColorStateList = csl || null;
          const color = resolveStateListColor(csl, self.view.$textStateSet || []);
          if (typeof color === 'number') self.view.setTextColor?.(color >>> 0);
        },
        'setHintTextColor(Landroid/content/res/ColorStateList;)V': () => undefined,
        'setLinkTextColor(Landroid/content/res/ColorStateList;)V': () => undefined,
        'setTextLocales(Landroid/os/LocaleList;)V': () => undefined,
        'setFontVariationSettings(Ljava/lang/String;)Z': () => true,
        'setTypeface(Landroid/graphics/Typeface;)V': (self, [typeface]) => {
          if (!self.view) return;
          self.view.setTypeface?.(typeface?.family || null, Number(typeface?.style) || 0);
        },
        'setTypeface(Landroid/graphics/Typeface;I)V': (self, [typeface, style]) => {
          if (!self.view) return;
          self.view.setTypeface?.(typeface?.family || null, style | 0);
        },
        'setTypeface(Landroid/graphics/Typeface;)Landroid/widget/TextView;': (self, [typeface]) => {
          if (self.view) self.view.setTypeface?.(typeface?.family || null, Number(typeface?.style) || 0);
          return self.object;
        },
        'setTypeface(Landroid/graphics/Typeface;I)Landroid/widget/TextView;': (self, [typeface, style]) => {
          if (self.view) self.view.setTypeface?.(typeface?.family || null, style | 0);
          return self.object;
        },
        'append(Ljava/lang/CharSequence;)V': (self, [text]) => self.view?.append(jsString(text)),
        'setSingleLine()V': (self) => self.view?.setSingleLine?.(true),
        'setSingleLine(Z)V': (self, [value]) => self.view?.setSingleLine?.(!!value),
        'setMaxLines(I)V': (self, [lines]) => self.view?.setMaxLines?.(Number(lines)),
        'setAllCaps(Z)V': (self, [value]) => self.view?.setTextAllCaps(!!value),
        'getTextSize()F': (self) => self.view?.getTextSize() ?? 0,
        'getCurrentTextColor()I': (self) => self.view?.textColor ?? 0,
        'getTypeface()Landroid/graphics/Typeface;': (self) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: self.view?.typeface || null, style: self.view?.textStyle | 0 }),
        'getTextColors()Landroid/content/res/ColorStateList;': (self) => self.view?.$textColorStateList ?? null,
        'getPaint()Landroid/text/TextPaint;': (self, _args, vm) => {
          if (!self.textPaint) {
            self.textPaint = vm.allocateRawObject('Landroid/text/TextPaint;');
            const paint = new Paint();
            self.textPaint.$peer = { paint };
          }
          return self.textPaint;
        },
        'getPaint()Landroid/graphics/Paint;': (self, _args, vm) => {
          if (!self.textPaint) {
            self.textPaint = vm.allocateRawObject('Landroid/text/TextPaint;');
            self.textPaint.$peer = { paint: new Paint() };
          }
          return self.textPaint;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/webkit/WebView;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/webkit/WebView;'),
      methods: {
        'loadUrl(Ljava/lang/String;)V': (self, [url]) => self.view?.loadUrl?.(jsString(url)),
        'loadData(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V': (self, [data, mime, enc]) =>
          self.view?.loadData?.(jsString(data), jsString(mime), jsString(enc)),
        'loadDataWithBaseURL(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V':
          (self, [baseUrl, data, mime, enc]) => self.view?.loadDataWithBaseURL?.(jsString(baseUrl), jsString(data), jsString(mime), jsString(enc), null),
        'reload()V': (self) => self.view?.reload?.(),
        'getUrl()Ljava/lang/String;': (self) => self.view?.getUrl?.() ?? '',
        'getTitle()Ljava/lang/String;': (self) => self.view?.getTitle?.() ?? '',
        'getSettings()Landroid/webkit/WebSettings;': (self, _args, vm) => {
          if (!self.settingsObject) {
            self.settingsObject = vm.allocateRawObject('Landroid/webkit/WebSettings;');
            self.settingsObject.$peer = self.view?.settings || {};
          }
          return self.settingsObject;
        },
        'setWebViewClient(Landroid/webkit/WebViewClient;)V': (self, [client]) => {
          if (self.view) self.view.webViewClient = client?.$peer || null;
        },
        'setWebChromeClient(Landroid/webkit/WebChromeClient;)V': (self, [client]) => {
          if (self.view) self.view.webChromeClient = client?.$peer || null;
        },
        'setBackgroundColor(I)V': (self, [color]) => self.view?.setBackgroundColor?.(color >>> 0),
        'setLayerType(ILandroid/graphics/Paint;)V': () => undefined,
        'setInitialScale(I)V': () => undefined,
        'clearCache(Z)V': () => undefined,
        'clearHistory()V': () => undefined,
        'loadUrl(Ljava/lang/String;Ljava/util/Map;)V': (self, [url]) => self.view?.loadUrl?.(jsString(url)),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/webkit/WebViewClient;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z': () => false,
        'shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z': () => false,
        'onPageStarted(Landroid/webkit/WebView;Ljava/lang/String;Landroid/graphics/Bitmap;)V': () => undefined,
        'onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)V': () => undefined,
        'onReceivedError(Landroid/webkit/WebView;ILjava/lang/String;Ljava/lang/String;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/webkit/WebChromeClient;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'onProgressChanged(Landroid/webkit/WebView;I)V': () => undefined,
        'onReceivedTitle(Landroid/webkit/WebView;Ljava/lang/String;)V': () => undefined,
        'onJsAlert(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsResult;)Z': () => true,
        'onJsConfirm(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Landroid/webkit/JsResult;)Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/webkit/WebSettings;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'setJavaScriptEnabled(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.javaScriptEnabled = !!value;
        },
        'setDomStorageEnabled(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.domStorageEnabled = !!value;
        },
        'setDatabaseEnabled(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.databaseEnabled = !!value;
        },
        'setUseWideViewPort(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.useWideViewPort = !!value;
        },
        'setLoadWithOverviewMode(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.loadWithOverviewMode = !!value;
        },
        'setSupportZoom(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.supportZoom = !!value;
        },
        'setBuiltInZoomControls(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.builtInZoomControls = !!value;
        },
        'setDisplayZoomControls(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.displayZoomControls = !!value;
        },
        'setAllowFileAccessFromFileURLs(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.setAllowFileAccessFromFileURLs = !!value;
        },
        'setAllowUniversalAccessFromFileURLs(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.setAllowUniversalAccessFromFileURLs = !!value;
        },
        'setJavaScriptCanOpenWindowsAutomatically(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.javaScriptCanOpenWindowsAutomatically = !!value;
        },
        'setLoadsImagesAutomatically(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.loadsImagesAutomatically = !!value;
        },
        'setMediaPlaybackRequiresUserGesture(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.mediaPlaybackRequiresUserGesture = !!value;
        },
        'setMixedContentMode(I)V': (self, [value]) => {
          if (self.$peer) self.$peer.mixedContentMode = value | 0;
        },
        'setAppCacheEnabled(Z)V': (self, [value]) => {
          if (self.$peer) self.$peer.appCacheEnabled = !!value;
        },
        'setAppCachePath(Ljava/lang/String;)V': () => undefined,
        'setCacheMode(I)V': (self, [value]) => {
          if (self.$peer) self.$peer.cacheMode = value | 0;
        },
        'setTextZoom(I)V': (self, [value]) => {
          if (self.$peer) self.$peer.textZoom = value | 0;
        },
        'getUserAgentString()Ljava/lang/String;': (self) => self.$peer?.userAgentString ?? '',
        'setUserAgentString(Ljava/lang/String;)V': (self, [value]) => {
          if (self.$peer) self.$peer.userAgentString = jsString(value);
        },
        'setTextSize(I)V': () => undefined,
        'setDefaultFontSize(I)V': () => undefined,
        'setSavePassword(Z)V': () => undefined,
        'setSaveFormData(Z)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AdapterViewFlipper;', {
      super: 'Landroid/widget/ViewAnimator;',
      ctor: viewPeerConstructor('Landroid/widget/AdapterViewFlipper;', 'Landroid/widget/ViewAnimator;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setAdapter(Landroid/widget/Adapter;)V': (self, [adapter], vm) => {
          self.adapter = adapter ?? null;
          try { self.count = Number(vm.invokeByName('getCount', '()I', adapter, [])) || 0; } catch (_) { self.count = 0; }
        },
        'getAdapter()Landroid/widget/Adapter;': (self) => self.adapter ?? null,
        'getCount()I': (self) => self.count | 0,
        'setFlipInterval(I)V': (self, [value]) => { self.flipInterval = value | 0; },
        'getFlipInterval()I': (self) => self.flipInterval | 0,
        'startFlipping()V': (self) => { self.flipping = true; },
        'stopFlipping()V': (self) => { self.flipping = false; },
        'isFlipping()Z': (self) => (self.flipping ? 1 : 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ViewSwitcher;', {
      super: 'Landroid/widget/ViewAnimator;',
      ctor: viewPeerConstructor('Landroid/widget/ViewSwitcher;', 'Landroid/widget/ViewAnimator;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setFactory(Landroid/widget/ViewSwitcher$ViewFactory;)V': (self, [factory]) => { self.factory = factory; },
        'getNextView()Landroid/view/View;': (self, _args, vm) => {
          const view = self.view?.children?.[((self.displayedChild | 0) + 1) % Math.max(1, self.view.children.length)];
          return view ? viewObject(vm, view) : null;
        },
        'reset()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/TextSwitcher;', {
      super: 'Landroid/widget/ViewSwitcher;',
      ctor: viewPeerConstructor('Landroid/widget/TextSwitcher;', 'Landroid/widget/ViewSwitcher;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => { self.view?.children?.[self.displayedChild | 0]?.setText?.(jsString(text)); },
        'setCurrentText(Ljava/lang/CharSequence;)V': (self, [text]) => { self.view?.children?.[self.displayedChild | 0]?.setText?.(jsString(text)); },
        'getText()Ljava/lang/CharSequence;': (self) => self.view?.children?.[self.displayedChild | 0]?.getText?.() ?? '',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ImageSwitcher;', {
      super: 'Landroid/widget/ViewSwitcher;',
      ctor: viewPeerConstructor('Landroid/widget/ImageSwitcher;', 'Landroid/widget/ViewSwitcher;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setImageResource(I)V': (self, [resId]) => { self.view?.children?.[self.displayedChild | 0]?.setImageResource?.(resId >>> 0); },
        'setImageDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => { self.view?.children?.[self.displayedChild | 0]?.setImageDrawable?.(drawable); },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ViewAnimator;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/ViewAnimator;', 'Landroid/widget/FrameLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setDisplayedChild(I)V': (self, [index]) => {
          if (!self.view) return;
          self.displayedChild = index | 0;
          (self.view.children || []).forEach((child, i) => { child.visibility = i === (index | 0) ? 0 : 8; });
          self.view.invalidate?.();
        },
        'getDisplayedChild()I': (self) => self.displayedChild | 0,
        'showNext()V': (self) => {
          const count = self.view?.children?.length || 0;
          if (count) vmShowChild(self, ((self.displayedChild | 0) + 1) % count);
        },
        'showPrevious()V': (self) => {
          const count = self.view?.children?.length || 0;
          if (count) vmShowChild(self, ((self.displayedChild | 0) - 1 + count) % count);
        },
        'getCurrentView()Landroid/view/View;': (self, _args, vm) => {
          const child = self.view?.children?.[self.displayedChild | 0];
          return child ? viewObject(vm, child) : null;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ViewFlipper;', {
      super: 'Landroid/widget/ViewAnimator;',
      ctor: viewPeerConstructor('Landroid/widget/ViewFlipper;', 'Landroid/widget/ViewAnimator;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setFlipInterval(I)V': (self, [interval]) => { self.flipInterval = interval | 0; },
        'getFlipInterval()I': (self) => self.flipInterval | 0,
        'startFlipping()V': (self) => {
          self.flipping = true;
          const count = self.view?.children?.length || 0;
          if (count > 1) vmShowChild(self, ((self.displayedChild | 0) + 1) % count);
          const tick = () => {
            if (!self.flipping) return;
            const count = self.view?.children?.length || 0;
            if (count > 1) vmShowChild(self, ((self.displayedChild | 0) + 1) % count);
            self.flipTimer = setTimeout(tick, self.flipInterval || 3000);
            self.flipTimer?.unref?.();
          };
          tick();
        },
        'stopFlipping()V': (self) => { self.flipping = false; if (self.flipTimer) clearTimeout(self.flipTimer); self.flipTimer = null; },
        'isFlipping()Z': (self) => (self.flipping ? 1 : 0),
        'isAutoStart()Z': () => false,
      },
    })
  );

function vmShowChild(self, index) {
  self.displayedChild = index | 0;
  (self.view?.children || []).forEach((child, i) => { child.visibility = i === (index | 0) ? 0 : 8; });
  self.view?.invalidate?.();
}

  defs.push(
    nativeDef('Landroid/widget/DigitalClock;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/DigitalClock;', 'Landroid/widget/TextView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setTimeZone(Ljava/lang/String;)V': (self, [zone]) => { self.timeZone = jsString(zone); },
        'getTimeZone()Ljava/lang/String;': (self) => self.timeZone ?? '',
        'setFormat(Ljava/lang/String;)V': (self, [format]) => { self.format = jsString(format); },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AnalogClock;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/AnalogClock;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/NumberPicker;', {
      super: 'Landroid/widget/LinearLayout;',
      ctor: viewPeerConstructor('Landroid/widget/NumberPicker;', 'Landroid/widget/LinearLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setMinValue(I)V': (self, [value]) => { self.minValue = value | 0; },
        'setMaxValue(I)V': (self, [value]) => { self.maxValue = value | 0; },
        'getMinValue()I': (self) => self.minValue | 0,
        'getMaxValue()I': (self) => self.maxValue | 0,
        'setValue(I)V': (self, [value]) => { self.value = value | 0; self.view?.setValue?.(self.value); },
        'getValue()I': (self) => self.value | 0,
        'setWrapSelectorWheel(Z)V': (self, [value]) => { self.wrapSelector = !!value; },
        'setFormatter(Landroid/widget/NumberPicker$Formatter;)V': (self, [formatter]) => { self.formatter = formatter; },
        'setOnValueChangedListener(Landroid/widget/NumberPicker$OnValueChangeListener;)V': (self, [listener]) => { self.valueListener = listener; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/TextClock;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/TextClock;', 'Landroid/widget/TextView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setFormat12Hour(Ljava/lang/CharSequence;)V': (self, [format]) => { self.format12 = jsString(format); },
        'setFormat24Hour(Ljava/lang/CharSequence;)V': (self, [format]) => { self.format24 = jsString(format); },
        'getFormat12Hour()Ljava/lang/CharSequence;': (self) => self.format12 ?? 'h:mm a',
        'getFormat24Hour()Ljava/lang/CharSequence;': (self) => self.format24 ?? 'H:mm',
        'setTimeZone(Ljava/lang/String;)V': (self, [zone]) => { self.timeZone = jsString(zone); },
        'getTimeZone()Ljava/lang/String;': (self) => self.timeZone ?? '',
        'is24HourModeEnabled()Z': () => 0,
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => { if (self.view) self.view.setText?.(jsString(text)); },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Chronometer;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/Chronometer;', 'Landroid/widget/TextView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setBase(J)V': (self, [base]) => { self.base = Number(base) || Date.now(); self.refreshChronometer?.(); },
        'getBase()J': (self) => BigInt(self.base || Date.now()),
        'setFormat(Ljava/lang/String;)V': (self, [format]) => { self.format = jsString(format); self.refreshChronometer?.(); },
        'setCountDown(Z)V': (self, [value]) => { self.countDown = !!value; },
        'isCountDown()Z': (self) => (self.countDown ? 1 : 0),
        'start()V': (self) => {
          self.running = true;
          const tick = () => {
            if (!self.running) return;
            self.refreshChronometer?.();
            self.timer = setTimeout(tick, 1000);
            self.timer?.unref?.();
          };
          self.refreshChronometer = () => {
            const elapsed = Math.max(0, ((Date.now() - (self.base || Date.now())) / 1000) | 0);
            const value = self.countDown ? Math.max(0, elapsed) : elapsed;
            const text = self.format ? String(self.format).replace('%s', String(value)) : String(value);
            self.view?.setText?.(text);
            self.view?.invalidate?.();
          };
          tick();
        },
        'stop()V': (self) => { self.running = false; if (self.timer) clearTimeout(self.timer); self.timer = null; },
        'setOnChronometerTickListener(Landroid/widget/Chronometer$OnChronometerTickListener;)V': (self, [listener]) => { self.tickListener = listener; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Space;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/Space;', 'Landroid/view/View;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ViewStub;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/ViewStub;'),
      methods: {
        'setVisibility(I)V': (self, [value]) => self.view?.setVisibility(value | 0),
        'setInflatedId(I)V': (self, [value]) => { self.inflatedId = value | 0; },
        'setLayoutResource(I)V': (self, [value]) => { self.layoutResource = value >>> 0; },
        'setLayoutInflater(Landroid/view/LayoutInflater;)V': (self, [inflater]) => { self.inflater = inflater ?? null; },
        'inflate()Landroid/view/View;': (self, _args, vm) => {
          if (!self.layoutResource || !self.view) return null;
          const inflater = self.inflater || new LayoutInflater(vm.contextObject);
          inflater.vm = vm;
          const inflated = inflater.inflate(self.layoutResource);
          const parent = self.view.parent;
          if (parent) {
            const index = parent.children?.indexOf(self.view) ?? -1;
            if (index >= 0) parent.children.splice(index, 1, inflated);
            inflated.parent = parent;
            parent.$zOrder = null;
            parent.requestLayout?.();
            parent.invalidate?.();
          }
          if (self.inflatedId && inflated) inflated.id = self.inflatedId;
          return viewObject(vm, inflated);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/CheckedTextView;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/CheckedTextView;', 'Landroid/widget/TextView;'),
      methods: {
        'setChecked(Z)V': (self, [value]) => { if (self.view) self.view.checked = !!value; },
        'isChecked()Z': (self) => (self.view?.checked ? 1 : 0),
        'setDuplicateParentStateEnabled(Z)V': () => undefined,
        'setCheckMarkDrawable(Landroid/graphics/drawable/Drawable;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/CompoundButton;', {
      super: 'Landroid/widget/Button;',
      ctor: viewPeerConstructor('Landroid/widget/CompoundButton;'),
      methods: {
        'setChecked(Z)V': (self, [value]) => {
          if (self.object) self.object.$fields?.set('Landroid/widget/CompoundButton;->mChecked:Z', !!value);
          if (self.view) self.view.checked = !!value;
        },
        'isChecked()Z': (self) => {
          const fromField = self.object?.$fields?.get('Landroid/widget/CompoundButton;->mChecked:Z');
          if (typeof fromField === 'boolean') return fromField;
          return !!self.view?.checked;
        },
        'toggle()V': (self) => {
          const current = !!self.object?.$fields?.get('Landroid/widget/CompoundButton;->mChecked:Z');
          const next = !current;
          self.object?.$fields?.set('Landroid/widget/CompoundButton;->mChecked:Z', next);
          if (self.view) self.view.checked = next;
        },
        'setOnCheckedChangeListener(Landroid/widget/CompoundButton$OnCheckedChangeListener;)V': (self, [listener]) => {
          if (self.view) self.view.onCheckedChangeListener = listener ?? null;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Switch;', {
      super: 'Landroid/widget/CompoundButton;',
      ctor: viewPeerConstructor('Landroid/widget/Switch;'),
      methods: {
        'setChecked(Z)V': (self, [value]) => {
          if (self.object) self.object.$fields?.set('Landroid/widget/CompoundButton;->mChecked:Z', !!value);
          if (self.view) self.view.checked = !!value;
        },
        'isChecked()Z': (self) => {
          const fromField = self.object?.$fields?.get('Landroid/widget/CompoundButton;->mChecked:Z');
          if (typeof fromField === 'boolean') return fromField;
          return !!self.view?.checked;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Button;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/Button;'),
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => {
          // Android 里 setText(null) 等于清空文本；jsString(null) 会返回字面量
          // "null"，直接把控件文字变成 "null"，所以这里先挡掉空引用。
          self.view?.setText?.(text === null || text === undefined ? '' : jsString(text));
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/EditText;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/EditText;'),
      methods: {
        'getText()Landroid/text/Editable;': (self) => self.view?.getText() ?? '',
        'getSelectionStart()I': (self) => self.view?.getSelectionStart?.() ?? 0,
        'getSelectionEnd()I': (self) => self.view?.getSelectionEnd?.() ?? 0,
        'setSelection(I)V': (self, [index]) => self.view?.setSelection?.(index | 0),
        'setSelection(II)V': (self, [start, end]) => {
          const view = self.view;
          if (!view) return;
          const length = view.getText().length;
          view.selectionStart = Math.max(0, Math.min(length, start | 0));
          view.selectionEnd = Math.max(0, Math.min(length, end | 0));
          view.invalidate?.();
        },
        'setEditable(Z)V': (self, [value]) => {
          if (self.view) self.view.editable = !!value;
        },
        'setInputType(I)V': (self, [type]) => {
          if (self.view) self.view.inputType = type | 0;
        },
        'showSoftInput()V': (self) => self.view?.showKeyboard?.(),
      },
    })
  );

  function resetScroller(self) {
    self.scrollerFinished = true;
    self.scrollerStartTime = 0;
    self.scrollerDuration = 0;
    self.scrollerStartX = 0;
    self.scrollerStartY = 0;
    self.scrollerFinalX = 0;
    self.scrollerFinalY = 0;
    self.scrollerCurrX = 0;
    self.scrollerCurrY = 0;
  }

  function startScroller(self, sx, sy, dx, dy, duration) {
    self.scrollerFinished = false;
    self.scrollerStartTime = Date.now();
    self.scrollerDuration = Math.max(1, Number(duration) || 250);
    self.scrollerStartX = Number(sx) | 0;
    self.scrollerStartY = Number(sy) | 0;
    self.scrollerFinalX = (self.scrollerStartX + (Number(dx) | 0)) | 0;
    self.scrollerFinalY = (self.scrollerStartY + (Number(dy) | 0)) | 0;
    self.scrollerCurrX = self.scrollerStartX;
    self.scrollerCurrY = self.scrollerStartY;
  }

  defs.push(
    nativeDef('Landroid/view/accessibility/AccessibilityManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'isEnabled()Z': () => 0,
        'isTouchExplorationEnabled()Z': () => 0,
        'isRequestFromAccessibilityTool()Z': () => 0,
        'getRecommendedTimeoutMillis(I)I': (_self, [original]) => original | 0,
        'getEnabledAccessibilityServiceList(I)Ljava/util/List;': (_self, _args, vm) => makeList(vm, []),
        'addAccessibilityStateChangeListener(Landroid/view/accessibility/AccessibilityManager$AccessibilityStateChangeListener;)Z': () => false,
        'removeAccessibilityStateChangeListener(Landroid/view/accessibility/AccessibilityManager$AccessibilityStateChangeListener;)Z': () => false,
      },
    })
  );

  // StrictMode 的策略只用于开发期诊断，这里保持链式 Builder 的形态即可：
  // 每次设置/清除检查项都返回 builder 自身，build() 产出一个空策略对象。
  function strictModePolicyBuilderMethods(policyDescriptor, builderDescriptor) {
    const methods = {
      '<init>()V': () => undefined,
      [`build()${policyDescriptor}`]: (_self, _args, vm) => vm.allocateObject(vm.registry.resolve(policyDescriptor)),
    };
    for (const params of ['()', `(${builderDescriptor})`, `(${policyDescriptor})`]) {
      methods[`<init>${params}V`] = () => undefined;
    }
    const chainNames = [
      'detectAll', 'detectDiskReads', 'detectDiskWrites', 'detectNetwork',
      'detectCustomSlowCalls', 'detectResourceMismatches', 'detectUnbufferedIo',
      'detectExplicitGc', 'detectIncorrectContextUse', 'detectUnsafeIntentLaunch',
      'detectActivityLeaks', 'detectLeakedClosableObjects', 'detectLeakedRegistrationObjects',
      'detectLeakedSqlLiteObjects', 'detectFileUriExposure', 'detectCleartextNetwork',
      'detectCredentialProtectedWhileLocked', 'detectImplicitDirectBoot', 'detectUntaggedSockets',
      'detectContentUriWithoutPermission', 'detectNonSdkApiUsage',
      'penaltyLog', 'penaltyDeath', 'penaltyDeathOnNetwork', 'penaltyDialog',
      'penaltyFlashScreen', 'penaltyDropBox', 'penaltyDeathOnFileUriExposure',
      'permitAll', 'permitDiskReads', 'permitDiskWrites', 'permitCustomSlowCalls',
      'permitNetwork', 'permitUnbufferedIo', 'permitNonSdkApi', 'permitFileUriExposure',
      'permitContentUriWithoutPermission',
    ];
    for (const name of chainNames) {
      methods[`${name}()${builderDescriptor}`] = (self) => self.$object ?? self;
    }
    return methods;
  }

  defs.push(
    nativeDef('Landroid/os/Trace;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'beginSection(Ljava/lang/String;)V': () => undefined,
        'endSection()V': () => undefined,
        'beginAsyncSection(Ljava/lang/String;I)V': () => undefined,
        'endAsyncSection(Ljava/lang/String;I)V': () => undefined,
        'setCounter(Ljava/lang/String;I)V': () => undefined,
      },
    }),
    nativeDef('Landroid/os/StrictMode;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'setThreadPolicy(Landroid/os/StrictMode$ThreadPolicy;)V': () => undefined,
        'getThreadPolicy()Landroid/os/StrictMode$ThreadPolicy;': (_self, _args, vm) => vm.allocateObject(vm.registry.resolve('Landroid/os/StrictMode$ThreadPolicy;')),
        'setVmPolicy(Landroid/os/StrictMode$VmPolicy;)V': () => undefined,
        'getVmPolicy()Landroid/os/StrictMode$VmPolicy;': (_self, _args, vm) => vm.allocateObject(vm.registry.resolve('Landroid/os/StrictMode$VmPolicy;')),
        'allowThreadDiskReads()Landroid/os/StrictMode$ThreadPolicy;': (_self, _args, vm) => vm.allocateObject(vm.registry.resolve('Landroid/os/StrictMode$ThreadPolicy;')),
        'allowThreadDiskWrites()Landroid/os/StrictMode$ThreadPolicy;': (_self, _args, vm) => vm.allocateObject(vm.registry.resolve('Landroid/os/StrictMode$ThreadPolicy;')),
        'enableDefaults()V': () => undefined,
        'noteSlowCall(Ljava/lang/String;)V': () => undefined,
        'noteDiskWrite()V': () => undefined,
        'noteDiskRead()V': () => undefined,
      },
    }),
    nativeDef('Landroid/os/StrictMode$ThreadPolicy;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/os/StrictMode$VmPolicy;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/os/StrictMode$ThreadPolicy$Builder;', {
      super: 'Ljava/lang/Object;',
      methods: strictModePolicyBuilderMethods('Landroid/os/StrictMode$ThreadPolicy;', 'Landroid/os/StrictMode$ThreadPolicy$Builder;'),
    }),
    nativeDef('Landroid/os/StrictMode$VmPolicy$Builder;', {
      super: 'Ljava/lang/Object;',
      methods: strictModePolicyBuilderMethods('Landroid/os/StrictMode$VmPolicy;', 'Landroid/os/StrictMode$VmPolicy$Builder;'),
    }),
    nativeDef('Landroid/widget/EdgeEffect;', {
      super: 'Ljava/lang/Object;',
      ctor: class EdgeEffectPeer {
        constructor() { this.finished = true; this.color = -1; }
      },
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setSize(II)V': () => undefined,
        'finish()V': (self) => { self.finished = true; },
        'isFinished()Z': () => 1,
        'draw(Landroid/graphics/Canvas;)Z': () => 0,
        'getMaxHeight()I': () => 0,
        'onPull(F)V': () => undefined,
        'onPull(FF)V': () => undefined,
        'onRelease()V': () => undefined,
        'onAbsorb(I)V': () => undefined,
        'getColor()I': (self) => self.color | 0,
        'setColor(I)V': (self, [color]) => { self.color = color | 0; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Scroller;', {
      super: 'Ljava/lang/Object;',
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { resetScroller(self); },
        '<init>(Landroid/content/Context;Landroid/view/animation/Interpolator;)V': (self) => { resetScroller(self); },
        'startScroll(IIII)V': (self, [sx, sy, dx, dy]) => startScroller(self, sx, sy, dx, dy, 250),
        'startScroll(IIIII)V': (self, [sx, sy, dx, dy, duration]) => startScroller(self, sx, sy, dx, dy, duration),
        'computeScrollOffset()Z': (self) => {
          if (self.scrollerFinished) return false;
          const elapsed = Date.now() - self.scrollerStartTime;
          const duration = Math.max(1, self.scrollerDuration | 0);
          if (elapsed >= duration) {
            self.scrollerCurrX = self.scrollerFinalX;
            self.scrollerCurrY = self.scrollerFinalY;
            self.scrollerFinished = true;
          } else {
            const t = elapsed / duration;
            self.scrollerCurrX = Math.round(self.scrollerStartX + (self.scrollerFinalX - self.scrollerStartX) * t);
            self.scrollerCurrY = Math.round(self.scrollerStartY + (self.scrollerFinalY - self.scrollerStartY) * t);
          }
          return true;
        },
        'isFinished()Z': (self) => !!self.scrollerFinished,
        'abortAnimation()V': (self) => { self.scrollerFinished = true; },
        'forceFinished(Z)V': (self, [finished]) => { self.scrollerFinished = !!finished; },
        'getCurrX()I': (self) => self.scrollerCurrX | 0,
        'getCurrY()I': (self) => self.scrollerCurrY | 0,
        'getStartX()I': (self) => self.scrollerStartX | 0,
        'getStartY()I': (self) => self.scrollerStartY | 0,
        'getFinalX()I': (self) => self.scrollerFinalX | 0,
        'getFinalY()I': (self) => self.scrollerFinalY | 0,
        'getDuration()I': (self) => self.scrollerDuration | 0,
        'setFriction(F)V': () => undefined,
        'extendDuration(I)V': () => undefined,
        'timePassed()I': (self) => (Date.now() - (self.scrollerStartTime || Date.now())) | 0,
        'isScrollingInDirection(FF)Z': (self, [xvel, yvel]) => {
          return !self.scrollerFinished && Math.sign(xvel) === Math.sign(self.scrollerFinalX - self.scrollerCurrX);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/OverScroller;', {
      super: 'Ljava/lang/Object;',
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { resetScroller(self); },
        '<init>(Landroid/content/Context;Landroid/view/animation/Interpolator;)V': (self) => { resetScroller(self); },
        'startScroll(IIII)V': (self, [sx, sy, dx, dy]) => startScroller(self, sx, sy, dx, dy, 250),
        'startScroll(IIIII)V': (self, [sx, sy, dx, dy, duration]) => startScroller(self, sx, sy, dx, dy, duration),
        'computeScrollOffset()Z': (self) => {
          if (self.scrollerFinished) return false;
          const elapsed = Date.now() - self.scrollerStartTime;
          const duration = Math.max(1, self.scrollerDuration | 0);
          if (elapsed >= duration) {
            self.scrollerCurrX = self.scrollerFinalX;
            self.scrollerCurrY = self.scrollerFinalY;
            self.scrollerFinished = true;
          } else {
            const t = elapsed / duration;
            self.scrollerCurrX = Math.round(self.scrollerStartX + (self.scrollerFinalX - self.scrollerStartX) * t);
            self.scrollerCurrY = Math.round(self.scrollerStartY + (self.scrollerFinalY - self.scrollerStartY) * t);
          }
          return true;
        },
        'isFinished()Z': (self) => !!self.scrollerFinished,
        'abortAnimation()V': (self) => { self.scrollerFinished = true; },
        'forceFinished(Z)V': (self, [finished]) => { self.scrollerFinished = !!finished; },
        'getCurrX()I': (self) => self.scrollerCurrX | 0,
        'getCurrY()I': (self) => self.scrollerCurrY | 0,
        'getStartX()I': (self) => self.scrollerStartX | 0,
        'getStartY()I': (self) => self.scrollerStartY | 0,
        'getFinalX()I': (self) => self.scrollerFinalX | 0,
        'getFinalY()I': (self) => self.scrollerFinalY | 0,
        'fling(IIIIIIIIII)Z': (self, [sx, sy, vx, vy, minX, maxX, minY, maxY]) => {
          const targetX = Math.max(minX | 0, Math.min(maxX | 0, (sx | 0) + Math.round((vx | 0) * 0.2)));
          const targetY = Math.max(minY | 0, Math.min(maxY | 0, (sy | 0) + Math.round((vy | 0) * 0.2)));
          startScroller(self, sx | 0, sy | 0, targetX - (sx | 0), targetY - (sy | 0), 300);
          return true;
        },
        'springBack(IIIIII)Z': (self, [sx, sy, minX, maxX, minY, maxY]) => {
          const targetX = Math.max(minX | 0, Math.min(maxX | 0, sx | 0));
          const targetY = Math.max(minY | 0, Math.min(maxY | 0, sy | 0));
          startScroller(self, sx | 0, sy | 0, targetX - (sx | 0), targetY - (sy | 0), 250);
          return true;
        },
        'setFriction(F)V': () => undefined,
        'extendDuration(I)V': () => undefined,
        'timePassed()I': (self) => (Date.now() - (self.scrollerStartTime || Date.now())) | 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ImageView;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/ImageView;'),
      methods: {
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self, _args, vm) => applyProgrammaticViewStyle(vm, self, 0),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (self, args, vm) => applyProgrammaticViewStyle(vm, self, args?.[2] | 0),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;II)V': (self, args, vm) => applyProgrammaticViewStyle(vm, self, args?.[2] | 0),
        'setImageResource(I)V': (self, [resId]) => {
          self.view.drawable = drawableObject(self.vm, self.vm.resources.getDrawable(resId >>> 0));
          self.view.invalidate();
        },
        'setImageDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
          self.view.drawable = drawable;
          self.view.invalidate();
        },
        'getDrawable()Landroid/graphics/drawable/Drawable;': (self) => drawableObject(self.vm, self.view?.drawable ?? null),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/LinearLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/LinearLayout;'),
      methods: {
        'setOrientation(I)V': (self, [orientation]) => self.view?.setOrientation(orientation | 0),
        'setGravity(I)V': (self, [gravity]) => self.view?.setGravity(gravity | 0),
        'setWeightSum(F)V': (self, [sum]) => self.view?.setWeightSum(Number(sum)),
      },
      staticFields: new Map([['HORIZONTAL:I', 0], ['VERTICAL:I', 1]]),
    })
  );

  defs.push(
    nativeDef('Landroid/widget/TableRow;', {
      super: 'Landroid/widget/LinearLayout;',
      ctor: viewPeerConstructor('Landroid/widget/TableRow;'),
      methods: {
        ...viewMethods(),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/TableLayout;', {
      super: 'Landroid/widget/LinearLayout;',
      ctor: viewPeerConstructor('Landroid/widget/TableLayout;'),
      methods: {
        ...viewMethods(),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/FrameLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/FrameLayout;'),
    })
  );

  defs.push(
    nativeDef('Landroid/widget/GridLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/GridLayout;'),
      methods: {
        ...viewMethods(),
        'setColumnCount(I)V': (self, [value]) => self.view?.setColumnCount(value | 0),
        'setRowCount(I)V': (self, [value]) => self.view?.setRowCount(value | 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AbsoluteLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/AbsoluteLayout;'),
    })
  );

  for (const [descriptor, superDescriptor] of [
    ['Landroid/widget/ImageButton;', 'Landroid/widget/ImageView;'],
  ]) {
    defs.push(
      nativeDef(descriptor, {
        super: superDescriptor,
        ctor: viewPeerConstructor(descriptor, superDescriptor),
        methods: viewMethods(),
      })
    );
  }

  defs.push(
    nativeDef('Landroid/widget/RelativeLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/RelativeLayout;'),
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ScrollView;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/ScrollView;'),
      methods: {
        'scrollTo(II)V': (self, [x, y]) => self.view?.scrollTo?.(x, y),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Adapter;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getCount()I': () => 0,
        'isEmpty()Z': (self, _args, vm) => {
          const count = vm.invokeByName('getCount', '()I', self.$object || self, []);
          return !(Number(count) > 0);
        },
        'registerDataSetObserver(Landroid/database/DataSetObserver;)V': () => undefined,
        'unregisterDataSetObserver(Landroid/database/DataSetObserver;)V': () => undefined,
        'hasStableIds()Z': () => false,
        'getItemViewType(I)I': () => 0,
        'getViewTypeCount()I': () => 1,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ListAdapter;', {
      super: 'Ljava/lang/Object;',
      interfaces: ['Landroid/widget/Adapter;'],
      methods: {
        'getCount()I': () => 0,
        'getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
        'getItem(I)Ljava/lang/Object;': () => null,
        'getItemId(I)J': (_self, [position]) => position | 0,
        'isEmpty()Z': () => true,
        'areAllItemsEnabled()Z': () => true,
        'isEnabled(I)Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/SpinnerAdapter;', {
      super: 'Ljava/lang/Object;',
      interfaces: ['Landroid/widget/Adapter;'],
      methods: {
        'getDropDownView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/Dialog;', {
      super: 'Ljava/lang/Object;',
      ctor: class DialogPeer { constructor() { this.showing = false; this.cancelable = true; } },
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { self.showing = false; self.cancelable = true; },
        '<init>(Landroid/content/Context;I)V': (self) => { self.showing = false; self.cancelable = true; },
        'show()V': (self, _args, vm) => { self.vm = vm; self.dialogObject = self.$object ?? self; dialogShow(self); },
        'dismiss()V': (self) => dialogDismiss(self),
        'cancel()V': (self) => dialogDismiss(self),
        'isShowing()Z': (self) => (self.showing ? 1 : 0),
        'setCancelable(Z)V': (self, [value]) => { self.cancelable = !!value; },
        'setCanceledOnTouchOutside(Z)V': (self, [value]) => { self.cancelable = !!value; },
        'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => { self.title = jsString(title); },
        'setContentView(Landroid/view/View;)V': (self, [view]) => { self.contentView = view ?? null; },
        'findViewById(I)Landroid/view/View;': (self, [id]) => self.contentView?.findViewById?.(id) ?? null,
        'setOnDismissListener(Landroid/content/DialogInterface$OnDismissListener;)V': (self, [listener]) => { self.dismissListener = listener; },
        'getWindow()Landroid/view/Window;': (self, _args, vm) => dialogEnsureWindow(self, vm),
        'setOnShowListener(Landroid/content/DialogInterface$OnShowListener;)V': (self, [listener]) => { self.showListener = listener; },
        'setOnCancelListener(Landroid/content/DialogInterface$OnCancelListener;)V': (self, [listener]) => { self.cancelListener = listener; },
        'setOnKeyListener(Landroid/content/DialogInterface$OnKeyListener;)V': (self, [listener]) => { self.keyListener = listener; },

        '<init>(Landroid/content/Context;ZLandroid/content/DialogInterface$OnCancelListener;)V': (self, [context, cancelable, listener]) => {
          self.context = context ?? null;
          self.showing = false;
          self.cancelable = cancelable !== false;
          self.cancelListener = listener ?? null;
        },
        'getContext()Landroid/content/Context;': (self, _args, vm) => self.context ?? vm.contextObject ?? null,
        'getActionBar()Landroid/app/ActionBar;': () => null,
        'setOwnerActivity(Landroid/app/Activity;)V': (self, [activity]) => { self.ownerActivity = activity ?? null; },
        'getOwnerActivity()Landroid/app/Activity;': (self) => self.ownerActivity ?? null,
        'create()V': (self, _args, vm) => {
          self.vm = vm;
          self.dialogObject = self.$object ?? self;
          dialogEnsureWindow(self, vm);
        },
        'hide()V': (self) => {
          if (!self.showing) return;
          self.showing = false;
          const screen = self.vm?.screen;
          if (screen && self.overlay) screen.removeOverlay?.(self.overlay);
        },
        'onCreate(Landroid/os/Bundle;)V': () => undefined,
        'onStart()V': () => undefined,
        'onStop()V': () => undefined,
        'onSaveInstanceState()Landroid/os/Bundle;': () => null,
        'onRestoreInstanceState(Landroid/os/Bundle;)V': () => undefined,
        'getCurrentFocus()Landroid/view/View;': (self) => {
          const root = unwrapView(self.contentView);
          const focused = findFocusedDescendant(root);
          return focused ? viewObject(self.vm, focused) : null;
        },
        'requireViewById(I)Landroid/view/View;': (self, [id]) => {
          const view = self.contentView?.findViewById?.(id) ?? null;
          if (!view) throw new Error(`requireViewById: 找不到 id 0x${(id >>> 0).toString(16)}`);
          return view;
        },
        'setContentView(I)V': (self, [resId], vm) => {
          self.vm = vm;
          const inflater = new LayoutInflater(vm.contextObject);
          inflater.vm = vm;
          self.contentView = inflater.inflate(resId);
        },
        'setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view]) => { self.contentView = view ?? null; },
        'addContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view]) => { self.contentView = view ?? null; },
        'setTitle(I)V': (self, [resId], vm) => { self.vm = vm; self.title = vm.resources.getString(resId >>> 0); },
        'onKeyDown(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyLongPress(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyUp(ILandroid/view/KeyEvent;)Z': () => false,
        'onKeyMultiple(IILandroid/view/KeyEvent;)Z': () => false,
        'onKeyShortcut(ILandroid/view/KeyEvent;)Z': () => false,
        'onBackPressed()V': (self) => dialogDismiss(self),
        'onTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
        'onWindowAttributesChanged(Landroid/view/WindowManager$LayoutParams;)V': () => undefined,
        'onContentChanged()V': () => undefined,
        'onWindowFocusChanged(Z)V': (self, [hasFocus]) => { self.$windowFocus = !!hasFocus; },
        'onAttachedToWindow()V': () => undefined,
        'onDetachedFromWindow()V': () => undefined,
        'dispatchKeyEvent(Landroid/view/KeyEvent;)Z': (self, [event], vm) => {
          const keyCode = event?.keyCode ?? event?.$peer?.keyCode ?? 0;
          if ((keyCode | 0) === 4) { dialogDismiss(self); return true; }
          return false;
        },
        'dispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': () => false,
        'dispatchTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => unwrapView(self.contentView)?.dispatchTouchEvent?.(event) ?? false,
        'dispatchTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
        'dispatchPopulateAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)Z': () => false,
        'onCreatePanelView(I)Landroid/view/View;': () => null,
        'onCreatePanelMenu(ILandroid/view/Menu;)Z': () => false,
        'onPreparePanel(ILandroid/view/View;Landroid/view/Menu;)Z': () => false,
        'onMenuOpened(ILandroid/view/Menu;)Z': () => true,
        'onMenuItemSelected(ILandroid/view/MenuItem;)Z': (self, [featureId, item], vm) => {
          try {
            if ((featureId | 0) === 0) return !!vm.invokeByName('onOptionsItemSelected', '(Landroid/view/MenuItem;)Z', self.$object ?? self, [item]);
            if ((featureId | 0) === 6) return !!vm.invokeByName('onContextItemSelected', '(Landroid/view/MenuItem;)Z', self.$object ?? self, [item]);
          } catch (_) { /* 应用未覆写 */ }
          return false;
        },
        'onPanelClosed(ILandroid/view/Menu;)V': () => undefined,
        'onCreateOptionsMenu(Landroid/view/Menu;)Z': () => false,
        'onPrepareOptionsMenu(Landroid/view/Menu;)Z': () => false,
        'onOptionsItemSelected(Landroid/view/MenuItem;)Z': () => false,
        'onOptionsMenuClosed(Landroid/view/Menu;)V': () => undefined,
        'openOptionsMenu()V': () => undefined,
        'closeOptionsMenu()V': () => undefined,
        'invalidateOptionsMenu()V': () => undefined,
        'onCreateContextMenu(Landroid/view/ContextMenu;Landroid/view/View;Landroid/view/ContextMenu$ContextMenuInfo;)V': () => undefined,
        'registerForContextMenu(Landroid/view/View;)V': () => undefined,
        'unregisterForContextMenu(Landroid/view/View;)V': () => undefined,
        'openContextMenu(Landroid/view/View;)V': () => undefined,
        'onContextItemSelected(Landroid/view/MenuItem;)Z': () => false,
        'onContextMenuClosed(Landroid/view/Menu;)V': () => undefined,
        'onSearchRequested(Landroid/view/SearchEvent;)Z': () => false,
        'onSearchRequested()Z': () => false,
        'getSearchEvent()Landroid/view/SearchEvent;': () => null,
        'onWindowStartingActionMode(Landroid/view/ActionMode$Callback;)Landroid/view/ActionMode;': () => null,
        'onWindowStartingActionMode(Landroid/view/ActionMode$Callback;I)Landroid/view/ActionMode;': () => null,
        'onActionModeStarted(Landroid/view/ActionMode;)V': () => undefined,
        'onActionModeFinished(Landroid/view/ActionMode;)V': () => undefined,
        'takeKeyEvents(Z)V': () => undefined,
        'requestWindowFeature(I)Z': () => true,
        'setFeatureDrawableResource(II)V': () => undefined,
        'setFeatureDrawableUri(ILandroid/net/Uri;)V': () => undefined,
        'setFeatureDrawable(ILandroid/graphics/drawable/Drawable;)V': () => undefined,
        'setFeatureDrawableAlpha(II)V': () => undefined,
        'getLayoutInflater()Landroid/view/LayoutInflater;': (self, _args, vm) => {
          const inflater = new LayoutInflater(self.context ?? vm.contextObject);
          inflater.vm = vm;
          return inflater;
        },
        'setCancelMessage(Landroid/os/Message;)V': (self, [message]) => { self.cancelMessage = message ?? null; },
        'setDismissMessage(Landroid/os/Message;)V': (self, [message]) => { self.dismissMessage = message ?? null; },
        'setVolumeControlStream(I)V': (self, [stream]) => { self.$volumeControlStream = stream | 0; },
        'getVolumeControlStream()I': (self) => self.$volumeControlStream ?? 3,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/AlertDialog;', {
      super: 'Landroid/app/Dialog;',
      ctor: class AlertDialogPeer { constructor() { this.showing = false; this.cancelable = true; } },
      methods: {
        'show()V': (self, _args, vm) => { self.vm = vm; self.dialogObject = self.$object ?? self; dialogShow(self); },
        'dismiss()V': (self) => dialogDismiss(self),
        'isShowing()Z': (self) => (self.showing ? 1 : 0),
        'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => { self.title = jsString(title); },
        'setMessage(Ljava/lang/CharSequence;)V': (self, [message]) => { self.message = jsString(message); },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/ProgressDialog;', {
      super: 'Landroid/app/AlertDialog;',
      ctor: class ProgressDialogPeer { constructor() { this.showing = false; this.cancelable = true; this.indeterminate = true; } },
      staticMethods: {
        'show(Landroid/content/Context;Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Landroid/app/ProgressDialog;': (_self, [context, title, message], vm) => {
          const dialog = vm.allocateRawObject('Landroid/app/ProgressDialog;');
          dialog.$peer = { vm, showing: false, cancelable: true, title: jsString(title), message: jsString(message), dialogObject: dialog };
          dialogShow(dialog.$peer);
          return dialog;
        },
        'show(Landroid/content/Context;Ljava/lang/CharSequence;Ljava/lang/CharSequence;Z)Landroid/app/ProgressDialog;': (_self, [context, title, message, indeterminate], vm) => {
          const dialog = vm.allocateRawObject('Landroid/app/ProgressDialog;');
          dialog.$peer = { vm, showing: false, cancelable: true, title: jsString(title), message: jsString(message), indeterminate: !!indeterminate, dialogObject: dialog };
          dialogShow(dialog.$peer);
          return dialog;
        },
      },
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { self.showing = false; self.cancelable = true; },
        'show()V': (self, _args, vm) => { self.vm = vm; self.dialogObject = self.$object ?? self; dialogShow(self); },
        'dismiss()V': (self) => dialogDismiss(self),
        'isShowing()Z': (self) => (self.showing ? 1 : 0),
        'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => { self.title = jsString(title); },
        'setMessage(Ljava/lang/CharSequence;)V': (self, [message]) => { self.message = jsString(message); },
        'setIndeterminate(Z)V': (self, [value]) => { self.indeterminate = !!value; },
        'setProgressStyle(I)V': () => undefined,
        'setMax(I)V': (self, [max]) => { self.max = max | 0; },
        'setProgress(I)V': (self, [value]) => { self.progress = value | 0; },
        'getProgress()I': (self) => self.progress | 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/AlertDialog$Builder;', {
      super: 'Ljava/lang/Object;',
      ctor: class AlertDialogBuilderPeer { constructor() { this.cancelable = true; } },
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { self.cancelable = true; },
        '<init>(Landroid/content/Context;I)V': (self) => { self.cancelable = true; },
        'setTitle(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;': (self, [title]) => { self.title = jsString(title); return self.$object ?? self; },
        'setTitle(I)Landroid/app/AlertDialog$Builder;': (self, [resId], vm) => { self.title = vm.resources.getString(resId >>> 0); return self.$object ?? self; },
        'setMessage(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;': (self, [message]) => { self.message = jsString(message); return self.$object ?? self; },
        'setMessage(I)Landroid/app/AlertDialog$Builder;': (self, [resId], vm) => { self.message = vm.resources.getString(resId >>> 0); return self.$object ?? self; },
        'setPositiveButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [text, listener]) => { self.positiveText = jsString(text); self.positiveListener = listener; return self.$object ?? self; },
        'setPositiveButton(ILandroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [resId, listener], vm) => { self.positiveText = vm.resources.getString(resId >>> 0); self.positiveListener = listener; return self.$object ?? self; },
        'setNegativeButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [text, listener]) => { self.negativeText = jsString(text); self.negativeListener = listener; return self.$object ?? self; },
        'setNegativeButton(ILandroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [resId, listener], vm) => { self.negativeText = vm.resources.getString(resId >>> 0); self.negativeListener = listener; return self.$object ?? self; },
        'setCancelable(Z)Landroid/app/AlertDialog$Builder;': (self, [value]) => { self.cancelable = !!value; return self.$object ?? self; },
        'setNeutralButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [text, listener]) => { self.neutralText = jsString(text); self.neutralListener = listener; return self.$object ?? self; },
        'setView(Landroid/view/View;)Landroid/app/AlertDialog$Builder;': (self, [view]) => { self.contentView = view ?? null; return self.$object ?? self; },
        'setAdapter(Landroid/widget/ListAdapter;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [adapter, listener], vm) => {
          self.adapter = adapter ?? null;
          self.itemListener = listener;
          self.adapterCount = 0;
          self.adapterItems = [];
          if (adapter) {
            try { self.adapterCount = Number(vm.invokeByName('getCount', '()I', adapter, [])) || 0; } catch (_) {}
            for (let index = 0; index < self.adapterCount; index += 1) {
              try { self.adapterItems.push(vm.invokeByName('getItem', '(I)Ljava/lang/Object;', adapter, [index])); } catch (_) { self.adapterItems.push(index); }
            }
          }
          return self.$object ?? self;
        },
        'setSingleChoiceItems([Ljava/lang/CharSequence;ILandroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [items, checked, listener]) => {
          const values = items?.$data || items || [];
          self.items = Array.from(values, (item) => jsString(item));
          self.choiceMode = 'single';
          self.checkedIndex = checked | 0;
          self.itemListener = listener;
          return self.$object ?? self;
        },
        'setMultiChoiceItems([Ljava/lang/CharSequence;[ZLandroid/content/DialogInterface$OnMultiChoiceClickListener;)Landroid/app/AlertDialog$Builder;': (self, [items, checked, listener]) => {
          const values = items?.$data || items || [];
          self.items = Array.from(values, (item) => jsString(item));
          self.choiceMode = 'multi';
          self.multiChecked = Array.from(checked?.$data || checked || [], (value) => !!value);
          self.multiListener = listener;
          return self.$object ?? self;
        },
        'setItems([Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;': (self, [items, listener]) => {
          const values = items?.$data || items || [];
          self.items = Array.from(values, (item) => jsString(item));
          self.itemListener = listener;
          return self.$object ?? self;
        },
        'setIcon(I)Landroid/app/AlertDialog$Builder;': (self) => self.$object ?? self,
        'setIcon(Landroid/graphics/drawable/Drawable;)Landroid/app/AlertDialog$Builder;': (self) => self.$object ?? self,
        'create()Landroid/app/AlertDialog;': (self, _args, vm) => {
          const dialog = vm.allocateRawObject('Landroid/app/AlertDialog;');
          dialog.$peer = { ...self, vm, showing: false };
          return dialog;
        },
        'show()Landroid/app/AlertDialog;': (self, _args, vm) => {
          const dialog = vm.allocateRawObject('Landroid/app/AlertDialog;');
          dialog.$peer = { ...self, vm, showing: false, dialogObject: dialog };
          dialogShow(dialog.$peer);
          return dialog;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/MultiAutoCompleteTextView;', {
      super: 'Landroid/widget/AutoCompleteTextView;',
      ctor: viewPeerConstructor('Landroid/widget/MultiAutoCompleteTextView;', 'Landroid/widget/AutoCompleteTextView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setTokenizer(Landroid/widget/MultiAutoCompleteTextView$Tokenizer;)V': (self, [tokenizer]) => { self.tokenizer = tokenizer; },
        'getTokenizer()Landroid/widget/MultiAutoCompleteTextView$Tokenizer;': (self) => self.tokenizer ?? null,
        'enoughToFilter()Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AutoCompleteTextView;', {
      super: 'Landroid/widget/EditText;',
      ctor: viewPeerConstructor('Landroid/widget/AutoCompleteTextView;', 'Landroid/widget/EditText;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setAdapter(Landroid/widget/ListAdapter;)V': (self, [adapter], vm) => {
          self.adapter = adapter ?? null;
          try { self.count = Number(vm.invokeByName('getCount', '()I', adapter, [])) || 0; } catch (_) { self.count = 0; }
        },
        'getAdapter()Landroid/widget/ListAdapter;': (self) => self.adapter ?? null,
        'setThreshold(I)V': (self, [value]) => { self.threshold = value | 0; },
        'getThreshold()I': (self) => self.threshold | 0,
        'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (self, [listener]) => { self.itemClickListener = listener; },
        'showDropDown()V': (self, _args, vm) => {
          const count = self.count | 0;
          if (count <= 0) return;
          const items = [];
          for (let index = 0; index < count; index += 1) {
            try { items.push(jsString(vm.invokeByName('getItem', '(I)Ljava/lang/Object;', self.adapter, [index]))); } catch (_) { items.push(String(index)); }
          }
          dialogShow({
            vm,
            items,
            cancelable: true,
            onItemSelected: (index) => {
              try {
                const item = vm.invokeByName('getItem', '(I)Ljava/lang/Object;', self.adapter, [index]);
                self.view?.setText?.(jsString(item));
                self.view?.invalidate?.();
                vm.invokeInterface(self.itemClickListener, 'onItemClick', '(Landroid/widget/AdapterView;Landroid/view/View;IJ)V', [self.$object ?? self, null, index, BigInt(index)]);
              } catch (_) {}
            },
          });
        },
        'dismissDropDown()V': (self) => {
          const overlays = self.vm?.screen?.overlays || [];
          const overlay = overlays[overlays.length - 1];
          if (overlay) self.vm.screen.removeOverlay?.(overlay);
        },
        'isPopupShowing()Z': (self) => ((self.vm?.screen?.overlays?.length || 0) > 0 ? 1 : 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ExpandableListView;', {
      super: 'Landroid/widget/ListView;',
      ctor: viewPeerConstructor('Landroid/widget/ExpandableListView;', 'Landroid/widget/ListView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setAdapter(Landroid/widget/ExpandableListAdapter;)V': (self, [adapter]) => { self.expandableAdapter = adapter ?? null; },
        'getExpandableListAdapter()Landroid/widget/ExpandableListAdapter;': (self) => self.expandableAdapter ?? null,
        'expandGroup(I)Z': (self, [group]) => { if (!self.expandedGroups) self.expandedGroups = new Set(); self.expandedGroups.add(group | 0); return true; },
        'collapseGroup(I)Z': (self, [group]) => { self.expandedGroups?.delete(group | 0); return true; },
        'isGroupExpanded(I)Z': (self, [group]) => (self.expandedGroups?.has(group | 0) ? 1 : 0),
        'setOnGroupClickListener(Landroid/widget/ExpandableListView$OnGroupClickListener;)V': (self, [listener]) => { self.groupClickListener = listener; },
        'setOnChildClickListener(Landroid/widget/ExpandableListView$OnChildClickListener;)V': (self, [listener]) => { self.childClickListener = listener; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/CalendarView;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/CalendarView;', 'Landroid/widget/FrameLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setOnDateChangeListener(Landroid/widget/CalendarView$OnDateChangeListener;)V': (self, [listener]) => { self.dateChangeListener = listener; },
        'setDate(J)V': (self, [millis]) => { self.date = Number(millis) || 0; self.view?.setDate?.(self.date); },
        'setDate(JZZ)V': (self, [millis]) => { self.date = Number(millis) || 0; self.view?.setDate?.(self.date); },
        'getDate()J': (self) => BigInt(self.view?.date || self.date || 0),
        'setFirstDayOfWeek(I)V': (self, [day]) => { self.firstDayOfWeek = day | 0; },
        'getFirstDayOfWeek()I': (self) => self.firstDayOfWeek | 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/DatePicker;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/DatePicker;', 'Landroid/widget/FrameLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setOnDateChangedListener(Landroid/widget/DatePicker$OnDateChangedListener;)V': (self, [listener]) => { self.dateListener = listener; },
        'updateDate(III)V': (self, [year, month, day]) => { self.year = year | 0; self.month = month | 0; self.day = day | 0; self.view?.setDate?.(self.year, self.month, self.day); },
        'getYear()I': (self) => (self.view?.year ?? self.year) | 0,
        'getMonth()I': (self) => (self.view?.month ?? self.month) | 0,
        'getDayOfMonth()I': (self) => (self.view?.day ?? self.day) | 0,
        'setEnabled(Z)V': (self, [value]) => { if (self.view) self.view.enabled = !!value; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/TimePicker;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/TimePicker;', 'Landroid/widget/FrameLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setOnTimeChangedListener(Landroid/widget/TimePicker$OnTimeChangedListener;)V': (self, [listener]) => { self.timeListener = listener; },
        'setCurrentHour(Ljava/lang/Integer;)V': (self, [hour]) => { self.hour = Number(hour) || 0; if (self.view) { self.view.hour = self.hour; self.view.invalidate?.(); } },
        'setCurrentMinute(Ljava/lang/Integer;)V': (self, [minute]) => { self.minute = Number(minute) || 0; if (self.view) { self.view.minute = self.minute; self.view.invalidate?.(); } },
        'getCurrentHour()Ljava/lang/Integer;': (self) => (self.view?.hour ?? self.hour) | 0,
        'getCurrentMinute()Ljava/lang/Integer;': (self) => (self.view?.minute ?? self.minute) | 0,
        'setIs24HourView(Ljava/lang/Boolean;)V': (self, [value]) => { self.is24Hour = !!value; },
        'is24HourView()Z': (self) => (self.is24Hour ? 1 : 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/SearchView;', {
      super: 'Landroid/widget/LinearLayout;',
      ctor: viewPeerConstructor('Landroid/widget/SearchView;', 'Landroid/widget/LinearLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setOnQueryTextListener(Landroid/widget/SearchView$OnQueryTextListener;)V': (self, [listener]) => { self.queryListener = listener; },
        'setOnCloseListener(Landroid/widget/SearchView$OnCloseListener;)V': (self, [listener]) => { self.closeListener = listener; },
        'setQuery(Ljava/lang/CharSequence;Z)V': (self, [query]) => {
          self.query = jsString(query);
          self.inputView ||= new EditText(self.vm?.contextObject || null);
          self.inputView.setText?.(self.query);
          self.view?.invalidate?.();
        },
        'setQuery(Ljava/lang/CharSequence;)V': (self, [query]) => { self.query = jsString(query); self.inputView?.setText?.(self.query); },
        'getQuery()Ljava/lang/CharSequence;': (self) => self.query ?? '',
        'setQueryHint(Ljava/lang/CharSequence;)V': (self, [hint]) => { self.hint = jsString(hint); },
        'getQueryHint()Ljava/lang/CharSequence;': (self) => self.hint ?? '',
        'setIconified(Z)V': (self, [value]) => { self.iconified = !!value; },
        'isIconified()Z': (self) => (self.iconified ? 1 : 0),
        'setIconifiedByDefault(Z)V': (self, [value]) => { self.iconifiedByDefault = !!value; },
        'clearFocus()V': () => undefined,
        'setSubmitButtonEnabled(Z)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Gallery;', {
      super: 'Landroid/widget/Spinner;',
      ctor: viewPeerConstructor('Landroid/widget/Gallery;', 'Landroid/widget/Spinner;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setSpacing(I)V': (self, [value]) => { self.spacing = value | 0; },
        'setUnselectedAlpha(F)V': (self, [value]) => { self.unselectedAlpha = Number(value) || 0; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/GridView;', {
      super: 'Landroid/widget/ListView;',
      ctor: viewPeerConstructor('Landroid/widget/GridView;', 'Landroid/widget/ListView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setNumColumns(I)V': (self, [columns]) => { self.numColumns = columns | 0; if (self.view) self.view.numColumns = columns | 0; self.view?.requestLayout?.(); },
        'getNumColumns()I': (self) => self.numColumns | 0,
        'setHorizontalSpacing(I)V': (self, [value]) => { self.horizontalSpacing = value | 0; },
        'setVerticalSpacing(I)V': (self, [value]) => { self.verticalSpacing = value | 0; },
        'setStretchMode(I)V': (self, [value]) => { self.stretchMode = value | 0; },
        'getStretchMode()I': (self) => self.stretchMode | 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ImageButton;', {
      super: 'Landroid/widget/ImageView;',
      ctor: viewPeerConstructor('Landroid/widget/ImageButton;', 'Landroid/widget/ImageView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self, _args, vm) => applyProgrammaticViewStyle(vm, self, 0),
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (self, args, vm) => applyProgrammaticViewStyle(vm, self, args?.[2] | 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ToggleButton;', {
      super: 'Landroid/widget/CompoundButton;',
      ctor: viewPeerConstructor('Landroid/widget/ToggleButton;', 'Landroid/widget/CompoundButton;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setTextOn(Ljava/lang/CharSequence;)V': (self, [text]) => { self.textOn = jsString(text); self.refreshToggle?.(); },
        'setTextOff(Ljava/lang/CharSequence;)V': (self, [text]) => { self.textOff = jsString(text); self.refreshToggle?.(); },
        'getTextOn()Ljava/lang/CharSequence;': (self) => self.textOn ?? 'ON',
        'getTextOff()Ljava/lang/CharSequence;': (self) => self.textOff ?? 'OFF',
        'setChecked(Z)V': (self, [value]) => {
          self.view.checked = !!value;
          self.view.setText?.(self.view.checked ? (self.textOn ?? 'ON') : (self.textOff ?? 'OFF'));
          self.view.invalidate?.();
        },
        'isChecked()Z': (self) => (self.view?.checked ? 1 : 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/RatingBar;', {
      super: 'Landroid/widget/ProgressBar;',
      ctor: viewPeerConstructor('Landroid/widget/RatingBar;', 'Landroid/widget/ProgressBar;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setNumStars(I)V': (self, [value]) => { self.numStars = value | 0; },
        'getNumStars()I': (self) => self.numStars | 0,
        'setRating(F)V': (self, [value]) => { self.rating = Number(value) || 0; self.view.progress = Math.round(self.rating); self.view.invalidate?.(); },
        'getRating()F': (self) => Number(self.rating) || 0,
        'setStepSize(F)V': (self, [value]) => { self.stepSize = Number(value) || 1; },
        'getStepSize()F': (self) => Number(self.stepSize) || 1,
        'setOnRatingBarChangeListener(Landroid/widget/RatingBar$OnRatingBarChangeListener;)V': (self, [listener]) => { self.ratingListener = listener; },
        'performClick()Z': (self, _args, vm) => {
          const stars = Math.max(1, self.numStars | 0 || 5);
          const step = Number(self.stepSize) || 1;
          const next = Math.min(stars, (Number(self.rating) || 0) + step);
          self.rating = next;
          if (self.view) { self.view.progress = Math.round(next); self.view.invalidate?.(); }
          try { vm.invokeInterface(self.ratingListener, 'onRatingChanged', '(Landroid/widget/RatingBar;FZ)V', [self.$object ?? self, next, true]); } catch (_) {}
          return true;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/SeekBar;', {
      super: 'Landroid/widget/ProgressBar;',
      ctor: viewPeerConstructor('Landroid/widget/SeekBar;', 'Landroid/widget/ProgressBar;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'setOnSeekBarChangeListener(Landroid/widget/SeekBar$OnSeekBarChangeListener;)V': (self, [listener]) => { self.seekListener = listener; },
        'getOnSeekBarChangeListener()Landroid/widget/SeekBar$OnSeekBarChangeListener;': (self) => self.seekListener ?? null,
        'performClick()Z': (self, _args, vm) => {
          if (!self.view) return false;
          const max = Math.max(1, self.view.max | 0);
          const next = Math.min(max, (self.view.progress | 0) + Math.ceil(max / 10));
          self.view.progress = next;
          self.view.invalidate?.();
          try {
            vm.invokeInterface(self.seekListener, 'onProgressChanged', '(Landroid/widget/SeekBar;IZ)V', [self.$object ?? self, next, true]);
            vm.invokeInterface(self.seekListener, 'onStartTrackingTouch', '(Landroid/widget/SeekBar;)V', [self.$object ?? self]);
            vm.invokeInterface(self.seekListener, 'onStopTrackingTouch', '(Landroid/widget/SeekBar;)V', [self.$object ?? self]);
          } catch (_) {}
          return true;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/CheckBox;', {
      super: 'Landroid/widget/CompoundButton;',
      ctor: viewPeerConstructor('Landroid/widget/CheckBox;', 'Landroid/widget/CompoundButton;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/RadioButton;', {
      super: 'Landroid/widget/CompoundButton;',
      ctor: viewPeerConstructor('Landroid/widget/RadioButton;', 'Landroid/widget/CompoundButton;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': () => undefined,
        'performClick()Z': (self, _args, vm) => {
          if (!self.view) return false;
          self.view.checked = true;
          self.view.invalidate?.();
          const group = self.view.parent;
          if (group) {
            group.checkedId = self.view.id | 0;
            const peer = group.$javaObject;
            const listener = peer?.selectionListener || group.selectionListener;
            try { vm.invokeInterface(listener, 'onCheckedChanged', '(Landroid/widget/RadioGroup;I)V', [peer ?? null, group.checkedId]); } catch (_) {}
          }
          return true;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/RadioGroup;', {
      super: 'Landroid/widget/LinearLayout;',
      ctor: viewPeerConstructor('Landroid/widget/RadioGroup;', 'Landroid/widget/LinearLayout;'),
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'setOnCheckedChangeListener(Landroid/widget/RadioGroup$OnCheckedChangeListener;)V': (self, [listener]) => { self.selectionListener = listener; if (self.view) self.view.selectionListener = listener; },
        'getCheckedRadioButtonId()I': (self) => (self.view?.checkedId | 0),
        'check(I)V': (self, [id], vm) => {
          if (!self.view) return;
          self.view.checkedId = id | 0;
          for (const child of self.view.children || []) {
            if ((child.id | 0) === (id | 0)) child.checked = true;
          }
          try { vm.invokeInterface(self.selectionListener, 'onCheckedChanged', '(Landroid/widget/RadioGroup;I)V', [self.$object ?? self, id | 0]); } catch (_) {}
        },
        'clearCheck()V': (self) => {
          if (!self.view) return;
          self.view.checkedId = -1;
          for (const child of self.view.children || []) child.checked = false;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Spinner;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/Spinner;', 'Landroid/widget/TextView;'),
      methods: {
        '<init>(Landroid/content/Context;)V': (self) => { if (self.view) self.view.clickable = true; },
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self) => { if (self.view) self.view.clickable = true; },
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (self) => { if (self.view) self.view.clickable = true; },
        '<init>(Landroid/content/Context;I)V': (self) => { if (self.view) self.view.clickable = true; },
        'setAdapter(Landroid/widget/SpinnerAdapter;)V': (self, [adapter], vm) => {
          self.adapter = adapter ?? null;
          self.selectedPosition = 0;
          if (adapter) {
            try { self.count = Number(vm.invokeByName('getCount', '()I', adapter, [])) || 0; } catch (_) { self.count = 0; }
            try { self.view?.setText?.(jsString(vm.invokeByName('getItem', '(I)Ljava/lang/Object;', adapter, [0]))); } catch (_) {}
          }
        },
        'getAdapter()Landroid/widget/SpinnerAdapter;': (self) => self.adapter ?? null,
        'getCount()I': (self) => self.count | 0,
        'getSelectedItemPosition()I': (self) => self.selectedPosition | 0,
        'getSelectedItem()Ljava/lang/Object;': (self, _args, vm) => {
          if (!self.adapter) return null;
          try { return vm.invokeByName('getItem', '(I)Ljava/lang/Object;', self.adapter, [self.selectedPosition | 0]); } catch (_) { return null; }
        },
        'setSelection(I)V': (self, [position]) => { self.selectedPosition = position | 0; },
        'setOnItemSelectedListener(Landroid/widget/AdapterView$OnItemSelectedListener;)V': (self, [listener]) => { self.selectionListener = listener; },
        'getOnItemSelectedListener()Landroid/widget/AdapterView$OnItemSelectedListener;': (self) => self.selectionListener ?? null,
        'performClick()Z': (self, _args, vm) => {
          const count = self.count | 0;
          if (count <= 0) return false;
          const items = [];
          for (let index = 0; index < count; index += 1) {
            try { items.push(jsString(vm.invokeByName('getItem', '(I)Ljava/lang/Object;', self.adapter, [index]))); } catch (_) { items.push(String(index)); }
          }
          const dialogPeer = {
            vm,
            title: self.hint ?? '',
            items,
            cancelable: true,
            onItemSelected: (index) => {
              self.selectedPosition = index | 0;
              try {
                const item = vm.invokeByName('getItem', '(I)Ljava/lang/Object;', self.adapter, [index]);
                self.view?.setText?.(jsString(item));
                self.view?.invalidate?.();
                vm.invokeInterface(self.selectionListener, 'onItemSelected', '(Landroid/widget/AdapterView;Landroid/view/View;IJ)V', [self.$object ?? self, null, index, BigInt(index)]);
              } catch (_) {}
            },
          };
          dialogShow(dialogPeer);
          return true;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ArrayAdapter;', {
      super: 'Landroid/widget/BaseAdapter;',
      ctor: class ArrayAdapterPeer {
        constructor() { this.objects = []; this.$dirty = 0; }
      },
      methods: {
        '<init>(Landroid/content/Context;I)V': (self, [context]) => { self.context = context ?? null; self.objects = []; },
        '<init>(Landroid/content/Context;II)V': (self, [context]) => { self.context = context ?? null; self.objects = []; },
        '<init>(Landroid/content/Context;ILjava/util/List;)V': (self, [context, _resource, list]) => {
          self.context = context ?? null;
          self.objects = [...(list?.$peer?.items || list?.items || [])];
        },
        '<init>(Landroid/content/Context;I[Ljava/lang/Object;)V': (self, [context, _resource, array]) => {
          self.context = context ?? null;
          self.objects = Array.from(array?.$data || array || []);
        },
        '<init>(Landroid/content/Context;IILjava/util/List;)V': (self, [context, _resource, _textViewResourceId, list]) => {
          self.context = context ?? null;
          self.objects = [...(list?.$peer?.items || list?.items || [])];
        },
        'getCount()I': (self) => (self.objects || []).length,
        'getItem(I)Ljava/lang/Object;': (self, [position]) => (self.objects || [])[position | 0] ?? null,
        'getItemId(I)J': (_self, [position]) => BigInt(position | 0),
        'getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': (self, [position, convertView, _parent], vm) => {
          let view = unwrapView(convertView);
          if (!view) {
            view = new TextView(self.context ?? null);
            view.setPadding?.(16, 12, 16, 12);
            view.setTextSize?.(16);
          }
          const value = (self.objects || [])[position | 0];
          view.setText?.(value === null || value === undefined ? '' : jsString(value));
          return viewObject(vm, view);
        },
        'add(Ljava/lang/Object;)V': (self, [value]) => { self.objects.push(value); self.$dirty++; },
        'addAll(Ljava/util/Collection;)V': (self, [collection]) => { self.objects.push(...(collection?.$peer?.items || [])); self.$dirty++; },
        'insert(Ljava/lang/Object;I)V': (self, [value, index]) => { self.objects.splice(index | 0, 0, value); self.$dirty++; },
        'remove(Ljava/lang/Object;)V': (self, [value]) => { const i = self.objects.indexOf(value); if (i >= 0) self.objects.splice(i, 1); self.$dirty++; },
        'clear()V': (self) => { self.objects = []; self.$dirty++; },
        'getPosition(Ljava/lang/Object;)I': (self, [value]) => self.objects.indexOf(value),
        'getFilter()Landroid/widget/Filter;': () => null,
        'notifyDataSetChanged()V': (self) => { self.$dirty++; },
        'setNotifyOnChange(Z)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/BaseAdapter;', {
      super: 'Ljava/lang/Object;',
      interfaces: ['Landroid/widget/ListAdapter;', 'Landroid/widget/SpinnerAdapter;'],
      methods: {
        'getCount()I': () => 0,
        'getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
        'getItem(I)Ljava/lang/Object;': () => null,
        'getItemId(I)J': (_self, [position]) => position | 0,
        'getDropDownView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
        'hasStableIds()Z': () => false,
        'getItemViewType(I)I': () => 0,
        'getViewTypeCount()I': () => 1,
        'isEmpty()Z': (self, _args, vm) => {
          const count = vm.invokeByName('getCount', '()I', self.$object || self, []);
          return !(Number(count) > 0);
        },
        'areAllItemsEnabled()Z': () => true,
        'isEnabled(I)Z': () => true,
        'registerDataSetObserver(Landroid/database/DataSetObserver;)V': (self, [observer]) => {
          if (!observer) return;
          if (!self.observers) self.observers = new Set();
          self.observers.add(observer);
        },
        'unregisterDataSetObserver(Landroid/database/DataSetObserver;)V': (self, [observer]) => {
          self.observers?.delete(observer);
        },
        'notifyDataSetChanged()V': (self, _args, vm) => {
          self.$dirty = (self.$dirty | 0) + 1;
          for (const observer of self.observers || []) {
            try {
              vm.invoke({ classDesc: 'Landroid/database/DataSetObserver;', name: 'onChanged', proto: { descriptor: '()V', parameters: [], returnType: 'V' } }, observer, [], 'virtual');
            } catch (_) {
              // 忽略观察者异常
            }
          }
        },
        'notifyDataSetInvalidated()V': (self) => { self.$dirty = (self.$dirty | 0) + 1; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AdapterView;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/AdapterView;'),
      methods: {
        ...viewMethods(),
        'getAdapter()Landroid/widget/Adapter;': (self) => self.view?.adapter ?? null,
        'setAdapter(Landroid/widget/Adapter;)V': (self, [adapter]) => {
          if (!self.view) return;
          self.view.adapter = adapter;
          self.view.$itemCount = -1;
          self.view.requestLayout?.();
        },
        'getCount()I': (self) => self.view?.adapterCount?.() ?? 0,
        'getItemAtPosition(I)Ljava/lang/Object;': (self, [position], vm) => {
          const view = self.view;
          if (!view?.adapter) return null;
          return vm.invokeByName('getItem', '(I)Ljava/lang/Object;', view.adapter, [position | 0]);
        },
        'getItemIdAtPosition(I)J': (self, [position], vm) => {
          const view = self.view;
          if (!view?.adapter) return position | 0;
          return vm.invokeByName('getItemId', '(I)J', view.adapter, [position | 0]);
        },
        'performItemClick(Landroid/view/View;IJ)Z': (self, [_view, position]) => {
          return self.view?.performItemClick?.(position | 0) ?? false;
        },
        'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onItemClickListener = listener;
        },
        'getOnItemClickListener()Landroid/widget/AdapterView$OnItemClickListener;': (self) => self.view?.$onItemClickListener ?? null,
        'setOnItemSelectedListener(Landroid/widget/AdapterView$OnItemSelectedListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onItemSelectedListener = listener;
        },
        'getOnItemSelectedListener()Landroid/widget/AdapterView$OnItemSelectedListener;': (self) => self.view?.$onItemSelectedListener ?? null,
        'getSelectedItemPosition()I': () => -1,
        'getSelectedItemId()J': () => 0,
        'getFirstVisiblePosition()I': (self) => self.view?.firstVisiblePosition?.() ?? 0,
        'getLastVisiblePosition()I': (self) => self.view?.lastVisiblePosition?.() ?? Math.max(0, (self.view?.$items?.length ?? 1) - 1),
        'getChildCount()I': (self) => self.view?.$items?.length ?? 0,
        'getChildAt(I)Landroid/view/View;': (self, [index]) => self.view?.$items?.[index | 0]?.$javaObject ?? null,
        'getPositionForView(Landroid/view/View;)I': () => -1,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AbsListView;', {
      super: 'Landroid/widget/AdapterView;',
      ctor: viewPeerConstructor('Landroid/widget/AbsListView;'),
      methods: {
        ...viewMethods(),
        'setAdapter(Landroid/widget/ListAdapter;)V': (self, [adapter]) => {
          if (!self.view) return;
          self.view.adapter = adapter;
          self.view.$itemCount = -1;
          self.view.requestLayout?.();
        },
        'getAdapter()Landroid/widget/ListAdapter;': (self) => self.view?.adapter ?? null,
        'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onItemClickListener = listener;
        },
        'getOnItemClickListener()Landroid/widget/AdapterView$OnItemClickListener;': (self) => self.view?.$onItemClickListener ?? null,
        'setOnScrollListener(Landroid/widget/AbsListView$OnScrollListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onScrollListener = listener;
        },
        'setSelection(I)V': (self, [index]) => {
          self.view?.setSelection?.(index | 0);
        },
        'getSelectedItemPosition()I': (self) => self.view?.$selectedPosition ?? -1,
        'setSelectionFromTop(II)V': (self, [position, y]) => {
          self.view?.setSelectionFromTop?.(position | 0, y | 0);
        },
        'smoothScrollToPositionFromTop(III)V': (self, [position, y]) => {
          self.view?.setSelectionFromTop?.(position | 0, y | 0);
        },
        'smoothScrollToPosition(I)V': () => undefined,
        'setDivider(Landroid/graphics/drawable/Drawable;)V': (self, [divider]) => {
          if (self.view) self.view.divider = divider;
        },
        'setDividerHeight(I)V': (self, [height]) => {
          if (self.view) self.view.dividerHeight = height | 0;
        },
        'setSelector(Landroid/graphics/drawable/Drawable;)V': (self, [selector]) => {
          if (self.view) self.view.selector = selector;
        },
        'setCacheColorHint(I)V': () => undefined,
        'setScrollingCacheEnabled(Z)V': () => undefined,
        'setTextFilterEnabled(Z)V': () => undefined,
        'setFastScrollEnabled(Z)V': () => undefined,
        'setVerticalScrollBarEnabled(Z)V': (self, [enabled]) => self.view?.setVerticalScrollBarEnabled?.(!!enabled),
        'setHorizontalScrollBarEnabled(Z)V': (self, [enabled]) => self.view?.setHorizontalScrollBarEnabled?.(!!enabled),
        'setScrollbarFadingEnabled(Z)V': (self, [enabled]) => self.view?.setScrollbarFadingEnabled?.(!!enabled),
        'setTranscriptMode(I)V': () => undefined,
        'setStackFromBottom(Z)V': () => undefined,
        'setItemsCanFocus(Z)V': () => undefined,
        'setChoiceMode(I)V': (self, [mode]) => {
          if (!self.view) return;
          self.view.choiceMode = mode | 0;
          // CHOICE_MODE_NONE 会顺带清空已有选中项，和 AOSP 一致。
          if ((mode | 0) === 0) self.view.clearChoices?.();
        },
        'getChoiceMode()I': (self) => self.view?.choiceMode ?? 0,
        'clearChoices()V': (self) => { self.view?.clearChoices?.(); },
        'setItemChecked(IZ)V': (self, [position, checked]) => {
          self.view?.setItemChecked?.(position | 0, !!checked);
        },
        'isItemChecked(I)Z': (self, [position]) => (self.view?.isItemChecked?.(position | 0) ? 1 : 0),
        'getCheckedItemPosition()I': (self) => self.view?.getCheckedItemPosition?.() ?? -1,
        'getCheckedItemCount()I': (self) => self.view?.getCheckedItemCount?.() ?? 0,
        'setEmptyView(Landroid/view/View;)V': () => undefined,
        'getEmptyView()Landroid/view/View;': () => null,
        'getCount()I': (self) => self.view?.adapterCount?.() ?? 0,
        'getChildCount()I': (self) => self.view?.$items?.length ?? 0,
        'getChildAt(I)Landroid/view/View;': (self, [index]) => self.view?.$items?.[index | 0]?.$javaObject ?? null,
        'getFirstVisiblePosition()I': () => 0,
        'getLastVisiblePosition()I': (self) => Math.max(0, (self.view?.$items?.length ?? 1) - 1),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ListView;', {
      super: 'Landroid/widget/AbsListView;',
      ctor: viewPeerConstructor('Landroid/widget/ListView;'),
      methods: {
        ...viewMethods(),
        'setAdapter(Landroid/widget/ListAdapter;)V': (self, [adapter]) => {
          if (!self.view) return;
          self.view.adapter = adapter;
          self.view.$itemCount = -1;
          self.view.requestLayout?.();
        },
        'getAdapter()Landroid/widget/ListAdapter;': (self) => self.view?.adapter ?? null,
        'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onItemClickListener = listener;
        },
        'getOnItemClickListener()Landroid/widget/AdapterView$OnItemClickListener;': (self) => self.view?.$onItemClickListener ?? null,
        'setOnItemSelectedListener(Landroid/widget/AdapterView$OnItemSelectedListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onItemSelectedListener = listener;
        },
        'setOnScrollListener(Landroid/widget/AbsListView$OnScrollListener;)V': (self, [listener]) => {
          if (self.view) self.view.$onScrollListener = listener;
        },
        'getCount()I': (self) => self.view?.adapterCount?.() ?? 0,
        'getItemAtPosition(I)Ljava/lang/Object;': (self, [position], vm) => {
          const view = self.view;
          if (!view?.adapter) return null;
          return vm.invokeByName('getItem', '(I)Ljava/lang/Object;', view.adapter, [position | 0]);
        },
        'getItemIdAtPosition(I)J': (self, [position], vm) => {
          const view = self.view;
          if (!view?.adapter) return position | 0;
          return vm.invokeByName('getItemId', '(I)J', view.adapter, [position | 0]);
        },
        'performItemClick(Landroid/view/View;IJ)Z': (self, [_view, position]) => {
          return self.view?.performItemClick?.(position | 0) ?? false;
        },
        'getFirstVisiblePosition()I': (self) => self.view?.firstVisiblePosition?.() ?? 0,
        'getLastVisiblePosition()I': (self) => self.view?.lastVisiblePosition?.() ?? 0,
        'setSelection(I)V': (self, [index]) => {
          self.view?.setSelection?.(index | 0);
        },
        'getSelectedItemPosition()I': (self) => self.view?.$selectedPosition ?? -1,
        'smoothScrollToPosition(I)V': () => undefined,
        'setDivider(Landroid/graphics/drawable/Drawable;)V': (self, [divider]) => {
          if (self.view) self.view.divider = divider;
        },
        'setDividerHeight(I)V': (self, [height]) => {
          if (self.view) self.view.dividerHeight = height | 0;
        },
        'setSelector(Landroid/graphics/drawable/Drawable;)V': (self, [selector]) => {
          if (self.view) self.view.selector = selector;
        },
        'setDrawSelectorOnTop(Z)V': () => undefined,
        'setCacheColorHint(I)V': () => undefined,
        'setScrollingCacheEnabled(Z)V': () => undefined,
        'setTextFilterEnabled(Z)V': () => undefined,
        'setFastScrollEnabled(Z)V': () => undefined,
        'setVerticalScrollBarEnabled(Z)V': (self, [enabled]) => self.view?.setVerticalScrollBarEnabled?.(!!enabled),
        'setHorizontalScrollBarEnabled(Z)V': (self, [enabled]) => self.view?.setHorizontalScrollBarEnabled?.(!!enabled),
        'setScrollbarFadingEnabled(Z)V': (self, [enabled]) => self.view?.setScrollbarFadingEnabled?.(!!enabled),
        'setTranscriptMode(I)V': () => undefined,
        'setStackFromBottom(Z)V': () => undefined,
        'setItemsCanFocus(Z)V': () => undefined,
        'setChoiceMode(I)V': (self, [mode]) => {
          if (!self.view) return;
          self.view.choiceMode = mode | 0;
          // CHOICE_MODE_NONE 会顺带清空已有选中项，和 AOSP 一致。
          if ((mode | 0) === 0) self.view.clearChoices?.();
        },
        'getChoiceMode()I': (self) => self.view?.choiceMode ?? 0,
        'clearChoices()V': (self) => { self.view?.clearChoices?.(); },
        'setItemChecked(IZ)V': (self, [position, checked]) => {
          self.view?.setItemChecked?.(position | 0, !!checked);
        },
        'isItemChecked(I)Z': (self, [position]) => (self.view?.isItemChecked?.(position | 0) ? 1 : 0),
        'getCheckedItemPosition()I': (self) => self.view?.getCheckedItemPosition?.() ?? -1,
        'getCheckedItemCount()I': (self) => self.view?.getCheckedItemCount?.() ?? 0,
        'setEmptyView(Landroid/view/View;)V': () => undefined,
        'getEmptyView()Landroid/view/View;': () => null,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/HorizontalScrollView;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/HorizontalScrollView;'),
      methods: {
        ...viewMethods(),
        'scrollTo(II)V': (self, [x, y]) => self.view?.scrollTo?.(x, y),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ProgressBar;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/ProgressBar;'),
      methods: {
        'setProgress(I)V': (self, [value]) => self.view?.setProgress?.(value),
        'getProgress()I': (self) => self.view?.progress ?? 0,
        'setMax(I)V': (self, [value]) => self.view?.setMax?.(value),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View$OnClickListener;', {
      super: null,
      methods: {
        'onClick(Landroid/view/View;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View$OnLongClickListener;', { super: null })
  );

  defs.push(
    nativeDef('Landroid/widget/RelativeLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class RelativeLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
          }
          object.$layoutParams.rules ||= {};
        }
        get rules() { return this.object.$layoutParams.rules; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.rules ||= {};
        },
        'addRule(I)V': (self, [rule]) => {
          self.object.$layoutParams.rules[ruleVerb(rule)] = true;
        },
        'addRule(II)V': (self, [rule, subject]) => {
          self.object.$layoutParams.rules[ruleVerb(rule)] = subject >>> 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/LinearLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class LinearLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0, weight: 0, gravity: -1 };
          }
        }
        get weight() { return this.object.$layoutParams.weight || 0; }
        set weight(v) { this.object.$layoutParams.weight = Number(v) || 0; }
        get gravity() { return this.object.$layoutParams.gravity ?? -1; }
        set gravity(v) { this.object.$layoutParams.gravity = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
        },
        '<init>(IIF)V': (self, [w, h, weight]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.weight = Number(weight) || 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/FrameLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class FrameLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0, gravity: -1 };
          }
        }
        get gravity() { return this.object.$layoutParams.gravity ?? -1; }
        set gravity(v) { this.object.$layoutParams.gravity = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
        },
        '<init>(III)V': (self, [w, h, gravity]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.gravity = gravity | 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/AbsoluteLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$LayoutParams;',
      ctor: class AbsoluteLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) object.$layoutParams = { width: -2, height: -2, x: 0, y: 0 };
        }
        get x() { return this.object.$layoutParams.x | 0; }
        set x(v) { this.object.$layoutParams.x = v | 0; }
        get y() { return this.object.$layoutParams.y | 0; }
        set y(v) { this.object.$layoutParams.y = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
        },
        '<init>(IIII)V': (self, [w, h, x, y]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.x = x | 0;
          p.y = y | 0;
        },
      },
      instanceFields: new Map([
        ['x:I', 0],
        ['y:I', 0],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/MotionEvent;', {
      super: 'Ljava/lang/Object;',
      ctor: class MotionEventPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.action = 0;
          this.x = 0;
          this.y = 0;
          this.rawX = 0;
          this.rawY = 0;
          this.downTime = 0;
          this.eventTime = 0;
          this.edgeFlags = 0;
          this.source = 0;
          this.pointerCount = 1;
          this.pointerIds = [0];
          this.axisValues = null;
        }
      },
      methods: {
        'getAction()I': (self) => toInt(self.action),
        'getActionMasked()I': (self) => toInt(self.action) & 0xff,
        'getActionIndex()I': (self) => (toInt(self.action) & 0xff00) >> 8,
        'getX()F': (self) => Number(self.x) || 0,
        'getY()F': (self) => Number(self.y) || 0,
        'getRawX()F': (self) => (self.rawX !== undefined && self.rawX !== null ? Number(self.rawX) : Number(self.x)) || 0,
        'getRawY()F': (self) => (self.rawY !== undefined && self.rawY !== null ? Number(self.rawY) : Number(self.y)) || 0,
        'getX(I)F': (self, [index]) => {
          const i = toInt(index);
          if (i === 0) return Number(self.x) || 0;
          return Number(self.pointerXs?.[i]) || 0;
        },
        'getY(I)F': (self, [index]) => {
          const i = toInt(index);
          if (i === 0) return Number(self.y) || 0;
          return Number(self.pointerYs?.[i]) || 0;
        },
        'getPointerCount()I': (self) => Math.max(1, toInt(self.pointerCount) || (self.pointerIds?.length ?? 1)),
        'getPointerId(I)I': (self, [index]) => {
          const i = toInt(index);
          return toInt(self.pointerIds?.[i] ?? i);
        },
        'findPointerIndex(I)I': (self, [pointerId]) => {
          const id = toInt(pointerId);
          const ids = Array.isArray(self.pointerIds) ? self.pointerIds : [0];
          const index = ids.findIndex((value) => toInt(value) === id);
          return index >= 0 ? index : -1;
        },
        'getDownTime()J': (self) => BigInt(Math.trunc(Number(self.downTime) || 0)),
        'getEventTime()J': (self) => BigInt(Math.trunc(Number(self.eventTime) || 0)),
        'getEdgeFlags()I': (self) => toInt(self.edgeFlags),
        'getSource()I': (self) => toInt(self.source),
        'getAxisValue(I)F': (self, [axis]) => {
          const values = self.axisValues;
          if (!values) return 0;
          const value = values instanceof Map ? values.get(toInt(axis)) : values[toInt(axis)];
          return Number(value) || 0;
        },
        'getAxisValue(II)F': (self, [axis]) => {
          const values = self.axisValues;
          if (!values) return 0;
          const value = values instanceof Map ? values.get(toInt(axis)) : values[toInt(axis)];
          return Number(value) || 0;
        },
        'setLocation(FF)V': (self, [x, y]) => {
          self.x = Number(x) || 0;
          self.y = Number(y) || 0;
        },
        'offsetLocation(FF)V': (self, [dx, dy]) => {
          self.x = (Number(self.x) || 0) + (Number(dx) || 0);
          self.y = (Number(self.y) || 0) + (Number(dy) || 0);
        },
        'transform(Landroid/graphics/Matrix;)V': () => undefined,
        'recycle()V': () => undefined,

        // —— 设备 / 精度 / 按键状态 ——
        'getDeviceId()I': () => 0,
        'getPressure()F': (self) => Number(self.pressure ?? 1) || 0,
        'getPressure(I)F': (self) => Number(self.pressure ?? 1) || 0,
        'getSize()F': (self) => Number(self.size ?? 1) || 0,
        'getSize(I)F': (self) => Number(self.size ?? 1) || 0,
        'getTouchMajor()F': (self) => Number(self.touchMajor ?? 0) || 0,
        'getTouchMajor(I)F': (self) => Number(self.touchMajor ?? 0) || 0,
        'getTouchMinor()F': (self) => Number(self.touchMinor ?? 0) || 0,
        'getTouchMinor(I)F': (self) => Number(self.touchMinor ?? 0) || 0,
        'getToolMajor()F': (self) => Number(self.toolMajor ?? 0) || 0,
        'getToolMajor(I)F': (self) => Number(self.toolMajor ?? 0) || 0,
        'getToolMinor()F': (self) => Number(self.toolMinor ?? 0) || 0,
        'getToolMinor(I)F': (self) => Number(self.toolMinor ?? 0) || 0,
        'getOrientation()F': () => 0,
        'getOrientation(I)F': () => 0,
        'getMetaState()I': (self) => toInt(self.metaState ?? 0),
        'getButtonState()I': (self) => toInt(self.buttonState ?? 0),
        'getActionButton()I': () => 0,
        'getClassification()I': () => 0,
        'getFlags()I': (self) => toInt(self.flags ?? 0),
        'getRawY(I)F': (self, [index]) => Number(self.pointerYs?.[toInt(index)] ?? self.rawY ?? self.y) || 0,
        'getRawX(I)F': (self, [index]) => Number(self.pointerXs?.[toInt(index)] ?? self.rawX ?? self.x) || 0,
        'getXPrecision()F': () => 1,
        'getYPrecision()F': () => 1,
        'getPointerCoords(ILandroid/view/MotionEvent$PointerCoords;)V': (self, [index, out]) => {
          if (!out) return;
          const i = toInt(index);
          const peer = out.$peer ?? out;
          peer.x = i === 0 ? Number(self.x) || 0 : Number(self.pointerXs?.[i]) || 0;
          peer.y = i === 0 ? Number(self.y) || 0 : Number(self.pointerYs?.[i]) || 0;
          peer.pressure = 1;
          peer.size = 1;
          peer.touchMajor = 0;
          peer.touchMinor = 0;
          peer.toolMajor = 0;
          peer.toolMinor = 0;
          peer.orientation = 0;
        },
        'getPointerProperties(ILandroid/view/MotionEvent$PointerProperties;)V': (self, [index, out]) => {
          if (!out) return;
          const i = toInt(index);
          const peer = out.$peer ?? out;
          peer.id = toInt(self.pointerIds?.[i] ?? i);
          peer.toolType = toInt(self.toolType ?? 1);
        },
        'isButtonPressed(I)Z': () => false,
        'setEdgeFlags(I)V': (self, [flags]) => { self.edgeFlags = toInt(flags); },

        // —— 历史采样（模拟器不累积历史，返回空序列） ——
        'getHistorySize()I': (self) => (Array.isArray(self.history) ? self.history.length : 0),
        'getHistoricalX(II)F': () => 0,
        'getHistoricalY(II)F': () => 0,
        'getHistoricalPressure(I)F': () => 0,
        'getHistoricalPressure(II)F': () => 0,
        'getHistoricalTouchMajor(I)F': () => 0,
        'getHistoricalSize(I)F': () => 0,
        'getHistoricalSize(II)F': () => 0,
        'getHistoricalTouchMajor(II)F': () => 0,
        'getHistoricalTouchMinor(I)F': () => 0,
        'getHistoricalTouchMinor(II)F': () => 0,
        'getHistoricalToolMajor(I)F': () => 0,
        'getHistoricalToolMajor(II)F': () => 0,
        'getHistoricalToolMinor(I)F': () => 0,
        'getHistoricalToolMinor(II)F': () => 0,
        'getHistoricalOrientation(I)F': () => 0,
        'getHistoricalOrientation(II)F': () => 0,
        'getHistoricalAxisValue(II)F': () => 0,
        'getHistoricalAxisValue(III)F': () => 0,
        'getHistoricalRawX(II)F': () => 0,
        'getHistoricalRawY(II)F': () => 0,
        'getHistoricalPointerCoords(IILandroid/view/MotionEvent$PointerCoords;)V': () => undefined,
        'addBatch(JFFIJ)V': () => undefined,
        'addBatch(JFFIJI)V': () => undefined,
        'addBatch(JFFFFI)V': () => undefined,
        'addBatch(J[Landroid/view/MotionEvent$PointerCoords;I)V': () => undefined,
        'writeToParcel(Landroid/os/Parcel;I)V': () => undefined,

        // —— 描述 ——
        'toString()Ljava/lang/String;': (self) => `MotionEvent { action=${toInt(self.action)} x=${Number(self.x) || 0} y=${Number(self.y) || 0} }`,
        'finalize()V': () => undefined,
      },
      staticMethods: {
        'obtain(JJIFFI)Landroid/view/MotionEvent;': (_self, [downTime, eventTime, action, x, y, edgeFlags], vm) =>
          createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            x: Number(x),
            y: Number(y),
            edgeFlags: Number(edgeFlags),
          }),
        'obtain(Landroid/view/MotionEvent;)Landroid/view/MotionEvent;': (_self, [source], vm) =>
          createMotionEventObject(vm, source?.$peer || source || {}),
        'obtainNoHistory(Landroid/view/MotionEvent;)Landroid/view/MotionEvent;': (_self, [source], vm) =>
          createMotionEventObject(vm, source?.$peer || source || {}),
        'obtain(JJIFFIIIIIIIIIIIIII)V': (_self, [downTime, eventTime, action, x, y, metaState, buttonState], vm) =>
          createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            x: Number(x),
            y: Number(y),
            metaState: Number(metaState),
            buttonState: Number(buttonState),
          }),
        'obtain(JJIIIIIIIIIIIIII)V': (_self, [downTime, eventTime, action, pointerCount], vm) =>
          createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            pointerCount: Number(pointerCount),
          }),
        'obtain(JJIFFFFIFFII)Landroid/view/MotionEvent;': (_self, [downTime, eventTime, action, x, y, pressure, size, metaState, xPrecision, yPrecision, deviceId, edgeFlags], vm) =>
          createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            x: Number(x),
            y: Number(y),
            pressure: Number(pressure),
            size: Number(size),
            metaState: Number(metaState),
            xPrecision: Number(xPrecision),
            yPrecision: Number(yPrecision),
            deviceId: Number(deviceId),
            edgeFlags: Number(edgeFlags),
          }),
        'obtain(JJII[Landroid/view/MotionEvent$PointerProperties;[Landroid/view/MotionEvent$PointerCoords;IIFFIIII)Landroid/view/MotionEvent;': (_self, [downTime, eventTime, action, pointerCount, properties, coords], vm) => {
          const event = createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            pointerCount: Number(pointerCount),
          });
          const peer = event?.$peer;
          if (peer) {
            const items = coords?.$data || [];
            const first = items[0]?.$peer ?? items[0];
            if (first) {
              peer.x = Number(first.x) || 0;
              peer.y = Number(first.y) || 0;
              peer.pointerXs = items.map((item) => Number((item?.$peer ?? item)?.x) || 0);
              peer.pointerYs = items.map((item) => Number((item?.$peer ?? item)?.y) || 0);
            }
            const props = properties?.$data || [];
            if (props.length) peer.pointerIds = props.map((item) => toInt((item?.$peer ?? item)?.id));
          }
          return event;
        },
        'obtain(JJIIFFFFIFFII)Landroid/view/MotionEvent;': (_self, [downTime, eventTime, action, pointerCount, x, y, pressure, size, metaState, xPrecision, yPrecision, deviceId, edgeFlags], vm) =>
          createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            pointerCount: Number(pointerCount),
            x: Number(x),
            y: Number(y),
            pressure: Number(pressure),
            size: Number(size),
            metaState: Number(metaState),
            xPrecision: Number(xPrecision),
            yPrecision: Number(yPrecision),
            deviceId: Number(deviceId),
            edgeFlags: Number(edgeFlags),
          }),
        'obtain(JJII[I[Landroid/view/MotionEvent$PointerCoords;IFFIIII)Landroid/view/MotionEvent;': (_self, [downTime, eventTime, action, pointerCount, pointerIds, coords], vm) => {
          const event = createMotionEventObject(vm, {
            downTime: Number(downTime),
            eventTime: Number(eventTime),
            action: Number(action),
            pointerCount: Number(pointerCount),
          });
          const peer = event?.$peer;
          if (peer) {
            const ids = pointerIds?.$data || [];
            if (ids.length) peer.pointerIds = ids.map((value) => toInt(value));
            const items = coords?.$data || [];
            if (items.length) {
              const first = items[0]?.$peer ?? items[0];
              peer.x = Number(first?.x) || 0;
              peer.y = Number(first?.y) || 0;
              peer.pointerXs = items.map((item) => Number((item?.$peer ?? item)?.x) || 0);
              peer.pointerYs = items.map((item) => Number((item?.$peer ?? item)?.y) || 0);
            }
          }
          return event;
        },
        'actionToString(I)Ljava/lang/String;': (_self, [action]) => {
          const names = ['ACTION_DOWN', 'ACTION_UP', 'ACTION_MOVE', 'ACTION_CANCEL', 'ACTION_OUTSIDE', 'ACTION_POINTER_DOWN', 'ACTION_POINTER_UP', 'ACTION_HOVER_MOVE', 'ACTION_SCROLL'];
          const masked = toInt(action) & 0xff;
          return names[masked] ?? `ACTION_${masked}`;
        },
        'axisToString(I)Ljava/lang/String;': (_self, [axis]) => `AXIS_${toInt(axis)}`,
        'axisFromString(Ljava/lang/String;)I': () => -1,
      },
      staticFields: new Map([
        ['ACTION_DOWN:I', 0],
        ['ACTION_UP:I', 1],
        ['ACTION_MOVE:I', 2],
        ['ACTION_CANCEL:I', 3],
        ['ACTION_OUTSIDE:I', 4],
        ['ACTION_POINTER_DOWN:I', 5],
        ['ACTION_POINTER_UP:I', 6],
        ['ACTION_SCROLL:I', 8],
        ['ACTION_MASK:I', 0xff],
        ['ACTION_POINTER_INDEX_MASK:I', 0xff00],
        ['ACTION_POINTER_INDEX_SHIFT:I', 8],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/VelocityTracker;', {
      super: 'Ljava/lang/Object;',
      ctor: class VelocityTrackerPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.samples = [];
          this.xVelocity = 0;
          this.yVelocity = 0;
        }
      },
      methods: {
        'addMovement(Landroid/view/MotionEvent;)V': (self, [event]) => {
          const peer = event?.$peer || event;
          if (!peer || typeof peer !== 'object') return;
          const eventTime = Number(peer.eventTime);
          if (!Number.isFinite(eventTime) || eventTime <= 0) return;
          self.samples.push({
            t: eventTime,
            x: Number(peer.x) || 0,
            y: Number(peer.y) || 0,
          });
          if (self.samples.length > 20) self.samples.shift();
        },
        'computeCurrentVelocity(I)V': (self, [units]) => computeVelocity(self, units, 0),
        'computeCurrentVelocity(IF)V': (self, [units, maxVelocity]) => computeVelocity(self, units, maxVelocity),
        'getXVelocity()F': (self) => Number(self.xVelocity) || 0,
        'getYVelocity()F': (self) => Number(self.yVelocity) || 0,
        'getXVelocity(I)F': (self) => Number(self.xVelocity) || 0,
        'getYVelocity(I)F': (self) => Number(self.yVelocity) || 0,
        'clear()V': (self) => {
          self.samples = [];
          self.xVelocity = 0;
          self.yVelocity = 0;
        },
        'recycle()V': (self) => {
          self.samples = [];
          self.xVelocity = 0;
          self.yVelocity = 0;
        },
      },
      staticMethods: {
        'obtain()Landroid/view/VelocityTracker;': (_self, _args, vm) => {
          if (!vm) return null;
          const object = vm.allocateRawObject('Landroid/view/VelocityTracker;');
          object.$peer = { vm, object, samples: [], xVelocity: 0, yVelocity: 0 };
          return object;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/GestureDetector$OnGestureListener;', { super: null })
  );

  defs.push(
    nativeDef('Landroid/view/GestureDetector;', {
      super: 'Ljava/lang/Object;',
      ctor: class GestureDetectorPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
        }
        get listener() { return this.object.$listener || null; }
        set listener(v) { this.object.$listener = v; }
      },
      methods: {
        '<init>(Landroid/content/Context;Landroid/view/GestureDetector$OnGestureListener;)V': (self, [context, listener]) => {
          self.object.$listener = listener;
        },
        '<init>(Landroid/view/GestureDetector$OnGestureListener;)V': (self, [listener]) => {
          self.object.$listener = listener;
        },
        'setIsLongpressEnabled(Z)V': () => undefined,
        'onTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup$LayoutParams;', {
      super: 'Ljava/lang/Object;',
      ctor: class LayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2 };
          }
        }
        get width() { return this.object.$layoutParams.width; }
        set width(v) { this.object.$layoutParams.width = v | 0; }
        get height() { return this.object.$layoutParams.height; }
        set height(v) { this.object.$layoutParams.height = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [width, height]) => {
          const params = self.object.$layoutParams || {};
          params.width = width | 0;
          params.height = height | 0;
          self.object.$layoutParams = params;
        },
        '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (self, [other]) => {
          const source = other?.$layoutParams || other || {};
          self.object.$layoutParams = {
            ...source,
            width: source.width ?? -2,
            height: source.height ?? -2,
          };
        },
        'setBaseAttributes(Landroid/content/res/TypedArray;II)V': () => undefined,
      },
      instanceFields: new Map([
        ['width:I', -2],
        ['height:I', -2],
      ]),
      staticFields: new Map([
        ['MATCH_PARENT:I', -1],
        ['FILL_PARENT:I', -1],
        ['WRAP_CONTENT:I', -2],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup$MarginLayoutParams;', {
      super: 'Landroid/view/ViewGroup$LayoutParams;',
      ctor: class MarginLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
        }
        get width() { return this.object.$layoutParams.width; }
        set width(v) { this.object.$layoutParams.width = v | 0; }
        get height() { return this.object.$layoutParams.height; }
        set height(v) { this.object.$layoutParams.height = v | 0; }
        get leftMargin() { return this.object.$layoutParams.leftMargin | 0; }
        set leftMargin(v) { this.object.$layoutParams.leftMargin = v | 0; }
        get topMargin() { return this.object.$layoutParams.topMargin | 0; }
        set topMargin(v) { this.object.$layoutParams.topMargin = v | 0; }
        get rightMargin() { return this.object.$layoutParams.rightMargin | 0; }
        set rightMargin(v) { this.object.$layoutParams.rightMargin = v | 0; }
        get bottomMargin() { return this.object.$layoutParams.bottomMargin | 0; }
        set bottomMargin(v) { this.object.$layoutParams.bottomMargin = v | 0; }
      },
      methods: {
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (self) => {
          self.object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
        },
        '<init>(II)V': (self, [width, height]) => {
          const params = self.object.$layoutParams || {};
          params.width = width | 0;
          params.height = height | 0;
          self.object.$layoutParams = params;
        },
        '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (self, [other]) => {
          const source = other?.$layoutParams || other || {};
          self.object.$layoutParams = {
            width: -2, height: -2,
            leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0,
            ...source,
          };
        },
        '<init>(Landroid/view/ViewGroup$MarginLayoutParams;)V': (self, [other]) => {
          const source = other?.$layoutParams || other || {};
          self.object.$layoutParams = {
            width: -2, height: -2,
            leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0,
            ...source,
          };
        },
        'getMarginStart()I': (self) => (self.object.$layoutParams?.leftMargin | 0),
        'getMarginEnd()I': (self) => (self.object.$layoutParams?.rightMargin | 0),
        'setMarginStart(I)V': (self, [value]) => { self.object.$layoutParams.leftMargin = value | 0; },
        'setMarginEnd(I)V': (self, [value]) => { self.object.$layoutParams.rightMargin = value | 0; },
        'setMargins(IIII)V': (self, [l, t, r, b]) => {
          const params = self.object.$layoutParams || {};
          params.leftMargin = l | 0;
          params.topMargin = t | 0;
          params.rightMargin = r | 0;
          params.bottomMargin = b | 0;
          self.object.$layoutParams = params;
        },
        'getMargins()Landroid/graphics/Rect;': (self, _a, vm) => {
          const params = self.object.$layoutParams || {};
          const rect = vm.allocateRawObject('Landroid/graphics/Rect;');
          rect.$peer = { rect: new Rect(params.leftMargin | 0, params.topMargin | 0, params.rightMargin | 0, params.bottomMargin | 0) };
          return rect;
        },
      },
      instanceFields: new Map([
        ['leftMargin:I', 0],
        ['topMargin:I', 0],
        ['rightMargin:I', 0],
        ['bottomMargin:I', 0],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/accessibility/AccessibilityNodeInfo$AccessibilityAction;', {
      super: 'Ljava/lang/Object;',
      ctor: class AccessibilityActionPeer {
        constructor(id, label) { this.id = id | 0; this.label = label ?? null; }
      },
      methods: {
        '<init>(ILjava/lang/CharSequence;)V': (self, [id, label]) => { self.id = id | 0; self.label = label ?? null; },
        'getId()I': (self) => self.id | 0,
        'getLabel()Ljava/lang/CharSequence;': (self) => self.label ?? null,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/provider/Settings$Global;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'getInt(Landroid/content/ContentResolver;Ljava/lang/String;)I': (_self, [_resolver, key]) => {
          const values = { adb_enabled: 0, development_settings_enabled: 0, device_provisioned: 1, stay_on_while_plugged_in: 0 };
          return values[jsString(key)] ?? 0;
        },
        'getInt(Landroid/content/ContentResolver;Ljava/lang/String;I)I': (_self, [_resolver, key, fallback]) => {
          const values = { adb_enabled: 0, development_settings_enabled: 0, device_provisioned: 1, stay_on_while_plugged_in: 0 };
          return values[jsString(key)] ?? (fallback | 0);
        },
        'getString(Landroid/content/ContentResolver;Ljava/lang/String;)Ljava/lang/String;': (_self, [_resolver, key]) => {
          const values = { device_name: 'apk.js' };
          return values[jsString(key)] ?? null;
        },
        'putInt(Landroid/content/ContentResolver;Ljava/lang/String;I)Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View$AccessibilityDelegate;', {
      super: 'Ljava/lang/Object;',
      methods: {
        '<init>()V': () => undefined,
        'sendAccessibilityEvent(Landroid/view/View;I)V': () => undefined,
        'sendAccessibilityEventUnchecked(Landroid/view/View;Landroid/view/accessibility/AccessibilityEvent;)V': () => undefined,
        'performAccessibilityAction(Landroid/view/View;ILandroid/os/Bundle;)Z': () => false,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/PointF;', {
      super: 'Ljava/lang/Object;',
      ctor: class PointFPeer { constructor() { this.x = 0; this.y = 0; } },
      methods: {
        '<init>()V': (self) => { self.x = 0; self.y = 0; },
        '<init>(FF)V': (self, [x, y]) => { self.x = numberToFloatBits(Number(x) || 0); self.y = numberToFloatBits(Number(y) || 0); },
        '<init>(Landroid/graphics/PointF;)V': (self, [other]) => { self.x = other?.$peer?.x ?? 0; self.y = other?.$peer?.y ?? 0; },
        'set(FF)V': (self, [x, y]) => { self.x = numberToFloatBits(Number(x) || 0); self.y = numberToFloatBits(Number(y) || 0); },
        'set(Landroid/graphics/PointF;)V': (self, [other]) => { self.x = Number(other?.$peer?.x) || 0; self.y = Number(other?.$peer?.y) || 0; },
        'length()F': (self) => Math.hypot(floatBitsToNumber(self.x | 0), floatBitsToNumber(self.y | 0)),
      },
      instanceFields: new Map([['x:F', 0], ['y:F', 0]]),
    })
  );

  defs.push(
    nativeDef('Ljava/util/BitSet;', {
      super: 'Ljava/lang/Object;',
      ctor: class BitSetPeer { constructor() { this.bits = new Set(); } },
      methods: {
        '<init>()V': (self) => { self.bits = new Set(); },
        '<init>(I)V': (self) => { self.bits = new Set(); },
        'set(I)V': (self, [index]) => { self.bits.add(index | 0); },
        'set(IZ)V': (self, [index, value]) => { if (value) self.bits.add(index | 0); else self.bits.delete(index | 0); },
        'clear(I)V': (self, [index]) => { self.bits.delete(index | 0); },
        'get(I)Z': (self, [index]) => (self.bits.has(index | 0) ? 1 : 0),
        'cardinality()I': (self) => self.bits.size,
        'isEmpty()Z': (self) => (self.bits.size ? 0 : 1),
        'nextSetBit(I)I': (self, [from]) => {
          let best = -1;
          for (const index of self.bits) if (index >= (from | 0) && (best < 0 || index < best)) best = index;
          return best;
        },
        'toString()Ljava/lang/String;': (self) => '{' + [...self.bits].sort((a, b) => a - b).join(', ') + '}',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/animation/DecelerateInterpolator;', {
      super: 'Ljava/lang/Object;',
      ctor: class DecelerateInterpolatorPeer { constructor(factor = 1) { this.factor = Number(factor) || 1; } },
      methods: {
        '<init>()V': (self) => { self.factor = 1; },
        '<init>(F)V': (self, [factor]) => { self.factor = Number(factor) || 1; },
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': () => undefined,
        'getInterpolation(F)F': (self, [input]) => {
          const value = Math.max(0, Math.min(1, Number(input) || 0));
          const factor = Number(self.factor) || 1;
          return 1 - Math.pow(1 - value, 2 * factor);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/SparseBooleanArray;', {
      super: 'Ljava/lang/Object;',
      ctor: class SparseBooleanArrayPeer { constructor() { this.map = new Map(); } },
      methods: {
        '<init>()V': (self) => { self.map = new Map(); },
        '<init>(I)V': (self) => { self.map = new Map(); },
        'put(IZ)V': (self, [key, value]) => { self.map.set(key | 0, !!value); },
        'get(I)Z': (self, [key]) => (self.map.get(key | 0) ? 1 : 0),
        'delete(I)V': (self, [key]) => { self.map.delete(key | 0); },
        'clear()V': (self) => { self.map.clear(); },
        'size()I': (self) => self.map.size,
        'keyAt(I)I': (self, [index]) => [...self.map.keys()][index | 0] ?? 0,
        'valueAt(I)Z': (self, [index]) => ([...self.map.values()][index | 0] ? 1 : 0),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/IntentFilter;', {
      super: 'Ljava/lang/Object;',
      ctor: class IntentFilterPeer { constructor() { this.actions = []; this.categories = []; } },
      methods: {
        '<init>()V': (self) => { self.actions = []; self.categories = []; },
        '<init>(Ljava/lang/String;)V': (self, [action]) => { self.actions = [jsString(action)]; self.categories = []; },
        'addAction(Ljava/lang/String;)V': (self, [action]) => { if (self.actions) self.actions.push(jsString(action)); },
        'addCategory(Ljava/lang/String;)V': (self, [category]) => { if (self.categories) self.categories.push(jsString(category)); },
        'hasAction(Ljava/lang/String;)Z': (self, [action]) => (self.actions || []).includes(jsString(action)) ? 1 : 0,
        'countActions()I': (self) => (self.actions || []).length,
        'getAction(I)Ljava/lang/String;': (self, [index]) => (self.actions || [])[index | 0] ?? null,
        'match(Landroid/content/ContentResolver;Landroid/content/Intent;ZLjava/lang/String;)I': () => -3,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/hardware/camera2/CameraManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getCameraIdList()[Ljava/lang/String;': (_self, _args, vm) => {
          const list = vm.newArray('[Ljava/lang/String;', 2);
          list.$data[0] = jsString('0');
          list.$data[1] = jsString('1');
          return list;
        },
        'getCameraCharacteristics(Ljava/lang/String;)Landroid/hardware/camera2/CameraCharacteristics;': (_self, [id], vm) => {
          const object = vm.allocateRawObject('Landroid/hardware/camera2/CameraCharacteristics;');
          object.$peer = { id: jsString(id) || '0', facing: (jsString(id) || '0') === '0' ? 1 : 0 };
          return object;
        },
        'registerAvailabilityCallback(Ljava/util/concurrent/Executor;Landroid/hardware/camera2/CameraManager$AvailabilityCallback;)V': () => undefined,
        'unregisterAvailabilityCallback(Landroid/hardware/camera2/CameraManager$AvailabilityCallback;)V': () => undefined,
      },
    }),
    nativeDef('Landroid/hardware/camera2/CameraCharacteristics$Key;', {
      super: 'Ljava/lang/Object;',
      ctor: class CameraKeyPeer { constructor(name) { this.name = name || ''; } },
      methods: {
        'getName()Ljava/lang/String;': (self) => self.name || '',
        'toString()Ljava/lang/String;': (self) => self.name || '',
      },
    }),
    nativeDef('Landroid/hardware/camera2/CameraCharacteristics;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['LENS_FACING:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('LENS_FACING')],
        ['SENSOR_ORIENTATION:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SENSOR_ORIENTATION')],
        ['SENSOR_INFO_ACTIVE_ARRAY_SIZE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SENSOR_INFO_ACTIVE_ARRAY_SIZE')],
        ['SENSOR_INFO_PIXEL_ARRAY_SIZE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SENSOR_INFO_PIXEL_ARRAY_SIZE')],
        ['SENSOR_INFO_PHYSICAL_SIZE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SENSOR_INFO_PHYSICAL_SIZE')],
        ['SENSOR_INFO_SENSITIVITY_RANGE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SENSOR_INFO_SENSITIVITY_RANGE')],
        ['SCALER_STREAM_CONFIGURATION_MAP:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SCALER_STREAM_CONFIGURATION_MAP')],
        ['SCALER_AVAILABLE_MAX_DIGITAL_ZOOM:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('SCALER_AVAILABLE_MAX_DIGITAL_ZOOM')],
        ['CONTROL_AF_AVAILABLE_MODES:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('CONTROL_AF_AVAILABLE_MODES')],
        ['LENS_INFO_AVAILABLE_APERTURES:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('LENS_INFO_AVAILABLE_APERTURES')],
        ['LENS_INFO_AVAILABLE_FOCAL_LENGTHS:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('LENS_INFO_AVAILABLE_FOCAL_LENGTHS')],
        ['LENS_INFO_MINIMUM_FOCUS_DISTANCE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('LENS_INFO_MINIMUM_FOCUS_DISTANCE')],
        ['FLASH_INFO_AVAILABLE:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('FLASH_INFO_AVAILABLE')],
        ['INFO_SUPPORTED_HARDWARE_LEVEL:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('INFO_SUPPORTED_HARDWARE_LEVEL')],
        ['INFO_VERSION:Landroid/hardware/camera2/CameraCharacteristics$Key;', cameraKey('INFO_VERSION')],
      ]),
      methods: {
        'get(Landroid/hardware/camera2/CameraCharacteristics$Key;)Ljava/lang/Object;': (self, [key], vm) => cameraCharacteristicValue(vm, key, self),
        'getKeys()Ljava/util/List;': (_self, _args, vm) => {
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          list.$peer = { items: CAMERA_KEY_NAMES.map((name) => cameraKey(name)) };
          return list;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/PorterDuffXfermode;', {
      super: 'Landroid/graphics/Xfermode;',
      ctor: class PorterDuffXfermodePeer { constructor(mode) { this.mode = mode ?? null; } },
      methods: {
        '<init>(Landroid/graphics/PorterDuff$Mode;)V': (self, [mode]) => { self.mode = mode ?? null; },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Process;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'myPid()I': () => 4242,
        'myTid()I': () => 4242,
        'myUid()I': () => 10000,
        'getElapsedCpuTime()J': () => BigInt(Date.now()),
        'getThreadPriority(I)I': () => 0,
        'setThreadPriority(I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/hardware/Camera;', {
      super: 'Ljava/lang/Object;',
      ctor: class CameraPeer { constructor(vm, id) { this.vm = vm; this.id = id | 0; } },
      methods: {
        'release()V': () => undefined,
        'lock()V': () => undefined,
        'unlock()V': () => undefined,
        'setPreviewDisplay(Landroid/view/SurfaceHolder;)V': () => undefined,
        'startPreview()V': () => undefined,
        'stopPreview()V': () => undefined,
        'setParameters(Landroid/hardware/Camera$Parameters;)V': () => undefined,
        'getParameters()Landroid/hardware/Camera$Parameters;': (self, _args, vm) => cameraParameters(vm),
      },
      staticMethods: {
        'getNumberOfCameras()I': () => 2,
        'open()Landroid/hardware/Camera;': (_self, _args, vm) => cameraInstance(vm, 0),
        'open(I)Landroid/hardware/Camera;': (_self, [id], vm) => cameraInstance(vm, id | 0),
        'getCameraInfo(ILandroid/hardware/Camera$CameraInfo;)V': (_self, [id, info]) => {
          if (!info) return;
          const facing = (id | 0) === 0 ? 1 : 0;
          if (!info.$peer) info.$peer = {};
          info.$peer.facing = facing;
          info.$peer.orientation = 90;
          info.$fields?.set('facing:I', facing);
          info.$fields?.set('orientation:I', 90);
        },
      },
    }),
    nativeDef('Landroid/hardware/Camera$CameraInfo;', {
      super: 'Ljava/lang/Object;',
      ctor: class CameraInfoPeer { constructor() { this.facing = 1; this.orientation = 90; } },
      methods: {
        '<init>()V': () => undefined,
      },
    }),
    nativeDef('Landroid/hardware/Camera$Size;', {
      super: 'Ljava/lang/Object;',
      ctor: class CameraSizePeer { constructor(width = 0, height = 0) { this.width = width | 0; this.height = height | 0; } },
      methods: {
        '<init>(II)V': (self, [width, height]) => { self.width = width | 0; self.height = height | 0; },
        'getWidth()I': (self) => self.width | 0,
        'getHeight()I': (self) => self.height | 0,
      },
    }),
    nativeDef('Landroid/hardware/Camera$Parameters;', {
      super: 'Ljava/lang/Object;',
      ctor: class CameraParametersPeer { constructor(vm) { this.vm = vm; } },
      methods: {
        'getSupportedPreviewSizes()Ljava/util/List;': (self, _args, vm) => cameraSizeList(vm, [[4000, 3000], [1920, 1080], [1280, 720]]),
        'getSupportedPictureSizes()Ljava/util/List;': (self, _args, vm) => cameraSizeList(vm, [[4000, 3000], [1920, 1080], [1280, 720]]),
        'getPreviewSize()Landroid/hardware/Camera$Size;': (self, _args, vm) => cameraSize(vm, 1920, 1080),
        'getPreviewFormat()I': () => 17,
        'getPictureFormat()I': () => 256,
        'getSupportedPreviewFormats()Ljava/util/List;': (self, _args, vm) => cameraIntList(vm, [17]),
        'getPictureSize()Landroid/hardware/Camera$Size;': (self, _args, vm) => cameraSize(vm, 4000, 3000),
        'getSupportedFocusModes()Ljava/util/List;': (self, _args, vm) => cameraStringList(vm, ['auto', 'continuous-picture', 'fixed']),
        'getFocusMode()Ljava/lang/String;': () => 'auto',
        'getFlashMode()Ljava/lang/String;': () => 'off',
        'getSupportedFlashModes()Ljava/util/List;': (self, _args, vm) => cameraStringList(vm, ['off', 'auto', 'on']),
        'getPreviewFpsRange([I)V': (_self, [range]) => { if (range?.$data) { range.$data[0] = 30000; range.$data[1] = 30000; } },
        'getFocalLength()F': () => 4.2,
        'getSupportedPictureFormats()Ljava/util/List;': (self, _args, vm) => cameraIntList(vm, [256]),
        'getHorizontalViewAngle()F': () => 65,
        'getVerticalViewAngle()F': () => 40,
        'flatten()Ljava/lang/String;': () => 'preview-size=1920x1080;picture-size=4000x3000',
      },
    }),
    nativeDef('Landroid/util/Size;', {
      super: 'Ljava/lang/Object;',
      ctor: class SizePeer { constructor(width = 0, height = 0) { this.width = width | 0; this.height = height | 0; } },
      methods: {
        '<init>(II)V': (self, [width, height]) => { self.width = width | 0; self.height = height | 0; },
        'getWidth()I': (self) => self.width | 0,
        'getHeight()I': (self) => self.height | 0,
      },
    }),
    nativeDef('Landroid/util/SizeF;', {
      super: 'Ljava/lang/Object;',
      ctor: class SizeFPeer { constructor(width = 0, height = 0) { this.width = width; this.height = height; } },
      methods: {
        '<init>(FF)V': (self, [width, height]) => { self.width = Number(width) || 0; self.height = Number(height) || 0; },
        'getWidth()F': (self) => self.width || 0,
        'getHeight()F': (self) => self.height || 0,
      },
    }),
    nativeDef('Landroid/util/Range;', {
      super: 'Ljava/lang/Object;',
      ctor: class RangePeer { constructor(lower, upper) { this.lower = lower; this.upper = upper; } },
      methods: {
        'getLower()Ljava/lang/Comparable;': (self) => self.lower,
        'getUpper()Ljava/lang/Comparable;': (self) => self.upper,
      },
      staticMethods: {
        'create(Ljava/lang/Comparable;Ljava/lang/Comparable;)Landroid/util/Range;': (_self, [lower, upper], vm) => {
          const range = vm.allocateRawObject('Landroid/util/Range;');
          range.$peer = { lower, upper };
          return range;
        },
      },
    }),
    nativeDef('Landroid/hardware/camera2/params/StreamConfigurationMap;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getOutputSizes(I)[Landroid/util/Size;': (_self, _args, vm) => cameraSizeArray(vm),
        'getOutputSizes(Ljava/lang/Class;)[Landroid/util/Size;': (_self, _args, vm) => cameraSizeArray(vm),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/PointerIcon;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['TYPE_DEFAULT:I', 1000], ['TYPE_HAND:I', 1002], ['TYPE_ARROW:I', 1000],
        ['TYPE_TEXT:I', 1008], ['TYPE_CROSSHAIR:I', 1001],
      ]),
      staticMethods: {
        'getSystemIcon(Landroid/content/Context;I)Landroid/view/PointerIcon;': (_self, [type]) => ({ $descriptor: 'Landroid/view/PointerIcon;', type: type | 0 }),
        'getDefaultIcon(Landroid/content/Context;)Landroid/view/PointerIcon;': () => ({ $descriptor: 'Landroid/view/PointerIcon;', type: 1000 }),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Typeface;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getStyle()I': (self) => self.style | 0,
        'getWeight()I': (self) => ((self.style | 0) & 1 ? 700 : 400),
        'isBold()Z': (self) => ((self.style | 0) & 1 ? 1 : 0),
        'isItalic()Z': (self) => ((self.style | 0) & 2 ? 1 : 0),
      },
      staticFields: new Map([
        ['DEFAULT:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;', family: null, style: 0 }],
        ['DEFAULT_BOLD:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;', family: null, style: 1 }],
        ['MONOSPACE:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;', family: 'monospace', style: 0 }],
        ['SERIF:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;', family: 'serif', style: 0 }],
        ['SANS_SERIF:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;', family: null, style: 0 }],
      ]),
      staticMethods: {
        'create(Ljava/lang/String;I)Landroid/graphics/Typeface;': (_self, [family, style]) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: family ?? null, style: style | 0 }),
        'create(Landroid/graphics/Typeface;I)Landroid/graphics/Typeface;': (_self, [base, style]) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: base?.family ?? null, style: style | 0 }),
        'create(Landroid/graphics/Typeface;IZ)Landroid/graphics/Typeface;': (_self, [base, style]) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: base?.family ?? null, style: style | 0 }),
        'create(Ljava/lang/String;ILandroid/graphics/Typeface;)Landroid/graphics/Typeface;': (_self, [family, style]) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: family ?? null, style: style | 0 }),
        'defaultFromStyle(I)Landroid/graphics/Typeface;': (_self, [style]) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: null, style: style | 0 }),
      },
    })
  );

  defs.push(
    nativeDef('Lorg/json/JSONArray;', {
      super: 'Ljava/lang/Object;',
      ctor: class JSONArrayPeer {
        constructor() { this.items = []; }
      },
      methods: {
        '<init>()V': (self) => { self.items = []; },
        '<init>(Ljava/lang/String;)V': (self, [text]) => {
          try { const value = JSON.parse(jsString(text)); self.items = Array.isArray(value) ? value : []; } catch { self.items = []; }
        },
        '<init>(Ljava/util/Collection;)V': (self, [collection]) => {
          self.items = collection?.$data || collection?.items || (Array.isArray(collection) ? collection : []);
        },
        'length()I': (self) => (self.items || []).length,
        'iterator()Ljava/util/Iterator;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Ljava/util/Iterator;');
          object.$peer = { cursor: 0, snapshot: [...(self.items || [])] };
          return object;
        },
        'get(I)Ljava/lang/Object;': (self, [index], vm) => jsonBox(vm, (self.items || [])[index | 0]),
        'getString(I)Ljava/lang/String;': (self, [index]) => String((self.items || [])[index | 0] ?? ''),
        'optString(I)Ljava/lang/String;': (self, [index]) => String((self.items || [])[index | 0] ?? ''),
        'optString(ILjava/lang/String;)Ljava/lang/String;': (self, [index, fallback]) => {
          const value = (self.items || [])[index | 0];
          return value === undefined || value === null ? jsString(fallback) : String(value);
        },
        'getInt(I)I': (self, [index]) => Number((self.items || [])[index | 0]) | 0,
        'optInt(I)I': (self, [index]) => Number((self.items || [])[index | 0]) | 0,
        'getLong(I)J': (self, [index]) => BigInt(Math.trunc(Number((self.items || [])[index | 0]) || 0)),
        'optLong(I)J': (self, [index]) => BigInt(Math.trunc(Number((self.items || [])[index | 0]) || 0)),
        'optLong(IJ)J': (self, [index, fallback]) => {
          const value = Number((self.items || [])[index | 0]);
          return Number.isFinite(value) ? BigInt(Math.trunc(value)) : toLong(fallback);
        },
        'optDouble(I)D': (self, [index]) => Number((self.items || [])[index | 0]) || 0,
        'optDouble(ID)D': (self, [index, fallback]) => {
          const value = Number((self.items || [])[index | 0]);
          return Number.isFinite(value) ? value : (Number(fallback) || 0);
        },
        'optBoolean(I)Z': (self, [index]) => ((self.items || [])[index | 0] ? 1 : 0),
        'optBoolean(IZ)Z': (self, [index, fallback]) => {
          const value = (self.items || [])[index | 0];
          return value === undefined ? (fallback ? 1 : 0) : (value ? 1 : 0);
        },
        'remove(I)Ljava/lang/Object;': (self, [index], vm) => jsonBox(vm, (self.items || []).splice(index | 0, 1)[0]),
        'clear()V': (self) => { self.items = []; },
        'getDouble(I)D': (self, [index]) => Number((self.items || [])[index | 0]) || 0,
        'getBoolean(I)Z': (self, [index]) => ((self.items || [])[index | 0] ? 1 : 0),
        'isNull(I)Z': (self, [index]) => ((self.items || [])[index | 0] == null ? 1 : 0),
        'put(Ljava/lang/Object;)Lorg/json/JSONArray;': (self, [value], vm) => { self.items.push(jsonUnbox(vm, value)); return self.$object ?? self; },
        'getJSONObject(I)Lorg/json/JSONObject;': (self, [index], vm) => jsonMake(vm, 'Lorg/json/JSONObject;', 'map', (self.items || [])[index | 0]),
        'getJSONArray(I)Lorg/json/JSONArray;': (self, [index], vm) => jsonMake(vm, 'Lorg/json/JSONArray;', 'items', (self.items || [])[index | 0]),
        'toString()Ljava/lang/String;': (self) => JSON.stringify(self.items || []),
      },
    })
  );

  defs.push(
    nativeDef('Lorg/json/JSONObject;', {
      super: 'Ljava/lang/Object;',
      ctor: class JSONObjectPeer {
        constructor() { this.map = Object.create(null); }
      },
      methods: {
        '<init>()V': (self) => { self.map = Object.create(null); },
        '<init>(Ljava/lang/String;)V': (self, [text]) => {
          try { const value = JSON.parse(jsString(text)); self.map = value && typeof value === 'object' && !Array.isArray(value) ? value : Object.create(null); } catch { self.map = Object.create(null); }
        },
        'has(Ljava/lang/String;)Z': (self, [key]) => (Object.prototype.hasOwnProperty.call(self.map || {}, jsString(key)) ? 1 : 0),
        'isNull(Ljava/lang/String;)Z': (self, [key]) => ((self.map || {})[jsString(key)] == null ? 1 : 0),
        'get(Ljava/lang/String;)Ljava/lang/Object;': (self, [key], vm) => jsonBox(vm, (self.map || {})[jsString(key)]),
        'getString(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => String((self.map || {})[jsString(key)] ?? ''),
        'optString(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => String((self.map || {})[jsString(key)] ?? ''),
        'optString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [key, fallback]) => {
          const value = (self.map || {})[jsString(key)];
          return value === undefined || value === null ? jsString(fallback) : String(value);
        },
        'getInt(Ljava/lang/String;)I': (self, [key]) => Number((self.map || {})[jsString(key)]) | 0,
        'optInt(Ljava/lang/String;)I': (self, [key]) => Number((self.map || {})[jsString(key)]) | 0,
        'optInt(Ljava/lang/String;I)I': (self, [key, fallback]) => {
          const value = Number((self.map || {})[jsString(key)]);
          return Number.isFinite(value) ? value | 0 : fallback | 0;
        },
        'getLong(Ljava/lang/String;)J': (self, [key]) => BigInt(Math.trunc(Number((self.map || {})[jsString(key)]) || 0)),
        'optLong(Ljava/lang/String;)J': (self, [key]) => BigInt(Math.trunc(Number((self.map || {})[jsString(key)]) || 0)),
        'optLong(Ljava/lang/String;J)J': (self, [key, fallback]) => {
          const value = Number((self.map || {})[jsString(key)]);
          return Number.isFinite(value) ? BigInt(Math.trunc(value)) : toLong(fallback);
        },
        'optDouble(Ljava/lang/String;)D': (self, [key]) => Number((self.map || {})[jsString(key)]) || 0,
        'optDouble(Ljava/lang/String;D)D': (self, [key, fallback]) => {
          const value = Number((self.map || {})[jsString(key)]);
          return Number.isFinite(value) ? value : (Number(fallback) || 0);
        },
        'optBoolean(Ljava/lang/String;Z)Z': (self, [key, fallback]) => {
          const value = (self.map || {})[jsString(key)];
          return value === undefined ? (fallback ? 1 : 0) : (value ? 1 : 0);
        },
        'remove(Ljava/lang/String;)Ljava/lang/Object;': (self, [key], vm) => {
          const value = (self.map || {})[jsString(key)];
          delete (self.map || {})[jsString(key)];
          return jsonBox(vm, value);
        },
        'getDouble(Ljava/lang/String;)D': (self, [key]) => Number((self.map || {})[jsString(key)]) || 0,
        'getBoolean(Ljava/lang/String;)Z': (self, [key]) => ((self.map || {})[jsString(key)] ? 1 : 0),
        'optBoolean(Ljava/lang/String;)Z': (self, [key]) => ((self.map || {})[jsString(key)] ? 1 : 0),
        'length()I': (self) => Object.keys(self.map || {}).length,
        'keys()Ljava/util/Iterator;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Ljava/util/Iterator;');
          object.$peer = { cursor: 0, snapshot: Object.keys(self.map || {}) };
          return object;
        },
        'names()Lorg/json/JSONArray;': (self, _args, vm) => jsonMake(vm, 'Lorg/json/JSONArray;', 'items', Object.keys(self.map || {})),
        'put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;': (self, [key, value], vm) => {
          self.map[jsString(key)] = jsonUnbox(vm, value);
          return self.$object ?? self;
        },
        'getJSONObject(Ljava/lang/String;)Lorg/json/JSONObject;': (self, [key], vm) => jsonMake(vm, 'Lorg/json/JSONObject;', 'map', (self.map || {})[jsString(key)]),
        'optJSONObject(Ljava/lang/String;)Lorg/json/JSONObject;': (self, [key], vm) => {
          const value = (self.map || {})[jsString(key)];
          return value ? jsonMake(vm, 'Lorg/json/JSONObject;', 'map', value) : null;
        },
        'getJSONArray(Ljava/lang/String;)Lorg/json/JSONArray;': (self, [key], vm) => jsonMake(vm, 'Lorg/json/JSONArray;', 'items', (self.map || {})[jsString(key)]),
        'optJSONArray(Ljava/lang/String;)Lorg/json/JSONArray;': (self, [key], vm) => {
          const value = (self.map || {})[jsString(key)];
          return Array.isArray(value) ? jsonMake(vm, 'Lorg/json/JSONArray;', 'items', value) : null;
        },
        'toString()Ljava/lang/String;': (self) => JSON.stringify(self.map || {}),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/LocaleList;', {
      super: 'Ljava/lang/Object;',
      ctor: class LocaleListPeer {
        constructor(locales) {
          this.locales = Array.isArray(locales) ? locales : [];
        }
      },
      staticMethods: {
        'forLanguageTags(Ljava/lang/String;)Landroid/os/LocaleList;': () => ({
          $descriptor: 'Landroid/os/LocaleList;',
          locales: [],
        }),
        'getDefault()Landroid/os/LocaleList;': (self, _args, vm) => ({
          $descriptor: 'Landroid/os/LocaleList;',
          locales: [makeDefaultLocaleObject(vm)],
        }),
      },
      methods: {
        '<init>([Ljava/util/Locale;)V': (self, [locales]) => {
          self.locales = Array.isArray(locales) ? locales : [];
        },
        'isEmpty()Z': (self) => !self.locales || self.locales.length === 0,
        'size()I': (self) => (self.locales ? self.locales.length : 1),
        'get(I)Ljava/util/Locale;': (self, [index], vm) => {
          if (self.locales && self.locales.length) {
            return self.locales[index | 0] ?? self.locales[0];
          }
          return makeDefaultLocaleObject(vm);
        },
        'toLanguageTags()Ljava/lang/String;': (self) => {
          const list = Array.isArray(self.locales) ? self.locales : [];
          return list
            .map((locale) => (locale && locale.$peer && locale.$peer.tag) || locale?.$fields?.tag || '')
            .filter(Boolean)
            .join(',');
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Color;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'rgb(III)I': (_self, [r, g, b]) => (((255 << 24) | (toInt(r) << 16) | (toInt(g) << 8) | toInt(b)) >>> 0),
        'argb(IIII)I': (_self, [a, r, g, b]) =>
          (((toInt(a) << 24) | (toInt(r) << 16) | (toInt(g) << 8) | toInt(b)) >>> 0),
        'parseColor(Ljava/lang/String;)I': (_self, [value]) => {
          const text = jsString(value);
          if (text.startsWith('#')) return parseInt(text.slice(1).padStart(8, 'f'), 16) >>> 0;
          return 0xff000000;
        },
        'red(I)I': (_self, [color]) => (toInt(color) >>> 16) & 0xff,
        'green(I)I': (_self, [color]) => (toInt(color) >>> 8) & 0xff,
        'blue(I)I': (_self, [color]) => toInt(color) & 0xff,
        'alpha(I)I': (_self, [color]) => (toInt(color) >>> 24) & 0xff,
        'luminance(I)F': (_self, [color]) => colorLuminance(toInt(color)),
        'luminance(J)F': (_self, [color]) => colorLuminance(colorArgb(color)),
        'rgb(FFF)I': (_self, [r, g, b]) => packArgb(1, r, g, b),
        'argb(FFFF)I': (_self, [a, r, g, b]) => packArgb(a, r, g, b),
        'RGBToHSV(III[F)V': (_self, [r, g, b, out]) => writeHsv(out, rgbToHsv(Number(r) / 255, Number(g) / 255, Number(b) / 255)),
        'colorToHSV(I[F)V': (_self, [color, out]) => {
          const argb = toInt(color);
          writeHsv(out, rgbToHsv(((argb >>> 16) & 0xff) / 255, ((argb >>> 8) & 0xff) / 255, (argb & 0xff) / 255));
        },
        'HSVToColor([F)I': (_self, [hsv]) => hsvToArgb(255, hsv),
        'HSVToColor(I[F)I': (_self, [alpha, hsv]) => hsvToArgb(alpha, hsv),
        'valueOf(I)Landroid/graphics/Color;': (_self, [color], vm) => colorObject(vm, toInt(color)),
        'valueOf(J)Landroid/graphics/Color;': (_self, [color], vm) => colorObject(vm, colorArgb(color)),
        'valueOf(FFF)Landroid/graphics/Color;': (_self, [r, g, b], vm) => colorObject(vm, packArgb(1, r, g, b)),
        'valueOf(FFFF)Landroid/graphics/Color;': (_self, [r, g, b, a], vm) => colorObject(vm, packArgb(a, r, g, b)),
        'valueOf(FFFFLandroid/graphics/ColorSpace;)Landroid/graphics/Color;': (_self, [r, g, b, a], vm) => colorObject(vm, packArgb(a, r, g, b)),
        'valueOf([FLandroid/graphics/ColorSpace;)Landroid/graphics/Color;': (_self, [components], vm) => {
          const values = components?.$data || [];
          return colorObject(vm, packArgb(values[3] ?? 1, values[0] ?? 0, values[1] ?? 0, values[2] ?? 0));
        },
        'pack(I)J': (_self, [color]) => colorLongFromArgb(toInt(color)),
        'pack(FFF)J': (_self, [r, g, b]) => colorLongFromArgb(packArgb(1, r, g, b)),
        'pack(FFFF)J': (_self, [r, g, b, a]) => colorLongFromArgb(packArgb(a, r, g, b)),
        'pack(FFFFLandroid/graphics/ColorSpace;)J': (_self, [r, g, b, a]) => colorLongFromArgb(packArgb(a, r, g, b)),
        'red(J)F': (_self, [color]) => ((colorArgb(color) >>> 16) & 0xff) / 255,
        'green(J)F': (_self, [color]) => ((colorArgb(color) >>> 8) & 0xff) / 255,
        'blue(J)F': (_self, [color]) => (colorArgb(color) & 0xff) / 255,
        'alpha(J)F': (_self, [color]) => ((colorArgb(color) >>> 24) & 0xff) / 255,
        'isSrgb(J)Z': () => true,
        'isWideGamut(J)Z': () => false,
        'isInColorSpace(JLandroid/graphics/ColorSpace;)Z': () => true,
        'toArgb(J)I': (_self, [color]) => colorArgb(color),
        'colorSpace(J)Landroid/graphics/ColorSpace;': () => null,
        'convert(ILandroid/graphics/ColorSpace;)J': (_self, [color]) => colorLongFromArgb(toInt(color)),
        'convert(JLandroid/graphics/ColorSpace;)J': (_self, [color]) => colorLongFromArgb(colorArgb(color)),
        'convert(FFFFLandroid/graphics/ColorSpace;Landroid/graphics/ColorSpace;)J': (_self, [r, g, b, a]) => colorLongFromArgb(packArgb(a, r, g, b)),
        'convert(JLandroid/graphics/ColorSpace$Connector;)J': (_self, [color]) => colorLongFromArgb(colorArgb(color)),
        'convert(FFFFLandroid/graphics/ColorSpace$Connector;)J': (_self, [r, g, b, a]) => colorLongFromArgb(packArgb(a, r, g, b)),
      },
      methods: {
        '<init>()V': (self) => { self.argb = 0xff000000; },
        'getColorSpace()Landroid/graphics/ColorSpace;': () => null,
        'getModel()Landroid/graphics/ColorSpace$Model;': () => null,
        'isWideGamut()Z': () => false,
        'isSrgb()Z': () => true,
        'getComponentCount()I': () => 4,
        'pack()J': (self) => colorLongFromArgb(self.argb),
        'toArgb()I': (self) => self.argb >>> 0,
        'red()F': (self) => ((self.argb >>> 16) & 0xff) / 255,
        'green()F': (self) => ((self.argb >>> 8) & 0xff) / 255,
        'blue()F': (self) => (self.argb & 0xff) / 255,
        'alpha()F': (self) => ((self.argb >>> 24) & 0xff) / 255,
        'getComponents()[F': (self, _args, vm) => vm.newArray('F', 4, [
          ((self.argb >>> 16) & 0xff) / 255, ((self.argb >>> 8) & 0xff) / 255, (self.argb & 0xff) / 255, ((self.argb >>> 24) & 0xff) / 255,
        ]),
        'getComponents([F)[F': (self, [out]) => {
          const values = [((self.argb >>> 16) & 0xff) / 255, ((self.argb >>> 8) & 0xff) / 255, (self.argb & 0xff) / 255, ((self.argb >>> 24) & 0xff) / 255];
          if (out?.$data) { for (let i = 0; i < 4; i++) out.$data[i] = values[i]; }
          return out;
        },
        'getComponent(I)F': (self, [index]) => {
          const channels = [((self.argb >>> 16) & 0xff) / 255, ((self.argb >>> 8) & 0xff) / 255, (self.argb & 0xff) / 255, ((self.argb >>> 24) & 0xff) / 255];
          return channels[toInt(index)] ?? 0;
        },
        'luminance()F': (self) => colorLuminance(self.argb),
        'convert(Landroid/graphics/ColorSpace;)Landroid/graphics/Color;': (self) => self.$object ?? self,
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer ?? other;
          return !!peer && toInt(peer.argb) === toInt(self.argb);
        },
        'hashCode()I': (self) => toInt(self.argb),
        'toString()Ljava/lang/String;': (self) => `Color(0x${(self.argb >>> 0).toString(16).padStart(8, '0')})`,
      },
      staticFields: new Map([
        ['BLACK:I', 0xff000000],
        ['WHITE:I', 0xffffffff],
        ['RED:I', 0xffff0000],
        ['GREEN:I', 0xff00ff00],
        ['BLUE:I', 0xff0000ff],
        ['TRANSPARENT:I', 0],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Paint;', {
      super: 'Ljava/lang/Object;',
      ctor: class PaintPeer {
        constructor() {
          this.paint = new Paint();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.paint = new Paint();
        },
        '<init>(I)V': (self) => {
          self.paint = new Paint();
        },
        '<init>(Landroid/graphics/Paint;)V': (self) => {
          self.paint = new Paint();
        },
        'setColor(I)V': (self, [color], vm) => {
          let value = color >>> 0;
          if (value >= 0x01010000 && value < 0x02000000) {
            const resolved = resolveStyleColor(vm, value);
            if (typeof resolved === 'number') value = resolved >>> 0;
          }
          self.paint.setColor(value);
        },
        'getColor()I': (self) => self.paint.getColor(),
        'setTextSize(F)V': (self, [size]) => self.paint.setTextSize(size),
        'getTextSize()F': (self) => self.paint.getTextSize(),
        'setAntiAlias(Z)V': (self, [value]) => self.paint.setAntiAlias(value),
        'setStrokeWidth(F)V': (self, [width]) => self.paint.setStrokeWidth(width),
        'getStrokeWidth()F': (self) => self.paint.getStrokeWidth(),
        'setAlpha(I)V': (self, [alpha]) => self.paint.setAlpha(alpha),
        'getAlpha()I': (self) => self.paint.getAlpha(),
        'setStrokeJoin(Landroid/graphics/Paint$Join;)V': (self, [join]) =>
          self.paint.setStrokeJoin(join?.$peer?.ordinal ?? join),
        'setStrokeCap(Landroid/graphics/Paint$Cap;)V': (self, [cap]) =>
          self.paint.setStrokeCap(cap?.$peer?.ordinal ?? cap),
        'setStyle(Landroid/graphics/Paint$Style;)V': (self, [style]) =>
          self.paint.setStyle(style?.$peer?.ordinal ?? style),
        'setColorFilter(Landroid/graphics/ColorFilter;Landroid/graphics/PorterDuff$Mode;)V': (self, [filter]) => { self.paint.colorFilter = filter ?? null; },
        'setColorFilter(Landroid/graphics/ColorFilter;)Landroid/graphics/ColorFilter;': (self, [filter]) => { self.paint.colorFilter = filter ?? null; return filter ?? null; },
        'setColorFilter(Landroid/graphics/ColorFilter;)V': (self, [filter]) => {
          self.paint.setColorFilter(filter ?? null);
        },
        'getColorFilter()Landroid/graphics/ColorFilter;': (self) => self.paint.getColorFilter() ?? null,
        'setShader(Landroid/graphics/Shader;)V': (self, [shader]) => {
          self.paint.shader = shader ?? null;
        },
        'getShader()Landroid/graphics/Shader;': (self) => self.paint.shader ?? null,
        'setDither(Z)V': () => undefined,
        'setFilterBitmap(Z)V': () => undefined,
        'setSubpixelText(Z)V': () => undefined,
        'setFakeBoldText(Z)V': (self, [value]) => { self.paint.fontWeight = value ? 'bold' : 'normal'; },
        'setTextAlign(Landroid/graphics/Paint$Align;)V': (self, [align]) => {
          const ordinal = align?.$peer?.ordinal ?? align;
          self.paint.textAlign = ['left', 'center', 'right'][ordinal | 0] || 'left';
        },
        'setLetterSpacing(F)V': (self, [spacing]) => { self.paint.letterSpacing = Number(spacing) || 0; },
        'setTextScaleX(F)V': (self, [scale]) => { self.paint.textScaleX = Number(scale) || 1; },
        'setTextSkewX(F)V': (self, [skew]) => { self.paint.textSkewX = Number(skew) || 0; },
        'setTypeface(Landroid/graphics/Typeface;)Landroid/graphics/Typeface;': (self, [typeface]) => {
          self.paint.typeface = typeface?.family || 'Noto Sans CJK SC';
          return typeface ?? null;
        },
        'getTypeface()Landroid/graphics/Typeface;': (self) => ({ $descriptor: 'Landroid/graphics/Typeface;', family: self.paint?.typeface || null, style: 0 }),
        'setXfermode(Landroid/graphics/Xfermode;)Landroid/graphics/Xfermode;': (self, [xfermode]) => { self.paint.xfermode = xfermode ?? null; return xfermode ?? null; },
        'getXfermode()Landroid/graphics/Xfermode;': (self) => self.paint?.xfermode ?? null,
        'getTextScaleX()F': (self) => Number(self.paint?.textScaleX) || 1,

        // —— 标志 / 度量 ——
        'getFlags()I': (self) => toInt(self.$flags ?? 0),
        'setFlags(I)V': (self, [flags]) => { self.$flags = toInt(flags); },
        'getHinting()I': (self) => toInt(self.$hinting ?? 0),
        'setHinting(I)V': (self, [hinting]) => { self.$hinting = toInt(hinting); },
        'isAntiAlias()Z': (self) => !!self.paint?.antiAlias,
        'isLinearText()Z': (self) => !!self.$linearText,
        'getUnderlinePosition()F': (self) => self.$underlinePosition ?? -(Number(self.paint?.textSize) || 14) * 0.1,
        'getUnderlineThickness()F': (self) => self.$underlineThickness ?? Math.max(1, (Number(self.paint?.textSize) || 14) / 16),
        'getStrikeThruPosition()F': (self) => self.$strikePosition ?? -(Number(self.paint?.textSize) || 14) * 0.3,
        'getStrikeThruThickness()F': (self) => self.$strikeThickness ?? Math.max(1, (Number(self.paint?.textSize) || 14) / 16),
        'getStyle()Landroid/graphics/Paint$Style;': (self, _args, vm) => {
          const ordinal = ['fill', 'stroke', 'fill_and_stroke'].indexOf(String(self.paint?.style || 'fill'));
          return paintStyleSingleton(vm, PAINT_STYLES[ordinal >= 0 ? ordinal : 0][0], ordinal >= 0 ? ordinal : 0);
        },
        'getColorLong()J': (self) => colorLongFromArgb(self.paint?.getColor?.() ?? 0xff000000),
        'setColor(J)V': (self, [color]) => self.paint?.setColor?.(colorArgb(color)),
        'setARGB(IIII)V': (self, [a, r, g, b]) => self.paint?.setColor?.(packArgb((toInt(a) & 0xff) / 255, (toInt(r) & 0xff) / 255, (toInt(g) & 0xff) / 255, (toInt(b) & 0xff) / 255)),
        'getStrokeCap()Landroid/graphics/Paint$Cap;': (self, _args, vm) => {
          const ordinal = ['butt', 'round', 'square'].indexOf(String(self.paint?.strokeCap || 'butt'));
          return paintCapSingleton(vm, PAINT_CAPS[ordinal >= 0 ? ordinal : 0][0], ordinal >= 0 ? ordinal : 0);
        },
        'getStrokeJoin()Landroid/graphics/Paint$Join;': (self, _args, vm) => {
          const ordinal = ['miter', 'round', 'bevel'].indexOf(String(self.paint?.strokeJoin || 'miter'));
          return paintJoinSingleton(vm, PAINT_JOINS[ordinal >= 0 ? ordinal : 0][0], ordinal >= 0 ? ordinal : 0);
        },
        'setShader(Landroid/graphics/Shader;)Landroid/graphics/Shader;': (self, [shader]) => {
          self.paint.shader = shader ?? null;
          return shader ?? null;
        },
        'getBlendMode()Landroid/graphics/BlendMode;': (self) => self.paint?.blendMode ?? null,
        'setBlendMode(Landroid/graphics/BlendMode;)V': (self, [mode]) => { self.paint.blendMode = mode ?? null; },
        'setPathEffect(Landroid/graphics/PathEffect;)Landroid/graphics/PathEffect;': (self, [effect]) => {
          self.paint.pathEffect = effect ?? null;
          return effect ?? null;
        },
        'getMaskFilter()Landroid/graphics/MaskFilter;': (self) => self.paint?.maskFilter ?? null,
        'setMaskFilter(Landroid/graphics/MaskFilter;)Landroid/graphics/MaskFilter;': (self, [filter]) => {
          self.paint.maskFilter = filter ?? null;
          return filter ?? null;
        },
        'setShadowLayer(FFFJ)V': (self, [radius, dx, dy, color]) => {
          self.paint.shadowLayer = { radius: Number(radius) || 0, dx: Number(dx) || 0, dy: Number(dy) || 0, color: colorArgb(color) };
        },
        'getShadowLayerRadius()F': (self) => Number(self.paint?.shadowLayer?.radius) || 0,
        'getShadowLayerDx()F': (self) => Number(self.paint?.shadowLayer?.dx) || 0,
        'getShadowLayerDy()F': (self) => Number(self.paint?.shadowLayer?.dy) || 0,
        'getShadowLayerColor()I': (self) => toInt(self.paint?.shadowLayer?.color ?? 0),
        'getShadowLayerColorLong()J': (self) => colorLongFromArgb(toInt(self.paint?.shadowLayer?.color ?? 0)),

        // —— 文本属性 ——
        'getTextAlign()Landroid/graphics/Paint$Align;': (self, _args, vm) => {
          const name = String(self.paint?.textAlign || 'left').toUpperCase();
          if (!vm.__paintAligns) vm.__paintAligns = new Map();
          const cached = vm.__paintAligns.get(name);
          if (cached) return cached;
          const object = vm.allocateRawObject('Landroid/graphics/Paint$Align;');
          object.$peer = { name, ordinal: ['LEFT', 'CENTER', 'RIGHT'].indexOf(name) };
          vm.__paintAligns.set(name, object);
          return object;
        },
        'getTextLocale()Ljava/util/Locale;': (self, _args, vm) => {
          if (!vm.__textLocale) {
            const object = vm.allocateRawObject('Ljava/util/Locale;');
            object.$peer = { language: 'zh', country: 'CN' };
            vm.__textLocale = object;
          }
          return vm.__textLocale;
        },
        'getTextLocales()Landroid/os/LocaleList;': (self, _args, vm) => {
          if (!vm.__textLocales) {
            const object = vm.allocateRawObject('Landroid/os/LocaleList;');
            object.$peer = { locales: [self.paint?.textLocale ?? null] };
            vm.__textLocales = object;
          }
          return vm.__textLocales;
        },
        'setTextLocale(Ljava/util/Locale;)V': (self, [locale]) => { self.paint.textLocale = locale ?? null; },
        'setTextLocales(Landroid/os/LocaleList;)V': (self, [locales]) => { self.paint.textLocales = locales ?? null; },
        'isElegantTextHeight()Z': (self) => !!self.paint?.elegantTextHeight,
        'setElegantTextHeight(Z)V': (self, [value]) => { self.paint.elegantTextHeight = !!value; },
        'getWordSpacing()F': (self) => Number(self.paint?.wordSpacing) || 0,
        'setWordSpacing(F)V': (self, [spacing]) => { self.paint.wordSpacing = Number(spacing) || 0; },
        'getFontFeatureSettings()Ljava/lang/String;': (self) => self.paint?.fontFeatureSettings ?? null,
        'setFontFeatureSettings(Ljava/lang/String;)V': (self, [settings]) => { self.paint.fontFeatureSettings = settings == null ? null : jsString(settings); },
        'getFontVariationSettings()Ljava/lang/String;': (self) => self.paint?.fontVariationSettings ?? null,
        'setFontVariationSettings(Ljava/lang/String;)Z': (self, [settings]) => {
          self.paint.fontVariationSettings = settings == null ? null : jsString(settings);
          return true;
        },
        'getStartHyphenEdit()I': (self) => toInt(self.paint?.startHyphenEdit ?? 0),
        'getEndHyphenEdit()I': (self) => toInt(self.paint?.endHyphenEdit ?? 0),
        'setStartHyphenEdit(I)V': (self, [value]) => { self.paint.startHyphenEdit = toInt(value); },
        'setEndHyphenEdit(I)V': (self, [value]) => { self.paint.endHyphenEdit = toInt(value); },
        'measureText(Ljava/lang/String;II)F': (self, [text, start, end]) => self.paint.measureText(jsString(text).slice(start | 0, end | 0)),
        'breakText([CIIF[F)I': (self, [chars, index, count, maxWidth, measured]) => {
          const data = chars?.$data || [];
          return breakTextImpl(self, data, index, count, maxWidth, measured, true);
        },
        'breakText(Ljava/lang/CharSequence;IIZF[F)I': (self, [text, start, end, measureForwards, maxWidth, measured]) => {
          const value = jsString(text);
          const chars = Array.from(value.slice(start | 0, end | 0)).map((char) => char.charCodeAt(0));
          return breakTextImpl(self, chars, 0, chars.length, maxWidth, measured, measureForwards !== false);
        },
        'getTextWidths([CII[F)I': (self, [chars, index, count, widths]) => {
          const data = chars?.$data || [];
          if (!widths?.$data) return 0;
          let total = 0;
          for (let i = 0; i < (count | 0) && i < widths.$data.length; i++) {
            const char = String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
            widths.$data[i] = numberToFloatBits(self.paint.measureText(char));
            total++;
          }
          return total;
        },
        'getTextRunAdvances([CIIIIZ[FI)F': (self, [chars, index, count, _contextIndex, _contextCount, _rtl, advances, _advancesIndex]) => {
          const data = chars?.$data || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          if (advances?.$data) {
            let offset = index | 0;
            for (let i = 0; i < text.length && i < advances.$data.length; i++) {
              advances.$data[i] = numberToFloatBits(self.paint.measureText(text[i]));
            }
          }
          return self.paint.measureText(text);
        },
        'getTextRunCursor([CIIZII)I': (_self, [chars, _contextStart, _contextCount, _rtl, offset]) => toInt(offset),
        'getTextRunCursor(Ljava/lang/CharSequence;IIZII)I': (_self, [text, _contextStart, _contextCount, _rtl, offset]) => toInt(offset),
        'getTextPath([CIIFFLandroid/graphics/Path;)V': (self, [chars, index, count, x, y, path]) => {
          const data = chars?.$data || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          appendPathText(self, path, text, x, y);
        },
        'getTextPath(Ljava/lang/String;IIFFLandroid/graphics/Path;)V': (self, [text, start, end, x, y, path]) => {
          appendPathText(self, path, jsString(text).slice(start | 0, end | 0), x, y);
        },
        'getTextBounds([CIILandroid/graphics/Rect;)V': (self, [chars, index, count, rect]) => {
          const data = chars?.$data || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          writeTextBounds(self, text, rect);
        },
        'hasGlyph(Ljava/lang/String;)Z': () => true,
        'getRunAdvance([CIIIIZI)F': (self, [chars, index, count, _contextIndex, _contextCount, _rtl, offset]) => {
          const data = chars?.$data || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          return self.paint.measureText(text.slice(0, toInt(offset)));
        },
        'getRunAdvance(Ljava/lang/CharSequence;IIIIZI)F': (self, [text, start, end, _contextStart, _contextEnd, _rtl, offset]) => {
          const value = jsString(text).slice(start | 0, end | 0);
          return self.paint.measureText(value.slice(0, toInt(offset)));
        },
        'getOffsetForAdvance([CIIIIZF)I': (self, [chars, index, count, _contextIndex, _contextCount, _rtl, advance]) => {
          const data = chars?.$data || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          return offsetForAdvance(self, text, advance);
        },
        'getOffsetForAdvance(Ljava/lang/CharSequence;IIIIZF)I': (self, [text, start, end, _contextStart, _contextEnd, _rtl, advance]) =>
          offsetForAdvance(self, jsString(text).slice(start | 0, end | 0), advance),
        'equalsForTextMeasurement(Landroid/graphics/Paint;)Z': (self, [other]) =>
          Number(other?.$peer?.paint?.textSize ?? other?.paint?.textSize ?? 0) === Number(self.paint?.textSize ?? 0),
        'ascent()F': (self) => self.paint.getFontMetricsInt().ascent,
        'descent()F': (self) => self.paint.getFontMetricsInt().descent,
        'reset()V': (self) => { self.paint = new Paint(); },
        'measureText(Ljava/lang/String;)F': (self, [text]) => self.paint.measureText(jsString(text)),
        'measureText(Ljava/lang/CharSequence;)F': (self, [text]) => self.paint.measureText(jsString(text)),
        'getTextWidths(Ljava/lang/String;[F)I': (self, [text, widths]) => {
          const value = jsString(text);
          if (!widths?.$data) return 0;
          let count = 0;
          for (let i = 0; i < value.length && i < widths.$data.length; i++) {
            widths.$data[i] = numberToFloatBits(self.paint.measureText(value[i]));
            count++;
          }
          return count;
        },
        'breakText(Ljava/lang/String;ZF[F)I': (self, [text, measureForwards, maxWidth, measured]) => {
          const value = jsString(text);
          const limit = Number(maxWidth) || 0;
          let width = 0;
          let count = 0;
          for (const char of value) {
            const next = width + self.paint.measureText(char);
            if (next > limit) break;
            width = next;
            count++;
          }
          if (measured?.$data?.length) measured.$data[0] = numberToFloatBits(width);
          return measureForwards ? count : value.length - count;
        },
        'measureText(Ljava/lang/CharSequence;II)F': (self, [text, start, end]) => self.paint.measureText(jsString(text).slice(start | 0, end | 0)),
        'getTextWidths(Ljava/lang/CharSequence;II[F)I': (self, [text, start, end, widths]) => {
          const value = jsString(text).slice(start | 0, end | 0);
          if (!widths?.$data) return 0;
          let count = 0;
          for (let i = 0; i < value.length && i < widths.$data.length; i++) {
            widths.$data[i] = numberToFloatBits(self.paint.measureText(value[i]));
            count++;
          }
          return count;
        },
        'getTextBounds(Ljava/lang/CharSequence;IILandroid/graphics/Rect;)V': (self, [text, start, end, rect]) => {
          if (!rect) return;
          const value = jsString(text).slice(start | 0, end | 0);
          const width = Math.ceil(self.paint.measureText(value));
          rect.$fields?.set('Landroid/graphics/Rect;->left:I', 0);
          const metrics = self.paint.getFontMetrics();
          rect.$fields?.set('Landroid/graphics/Rect;->top:I', Math.ceil(metrics.top));
          rect.$fields?.set('Landroid/graphics/Rect;->right:I', width);
          rect.$fields?.set('Landroid/graphics/Rect;->bottom:I', Math.ceil(metrics.bottom));
        },
        'getTextBounds(Ljava/lang/String;IILandroid/graphics/Rect;)V': (self, [text, start, end, rect]) => {
          if (!rect) return;
          const value = jsString(text).slice(start | 0, end | 0);
          const width = Math.ceil(self.paint.measureText(value));
          rect.$fields?.set('Landroid/graphics/Rect;->left:I', 0);
          const metrics = self.paint.getFontMetrics();
          rect.$fields?.set('Landroid/graphics/Rect;->top:I', Math.ceil(metrics.top));
          rect.$fields?.set('Landroid/graphics/Rect;->right:I', width);
          rect.$fields?.set('Landroid/graphics/Rect;->bottom:I', Math.ceil(metrics.bottom));
        },
        'getFontSpacing()F': (self) => {
          const metrics = self.paint.getFontMetrics();
          return metrics.descent - metrics.ascent + metrics.leading;
        },
        'getFontMetrics()Landroid/graphics/Paint$FontMetrics;': (self, _args, vm) => {
          const metrics = self.paint.getFontMetrics();
          const object = vm.allocateRawObject('Landroid/graphics/Paint$FontMetrics;');
          for (const [key, value] of Object.entries(metrics)) {
            object.$fields.set('Landroid/graphics/Paint$FontMetrics;->' + key + ':F', numberToFloatBits(Number(value) || 0));
          }
          return object;
        },
        'getFontMetrics(Landroid/graphics/Paint$FontMetrics;)F': (self, [target], vm) => {
          const metrics = self.paint.getFontMetrics();
          if (target) {
            for (const [key, value] of Object.entries(metrics)) {
              vm.setField(target, { classDesc: 'Landroid/graphics/Paint$FontMetrics;', name: key, type: 'F' }, numberToFloatBits(Number(value) || 0));
            }
          }
          return metrics.descent - metrics.ascent;
        },
        'getFontMetricsInt()Landroid/graphics/Paint$FontMetricsInt;': (self, _args, vm) => {
          const metrics = self.paint.getFontMetricsInt();
          const object = vm.allocateRawObject('Landroid/graphics/Paint$FontMetricsInt;');
          object.$peer = { ascent: Math.floor(metrics.ascent), descent: Math.ceil(metrics.descent), leading: Math.ceil(metrics.leading), top: Math.floor(metrics.top), bottom: Math.ceil(metrics.bottom) };
          return object;
        },
        'getFontMetricsInt(Landroid/graphics/Paint$FontMetricsInt;)I': (self, [target]) => {
          const metrics = self.paint.getFontMetricsInt();
          if (target) {
            const peer = target.$peer || (target.$peer = {});
            peer.ascent = Math.floor(metrics.ascent);
            peer.descent = Math.ceil(metrics.descent);
            peer.leading = Math.ceil(metrics.leading);
            peer.top = Math.floor(metrics.top);
            peer.bottom = Math.ceil(metrics.bottom);
          }
          return Math.ceil(metrics.descent) - Math.floor(metrics.ascent);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Bitmap;', { super: 'Ljava/lang/Object;' })
  );

  defs.push(
    nativeDef('Landroid/graphics/Paint$FontMetricsInt;', {
      super: 'Ljava/lang/Object;',
      ctor: class FontMetricsIntPeer {
        constructor() { this.ascent = 0; this.descent = 0; this.top = 0; this.bottom = 0; this.leading = 0; }
      },
    })
  );

  defs.push(
    nativeDef('Landroid/text/TextPaint;', {
      super: 'Landroid/graphics/Paint;',
      ctor: class TextPaintPeer {
        constructor() { this.paint = new Paint(); }
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Canvas;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'drawColor(I)V': (self, [color]) => self.canvas?.drawColor(color),
        'drawARGB(IIII)V': (self, [a, r, g, b]) =>
          self.canvas?.drawColor((((toInt(a) & 0xff) << 24) | ((toInt(r) & 0xff) << 16) | ((toInt(g) & 0xff) << 8) | (toInt(b) & 0xff)) >>> 0),
        'drawText(Ljava/lang/String;FFLandroid/graphics/Paint;)V': (self, [text, x, y, paint]) =>
          self.canvas?.drawText(jsString(text), x, y, paint?.paint),
        'drawText(Ljava/lang/CharSequence;IIFFLandroid/graphics/Paint;)V': (self, [text, start, end, x, y, paint]) =>
          self.canvas.drawText(jsString(text).slice(start | 0, end | 0), x, y, paint),
        'drawTextRun(Ljava/lang/CharSequence;IIIIFFZLandroid/graphics/Paint;)V': (self, [text, start, end, _contextStart, _contextEnd, x, y, _rtl, paint]) =>
          self.canvas.drawText(jsString(text).slice(start | 0, end | 0), x, y, paint),
        'drawTextRun([CIIIIFFZLandroid/graphics/Paint;)V': (self, [chars, index, count, _contextIndex, _contextCount, x, y, _rtl, paint]) => {
          const value = Array.from(chars?.$data || chars || []).slice(index | 0, (index | 0) + (count | 0)).map((code) => String.fromCharCode(code)).join('');
          self.canvas.drawText(value, x, y, paint);
        },
        'drawText([CIIFFLandroid/graphics/Paint;)V': (self, [chars, index, count, x, y, paint]) => {
          const data = chars?.$data || chars || [];
          let text = '';
          for (let i = 0; i < (count | 0); i++) text += String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff);
          self.canvas?.drawText(text, x, y, paint?.paint);
        },
        'drawRect(FFFFLandroid/graphics/Paint;)V': (self, [l, t, r, b, paint]) =>
          self.canvas?.drawRect(l, t, r, b, paint?.paint),
        'drawCircle(FFFLandroid/graphics/Paint;)V': (self, [cx, cy, radius, paint]) =>
          self.canvas?.drawCircle?.(cx, cy, radius, paint?.paint),
        'drawLine(FFFFLandroid/graphics/Paint;)V': (self, [x1, y1, x2, y2, paint]) =>
          self.canvas?.drawLine?.(x1, y1, x2, y2, paint?.paint),
        'drawOval(FFFFLandroid/graphics/Paint;)V': (self, [l, t, r, b, paint]) =>
          self.canvas?.drawOval?.(l, t, r, b, paint?.paint),
        'drawOval(Landroid/graphics/RectF;Landroid/graphics/Paint;)V': (self, [rect, paint], vm) => {
          if (!rect) return;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.drawOval?.(l, t, r, b, paint?.paint);
        },
        'drawArc(FFFFFFZLandroid/graphics/Paint;)V': (self, [l, t, r, b, start, sweep, useCenter, paint]) =>
          self.canvas?.drawArc?.(l, t, r, b, start, sweep, !!useCenter, paint?.paint),
        'drawArc(Landroid/graphics/RectF;FFZLandroid/graphics/Paint;)V': (self, [rect, start, sweep, useCenter, paint], vm) => {
          if (!rect) return;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.drawArc?.(l, t, r, b, start, sweep, !!useCenter, paint?.paint);
        },
        'drawPoint(FFLandroid/graphics/Paint;)V': (self, [x, y, paint]) =>
          self.canvas?.drawPoint?.(x, y, paint?.paint),
        'drawBitmap(Landroid/graphics/Bitmap;FFLandroid/graphics/Paint;)V': (self, [bitmap, left, top], vm) => {
          const peer = resolveBitmapPeer(vm, bitmap);
          if (!peer) return;
          self.canvas?.drawBitmap?.(peer, left, top);
        },
        'drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/RectF;Landroid/graphics/Paint;)V': (self, [bitmap, src, dst, paint], vm) => {
          const peer = resolveBitmapPeer(vm, bitmap);
          if (!peer || !dst) return;
          self.canvas?.drawBitmapRect?.(peer, src, dst, paint?.paint);
        },
        'drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Matrix;Landroid/graphics/Paint;)V': (self, [bitmap, matrix, paint], vm) => {
          const peer = resolveBitmapPeer(vm, bitmap);
          if (!peer) return;
          self.canvas?.drawBitmap?.(peer, 0, 0);
        },
        'clipRect(FFFF)Z': (self, [l, t, r, b]) => {
          self.canvas?.clipRect?.(l, t, r, b);
          return true;
        },
        'clipRect(Landroid/graphics/Rect;)Z': (self, [rect]) => {
          if (!rect) return false;
          const peer = rect.$peer || rect;
          self.canvas?.clipRect?.(peer.left | 0, peer.top | 0, peer.right | 0, peer.bottom | 0);
          return true;
        },
        'clipRect(Landroid/graphics/RectF;)Z': (self, [rect], vm) => {
          if (!rect) return false;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.clipRect?.(l, t, r, b);
          return true;
        },
        'clipPath(Landroid/graphics/Path;)Z': (self, [path]) => {
          const peer = path?.$peer || path;
          self.canvas?.clipPath?.(peer?.commands || []);
          return true;
        },
        'clipPath(Landroid/graphics/Path;Landroid/graphics/Region$Op;)Z': (self, [path]) => {
          const peer = path?.$peer || path;
          self.canvas?.clipPath?.(peer?.commands || []);
          return true;
        },
        'concat(Landroid/graphics/Matrix;)V': (self, [matrix]) => {
          const m = matrix?.$peer?.matrix;
          if (m && self.canvas?.concat) self.canvas.concat(m);
        },
        'scale(FF)V': (self, [sx, sy]) => self.canvas?.scale?.(sx, sy),
        'saveLayer(Landroid/graphics/RectF;Landroid/graphics/Paint;)I': (self, [bounds, paint], vm) => {
          const rect = bounds ? readRectF(vm, bounds) : null;
          self.canvas?.saveLayer?.(rect, paint?.paint);
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayerAlpha(Landroid/graphics/RectF;I)I': (self, [bounds, alpha]) => {
          self.canvas?.saveLayer?.(null, { alpha: (toInt(alpha) & 0xff) / 255 });
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'drawPicture(Landroid/graphics/Picture;)V': () => undefined,
        'getWidth()I': (self) => Math.round(self.canvas?.width || 0),
        'getHeight()I': (self) => Math.round(self.canvas?.height || 0),
        'getDensity()I': () => 160,
        'save()I': (self) => {
          self.canvas?.save();
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'restore()V': (self) => {
          if (self.$saveDepth > 0) self.$saveDepth--;
          self.canvas?.restore();
        },
        'restoreToCount(I)V': (self, [count]) => {
          while ((self.$saveDepth || 0) > (count | 0)) {
            self.$saveDepth--;
            self.canvas?.restore();
          }
        },
        'translate(FF)V': (self, [dx, dy]) => self.canvas?.translate(dx, dy),
        'rotate(F)V': (self, [degrees]) => self.canvas?.rotate(degrees),
        'drawPath(Landroid/graphics/Path;Landroid/graphics/Paint;)V': (self, [path, paint]) => {
          const pathPeer = path?.$peer || path;
          const paintPeer = paint?.$peer || paint;
          self.canvas?.drawPath(pathPeer?.commands || [], paintPeer?.paint ?? paintPeer);
        },
        'drawRoundRect(Landroid/graphics/RectF;FFLandroid/graphics/Paint;)V': (self, [rect, rx, ry, paint], vm) => {
          if (!rect) return;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.drawRoundRect(l, t, r, b, rx, ry, paint?.paint ?? paint?.$peer?.paint ?? paint);
        },
        'drawRect(Landroid/graphics/RectF;Landroid/graphics/Paint;)V': (self, [rect, paint], vm) => {
          if (!rect) return;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.drawRect(l, t, r, b, paint?.paint ?? paint?.$peer?.paint ?? paint);
        },

        // —— 构造 / 硬件能力 ——
        '<init>()V': (self) => { self.canvas = null; self.$saveDepth = 0; },
        '<init>(Landroid/graphics/Bitmap;)V': (self, [bitmap]) => {
          self.bitmap = bitmap ?? null;
          self.canvas = bitmap?.$peer?.canvas ?? null;
          self.$saveDepth = 0;
        },
        'isHardwareAccelerated()Z': () => false,
        'setBitmap(Landroid/graphics/Bitmap;)V': (self, [bitmap]) => {
          self.bitmap = bitmap ?? null;
          self.canvas = bitmap?.$peer?.canvas ?? null;
        },
        'enableZ()V': () => undefined,
        'disableZ()V': () => undefined,
        'isOpaque()Z': () => false,
        'setDensity(I)V': (self, [density]) => { self.$density = toInt(density); },
        'getMaximumBitmapWidth()I': () => 32766,
        'getMaximumBitmapHeight()I': () => 32766,

        // —— 图层 ——
        'saveLayer(Landroid/graphics/RectF;Landroid/graphics/Paint;I)I': (self, [bounds, paint], vm) => {
          const rect = bounds ? readRectF(vm, bounds) : null;
          self.canvas?.saveLayer?.(rect, paint?.paint);
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayer(FFFFLandroid/graphics/Paint;I)I': (self, [l, t, r, b, paint]) => {
          self.canvas?.saveLayer?.([l, t, r, b], paint?.paint);
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayer(FFFFLandroid/graphics/Paint;)I': (self, [l, t, r, b, paint]) => {
          self.canvas?.saveLayer?.([l, t, r, b], paint?.paint);
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayerAlpha(Landroid/graphics/RectF;II)I': (self, [bounds, alpha], vm) => {
          const rect = bounds ? readRectF(vm, bounds) : null;
          self.canvas?.saveLayer?.(rect, { alpha: (toInt(alpha) & 0xff) / 255 });
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayerAlpha(FFFFII)I': (self, [l, t, r, b, alpha]) => {
          self.canvas?.saveLayer?.([l, t, r, b], { alpha: (toInt(alpha) & 0xff) / 255 });
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'saveLayerAlpha(FFFFI)I': (self, [l, t, r, b, alpha]) => {
          self.canvas?.saveLayer?.([l, t, r, b], { alpha: (toInt(alpha) & 0xff) / 255 });
          return (self.$saveDepth = (self.$saveDepth || 0) + 1);
        },
        'getSaveCount()I': (self) => (self.$saveDepth || 0) + 1,

        // —— 变换 ——
        'scale(FFFF)V': (self, [sx, sy, px, py]) => {
          self.canvas?.translate?.(px, py);
          self.canvas?.scale?.(sx, sy);
          self.canvas?.translate?.(-px, -py);
        },
        'setMatrix(Landroid/graphics/Matrix;)V': (self, [matrix]) => {
          const values = matrix?.$peer?.matrix || [1, 0, 0, 1, 0, 0];
          if (self.canvas?.setMatrix) self.canvas.setMatrix(values);
          else self.canvas?.concat?.(values);
        },
        'getMatrix(Landroid/graphics/Matrix;)V': (self, [target]) => {
          if (!target) return;
          const peer = target.$peer || (target.$peer = {});
          peer.matrix = [...(self.canvas?.matrix || [1, 0, 0, 1, 0, 0])];
        },
        'getMatrix()Landroid/graphics/Matrix;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Landroid/graphics/Matrix;');
          const peer = object.$peer || (object.$peer = {});
          peer.matrix = [...(self.canvas?.matrix || [1, 0, 0, 1, 0, 0])];
          return object;
        },

        // —— 裁剪 ——
        'clipRect(Landroid/graphics/RectF;Landroid/graphics/Region$Op;)Z': (self, [rect], vm) => {
          if (!rect) return false;
          const [l, t, r, b] = readRectF(vm, rect);
          self.canvas?.clipRect?.(l, t, r, b);
          return true;
        },
        'clipRect(Landroid/graphics/Rect;Landroid/graphics/Region$Op;)Z': (self, [rect]) => {
          const bounds = rectPeerBounds(rect);
          if (!bounds) return false;
          self.canvas?.clipRect?.(bounds.left, bounds.top, bounds.right, bounds.bottom);
          return true;
        },
        'clipRect(FFFFLandroid/graphics/Region$Op;)Z': (self, [l, t, r, b]) => {
          self.canvas?.clipRect?.(l, t, r, b);
          return true;
        },
        'clipRect(IIII)Z': (self, [l, t, r, b]) => {
          self.canvas?.clipRect?.(l, t, r, b);
          return true;
        },
        'clipOutRect(Landroid/graphics/RectF;)Z': () => false,
        'clipOutRect(Landroid/graphics/Rect;)Z': () => false,
        'clipOutRect(FFFF)Z': () => false,
        'clipOutRect(IIII)Z': () => false,
        'clipOutPath(Landroid/graphics/Path;)Z': () => false,
        'clipPath(Landroid/graphics/Path;Landroid/graphics/Region$Op;)Z': (self, [path]) => {
          const peer = path?.$peer || path;
          self.canvas?.clipPath?.(peer?.commands || []);
          return true;
        },
        'getDrawFilter()Landroid/graphics/DrawFilter;': (self) => self.$drawFilter ?? null,
        'setDrawFilter(Landroid/graphics/DrawFilter;)V': (self, [filter]) => { self.$drawFilter = filter ?? null; },
        'quickReject(Landroid/graphics/RectF;Landroid/graphics/Canvas$EdgeType;)Z': () => false,
        'quickReject(Landroid/graphics/RectF;)Z': () => false,
        'quickReject(Landroid/graphics/Path;Landroid/graphics/Canvas$EdgeType;)Z': () => false,
        'quickReject(Landroid/graphics/Path;)Z': () => false,
        'quickReject(FFFFLandroid/graphics/Canvas$EdgeType;)Z': () => false,
        'quickReject(FFFF)Z': () => false,
        'getClipBounds(Landroid/graphics/Rect;)Z': (self, [target]) => {
          const peer = target?.$peer || target;
          if (!peer) return false;
          const width = Math.round(self.canvas?.width || 0);
          const height = Math.round(self.canvas?.height || 0);
          peer.rect = new Rect(0, 0, width, height);
          return false;
        },
        'getClipBounds()Landroid/graphics/Rect;': (self, _args, vm) =>
          makeRectObject(vm, 0, 0, Math.round(self.canvas?.width || 0), Math.round(self.canvas?.height || 0)),

        // —— 绘制补全 ——
        'drawPicture(Landroid/graphics/Picture;Landroid/graphics/RectF;)V': () => undefined,
        'drawPicture(Landroid/graphics/Picture;Landroid/graphics/Rect;)V': () => undefined,
        'drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/Rect;Landroid/graphics/Paint;)V': (self, [bitmap, src, dst], vm) => {
          const peer = resolveBitmapPeer(vm, bitmap);
          if (!peer) return;
          self.canvas?.drawBitmapRect?.(peer, rectPeerBounds(src), rectPeerBounds(dst));
        },
        'drawBitmap([IIIFFIIZLandroid/graphics/Paint;)V': () => undefined,
        'drawBitmap([IIIIIIIZLandroid/graphics/Paint;)V': () => undefined,
        'drawBitmapMesh(Landroid/graphics/Bitmap;II[FI[IILandroid/graphics/Paint;)V': () => undefined,
        'drawColor(J)V': (self, [color]) => self.canvas?.drawColor?.(colorArgb(color)),
        'drawColor(ILandroid/graphics/PorterDuff$Mode;)V': (self, [color]) => self.canvas?.drawColor?.(toInt(color)),
        'drawColor(ILandroid/graphics/BlendMode;)V': (self, [color]) => self.canvas?.drawColor?.(toInt(color)),
        'drawColor(JLandroid/graphics/BlendMode;)V': (self, [color]) => self.canvas?.drawColor?.(colorArgb(color)),
        'drawRGB(III)V': (self, [r, g, b]) => self.canvas?.drawColor?.(packArgb(1, (toInt(r) & 0xff) / 255, (toInt(g) & 0xff) / 255, (toInt(b) & 0xff) / 255)),
        'drawPatch(Landroid/graphics/NinePatch;Landroid/graphics/Rect;Landroid/graphics/Paint;)V': () => undefined,
        'drawPatch(Landroid/graphics/NinePatch;Landroid/graphics/RectF;Landroid/graphics/Paint;)V': () => undefined,
        'drawPosText([CII[FLandroid/graphics/Paint;)V': (self, [chars, index, count, positions, paint]) => {
          const data = chars?.$data || [];
          const coords = positions?.$data || [];
          const text = Array.from({ length: count | 0 }, (_, i) => String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff)).join('');
          if (text) self.canvas?.drawText?.(text, Number(coords[0]) || 0, Number(coords[1]) || 0, paint?.paint);
        },
        'drawPosText(Ljava/lang/String;[FLandroid/graphics/Paint;)V': (self, [text, positions, paint]) => {
          const coords = positions?.$data || [];
          self.canvas?.drawText?.(jsString(text), Number(coords[0]) || 0, Number(coords[1]) || 0, paint?.paint);
        },
        'drawRect(Landroid/graphics/Rect;Landroid/graphics/Paint;)V': (self, [rect, paint]) => {
          const bounds = rectPeerBounds(rect);
          if (!bounds) return;
          self.canvas?.drawRect?.(bounds.left, bounds.top, bounds.right, bounds.bottom, paint?.paint);
        },
        'drawRoundRect(FFFFFFLandroid/graphics/Paint;)V': (self, [l, t, r, b, rx, ry, paint]) =>
          self.canvas?.drawRoundRect?.(l, t, r, b, rx, ry, paint?.paint),
        'drawDoubleRoundRect(Landroid/graphics/RectF;FFLandroid/graphics/RectF;FFLandroid/graphics/Paint;)V': () => undefined,
        'drawDoubleRoundRect(Landroid/graphics/RectF;[FLandroid/graphics/RectF;[FLandroid/graphics/Paint;)V': () => undefined,
        'drawGlyphs([II[FIILandroid/graphics/fonts/Font;Landroid/graphics/Paint;)V': () => undefined,
        'drawText(Ljava/lang/String;IIFFLandroid/graphics/Paint;)V': (self, [text, start, end, x, y, paint]) =>
          self.canvas?.drawText?.(jsString(text).slice(start | 0, end | 0), x, y, paint?.paint),
        'drawTextOnPath([CIILandroid/graphics/Path;FFLandroid/graphics/Paint;)V': (self, [chars, index, count, _path, x, y, paint]) => {
          const data = chars?.$data || [];
          const text = Array.from({ length: count | 0 }, (_, i) => String.fromCharCode((data[(index | 0) + i] | 0) & 0xffff)).join('');
          if (text) self.canvas?.drawText?.(text, x, y, paint?.paint);
        },
        'drawTextOnPath(Ljava/lang/String;Landroid/graphics/Path;FFLandroid/graphics/Paint;)V': (self, [text, _path, x, y, paint]) =>
          self.canvas?.drawText?.(jsString(text), x, y, paint?.paint),
        'drawTextRun(Landroid/graphics/text/MeasuredText;IIIIFFZLandroid/graphics/Paint;)V': () => undefined,
        'drawVertices(Landroid/graphics/Canvas$VertexMode;I[FI[FI[II[SIILandroid/graphics/Paint;)V': () => undefined,
        'drawRenderNode(Landroid/graphics/RenderNode;)V': () => undefined,
      },
    })
  );

  const PAINT_ENUM_SINGLETON = (descriptor, cacheKey) => (vm, name, ordinal) => {
    if (!vm[cacheKey]) vm[cacheKey] = new Map();
    const existing = vm[cacheKey].get(name);
    if (existing) return existing;
    const object = vm.allocateRawObject(descriptor);
    object.$peer = { name, ordinal };
    vm[cacheKey].set(name, object);
    return object;
  };
  const PAINT_STYLES = [['FILL', 0], ['STROKE', 1], ['FILL_AND_STROKE', 2]];
  const PAINT_JOINS = [['MITER', 0], ['ROUND', 1], ['BEVEL', 2]];
  const PAINT_CAPS = [['BUTT', 0], ['ROUND', 1], ['SQUARE', 2]];
  const paintStyleSingleton = PAINT_ENUM_SINGLETON('Landroid/graphics/Paint$Style;', '__paintStyles');
  const paintJoinSingleton = PAINT_ENUM_SINGLETON('Landroid/graphics/Paint$Join;', '__paintJoins');
  const paintCapSingleton = PAINT_ENUM_SINGLETON('Landroid/graphics/Paint$Cap;', '__paintCaps');
  const paintEnumStaticFields = (descriptor, entries, singleton) =>
    new Map(
      entries.map(([name, ordinal]) => [
        `${name}:${descriptor}`,
        { lazy: (vm) => singleton(vm, name, ordinal) },
      ])
    );
  const paintEnumStaticMethods = (descriptor, entries, singleton) => ({
    [`values()[${descriptor}`]: (_self, _args, vm) => {
      const array = vm.newArray(descriptor, entries.length);
      entries.forEach(([name, ordinal], index) => {
        array.$data[index] = singleton(vm, name, ordinal);
      });
      return array;
    },
    [`valueOf(Ljava/lang/String;)${descriptor}`]: (_self, [name], vm) => {
      const entry = entries.find(([entryName]) => entryName === String(name));
      return entry ? singleton(vm, entry[0], entry[1]) : null;
    },
  });
  defs.push(
    nativeDef('Landroid/graphics/Paint$Style;', {
      super: 'Ljava/lang/Object;',
      staticFields: paintEnumStaticFields('Landroid/graphics/Paint$Style;', PAINT_STYLES, paintStyleSingleton),
      staticMethods: paintEnumStaticMethods('Landroid/graphics/Paint$Style;', PAINT_STYLES, paintStyleSingleton),
      methods: {
        'name()Ljava/lang/String;': (self) => self.name,
        'ordinal()I': (self) => self.ordinal,
      },
    }),
    nativeDef('Landroid/graphics/Paint$Join;', {
      super: 'Ljava/lang/Object;',
      staticFields: paintEnumStaticFields('Landroid/graphics/Paint$Join;', PAINT_JOINS, paintJoinSingleton),
      staticMethods: paintEnumStaticMethods('Landroid/graphics/Paint$Join;', PAINT_JOINS, paintJoinSingleton),
      methods: {
        'name()Ljava/lang/String;': (self) => self.name,
        'ordinal()I': (self) => self.ordinal,
      },
    }),
    nativeDef('Landroid/graphics/Paint$Cap;', {
      super: 'Ljava/lang/Object;',
      staticFields: paintEnumStaticFields('Landroid/graphics/Paint$Cap;', PAINT_CAPS, paintCapSingleton),
      staticMethods: paintEnumStaticMethods('Landroid/graphics/Paint$Cap;', PAINT_CAPS, paintCapSingleton),
      methods: {
        'name()Ljava/lang/String;': (self) => self.name,
        'ordinal()I': (self) => self.ordinal,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Matrix;', {
      super: 'Ljava/lang/Object;',
      ctor: class MatrixPeer {
        constructor() {
          this.matrix = [1, 0, 0, 1, 0, 0];
        }
      },
      methods: {
        '<init>()V': (self) => { self.matrix = [1, 0, 0, 1, 0, 0]; },
        '<init>(Landroid/graphics/Matrix;)V': (self, [other]) => { self.matrix = [...(other?.$peer?.matrix || [1, 0, 0, 1, 0, 0])]; },
        'reset()V': (self) => { self.matrix = [1, 0, 0, 1, 0, 0]; },
        'set(Landroid/graphics/Matrix;)V': (self, [other]) => { self.matrix = [...(other?.$peer?.matrix || [1, 0, 0, 1, 0, 0])]; },
        'setConcat(Landroid/graphics/Matrix;Landroid/graphics/Matrix;)V': (self, [a, b]) => {
          self.matrix = multiplyMatrices(a?.$peer?.matrix || [1, 0, 0, 1, 0, 0], b?.$peer?.matrix || [1, 0, 0, 1, 0, 0]);
        },
        'setTranslate(FF)V': (self, [x, y]) => { self.matrix = [1, 0, 0, 1, Number(x) || 0, Number(y) || 0]; },
        'setScale(FF)V': (self, [sx, sy]) => { self.matrix = [Number(sx) || 0, 0, 0, Number(sy) || 0, 0, 0]; },
        'setScale(FFFF)V': (self, [sx, sy, px, py]) => {
          const x = Number(sx) || 0; const y = Number(sy) || 0;
          self.matrix = [x, 0, 0, y, (Number(px) || 0) * (1 - x), (Number(py) || 0) * (1 - y)];
        },
        'setRotate(F)V': (self, [degrees]) => {
          const r = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(r); const s = Math.sin(r);
          self.matrix = [c, s, -s, c, 0, 0];
        },
        'setRotate(FFF)V': (self, [degrees, px, py]) => {
          const r = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(r); const s = Math.sin(r);
          const x = Number(px) || 0; const y = Number(py) || 0;
          self.matrix = [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
        },
        'postTranslate(FF)V': (self, [x, y]) => { self.matrix = multiplyMatrices(self.matrix, [1, 0, 0, 1, Number(x) || 0, Number(y) || 0]); },
        'preTranslate(FF)V': (self, [x, y]) => { self.matrix = multiplyMatrices([1, 0, 0, 1, Number(x) || 0, Number(y) || 0], self.matrix); },
        'postScale(FF)V': (self, [sx, sy]) => { self.matrix = multiplyMatrices(self.matrix, [Number(sx) || 0, 0, 0, Number(sy) || 0, 0, 0]); },
        'preScale(FF)V': (self, [sx, sy]) => { self.matrix = multiplyMatrices([Number(sx) || 0, 0, 0, Number(sy) || 0, 0, 0], self.matrix); },
        'postRotate(F)V': (self, [degrees]) => {
          const r = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(r); const s = Math.sin(r);
          self.matrix = multiplyMatrices(self.matrix, [c, s, -s, c, 0, 0]);
        },
        'preRotate(F)Z': (self, [degrees]) => {
          const angle = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(angle); const s = Math.sin(angle);
          self.matrix = multiplyMatrices([c, s, -s, c, 0, 0], self.matrix);
          return true;
        },
        'postRotate(F)Z': (self, [degrees]) => {
          const angle = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(angle); const s = Math.sin(angle);
          self.matrix = multiplyMatrices(self.matrix, [c, s, -s, c, 0, 0]);
          return true;
        },
        'preRotate(F)V': (self, [degrees]) => {
          const r = (Number(degrees) || 0) * Math.PI / 180; const c = Math.cos(r); const s = Math.sin(r);
          self.matrix = multiplyMatrices([c, s, -s, c, 0, 0], self.matrix);
        },
        'getValues([F)V': (self, [out]) => { if (out?.$data) for (let i = 0; i < 9 && i < self.matrix.length; i++) out.$data[i] = numberToFloatBits(self.matrix[i]); },
        'setValues([F)V': (self, [values]) => { if (values?.$data) self.matrix = values.$data.slice(0, 9).map((v) => floatBitsToNumber(Number(v) | 0)); },
        'isIdentity()Z': (self) => {
          const m = self.matrix || [];
          return (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) ? 1 : 0;
        },
        'invert(Landroid/graphics/Matrix;)Z': (self, [target]) => {
          const [a, b, c, d, e, f] = self.matrix;
          const det = a * d - b * c;
          if (!det) return false;
          const inverse = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
          if (target?.$peer) target.$peer.matrix = inverse;
          return true;
        },
        'mapRect(Landroid/graphics/RectF;)Z': (self, [rect], vm) => {
          if (!rect) return false;
          const [l, t, r, b] = readRectF(vm, rect);
          const pts = [[l, t], [r, t], [l, b], [r, b]].map(([x, y]) => mapPoint(self.matrix, x, y));
          let minX = pts[0][0], maxX = pts[0][0], minY = pts[0][1], maxY = pts[0][1];
          for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
          writeRectF(vm, rect, minX, minY, maxX, maxY);
          return true;
        },
        'mapPoints([F)V': (self, [points]) => {
          if (!points?.$data) return;
          const data = points.$data;
          for (let i = 0; i + 1 < data.length; i += 2) {
            const [x, y] = mapPoint(self.matrix, floatBitsToNumber(Number(data[i]) | 0), floatBitsToNumber(Number(data[i + 1]) | 0));
            data[i] = numberToFloatBits(x);
            data[i + 1] = numberToFloatBits(y);
          }
        },
        'mapPoints([F[F)V': (self, [src, dst]) => {
          if (!src?.$data || !dst?.$data) return;
          for (let i = 0; i + 1 < src.$data.length; i += 2) {
            const [x, y] = mapPoint(self.matrix, floatBitsToNumber(Number(src.$data[i]) | 0), floatBitsToNumber(Number(src.$data[i + 1]) | 0));
            dst.$data[i] = numberToFloatBits(x);
            dst.$data[i + 1] = numberToFloatBits(y);
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Path;', {
      super: 'Ljava/lang/Object;',
      ctor: class PathPeer {
        constructor() { this.commands = []; }
      },
      methods: {
        '<init>()V': (self) => { self.commands = []; },
        '<init>(Landroid/graphics/Path;)V': (self, [other]) => { self.commands = [...(other?.commands || [])]; },
        'rewind()V': (self) => { self.commands = []; },
        'reset()V': (self) => { self.commands = []; },
        'moveTo(FF)V': (self, [x, y]) => { self.commands.push({ type: 'moveTo', x: Number(x) || 0, y: Number(y) || 0 }); },
        'lineTo(FF)V': (self, [x, y]) => { self.commands.push({ type: 'lineTo', x: Number(x) || 0, y: Number(y) || 0 }); },
        'rLineTo(FF)V': (self, [x, y]) => { self.commands.push({ type: 'rLineTo', x: Number(x) || 0, y: Number(y) || 0 }); },
        'rMoveTo(FF)V': (self, [dx, dy]) => { self.commands.push({ type: 'rMoveTo', dx: Number(dx) || 0, dy: Number(dy) || 0 }); },
        'quadTo(FFFF)V': (self, [x1, y1, x2, y2]) => { self.commands.push({ type: 'quadTo', x1: Number(x1) || 0, y1: Number(y1) || 0, x2: Number(x2) || 0, y2: Number(y2) || 0 }); },
        'rQuadTo(FFFF)V': (self, [dx1, dy1, dx2, dy2]) => { self.commands.push({ type: 'rQuadTo', dx1: Number(dx1) || 0, dy1: Number(dy1) || 0, dx2: Number(dx2) || 0, dy2: Number(dy2) || 0 }); },
        'cubicTo(FFFFFF)V': (self, [x1, y1, x2, y2, x3, y3]) => { self.commands.push({ type: 'cubicTo', x1: Number(x1) || 0, y1: Number(y1) || 0, x2: Number(x2) || 0, y2: Number(y2) || 0, x3: Number(x3) || 0, y3: Number(y3) || 0 }); },
        'rCubicTo(FFFFFF)V': (self, [dx1, dy1, dx2, dy2, dx3, dy3]) => { self.commands.push({ type: 'rCubicTo', dx1: Number(dx1) || 0, dy1: Number(dy1) || 0, dx2: Number(dx2) || 0, dy2: Number(dy2) || 0, dx3: Number(dx3) || 0, dy3: Number(dy3) || 0 }); },
        'arcTo(Landroid/graphics/RectF;FFZ)V': (self, [rect, startAngle, sweepAngle, forceMoveTo]) => {
          const peer = rect?.$peer || rect;
          const num = (v) => floatBitsToNumber(Number(v) | 0);
          self.commands.push({
            type: 'arcTo',
            left: num(peer?.left),
            top: num(peer?.top),
            right: num(peer?.right),
            bottom: num(peer?.bottom),
            startAngle: Number(startAngle) || 0,
            sweepAngle: Number(sweepAngle) || 0,
            forceMoveTo: !!forceMoveTo,
          });
        },
        'addRect(Landroid/graphics/RectF;Landroid/graphics/Path$Direction;)V': (self, [rect]) => {
          const peer = rect?.$peer || rect;
          const num = (v) => floatBitsToNumber(Number(v) | 0);
          const left = num(peer?.left);
          const top = num(peer?.top);
          const right = num(peer?.right);
          const bottom = num(peer?.bottom);
          self.commands.push(
            { type: 'moveTo', x: left, y: top },
            { type: 'lineTo', x: right, y: top },
            { type: 'lineTo', x: right, y: bottom },
            { type: 'lineTo', x: left, y: bottom },
            { type: 'close' }
          );
        },
        'addPath(Landroid/graphics/Path;Landroid/graphics/Matrix;)V': (self, [other]) => {
          const peer = other?.$peer || other;
          self.commands.push(...(peer?.commands || []));
        },
        'setFillType(Landroid/graphics/Path$FillType;)V': (self, [fillType]) => { self.fillType = fillType; },
        'computeBounds(Landroid/graphics/RectF;Z)V': (self, [rect]) => {
          if (!rect) return;
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          const add = (x, y) => {
            const px = Number(x) || 0;
            const py = Number(y) || 0;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          };
          for (const cmd of self.commands || []) {
            if (!cmd) continue;
            if (cmd.type === 'moveTo' || cmd.type === 'lineTo') add(cmd.x, cmd.y);
            else if (cmd.type === 'quadTo') { add(cmd.x1, cmd.y1); add(cmd.x2, cmd.y2); }
            else if (cmd.type === 'cubicTo') { add(cmd.x1, cmd.y1); add(cmd.x2, cmd.y2); add(cmd.x3, cmd.y3); }
            else if (cmd.type === 'arcTo') { add(cmd.left, cmd.top); add(cmd.right, cmd.bottom); }
          }
          if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
          const write = (name, value) => {
            const peer = rect.$peer;
            const bits = numberToFloatBits(value);
            if (peer && typeof peer === 'object') peer[name] = bits;
            if (rect.$fields && typeof rect.$fields.set === 'function') {
              rect.$fields.set('Landroid/graphics/RectF;->' + name + ':F', bits);
            } else if (!peer) {
              rect[name] = bits;
            }
          };
          write('left', minX);
          write('top', minY);
          write('right', maxX);
          write('bottom', maxY);
        },
        'isEmpty()Z': (self) => (self.commands || []).length === 0,
        'isConvex()Z': () => true,
        'offset(FF)V': (self, [dx, dy]) => {
          const ox = Number(dx) || 0;
          const oy = Number(dy) || 0;
          for (const cmd of self.commands || []) {
            if (!cmd) continue;
            if (cmd.type === 'moveTo' || cmd.type === 'lineTo') {
              cmd.x = (Number(cmd.x) || 0) + ox;
              cmd.y = (Number(cmd.y) || 0) + oy;
            } else if (cmd.type === 'quadTo') {
              cmd.x1 = (Number(cmd.x1) || 0) + ox;
              cmd.y1 = (Number(cmd.y1) || 0) + oy;
              cmd.x2 = (Number(cmd.x2) || 0) + ox;
              cmd.y2 = (Number(cmd.y2) || 0) + oy;
            } else if (cmd.type === 'cubicTo') {
              cmd.x1 = (Number(cmd.x1) || 0) + ox;
              cmd.y1 = (Number(cmd.y1) || 0) + oy;
              cmd.x2 = (Number(cmd.x2) || 0) + ox;
              cmd.y2 = (Number(cmd.y2) || 0) + oy;
              cmd.x3 = (Number(cmd.x3) || 0) + ox;
              cmd.y3 = (Number(cmd.y3) || 0) + oy;
            } else if (cmd.type === 'arcTo') {
              cmd.left = (Number(cmd.left) || 0) + ox;
              cmd.right = (Number(cmd.right) || 0) + ox;
              cmd.top = (Number(cmd.top) || 0) + oy;
              cmd.bottom = (Number(cmd.bottom) || 0) + oy;
            }
          }
        },
        'transform(Landroid/graphics/Matrix;)V': (self, [matrix]) => {
          const peer = matrix?.$peer || matrix;
          let a = null;
          let b = 0;
          let c = 0;
          let d = 0;
          let e = 0;
          let f = 0;
          const values = peer?.m?.values || peer?.values;
          if (Array.isArray(values) && values.length >= 6) {
            a = Number(values[0]) || 0;
            b = Number(values[1]) || 0;
            c = Number(values[2]) || 0;
            d = Number(values[3]) || 0;
            e = Number(values[4]) || 0;
            f = Number(values[5]) || 0;
          } else if (peer && typeof peer.a === 'number' && typeof peer.b === 'number' && typeof peer.c === 'number' && typeof peer.d === 'number' && typeof peer.e === 'number' && typeof peer.f === 'number') {
            a = peer.a;
            b = peer.b;
            c = peer.c;
            d = peer.d;
            e = peer.e;
            f = peer.f;
          }
          if (a === null) return;
          const map = (x, y) => {
            const px = Number(x) || 0;
            const py = Number(y) || 0;
            return [a * px + c * py + e, b * px + d * py + f];
          };
          const mapPair = (cmd, xKey, yKey) => {
            const [x, y] = map(cmd[xKey], cmd[yKey]);
            cmd[xKey] = x;
            cmd[yKey] = y;
          };
          for (const cmd of self.commands || []) {
            if (!cmd) continue;
            if (cmd.type === 'moveTo' || cmd.type === 'lineTo') {
              mapPair(cmd, 'x', 'y');
            } else if (cmd.type === 'quadTo') {
              mapPair(cmd, 'x1', 'y1');
              mapPair(cmd, 'x2', 'y2');
            } else if (cmd.type === 'cubicTo') {
              mapPair(cmd, 'x1', 'y1');
              mapPair(cmd, 'x2', 'y2');
              mapPair(cmd, 'x3', 'y3');
            } else if (cmd.type === 'arcTo') {
              const [left, top] = map(cmd.left, cmd.top);
              const [right, bottom] = map(cmd.right, cmd.bottom);
              cmd.left = Math.min(left, right);
              cmd.top = Math.min(top, bottom);
              cmd.right = Math.max(left, right);
              cmd.bottom = Math.max(top, bottom);
            }
          }
        },
        'op(Landroid/graphics/Path;Landroid/graphics/Path$Op;)Z': (self, [other]) => {
          if (other?.commands) self.commands.push(...other.commands);
          return true;
        },
        'op(Landroid/graphics/Path;Landroid/graphics/Path;Landroid/graphics/Path$Op;)Z': (self, [other1, other2]) => {
          const first = (other1?.$peer || other1)?.commands || [];
          const second = (other2?.$peer || other2)?.commands || [];
          self.commands = [...first, ...second];
          return true;
        },
        'close()V': (self) => { self.commands.push({ type: 'close' }); },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/Log;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'isLoggable(Ljava/lang/String;I)Z': () => false,
        'v(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
        'd(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
        'i(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('info', jsString(tag), jsString(message));
          return 0;
        },
        'w(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('warn', jsString(tag), jsString(message));
          return 0;
        },
        'e(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('error', jsString(tag), jsString(message));
          return 0;
        },
        'e(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I': (_self, [tag, message], vm) => {
          vm.log('error', jsString(tag), jsString(message));
          return 0;
        },
        'w(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I': (_self, [tag, message], vm) => {
          vm.log('warn', jsString(tag), jsString(message));
          return 0;
        },
        'i(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I': (_self, [tag, message], vm) => {
          vm.log('info', jsString(tag), jsString(message));
          return 0;
        },
        'd(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
        'v(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Throwable;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/ComponentName;', {
      super: 'Ljava/lang/Object;',
      ctor: class ComponentNamePeer {
        constructor() {
          this.pkg = '';
          this.cls = '';
        }
      },
      methods: {
        '<init>(Ljava/lang/String;Ljava/lang/String;)V': (self, [pkg, cls]) => {
          self.pkg = jsString(pkg);
          self.cls = jsString(cls);
        },
        '<init>(Landroid/content/Context;Ljava/lang/Class;)V': (self, [context, klass], vm) => {
          self.pkg = vm.packageName || '';
          self.cls = klass?.$dexClass?.name || '';
        },
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.toJavaString(self.pkg),
        'getClassName()Ljava/lang/String;': (self, _args, vm) => vm.toJavaString(self.cls),
        'getShortClassName()Ljava/lang/String;': (self, _args, vm) => {
          const pkg = self.pkg;
          if (self.cls?.startsWith(`${pkg}.`)) return vm.toJavaString(self.cls.slice(pkg.length));
          return vm.toJavaString(self.cls);
        },
        'flattenToString()Ljava/lang/String;': (self) => `${self.pkg}/${self.cls}`,
        'flattenToShortString()Ljava/lang/String;': (self) => {
          const pkg = self.pkg;
          if (self.cls?.startsWith(`${pkg}.`)) return `${pkg}/${self.cls.slice(pkg.length)}`;
          return `${pkg}/${self.cls}`;
        },
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer;
          return !!peer && peer.pkg === self.pkg && peer.cls === self.cls;
        },
        'hashCode()I': (self) => {
          const text = `${self.pkg}/${self.cls}`;
          let hash = 0;
          for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
          return hash;
        },
        'toString()Ljava/lang/String;': (self) => `ComponentInfo{${self.pkg}/${self.cls}}`,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ActivityInfo;', {
      super: 'Landroid/content/pm/PackageItemInfo;',
      ctor: class ActivityInfoPeer {
        constructor() {
          this.parentActivityName = null;
          this.metaData = null;
          this.name = '';
          this.packageName = '';
          this.theme = 0;
          this.launchMode = 0;
          this.exported = false;
        }
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageItemInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'loadLabel(Landroid/content/pm/PackageManager;)Ljava/lang/CharSequence;': (self) =>
          self.label || self.name || self.packageName || '',
        'loadIcon(Landroid/content/pm/PackageManager;)Landroid/graphics/drawable/Drawable;': () => null,
        'loadLogo(Landroid/content/pm/PackageManager;)Landroid/graphics/drawable/Drawable;': () => null,
        'loadUnbadgedIcon(Landroid/content/pm/PackageManager;)Landroid/graphics/drawable/Drawable;': () => null,
        'loadDefaultIcon(Landroid/content/pm/PackageManager;)Landroid/graphics/drawable/Drawable;': () => null,
        'loadXmlMetaData(Landroid/content/pm/PackageManager;Ljava/lang/String;)Landroid/content/res/XmlResourceParser;': () => null,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageManager;', {
      super: 'Ljava/lang/Object;',
      ctor: class PackageManagerPeer {
        constructor(vm) {
          this.vm = vm;
        }
      },
      methods: {
        // 清单属性可能是字符串，也可能是 {reference}/TypedValue 对象，统一归一成字符串再比较。
        'getActivityInfo(Landroid/content/ComponentName;I)Landroid/content/pm/ActivityInfo;': (self, [component], vm) => {
          const peer = component?.$peer;
          const className = peer?.cls || '';
          const manifest = vm.apk?.manifest;
          const application = manifest?.findChild?.('application');
          const activities = application?.findAll?.('activity') || [];
          const target = activities.find((activity) => {
            const rawName = manifestAttrText(activity, 'android:name', 'name');
            let fullName = rawName;
            if (rawName.startsWith('.')) fullName = `${peer?.pkg || ''}${rawName}`;
            else if (rawName && !rawName.includes('.')) fullName = `${peer?.pkg || ''}.${rawName}`;
            return fullName === className || rawName === className;
          });
          if (!target) return null;
          const info = vm.allocateRawObject('Landroid/content/pm/ActivityInfo;');
          const infoPeer = { vm, constructor: { $descriptor: 'Landroid/content/pm/ActivityInfo;' } };
          info.$peer = infoPeer;
          infoPeer.name = manifestAttrText(target, 'android:name', 'name');
          infoPeer.packageName = peer?.pkg || vm.packageName || '';
          infoPeer.parentActivityName = target.getAttribute('android:parentActivityName');
          infoPeer.exported = manifestAttrText(target, 'android:exported').toLowerCase() === 'true';
          const themeRaw = target.getAttribute('android:theme');
          if (themeRaw) {
            const resolved = vm.resources.resolveAttribute?.(themeRaw);
            if (typeof resolved === 'number') infoPeer.theme = resolved;
          }
          return info;
        },
        'getInstalledPackages(I)Ljava/util/List;': (_self, _args, vm) => {
          const packageName = vm.packageName || 'app';
          const appInfo = vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;');
          const label = applicationLabel(vm, packageName);
          appInfo.$peer = { vm, packageName, name: packageName, label, flags: 0, uid: 10000 };
          const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
          info.$peer = { vm, packageName, versionName: '1.0', versionCode: 1, applicationInfo: appInfo };
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          list.$peer = { items: [info] };
          return list;
        },
        'getInstalledApplications(I)Ljava/util/List;': (_self, _args, vm) => {
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          list.$peer = { items: [] };
          return list;
        },
        'getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;': (self, [pkg], vm) => {
          const requested = jsString(pkg);
          const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
          info.$peer = {
            vm,
            constructor: { $descriptor: 'Landroid/content/pm/PackageInfo;' },
            packageName: jsString(pkg),
          };
          return info;
        },
        'queryIntentActivities(Landroid/content/Intent;I)Ljava/util/List;': (_self, [intent], vm) => {
          const list = emptyJavaList(vm);
          const peer = intent?.$peer || intent;
          const info = resolveIntentComponent(vm, peer, null);
          if (!info) return list;
          list.$peer = { items: [resolveInfoObject(vm, info, peer)] };
          return list;
        },
        'resolveActivity(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;': (_self, [intent], vm) => {
          const peer = intent?.$peer || intent;
          const info = resolveIntentComponent(vm, peer, null);
          return info ? resolveInfoObject(vm, info, peer) : null;
        },
        'queryBroadcastReceivers(Landroid/content/Intent;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'resolveService(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;': () => null,
        'queryIntentServices(Landroid/content/Intent;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'queryIntentContentProviders(Landroid/content/Intent;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'resolveContentProvider(Ljava/lang/String;I)Landroid/content/pm/ProviderInfo;': () => null,
        'queryContentProviders(Ljava/lang/String;II)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'queryIntentActivityOptions(Landroid/content/ComponentName;[Landroid/content/Intent;Landroid/content/Intent;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;': (_self, [pkg], vm) => {
          const requested = jsString(pkg);
          if (requested && vm.packageName && requested !== vm.packageName) return null;
          const main = vm.findMainActivity?.(vm.apk?.manifest);
          if (!main) return null;
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.MAIN';
          intent.$peer.categories = ['android.intent.category.LAUNCHER'];
          intent.$peer.flags = 0x10000000 | 0x20000000;
          intent.$peer.className = manifestClassName(manifestAttrText(main, 'android:name', 'name'), vm.packageName || '');
          intent.$peer.packageName = vm.packageName || null;
          return intent;
        },
        'getLeanbackLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;': (_self, [pkg], vm) => {
          const requested = jsString(pkg);
          if (requested && vm.packageName && requested !== vm.packageName) return null;
          const main = vm.findMainActivity?.(vm.apk?.manifest);
          if (!main) return null;
          const intent = makeIntentObject(vm);
          intent.$peer.action = 'android.intent.action.MAIN';
          intent.$peer.categories = ['android.intent.category.LEANBACK_LAUNCHER'];
          intent.$peer.flags = 0x10000000 | 0x20000000;
          intent.$peer.className = manifestClassName(manifestAttrText(main, 'android:name', 'name'), vm.packageName || '');
          intent.$peer.packageName = vm.packageName || null;
          return intent;
        },
        'getPackageUid(Ljava/lang/String;I)I': (_self, [pkg], vm) =>
          jsString(pkg) === (vm.packageName || '') ? 10000 : -1,
        'getPackageGids(Ljava/lang/String;)[I': (_self, [pkg], vm) =>
          jsString(pkg) === (vm.packageName || '') ? vm.newArray('[I', 1, [10000]) : vm.newArray('[I', 0, null),
        'getPackageGids(Ljava/lang/String;I)[I': (_self, [pkg], vm) =>
          jsString(pkg) === (vm.packageName || '') ? vm.newArray('[I', 1, [10000]) : vm.newArray('[I', 0, null),
        'getPackagesForUid(I)[Ljava/lang/String;': (_self, [uid], vm) =>
          (uid | 0) === 10000 && vm.packageName
            ? vm.newArray('[Ljava/lang/String;', 1, [vm.packageName])
            : vm.newArray('[Ljava/lang/String;', 0, null),
        'getNameForUid(I)Ljava/lang/String;': (_self, [uid], vm) => ((uid | 0) === 10000 ? vm.packageName || null : null),
        'checkPermission(Ljava/lang/String;Ljava/lang/String;)I': () => 0,
        'checkSignatures(Ljava/lang/String;Ljava/lang/String;)I': () => 0,
        'checkSignatures(II)I': () => 0,
        'isPermissionRevokedByPolicy(Ljava/lang/String;Ljava/lang/String;)Z': () => false,
        'addPermission(Landroid/content/pm/PermissionInfo;)Z': () => true,
        'addPermissionAsync(Landroid/content/pm/PermissionInfo;)Z': () => true,
        'removePermission(Ljava/lang/String;)V': () => undefined,
        'getPermissionInfo(Ljava/lang/String;I)Landroid/content/pm/PermissionInfo;': () => null,
        'queryPermissionsByGroup(Ljava/lang/String;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getPermissionGroupInfo(Ljava/lang/String;I)Landroid/content/pm/PermissionGroupInfo;': () => null,
        'getAllPermissionGroups(I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getPackagesHoldingPermissions([Ljava/lang/String;I)Ljava/util/List;': (_self, _args, vm) => {
          const list = emptyJavaList(vm);
          const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
          info.$peer = { vm, packageName: vm.packageName || '', versionName: '1.0', versionCode: 1 };
          list.$peer = { items: [info] };
          return list;
        },
        'getPlatformPermissionsForGroup(Ljava/lang/String;Ljava/util/concurrent/Executor;Ljava/util/function/Consumer;)V': () => undefined,
        'getGroupOfPlatformPermission(Ljava/lang/String;Ljava/util/concurrent/Executor;Ljava/util/function/Consumer;)V': () => undefined,
        'getWhitelistedRestrictedPermissions(Ljava/lang/String;I)Ljava/util/Set;': (_self, _args, vm) => {
          const set = vm.allocateRawObject('Ljava/util/HashSet;');
          set.$peer = { items: [] };
          return set;
        },
        'addWhitelistedRestrictedPermission(Ljava/lang/String;Ljava/lang/String;I)Z': () => true,
        'removeWhitelistedRestrictedPermission(Ljava/lang/String;Ljava/lang/String;I)Z': () => true,
        'setAutoRevokeWhitelisted(Ljava/lang/String;Z)Z': () => true,
        'isAutoRevokeWhitelisted(Ljava/lang/String;)Z': () => false,
        'getBackgroundPermissionOptionLabel()Ljava/lang/CharSequence;': () => 'Allow',
        'getTargetSdkVersion(Ljava/lang/String;)I': () => 31,
        'getReceiverInfo(Landroid/content/ComponentName;I)Landroid/content/pm/ActivityInfo;': () => null,
        'getServiceInfo(Landroid/content/ComponentName;I)Landroid/content/pm/ServiceInfo;': () => null,
        'getProviderInfo(Landroid/content/ComponentName;I)Landroid/content/pm/ProviderInfo;': () => null,
        'getModuleInfo(Ljava/lang/String;I)Landroid/content/pm/ModuleInfo;': () => null,
        'getInstalledModules(I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'isInstantApp()Z': () => false,
        'isInstantApp(Ljava/lang/String;)Z': () => false,
        'getInstantAppCookieMaxBytes()I': () => 0,
        'getInstantAppCookie()[B': (_self, _args, vm) => vm.newArray('[B', 0, null),
        'clearInstantAppCookie()V': () => undefined,
        'updateInstantAppCookie([B)V': () => undefined,
        'getSharedLibraries(I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getChangedPackages(I)Landroid/content/pm/ChangedPackages;': () => null,
        'getInstrumentationInfo(Landroid/content/ComponentName;I)Landroid/content/pm/InstrumentationInfo;': () => null,
        'queryInstrumentation(Ljava/lang/String;I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getDefaultActivityIcon()Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationIconDrawable(vm),
        'getApplicationIcon(Landroid/content/pm/ApplicationInfo;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationIconDrawable(vm),
        'getApplicationIcon(Ljava/lang/String;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationIconDrawable(vm),
        'getActivityIcon(Landroid/content/ComponentName;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationIconDrawable(vm),
        'getActivityIcon(Landroid/content/Intent;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationIconDrawable(vm),
        'getActivityBanner(Landroid/content/ComponentName;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationBannerDrawable(vm),
        'getActivityBanner(Landroid/content/Intent;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationBannerDrawable(vm),
        'getApplicationBanner(Landroid/content/pm/ApplicationInfo;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationBannerDrawable(vm),
        'getApplicationBanner(Ljava/lang/String;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationBannerDrawable(vm),
        'getActivityLogo(Landroid/content/ComponentName;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationLogoDrawable(vm),
        'getActivityLogo(Landroid/content/Intent;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationLogoDrawable(vm),
        'getApplicationLogo(Landroid/content/pm/ApplicationInfo;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationLogoDrawable(vm),
        'getApplicationLogo(Ljava/lang/String;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) => applicationLogoDrawable(vm),
        'getUserBadgedIcon(Landroid/graphics/drawable/Drawable;Landroid/os/UserHandle;)Landroid/graphics/drawable/Drawable;': (_self, [icon]) => icon ?? null,
        'getUserBadgedDrawableForDensity(Landroid/graphics/drawable/Drawable;Landroid/os/UserHandle;Landroid/graphics/Rect;I)Landroid/graphics/drawable/Drawable;': (_self, [icon]) => icon ?? null,
        'getUserBadgedLabel(Ljava/lang/CharSequence;Landroid/os/UserHandle;)Ljava/lang/CharSequence;': (_self, [label]) => label ?? null,
        'getText(Ljava/lang/String;ILandroid/content/pm/ApplicationInfo;)Ljava/lang/CharSequence;': (_self, [_pkg, resId], vm) =>
          vm.resources.getString(resId >>> 0),
        'getXml(Ljava/lang/String;ILandroid/content/pm/ApplicationInfo;)Landroid/content/res/XmlResourceParser;': () => null,
        'getApplicationLabel(Landroid/content/pm/ApplicationInfo;)Ljava/lang/CharSequence;': (_self, [info], vm) =>
          info?.$peer?.label ?? applicationLabel(vm, info?.$peer?.packageName),
        'getResourcesForActivity(Landroid/content/ComponentName;)Landroid/content/res/Resources;': (_self, _args, vm) => vm.resourcesObject,
        'getResourcesForApplication(Landroid/content/pm/ApplicationInfo;)Landroid/content/res/Resources;': (_self, _args, vm) => vm.resourcesObject,
        'getResourcesForApplication(Landroid/content/pm/ApplicationInfo;Landroid/content/res/Configuration;)Landroid/content/res/Resources;': (_self, _args, vm) => vm.resourcesObject,
        'getResourcesForApplication(Ljava/lang/String;)Landroid/content/res/Resources;': (_self, _args, vm) => vm.resourcesObject,
        'getPackageArchiveInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;': () => null,
        'verifyPendingInstall(II)V': () => undefined,
        'extendVerificationTimeout(IIJ)V': () => undefined,
        'setInstallerPackageName(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'getInstallerPackageName(Ljava/lang/String;)Ljava/lang/String;': () => null,
        'getInstallSourceInfo(Ljava/lang/String;)Landroid/content/pm/InstallSourceInfo;': () => null,
        'addPackageToPreferred(Ljava/lang/String;)V': () => undefined,
        'removePackageFromPreferred(Ljava/lang/String;)V': () => undefined,
        'getPreferredPackages(I)Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'addPreferredActivity(Landroid/content/IntentFilter;I[Landroid/content/ComponentName;Landroid/content/ComponentName;)V': () => undefined,
        'clearPackagePreferredActivities(Ljava/lang/String;)V': () => undefined,
        'currentToCanonicalPackageNames([Ljava/lang/String;)[Ljava/lang/String;': (_self, [names]) => names ?? null,
        'canonicalToCurrentPackageNames([Ljava/lang/String;)[Ljava/lang/String;': (_self, [names]) => names ?? null,
        'getPackageInfo(Landroid/content/pm/VersionedPackage;I)Landroid/content/pm/PackageInfo;': (_self, [versioned], vm) => {
          const pkg = versioned?.$peer?.packageName ?? null;
          const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
          info.$peer = { vm, packageName: pkg || vm.packageName || '', versionName: '1.0', versionCode: 1 };
          return info;
        },
        'getSystemAvailableFeatures()[Landroid/content/pm/FeatureInfo;': (_self, _args, vm) => {
          const names = systemFeatureNames();
          const array = vm.newArray('[Landroid/content/pm/FeatureInfo;', names.length, null);
          for (let i = 0; i < names.length; i++) {
            const info = vm.allocateRawObject('Landroid/content/pm/FeatureInfo;');
            info.$peer = { vm, name: names[i], reqGlEsVersion: 0x00030000, version: 0 };
            info.name = names[i];
            info.reqGlEsVersion = 0x00030000;
            array.$data[i] = info;
          }
          return array;
        },
        'getSystemSharedLibraryNames()[Ljava/lang/String;': (_self, _args, vm) =>
          vm.newArray('[Ljava/lang/String;', 0, null),
        'hasSystemFeature(Ljava/lang/String;)Z': (_self, [name]) => systemFeatureNames().includes(jsString(name)),
        'hasSystemFeature(Ljava/lang/String;I)Z': (_self, [name]) => systemFeatureNames().includes(jsString(name)),
        'getApplicationInfo(Ljava/lang/String;I)Landroid/content/pm/ApplicationInfo;': (self, [pkg], vm) => {
          const requested = jsString(pkg);
          const info = vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;');
          const application = vm.apk?.manifest?.findChild?.('application') || null;
          const metadata = vm.allocateRawObject('Landroid/os/Bundle;');
          const values = manifestMetaDataMap(vm, application);
          metadata.$peer = { map: values };
          info.$peer = {
            vm,
            constructor: { $descriptor: 'Landroid/content/pm/ApplicationInfo;' },
            packageName: requested || vm.packageName || '',
            metaData: metadata,
            className: manifestAttrText(application, 'name'),
          };
          return info;
        },
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getLongVersionCode()J': (self) => BigInt(Number(self.versionCode) || 0),
        'toString()Ljava/lang/String;': (self) => `PackageInfo{${self.packageName}}`,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ResolveInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'loadLabel(Landroid/content/pm/PackageManager;)Ljava/lang/CharSequence;': (self, _args, vm) =>
          self?.nonLocalizedLabel ?? applicationLabel(vm, self?.resolvePackageName ?? vm?.packageName ?? ''),
        'loadIcon(Landroid/content/pm/PackageManager;)Landroid/graphics/drawable/Drawable;': (_self, _args, vm) =>
          applicationIconDrawable(vm),
        'toString()Ljava/lang/String;': (self) =>
          `ResolveInfo{${self?.activityInfo?.name ?? self?.resolvePackageName ?? ''}}`,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ApplicationInfo;', { super: 'Landroid/content/pm/PackageItemInfo;' })
  );
  defs.push(
    nativeDef('Landroid/content/res/Configuration;', {
      super: 'Ljava/lang/Object;',
      ctor: class ConfigurationPeer {
        constructor(other) {
          this.uiMode = other?.$peer?.uiMode ?? ((typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 0x20 : 0x10);
          this.fontScale = other?.$peer?.fontScale ?? 1;
          this.orientation = other?.$peer?.orientation ?? 1;
          this.screenWidthDp = other?.$peer?.screenWidthDp ?? 360;
          this.screenHeightDp = other?.$peer?.screenHeightDp ?? 640;
          this.densityDpi = other?.$peer?.densityDpi ?? 420;
        }
      },
      methods: {
        '<init>()V': () => undefined,
        '<init>(Landroid/content/res/Configuration;)V': (self, [other]) => {
          const peer = other?.$peer || {};
          self.uiMode = peer.uiMode ?? ((typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 0x20 : 0x10);
          self.fontScale = peer.fontScale ?? 1;
          self.orientation = peer.orientation ?? 1;
          self.screenWidthDp = peer.screenWidthDp ?? 360;
          self.screenHeightDp = peer.screenHeightDp ?? 640;
          self.densityDpi = peer.densityDpi ?? 420;
        },
        'toString()Ljava/lang/String;': () => 'Configuration{}',
        'getLocales()Landroid/os/LocaleList;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Landroid/os/LocaleList;');
          object.$peer = { locales: [makeDefaultLocaleObject(vm)] };
          return object;
        },
        'getLocale()Ljava/util/Locale;': (self, _args, vm) => makeDefaultLocaleObject(vm),
        'getLayoutDirection()I': () => 0,
        'isNightModeActive()Z': (self) => (((self.uiMode | 0) & 0x30) === 0x20 ? 1 : 0),
      },
      instanceFields: new Map([['uiMode:I', 0x10]]),
    })
  );
  defs.push(
    nativeDef('Landroid/util/DisplayMetrics;', {
      super: 'Ljava/lang/Object;',
      ctor: class MetricsPeer {
        constructor() {
          this.widthPixels = 360;
          this.heightPixels = 720;
          this.density = 1;
          this.densityDpi = 160;
          this.scaledDensity = 1;
        }
      },
      instanceFields: new Map([
        ['widthPixels:I', 360],
        ['heightPixels:I', 720],
        ['density:F', 1],
        ['densityDpi:I', 160],
        ['scaledDensity:F', 1],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/text/TextUtils;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'isEmpty(Ljava/lang/CharSequence;)Z': (_self, [value]) => {
          if (value === null || value === undefined) return true;
          return jsString(value).length === 0;
        },
        // Material 的文本比较大量走 TextUtils.equals，缺了它标签永远判为不等。
        'equals(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Z': (_self, [a, b]) => {
          const empty = (v) => v === null || v === undefined;
          if (empty(a) || empty(b)) return empty(a) && empty(b);
          return jsString(a) === jsString(b);
        },
        'join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)Ljava/lang/String;': (_self, [separator, values], vm) => {
          let items = values?.items || (Array.isArray(values) ? values : null);
          if (!items && vm && values) {
            const peer = vm.registry?.getPeer?.(values, 'Ljava/lang/Iterable;');
            items = peer?.items || peer?.setItems || null;
          }
          const joined = (items || []).map((item) => jsString(item)).join(jsString(separator));
          return joined;
        },
      },
    })
  );

    defs.push(
    nativeDef('Landroid/os/BatteryManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getLongProperty(I)J': (_self, [property]) => {
          switch (property | 0) {
            case 1: return 3200000;   // CHARGE_COUNTER
            case 2: return -420000;   // CURRENT_NOW
            case 3: return -400000;   // CURRENT_AVERAGE
            case 4: return 87;        // CAPACITY
            case 5: return 12000000;  // ENERGY_COUNTER
            case 6: return 2;         // STATUS
            default: return 0;
          }
        },
        'getIntProperty(I)I': (self, [property], vm) => {
          const value = vm.registry.invokeNative
            ? null
            : null;
          void value;
          switch (property | 0) {
            case 1: return 3200000;
            case 2: return -420000;
            case 3: return -400000;
            case 4: return 87;
            case 5: return 12000000;
            case 6: return 2;
            default: return 0;
          }
        },
        'isCharging()Z': () => true,
        'getStringProperty(I)Ljava/lang/String;': () => null,
        'computeChargeTimeRemaining()J': () => BigInt(-1),
      },
    }),
    nativeDef('Landroid/hardware/usb/UsbManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getDeviceList()Ljava/util/HashMap;': (_self, _args, vm) => {
          const map = vm.allocateRawObject('Ljava/util/HashMap;');
          map.$peer = { map: new Map() };
          return map;
        },
        'getAccessoryList()[Landroid/hardware/usb/UsbAccessory;': () => null,
        'hasPermission(Landroid/hardware/usb/UsbDevice;)Z': () => false,
        'openDevice(Landroid/hardware/usb/UsbDevice;)Landroid/hardware/usb/UsbDeviceConnection;': () => null,
      },
    }),
    nativeDef('Landroid/os/UserHandle;', {
      super: 'Ljava/lang/Object;',
      interfaces: ['Landroid/os/Parcelable;'],
      ctor: class UserHandlePeer {
        constructor(vm, id) {
          this.vm = vm;
          this.id = Number(id) || 0;
        }
      },
      methods: {
        '<init>(I)V': (self, [id]) => { self.id = id | 0; },
        'getIdentifier()I': (self) => self.id | 0,
        'hashCode()I': (self) => self.id | 0,
        'equals(Ljava/lang/Object;)Z': (self, [other]) => (other?.id | 0) === (self.id | 0),
        'toString()Ljava/lang/String;': (self) => `UserHandle{${self.id | 0}}`,
        'describeContents()I': () => 0,
      },
      staticMethods: {
        'myUserId()I': () => 0,
        'getUserHandleForUid(I)Landroid/os/UserHandle;': (_self, _args, vm) => {
          const handle = vm.allocateRawObject('Landroid/os/UserHandle;');
          handle.$peer = { vm, id: 0 };
          return handle;
        },
      },
      staticFields: new Map([
        ['USER_OWNER:Landroid/os/UserHandle;', 0],
        ['USER_CURRENT:Landroid/os/UserHandle;', 0],
        ['USER_ALL:Landroid/os/UserHandle;', -1],
      ]),
    }),
    nativeDef('Landroid/os/UserManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'isUserUnlocked()Z': () => true,
        'isUserUnlocked(Landroid/os/UserHandle;)Z': () => true,
        'isUserUnlocked(I)Z': () => true,
        'isManagedProfile()Z': () => false,
        'isManagedProfile(Landroid/os/UserHandle;)Z': () => false,
        'isSystemUser()Z': () => true,
        'isPrimaryUser()Z': () => true,
        'isAdminUser()Z': () => true,
        'isDemoUser()Z': () => false,
        'isUserAGoat()Z': () => false,
        'isLinkedUser()Z': () => false,
        'isGuestUser()Z': () => false,
        'getUserCount()I': () => 1,
        'getUserName()Ljava/lang/String;': () => 'apk.js',
        'getSerialNumberForUser(Landroid/os/UserHandle;)J': () => BigInt(0),
        'getUserForSerialNumber(J)Landroid/os/UserHandle;': (_self, _args, vm) => {
          const handle = vm.allocateRawObject('Landroid/os/UserHandle;');
          handle.$peer = { vm, id: 0 };
          return handle;
        },
        'getProfileParent(Landroid/os/UserHandle;)Landroid/os/UserHandle;': () => null,
        'getUserHandle()Landroid/os/UserHandle;': (_self, _args, vm) => {
          const handle = vm.allocateRawObject('Landroid/os/UserHandle;');
          handle.$peer = { vm, id: 0 };
          return handle;
        },
        'getUsers()Ljava/util/List;': (_self, _args, vm) => {
          const object = vm.allocateRawObject('Ljava/util/ArrayList;');
          const peer = { items: [] };
          const handle = vm.allocateRawObject('Landroid/os/UserHandle;');
          handle.$peer = { vm, id: 0 };
          peer.items.push(handle);
          object.$peer = Object.assign({ constructor: { $descriptor: 'Ljava/util/ArrayList;' } }, peer);
          return object;
        },
        'getApplicationRestrictions(Ljava/lang/String;)Landroid/os/Bundle;': () => null,
      },
      staticMethods: {
        'get(Landroid/content/Context;)Landroid/os/UserManager;': (_self, _args, vm) => vm.getSystemService?.('user') ?? null,
      },
    }),
    );

  defs.push(
    nativeDef('Landroid/os/Build;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['VERSION:Landroid/os/Build$VERSION;', { $descriptor: 'Landroid/os/Build$VERSION;' }],
        ['MODEL:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.model'] }],
        ['MANUFACTURER:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.manufacturer'] }],
        ['BRAND:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.brand'] }],
        ['DEVICE:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.device'] }],
        ['PRODUCT:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.name'] }],
        ['BOARD:Ljava/lang/String;', { lazy: () => systemProperties()['ro.product.board'] }],
        ['HARDWARE:Ljava/lang/String;', { lazy: () => systemProperties()['ro.hardware'] }],
        ['FINGERPRINT:Ljava/lang/String;', { lazy: () => systemProperties()['ro.build.fingerprint'] }],
        ['TYPE:Ljava/lang/String;', 'user'],
        ['TAGS:Ljava/lang/String;', 'release-keys'],
        ['ID:Ljava/lang/String;', 'SQ3A.220705.004'],
        ['DISPLAY:Ljava/lang/String;', 'SQ3A.220705.004'],
        ['HOST:Ljava/lang/String;', 'apk.js'],
        ['USER:Ljava/lang/String;', 'apk.js'],
        ['CPU_ABI:Ljava/lang/String;', 'arm64-v8a'],
        ['CPU_ABI2:Ljava/lang/String;', ''],
        ['SUPPORTED_ABIS:[Ljava/lang/String;', { lazy(vm) { const a = vm.newArray('[Ljava/lang/String;', 3, null); ['arm64-v8a', 'armeabi-v7a', 'armeabi'].forEach((s, i) => { a.$data[i] = s; }); return a; } }],
        ['SUPPORTED_64_BIT_ABIS:[Ljava/lang/String;', { lazy(vm) { const a = vm.newArray('[Ljava/lang/String;', 1, null); a.$data[0] = 'arm64-v8a'; return a; } }],
        ['SUPPORTED_32_BIT_ABIS:[Ljava/lang/String;', { lazy(vm) { const a = vm.newArray('[Ljava/lang/String;', 2, null); a.$data[0] = 'armeabi-v7a'; a.$data[1] = 'armeabi'; return a; } }],
        ['RADIO:Ljava/lang/String;', 'unknown'],
        ['BOOTLOADER:Ljava/lang/String;', 'unknown'],
        ['SERIAL:Ljava/lang/String;', 'unknown'],
        ['TIME:I', 0],
        ['SOC_MANUFACTURER:Ljava/lang/String;', 'apk.js'],
        ['SOC_MODEL:Ljava/lang/String;', 'browser'],
      ]),
    })
  );
  defs.push(
    nativeDef('Landroid/os/Build$VERSION;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['SDK_INT:I', 31],
        ['RELEASE:Ljava/lang/String;', '12'],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/telephony/TelephonyManager;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['SIM_STATE_UNKNOWN:I', 0], ['SIM_STATE_ABSENT:I', 1], ['SIM_STATE_PIN_REQUIRED:I', 2],
        ['SIM_STATE_PUK_REQUIRED:I', 3], ['SIM_STATE_NETWORK_LOCKED:I', 4], ['SIM_STATE_READY:I', 5],
        ['SIM_STATE_NOT_READY:I', 6], ['SIM_STATE_PERM_DISABLED:I', 7], ['SIM_STATE_CARD_IO_ERROR:I', 8],
        ['SIM_STATE_CARD_RESTRICTED:I', 9], ['SIM_STATE_LOADED:I', 10],
        ['PHONE_TYPE_NONE:I', 0], ['PHONE_TYPE_GSM:I', 1], ['PHONE_TYPE_CDMA:I', 2], ['PHONE_TYPE_SIP:I', 3],
        ['NETWORK_TYPE_UNKNOWN:I', 0], ['NETWORK_TYPE_GPRS:I', 1], ['NETWORK_TYPE_EDGE:I', 2],
        ['NETWORK_TYPE_UMTS:I', 3], ['NETWORK_TYPE_CDMA:I', 4], ['NETWORK_TYPE_EVDO_0:I', 5],
        ['NETWORK_TYPE_EVDO_A:I', 6], ['NETWORK_TYPE_1xRTT:I', 7], ['NETWORK_TYPE_HSDPA:I', 8],
        ['NETWORK_TYPE_HSUPA:I', 9], ['NETWORK_TYPE_HSPA:I', 10], ['NETWORK_TYPE_IDEN:I', 11],
        ['NETWORK_TYPE_EVDO_B:I', 12], ['NETWORK_TYPE_LTE:I', 13], ['NETWORK_TYPE_EHRPD:I', 14],
        ['NETWORK_TYPE_HSPAP:I', 15], ['NETWORK_TYPE_GSM:I', 16], ['NETWORK_TYPE_TD_SCDMA:I', 17],
        ['NETWORK_TYPE_IWLAN:I', 18], ['NETWORK_TYPE_LTE_CA:I', 19], ['NETWORK_TYPE_NR:I', 20],
        ['CALL_STATE_IDLE:I', 0], ['CALL_STATE_RINGING:I', 1], ['CALL_STATE_OFFHOOK:I', 2],
        ['DATA_UNKNOWN:I', -1], ['DATA_DISCONNECTED:I', 0], ['DATA_CONNECTING:I', 1],
        ['DATA_CONNECTED:I', 2], ['DATA_SUSPENDED:I', 3],
        ['DATA_ACTIVITY_NONE:I', 0], ['DATA_ACTIVITY_IN:I', 1], ['DATA_ACTIVITY_OUT:I', 2],
        ['DATA_ACTIVITY_INOUT:I', 3], ['DATA_ACTIVITY_DORMANT:I', 4],
        ['NETWORK_SELECTION_MODE_UNKNOWN:I', 0], ['NETWORK_SELECTION_MODE_AUTOMATIC:I', 1],
        ['NETWORK_SELECTION_MODE_MANUAL:I', 2],
        ['MULTI_SIM_UNKNOWN:I', 0], ['MULTI_SIM_POSSIBLE:I', 1], ['MULTI_SIM_UNSUPPORTED:I', 2],
        ['UNSUPPORTED_CARD_ID:I', -2], ['EUICC_CARD_ID_UNSUPPORTED:I', -1],
        ['DEFAULT_SUBSCRIPTION_ID:I', 1],
      ]),
      methods: {
        'createForSubscriptionId(I)Landroid/telephony/TelephonyManager;': (self) => self,
        'createForPhoneAccountHandle(Landroid/telecom/PhoneAccountHandle;)Landroid/telephony/TelephonyManager;': () => null,
        'getPhoneCount()I': () => 1,
        'getActiveModemCount()I': () => 1,
        'getSupportedModemCount()I': () => 1,
        'isMultiSimSupported()I': () => 2,
        'switchMultiSimConfig(I)V': () => undefined,
        'isModemEnabledForSlot(I)Z': () => true,
        'getDeviceSoftwareVersion()Ljava/lang/String;': () => 'unknown',
        'getDeviceId()Ljava/lang/String;': () => null,
        'getDeviceId(I)Ljava/lang/String;': () => null,
        'getImei()Ljava/lang/String;': () => null,
        'getImei(I)Ljava/lang/String;': () => null,
        'getMeid()Ljava/lang/String;': () => null,
        'getMeid(I)Ljava/lang/String;': () => null,
        'getNai()Ljava/lang/String;': () => null,
        'getSubscriberId()Ljava/lang/String;': () => null,
        'getSimSerialNumber()Ljava/lang/String;': () => null,
        'getLine1Number()Ljava/lang/String;': () => null,
        'setLine1NumberForDisplay(Ljava/lang/String;Ljava/lang/String;)Z': () => false,
        'getVoiceMailNumber()Ljava/lang/String;': () => null,
        'setVoiceMailNumber(Ljava/lang/String;Ljava/lang/String;)Z': () => false,
        'getVoiceMailAlphaTag()Ljava/lang/String;': () => '',
        'getVisualVoicemailPackageName()Ljava/lang/String;': () => null,
        'getTypeAllocationCode()Ljava/lang/String;': () => null,
        'getTypeAllocationCode(I)Ljava/lang/String;': () => null,
        'getManufacturerCode()Ljava/lang/String;': () => null,
        'getManufacturerCode(I)Ljava/lang/String;': () => null,
        'getGroupIdLevel1()Ljava/lang/String;': () => null,
        'getCellLocation()Landroid/telephony/CellLocation;': () => null,
        'getAllCellInfo()Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'requestCellInfoUpdate(Ljava/util/concurrent/Executor;Landroid/telephony/TelephonyManager$CellInfoCallback;)V': () => undefined,
        'getPhoneType()I': () => 1,
        'getNetworkOperator()Ljava/lang/String;': () => '00101',
        'getNetworkOperatorName()Ljava/lang/String;': () => 'apk.js',
        'getNetworkSpecifier()Ljava/lang/String;': () => null,
        'getCarrierConfig()Landroid/os/PersistableBundle;': () => null,
        'isNetworkRoaming()Z': () => false,
        'getNetworkCountryIso()Ljava/lang/String;': (self, _args, vm) => localeRegion(vm),
        'getNetworkCountryIso(I)Ljava/lang/String;': (self, _args, vm) => localeRegion(vm),
        'getNetworkType()I': () => 13,
        'getDataNetworkType()I': () => 13,
        'getVoiceNetworkType()I': () => 13,
        'hasIccCard()Z': () => true,
        'getSimState()I': () => 5,
        'getSimState(I)I': () => 5,
        'getSimOperator()Ljava/lang/String;': () => '00101',
        'getSimOperatorName()Ljava/lang/String;': () => 'apk.js',
        'getSimCountryIso()Ljava/lang/String;': (self, _args, vm) => localeRegion(vm),
        'getCardIdForDefaultEuicc()I': () => -2,
        'getUiccCardsInfo()Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'getCallState()I': () => 0,
        'getCallStateForSubscription()I': () => 0,
        'getDataActivity()I': () => 0,
        'getDataState()I': () => 2,
        'listen(Landroid/telephony/PhoneStateListener;I)V': () => undefined,
        'isVoiceCapable()Z': () => true,
        'isSmsCapable()Z': () => true,
        'isDataCapable()Z': () => true,
        'isDataConnectionAllowed()Z': () => true,
        'isConcurrentVoiceAndDataSupported()Z': () => true,
        'setDataEnabled(Z)V': () => undefined,
        'isDataEnabled()Z': () => true,
        'setDataEnabledForReason(IZ)V': () => undefined,
        'isDataEnabledForReason(I)Z': () => true,
        'isDataRoamingEnabled()Z': () => false,
        'canChangeDtmfToneLength()Z': () => false,
        'isWorldPhone()Z': () => false,
        'isTtyModeSupported()Z': () => false,
        'isRttSupported()Z': () => false,
        'isHearingAidCompatibilitySupported()Z': () => false,
        'getMmsUserAgent()Ljava/lang/String;': () => 'apk.js',
        'getMmsUAProfUrl()Ljava/lang/String;': () => '',
        'iccOpenLogicalChannel(Ljava/lang/String;)Landroid/telephony/IccOpenLogicalChannelResponse;': () => null,
        'iccOpenLogicalChannel(Ljava/lang/String;I)Landroid/telephony/IccOpenLogicalChannelResponse;': () => null,
        'iccCloseLogicalChannel(I)Z': () => false,
        'iccTransmitApduLogicalChannel(IIIIIILjava/lang/String;)Ljava/lang/String;': () => null,
        'iccTransmitApduBasicChannel(IIIIILjava/lang/String;)Ljava/lang/String;': () => null,
        'iccExchangeSimIO(IIIIILjava/lang/String;)[B': () => null,
        'sendEnvelopeWithStatus(Ljava/lang/String;)Ljava/lang/String;': () => null,
        'getSubscriptionId()I': () => 1,
        'getSubscriptionId(Landroid/telecom/PhoneAccountHandle;)I': () => 1,
        'getPhoneAccountHandle()Landroid/telecom/PhoneAccountHandle;': () => null,
        'getIccAuthentication(IILjava/lang/String;)Ljava/lang/String;': () => null,
        'getForbiddenPlmns()[Ljava/lang/String;': (_self, _args, vm) => vm.newArray('[Ljava/lang/String;', 0, null),
        'setForbiddenPlmns(Ljava/util/List;)I': () => 0,
        'setNetworkSelectionModeAutomatic()V': () => undefined,
        'setNetworkSelectionModeManual(Ljava/lang/String;Z)Z': () => false,
        'setNetworkSelectionModeManual(Ljava/lang/String;ZI)Z': () => false,
        'getNetworkSelectionMode()I': () => 1,
        'getManualNetworkSelectionPlmn()Ljava/lang/String;': () => null,
        'isManualNetworkSelectionAllowed()Z': () => true,
        'setPreferredNetworkTypeToGlobal()Z': () => true,
        'hasCarrierPrivileges()Z': () => false,
        'setOperatorBrandOverride(Ljava/lang/String;)Z': () => false,
        'setCallComposerStatus(I)V': () => undefined,
        'getCallComposerStatus()I': () => 0,
        'uploadCallComposerPicture(Ljava/nio/file/Path;Ljava/lang/String;Ljava/util/concurrent/Executor;Landroid/os/OutcomeReceiver;)V': () => undefined,
        'uploadCallComposerPicture(Ljava/io/InputStream;Ljava/lang/String;Ljava/util/concurrent/Executor;Landroid/os/OutcomeReceiver;)V': () => undefined,
        'setVisualVoicemailSmsFilterSettings(Landroid/telephony/VisualVoicemailSmsFilterSettings;)V': () => undefined,
        'sendVisualVoicemailSms(Ljava/lang/String;ILjava/lang/String;Landroid/app/PendingIntent;)V': () => undefined,
        'sendDialerSpecialCode(Ljava/lang/String;)V': () => undefined,
        'sendUssdRequest(Ljava/lang/String;Landroid/telephony/TelephonyManager$UssdResponseCallback;Landroid/os/Handler;)V': () => undefined,
        'requestNetworkScan(Landroid/telephony/NetworkScanRequest;Ljava/util/concurrent/Executor;Landroid/telephony/TelephonyScanManager$NetworkScanCallback;)Landroid/telephony/NetworkScan;': () => null,
        'isVoicemailVibrationEnabled(Landroid/telecom/PhoneAccountHandle;)Z': () => false,
        'setVoicemailVibrationEnabled(Landroid/telecom/PhoneAccountHandle;Z)V': () => undefined,
        'getVoicemailRingtoneUri(Landroid/telecom/PhoneAccountHandle;)Landroid/net/Uri;': () => null,
        'setVoicemailRingtoneUri(Landroid/telecom/PhoneAccountHandle;Landroid/net/Uri;)V': () => undefined,
        'getSimCarrierId()I': () => 0,
        'getSimCarrierIdName()Ljava/lang/CharSequence;': () => 'apk.js',
        'getSimSpecificCarrierId()I': () => 0,
        'getSimSpecificCarrierIdName()Ljava/lang/CharSequence;': () => 'apk.js',
        'getCarrierIdFromSimMccMnc()I': () => 0,
        'getSignalStrength()Landroid/telephony/SignalStrength;': (_self, _args, vm) => buildSignalStrength(vm),
        'getServiceState()Landroid/telephony/ServiceState;': (_self, _args, vm) => buildServiceState(vm),
        'getEmergencyNumberList()Ljava/util/Map;': (_self, _args, vm) => vm.allocateRawObject('Ljava/util/HashMap;'),
        'getEmergencyNumberList(I)Ljava/util/Map;': (_self, _args, vm) => vm.allocateRawObject('Ljava/util/HashMap;'),
        'isEmergencyNumber(Ljava/lang/String;)Z': (_self, [number]) => /^(112|110|119|120|122|911|999)$/.test(String(number ?? '')),
        'setPreferredOpportunisticDataSubscription(IZLjava/util/concurrent/Executor;Ljava/util/function/Consumer;)V': () => undefined,
        'getPreferredOpportunisticDataSubscription()I': () => 1,
        'updateAvailableNetworks(Ljava/util/List;Ljava/util/concurrent/Executor;Ljava/util/function/Consumer;)V': () => undefined,
      },
      staticMethods: {
        'getMaximumCallComposerPictureSize()J': () => 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/telephony/SignalStrength;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getLevel()I': () => 4,
        'getAsuLevel()I': () => 97,
        'getDbm()I': () => -50,
        'getGsmLevel()I': () => 4,
        'getGsmDbm()I': () => -50,
        'getGsmAsuLevel()I': () => 97,
        'getGsmSignalStrength()I': () => 31,
        'getGsmBitErrorRate()I': () => 0,
        'getCdmaLevel()I': () => 0,
        'getCdmaDbm()I': () => -1,
        'getCdmaEcio()I': () => -1,
        'getEvdoLevel()I': () => 0,
        'getEvdoDbm()I': () => -1,
        'getEvdoEcio()I': () => -1,
        'getEvdoSnr()I': () => -1,
        'getLteLevel()I': () => 4,
        'getLteRsrp()I': () => -50,
        'getLteRsrq()I': () => -10,
        'getLteRssnr()I': () => 300,
        'getLteCqi()I': () => 15,
        'getNrLevel()I': () => 4,
        'getCellSignalStrengths()Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
        'isGsm()Z': () => true,
        'toString()Ljava/lang/String;': () => 'SignalStrength: level=4 gsmLevel=4 gsmDbm=-50',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/telephony/ServiceState;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getState()I': () => 0,
        'getVoiceRegState()I': () => 0,
        'getDataRegState()I': () => 0,
        'getVoiceNetworkType()I': () => 13,
        'getDataNetworkType()I': () => 13,
        'getOperatorAlphaLong()Ljava/lang/CharSequence;': () => 'apk.js',
        'getOperatorAlphaShort()Ljava/lang/CharSequence;': () => 'apk.js',
        'getOperatorNumeric()Ljava/lang/String;': () => '00101',
        'getRoaming()Z': () => false,
        'getIsManualSelection()Z': () => false,
        'getCdmaRoamingIndicator()I': () => 0,
        'getCdmaDefaultRoamingIndicator()I': () => 0,
        'getCdmaEriIconMode()I': () => 0,
        'getCdmaEriIconIndex()I': () => 0,
        'getChannelNumber()I': () => 0,
        'getDuplexMode()I': () => 0,
        'getNrState()I': () => 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/hardware/Sensor;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getName()Ljava/lang/String;': (self) => self.name ?? '',
        'getType()I': (self) => self.type ?? 0,
        'getVendor()Ljava/lang/String;': (self) => self.vendor ?? 'apk.js',
        'getVersion()I': (self) => self.version ?? 1,
        'getPower()F': (self) => self.power ?? 0.5,
        'getResolution()F': (self) => self.resolution ?? 1,
        'getMaximumRange()F': (self) => self.maxRange ?? 100,
        'getMinDelay()I': (self) => self.minDelay ?? 0,
        'getStringType()Ljava/lang/String;': (self) => self.stringType ?? 'android.sensor.accelerometer',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/hardware/SensorManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getDefaultSensor(I)Landroid/hardware/Sensor;': (_self, [type], vm) => {
          const s = buildSensors(vm).find((sensor) => sensor.type === (type | 0));
          return s ? s.$object : null;
        },
        'getSensorList(I)Ljava/util/List;': (_self, _args, vm) => {
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          const sensors = buildSensors(vm);
          const items = sensors.map((s) => s.$object);
          if (list.$peer) list.$peer.items = items;
          else list.$peer = { items };
          list.$data = items;
          return list;
        },
        'getDynamicSensorList(I)Ljava/util/List;': (_self, _args, vm) => {
          const list = vm.allocateRawObject('Ljava/util/ArrayList;');
          if (list.$peer) list.$peer.items = [];
          else list.$peer = { items: [] };
          list.$data = [];
          return list;
        },
        'registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;I)Z': (_self, args, vm) => {
          const [listener, sensor] = args || [];
          if (!listener || !sensor || typeof vm?.invoke !== 'function') return false;
          const type = sensor.type | 0;
          const proto = { descriptor: '(Landroid/hardware/Sensor;Landroid/hardware/SensorEvent;)V', parameters: ['Landroid/hardware/Sensor;', 'Landroid/hardware/SensorEvent;'] };
          const tick = () => {
            const values = readSensorValues(type);
            if (!values) return;
            const event = vm.allocateRawObject('Landroid/hardware/SensorEvent;');
            event.sensor = sensor;
            event.accuracy = 3;
            event.timestamp = BigInt(Date.now()) * 1000000n;
            const vector = toFloatArray(vm, values);
            event.values = vector;
            vm.invoke({ classDesc: 'Landroid/hardware/SensorEventListener;', name: 'onSensorChanged', proto }, listener, [event], 'interface');
          };
          const timer = setInterval(tick, 200);
          if (typeof timer?.unref === 'function') timer.unref();
          if (!_self.$sensorTimers) _self.$sensorTimers = new Map();
          _self.$sensorTimers.set(listener, timer);
          return true;
        },
        'unregisterListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;)V': (self, args) => {
          stopSensorTimer(self, args && args[0]);
        },
        'unregisterListener(Landroid/hardware/SensorEventListener;)V': (self, args) => {
          stopSensorTimer(self, args && args[0]);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/NotificationManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'notify(ILandroid/app/Notification;)V': () => undefined,
        'cancel(I)V': () => undefined,
        'cancelAll()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Lorg/xmlpull/v1/XmlPullParser;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getEventType()I': (self) => xmlParserCurrent(self).event,
        'next()I': (self) => xmlParserAdvance(self),
        'nextToken()I': (self) => xmlParserAdvance(self),
        'getDepth()I': (self) => xmlParserCurrent(self).depth,
        'getName()Ljava/lang/String;': (self) => xmlParserCurrent(self).name,
        'getNamespace()Ljava/lang/String;': () => null,
        'getPrefix()Ljava/lang/String;': () => null,
        'getText()Ljava/lang/String;': (self) => xmlParserCurrent(self).text ?? null,
        'getAttributeCount()I': (self) => xmlParserCurrent(self).node?.attrs?.length ?? 0,
        'getAttributeName(I)Ljava/lang/String;': (self, [i]) => {
          const a = xmlParserCurrent(self).node?.attrs?.[i | 0];
          return a ? (a.namespaceName || a.name) : null;
        },
        'getAttributeValue(I)Ljava/lang/String;': (self, [i]) => {
          const a = xmlParserCurrent(self).node?.attrs?.[i | 0];
          return a == null ? null : (a.value == null ? null : String(a.value));
        },
        'getAttributeValue(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [ns, name]) =>
          attributeValueToString(xmlParserCurrent(self).node, jsString(name)),
        'getAttributeResourceValue(Ljava/lang/String;Ljava/lang/String;I)I': (self, [_ns, name, def]) =>
          attributeResourceValueFor(xmlParserCurrent(self).node, jsString(name), def | 0),
        'getAttributeNamespace(I)Ljava/lang/String;': (self, [i]) => {
          const a = xmlParserCurrent(self).node?.attrs?.[i | 0];
          return a?.namespace ?? null;
        },
        'getAttributePrefix(I)Ljava/lang/String;': () => null,
        'getPositionDescription()Ljava/lang/String;': () => 'xml',
        'setFeature(Ljava/lang/String;Z)V': () => undefined,
        'getFeature(Ljava/lang/String;)Z': () => false,
        'defineEntityReplacementText(Ljava/lang/String;Ljava/lang/String;)V': () => undefined,
        'close()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/Resources;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args], vm) =>
          vm.resources.getString(resId >>> 0, ...(args?.$data || [])),
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => vm.resources.getColor(resId >>> 0),
        'getBoolean(I)Z': (self, [resId], vm) => !!vm.resources.getBoolean(resId >>> 0),
        'getInteger(I)I': (self, [resId], vm) => vm.resources.getInteger(resId >>> 0),
        'getQuantityString(II)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getStringArray(I)[Ljava/lang/String;': (self, [resId], vm) => {
          const value = vm.resources.resolve(resId >>> 0);
          return Array.isArray(value) ? value : [];
        },
        'getIntArray(I)[I': (self, [resId], vm) => {
          const value = vm.resources.resolve(resId >>> 0);
          return Array.isArray(value) ? value : [];
        },
        'getDimension(I)F': (self, [resId], vm) => vm.resources.getDimensionPixelSize(resId >>> 0),
        'getDimensionPixelSize(I)I': (self, [resId], vm) => vm.resources.getDimensionPixelSize(resId >>> 0),
        'getDimensionPixelOffset(I)I': (self, [resId], vm) => Math.round(vm.resources.getDimensionPixelSize(resId >>> 0)),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => drawableObject(vm, vm.resources.getDrawable(resId >>> 0)),
        'newTheme()Landroid/content/res/Resources$Theme;': (self, _args, vm) => {
          vm.resources?.newTheme?.();
          return getThemeObject(vm);
        },
        'getLayout(I)Landroid/content/res/XmlResourceParser;': (self, [resId], vm) => makeXmlParserPeer(vm, safeGetLayout(vm, resId)),
        'getXml(I)Landroid/content/res/XmlResourceParser;': (self, [resId], vm) => makeXmlParserPeer(vm, safeGetLayout(vm, resId)),
        'getValue(ILandroid/util/TypedValue;Z)V': (self, [resId, out], vm) => {
          const id = resId >>> 0;
          // 主题属性（?attr/xxx）要先换成它实际指向的值，否则调用方
          // （如颜色列表解析器）会把这个 attr id 当成资源 id 再去取 XML。
          const table = vm.resources?.table;
          const entry = table?.getEntry?.(id);
          let value;
          let type = 5;
          if (entry?.typeName === 'attr') {
            const themed = vm.themeAttributes?.[entry.key];
            if (typeof themed === 'number') {
              value = themed >>> 0;
              type = 0x1c; // TYPE_INT_COLOR_ARGB8
            } else {
              value = null;
              type = 0;
            }
          } else {
            value = vm.resources.resolve(id);
            if (typeof value === 'number') type = 0x1c;
            else if (typeof value === 'string') type = 3;
          }
          if (!out) return;
          const peer = out.$peer || (out.$peer = {});
          peer.type = type;
          peer.data = value;
          peer.string = value === null || value === undefined ? null : String(value);
          if (typeof value === 'number') peer.data = value >>> 0;
          out.$fields?.set('Landroid/util/TypedValue;->type:I', peer.type);
          out.$fields?.set('Landroid/util/TypedValue;->data:I', typeof value === 'number' ? value >>> 0 : 0);
        },
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'openRawResource(I)Ljava/io/InputStream;': (self, [resId], vm) => {
          const id = Number(resId) >>> 0;
          const table = vm.resources?.table;
          let bytes = null;
          for (const typeName of ['raw', 'xml']) {
            const entry = table?.getTypeEntries?.(typeName)?.get(id);
            if (!entry) continue;
            const name = String(entry.key || '');
            for (const candidate of [`res/${typeName}/${name}`, `${typeName}/${name}`, name]) {
              try {
                bytes = vm.resources.getAssets().readBytes(candidate);
                break;
              } catch (e) {
                void e;
              }
            }
            if (bytes) break;
          }
          if (!bytes) return makeAssetStream(vm, new Uint8Array(0));
          return makeAssetStream(vm, bytes);
        },
        'openRawResourceFd(I)Landroid/content/res/AssetFileDescriptor;': () => null,
        'getIdentifier(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)I': (self, [name, type, pkg], vm) =>
          vm.resources.getIdentifier(jsString(name), jsString(type), jsString(pkg)),
        'getDisplayMetrics()Landroid/util/DisplayMetrics;': (self, _args, vm) => {
          const src = vm.resources.getDisplayMetrics();
          const metrics = vm.allocateObject(vm.registry.resolve('Landroid/util/DisplayMetrics;'));
          metrics.$nativeClass = 'Landroid/util/DisplayMetrics;';
          const floatFields = new Set(['density', 'scaledDensity', 'xdpi', 'ydpi']);
          for (const [k, v] of Object.entries(src)) {
            if (typeof v === 'number') {
              metrics.$fields.set('Landroid/util/DisplayMetrics;->' + k + ':' + (floatFields.has(k) ? 'F' : 'I'), floatFields.has(k) ? numberToFloatBits(v) : v);
            }
          }
          return metrics;
        },
        'getConfiguration()Landroid/content/res/Configuration;': (self, _args, vm) => {
          const config = vm.resources.getConfiguration();
          config.locale = makeDefaultLocaleObject(vm);
          return vm.wrapPeer(config);
        },
      },
      staticMethods: {
        'getSystem()Landroid/content/res/Resources;': (_self, _args, vm) => vm.resourcesObject,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/AssetManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'open(Ljava/lang/String;)Ljava/io/InputStream;': (self, [path], vm) => {
          const mgr = resolveAssetManager(self, vm);
          const name = jsString(path);
          let bytes;
          try {
            bytes = mgr.readBytes(name);
          } catch (e) {
            vm.throwException('Ljava/io/FileNotFoundException;', `${name}: ${e?.message || e}`);
            return null;
          }
          return makeAssetStream(vm, bytes);
        },
        'list(Ljava/lang/String;)[Ljava/lang/String;': (self, [path], vm) => {
          const mgr = resolveAssetManager(self, vm);
          return mgr ? mgr.list(jsString(path)) : [];
        },
        'openFd(Ljava/lang/String;)Landroid/content/res/AssetFileDescriptor;': () => null,
        'close()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Ljava/io/InputStream;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'read()I': (self) => {
          if (!self.offset) self.offset = 0;
          return self.offset < self.bytes.length ? self.bytes[self.offset++] : -1;
        },
        'close()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/AsyncTask;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'execute([Ljava/lang/Object;)Landroid/os/AsyncTask;': (self, [args], vm) => {
          if (typeof self.doInBackground === 'function') {
            try {
              self.doInBackground(args?.$data || []);
            } catch (error) {
              vm.log('error', 'AsyncTask', error.message);
            }
          }
          return self;
        },
        'doInBackground([Ljava/lang/Object;)Ljava/lang/Object;': () => null,
        'onPostExecute(Ljava/lang/Object;)V': () => undefined,
        'onPreExecute()V': () => undefined,
      },
    })
  );

  defs.push(...Object.values(OPENGL_CLASSES));
  defs.push(...Object.values(OUTLINE_CLASSES));
  defs.push(...Object.values(SHADER_CLASSES));
  defs.push(...Object.values(DRAWABLE_CLASSES));
  defs.push(...Object.values(WEBKIT_CLASSES));
  defs.push(...coreGraphicDefs());
  defs.push(...cryptoDefs());
  defs.push(...settingsDefs());
  defs.push(...audioDefs());
  applyCompatMethods(defs);
  return defs;
}

function bytesOfValue(value) {
  if (!value) return [];
  if (Array.isArray(value.$data)) return value.$data.map((b) => toInt(b) & 0xff);
  if (Array.isArray(value)) return value.map((b) => toInt(b) & 0xff);
  return [];
}

function javaBytes(vm, bytes) {
  const array = vm.newArray('[B', bytes.length);
  for (let i = 0; i < bytes.length; i++) array.$data[i] = bytes[i] & 0xff;
  return array;
}

function cryptoDefs() {
  return [
    nativeDef('Ljavax/crypto/spec/PBEKeySpec;', {
      instanceFields: new Map([
        ['password', null],
        ['salt', null],
        ['iterationCount', 0],
        ['keyLength', 0],
      ]),
      methods: {
        '<init>([C)V': (self, [password]) => {
          self.$password = password;
        },
        '<init>([C[B)V': (self, [password, salt]) => {
          self.$password = password;
          self.$salt = salt;
        },
        '<init>([C[BII)V': (self, [password, salt, iterationCount, keyLength]) => {
          self.$password = password;
          self.$salt = salt;
          self.$iterationCount = toInt(iterationCount);
          self.$keyLength = toInt(keyLength);
        },
        'clearPassword()V': (self) => {
          self.$password = null;
        },
        'getPassword()[C': (self) => self.$password ?? null,
        'getSalt()[B': (self) => self.$salt ?? null,
        'getIterationCount()I': (self) => toInt(self.$iterationCount),
        'getKeyLength()I': (self) => toInt(self.$keyLength),
      },
    }),
    nativeDef('Ljavax/crypto/spec/SecretKeySpec;', {
      interfaces: ['Ljavax/crypto/SecretKey;'],
      methods: {
        '<init>([BLjava/lang/String;)V': (self, [key, algorithm]) => {
          self.$key = key;
          self.$algorithm = algorithm;
        },
        'getEncoded()[B': (self) => self.$key ?? null,
        'getAlgorithm()Ljava/lang/String;': (self) => self.$algorithm ?? 'AES',
        'getFormat()Ljava/lang/String;': () => 'RAW',
      },
    }),
    nativeDef('Ljavax/crypto/spec/IvParameterSpec;', {      methods: {
        '<init>([B)V': (self, [iv]) => {
          self.$iv = iv;
        },
        'getIV()[B': (self) => self.$iv ?? null,
      },
    }),
    nativeDef('Ljavax/crypto/SecretKeyFactory;', {
      staticMethods: {
        'getInstance(Ljava/lang/String;)Ljavax/crypto/SecretKeyFactory;': (self, [algorithm], vm) => {
          const factory = vm.allocateRawObject('Ljavax/crypto/SecretKeyFactory;');
          factory.$peer = { algorithm: jsString(algorithm) };
          return factory;
        },
      },
      methods: {
        'generateSecret(Ljava/security/spec/KeySpec;)Ljavax/crypto/SecretKey;': (self, [spec], vm) => {
          const keyLength = Math.max(16, ((toInt(spec?.$keyLength) || 256) / 8) | 0);
          const algorithm = self.$peer?.algorithm || 'AES';
          const bytes = derivePbeKey(spec, keyLength);
          const key = vm.allocateRawObject('Ljavax/crypto/SecretKey;');
          key.$peer = { bytes, algorithm };
          key.$key = javaBytes(vm, bytes);
          key.$algorithm = algorithm;
          return key;
        },
        'getAlgorithm()Ljava/lang/String;': (self) => self.$peer?.algorithm || 'AES',
      },
    }),
    nativeDef('Ljavax/crypto/SecretKey;', {
      interfaces: ['Ljava/security/Key;'],
      methods: {
        'getEncoded()[B': (self) => self.$key ?? null,
        'getAlgorithm()Ljava/lang/String;': (self) => self.$algorithm ?? self.$peer?.algorithm ?? 'AES',
        'getFormat()Ljava/lang/String;': () => 'RAW',
      },
    }),
    nativeDef('Ljavax/crypto/Cipher;', {
      staticMethods: {
        'getInstance(Ljava/lang/String;)Ljavax/crypto/Cipher;': (self, [transformation], vm) => {
          const cipher = vm.allocateRawObject('Ljavax/crypto/Cipher;');
          cipher.$peer = { transformation: jsString(transformation) };
          return cipher;
        },
      },
      methods: {
        'init(ILjava/security/Key;Ljava/security/spec/AlgorithmParameterSpec;)V': (self, [mode, key, params]) => {
          self.$peer = {
            ...(self.$peer || {}),
            mode: toInt(mode),
            keyBytes: bytesOfValue(key?.$key),
            iv: bytesOfValue(params?.$iv),
          };
        },
        'init(ILjava/security/Key;)V': (self, [mode, key]) => {
          self.$peer = {
            ...(self.$peer || {}),
            mode: toInt(mode),
            keyBytes: bytesOfValue(key?.$key),
          };
        },
        'getIV()[B': (self, _args, vm) => javaBytes(vm, self.$peer?.iv || []),
        'doFinal([B)[B': (self, [input], vm) => {
          const data = bytesOfValue(input);
          const mode = self.$peer?.mode;
          const keyBytes = self.$peer?.keyBytes || [];
          const iv = self.$peer?.iv || [];
          const out = aesCbcProcess(mode, keyBytes, iv, data);
          return javaBytes(vm, out);
        },
      },
    }),
    nativeDef('Ljava/security/spec/X509EncodedKeySpec;', {
      methods: {
        '<init>([B)V': (self, [encoded]) => {
          self.$encoded = encoded;
        },
        'getEncoded()[B': (self) => self.$encoded ?? null,
        'getFormat()Ljava/lang/String;': () => 'X.509',
      },
    }),
    nativeDef('Ljava/security/PublicKey;', {
      interfaces: ['Ljava/security/Key;'],
      methods: {
        'getEncoded()[B': (self) => self.$encoded ?? null,
        'getAlgorithm()Ljava/lang/String;': (self) => self.$algorithm ?? 'RSA',
        'getFormat()Ljava/lang/String;': () => 'X.509',
      },
    }),
    nativeDef('Ljava/security/KeyFactory;', {
      staticMethods: {
        'getInstance(Ljava/lang/String;)Ljava/security/KeyFactory;': (self, [algorithm], vm) => {
          const factory = vm.allocateRawObject('Ljava/security/KeyFactory;');
          factory.$peer = { algorithm: jsString(algorithm) };
          return factory;
        },
      },
      methods: {
        'generatePublic(Ljava/security/spec/KeySpec;)Ljava/security/PublicKey;': (self, [spec], vm) => {
          const key = vm.allocateRawObject('Ljava/security/PublicKey;');
          key.$encoded = spec?.$encoded ?? null;
          key.$algorithm = self.$peer?.algorithm || 'RSA';
          return key;
        },
      },
    }),
  ];
}

function derivePbeKey(spec, keyLength) {
  const rawPassword = spec?.$password ?? [];
  const passwordChars = Array.isArray(rawPassword) ? rawPassword : (Array.isArray(rawPassword?.$data) ? rawPassword.$data : []);
  const password = passwordChars.map((c) => String.fromCharCode(toInt(c) & 0xffff)).join('');
  const salt = bytesOfValue(spec?.$salt);
  const iterations = Math.max(1, toInt(spec?.$iterationCount) || 1024);
  return pbkdf2Sha1(password, salt, iterations, keyLength);
}

function aesCbcProcess(mode, keyBytes, iv, data) {
  const key = keyBytes.slice(0, 32);
  const ivBytes = iv.slice(0, 16);
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) return data;
  if (ivBytes.length !== 16) return data;
  if (mode === 2) return aesDecryptCbc(key, ivBytes, data);
  return aesEncryptCbc(key, ivBytes, data);
}

function audioDefs() {
  const outputDevices = () => [
    { type: 2, name: 'Speaker', address: '', sampleRates: [44100, 48000], channelCounts: [2] },
    { type: 3, name: 'Headset', address: '', sampleRates: [44100, 48000], channelCounts: [2] },
  ];
  const makeDeviceInfo = (vm, entry, id) => {
    const info = vm.allocateRawObject('Landroid/media/AudioDeviceInfo;');
    info.$peer = { vm, ...entry, id };
    info.type = entry.type;
    info.id = id;
    info.productName = entry.name;
    info.address = entry.address;
    return info;
  };
  return [
    nativeDef('Landroid/media/AudioDeviceInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getType()I': (self) => toInt(self.type),
        'getId()I': (self) => toInt(self.id),
        'getProductName()Ljava/lang/CharSequence;': (self) => String(self.productName ?? ''),
        'getAddress()Ljava/lang/String;': (self) => String(self.address ?? ''),
        'isSource()Z': () => false,
        'isSink()Z': () => true,
        'getSampleRates()[I': (self, _args, vm) => {
          const rates = self.sampleRates || [44100, 48000];
          const array = vm.newArray('[I', rates.length);
          rates.forEach((rate, index) => { array.$data[index] = rate; });
          return array;
        },
        'getChannelCounts()[I': (self, _args, vm) => {
          const counts = self.channelCounts || [2];
          const array = vm.newArray('[I', counts.length);
          counts.forEach((count, index) => { array.$data[index] = count; });
          return array;
        },
        'getChannelMasks()[I': (self, _args, vm) => {
          const array = vm.newArray('[I', 1);
          array.$data[0] = 12;
          return array;
        },
        'getEncodings()[I': (self, _args, vm) => {
          const array = vm.newArray('[I', 1);
          array.$data[0] = 1;
          return array;
        },
      },
    }),
    nativeDef('Landroid/media/AudioManager;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['STREAM_VOICE_CALL:I', 0],
        ['STREAM_SYSTEM:I', 1],
        ['STREAM_RING:I', 2],
        ['STREAM_MUSIC:I', 3],
        ['STREAM_ALARM:I', 4],
        ['STREAM_NOTIFICATION:I', 5],
        ['STREAM_DTMF:I', 8],
        ['STREAM_ACCESSIBILITY:I', 10],
        ['AUDIOFOCUS_GAIN:I', 1],
        ['AUDIOFOCUS_LOSS:I', -1],
        ['ADJUST_RAISE:I', 1],
        ['ADJUST_LOWER:I', -1],
        ['ADJUST_SAME:I', 0],
        ['MODE_NORMAL:I', 0],
        ['MODE_RINGTONE:I', 1],
        ['MODE_IN_CALL:I', 2],
        ['MODE_IN_COMMUNICATION:I', 3],
        ['RINGER_MODE_NORMAL:I', 2],
        ['RINGER_MODE_SILENT:I', 0],
        ['RINGER_MODE_VIBRATE:I', 1],
        ['USE_DEFAULT_STREAM_TYPE:I', -2147483648],
      ]),
      methods: {
        'getStreamMaxVolume(I)I': () => 15,
        'getStreamVolume(I)I': () => 8,
        'setStreamVolume(III)V': () => undefined,
        'adjustStreamVolume(III)V': () => undefined,
        'adjustVolume(II)V': () => undefined,
        'setStreamMute(IZ)V': () => undefined,
        'isStreamMute(I)Z': () => false,
        'getMode()I': () => 0,
        'setMode(I)V': () => undefined,
        'getRingerMode()I': () => 2,
        'setRingerMode(I)V': () => undefined,
        'isMusicActive()Z': () => false,
        'isSpeakerphoneOn()Z': () => true,
        'setSpeakerphoneOn(Z)V': () => undefined,
        'isBluetoothScoOn()Z': () => false,
        'setBluetoothScoOn(Z)V': () => undefined,
        'isWiredHeadsetOn()Z': () => false,
        'requestAudioFocus(Landroid/media/AudioManager$OnAudioFocusChangeListener;III)I': () => 1,
        'requestAudioFocus(Landroid/media/AudioFocusRequest;)I': () => 1,
        'abandonAudioFocus(Landroid/media/AudioManager$OnAudioFocusChangeListener;)I': () => 1,
        'abandonAudioFocusRequest(Landroid/media/AudioFocusRequest;)I': () => 1,
        'registerAudioDeviceCallback(Landroid/media/AudioDeviceCallback;Landroid/os/Handler;)V': () => undefined,
        'unregisterAudioDeviceCallback(Landroid/media/AudioDeviceCallback;)V': () => undefined,
        'getDevices(I)[Landroid/media/AudioDeviceInfo;': (_self, [_flags], vm) => {
          const entries = outputDevices();
          const array = vm.newArray('[Landroid/media/AudioDeviceInfo;', entries.length, null);
          entries.forEach((entry, index) => { array.$data[index] = makeDeviceInfo(vm, entry, index + 1); });
          return array;
        },
        'getProperty(Ljava/lang/String;)Ljava/lang/String;': (_self, [key]) => {
          const name = jsString(key);
          if (name === 'ro.product.model') return 'apk.js Browser';
          return '';
        },
      },
    }),
    nativeDef('Landroid/media/MediaCodecInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getName()Ljava/lang/String;': (self) => String(self.className ?? ''),
        'isEncoder()Z': (self) => !!self.encoder,
        'isDecoder()Z': (self) => !self.encoder,
        'getSupportedTypes()[Ljava/lang/String;': (self, _args, vm) => {
          const types = self.types || [];
          const array = vm.newArray('[Ljava/lang/String;', types.length);
          types.forEach((type, index) => { array.$data[index] = type; });
          return array;
        },
      },
    }),
    nativeDef('Landroid/media/MediaCodecList;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['ALL_CODECS:I', 1],
        ['REGULAR_CODECS:I', 0],
      ]),
      methods: {
        'getCodecCount()I': () => 4,
        'getCodecInfoAt(I)Landroid/media/MediaCodecInfo;': (_self, [index], vm) => {
          const entries = [
            { name: 'OMX.google.aac.decoder', encoder: false, types: ['audio/mp4a-latm'] },
            { name: 'OMX.google.aac.encoder', encoder: true, types: ['audio/mp4a-latm'] },
            { name: 'OMX.google.h264.decoder', encoder: false, types: ['video/avc'] },
            { name: 'OMX.google.h264.encoder', encoder: true, types: ['video/avc'] },
          ];
          const entry = entries[toInt(index)] || entries[0];
          const info = vm.allocateRawObject('Landroid/media/MediaCodecInfo;');
          info.$peer = { vm, ...entry };
          info.className = entry.name;
          info.encoder = entry.encoder;
          info.types = entry.types;
          return info;
        },
        'findDecoderForFormat(Landroid/media/MediaFormat;)Ljava/lang/String;': () => 'OMX.google.aac.decoder',
        'findEncoderForFormat(Landroid/media/MediaFormat;)Ljava/lang/String;': () => 'OMX.google.aac.encoder',
      },
    }),
  ];
}

function settingsDefs() {
  const settingsValues = () => {
    const nav = readNavigator();
    const language = String(nav?.language || 'en-US');
    return {
      'screen_brightness': '120',
      'screen_brightness_mode': '1',
      'screen_off_timeout': '60000',
      'sound_effects_enabled': '0',
      'vibrate_on': '0',
      'user_rotation': '0',
      'accelerometer_rotation': '1',
      'font_scale': '1.0',
      'device_name': 'apk.js Browser',
      'system_locales': language,
      'adb_enabled': '0',
      'development_settings_enabled': '0',
      'android_id': 'apkjs000000000001',
      'bluetooth_on': '0',
      'wifi_on': '1',
      'airplane_mode_on': '0',
      'time_12_24': '24',
      'date_format': 'yyyy-MM-dd',
    };
  };
  const readSetting = (name) => {
    const values = settingsValues();
    const key = jsString(name);
    return values[key] !== undefined ? values[key] : null;
  };
  const settingDef = (descriptor) => nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    staticFields: new Map([
      ['ACTION_ACCESSIBILITY_SETTINGS:Ljava/lang/String;', 'android.settings.ACCESSIBILITY_SETTINGS'],
      ['ACTION_SETTINGS:Ljava/lang/String;', 'android.settings.SETTINGS'],
    ]),
    methods: {
      'getString(Landroid/content/ContentResolver;Ljava/lang/String;)Ljava/lang/String;': (_self, [resolver, name]) => {
        void resolver;
        return readSetting(name);
      },
      'getString(Landroid/content/ContentResolver;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [resolver, name, fallback]) => {
        void resolver;
        const value = readSetting(name);
        return value === null ? jsString(fallback) : value;
      },
      'getInt(Landroid/content/ContentResolver;Ljava/lang/String;)I': (_self, [resolver, name]) => {
        void resolver;
        const value = readSetting(name);
        return value === null ? 0 : Number.parseInt(value, 10) || 0;
      },
      'getInt(Landroid/content/ContentResolver;Ljava/lang/String;I)I': (_self, [resolver, name, fallback]) => {
        void resolver;
        const value = readSetting(name);
        return value === null ? toInt(fallback) : (Number.parseInt(value, 10) || 0);
      },
      'getLong(Landroid/content/ContentResolver;Ljava/lang/String;J)J': (_self, [resolver, name, fallback]) => {
        void resolver;
        const value = readSetting(name);
        return value === null ? fallback : (Number.parseInt(value, 10) || 0);
      },
      'getFloat(Landroid/content/ContentResolver;Ljava/lang/String;F)F': (_self, [resolver, name, fallback]) => {
        void resolver;
        const value = readSetting(name);
        return value === null ? Number(fallback) : (Number.parseFloat(value) || 0);
      },
      'putInt(Landroid/content/ContentResolver;Ljava/lang/String;I)Z': () => true,
      'putString(Landroid/content/ContentResolver;Ljava/lang/String;Ljava/lang/String;)Z': () => true,
      'putLong(Landroid/content/ContentResolver;Ljava/lang/String;J)Z': () => true,
      'putFloat(Landroid/content/ContentResolver;Ljava/lang/String;F)Z': () => true,
    },
  });
  return [
    settingDef('Landroid/provider/Settings;'),
    settingDef('Landroid/provider/Settings$Global;'),
    settingDef('Landroid/provider/Settings$Secure;'),
    settingDef('Landroid/provider/Settings$System;'),
    nativeDef('Landroid/content/ContentResolver;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getType(Landroid/net/Uri;)Ljava/lang/String;': () => null,
        'getString(Landroid/net/Uri;)Ljava/lang/String;': () => null,
        'query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;': () => null,
        'registerContentObserver(Landroid/net/Uri;ZLandroid/database/ContentObserver;)V': () => undefined,
        'unregisterContentObserver(Landroid/database/ContentObserver;)V': () => undefined,
        'notifyChange(Landroid/net/Uri;Landroid/database/ContentObserver;)V': () => undefined,
        'notifyChange(Landroid/net/Uri;Landroid/database/ContentObserver;Z)V': () => undefined,
        'takePersistableUriPermission(Landroid/net/Uri;I)V': () => undefined,
      },
    }),
  ];
}

function coreGraphicDefs() {
  return [
    nativeDef('Landroid/graphics/Rect;', {
      super: 'Ljava/lang/Object;',
      ctor: class RectPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.rect = new Rect();
          for (const name of ['left', 'top', 'right', 'bottom']) {
            Object.defineProperty(this, name, {
              configurable: true,
              enumerable: true,
              get: () => this.rect[name],
              set: (value) => { this.rect[name] = value | 0; },
            });
          }
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.rect = self.rect || new Rect();
        },
        '<init>(IIII)V': (self, [l, t, r, b]) => {
          self.rect = new Rect(l | 0, t | 0, r | 0, b | 0);
        },
        'set(IIII)V': (self, [l, t, r, b]) => {
          self.rect = self.rect || new Rect();
          self.rect.set(l | 0, t | 0, r | 0, b | 0);
        },
        'setEmpty()V': (self) => {
          self.rect = self.rect || new Rect();
          self.rect.set(0, 0, 0, 0);
        },
        'set(Landroid/graphics/Rect;)V': (self, [other]) => {
          self.rect = self.rect || new Rect();
          const src = other?.rect || other;
          if (src) self.rect.set(src.left | 0, src.top | 0, src.right | 0, src.bottom | 0);
        },
        'width()I': (self) => (self.rect ||= new Rect()).width(),
        'height()I': (self) => (self.rect ||= new Rect()).height(),
        'isEmpty()Z': (self) => (self.rect ||= new Rect()).isEmpty(),
        'left()I': (self) => (self.rect ||= new Rect()).left,
        'top()I': (self) => (self.rect ||= new Rect()).top,
        'right()I': (self) => (self.rect ||= new Rect()).right,
        'bottom()I': (self) => (self.rect ||= new Rect()).bottom,
        'centerX()I': (self) => { const r = (self.rect ||= new Rect()); return (r.left + r.right) >> 1; },
        'centerY()I': (self) => { const r = (self.rect ||= new Rect()); return (r.top + r.bottom) >> 1; },
        'inset(II)V': (self, [dx, dy]) => (self.rect ||= new Rect()).inset(dx | 0, dy | 0),
        'offset(II)V': (self, [dx, dy]) => (self.rect ||= new Rect()).offset(dx | 0, dy | 0),
        'contains(II)Z': (self, [x, y]) => (self.rect ||= new Rect()).contains(x | 0, y | 0),
        'toString()Ljava/lang/String;': (self) => (self.rect ||= new Rect()).toString(),
      },
      instanceFields: new Map([
        ['left:I', 0], ['top:I', 0], ['right:I', 0], ['bottom:I', 0],
      ]),
    }),
    nativeDef('Landroid/graphics/Insets;', {
      super: 'Ljava/lang/Object;',
      ctor: class InsetsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
        }
      },
      methods: {
        '<init>(IIII)V': (self, [left, top, right, bottom]) => {
          self.left = left | 0;
          self.top = top | 0;
          self.right = right | 0;
          self.bottom = bottom | 0;
        },
        'toRect()Landroid/graphics/Rect;': (self, _args, vm) => {
          const rect = vm.instantiate('Landroid/graphics/Rect;', []);
          vm.invokeByName('set', '(IIII)V', rect, [self.left | 0, self.top | 0, self.right | 0, self.bottom | 0]);
          return rect;
        },
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer || other;
          if (!peer) return false;
          return peer.left === self.left && peer.top === self.top && peer.right === self.right && peer.bottom === self.bottom;
        },
        'hashCode()I': (self) => (((self.left * 31 + self.top) * 31 + self.right) * 31 + self.bottom) | 0,
        'toString()Ljava/lang/String;': (self) => `Insets{left=${self.left | 0}, top=${self.top | 0}, right=${self.right | 0}, bottom=${self.bottom | 0}}`,
      },
      staticMethods: {
        'of(IIII)Landroid/graphics/Insets;': (_self, [left, top, right, bottom], vm) => vm.instantiate('Landroid/graphics/Insets;', [left, top, right, bottom]),
      },
      staticFields: new Map([
        ['NONE:Landroid/graphics/Insets;', { lazy: (vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]) }],
      ]),
      instanceFields: new Map([
        ['left:I', 0], ['top:I', 0], ['right:I', 0], ['bottom:I', 0],
      ]),
    }),
    nativeDef('Landroid/view/WindowInsets;', {
      super: 'Ljava/lang/Object;',
      ctor: class WindowInsetsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
          this.stableLeft = 0;
          this.stableTop = 0;
          this.stableRight = 0;
          this.stableBottom = 0;
          this.consumed = false;
        }
      },
      methods: {
        '<init>(Landroid/view/WindowInsets;)V': (self, [other]) => {
          const peer = other?.$peer || other;
          if (!peer) return;
          self.left = peer.left | 0;
          self.top = peer.top | 0;
          self.right = peer.right | 0;
          self.bottom = peer.bottom | 0;
          self.stableLeft = peer.stableLeft | 0;
          self.stableTop = peer.stableTop | 0;
          self.stableRight = peer.stableRight | 0;
          self.stableBottom = peer.stableBottom | 0;
        },
        'getSystemWindowInsetLeft()I': (self) => (self.consumed ? 0 : self.left | 0),
        'getSystemWindowInsetTop()I': (self) => (self.consumed ? 0 : self.top | 0),
        'getSystemWindowInsetRight()I': (self) => (self.consumed ? 0 : self.right | 0),
        'getSystemWindowInsetBottom()I': (self) => (self.consumed ? 0 : self.bottom | 0),
        'getStableInsetLeft()I': (self) => (self.consumed ? 0 : self.stableLeft | 0),
        'getStableInsetTop()I': (self) => (self.consumed ? 0 : self.stableTop | 0),
        'getStableInsetRight()I': (self) => (self.consumed ? 0 : self.stableRight | 0),
        'getStableInsetBottom()I': (self) => (self.consumed ? 0 : self.stableBottom | 0),
        'getSystemWindowInsets()Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.left | 0,
          self.consumed ? 0 : self.top | 0,
          self.consumed ? 0 : self.right | 0,
          self.consumed ? 0 : self.bottom | 0,
        ]),
        'getStableInsets()Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.stableLeft | 0,
          self.consumed ? 0 : self.stableTop | 0,
          self.consumed ? 0 : self.stableRight | 0,
          self.consumed ? 0 : self.stableBottom | 0,
        ]),
        'getInsets(I)Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.left | 0,
          self.consumed ? 0 : self.top | 0,
          self.consumed ? 0 : self.right | 0,
          self.consumed ? 0 : self.bottom | 0,
        ]),
        'getInsetsIgnoringVisibility(I)Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.stableLeft | 0, self.stableTop | 0, self.stableRight | 0, self.stableBottom | 0,
        ]),
        'getMandatorySystemGestureInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'getTappableElementInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'getSystemGestureInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'isVisible(I)Z': (self) => !self.consumed && (self.left | self.top | self.right | self.bottom) !== 0,
        'isConsumed()Z': (self) => !!self.consumed,
        'getDisplayCutout()Landroid/view/DisplayCutout;': () => null,
        'consumeSystemWindowInsets()Landroid/view/WindowInsets;': (self) => {
          self.consumed = true;
          return self.$object ?? self;
        },
        'consumeStableInsets()Landroid/view/WindowInsets;': (self) => {
          self.consumed = true;
          return self.$object ?? self;
        },
        'consumeDisplayCutout()Landroid/view/WindowInsets;': (self) => self.$object ?? self,
        'replaceSystemWindowInsets(IIII)Landroid/view/WindowInsets;': (self, [left, top, right, bottom]) => {
          self.left = left | 0;
          self.top = top | 0;
          self.right = right | 0;
          self.bottom = bottom | 0;
          return self.$object ?? self;
        },
        'toString()Ljava/lang/String;': (self) => `WindowInsets{left=${self.left | 0}, top=${self.top | 0}, right=${self.right | 0}, bottom=${self.bottom | 0}}`,
      },
      instanceFields: new Map([
        ['mSystemWindowInsets:Landroid/graphics/Rect;', null],
      ]),
      staticFields: new Map([
        ['NONE:Landroid/view/WindowInsets;', {
          lazy: (vm) => vm.instantiate('Landroid/view/WindowInsets;', []),
        }],
        ['CONSUMED:Landroid/view/WindowInsets;', {
          lazy: (vm) => {
            const insets = vm.instantiate('Landroid/view/WindowInsets;', []);
            const peer = vm.registry.getPeer(insets, 'Landroid/view/WindowInsets;');
            if (peer) peer.consumed = true;
            return insets;
          },
        }],
      ]),
    }),
    nativeDef('Landroid/view/WindowInsets$Builder;', {
      super: 'Ljava/lang/Object;',
      ctor: class WindowInsetsBuilderPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
          this.stableLeft = 0;
          this.stableTop = 0;
          this.stableRight = 0;
          this.stableBottom = 0;
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.left = 0;
          self.top = 0;
          self.right = 0;
          self.bottom = 0;
          self.stableLeft = 0;
          self.stableTop = 0;
          self.stableRight = 0;
          self.stableBottom = 0;
        },
        '<init>(Landroid/view/WindowInsets;)V': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (!peer) return;
          self.left = peer.left | 0;
          self.top = peer.top | 0;
          self.right = peer.right | 0;
          self.bottom = peer.bottom | 0;
          self.stableLeft = peer.stableLeft | 0;
          self.stableTop = peer.stableTop | 0;
          self.stableRight = peer.stableRight | 0;
          self.stableBottom = peer.stableBottom | 0;
        },
        'setSystemWindowInsets(Landroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.left = peer.left | 0;
            self.top = peer.top | 0;
            self.right = peer.right | 0;
            self.bottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setStableInsets(Landroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.stableLeft = peer.left | 0;
            self.stableTop = peer.top | 0;
            self.stableRight = peer.right | 0;
            self.stableBottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setInsets(ILandroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [_type, insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.left = peer.left | 0;
            self.top = peer.top | 0;
            self.right = peer.right | 0;
            self.bottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setDisplayCutout(Landroid/view/DisplayCutout;)Landroid/view/WindowInsets$Builder;': (self) => self.$object ?? self,
        'build()Landroid/view/WindowInsets;': (self, _args, vm) => {
          const insets = vm.instantiate('Landroid/view/WindowInsets;', []);
          const peer = vm.registry.getPeer(insets, 'Landroid/view/WindowInsets;') || insets?.$peer;
          if (peer) {
            peer.left = self.left | 0;
            peer.top = self.top | 0;
            peer.right = self.right | 0;
            peer.bottom = self.bottom | 0;
            peer.stableLeft = self.stableLeft | 0;
            peer.stableTop = self.stableTop | 0;
            peer.stableRight = self.stableRight | 0;
            peer.stableBottom = self.stableBottom | 0;
          }
          return insets;
        },
      },
    }),
    nativeDef('Landroid/graphics/Point;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/graphics/RectF;', {
      super: 'Ljava/lang/Object;',
      ctor: class RectFPeer {
        constructor() {
          this.f = { left: 0, top: 0, right: 0, bottom: 0 };
          for (const name of ['left', 'top', 'right', 'bottom']) {
            Object.defineProperty(this, name, {
              configurable: true,
              enumerable: true,
              get: () => this.f[name],
              set: (value) => { this.f[name] = value | 0; },
            });
          }
        }
      },
      methods: {
        '<init>()V': (self) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.f.left = self.f.top = self.f.right = self.f.bottom = 0;
        },
        '<init>(FFFF)V': (self, [l, t, r, b]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.left = rectFBits(l);
          self.top = rectFBits(t);
          self.right = rectFBits(r);
          self.bottom = rectFBits(b);
        },
        '<init>(Landroid/graphics/RectF;)V': (self, [other]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          const src = other?.$peer || other;
          self.left = Number(src?.left) | 0;
          self.top = Number(src?.top) | 0;
          self.right = Number(src?.right) | 0;
          self.bottom = Number(src?.bottom) | 0;
        },
        '<init>(Landroid/graphics/Rect;)V': (self, [other]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.left = rectFBits(rectField(other, 'left'));
          self.top = rectFBits(rectField(other, 'top'));
          self.right = rectFBits(rectField(other, 'right'));
          self.bottom = rectFBits(rectField(other, 'bottom'));
        },
        'setEmpty()V': (self) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.f.left = self.f.top = self.f.right = self.f.bottom = 0;
        },
        'set(FFFF)V': (self, [l, t, r, b]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.left = rectFBits(l);
          self.top = rectFBits(t);
          self.right = rectFBits(r);
          self.bottom = rectFBits(b);
        },
        'set(Landroid/graphics/RectF;)V': (self, [other]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          const src = other?.$peer || other;
          self.left = Number(src?.left) | 0;
          self.top = Number(src?.top) | 0;
          self.right = Number(src?.right) | 0;
          self.bottom = Number(src?.bottom) | 0;
        },
        'set(Landroid/graphics/Rect;)V': (self, [other]) => {
          if (!self.f) self.f = { left: 0, top: 0, right: 0, bottom: 0 };
          self.left = rectFBits(rectField(other, 'left'));
          self.top = rectFBits(rectField(other, 'top'));
          self.right = rectFBits(rectField(other, 'right'));
          self.bottom = rectFBits(rectField(other, 'bottom'));
        },
        'width()F': (self) => rectFNumber(self.right) - rectFNumber(self.left),
        'height()F': (self) => rectFNumber(self.bottom) - rectFNumber(self.top),
        'centerX()F': (self) => (rectFNumber(self.left) + rectFNumber(self.right)) / 2,
        'centerY()F': (self) => (rectFNumber(self.top) + rectFNumber(self.bottom)) / 2,
        'isEmpty()Z': (self) => rectFNumber(self.left) >= rectFNumber(self.right) || rectFNumber(self.top) >= rectFNumber(self.bottom),
        'inset(FF)V': (self, [dx, dy]) => {
          const x = Number(dx) || 0;
          const y = Number(dy) || 0;
          const l = rectFNumber(self.left);
          const t = rectFNumber(self.top);
          const r = rectFNumber(self.right);
          const b = rectFNumber(self.bottom);
          self.left = rectFBits(l + x);
          self.top = rectFBits(t + y);
          self.right = rectFBits(r - x);
          self.bottom = rectFBits(b - y);
        },
        'inset(FFFF)V': (self, [dl, dt, dr, db]) => {
          self.left = rectFBits(rectFNumber(self.left) + (Number(dl) || 0));
          self.top = rectFBits(rectFNumber(self.top) + (Number(dt) || 0));
          self.right = rectFBits(rectFNumber(self.right) - (Number(dr) || 0));
          self.bottom = rectFBits(rectFNumber(self.bottom) - (Number(db) || 0));
        },
        'offset(FF)V': (self, [dx, dy]) => {
          const x = Number(dx) || 0;
          const y = Number(dy) || 0;
          self.left = rectFBits(rectFNumber(self.left) + x);
          self.top = rectFBits(rectFNumber(self.top) + y);
          self.right = rectFBits(rectFNumber(self.right) + x);
          self.bottom = rectFBits(rectFNumber(self.bottom) + y);
        },
        'offsetTo(FF)V': (self, [x, y]) => {
          const w = rectFNumber(self.right) - rectFNumber(self.left);
          const h = rectFNumber(self.bottom) - rectFNumber(self.top);
          self.left = rectFBits(x);
          self.top = rectFBits(y);
          self.right = rectFBits((Number(x) || 0) + w);
          self.bottom = rectFBits((Number(y) || 0) + h);
        },
        'contains(FF)Z': (self, [x, y]) => {
          const px = Number(x) || 0;
          const py = Number(y) || 0;
          return px >= rectFNumber(self.left) && px < rectFNumber(self.right) && py >= rectFNumber(self.top) && py < rectFNumber(self.bottom);
        },
        'contains(Landroid/graphics/RectF;)Z': (self, [other]) => {
          const src = other?.$peer || other;
          return rectFNumber(src?.left) >= rectFNumber(self.left)
            && rectFNumber(src?.top) >= rectFNumber(self.top)
            && rectFNumber(src?.right) <= rectFNumber(self.right)
            && rectFNumber(src?.bottom) <= rectFNumber(self.bottom);
        },
        'round(Landroid/graphics/Rect;)V': (self, [out]) => {
          const w = (v) => Math.round(rectFNumber(v));
          setRectField(out, 'left', w(self.left));
          setRectField(out, 'top', w(self.top));
          setRectField(out, 'right', w(self.right));
          setRectField(out, 'bottom', w(self.bottom));
        },
        'roundOut(Landroid/graphics/Rect;)V': (self, [out]) => {
          const w = (v) => Math.ceil(rectFNumber(v));
          setRectField(out, 'left', w(self.left));
          setRectField(out, 'top', w(self.top));
          setRectField(out, 'right', w(self.right));
          setRectField(out, 'bottom', w(self.bottom));
        },
        'toString()Ljava/lang/String;': (self) => `RectF(${rectFNumber(self.left)}, ${rectFNumber(self.top)}, ${rectFNumber(self.right)}, ${rectFNumber(self.bottom)})`,
      },
    }),
    nativeDef('Landroid/graphics/drawable/shapes/Shape;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'draw(Landroid/graphics/Canvas;Landroid/graphics/Paint;)V': () => undefined,
        'getWidth()F': (self) => self.width ?? 0,
        'getHeight()F': (self) => self.height ?? 0,
        'getOutline(Landroid/graphics/Outline;)V': () => undefined,
      },
    }),
    nativeDef('Landroid/graphics/drawable/shapes/OvalShape;', {
      super: 'Landroid/graphics/drawable/shapes/Shape;',
    }),
    nativeDef('Landroid/graphics/drawable/ShapeDrawable;', {
      super: 'Landroid/graphics/drawable/Drawable;',
      ctor: class ShapeDrawablePeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.shape = null;
          this.paint = new Paint();
          this.paintPeer = vm.wrapPeer({
            paint: this.paint,
            constructor: { $descriptor: 'Landroid/graphics/Paint;' },
          });
        }
      },
      methods: {
        '<init>(Landroid/graphics/drawable/shapes/Shape;)V': (self, [shape]) => {
          self.shape = shape ?? null;
        },
        'getPaint()Landroid/graphics/Paint;': (self) => self.paintPeer,
        'getShape()Landroid/graphics/drawable/shapes/Shape;': (self) => self.shape,
        'setShape(Landroid/graphics/drawable/shapes/Shape;)V': (self, [shape]) => {
          self.shape = shape ?? null;
        },
        'setIntrinsicWidth(I)V': (self, [value]) => {
          self.intrinsicWidth = toInt(value);
        },
        'setIntrinsicHeight(I)V': (self, [value]) => {
          self.intrinsicHeight = toInt(value);
        },
        'getIntrinsicWidth()I': (self) => self.intrinsicWidth ?? -1,
        'getIntrinsicHeight()I': (self) => self.intrinsicHeight ?? -1,
        'draw(Landroid/graphics/Canvas;)V': (self, [canvas]) => {
          self.shape?.$peer?.draw?.(canvas, self.paintPeer);
        },
      },
    }),
    nativeDef('Landroid/view/View$MeasureSpec;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'makeMeasureSpec(II)I': (_self, [size, mode]) => {
          return MeasureSpec.makeMeasureSpec(toInt(size), toInt(mode));
        },
        'getMode(I)I': (_self, [spec]) => MeasureSpec.getMode(toInt(spec)),
        'getSize(I)I': (_self, [spec]) => MeasureSpec.getSize(toInt(spec)),
      },
    }),
    nativeDef('Landroid/widget/Toast$Length;', { super: 'Ljava/lang/Object;' }),
  ];
}

function viewMethods() {
  return {
    'onMeasure(II)V': (self, [widthSpec, heightSpec]) => {
      const view = self.view;
      if (!view) return;
      const vm = self.vm;
      const object = self.object;
      const savedObject = view.$javaObject;
      view.$javaObject = null;
      try {
        view.onMeasure(widthSpec | 0, heightSpec | 0);
      } finally {
        view.$javaObject = savedObject;
      }
    },
    'onLayout(ZIIII)V': (self, [changed, left, top, right, bottom]) => {
      const view = self.view;
      if (!view) return;
      view.onLayout(!!(changed | 0), left | 0, top | 0, right | 0, bottom | 0);
    },
    'measureChildren(II)V': (self, [widthSpec, heightSpec]) => {
      self.view?.measureChildren(widthSpec | 0, heightSpec | 0);
    },
    'makeOptionalFitsSystemWindows()V': () => undefined,
    'computeFitSystemWindows(Landroid/graphics/Rect;Landroid/graphics/Rect;)V': (self, [insets, outInsets]) => {
      const left = Number(insets?.left) || 0;
      const top = Number(insets?.top) || 0;
      const right = Number(insets?.right) || 0;
      const bottom = Number(insets?.bottom) || 0;
      if (outInsets && typeof outInsets === 'object') {
        outInsets.left = left;
        outInsets.top = top;
        outInsets.right = right;
        outInsets.bottom = bottom;
      }
      self.$fitInsets = { left, top, right, bottom };
    },
    'computeSystemWindowInsets(Landroid/view/WindowInsets;Landroid/graphics/Rect;)Landroid/view/WindowInsets;': (self, [_insets, outRect]) => {
      if (outRect && typeof outRect === 'object') {
        outRect.left = 0;
        outRect.top = 0;
        outRect.right = 0;
        outRect.bottom = 0;
      }
      return null;
    },
    'setWillNotDraw(Z)V': (self, [value]) => {
      if (self.view) self.view.willNotDraw = !!value;
    },
    'willNotDraw()Z': (self) => !!self.view?.willNotDraw,
    'setBackgroundTintList(Landroid/content/res/ColorStateList;)V': (self, [list]) => {
      const view = self.view;
      if (!view) return;
      view.backgroundTintList = list ?? null;
      view.backgroundTint = typeof list === 'number' ? list >>> 0 : null;
      const drawable = view.background;
      const drawablePeer = drawable?.$peer;
      if (drawablePeer && typeof drawablePeer === 'object') drawablePeer.tintList = list ?? null;
      view.refreshDrawableState?.();
      view.invalidate();
    },
    'getBackgroundTintList()Landroid/content/res/ColorStateList;': (self) => self.view?.backgroundTintList ?? null,
    'setBackgroundTintMode(Landroid/graphics/PorterDuff$Mode;)V': (self, [mode]) => {
      if (self.view) {
        self.view.backgroundTintMode = mode ?? null;
        self.view.invalidate?.();
      }
    },
    'setImageTintList(Landroid/content/res/ColorStateList;)V': () => undefined,
    'setImageTintMode(Landroid/graphics/PorterDuff$Mode;)V': () => undefined,
    'setCompoundDrawableTintList(Landroid/content/res/ColorStateList;)V': () => undefined,
    'setCompoundDrawableTintMode(Landroid/graphics/PorterDuff$Mode;)V': () => undefined,
    'getBackgroundTintMode()Landroid/graphics/PorterDuff$Mode;': (self) => self.view?.backgroundTintMode ?? null,
    'setForegroundTintList(Landroid/content/res/ColorStateList;)V': (self, [list]) => {
      const view = self.view;
      if (!view) return;
      view.foregroundTintList = list ?? null;
      const drawablePeer = view.foreground?.$peer;
      if (drawablePeer && typeof drawablePeer === 'object') drawablePeer.tintList = list ?? null;
      view.invalidate?.();
    },
    'getForegroundTintList()Landroid/content/res/ColorStateList;': (self) => self.view?.foregroundTintList ?? null,
    'setForegroundTintMode(Landroid/graphics/PorterDuff$Mode;)V': (self, [mode]) => {
      if (self.view) {
        self.view.foregroundTintMode = mode ?? null;
        self.view.invalidate?.();
      }
    },
    'getForegroundTintMode()Landroid/graphics/PorterDuff$Mode;': (self) => self.view?.foregroundTintMode ?? null,
    'setId(I)V': (self, [id]) => {
      if (self.view) self.view.id = id >>> 0;
    },
    'getId()I': (self) => self.view?.id ?? 0,
    'setVisibility(I)V': (self, [visibility]) => self.view?.setVisibility(visibility | 0),
    'getVisibility()I': (self) => self.view?.getVisibility() ?? 0,
    'setEnabled(Z)V': (self, [enabled]) => self.view?.setEnabled(!!enabled),
    'isEnabled()Z': (self) => self.view?.isEnabled() ?? true,
    'setClickable(Z)V': (self, [clickable]) => self.view?.setClickable(!!clickable),
    'setOnClickListener(Landroid/view/View$OnClickListener;)V': (self, [listener], vm) => {

      if (!self.view) return;
      self.view.setOnClickListener(
        listener
          ? () => vm.invokeInterface(listener, 'onClick', '(Landroid/view/View;)V', [viewObject(vm, self.view)])
          : null
      );
    },
    'setOnLongClickListener(Landroid/view/View$OnLongClickListener;)V': (self, [listener], vm) => {
      if (!self.view) return;
      self.view.setOnLongClickListener(
        listener
          ? () => !!vm.invokeInterface(listener, 'onLongClick', '(Landroid/view/View;)Z', [viewObject(vm, self.view)])
          : null
      );
    },
    'setBackgroundColor(I)V': (self, [color]) => self.view?.setBackgroundColor(color >>> 0),
    'setBackground(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => self.view?.setBackground(drawable),
    'setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => self.view?.setBackground(drawable),
    'setBackgroundResource(I)V': (self, [resId], vm) => {
      const id = resId >>> 0;
      const table = (self.resources || vm.resources)?.table;
      const hasEntry = !!table?.getEntry?.(id);
      if (!hasEntry && id > 0xff) {
        self.view?.setBackgroundColor(id);
        return;
      }
      const drawable = drawableObject(vm, (self.resources || vm.resources)?.getDrawable(id));
      if (drawable) self.view?.setBackground(drawable);
    },
    'getBackground()Landroid/graphics/drawable/Drawable;': (self) => drawableObject(self.vm, self.view?.getBackground() ?? null),
    'setForeground(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => self.view?.setForeground?.(drawable),
    'getForeground()Landroid/graphics/drawable/Drawable;': (self) => drawableObject(self.vm, self.view?.getForeground?.() ?? null),
    'setForegroundGravity(I)V': (self, [gravity]) => self.view?.setForegroundGravity?.(gravity | 0),
    'setPadding(IIII)V': (self, [l, t, r, b], vm) => {
      self.view?.setPadding(l | 0, t | 0, r | 0, b | 0);
      syncDexViewField(self, vm, 'mPaddingLeft', 'I', l | 0);
      syncDexViewField(self, vm, 'mPaddingTop', 'I', t | 0);
      syncDexViewField(self, vm, 'mPaddingRight', 'I', r | 0);
      syncDexViewField(self, vm, 'mPaddingBottom', 'I', b | 0);
    },
    'setAlpha(F)V': (self, [alpha]) => self.view?.setAlpha(alpha),
    'setTranslationX(F)V': (self, [value]) => self.view?.setTranslationX(value),
    'setTranslationY(F)V': (self, [value]) => self.view?.setTranslationY(value),
    'setTag(Ljava/lang/Object;)V': (self, [tag]) => self.view?.setTag(tag),
    'getTag()Ljava/lang/Object;': (self) => self.view?.getTag() ?? null,
    'setTag(ILjava/lang/Object;)V': (self, [key, tag]) => self.view?.setTag(tag, key),
    'getTag(I)Ljava/lang/Object;': (self, [key]) => self.view?.getTag(key) ?? null,
    'getAlpha()F': (self) => (typeof self.view?.getAlpha === 'function' ? self.view.getAlpha() : (self.view?.alpha ?? 1)),
    'findFocus()Landroid/view/View;': (self, _a, vm) => {
      const found = findFocusedView(self.view);
      return found ? viewObject(vm, found) : null;
    },
    'setFocusable(Z)V': (self, [focusable]) => self.view?.setFocusable(focusable !== 0 && focusable !== false),
    'setFocusableInTouchMode(Z)V': (self, [focusable]) => self.view?.setFocusableInTouchMode?.(focusable !== 0 && focusable !== false),
    'setAccessibilityDelegate(Landroid/view/View$AccessibilityDelegate;)V': () => undefined,
    'setSaveFromParentEnabled(Z)V': () => undefined,
    'requestApplyInsets()V': () => undefined,
    'setOnKeyListener(Landroid/view/View$OnKeyListener;)V': () => undefined,
    'setMeasuredDimension(II)V': (self, [w, h], vm) => {
      self.view?.setMeasuredDimension(w | 0, h | 0);
      syncDexViewField(self, vm, 'mMeasuredWidth', 'I', w | 0);
      syncDexViewField(self, vm, 'mMeasuredHeight', 'I', h | 0);
      syncDexViewField(self, vm, 'mMeasuredWidthAndState', 'I', w | 0);
      syncDexViewField(self, vm, 'mMeasuredHeightAndState', 'I', h | 0);
    },
    'getWidth()I': (self) => self.view?.getWidth() ?? 0,
    'getHeight()I': (self) => self.view?.getHeight() ?? 0,
    'getMeasuredWidth()I': (self) => self.view?.getMeasuredWidth() ?? 0,
    'getMeasuredHeight()I': (self) => self.view?.getMeasuredHeight() ?? 0,
    'getLeft()I': (self) => self.view?.getLeft() ?? 0,
    'getTop()I': (self) => self.view?.getTop() ?? 0,
    'getRight()I': (self) => self.view?.getRight() ?? 0,
    'getBottom()I': (self) => self.view?.getBottom() ?? 0,
    'getContext()Landroid/content/Context;': (self, _a, vm) => (self?.vm || vm)?.contextObject || null,
    'getResources()Landroid/content/res/Resources;': (self) => self.vm.resources,
    'findViewById(I)Landroid/view/View;': (self, [id], vm) => {
      const found = findView(self.view, id >>> 0);
      return found ? viewObject(vm, found) : null;
    },
    'requestLayout()V': (self) => self.view?.requestLayout(),
    'invalidate()V': (self) => self.view?.invalidate(),
    'postInvalidate()V': (self) => self.view?.postInvalidate(),
    'post(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
      self.view?.post(() => self.vm.runRunnable(runnable));
      return true;
    },
    'postDelayed(Ljava/lang/Runnable;J)Z': (self, [runnable, delay]) => {
      self.view?.postDelayed(() => self.vm.runRunnable(runnable), Number(delay) || 0);
      return true;
    },
    'performClick()Z': (self) => self.view?.performClick() ?? false,
    'isShown()Z': (self) => self.view?.isShown() ?? true,
    'getParent()Landroid/view/ViewParent;': (self, _args, vm) => {
      const parent = self.view?.getParent();
      return parent ? viewObject(vm, parent) : null;
    },
    'setMinimumWidth(I)V': (self, [width]) => self.view?.setMinimumWidth(width),
    'setMinimumHeight(I)V': (self, [height]) => self.view?.setMinimumHeight(height),
    'getMinimumWidth()I': (self) => self.view?.getMinimumWidth() ?? 0,
    'getSuggestedMinimumWidth()I': (self) => self.view?.getSuggestedMinimumWidth?.() ?? self.view?.getMinimumWidth?.() ?? 0,
    'getSuggestedMinimumHeight()I': (self) => self.view?.getSuggestedMinimumHeight?.() ?? self.view?.getMinimumHeight?.() ?? 0,
    'saveAttributeDataForStyleable(Landroid/content/Context;[ILandroid/util/AttributeSet;Landroid/content/res/TypedArray;II)V': () => undefined,
    'setPointerIcon(Landroid/view/PointerIcon;)V': () => undefined,
    'bringToFront()V': (self) => {
      const parent = self.view?.parent;
      if (!parent || !Array.isArray(parent.children)) return;
      const index = parent.children.indexOf(self.view);
      if (index >= 0 && index < parent.children.length - 1) {
        parent.children.splice(index, 1);
        parent.children.push(self.view);
        parent.$zOrder = null;
        parent.invalidate?.();
      }
    },
    'getImportantForAutofill()I': () => 0,
    'setImportantForAutofill(I)V': () => undefined,
    'getMinimumHeight()I': (self) => self.view?.getMinimumHeight() ?? 0,
    'getScrollX()I': (self) => self.view?.getScrollX() ?? 0,
    'getScrollY()I': (self) => self.view?.getScrollY() ?? 0,
    'scrollTo(II)V': (self, [x, y]) => self.view?.scrollTo(x | 0, y | 0),
    'scrollBy(II)V': (self, [x, y]) => self.view?.scrollBy(x | 0, y | 0),
    'setScrollX(I)V': (self, [x]) => self.view?.setScrollX(x | 0),
    'setScrollY(I)V': (self, [y]) => self.view?.setScrollY(y | 0),
    'setScaleX(F)V': (self, [v]) => self.view?.setScaleX(v),
    'getScaleX()F': (self) => self.view?.getScaleX() ?? 1,
    'setScaleY(F)V': (self, [v]) => self.view?.setScaleY(v),
    'getScaleY()F': (self) => self.view?.getScaleY() ?? 1,
    'setRotation(F)V': (self, [v]) => self.view?.setRotation(v),
    'getRotation()F': (self) => self.view?.getRotation() ?? 0,
    'setRotationX(F)V': (self, [v]) => self.view?.setRotationX(v),
    'getRotationX()F': (self) => self.view?.getRotationX() ?? 0,
    'setRotationY(F)V': (self, [v]) => self.view?.setRotationY(v),
    'getRotationY()F': (self) => self.view?.getRotationY() ?? 0,
    'setPivotX(F)V': (self, [v]) => self.view?.setPivotX(v),
    'getPivotX()F': (self) => self.view?.getPivotX() ?? 0,
    'setPivotY(F)V': (self, [v]) => self.view?.setPivotY(v),
    'getPivotY()F': (self) => self.view?.getPivotY() ?? 0,
    'setTranslationZ(F)V': (self, [v]) => self.view?.setTranslationZ(v),
    'getTranslationZ()F': (self) => self.view?.getTranslationZ() ?? 0,
    'getTranslationX()F': (self) => self.view?.getTranslationX() ?? 0,
    'hasTransientState()Z': () => 0,
    'getAccessibilityDelegate()Landroid/view/View$AccessibilityDelegate;': () => null,
    'saveHierarchyState(Landroid/util/SparseArray;)V': () => undefined,
    'restoreHierarchyState(Landroid/util/SparseArray;)V': () => undefined,
    'getMatrix()Landroid/graphics/Matrix;': (self, _args, vm) => {
      if (self.view?.matrixObject) return self.view.matrixObject;
      const matrix = vm.allocateRawObject('Landroid/graphics/Matrix;');
      matrix.$peer = { matrix: [1, 0, 0, 1, 0, 0] };
      if (self.view) self.view.matrixObject = matrix;
      return matrix;
    },
    'isChildrenDrawingOrderEnabled()Z': () => 0,
    'hasWindowFocus()Z': () => 1,
    'getTranslationY()F': (self) => self.view?.getTranslationY() ?? 0,
    'setX(F)V': (self, [v]) => self.view?.setX(v),
    'setY(F)V': (self, [v]) => self.view?.setY(v),
    'getX()F': (self) => self.view?.getX() ?? 0,
    'getY()F': (self) => self.view?.getY() ?? 0,
    'setZ(F)V': (self, [v]) => self.view?.setElevation(v),
    'getZ()F': (self) => self.view?.getZ() ?? 0,
    'setOutlineProvider(Landroid/view/ViewOutlineProvider;)V': (self, [provider]) => {
      if (!self.view) return;
      self.view.outlineProvider = provider ?? null;
      self.view.invalidate?.();
    },
    'getOutlineProvider()Landroid/view/ViewOutlineProvider;': (self) => self.view?.outlineProvider ?? null,
    'invalidateOutline()V': (self) => self.view?.invalidate?.(),
    'setClipToOutline(Z)V': (self, [value]) => {
      if (self.view) self.view.clipToOutline = !!value;
    },
    'getClipToOutline()Z': (self) => (self.view?.clipToOutline ? 1 : 0),
    'setElevation(F)V': (self, [v]) => self.view?.setElevation(v),
    'getElevation()F': (self) => self.view?.getElevation() ?? 0,
    'setSelected(Z)V': (self, [v]) => self.view?.setSelected(!!v),
    'isSelected()Z': (self) => self.view?.isSelected() ?? false,
    'setActivated(Z)V': (self, [v]) => self.view?.setActivated(!!v),
    'isActivated()Z': (self) => self.view?.isActivated() ?? false,
    'setPressed(Z)V': (self, [v]) => self.view?.setPressed(!!v),
    'isPressed()Z': (self) => self.view?.isPressed() ?? false,
    'refreshDrawableState()V': (self) => self.view?.refreshDrawableState?.(),
    'drawableStateChanged()V': (self) => {
      self.view?.refreshDrawableState?.();
      self.view?.invalidate?.();
    },
    'getDrawableState()[I': (self, _args, vm) => {
      const values = self.view?.drawableState?.() || [];
      const array = vm.newArray('I', values.length);
      values.forEach((value, index) => { array.$data[index] = value | 0; });
      return array;
    },
    'isInEditMode()Z': () => 0,
    'setLongClickable(Z)V': (self, [v]) => self.view?.setLongClickable(!!v),
    'isLongClickable()Z': (self) => self.view?.isLongClickable() ?? false,
    'isClickable()Z': (self) => self.view?.isClickable() ?? false,
    'setFitsSystemWindows(Z)V': (self, [v]) => self.view?.setFitsSystemWindows(!!v),
    'getFitsSystemWindows()Z': (self) => self.view?.getFitsSystemWindows() ?? false,
    'setAccessibilityLiveRegion(I)V': (self, [v]) => self.view?.setAccessibilityLiveRegion(v | 0),
    'getAccessibilityLiveRegion()I': (self) => self.view?.getAccessibilityLiveRegion() ?? 0,
    'setImportantForAccessibility(I)V': (self, [v]) => self.view?.setImportantForAccessibility(v | 0),
    'getImportantForAccessibility()I': (self) => self.view?.getImportantForAccessibility() ?? 0,
    'setNestedScrollingEnabled(Z)V': (self, [v]) => self.view?.setNestedScrollingEnabled(!!v),
    'isNestedScrollingEnabled()Z': (self) => self.view?.isNestedScrollingEnabled() ?? false,
    'setTooltipText(Ljava/lang/CharSequence;)V': (self, [v]) => self.view?.setTooltipText(v),
    'getTooltipText()Ljava/lang/CharSequence;': (self) => self.view?.getTooltipText() ?? null,
    'setContentDescription(Ljava/lang/CharSequence;)V': (self, [v]) => self.view?.setContentDescription(v),
    'getContentDescription()Ljava/lang/CharSequence;': (self) => self.view?.getContentDescription() ?? null,
    'setLabelFor(I)V': (self, [v]) => self.view?.setLabelFor(v >>> 0),
    'getLabelFor()I': (self) => self.view?.getLabelFor() ?? 0,
    'setLayerType(ILandroid/graphics/Paint;)V': (self, [type]) => self.view?.setLayerType(type | 0, null),
    'getLayerType()I': (self) => self.view?.getLayerType() ?? 0,
    'setLayoutDirection(I)V': (self, [v]) => self.view?.setLayoutDirection(v | 0),
    'getLayoutDirection()I': (self) => self.view?.getLayoutDirection() ?? 0,
    'setOverScrollMode(I)V': (self, [v]) => self.view?.setOverScrollMode(v | 0),
    'getOverScrollMode()I': (self) => self.view?.getOverScrollMode() ?? 1,
    'setOnTouchListener(Landroid/view/View$OnTouchListener;)V': (self, [listener], vm) => {
      if (!self.view) return;
      self.view.setOnTouchListener(
        listener
          ? (event) => !!vm.invokeInterface(listener, 'onTouch', '(Landroid/view/View;Landroid/view/MotionEvent;)Z', [viewObject(vm, self.view), toMotionEventObject(vm, event)])
          : null
      );
    },
    'setOnHoverListener(Landroid/view/View$OnHoverListener;)V': (self, [listener]) => {
      self.view?.setOnHoverListener(listener || null);
    },
    'setOnFocusChangeListener(Landroid/view/View$OnFocusChangeListener;)V': (self, [listener]) => {
      self.view?.setOnFocusChangeListener(listener || null);
    },
    'addOnLayoutChangeListener(Landroid/view/View$OnLayoutChangeListener;)V': (self, [listener]) => {
      self.view?.addOnLayoutChangeListener(listener || null);
    },
    'removeOnLayoutChangeListener(Landroid/view/View$OnLayoutChangeListener;)V': (self, [listener]) => {
      self.view?.removeOnLayoutChangeListener(listener || null);
    },
    'addOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)V': (self, [listener]) => {
      self.view?.addOnAttachStateChangeListener(listener || null);
    },
    'removeOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)V': (self, [listener]) => {
      self.view?.removeOnAttachStateChangeListener(listener || null);
    },
    'getMeasuredState()I': (self) => self.view?.getMeasuredState() ?? 0,
    'getMeasuredWidthAndState()I': (self) => self.view?.getMeasuredWidthAndState() ?? 0,
    'getMeasuredHeightAndState()I': (self) => self.view?.getMeasuredHeightAndState() ?? 0,
    'getBaseline()I': (self) => self.view?.getBaseline() ?? -1,
    'isLaidOut()Z': (self) => self.view?.isLaidOut() ?? false,
    'getViewTreeObserver()Landroid/view/ViewTreeObserver;': (self, _args, vm) => {
      if (!self.viewTreeObserverObject) {
        self.viewTreeObserverObject = vm.instantiate('Landroid/view/ViewTreeObserver;', []);
      }
      return self.viewTreeObserverObject;
    },
    'getDrawingRect(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getDrawingRect(rect),
    'getGlobalVisibleRect(Landroid/graphics/Rect;Landroid/graphics/Point;)Z': (self, [rect, point]) => self.view?.getGlobalVisibleRect(rect, point) ?? false,
    'getLocalVisibleRect(Landroid/graphics/Rect;)Z': (self, [rect]) => self.view?.getLocalVisibleRect(rect) ?? false,
    'getWindowVisibleDisplayFrame(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getWindowVisibleDisplayFrame(rect),
    'getHitRect(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getHitRect(rect),
    'getLocationOnScreen([I)V': (self, [out]) => self.view?.getLocationOnScreen(out),
    'getLocationInWindow([I)V': (self, [out]) => self.view?.getLocationInWindow(out),
    'getWindowToken()Landroid/os/IBinder;': (self) => self.view?.getWindowToken() ?? null,
    'getApplicationWindowToken()Landroid/os/IBinder;': (self) => self.view?.getApplicationWindowToken() ?? null,
    'isAttachedToWindow()Z': (self) => self.view?.isAttachedToWindow() ?? false,
    'hasFocus()Z': (self) => self.view?.hasFocus() ?? false,
    'isFocused()Z': (self) => self.view?.isFocused() ?? false,
    'requestFocus()Z': (self) => self.view?.requestFocus() ?? false,
    'clearFocus()V': (self) => self.view?.clearFocus(),
    'isFocusable()Z': (self) => self.view?.isFocusable() ?? false,
    'hasFocusable()Z': (self) => self.view?.hasFocusable() ?? false,
    'offsetLeftAndRight(I)V': (self, [offset]) => self.view?.offsetLeftAndRight(offset | 0),
    'offsetTopAndBottom(I)V': (self, [offset]) => self.view?.offsetTopAndBottom(offset | 0),
    'getRootView()Landroid/view/View;': (self, _args, vm) => {
      const root = self.view?.getRootView();
      return root ? viewObject(vm, root) : null;
    },
    'getRootWindowInsets()Landroid/view/WindowInsets;': (self, _args, vm) => {
      if (!self.windowInsetsObject) {
        self.windowInsetsObject = vm.instantiate('Landroid/view/WindowInsets;', []);
      }
      return self.windowInsetsObject;
    },
    'onApplyWindowInsets(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
    'dispatchApplyWindowInsets(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
    'hasOnClickListeners()Z': (self) => self.view?.hasOnClickListener() ?? false,
    'forceLayout()V': (self) => {
      // 只置标记，不触发遍历，和 AOSP 的 forceLayout 一致。
      if (self.view) self.view.$layoutRequested = true;
    },
    'isLayoutRequested()Z': (self) => self.view?.isLayoutRequestedFlag() ?? false,
    'jumpDrawablesToCurrentState()V': () => undefined,
    'postOnAnimation(Ljava/lang/Runnable;)V': (self, [runnable]) => {
      self.view?.post(() => self.vm.runRunnable(runnable));
    },
    'postOnAnimationDelayed(Ljava/lang/Runnable;J)V': (self, [runnable, delay]) => {
      self.view?.postDelayed(() => self.vm.runRunnable(runnable), Number(delay) || 0);
    },
    'postInvalidateOnAnimation()V': (self) => self.view?.postInvalidate(),
    'cancelLongPress()V': () => undefined,
    'cancelPendingInputEvents()V': () => undefined,
    'canScrollVertically(I)Z': () => false,
    'canScrollHorizontally(I)Z': () => false,
    'getLayoutDirectionResolved()Z': () => false,
    'isPaddingRelative()Z': () => false,
    'getPaddingStart()I': (self) => self.view?.getPaddingLeft() ?? 0,
    'getPaddingEnd()I': (self) => self.view?.getPaddingRight() ?? 0,
    'getPaddingLeft()I': (self) => self.view?.getPaddingLeft() ?? 0,
    'getPaddingTop()I': (self) => self.view?.getPaddingTop() ?? 0,
    'getPaddingRight()I': (self) => self.view?.getPaddingRight() ?? 0,
    'getPaddingBottom()I': (self) => self.view?.getPaddingBottom() ?? 0,
    'getLayoutParams()Landroid/view/ViewGroup$LayoutParams;': (self, _args, vm) => {
      const view = self.view;
      if (!view) return null;
      const descriptor = layoutParamsDescriptorFor(view, vm);
      const existing = view.$layoutParamsObject;
      if (existing && existing.$fields) {
        try {
          if (vm.registry.instanceOf(existing, 'Landroid/view/ViewGroup$LayoutParams;')) return existing;
        } catch {
          // 继续走下方重建逻辑
        }
      }
      const params = view.layoutParams || { width: -2, height: -2 };
      let object = buildLayoutParamsViaDex(
        vm,
        descriptor,
        params,
        view.$layoutParamsAttrSet || null,
        vm.contextObject || null
      );
      if (!object) {
        object = vm.allocateObject(vm.registry.resolve(descriptor));
      }
      const effective = { ...params };
      if (object.$fields) {
        for (const [key, value] of object.$fields) {
          if (typeof value !== 'number') continue;
          for (const axis of ['width', 'height', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'gravity', 'weight', 'startMargin', 'endMargin']) {
            if (key.endsWith(`->${axis}:I`)) effective[axis] = value;
          }
        }
      }
      object.$layoutParams = effective;
      view.layoutParams = effective;
      view.$layoutParamsObject = object;
      return object;
    },
    'setLayoutParams(Landroid/view/ViewGroup$LayoutParams;)V': (self, [params]) => {
      if (!self.view) return;
      const raw = params?.$layoutParams || params;
      if (raw && typeof raw === 'object') {
        const merged = { ...raw };
        const fields = params?.$fields;
        if (fields) {
          for (const axis of ['width', 'height', 'x', 'y', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'gravity', 'weight', 'startMargin', 'endMargin', 'column', 'span']) {
            for (const [key, value] of fields) {
              if (key.endsWith(`->${axis}:I`) && typeof value === 'number') merged[axis] = value;
            }
          }
        }
        self.view.layoutParams = merged;
        self.view.$layoutParamsObject = params || null;
      }
    },
    'setOnApplyWindowInsetsListener(Landroid/view/View$OnApplyWindowInsetsListener;)V': () => undefined,
    'setPaddingRelative(IIII)V': (self, [s, t, e, b]) => self.view?.setPaddingRelative(s, t, e, b),
    'combineMeasuredStates(II)I': (self, [cur, next]) => (cur | next) >>> 0,
    'resolveSizeAndState(III)I': (self, [size, spec, childState]) => {
      return ((resolveSize(size, spec) | (childState & 0xff000000)) >>> 0);
    },
    'resolveSize(II)I': (self, [size, spec]) => resolveSize(size, spec),
    'getDefaultSize(II)I': (self, [size, spec]) => getDefaultSize(size, spec),
    'measure(II)V': (self, [w, h]) => {
      return self.view?.measure(w, h);
    },
    'layout(IIII)V': (self, [l, t, r, b]) => {
      return self.view?.layout(l, t, r, b);
    },
    'onMeasure(II)V': (self, [w, h]) => self.view?.onMeasure(w, h),
    'onLayout(ZIIII)V': (self, [changed, l, t, r, b]) => self.view?.onLayout(!!changed, l, t, r, b),
    'onDraw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.onDraw(canvas?.$peer?.canvas || canvas),
    'draw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.draw(canvas?.$peer?.canvas || canvas),
    'onTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.onTouchEvent(event) ?? false,
    'dispatchTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.dispatchTouchEvent(event) ?? false,
    'onAttachedToWindow()V': (self) => self.view?.onAttachedToWindow(),
    'onDetachedFromWindow()V': (self) => self.view?.onDetachedFromWindow(),
    'animate()Landroid/view/ViewPropertyAnimator;': (self, _args, vm) => {
      const view = self.view;
      if (!view) return null;
      return makeViewPropertyAnimator(vm, view);
    },
    'getAnimation()Landroid/view/animation/Animation;': (self) => self.view?.animation ?? null,
    'startAnimation(Landroid/view/animation/Animation;)V': (self, [anim]) => {
      if (self.view) self.view.animation = anim;
    },
    'clearAnimation()V': (self) => {
      if (self.view) self.view.animation = null;
    },
    'toString()Ljava/lang/String;': (self) => `View{${self.view?.id ?? ''} ${self.view?.left ?? 0},${self.view?.top ?? 0}}`,
    'dispatchWindowInsetsAnimationPrepare(Landroid/view/WindowInsetsAnimation;)V': () => undefined,
    'dispatchWindowInsetsAnimationStart(Landroid/view/WindowInsetsAnimation;Landroid/view/WindowInsetsAnimation$Bounds;)Landroid/view/WindowInsetsAnimation$Bounds;': (_self, [_animation, bounds]) => bounds ?? null,
    'dispatchWindowInsetsAnimationProgress(Landroid/view/WindowInsets;Ljava/util/List;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
    'dispatchWindowInsetsAnimationEnd(Landroid/view/WindowInsetsAnimation;)V': () => undefined,
    'setSystemGestureExclusionRects(Ljava/util/List;)V': (self, [rects]) => { self.view && (self.view.gestureExclusionRects = rects ?? null); },
    'getSystemGestureExclusionRects()Ljava/util/List;': (_self, _args, vm) => emptyJavaList(vm),
    'getLocationInSurface([I)V': (self, [out]) => {
      const view = self.view;
      const values = out?.$data;
      if (!view || !Array.isArray(values)) return;
      const point = view.getLocationInWindow?.() ?? { x: view.left || 0, y: view.top || 0 };
      values[0] = point.x | 0;
      values[1] = point.y | 0;
    },
    'getWindowInsetsController()Landroid/view/WindowInsetsController;': () => null,
    'requestFitSystemWindows()V': () => undefined,
    'setFocusable(I)V': (self, [value]) => { if (self.view) self.view.focusable = (value | 0) !== 0; },
    'setAutofillHints([Ljava/lang/String;)V': (self, [hints]) => { self.autofillHints = hints ?? null; },
    'setSoundEffectsEnabled(Z)V': (self, [value]) => { self.soundEffectsEnabled = !!value; },
    'isSoundEffectsEnabled()Z': (self) => self?.soundEffectsEnabled !== false,
    'setHapticFeedbackEnabled(Z)V': (self, [value]) => { self.hapticFeedbackEnabled = !!value; },
    'isHapticFeedbackEnabled()Z': (self) => self?.hapticFeedbackEnabled !== false,
    'setHasTransientState(Z)V': (self, [value]) => { self.hasTransientStateFlag = !!value; },
    'setWillNotCacheDrawing(Z)V': (self, [value]) => { self.willNotCacheDrawing = !!value; },
    'willNotCacheDrawing()Z': (self) => !!self?.willNotCacheDrawing,
    'setAllowClickWhenDisabled(Z)V': (self, [value]) => { self.allowClickWhenDisabled = !!value; },
    'isContextClickable()Z': (self) => !!self.view?.contextClickable,
    'setContextClickable(Z)V': (self, [value]) => { if (self.view) self.view.contextClickable = !!value; },
    'dispatchSetPressed(Z)V': (self, [pressed]) => { self.view?.setPressed?.(!!pressed); },
    'isSaveEnabled()Z': (self) => self?.saveEnabled !== false,
    'setSaveEnabled(Z)V': (self, [value]) => { self.saveEnabled = !!value; },
    'getFilterTouchesWhenObscured()Z': (self) => !!self?.filterTouchesWhenObscured,
    'setFilterTouchesWhenObscured(Z)V': (self, [value]) => { self.filterTouchesWhenObscured = !!value; },
    'isSaveFromParentEnabled()Z': (self) => self?.saveFromParentEnabled !== false,
    'getFocusable()I': (self) => (self.view?.focusable === false ? 0 : 0x11),
    'isScreenReaderFocusable()Z': (self) => !!self?.screenReaderFocusable,
    'setScreenReaderFocusable(Z)V': (self, [value]) => { self.screenReaderFocusable = !!value; },
    'isAccessibilityHeading()Z': (self) => !!self?.accessibilityHeading,
    'setAccessibilityHeading(Z)V': (self, [value]) => { self.accessibilityHeading = !!value; },
    'focusSearch(I)Landroid/view/View;': () => null,
    'isKeyboardNavigationCluster()Z': (self) => !!self?.keyboardNavigationCluster,
    'setKeyboardNavigationCluster(Z)V': (self, [value]) => { self.keyboardNavigationCluster = !!value; },
    'isFocusedByDefault()Z': (self) => !!self?.focusedByDefault,
    'setFocusedByDefault(Z)V': (self, [value]) => { self.focusedByDefault = !!value; },
    'keyboardNavigationClusterSearch(Landroid/view/View;I)Landroid/view/View;': () => null,
    'dispatchUnhandledMove(Landroid/view/View;I)Z': () => false,
    'setDefaultFocusHighlightEnabled(Z)V': (self, [value]) => { self.defaultFocusHighlightEnabled = !!value; },
    'getDefaultFocusHighlightEnabled()Z': (self) => self?.defaultFocusHighlightEnabled !== false,
    'getFocusables(I)Ljava/util/ArrayList;': (self, [_direction], vm) => {
      const list = emptyJavaList(vm);
      const view = self.view;
      if (view && view.visibility !== 8 && view.focusable !== false) list.$peer.items.push(viewObject(vm, view));
      return list;
    },
    'addFocusables(Ljava/util/ArrayList;I)V': (self, [list, direction], vm) => {
      const items = list?.$peer?.items || [];
      const view = self.view;
      if (view && view.visibility !== 8 && view.focusable !== false) items.push(viewObject(vm, view));
      if (list?.$peer) list.$peer.items = items;
    },
    'addFocusables(Ljava/util/ArrayList;II)V': (self, [list], vm) => {
      const items = list?.$peer?.items || [];
      const view = self.view;
      if (view && view.visibility !== 8 && view.focusable !== false) items.push(viewObject(vm, view));
      if (list?.$peer) list.$peer.items = items;
    },
    'addKeyboardNavigationClusters(Ljava/util/Collection;I)V': () => undefined,
    'findViewsWithText(Ljava/util/ArrayList;Ljava/lang/CharSequence;I)V': (self, [list, text], vm) => {
      const needle = String(text ?? '').toLowerCase();
      const content = String(self.view?.text ?? self.view?.hint ?? '').toLowerCase();
      if (!needle || !content.includes(needle)) return;
      const items = list?.$peer?.items || [];
      items.push(viewObject(vm, self.view));
      if (list?.$peer) list.$peer.items = items;
    },
    'getTouchables()Ljava/util/ArrayList;': (self, _args, vm) => {
      const list = emptyJavaList(vm);
      if (self.view?.clickable === true) list.$peer.items.push(viewObject(vm, self.view));
      return list;
    },
    'addTouchables(Ljava/util/ArrayList;)V': (self, [list], vm) => {
      if (self.view?.clickable !== true) return;
      const items = list?.$peer?.items || [];
      items.push(viewObject(vm, self.view));
      if (list?.$peer) list.$peer.items = items;
    },
    'isAccessibilityFocused()Z': (self) => !!self.view?.accessibilityFocused,
    'restoreDefaultFocus()Z': (self) => {
      const view = self.view;
      if (!view || view.focusable === false) return false;
      view.focused = true;
      return true;
    },
    'requestFocus(I)Z': (self) => {
      const view = self.view;
      if (!view || view.focusable === false || view.visibility !== 0) return false;
      view.focused = true;
      view.requestFocus?.();
      return true;
    },
    'requestFocus(ILandroid/graphics/Rect;)Z': (self) => {
      const view = self.view;
      if (!view || view.focusable === false || view.visibility !== 0) return false;
      view.focused = true;
      view.requestFocus?.();
      return true;
    },
    'requestFocusFromTouch()Z': (self) => {
      const view = self.view;
      if (!view) return false;
      view.focused = true;
      return true;
    },
    'isImportantForAccessibility()Z': () => true,
    'getParentForAccessibility()Landroid/view/ViewParent;': (self, _args, vm) => {
      const parent = self.view?.parent;
      return parent ? viewObject(vm, parent) : null;
    },
    'addChildrenForAccessibility(Ljava/util/ArrayList;)V': (self, [list], vm) => {
      if (!self.view) return;
      const items = list?.$peer?.items || [];
      items.push(viewObject(vm, self.view));
      if (list?.$peer) list.$peer.items = items;
    },
    'setTransitionVisibility(I)V': (self, [visibility]) => {
      if (self.view) self.view.visibility = visibility | 0;
    },
    'dispatchNestedPrePerformAccessibilityAction(ILandroid/os/Bundle;)Z': () => false,
    'performAccessibilityAction(ILandroid/os/Bundle;)Z': () => false,
    'isTemporarilyDetached()Z': (self) => !!self?.temporarilyDetached,
    'dispatchStartTemporaryDetach()V': (self) => { self.temporarilyDetached = true; },
    'onStartTemporaryDetach()V': () => undefined,
    'dispatchFinishTemporaryDetach()V': (self) => { self.temporarilyDetached = false; },
    'onFinishTemporaryDetach()V': () => undefined,
    'getKeyDispatcherState()Landroid/view/KeyEvent$DispatcherState;': () => null,
    'dispatchKeyEventPreIme(Landroid/view/KeyEvent;)Z': () => false,
    'dispatchKeyEvent(Landroid/view/KeyEvent;)Z': (self, [event]) => self.view?.dispatchKeyEvent?.(event) ?? false,
    'dispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': () => false,
    'onFilterTouchEventForSecurity(Landroid/view/MotionEvent;)Z': () => true,
    'dispatchTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
    'dispatchCapturedPointerEvent(Landroid/view/MotionEvent;)Z': () => false,
    'dispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.dispatchGenericMotionEvent?.(event) ?? false,
    'dispatchHoverEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.dispatchHoverEvent?.(event) ?? false,
    'dispatchGenericPointerEvent(Landroid/view/MotionEvent;)Z': () => false,
    'dispatchGenericFocusedEvent(Landroid/view/MotionEvent;)Z': () => false,
    'dispatchWindowFocusChanged(Z)V': (self, [hasFocus]) => {
      if (self.view) self.view.hasWindowFocus = !!hasFocus;
    },
    'onWindowFocusChanged(Z)V': () => undefined,
    'dispatchVisibilityChanged(Landroid/view/View;I)V': (self, [_source, visibility]) => {
      if (self.view) self.view.visibility = visibility | 0;
    },
    'onVisibilityChanged(Landroid/view/View;I)V': () => undefined,
    'dispatchDisplayHint(I)V': () => undefined,
    'onDisplayHint(I)V': () => undefined,
    'dispatchWindowVisibilityChanged(I)V': (self, [visibility]) => {
      if (self.view) self.view.windowVisibility = visibility | 0;
    },
    'onWindowVisibilityChanged(I)V': () => undefined,
    'onVisibilityAggregated(Z)V': () => undefined,
    'getWindowVisibility()I': () => 0,
    'dispatchConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
    'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
    'isInTouchMode()Z': () => true,
    'onKeyPreIme(ILandroid/view/KeyEvent;)Z': () => false,
    'onKeyDown(ILandroid/view/KeyEvent;)Z': () => false,
    'onKeyLongPress(ILandroid/view/KeyEvent;)Z': () => false,
    'onKeyUp(ILandroid/view/KeyEvent;)Z': () => false,
    'onKeyMultiple(IILandroid/view/KeyEvent;)Z': () => false,
    'onKeyShortcut(ILandroid/view/KeyEvent;)Z': () => false,
    'onCheckIsTextEditor()Z': () => false,
    'onCreateInputConnection(Landroid/view/inputmethod/EditorInfo;)Landroid/view/inputmethod/InputConnection;': () => null,
    'checkInputConnectionProxy(Landroid/view/View;)Z': () => false,
    'createContextMenu(Landroid/view/ContextMenu;)V': () => undefined,
    'getContextMenuInfo()Landroid/view/ContextMenu$ContextMenuInfo;': () => null,
    'onCreateContextMenu(Landroid/view/ContextMenu;)V': () => undefined,
    'onTrackballEvent(Landroid/view/MotionEvent;)Z': () => false,
    'onGenericMotionEvent(Landroid/view/MotionEvent;)Z': () => false,
    'onHoverEvent(Landroid/view/MotionEvent;)Z': () => true,
    'isHovered()Z': (self) => !!self.view?.hovered,
    'setHovered(Z)V': (self, [hovered]) => { if (self.view) self.view.hovered = !!hovered; },
    'onHoverChanged(Z)V': () => undefined,
    'setTouchDelegate(Landroid/view/TouchDelegate;)V': (self, [delegate]) => { self.touchDelegate = delegate ?? null; },
    'getTouchDelegate()Landroid/view/TouchDelegate;': (self) => self?.touchDelegate ?? null,
    'requestUnbufferedDispatch(Landroid/view/MotionEvent;)V': () => undefined,
    'requestUnbufferedDispatch(I)V': () => undefined,
    'onScrollChanged(IIII)V': (self) => self.view?.invalidate?.(),
    'onSizeChanged(IIII)V': () => undefined,
    'dispatchDraw(Landroid/graphics/Canvas;)V': (self, [canvas]) =>
      self.view?.dispatchDraw?.(canvas?.$peer?.canvas || canvas),
    'isPivotSet()Z': (self) => !!self.view?.pivotSet,
    'resetPivot()V': (self) => { if (self.view) self.view.pivotSet = false; },
    'forceHasOverlappingRendering(Z)V': (self, [value]) => { self.forceOverlappingRendering = !!value; },
    'getHasOverlappingRendering()Z': (self) => self?.forceOverlappingRendering !== false,
    'hasOverlappingRendering()Z': () => true,
    'setTransitionAlpha(F)V': (self, [alpha]) => {
      self.transitionAlpha = Number(alpha);
      if (self.view) self.view.transitionAlpha = Number(alpha);
    },
    'getTransitionAlpha()F': (self) => self?.transitionAlpha ?? 1,
    'setForceDarkAllowed(Z)V': (self, [value]) => { self.forceDarkAllowed = !!value; },
    'isForceDarkAllowed()Z': (self) => self?.forceDarkAllowed !== false,
    'setTop(I)V': (self, [top]) => { if (self.view) self.view.top = top | 0; },
    'isDirty()Z': (self) => !!self.view?.isDirty,
    'setBottom(I)V': (self, [bottom]) => { if (self.view) self.view.bottom = bottom | 0; },
    'setLeft(I)V': (self, [left]) => { if (self.view) self.view.left = left | 0; },
    'setRight(I)V': (self, [right]) => { if (self.view) self.view.right = right | 0; },
    'setAnimationMatrix(Landroid/graphics/Matrix;)V': (self, [matrix]) => { self.animationMatrix = matrix ?? null; },
    'getAnimationMatrix()Landroid/graphics/Matrix;': (self) => self?.animationMatrix ?? null,
    'getStateListAnimator()Landroid/animation/StateListAnimator;': (self) => self?.stateListAnimator ?? null,
    'setStateListAnimator(Landroid/animation/StateListAnimator;)V': (self, [animator]) => { self.stateListAnimator = animator ?? null; },
    'setOutlineSpotShadowColor(I)V': (self, [color]) => { self.outlineSpotShadowColor = color >>> 0; },
    'getOutlineSpotShadowColor()I': (self) => self?.outlineSpotShadowColor ?? 0xff000000,
    'setOutlineAmbientShadowColor(I)V': (self, [color]) => { self.outlineAmbientShadowColor = color >>> 0; },
    'getOutlineAmbientShadowColor()I': (self) => self?.outlineAmbientShadowColor ?? 0xff000000,
    'getFocusedRect(Landroid/graphics/Rect;)V': (self, [rect]) => {
      const target = rect?.$peer?.rect || rect;
      const view = self.view;
      if (!target || !view) return;
      target.set?.(0, 0, view.width | 0, view.height | 0);
      if (typeof target.set !== 'function') {
        target.left = 0; target.top = 0; target.right = view.width | 0; target.bottom = view.height | 0;
      }
    },
    'getGlobalVisibleRect(Landroid/graphics/Rect;)Z': (self, [rect]) => {
      const view = self.view;
      if (!view) return false;
      const point = view.getLocationInWindow?.() ?? { x: view.left || 0, y: view.top || 0 };
      const target = rect?.$peer?.rect || rect;
      const width = view.width | 0;
      const height = view.height | 0;
      if (target && typeof target.set === 'function') target.set(point.x | 0, point.y | 0, (point.x + width) | 0, (point.y + height) | 0);
      else if (target) {
        target.left = point.x | 0; target.top = point.y | 0;
        target.right = (point.x + width) | 0; target.bottom = (point.y + height) | 0;
      }
      return true;
    },
    'invalidate(Landroid/graphics/Rect;)V': (self) => self.view?.invalidate?.(),
    'invalidate(IIII)V': (self) => self.view?.invalidate?.(),
    'isOpaque()Z': () => false,
    'getHandler()Landroid/os/Handler;': (self) => self.vm?.handlerObject ?? null,
    'removeCallbacks(Ljava/lang/Runnable;)Z': () => true,
    'postInvalidate(IIII)V': (self) => self.view?.invalidate?.(),
    'postInvalidateDelayed(J)V': (self) => self.view?.invalidate?.(),
    'postInvalidateDelayed(JIIII)V': (self) => self.view?.invalidate?.(),
    'postInvalidateOnAnimation(IIII)V': (self) => self.view?.invalidate?.(),
    'computeScroll()V': (self) => self.view?.computeScroll?.(),
    'isHorizontalFadingEdgeEnabled()Z': (self) => !!self.view?.horizontalFadingEdgeEnabled,
    'setHorizontalFadingEdgeEnabled(Z)V': (self, [value]) => {
      if (self.view) self.view.horizontalFadingEdgeEnabled = !!value;
    },
    'isVerticalFadingEdgeEnabled()Z': (self) => !!self.view?.verticalFadingEdgeEnabled,
    'setVerticalFadingEdgeEnabled(Z)V': (self, [value]) => {
      if (self.view) self.view.verticalFadingEdgeEnabled = !!value;
    },
    'getTopFadingEdgeStrength()F': () => 0,
    'getBottomFadingEdgeStrength()F': () => 0,
    'getLeftFadingEdgeStrength()F': () => 0,
    'getRightFadingEdgeStrength()F': () => 0,
    'onDrawScrollBars(Landroid/graphics/Canvas;)V': (self, [canvas]) =>
      self.view?.drawScrollBars?.(canvas?.$peer?.canvas || canvas),
    'onScreenStateChanged(I)V': () => undefined,
    'onRtlPropertiesChanged(I)V': () => undefined,
    'canResolveLayoutDirection()Z': () => true,
    'isLayoutDirectionResolved()Z': () => true,
    'getWindowAttachCount()I': () => 1,
    'getWindowId()Landroid/view/WindowId;': () => null,
    'onCancelPendingInputEvents()V': () => undefined,
    'dispatchSaveInstanceState(Landroid/util/SparseArray;)V': () => undefined,
    'onSaveInstanceState()Landroid/os/Parcelable;': () => null,
    'dispatchRestoreInstanceState(Landroid/util/SparseArray;)V': () => undefined,
    'onRestoreInstanceState(Landroid/os/Parcelable;)V': () => undefined,
    'getDrawingTime()J': (self) => self.vm?.engine?.lastFrameTime ?? 0,
    'setDuplicateParentStateEnabled(Z)V': (self, [value]) => { self.duplicateParentState = !!value; },
    'isDuplicateParentStateEnabled()Z': (self) => !!self?.duplicateParentState,
    'setRenderEffect(Landroid/graphics/RenderEffect;)V': (self, [effect]) => { self.renderEffect = effect ?? null; },
    'setLayerPaint(Landroid/graphics/Paint;)V': (self, [paint]) => { self.layerPaint = paint ?? null; },
    'buildLayer()V': () => undefined,
    'setDrawingCacheEnabled(Z)V': (self, [value]) => { self.drawingCacheEnabled = !!value; },
    'isDrawingCacheEnabled()Z': (self) => !!self?.drawingCacheEnabled,
    'getDrawingCache()Landroid/graphics/Bitmap;': () => null,
    'getDrawingCache(Z)Landroid/graphics/Bitmap;': () => null,
    'destroyDrawingCache()V': () => undefined,
    'setDrawingCacheBackgroundColor(I)V': (self, [color]) => { self.drawingCacheBackgroundColor = color >>> 0; },
    'getDrawingCacheBackgroundColor()I': (self) => self?.drawingCacheBackgroundColor ?? 0,
    'buildDrawingCache()V': () => undefined,
    'buildDrawingCache(Z)V': () => undefined,
    'isPaddingOffsetRequired()Z': () => false,
    'getLeftPaddingOffset()I': () => 0,
    'getRightPaddingOffset()I': () => 0,
    'getTopPaddingOffset()I': () => 0,
    'getBottomPaddingOffset()I': () => 0,
    'setClipBounds(Landroid/graphics/Rect;)V': (self, [bounds]) => {
      if (self.view) self.view.clipBounds = bounds ?? null;
    },
    'getClipBounds()Landroid/graphics/Rect;': (self) => self.view?.clipBounds ?? null,
    'getClipBounds(Landroid/graphics/Rect;)Z': (self, [out]) => {
      const bounds = self.view?.clipBounds;
      if (!bounds) return false;
      const target = out?.$peer?.rect || out;
      if (!target) return false;
      const left = bounds.left ?? 0;
      const top = bounds.top ?? 0;
      const right = bounds.right ?? 0;
      const bottom = bounds.bottom ?? 0;
      if (typeof target.set === 'function') target.set(left, top, right, bottom);
      else Object.assign(target, { left, top, right, bottom });
      return true;
    },
    'getOverlay()Landroid/view/ViewOverlay;': () => null,
    'setLeftTopRightBottom(IIII)V': (self, [left, top, right, bottom]) => {
      const view = self.view;
      if (!view) return;
      view.left = left | 0;
      view.top = top | 0;
      view.right = right | 0;
      view.bottom = bottom | 0;
    },
    'onFinishInflate()V': () => undefined,
    'invalidateDrawable(Landroid/graphics/drawable/Drawable;)V': (self) => self.view?.invalidate?.(),
    'scheduleDrawable(Landroid/graphics/drawable/Drawable;Ljava/lang/Runnable;J)V': () => undefined,
    'unscheduleDrawable(Landroid/graphics/drawable/Drawable;Ljava/lang/Runnable;)V': () => undefined,
    'unscheduleDrawable(Landroid/graphics/drawable/Drawable;)V': () => undefined,
    'verifyDrawable(Landroid/graphics/drawable/Drawable;)Z': (self, [drawable]) => {
      const view = self.view;
      if (!view) return false;
      return drawable === view.background || drawable === view.foreground;
    },
    'drawableHotspotChanged(FF)V': (self, [x, y]) => {
      if (self.view) self.view.drawableHotspot = { x: Number(x), y: Number(y) };
    },
    'dispatchDrawableHotspotChanged(FF)V': (self, [x, y]) => {
      if (self.view) self.view.drawableHotspot = { x: Number(x), y: Number(y) };
    },
    'onCreateDrawableState(I)[I': (self, [extraSpace], vm) => {
      const base = self.view?.getDrawableState?.() ?? [];
      const array = vm.newArray('[I', base.length + (extraSpace | 0), null);
      const target = array?.$data;
      if (Array.isArray(target)) {
        for (let i = 0; i < base.length; i++) target[i] = base[i] | 0;
      }
      return array;
    },
    'setBackgroundTintBlendMode(Landroid/graphics/BlendMode;)V': (self, [mode]) => { self.backgroundTintBlendMode = mode ?? null; },
    'getBackgroundTintBlendMode()Landroid/graphics/BlendMode;': (self) => self?.backgroundTintBlendMode ?? null,
    'getForegroundGravity()I': (self) => self.view?.foregroundGravity ?? 0x800033,
    'setForegroundTintBlendMode(Landroid/graphics/BlendMode;)V': (self, [mode]) => { self.foregroundTintBlendMode = mode ?? null; },
    'getForegroundTintBlendMode()Landroid/graphics/BlendMode;': (self) => self?.foregroundTintBlendMode ?? null,
    'onDrawForeground(Landroid/graphics/Canvas;)V': (self, [canvas]) =>
      self.view?.drawForeground?.(canvas?.$peer?.canvas || canvas),
    'getSourceLayoutResId()I': (self) => self.view?.sourceLayoutResId | 0,
    'dispatchSetSelected(Z)V': (self, [selected]) => { self.view?.setSelected?.(!!selected); },
    'dispatchSetActivated(Z)V': (self, [activated]) => { self.view?.setActivated?.(!!activated); },
    'transformMatrixToGlobal(Landroid/graphics/Matrix;)V': () => undefined,
    'transformMatrixToLocal(Landroid/graphics/Matrix;)V': () => undefined,
    'requireViewById(I)Landroid/view/View;': (self, [id], vm) => {
      const view = self.view?.findViewById?.(id >>> 0);
      return view ? viewObject(vm, view) : null;
    },
    'getUniqueDrawingId()J': (self) => {
      const view = self.view;
      if (!view) return 0;
      if (view.uniqueDrawingId === undefined) view.uniqueDrawingId = ++VIEW_DRAWING_ID_COUNTER;
      return view.uniqueDrawingId;
    },
    'isInLayout()Z': () => false,
  };
}

let VIEW_DRAWING_ID_COUNTER = 0;

let VIEW_ID_COUNTER = 0x7f100000;

function getFragmentManagerObject(vm) {
  if (!vm) return null;
  if (vm.fragmentManagerObject) return vm.fragmentManagerObject;
  const manager = vm.allocateRawObject('Landroid/app/FragmentManager;');
  const fragments = new Map();
  const pending = [];
  manager.$peer = {
    vm,
    fragments,
    pending,
    findFragmentByTag: (tag) => {
      const key = jsString(tag);
      return fragments.get(key) || null;
    },
    findFragmentById: (id) => {
      for (const value of fragments.values()) if (value?.$fragmentId === (id >>> 0)) return value;
      return null;
    },
    beginTransaction: () => makeFragmentTransaction(vm, manager, fragments, pending),
    executePendingTransactions: () => {
      for (const op of pending.splice(0)) op();
      return true;
    },
    isDestroyed: () => false,
    getFragments: () => [...fragments.values()],
  };
  vm.fragmentManagerObject = manager;
  return manager;
}

function makeFragmentTransaction(vm, manager, fragments, pending) {
  const object = vm.allocateRawObject('Landroid/app/FragmentTransaction;');
  const ops = [];
  const self = {
    add: (containerId, fragment, tag) => {
      ops.push(() => {
        const key = jsString(tag) || `fragment-${fragments.size}`;
        if (fragment) {
          fragment.$fragmentId = containerId >>> 0;
          const peer = fragment.$peer || (fragment.$peer = {});
          peer.$id = containerId >>> 0;
          peer.$tag = jsString(tag) || key;
          peer.$added = true;
        }
        fragments.set(key, fragment);
      });
      return object;
    },
    replace: (containerId, fragment, tag) => self.add(containerId, fragment, tag),
    remove: (fragment) => {
      ops.push(() => {
        for (const [key, value] of fragments) if (value === fragment) fragments.delete(key);
      });
      return object;
    },
    hide: () => object,
    show: () => object,
    addToBackStack: () => object,
    setTransition: () => object,
    setCustomAnimations: () => object,
    setReorderingAllowed: () => object,
    commit: () => {
      pending.push(() => {
        for (const op of ops.splice(0)) op();
      });
      return 0;
    },
    commitAllowingStateLoss: () => self.commit(),
    commitNow: () => {
      for (const op of ops.splice(0)) op();
      return undefined;
    },
    isEmpty: () => ops.length === 0,
  };
  object.$peer = self;
  return object;
}

function layoutInflaterObject(vm) {
  const object = vm.allocateRawObject('Landroid/view/LayoutInflater;');
  object.$peer = { vm, context: vm.contextObject, resources: vm.resources };
  return object;
}

/** 对应 Fragment.instantiate：按类名实例化并注入 context / arguments。 */
function instantiateFragment(vm, context, name, args) {
  const className = jsString(name);
  if (!className || className === 'null') return null;
  const descriptor = `L${className.replace(/\./g, '/')};`;
  const object = vm.instantiate(descriptor, []);
  if (!object) return null;
  const peer = object.$peer || (object.$peer = {});
  peer.$vm = vm;
  peer.$context = context ?? vm.contextObject ?? null;
  if (args) peer.$arguments = args;
  return object;
}

function ensureTypedValue(self, fieldName, vm) {
  const object = self.object;
  if (!object) return null;
  const key = `${object.$nativeClass}->${fieldName}:Landroid/util/TypedValue;`;
  let value = object.$fields?.get(key);
  if (!value) {
    value = (vm || self.vm).allocateRawObject('Landroid/util/TypedValue;');
    value.$peer = { type: 0, data: 0, assetCookie: 0, string: null, resourceId: 0, density: 0 };
    object.$fields?.set(key, value);
  }
  return value;
}

const VIEW_PROPERTY_ANIMATOR_METHODS = [
  'setDuration', 'setStartDelay', 'setInterpolator', 'setListener', 'setUpdateListener',
  'withStartAction', 'withEndAction', 'start', 'cancel',
  'alpha', 'alphaBy', 'translationX', 'translationXBy', 'translationY', 'translationYBy',
  'translationZ', 'translationZBy', 'scaleX', 'scaleXBy', 'scaleY', 'scaleYBy',
  'rotation', 'rotationBy', 'rotationX', 'rotationXBy', 'rotationY', 'rotationYBy',
  'x', 'xBy', 'y', 'yBy', 'z', 'zBy',
];

function viewPropertyAnimatorMethods() {
  const methods = {};
  for (const name of VIEW_PROPERTY_ANIMATOR_METHODS) {
    methods[`${name}(*)`] = (self, args) => {
      const fn = self?.[name];
      if (typeof fn !== 'function') return self;
      const result = fn(...args);
      return result === undefined ? self : result;
    };
  }
  return methods;
}

function bridgeAnimatorListener(vm, listener) {
  if (!listener) return null;
  if (typeof listener === 'function') return listener;
  if (typeof listener.onAnimationEnd === 'function') return listener;
  const call = (name) => {
    try {
      vm.invokeByName(name, '()V', listener, []);
    } catch {}
  };
  return {
    onAnimationStart: () => call('onAnimationStart'),
    onAnimationEnd: () => call('onAnimationEnd'),
    onAnimationCancel: () => call('onAnimationCancel'),
    onAnimationRepeat: () => call('onAnimationRepeat'),
  };
}

function makeViewPropertyAnimator(vm, view) {
  const object = vm.allocateRawObject('Landroid/view/ViewPropertyAnimator;');
  const animator = view.animate();
  if (!animator) return null;
  object.$peer = {
    animator,
    setDuration: (d) => { animator.setDuration(d); return object; },
    setStartDelay: (d) => { animator.setStartDelay(d); return object; },
    setInterpolator: () => object,
    setListener: (listener) => { animator.setListener?.(bridgeAnimatorListener(vm, listener)); return object; },
    setUpdateListener: () => object,
    withStartAction: (action) => { animator.withStartAction?.(() => vm.runRunnable(action)); return object; },
    withEndAction: (action) => { animator.withEndAction(() => vm.runRunnable(action)); return object; },
    start: () => { animator.start(); return object; },
    cancel: () => { animator.cancel?.(); return object; },
    alpha: (v) => { animator.alpha?.(v); return object; },
    alphaBy: () => object,
    translationX: (v) => { animator.translationX?.(v); return object; },
    translationXBy: () => object,
    translationY: (v) => { animator.translationY?.(v); return object; },
    translationYBy: () => object,
    translationZ: () => object,
    translationZBy: () => object,
    scaleX: (v) => { animator.scaleX?.(v); return object; },
    scaleXBy: () => object,
    scaleY: (v) => { animator.scaleY?.(v); return object; },
    scaleYBy: () => object,
    rotation: () => object,
    rotationBy: () => object,
    rotationX: () => object,
    rotationXBy: () => object,
    rotationY: () => object,
    rotationYBy: () => object,
    x: () => object,
    xBy: () => object,
    y: () => object,
    yBy: () => object,
    z: () => object,
    zBy: () => object,
  };
  return object;
}

function findFocusedView(view) {
  if (!view) return null;
  if (view.isFocused && view.isFocused()) return view;
  const children = view.children || [];
  for (const child of children) {
    const found = findFocusedView(child);
    if (found) return found;
  }
  if (!children.length && typeof view.getChildCount === 'function') {
    const count = view.getChildCount() | 0;
    for (let i = 0; i < count; i += 1) {
      const found = findFocusedView(view.getChildAt(i));
      if (found) return found;
    }
  }
  return null;
}

function findView(view, id) {
  if (!view) return null;
  if (view.id === id) return view;
  let children = view.children || [];
  if (!children.length && typeof view.getChildCount === 'function' && typeof view.getChildAt === 'function') {
    const count = view.getChildCount() | 0;
    children = [];
    for (let i = 0; i < count; i += 1) {
      const child = view.getChildAt(i);
      if (child) children.push(child);
    }
  }
  for (const child of children) {
    const found = findView(child, id);
    if (found) return found;
  }
  return null;
}

const DEFAULT_THEME_ATTRIBUTES = {
  windowActionBar: false,
  windowNoTitle: true,
  windowActionBarOverlay: false,
  windowActionModeOverlay: true,
  windowIsFloating: false,
  windowFixedWidthMajor: null,
  windowFixedWidthMinor: null,
  windowFixedHeightMajor: null,
  windowFixedHeightMinor: null,
  actionBarSize: 56,
  actionBarStyle: 0,
  background: 0,
  colorPrimary: 0xff3f51b5 >>> 0,
  colorPrimaryDark: 0xff303f9f >>> 0,
  colorAccent: 0xffff4081 >>> 0,
  colorSecondary: 0xffff4081 >>> 0,
  colorOnPrimary: 0xffffffff >>> 0,
  colorOnSecondary: 0xffffffff >>> 0,
  colorSurface: 0xffffffff >>> 0,
  colorOnSurface: 0xff000000 >>> 0,
  colorBackground: 0xffffffff >>> 0,
  colorOnBackground: 0xff000000 >>> 0,
  colorError: 0xffb00020 >>> 0,
  colorOnError: 0xffffffff >>> 0,
  colorOutline: 0xff79747e >>> 0,
  colorControlNormal: 0x8a000000 >>> 0,
  colorControlActivated: 0xff3f51b5 >>> 0,
  colorControlHighlight: 0x1f000000 >>> 0,
  textColorPrimary: 0xde000000 >>> 0,
  textColorSecondary: 0x8a000000 >>> 0,
  textColorTertiary: 0x61000000 >>> 0,
  textColorPrimaryInverse: 0xffffffff >>> 0,
  textColorSecondaryInverse: 0xb3ffffff >>> 0,
  colorPrimaryVariant: 0xff303f9f >>> 0,
  colorSecondaryVariant: 0xffc51162 >>> 0,
  colorSurfaceVariant: 0xffe7e0ec >>> 0,
  colorOnSurfaceVariant: 0x8a000000 >>> 0,
  windowBackground: 0xffffffff >>> 0,
  statusBarColor: 0x00000000 >>> 0,
  navigationBarColor: 0xff000000 >>> 0,
};

function multiplyMatrices(a, b) {
  const [a0, a1, a2, a3, a4, a5] = a;
  const [b0, b1, b2, b3, b4, b5] = b;
  return [
    a0 * b0 + a2 * b1,
    a1 * b0 + a3 * b1,
    a0 * b2 + a2 * b3,
    a1 * b2 + a3 * b3,
    a0 * b4 + a2 * b5 + a4,
    a1 * b4 + a3 * b5 + a5,
  ];
}

function mapPoint(matrix, x, y) {
  const [a, b, c, d, e, f] = matrix || [1, 0, 0, 1, 0, 0];
  return [a * x + c * y + e, b * x + d * y + f];
}

function applyProgrammaticViewStyle(vm, self, defStyleAttr) {
  const view = self?.view;
  if (!view || !defStyleAttr || !vm?.resources) return;
  const ids = [
    ATTR_IDS.minWidth, ATTR_IDS.minHeight, ATTR_IDS.background, ATTR_IDS.scaleType,
    ATTR_IDS.padding, ATTR_IDS.paddingLeft, ATTR_IDS.paddingTop, ATTR_IDS.paddingRight, ATTR_IDS.paddingBottom,
    ATTR_IDS.textSize, ATTR_IDS.textColor, ATTR_IDS.textAllCaps, ATTR_IDS.textStyle, ATTR_IDS.gravity,
  ];
  const values = themeAttributeValues(vm, ids, 0, null, defStyleAttr | 0);
  const present = values.__present || new Set();
  const density = vm.resources.density || 1;
  const num = (id) => {
    if (!present.has(id >>> 0)) return null;
    const value = values.get(id >>> 0);
    if (typeof value === 'number') return value;
    if (value?.dimension) return Math.round(convertDimension(value, density));
    if (typeof value === 'string') {
      const resolved = vm.resources.resolve?.(value);
      return typeof resolved === 'number' ? resolved : null;
    }
    return null;
  };
  const minWidth = num(ATTR_IDS.minWidth);
  if (minWidth !== null) view.minWidth = minWidth;
  const minHeight = num(ATTR_IDS.minHeight);
  if (minHeight !== null) view.minHeight = minHeight;
  // 背景交由 DEX/主题链路处理，避免把主题属性误解析成颜色。
  if (present.has(ATTR_IDS.scaleType)) {
    const ordinal = Number(values.get(ATTR_IDS.scaleType)) | 0;
    view.scaleType = ['matrix', 'fitXY', 'fitStart', 'fitCenter', 'fitEnd', 'center', 'centerCrop', 'centerInside'][ordinal] || 'fitCenter';
  }
  const padding = num(ATTR_IDS.padding);
  if (padding !== null) view.setPadding?.(padding, padding, padding, padding);
  const paddings = [ATTR_IDS.paddingLeft, ATTR_IDS.paddingTop, ATTR_IDS.paddingRight, ATTR_IDS.paddingBottom].map((id) => num(id));
  if (paddings.some((value) => value !== null)) {
    view.paddingLeft = paddings[0] ?? view.paddingLeft;
    view.paddingTop = paddings[1] ?? view.paddingTop;
    view.paddingRight = paddings[2] ?? view.paddingRight;
    view.paddingBottom = paddings[3] ?? view.paddingBottom;
  }
  const textSize = num(ATTR_IDS.textSize);
  if (textSize !== null && typeof view.setTextSize === 'function') view.setTextSize(textSize);
  if (present.has(ATTR_IDS.textColor) && typeof view.setTextColor === 'function') {
    const raw = values.get(ATTR_IDS.textColor);
    if (typeof raw === 'number') view.setTextColor(raw >>> 0);
    else if (typeof raw === 'string') {
      const resId = vm.resources.resolve?.(raw);
      if (typeof resId === 'number') view.setTextColor(resId >>> 0);
    }
  }
  if (present.has(ATTR_IDS.textAllCaps) && typeof view.setTextAllCaps === 'function') view.setTextAllCaps(!!values.get(ATTR_IDS.textAllCaps));
  const gravity = num(ATTR_IDS.gravity);
  if (gravity !== null) view.gravity = gravity;
}

function themeStore(vm) {
  if (!vm) return DEFAULT_THEME_ATTRIBUTES;
  if (!vm.themeAttributes) {
    const density = vm.resources?.displayMetrics?.density || 1;
    const night = vm.nightMode !== null && vm.nightMode !== undefined
      ? !!vm.nightMode
      : (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    const colors = night ? {
      colorSurface: 0xff121212 >>> 0,
      colorOnSurface: 0xffffffff >>> 0,
      colorBackground: 0xff121212 >>> 0,
      colorOnBackground: 0xffffffff >>> 0,
      colorSurfaceVariant: 0xff49454f >>> 0,
      colorOnSurfaceVariant: 0xffcac4d0 >>> 0,
      textColorPrimary: 0xffffffff >>> 0,
      textColorSecondary: 0xb3ffffff >>> 0,
      textColorTertiary: 0x80ffffff >>> 0,
      windowBackground: 0xff121212 >>> 0,
      isLightTheme: false,
    } : { isLightTheme: true };
    vm.themeAttributes = { ...DEFAULT_THEME_ATTRIBUTES, ...colors, actionBarSize: Math.round(56 * density) };
  }
  return vm.themeAttributes;
}

const FRAMEWORK_ATTR_KEYS = new Map([
  [0x01010036, 'textColorPrimary'],
  [0x01010037, 'textColorSecondary'],
  [0x01010038, 'textColorTertiary'],
  [0x01010039, 'textColorPrimaryInverse'],
  [0x0101003a, 'textColorSecondaryInverse'],
  [0x01010099, 'textColorHighlight'],
  [0x0101009a, 'textColorHint'],
  [0x0101009b, 'textColorLink'],
  [0x01010095, 'textSize'],
  [0x01010098, 'textColor'],
  // 窗口类属性：系统包的 attr 条目不在 APK 的 resources.arsc 里，
  // 主题样式引用 0x0101xxxx 时只能靠这张内置表还原语义名。
  [0x01010054, 'windowBackground'],
  [0x01010055, 'windowActionBar'],
  [0x01010056, 'windowNoTitle'],
  [0x0101005a, 'windowIsFloating'],
  [0x0101020d, 'windowMinWidthMajor'],
  [0x0101020e, 'windowMinWidthMinor'],
]);

function resolveStyleColor(vm, raw) {
  const table = vm?.resources?.table;
  if (!table || raw === undefined || raw === null) return null;
  let ref = null;
  if (typeof raw === 'number') ref = raw >>> 0;
  else if (typeof raw === 'object' && 'reference' in raw) ref = raw.reference >>> 0;
  if (!ref) return null;
  if (ref >= 0x01010000 && ref < 0x02000000) {
    const key = FRAMEWORK_ATTR_KEYS.get(ref);
    if (!key) return null;
    const store = themeStore(vm);
    const refId = store.$attrReferences?.[key];
    if (refId) {
      const list = vm.resources.getColorStateList?.(refId >>> 0);
      if (list && typeof list.color === 'number') return list.color >>> 0;
    }
    const value = store[key];
    if (typeof value === 'number') return value >>> 0;
    return null;
  }
  const list = vm.resources.getColorStateList?.(ref);
  if (list && typeof list.color === 'number') return list.color >>> 0;
  const resolved = table.resolve(ref);
  if (typeof resolved === 'number') return resolved >>> 0;
  return null;
}

function applyTextAppearance(self, styleId) {
  const vm = self?.vm || self?.$vm;
  const view = self?.view;
  const table = vm?.resources?.table;
  if (!vm || !view || !table || !styleId) return;
  let attrs;
  try {
    attrs = table.getStyleAttributes(styleId >>> 0);
  } catch (_) {
    return;
  }
  if (!attrs || !attrs.size) return;
  const sizeRaw = attrs.get(0x01010095);
  if (sizeRaw !== undefined && typeof view.setTextSize === 'function') {
    let value = sizeRaw;
    if (value && typeof value === 'object' && 'reference' in value) {
      value = table.resolve(value.reference) ?? value.reference;
    }
    if (value && typeof value === 'object' && value.dimension) {
      view.setTextSize(convertDimension(value, vm.resources.density || 1));
    } else if (typeof value === 'number') {
      view.setTextSize(value);
    }
  }
  const color = resolveStyleColor(vm, attrs.get(0x01010098));
  if (typeof color === 'number' && typeof view.setTextColor === 'function') {
    view.setTextColor(color >>> 0);
  }
  const style = attrs.get(0x01010097);
  if (style !== undefined && typeof view === 'object') {
    view.textStyle = Number(style) | 0;
    view.layoutDirty = true;
  }
  const allCaps = attrs.get(0x010103df);
  if (allCaps !== undefined && typeof view.setTextAllCaps === 'function') {
    view.setTextAllCaps(!!allCaps);
  }
  const family = attrs.get(0x010103ac);
  if (family !== undefined && typeof family === 'string') {
    view.typeface = family;
    view.layoutDirty = true;
  }
}

export function loadThemeFromStyleId(vm, styleId) {
  const table = vm?.resources?.table;
  if (!table || typeof styleId !== 'number') return false;
  const store = themeStore(vm);
  store.$styleId = styleId;
  let changed = false;
  const seen = new Set();
  const apply = (id) => {
    id = id >>> 0;
    if (seen.has(id)) return;
    seen.add(id);
    const entry = table.getEntry(id);
    if (!entry) return;
    const bag = entry.bag;
    const parent = bag && typeof bag.parent === 'number' ? bag.parent >>> 0 : 0;
    if (parent) apply(parent);
    const attributes = table.getStyleAttributes(id);
    if (!attributes || !attributes.size) return;
    changed = true;
    for (const [attrId, rawValue] of attributes) {
      const attrEntry = table.getEntry(attrId);
      const key = attrEntry?.key || FRAMEWORK_ATTR_KEYS.get(attrId >>> 0);
      if (!key) continue;
      let value = rawValue;
      if (value && typeof value === 'object' && 'reference' in value) {
        store.$attrReferences ||= {};
        store.$attrReferences[key] = value.reference >>> 0;
        const resolved = table.resolve(value.reference);
        value = resolved === null || resolved === undefined ? value.reference : resolved;
      }
      if (key === 'actionBarSize' && typeof value === 'number' && value > 4096) {
        const resolved = table.resolve(value);
        if (typeof resolved === 'number') value = Math.round(resolved / (vm.displayMetrics?.density || 1));
        else value = DEFAULT_THEME_ATTRIBUTES.actionBarSize;
      }
      store[key] = value;
    }
  };
  apply(styleId);
  if (store.colorSurface === undefined) {
    store.colorSurface = typeof store.colorBackground === 'number' ? store.colorBackground : 0xffffffff;
  }
  if (store.colorOnSurface === undefined) {
    store.colorOnSurface = typeof store.textColorPrimary === 'number' ? store.textColorPrimary : 0xff000000;
  }
  if (store.colorOnBackground === undefined) store.colorOnBackground = store.colorOnSurface;
  if (store.colorOnPrimary === undefined) store.colorOnPrimary = 0xffffffff;
  if (store.colorOnSecondary === undefined) store.colorOnSecondary = 0xffffffff;
  return changed;
}

function resolveThemeStyleId(vm, defStyleAttr) {
  const table = vm?.resources?.table || null;
  if (!table) return 0;
  const attrId = (defStyleAttr >>> 0) & 0xffffffff;
  const key = table.getEntry(attrId)?.key;
  if (!key) return 0;
  const store = themeStore(vm);
  // 优先用加载主题时记下的原始引用 id：样式属性的值常被解析成 bag
  // （{parent, items}），直接读 value.parent 会拿到父样式而不是它自己。
  const reference = store.$attrReferences?.[key];
  if (typeof reference === 'number') return reference >>> 0;
  const value = store[key];
  if (typeof value === 'number') return value >>> 0;
  if (value && typeof value === 'object') {
    if (typeof value.reference === 'number') return value.reference >>> 0;
    if (typeof value.parent === 'number') return value.parent >>> 0;
  }
  return 0;
}

const FRAMEWORK_COLOR_ATTR_KEYS = new Map([
  [0x01010054, 'windowBackground'],
]);

function frameworkColorAttrKey(id) {
  const value = id >>> 0;
  return value >= 0x01000000 && value < 0x02000000 ? FRAMEWORK_COLOR_ATTR_KEYS.get(value) || null : null;
}

const BACKGROUND_COLOR_KEYS = new Set([
  'windowBackground', 'colorBackground', 'background', 'colorSurface', 'colorSurfaceVariant',
]);
const TEXT_COLOR_KEYS = new Set([
  'textColor', 'textColorPrimary', 'textColorSecondary', 'textColorTertiary',
  'textColorHint', 'textColorLink', 'textColorHighlight',
  'textColorPrimaryInverse', 'textColorSecondaryInverse',
]);

function resolveThemeColorForKey(vm, key) {
  if (!key) return undefined;
  const store = themeStore(vm);
  if (Object.prototype.hasOwnProperty.call(store, key)) {
    const value = store[key];
    if (typeof value === 'number') return value >>> 0;
    if (value && typeof value === 'object' && typeof value.reference === 'number') {
      const resolved = vm.resources?.resolve?.(value.reference >>> 0);
      if (typeof resolved === 'number') return resolved >>> 0;
    }
  }
  const refId = store.$attrReferences?.[key];
  if (typeof refId === 'number') {
    const resolved = vm.resources?.resolve?.(refId >>> 0);
    if (typeof resolved === 'number') return resolved >>> 0;
  }
  if (BACKGROUND_COLOR_KEYS.has(key)) {
    const fallback = store.colorBackground ?? store.colorSurface ?? 0xffffffff;
    if (typeof fallback === 'number') return fallback >>> 0;
  }
  if (TEXT_COLOR_KEYS.has(key)) {
    const fallback = store.textColorPrimary ?? 0xff000000;
    if (typeof fallback === 'number') return fallback >>> 0;
  }
  return undefined;
}

function themedStyledValue(vm, raw) {
  let id = 0;
  if (typeof raw === 'number') id = raw >>> 0;
  else if (raw && typeof raw === 'object' && typeof raw.reference === 'number') id = raw.reference >>> 0;
  if (!id) return raw;
  const table = vm.resources?.table;
  const entry = table?.getEntry?.(id);
  // 系统资源（0x01xxxxxx）不在 APK 的 arsc 里，getEntry 查不到，
  // 但 resources.resolve 有内置映射。少了这一步，引用会被原样当成颜色值，
  // 最终渲染成洋红一类的错色。
  if (!entry && (id >>> 24) === 0x01) {
    const resolved = vm.resources?.resolve?.(id);
    if (typeof resolved === 'number') return resolved >>> 0;
    return raw;
  }
  if (entry && entry.typeName !== 'attr') return raw;
  const key = entry?.key || frameworkColorAttrKey(id);
  if (!key) return raw;
  const resolved = resolveThemeColorForKey(vm, key);
  if (resolved !== undefined) return resolved;
  return raw;
}

function themeAttributeValues(vm, attrIds, styleId, attributeSet = null, defStyleAttr = 0) {
  const store = themeStore(vm);
  const table = vm.resources?.table || null;
  const result = new Map();
  const styleAttributes = styleId ? table?.getStyleAttributes?.((styleId >>> 0) & 0xffffffff) : null;
  const ids = Array.isArray(attrIds) ? attrIds : (attrIds?.$data || []);
  const defStyleId = defStyleAttr ? resolveThemeStyleId(vm, defStyleAttr) : 0;
  const defStyleAttributes = defStyleId ? table?.getStyleAttributes?.(defStyleId) : null;
  const present = new Set();
  for (const attrId of ids) {
    const id = attrId >>> 0;
    const nodeValue = attributeValueFor(attributeSet, attrId, table);
    if (nodeValue !== undefined && nodeValue !== null) {
      result.set(id, nodeValue);
      present.add(id);
      continue;
    }
    // 优先级与 AOSP 一致：defStyleAttr（控件自己的 style 属性）高于
    // defStyleRes。之前两者颠倒，控件会读到 defStyleRes 里 boxBackgroundMode=0
    // （none），背景因此永远不创建。
    if (defStyleAttributes && defStyleAttributes.has(id)) {
      const raw = themedStyledValue(vm, defStyleAttributes.get(id));
      result.set(id, typeof raw === 'string' ? table.resolve?.(raw) ?? raw : raw);
      present.add(id);
      continue;
    }
    if (styleAttributes && styleAttributes.has(id)) {
      const raw = themedStyledValue(vm, styleAttributes.get(id));
      result.set(id, typeof raw === 'string' ? table.resolve?.(raw) ?? raw : raw);
      present.add(id);
      continue;
    }
    const entry = table ? table.getEntry(id) : null;
    const key = entry?.key;
    const styleAttrId = styleAttributes ? lookupStyleAttributeId(table, styleAttributes, key) : 0;
    const defStyleAttrId = !styleAttrId && defStyleAttributes ? lookupStyleAttributeId(table, defStyleAttributes, key) : 0;
    if (styleAttrId || defStyleAttrId) {
      const source = styleAttrId ? styleAttributes : defStyleAttributes;
      const raw = source.get(styleAttrId || defStyleAttrId);
      result.set(id, typeof raw === 'string' ? table.resolve?.(raw) ?? raw : raw);
      present.add(id);
    } else if (key && !Object.prototype.hasOwnProperty.call(store, key)
      && referencedStyleValue(table, store, key) !== undefined) {
      // 主题没有直接声明，但被引用的样式里有：取值同 themedStyledValue。
      const raw = themedStyledValue(vm, referencedStyleValue(table, store, key));
      result.set(id, typeof raw === 'string' ? table.resolve?.(raw) ?? raw : raw);
      present.add(id);
    } else if (key && Object.prototype.hasOwnProperty.call(store, key)) {
      result.set(id, store[key]);
      present.add(id);
    } else if (styleAttributes && styleAttributes.has(id)) {
      // 主题里没有这个 key，但样式本身给了值：原样保留引用，交给
      // TypedArray 的访问器（getColor / getResourceId 等）去解析。
      // 之前这里按 key 名字猜成 0 或一个蓝色，既丢了真实资源，
      // 又让调用方拿到一个凭空捏造的数值。
      result.set(id, styleAttributes.get(id));
      present.add(id);
    } else if (key) {
      const isColorAttr = key.endsWith('Color') || key.startsWith('color');
      result.set(id, isColorAttr ? 0xff2196f3 >>> 0 : 0);
    } else {
      result.set(id, 0);
    }
  }
  Object.defineProperty(result, '__present', { value: present, enumerable: false });
  return result;
}

function lookupStyleAttributeId(table, styleAttributes, key) {
  if (!key || !styleAttributes) return 0;
  for (const attrId of styleAttributes.keys()) {
    const entry = table.getEntry(attrId >>> 0);
    if (entry?.key === key) return attrId >>> 0;
  }
  return 0;
}

/**
 * 控件的属性往往来自被主题引用的样式（例如 textInputStyle 指向的 style），
 * 而不是主题自身声明的属性。loadThemeFromStyleId 会把这类引用记到
 * store.$attrReferences，这里顺着它把引用样式里的属性再查一遍。
 */
function referencedStyleValue(table, store, key) {
  if (!key || !store?.$attrReferences) return undefined;
  const seen = new Set();
  for (const refId of Object.values(store.$attrReferences)) {
    if (typeof refId !== 'number' || seen.has(refId)) continue;
    seen.add(refId);
    const attributes = table?.getStyleAttributes?.(refId >>> 0);
    if (!attributes || !attributes.size) continue;
    const attrId = lookupStyleAttributeId(table, attributes, key);
    if (attrId) return attributes.get(attrId);
  }
  return undefined;
}

function wrapColorDrawable(vm, color) {
  const value = color >>> 0;
  if (!vm?.allocateRawObject) return { color: value, type: 'color' };
  const object = vm.allocateRawObject('Landroid/graphics/drawable/ColorDrawable;');
  const peer = vm.registry?.getPeer
    ? vm.registry.getPeer(object, 'Landroid/graphics/drawable/ColorDrawable;')
    : (object.$peer || null);
  if (peer && typeof peer === 'object') peer.color = value;
  else object.$peer = { color: value };
  object.color = value;
  return object;
}

function makeTypedArrayPeer(vm, values, present = null, attrIds = null) {
  const presentSet = present || values.__present || null;
  // 有原始 attr 数组时按数组下标取 id；没有才回退到 Map 键序。
  const indexAttrId = (index) => (attrIds
    ? (attrIds[index | 0] === undefined ? undefined : (attrIds[index | 0] >>> 0))
    : [...values.keys()][index | 0]);
  const isPresent = (index) => {
    if (!presentSet) return true;
    const attrId = indexAttrId(index);
    return attrId !== undefined && presentSet.has(attrId >>> 0);
  };
  const lookup = (index) => {
    const attrId = indexAttrId(index);
    return attrId === undefined ? undefined : values.get(attrId);
  };
  return {
    values,
    index: 0,
    getIndexCount: () => values.size,
    hasValue: (index) => lookup(index) !== undefined && isPresent(index),
    getValue: (index, out) => {
      const value = lookup(index);
      if (value === undefined) return false;
      if (out && typeof out === 'object') {
        const data = typeof value === 'number' ? value | 0 : 0;
        const resourceId = typeof value === 'number' ? value >>> 0 : 0;
        const type = typeof value === 'string' ? 0x03 : typeof value === 'boolean' ? 0x12 : 0x10;
        if (out.$fields instanceof Map) {
          out.$fields.set('Landroid/util/TypedValue;->type:I', type);
          out.$fields.set('Landroid/util/TypedValue;->data:I', data);
          out.$fields.set('Landroid/util/TypedValue;->resourceId:I', resourceId);
          return true;
        }
        const peer = out.$peer;
        if (peer) {
          peer.type = type;
          peer.data = data;
          peer.resourceId = resourceId;
          return true;
        }
        out.type = type;
        out.data = data;
        out.resourceId = resourceId;
        return true;
      }
      return value;
    },
    getBoolean: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      if (value === true || value === false) return value;
      if (typeof value === 'number') return value !== 0;
      return fallback;
    },
    getInt: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      return typeof value === 'number' ? value | 0 : fallback;
    },
    getInteger: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      return typeof value === 'number' ? value | 0 : fallback;
    },
    getResourceId: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      if (typeof value === 'number') {
        const id = value >>> 0;
        return id >= 0x80000000 ? fallback : id;
      }
      if (value && typeof value === 'object' && value.reference !== undefined) return value.reference >>> 0;
      return fallback;
    },
    getDimension: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      if (typeof value === 'number') return value;
      if (value === undefined) return fallback;
      if (value && typeof value === 'object' && value.reference !== undefined) {
        const dim = vm.resources?.getDimensionPixelSize?.(value.reference >>> 0);
        if (typeof dim === 'number' && Number.isFinite(dim)) return dim;
      }
      return convertDimension(value, vm.resources?.density || 1);
    },
    getDimensionPixelSize: (index, fallback) => {
      const value = makeTypedArrayPeer(vm, values).getDimension(index, fallback);
      return Math.round(Number(value) || 0);
    },
    getDimensionPixelOffset: (index, fallback) => {
      const value = makeTypedArrayPeer(vm, values).getDimension(index, fallback);
      return Math.trunc(Number(value) || 0);
    },
    getColor: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      // 值可能是：颜色整数、指向 color 资源的引用、或指向主题属性的引用
      // （`?attr/colorSurface` 这类）。第三种必须查主题，否则会把 attr id
      // 当成颜色直接返回，渲染出完全不相关的颜色。
      const asColor = (raw) => {
        if (typeof raw !== 'number') return undefined;
        const numeric = raw >>> 0;
        const entry = vm.resources?.table?.getEntry?.(numeric);
        if (entry?.typeName === 'attr') {
          const themed = vm.themeAttributes?.[entry.key];
          if (typeof themed === 'number') return themed >>> 0;
          const refId = vm.themeAttributes?.$attrReferences?.[entry.key];
          if (typeof refId === 'number') {
            const resolvedRef = vm.resources?.resolve?.(refId >>> 0);
            if (typeof resolvedRef === 'number') return resolvedRef >>> 0;
          }
          return undefined;
        }
        // 系统资源（0x01xxxxxx）不在 APK 的 arsc 里，getEntry 查不到，
        // 但 resources.resolve 有内置映射（如 android:color/transparent）。
        if (!entry) {
          const resolvedUnknown = vm.resources?.resolve?.(numeric);
          if (typeof resolvedUnknown === 'number') return resolvedUnknown >>> 0;
          if (typeof resolvedUnknown === 'string' && resolvedUnknown.startsWith('#')) {
            const hex = resolvedUnknown.slice(1);
            if (hex.length === 6) return (0xff000000 | parseInt(hex, 16)) >>> 0;
            if (hex.length === 8) return parseInt(hex, 16) >>> 0;
          }
          if ((numeric >>> 24) === 0x01) return undefined;
        }
        return numeric;
      };
      if (typeof value === 'number') {
        const direct = asColor(value);
        if (direct !== undefined) return direct;
        return fallback;
      }
      if (value && typeof value === 'object' && value.reference !== undefined) {
        const reference = value.reference >>> 0;
        const viaAttr = asColor(reference);
        if (viaAttr !== undefined) return viaAttr;
        const resolved = vm.resources?.resolve?.(reference);
        if (typeof resolved === 'number') return resolved >>> 0;
        if (typeof resolved === 'string' && resolved.startsWith('#')) {
          const hex = resolved.slice(1);
          if (hex.length === 6) return (0xff000000 | parseInt(hex, 16)) >>> 0;
          if (hex.length === 8) return parseInt(hex, 16) >>> 0;
        }
        const key = vm.resources?.table?.getEntry?.(reference)?.key;
        const themed = key ? vm.themeAttributes?.[key] : undefined;
        if (typeof themed === 'number') return themed >>> 0;
      }
      return fallback;
    },
    getDrawable: (index) => {
      if (!isPresent(index)) return null;
      const value = lookup(index);
      let resId = 0;
      if (typeof value === 'number') resId = value >>> 0;
      else if (value && typeof value === 'object' && value.reference !== undefined) resId = value.reference >>> 0;
      if (!resId) return null;
      const table = vm.resources?.table;
      const entry = table?.getEntry?.(resId);
      if (!entry) {
        const frameworkKey = frameworkColorAttrKey(resId);
        if (frameworkKey) {
          const themed = resolveThemeColorForKey(vm, frameworkKey);
          if (themed !== undefined) return wrapColorDrawable(vm, themed);
        }
        return resId >= 0x80000000 ? wrapColorDrawable(vm, resId) : null;
      }
      if (entry.typeName === 'attr') {
        const themed = vm.resources?.resolveThemedAttr?.(resId);
        if (typeof themed === 'number') return wrapColorDrawable(vm, themed);
      }
      const drawable = vm.resources.getDrawable(resId);
      if (drawable && drawable.type === 'color') return wrapColorDrawable(vm, drawable.color);
      return drawableObject(vm, drawable);
    },
    getString: (index) => {
      if (!isPresent(index)) return null;
      const value = lookup(index);
      if (value === undefined || value === null) return null;
      if (value && typeof value === 'object' && value.reference !== undefined) {
        const resolved = vm.resources?.resolve?.(value.reference >>> 0);
        return resolved === undefined || resolved === null ? null : String(resolved);
      }
      return String(value);
    },
    getText: (index) => makeTypedArrayPeer(vm, values).getString(index),
    getLayoutDimension: (index, fallback) => makeTypedArrayPeer(vm, values).getDimensionPixelSize(index, fallback),
    getFraction: (index, base, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      if (typeof value !== 'number') return fallback;
      return value;
    },
    getFloat: (index, fallback) => {
      if (!isPresent(index)) return fallback;
      const value = lookup(index);
      return typeof value === 'number' ? value : fallback;
    },
    getNonResourceString: (index) => makeTypedArrayPeer(vm, values).getString(index),
    peekValue: (index) => {
      const value = lookup(index);
      return value === undefined ? null : { data: value };
    },
    length: () => values.size,
    recycle: () => undefined,
    close: () => undefined,
  };
}

function coerceReflectionArgs(vm, paramDescriptors, args) {
  if (!Array.isArray(args)) return args;
  return paramDescriptors.map((descriptor, index) => {
    const arg = args[index];
    switch (descriptor) {
      case 'I':
      case 'S':
      case 'B':
      case 'C': {
        if (typeof arg === 'number') return arg | 0;
        if (arg && typeof arg === 'object') {
          if (typeof arg.intValue === 'function') return arg.intValue();
          if (arg.$peer && typeof arg.$peer.value === 'number') return arg.$peer.value | 0;
          if (typeof arg.value === 'number') return arg.value | 0;
        }
        return arg === null || arg === undefined ? 0 : Number(arg) | 0;
      }
      case 'J': {
        if (typeof arg === 'number') return arg;
        if (arg && typeof arg === 'object') {
          if (typeof arg.longValue === 'function') return arg.longValue();
          if (arg.$peer && typeof arg.$peer.value === 'number') return arg.$peer.value;
        }
        return Number(arg) || 0;
      }
      case 'F':
      case 'D': {
        if (typeof arg === 'number') return arg;
        if (arg && typeof arg === 'object') {
          if (typeof arg.doubleValue === 'function') return arg.doubleValue();
          if (arg.$peer && typeof arg.$peer.value === 'number') return arg.$peer.value;
        }
        return Number(arg) || 0;
      }
      case 'Z': {
        if (typeof arg === 'boolean') return arg;
        if (typeof arg === 'number') return arg !== 0;
        if (arg && typeof arg === 'object') {
          if (typeof arg.booleanValue === 'function') return arg.booleanValue();
          if (arg.$peer && typeof arg.$peer.value === 'boolean') return arg.$peer.value;
        }
        return !!arg;
      }
      default:
        return arg;
    }
  });
}

function makeAssetStream(vm, bytes) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Ljava/io/FileInputStream;');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  object.data = data;
  object.cursor = 0;
  object.$bytes = data;
  if (object.$fields instanceof Map) {
    object.$fields.set('data', data);
    object.$fields.set('cursor', 0);
  }
  if (vm.registry?.getPeer) {
    const peer = vm.registry.getPeer(object, 'Ljava/io/FileInputStream;');
    if (peer) {
      peer.data = data;
      peer.cursor = 0;
    }
  }
  return object;
}

function dataDir(vm) {
  return '/data/user/0/' + (vm?.packageName || 'app');
}

function externalDir(vm) {
  return '/storage/emulated/0/Android/data/' + (vm?.packageName || 'app');
}

function fileArray(vm, paths) {
  return vm.newArray('[Ljava/io/File;', paths.length, paths.map((path) => vm.makeFile(path)));
}

function makeFileOutput(vm, path, append) {
  if (!vm || typeof vm.allocateRawObject !== 'function') return null;
  const object = vm.allocateRawObject('Ljava/io/FileOutputStream;');
  const peer = vm.registry?.getPeer ? vm.registry.getPeer(object, 'Ljava/io/FileOutputStream;') : null;
  if (peer) {
    peer.path = path;
    const existing = append ? VIRTUAL_FS.read(path) : null;
    peer.chunks = existing ? [Uint8Array.from(existing)] : [];
  }
  return object;
}

function resolveAssetManager(self, vm) {
  if (self && typeof self.readBytes === 'function') return self;
  if (self?.assets && typeof self.assets.readBytes === 'function') return self.assets;
  const resources = vm?.resources;
  if (resources?.getAssets) return resources.getAssets();
  return null;
}

function contextSystemService(vm, name) {
  if (!vm) return null;
  const key = String(name || '');
  const cacheKey = `service:${key}`;
  if (!vm.serviceCache) vm.serviceCache = new Map();
  if (vm.serviceCache.has(cacheKey)) return vm.serviceCache.get(cacheKey);
  let object = null;
  if (key === 'layout_inflater') {
    const inflater = new LayoutInflater(vm.contextObject);
    inflater.vm = vm;
    object = inflater;
  } else if (key === 'window') {
    object = vm.contextObject?.windowObject ?? null;
  } else if (key === 'accessibility') {
    // 控件会在构造期取这个服务并 checkcast 成 AccessibilityManager，
    // 返回裸对象会让 checkcast 直接抛异常、整个构造中断。
    object = vm.wrapPeer({
      constructor: { $descriptor: 'Landroid/view/accessibility/AccessibilityManager;' },
    });
  } else if (key === 'input_method') {
      object = {
        showSoftInput() {
          const focused = vm.focusedEditable?.();
          if (focused) vm.screen?.showKeyboard?.(focused);
          return true;
        },
        hideSoftInputFromWindow() {
          vm.screen?.hideKeyboard?.();
          return true;
        },
        toggleSoftInput() {
          if (vm.screen?.isKeyboardShown?.()) vm.screen.hideKeyboard();
          else {
            const focused = vm.focusedEditable?.();
            if (focused) vm.screen?.showKeyboard?.(focused);
          }
        },
      };
    } else if (vm.getSystemService) {
      object = vm.getSystemService(key);
    }
    vm.serviceCache.set(cacheKey, object);
    return object;
}

function mainThreadObject(vm) {
  return vm?.currentThreadObject?.() ?? null;
}

function makeDefaultLocaleObject(vm) {
  const object = vm.allocateRawObject('Ljava/util/Locale;');
  object.$peer = { language: 'zh', country: 'CN' };
  return object;
}

function dispatchActivityKeyEvent(self, event, vm) {
  if (!event) return false;
  const keyCode = event.keyCode ?? event.$peer?.keyCode ?? 0;
  if ((keyCode | 0) === 4 && typeof self.onBackPressed === 'function') {
    self.onBackPressed();
    return true;
  }
  return false;
}

function asInt(value) {
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

const XML_TYPES = { START_DOCUMENT: 0, END_DOCUMENT: 1, START_TAG: 2, END_TAG: 3, TEXT: 4 };

function safeGetLayout(vm, resId) {
  const id = resId >>> 0;
  if (!id) return { root: { type: 'root', children: [] } };
  try {
    return vm.resources.getLayout(id) ?? { root: { type: 'root', children: [] } };
  } catch {
    return { root: { type: 'root', children: [] } };
  }
}

function flattenXmlEvents(xml) {
  const events = [{ event: XML_TYPES.START_DOCUMENT, depth: 0, name: null, node: null, text: null }];
  const walk = (node, depth) => {
    if (!node) return;
    if (node.type === 'element') {
      events.push({ event: XML_TYPES.START_TAG, depth, name: node.name, node, text: null });
      for (const child of node.children || []) walk(child, depth + 1);
      events.push({ event: XML_TYPES.END_TAG, depth, name: node.name, node, text: null });
    } else if (node.type === 'text') {
      events.push({ event: XML_TYPES.TEXT, depth, name: null, node, text: node.text ?? '' });
    } else {
      for (const child of node.children || []) walk(child, depth);
    }
  };
  for (const child of xml?.root?.children || []) walk(child, 0);
  events.push({ event: XML_TYPES.END_DOCUMENT, depth: 0, name: null, node: null, text: null });
  return events;
}

function makeXmlParserPeer(vm, xml) {
  const object = vm.allocateRawObject('Lorg/xmlpull/v1/XmlPullParser;');
  object.$parserState = { events: flattenXmlEvents(xml), index: 0 };
  return object;
}

function xmlParserCurrent(self) {
  const state = self?.$parserState;
  if (!state) return { event: XML_TYPES.END_DOCUMENT, depth: 0, name: null, node: null, text: null };
  const ev = state.events[state.index];
  return ev || { event: XML_TYPES.END_DOCUMENT, depth: 0, name: null, node: null, text: null };
}

function xmlParserAdvance(self) {
  const state = self?.$parserState;
  if (!state) return XML_TYPES.END_DOCUMENT;
  if (state.index < state.events.length - 1) state.index += 1;
  return xmlParserCurrent(self).event;
}

function attributeValueToString(node, name) {
  const found = node?.attrs?.find((a) => a.name === name || a.namespaceName === name);
  if (!found) return null;
  return found.value == null ? null : String(found.value);
}

function parseMenuResource(resources, resId, vm) {
  let xml = null;
  try {
    xml = resources?.getLayout?.(resId) ?? null;
  } catch {
    xml = null;
  }
  if (!xml?.root) return null;
  const items = [];
  const readAttr = (node, name) => {
    const found = node.attrs?.find((a) => a.name === name || a.namespaceName === name);
    return found ? found.value : null;
  };
  const resolveText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.reference !== undefined) {
      try { return String(resources.resolve(value.reference >>> 0) ?? ''); } catch { return ''; }
    }
    return String(value);
  };
  const resolveBoolean = (value, fallback) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0') return false;
    return fallback;
  };
  const collect = (node) => {
    if (!node || node.type !== 'element') return;
    if (node.name === 'item') {
      const itemId = attributeResourceValueFor(node, 'id', 0);
      const title = resolveText(attributeValueForNode(node, 'title'));
      items.push({
        groupId: asInt(attributeValueForNode(node, 'menuCategory')),
        itemId: itemId | 0,
        order: asInt(attributeValueForNode(node, 'orderInCategory')),
        title,
        visible: resolveBoolean(attributeValueForNode(node, 'visible'), true),
        enabled: resolveBoolean(attributeValueForNode(node, 'enabled'), true),
        checkable: resolveBoolean(attributeValueForNode(node, 'checkable'), false),
        checked: resolveBoolean(attributeValueForNode(node, 'checked'), false),
        showAsAction: asInt(attributeValueForNode(node, 'showAsAction')),
        icon: attributeResourceValueFor(node, 'icon', 0) >>> 0,
      });
    }
    for (const child of node.children || []) collect(child);
  };
  collect(xml.root);
  return items;
}

function createTypedArray(vm, attrs, styleId, attributeSet = null, defStyleAttr = 0) {
  const values = themeAttributeValues(vm, attrs, styleId, attributeSet, defStyleAttr);
  const ids = Array.isArray(attrs) ? attrs : (attrs?.$data || []);
  const object = vm.allocateRawObject('Landroid/content/res/TypedArray;');
  // TypedArray 的访问器收的是 attr 数组下标，不是 attr id。
  // 必须把原始数组传下去，否则缺失的 attr 会让下标错位。
  object.$peer = makeTypedArrayPeer(vm, values, null, ids);
  return object;
}

function attributeSetNode(attributeSet) {
  if (!attributeSet) return null;
  if (attributeSet.$attrParser) {
    try { return xmlParserCurrent(attributeSet.$attrParser).node || null; } catch { return null; }
  }
  return attributeSet.$attrNode || attributeSet.$peer?.node || null;
}

function localAttrName(a) {
  const n = a.name || '';
  const idx = n.lastIndexOf(':');
  return idx >= 0 ? n.slice(idx + 1) : n;
}

function findAttrByName(node, name) {
  if (!node || !Array.isArray(node.attrs)) return null;
  if (name == null) {
    return node.attrs.find((a) => localAttrName(a) === 'id') || null;
  }
  return node.attrs.find((a) => localAttrName(a) === name) || null;
}

function attributeValueForNode(node, name) {
  const a = findAttrByName(node, name);
  return a ? a.value : undefined;
}

function attributeResourceValueFor(node, name, def) {
  const a = findAttrByName(node, name);
  if (!a) return def;
  const dataType = a.dataType & 0xff;
  if (dataType === 0x01) return a.data >>> 0;
  if (typeof a.value === 'number') return a.value >>> 0;
  return def;
}

function truthyAttr(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1';
}

function findAttributeByIdOrName(attributeSet, node, attrId, table = null) {
  const byId = node.attrs.find((a) => a.resId && (a.resId >>> 0) === attrId);
  if (byId) return byId;
  const resources = attributeSet?.$attrResources || attributeSet?.$peer?.resources || null;
  const resourceTable = table || resources?.table || null;
  const key = resourceTable?.getEntry?.(attrId)?.key;
  if (!key) return null;
  return node.attrs.find((a) => !a.resId && localAttrName(a) === key) || null;
}

function attributeValueFor(attributeSet, attrId, table = null) {
  const node = attributeSetNode(attributeSet);
  if (!node || !Array.isArray(node.attrs)) return undefined;
  const id = attrId >>> 0;
  const attr = findAttributeByIdOrName(attributeSet, node, id, table);
  if (!attr) return undefined;
  const dataType = attr.dataType & 0xff;
  if (dataType === 0x01) {
    if (attr.value !== undefined && attr.value !== null && typeof attr.value === 'object' && attr.value.reference !== undefined) return attr.value;
    return attr.data >>> 0;
  }
  if (dataType === 0x02) {
    if (attr.value && typeof attr.value === 'object' && attr.value.reference !== undefined) return attr.value;
    return (attr.data >>> 0) === 0 ? 0 : Number(attr.rawValue ?? attr.value ?? attr.data);
  }
  if (dataType === 0x03) return attr.rawValue ?? (typeof attr.value === 'string' ? attr.value : null);
  if (dataType === 0x05) return attr.value?.dimension !== undefined ? attr.value : (attr.rawValue ?? attr.value);
  if (dataType === 0x10 || dataType === 0x11) return attr.data | 0;
  if (dataType === 0x12) return (attr.data | 0) !== 0;
  if (dataType === 0x04) return Number(attr.data) || 0;
  return attr.value ?? attr.data;
}

/** 把主题属性值（颜色整数 / 资源引用 / 字符串 / 尺寸）转成 TypedValue 三元组。 */
function themeTypedValue(vm, value, resolveRefs) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const color = parseColorString(value);
    if (color !== null) return { type: 0x1c, data: color | 0, resourceId: 0 };
    return { type: 0x03, data: 0, resourceId: 0, string: value };
  }
  if (typeof value === 'boolean') return { type: 0x12, data: value ? 1 : 0, resourceId: 0 };
  if (typeof value === 'object') {
    if (value.dimension) return { type: 0x05, data: (value.raw ?? 0) | 0, resourceId: 0 };
    if (value.reference !== undefined) return themeTypedValueReference(vm, value.reference >>> 0, resolveRefs);
    if (value.value !== undefined) return themeTypedValue(vm, value.value, resolveRefs);
    return null;
  }
  if (typeof value !== 'number') return null;
  const id = value >>> 0;
  const entry = vm.resources?.table?.getEntry?.(id);
  const systemId = id >= 0x01000000 && id < 0x02000000;
  if (entry || systemId) return themeTypedValueReference(vm, id, resolveRefs);
  return { type: 0x10, data: value | 0, resourceId: 0 };
}

function themeTypedValueReference(vm, id, resolveRefs) {
  if (!resolveRefs) return { type: 0x01, data: id | 0, resourceId: id };
  const resources = vm.resources;
  const entry = resources?.table?.getEntry?.(id);
  // 颜色（含指向系统色 0x01xxxxxx 的引用链）优先；注意只对缺少表项的系统 id
  // 或 color 类型资源调用，避免把普通 integer 资源当成颜色。
  if (!entry || entry.typeName === 'color') {
    const color = resources?.resolveColorValue?.(id);
    if (color !== null && color !== undefined) return { type: 0x1c, data: color | 0, resourceId: id };
  }
  const resolved = resources?.resolve?.(id);
  if (resolved && typeof resolved === 'object') {
    if (resolved.dimension) return { type: 0x05, data: (resolved.raw ?? 0) | 0, resourceId: id };
    if (resolved.reference !== undefined) return themeTypedValueReference(vm, resolved.reference >>> 0, true);
  }
  if (typeof resolved === 'string') return { type: 0x03, data: 0, resourceId: id, string: resolved };
  if (typeof resolved === 'number') return { type: 0x10, data: resolved | 0, resourceId: id };
  if (typeof resolved === 'boolean') return { type: 0x12, data: resolved ? 1 : 0, resourceId: id };
  return { type: 0x01, data: id | 0, resourceId: id };
}

function getThemeObject(vm) {
  if (!vm) return null;
  if (!vm.themeObject) {
    const object = vm.allocateRawObject('Landroid/content/res/Resources$Theme;');
    object.$peer = {
      applyStyle: () => undefined,
      setTo: () => undefined,
      resolveAttribute: (attrId, out, resolveRefs) => {
        const store = themeStore(vm);
        const table = vm.resources?.table || null;
        const key = table ? table.getEntry(attrId >>> 0)?.key : null;
        if (!key) return false;
        let value;
        if (Object.prototype.hasOwnProperty.call(store, key)) value = store[key];
        else if (store.$attrReferences && Object.prototype.hasOwnProperty.call(store.$attrReferences, key)) {
          value = store.$attrReferences[key];
        } else return false;
        const typed = themeTypedValue(vm, value, !!resolveRefs);
        if (!typed) return false;
        if (out) {
          const write = (name, fieldValue) => {
            if (out.$fields instanceof Map) out.$fields.set(`Landroid/util/TypedValue;->${name}`, fieldValue);
            else if (out.$peer) out.$peer[name] = fieldValue;
            else out[name] = fieldValue;
          };
          write('type:I', typed.type);
          write('data:I', typed.data | 0);
          write('resourceId:I', typed.resourceId >>> 0);
          if (typed.string !== undefined) write('string:Ljava/lang/CharSequence;', typed.string);
        }
        return true;
      },
      obtainStyledAttributes: (attrs) => createTypedArray(vm, attrs),
      obtainStyledAttributesWithStyle: (styleId, attrs) => createTypedArray(vm, attrs, styleId),
    };
    vm.themeObject = object;
  }
  return vm.themeObject;
}

function pbkdf2Sha1(password, salt, iterations, keyLength) {
  const passwordBytes = Array.from(new TextEncoder().encode(password));
  const out = [];
  let block = 1;
  while (out.length < keyLength) {
    const blockBytes = [salt, [(block >>> 24) & 0xff, (block >>> 16) & 0xff, (block >>> 8) & 0xff, block & 0xff]].flat();
    let u = hmacSha1(passwordBytes, blockBytes);
    let t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacSha1(passwordBytes, u);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    out.push(...t);
    block++;
  }
  return out.slice(0, keyLength);
}

function hmacSha1(key, message) {
  let k = key.slice();
  if (k.length > 64) k = sha1(k);
  while (k.length < 64) k.push(0);
  const ipad = k.map((b) => b ^ 0x36);
  const opad = k.map((b) => b ^ 0x5c);
  return sha1(opad.concat(sha1(ipad.concat(message))));
}

function sha1(bytes) {
  const data = bytes.slice();
  const bitLength = data.length * 8;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  const hi = Math.floor(bitLength / 0x100000000) >>> 0;
  const lo = bitLength >>> 0;
  data.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  data.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  for (let i = 0; i < data.length; i += 64) {
    const w = new Array(80);
    for (let j = 0; j < 16; j++) {
      w[j] = (data[i + j * 4] << 24) | (data[i + j * 4 + 1] << 16) | (data[i + j * 4 + 2] << 8) | data[i + j * 4 + 3];
    }
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = ((x << 1) | (x >>> 31)) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) | 0; b = a; a = temp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const result = [];
  for (const h of [h0, h1, h2, h3, h4]) {
    result.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  }
  return result;
}

const AES_SBOX = (() => {
  const sbox = new Array(256);
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >>> 7)) ^ ((q << 2) | (q >>> 6)) ^ ((q << 3) | (q >>> 5)) ^ ((q << 4) | (q >>> 4));
    sbox[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;
  return sbox;
})();

const AES_INV_SBOX = (() => {
  const inv = new Array(256);
  for (let i = 0; i < 256; i++) inv[AES_SBOX[i]] = i;
  return inv;
})();

function aesExpandKey(key) {
  const nk = key.length / 4;
  const nr = nk + 6;
  const w = new Array(4 * (nr + 1));
  for (let i = 0; i < nk; i++) {
    w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
  }
  let rcon = 1;
  for (let i = nk; i < 4 * (nr + 1); i++) {
    let temp = w[i - 1].slice();
    if (i % nk === 0) {
      temp = [temp[1], temp[2], temp[3], temp[0]].map((b) => AES_SBOX[b]);
      temp[0] ^= rcon;
      rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 0xff;
    } else if (nk > 6 && i % nk === 4) {
      temp = temp.map((b) => AES_SBOX[b]);
    }
    w[i] = w[i - nk].map((b, j) => b ^ temp[j]);
  }
  return { w, nr };
}

function xtime(a) {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

function mul(a, b) {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return result & 0xff;
}

function aesEncryptBlock(keySchedule, block) {
  const { w, nr } = keySchedule;
  let state = block.slice();
  addRoundKey(state, w, 0);
  for (let round = 1; round < nr; round++) {
    state = state.map((b) => AES_SBOX[b]);
    shiftRows(state, false);
    mixColumns(state, false);
    addRoundKey(state, w, round);
  }
  state = state.map((b) => AES_SBOX[b]);
  shiftRows(state, false);
  addRoundKey(state, w, nr);
  return state;
}

function aesDecryptBlock(keySchedule, block) {
  const { w, nr } = keySchedule;
  let state = block.slice();
  addRoundKey(state, w, nr);
  for (let round = nr - 1; round > 0; round--) {
    shiftRows(state, true);
    state = state.map((b) => AES_INV_SBOX[b]);
    addRoundKey(state, w, round);
    mixColumns(state, true);
  }
  shiftRows(state, true);
  state = state.map((b) => AES_INV_SBOX[b]);
  addRoundKey(state, w, 0);
  return state;
}

function addRoundKey(state, w, round) {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) state[i * 4 + j] ^= w[round * 4 + i][j];
  }
}

function shiftRows(state, inverse) {
  for (let r = 1; r < 4; r++) {
    const row = [state[r], state[4 + r], state[8 + r], state[12 + r]];
    const shifted = inverse
      ? row.slice(4 - r).concat(row.slice(0, 4 - r))
      : row.slice(r).concat(row.slice(0, r));
    for (let c = 0; c < 4; c++) state[c * 4 + r] = shifted[c];
  }
}

function mixColumns(state, inverse) {
  const matrix = inverse
    ? [[14, 11, 13, 9], [9, 14, 11, 13], [13, 9, 14, 11], [11, 13, 9, 14]]
    : [[2, 3, 1, 1], [1, 2, 3, 1], [1, 1, 2, 3], [3, 1, 1, 2]];
  for (let c = 0; c < 4; c++) {
    const col = [state[c * 4], state[c * 4 + 1], state[c * 4 + 2], state[c * 4 + 3]];
    for (let r = 0; r < 4; r++) {
      state[c * 4 + r] = matrix[r].reduce((acc, m, i) => acc ^ mul(col[i], m), 0);
    }
  }
}

function pkcs7Pad(data) {
  const pad = 16 - (data.length % 16);
  return data.concat(new Array(pad).fill(pad));
}

function pkcs7Unpad(data) {
  if (!data.length) return data;
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16 || pad > data.length) return data;
  return data.slice(0, data.length - pad);
}

function aesEncryptCbc(key, iv, data) {
  const schedule = aesExpandKey(key);
  const padded = pkcs7Pad(data);
  const out = [];
  let prev = iv.slice();
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.slice(i, i + 16).map((b, j) => b ^ prev[j]);
    const encrypted = aesEncryptBlock(schedule, block);
    out.push(...encrypted);
    prev = encrypted;
  }
  return out;
}

function aesDecryptCbc(key, iv, data) {
  if (data.length % 16 !== 0) return data;
  const schedule = aesExpandKey(key);
  const out = [];
  let prev = iv.slice();
  for (let i = 0; i < data.length; i += 16) {
    const block = data.slice(i, i + 16);
    const decrypted = aesDecryptBlock(schedule, block).map((b, j) => b ^ prev[j]);
    out.push(...decrypted);
    prev = block;
  }
  return pkcs7Unpad(out);
}
