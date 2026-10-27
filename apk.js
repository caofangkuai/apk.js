import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';

const MAX_APK_SIZE = 50 * 1024 * 1024;

const statusEl = document.getElementById('status');
const canvas = document.getElementById('screen');
const logEl = document.getElementById('log');
const fileInput = document.getElementById('apk-file');
const pickBtn = document.getElementById('pick-btn');

let engine = null;

function setStatus(text, kind = 'info') {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function appendLog(entry) {
  if (!logEl) return;
  const line = document.createElement('div');
  line.className = `log-line log-${entry.level || 'info'}`;
  line.textContent = `[${entry.level}] ${entry.tag}: ${entry.message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function getJSZip() {
  if (typeof JSZip !== 'undefined') return JSZip;
  throw new Error('未找到 JSZip，请确认 vendor/jszip.min.js 已加载');
}

async function hasNativeLibs(zip) {
  return Object.keys(zip.files).some((name) => name.startsWith('lib/') && !zip.files[name].dir);
}

async function loadApk(file) {
  if (!file) return;
  if (file.size > MAX_APK_SIZE) {
    setStatus(`APK 超过大小上限（${(MAX_APK_SIZE / 1024 / 1024).toFixed(0)}MB）`, 'error');
    return;
  }
  setStatus('正在解压 APK…', 'info');
  try {
    const JSZipLib = getJSZip();
    const zip = await JSZipLib.loadAsync(await file.arrayBuffer());
    if (!zip.file('AndroidManifest.xml')) {
      setStatus('不是有效的 APK：缺少 AndroidManifest.xml', 'error');
      return;
    }
    if (await hasNativeLibs(zip)) {
      setStatus('含原生库，无法模拟', 'error');
      return;
    }
    setStatus('正在解析资源与 DEX…', 'info');
    const apk = await loadApkFiles(zip);

    engine?.stop();
    engine = new EmulatorEngine({
      onLog: appendLog,
      onFinished: () => setStatus('Activity 已结束', 'info'),
      width: 360,
      height: 640,
    });
    engine.attachCanvas(canvas);
    setStatus('正在启动 Activity…', 'info');
    await engine.start(apk);
    setStatus(`运行中：${apk.packageName}`, 'ok');
  } catch (error) {
    console.error(error);
    appendLog({ level: 'error', tag: 'apk', message: error.message });
    setStatus(`加载失败：${error.message}`, 'error');
  }
}

pickBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) loadApk(file);
});

const dropZone = document.getElementById('drop-zone');
if (dropZone) {
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragging');
    });
  }
  dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadApk(file);
  });
}

window.apkSimulator = { loadApk, getEngine: () => engine };
