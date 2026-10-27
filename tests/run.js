import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';

const canvasContext = new Proxy(
  {
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    rect() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    clip() {},
    fillText() {},
    strokeText() {},
    drawImage() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    measureText(text) {
      return { width: String(text).length * 8 };
    },
    setLineDash() {},
    getLineDash() {
      return [];
    },
    roundRect() {},
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);

function createCanvas(width = 360, height = 640) {
  return {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    style: {},
    getContext: () => canvasContext,
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width, height };
    },
  };
}

const apkPath = process.argv[2] || './samples/hello-dex.apk';
const data = fs.readFileSync(apkPath);
const zip = await JSZip.loadAsync(data);

const logs = [];
const engine = new EmulatorEngine({
  onLog: (entry) => {
    logs.push(entry);
    if (entry.level === 'error') console.error('LOG', entry.tag, entry.message);
  },
  width: 360,
  height: 640,
});
engine.attachCanvas(createCanvas());

const apk = await loadApkFiles(zip);
console.log('package:', apk.packageName, 'dex:', apk.dexFiles.length, 'assets:', apk.assetFiles.size);

await engine.start(apk);

const vm = engine.vm;
const activity = engine.activity;
const peer = vm.registry.getPeer(activity, vm.registry.classNameOf(activity));
console.log('activity peer:', peer.constructor.name, 'contentView:', peer.contentView?.constructor.name);

const root = peer.contentView;
function describe(view, depth = 0) {
  const pad = '  '.repeat(depth);
  const extra = view.getText ? ` text="${view.getText()}"` : '';
  console.log(`${pad}${view.constructor.name} id=${view.id?.toString(16) || 0} [${view.getWidth()}x${view.getHeight()}]${extra}`);
  for (const child of view.children || []) describe(child, depth + 1);
}
describe(root);

const button = root.findViewById ? root.findViewById(0x7f020000) : null;
const countView = root.findViewById ? root.findViewById(0x7f020001) : null;
console.log('button found:', !!button, button?.getText?.());

if (button) {
  button.performClick();
  await new Promise((resolve) => setTimeout(resolve, 50));
  console.log('after click count text:', countView?.getText(), 'overlays:', engine.screen.overlays.length);
}

await new Promise((resolve) => setTimeout(resolve, 500));
console.log('overlays:', engine.screen.overlays.length, 'screen dirty:', engine.screen.dirty);

const errors = logs.filter((entry) => entry.level === 'error');
if (errors.length) {
  console.error('errors:', errors);
  process.exitCode = 1;
} else {
  console.log('OK');
process.exit(0);
}
