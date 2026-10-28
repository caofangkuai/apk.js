import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';

const DEFAULT_DEVICE = {
  width: 360,
  height: 640,
  dpr: undefined,
  style: 'material',
  maxApkSize: 50 * 1024 * 1024,
};

const DEFAULT_OPTIONS = {
  element: null,
  canvas: null,
  device: {},
  onLog: null,
  onFinished: null,
  onError: null,
};

function resolveElement(target) {
  if (!target) return null;
  if (typeof target === 'string') return document.querySelector(target);
  if (typeof target === 'object' && typeof target.appendChild === 'function') return target;
  return null;
}

function getJSZip() {
  if (typeof globalThis.JSZip !== 'undefined') return globalThis.JSZip;
  throw new Error('未找到 JSZip，请先加载 jszip.min.js');
}

async function hasNativeLibs(zip) {
  return Object.keys(zip.files).some((name) => name.startsWith('lib/') && !zip.files[name].dir);
}

export class ApkSimulator {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.device = { ...DEFAULT_DEVICE, ...(options.device || {}) };
    this.engine = null;
    this.canvas = null;
    this.host = null;
    this.running = false;
  }

  ensureCanvas() {
    if (this.canvas) return this.canvas;
    const explicit = resolveElement(this.options.canvas);
    if (explicit && typeof explicit.getContext === 'function') {
      this.canvas = explicit;
      return this.canvas;
    }
    const host = resolveElement(this.options.element);
    if (!host) throw new Error('未指定渲染目标元素（element 或 canvas）');
    this.host = host;
    const canvas = document.createElement('canvas');
    canvas.width = this.device.width;
    canvas.height = this.device.height;
    canvas.style.width = `${this.device.width}px`;
    canvas.style.height = `${this.device.height}px`;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    host.appendChild(canvas);
    this.canvas = canvas;
    return canvas;
  }

  async loadFromFile(file) {
    if (!file) throw new Error('缺少 APK 文件');
    if (file.size > this.device.maxApkSize) {
      const limit = (this.device.maxApkSize / 1024 / 1024).toFixed(0);
      throw new Error(`APK 超过大小上限（${limit}MB）`);
    }
    const zip = await getJSZip().loadAsync(await file.arrayBuffer());
    return this.loadFromZip(zip);
  }

  async loadFromUrl(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`下载 APK 失败：HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > this.device.maxApkSize) {
      const limit = (this.device.maxApkSize / 1024 / 1024).toFixed(0);
      throw new Error(`APK 超过大小上限（${limit}MB）`);
    }
    const zip = await getJSZip().loadAsync(buffer);
    return this.loadFromZip(zip);
  }

  async loadFromZip(zip) {
    if (!zip.file('AndroidManifest.xml')) {
      throw new Error('不是有效的 APK：缺少 AndroidManifest.xml');
    }
    if (await hasNativeLibs(zip)) {
      throw new Error('APK 含原生库（lib/），无法模拟');
    }
    const apk = await loadApkFiles(zip);
    return this.start(apk);
  }

  async loadFromArrayBuffer(buffer) {
    const zip = await getJSZip().loadAsync(buffer);
    return this.loadFromZip(zip);
  }

  async start(apk) {
    const canvas = this.ensureCanvas();
    this.stop();
    this.engine = new EmulatorEngine({
      width: this.device.width,
      height: this.device.height,
      dpr: this.device.dpr,
      style: this.device.style,
      onLog: (entry) => this.options.onLog?.(entry),
      onFinished: () => {
        this.running = false;
        this.options.onFinished?.();
      },
    });
    this.engine.attachCanvas(canvas);
    try {
      await this.engine.start(apk);
      this.running = true;
      return this;
    } catch (error) {
      this.running = false;
      this.options.onError?.(error);
      throw error;
    }
  }

  setDevice(device = {}) {
    this.device = { ...this.device, ...device };
    if (this.canvas && (device.width || device.height)) {
      const width = this.device.width;
      const height = this.device.height;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.engine?.setCanvasSize(width, height);
    }
    return this;
  }

  stop() {
    this.engine?.stop();
    this.running = false;
    return this;
  }

  destroy() {
    this.stop();
    if (this.host && this.canvas) {
      if (typeof this.host.removeChild === 'function') {
        try { this.host.removeChild(this.canvas); } catch { /* 已移除 */ }
      }
    }
    this.canvas = null;
    this.host = null;
    this.engine = null;
    return this;
  }

  get vm() {
    return this.engine?.vm || null;
  }
}

export function createSimulator(options = {}) {
  return new ApkSimulator(options);
}

export { loadApkFiles, EmulatorEngine };

function autoInitDemo() {
  if (typeof document === 'undefined') return;
  const canvasEl = document.getElementById('screen');
  if (!canvasEl) return;

  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const fileInput = document.getElementById('apk-file');
  const pickBtn = document.getElementById('pick-btn');
  const dropZone = document.getElementById('drop-zone');

  const setStatus = (text, kind = 'info') => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };

  const appendLog = (entry) => {
    if (!logEl) return;
    const line = document.createElement('div');
    line.className = `log-line log-${entry.level || 'info'}`;
    line.textContent = `[${entry.level}] ${entry.tag}: ${entry.message}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const simulator = createSimulator({
    canvas: canvasEl,
    device: {
      width: canvasEl.width || 360,
      height: canvasEl.height || 640,
    },
    onLog: appendLog,
    onFinished: () => setStatus('Activity 已结束', 'info'),
  });

  const loadApk = async (file) => {
    if (!file) return;
    setStatus('正在解压 APK…', 'info');
    try {
      await simulator.loadFromFile(file);
      setStatus(`运行中：${simulator.vm?.packageName || '未知包名'}`, 'ok');
    } catch (error) {
      appendLog({ level: 'error', tag: 'apk', message: error.message });
      if (error?.stack) {
        appendLog({ level: 'error', tag: 'apk', message: error.stack });
      }
      setStatus(`加载失败：${error.message}`, 'error');
    }
  };

  pickBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) loadApk(file);
  });

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

  setStatus('等待选择 APK');
  globalThis.apkSimulator = simulator;
}

autoInitDemo();
