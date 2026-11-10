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

const res = vm.resources;
const idOf = (name) => res.getIdentifier(name, 'id');
const byId = (name) => root.findViewById(idOf(name));

const button = byId('action');
const countView = byId('count');
console.log('button found:', !!button, button?.getText?.());

if (button) {
  button.performClick();
  button.performClick();
  await new Promise((resolve) => setTimeout(resolve, 50));
  console.log('counter count text:', countView?.getText());
}

const echoInput = byId('echo_input');
const echoAction = byId('echo_action');
const echoOutput = byId('echo_output');
if (echoInput)
  echoInput.dispatchTouchEvent({ action: 'down', x: 10, y: 10 });
if (echoInput)
  echoInput.dispatchTouchEvent({ action: 'up', x: 10, y: 10 });
console.log('echo focus:', echoInput?.hasFocus?.(), 'cursor:', echoInput?.showCursor);
if (echoInput) echoInput.setText('hello dex');
if (echoAction) echoAction.performClick();
console.log('echo output text:', echoOutput?.getText());

const keyInput = byId('echo_input');
if (keyInput) {
  keyInput.setText('');
  keyInput.requestFocus();
  engine.screen.showKeyboard(keyInput);
  for (const ch of 'abc') engine.screen.sendKey({ key: ch });
  engine.screen.sendKey({ key: 'Backspace' });
  console.log('keyboard typed:', JSON.stringify(keyInput.getText()), 'shown:', engine.screen.isKeyboardShown());
  engine.screen.hideKeyboard();
}
if (keyInput) keyInput.setText('hello dex');

const addAction = byId('add_action');
const dynamicList = byId('dynamic_list');
if (addAction && dynamicList) {
  addAction.performClick();
  addAction.performClick();
  console.log('dynamic rows:', dynamicList.getChildCount ? dynamicList.getChildCount() : dynamicList.children?.length);
}

const progressAction = byId('progress_action');
const progressBar = byId('progress');
const progressLabel = byId('progress_label');
if (progressAction) {
  progressAction.performClick();
  progressAction.performClick();
  progressAction.performClick();
  console.log('progress value:', progressBar?.getProgress?.(), 'label:', progressLabel?.getText());
}

const pillAction = byId('pill_action');
const pillResult = byId('pill_result');
if (pillAction) {
  pillAction.performClick();
  console.log('pill button bg:', pillAction.getBackground?.()?.type, 'result:', pillResult?.getText());
}

const buildAction = byId('build_action');
const buildOutput = byId('build_output');
if (buildAction) {
  buildAction.performClick();
  console.log('build output:', buildOutput?.getText());
}

const reflectAction = byId('reflect_action');
const reflectOutput = byId('reflect_output');
if (reflectAction) {
  reflectAction.performClick();
  console.log('reflect output:', reflectOutput?.getText());
}

const activityAction = byId('activity_action');
if (activityAction) {
  activityAction.performClick();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const secondActivity = vm.activity;
  const secondPeer = vm.registry.getPeer(secondActivity, vm.registry.classNameOf(secondActivity));
  const secondRoot = secondPeer.contentView;
  const secondMessage = secondRoot?.findViewById?.(idOf('second_message'));
  console.log('second activity:', vm.activityDescriptor, 'message:', secondMessage?.getText());
}

await new Promise((resolve) => setTimeout(resolve, 500));
console.log('overlays:', engine.screen.overlays.length, 'screen dirty:', engine.screen.dirty);

// AlertDialog host smoke: builder -> show -> dismiss
try {
  const dialogBuilder = vm.instantiate('Landroid/app/AlertDialog$Builder;', [engine.activity]);
  vm.invokeByName('setTitle', '(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;', dialogBuilder, ['Dialog']);
  vm.invokeByName('setMessage', '(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;', dialogBuilder, ['hello']);
  const before = (engine.screen.overlays || []).length;
  const dialog = vm.invokeByName('show', '()Landroid/app/AlertDialog;', dialogBuilder, []);
  const shown = (engine.screen.overlays || []).length > before;
  vm.invokeByName('dismiss', '()V', dialog, []);
  const dismissed = (engine.screen.overlays || []).length === before;
  console.log('dialog host:', { shown, dismissed });
} catch (error) {
  console.log('dialog host failed:', error.message);
}

// Widget host smoke: ToggleButton / SeekBar
try {
  const toggle = vm.instantiate('Landroid/widget/ToggleButton;', [engine.activity]);
  vm.invokeByName('setTextOn', '(Ljava/lang/CharSequence;)V', toggle, ['ON']);
  vm.invokeByName('setTextOff', '(Ljava/lang/CharSequence;)V', toggle, ['OFF']);
  vm.invokeByName('setChecked', '(Z)V', toggle, [true]);
  const toggleText = vm.invokeByName('getText', '()Ljava/lang/CharSequence;', toggle, []);
  const seek = vm.instantiate('Landroid/widget/SeekBar;', [engine.activity]);
  const before = vm.invokeByName('getProgress', '()I', seek, []);
  vm.invokeByName('performClick', '()Z', seek, []);
  const after = vm.invokeByName('getProgress', '()I', seek, []);
  console.log('widget hosts:', { toggleText, seekProgress: [before, after] });
} catch (error) {
  console.log('widget hosts failed:', error.message);
}

// RadioGroup smoke
try {
  const group = vm.instantiate('Landroid/widget/RadioGroup;', [engine.activity]);
  const first = vm.instantiate('Landroid/widget/RadioButton;', [engine.activity]);
  const second = vm.instantiate('Landroid/widget/RadioButton;', [engine.activity]);
  vm.invokeByName('setId', '(I)V', first, [101]);
  vm.invokeByName('setId', '(I)V', second, [102]);
  vm.invokeByName('addView', '(Landroid/view/View;)V', group, [first]);
  vm.invokeByName('addView', '(Landroid/view/View;)V', group, [second]);
  vm.invokeByName('check', '(I)V', group, [102]);
  const checked = vm.invokeByName('getCheckedRadioButtonId', '()I', group, []);
  console.log('radio group:', { checked });
} catch (error) {
  console.log('radio group failed:', error.message);
}

const errors = logs.filter((entry) => entry.level === 'error');
if (errors.length) {
  console.error('errors:', errors);
  process.exitCode = 1;
} else {
  console.log('OK');
process.exit(0);
}
