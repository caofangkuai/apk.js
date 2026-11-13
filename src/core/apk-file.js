/**
 * APK 文件装载器：只依赖 dex/axml/arsc 解析器，不引入任何 Android Framework 宿主类。
 * 核心引擎（dist/apk.min.js）与完整模拟器（dist/android-framework.min.js）共用这份实现。
 */
import { DexFile } from '../dex/dexfile.js';
import { ResourceTable } from '../res/arsc.js';
import { parseBinaryXml } from '../res/axml.js';

export async function loadApkFiles(zip, limits = {}) {
  const files = zip.files;
  const maxEntries = Number(limits.maxEntries) || 50000;
  const maxTotalSize = Number(limits.maxTotalSize) || 256 * 1024 * 1024;
  let totalSize = 0;
  let entryCount = 0;
  for (const [name, entry] of Object.entries(files)) {
    if (entry.dir) continue;
    entryCount += 1;
    if (entryCount > maxEntries) throw new Error('APK 条目过多，已拒绝解压');
    const size = Number(entry?._data?.uncompressedSize);
    if (Number.isFinite(size) && size > 0) totalSize += size;
    if (totalSize > maxTotalSize) throw new Error('APK 解压后体积超过上限，已拒绝解压');
  }
  const assetFiles = new Map();
  const resourceBytes = new Map();
  for (const [name, entry] of Object.entries(files)) {
    if (entry.dir) continue;
    if (name === 'AndroidManifest.xml' || name === 'resources.arsc' || /^classes\d*\.dex$/.test(name)) continue;
    if (!name.startsWith('assets/')) {
      const bytes = await entry.async('uint8array');
      resourceBytes.set(name, bytes);
    }
    if (!name.startsWith('assets/')) continue;
    assetFiles.set(name.slice('assets/'.length), { name, bytes: await entry.async('uint8array') });
  }

  if (!zip.file('AndroidManifest.xml')) throw new Error('不是有效的 APK：缺少 AndroidManifest.xml');
  if (!zip.file('resources.arsc')) throw new Error('不是有效的 APK：缺少 resources.arsc');
  const manifestBytes = await zip.file('AndroidManifest.xml').async('uint8array');
  const manifestXml = parseBinaryXml(manifestBytes);
  const arscBytes = await zip.file('resources.arsc').async('uint8array');
  const resourceTable = new ResourceTable(arscBytes);

  const dexNames = Object.keys(files).filter((n) => /^classes\d*\.dex$/.test(n)).sort();
  if (!dexNames.length) throw new Error('不是有效的 APK：缺少 classes*.dex');
  const dexFiles = [];
  for (const name of dexNames) {
    dexFiles.push(new DexFile(await zip.file(name).async('uint8array')));
  }

  const layoutCache = new Map();
  const layoutLoader = async (resId) => {
    if (layoutCache.has(resId)) return layoutCache.get(resId);
    const entry = resourceTable.getEntry(resId);
    if (!entry || typeof entry.value !== 'string') return null;
    const file = zip.file(entry.value);
    if (!file) return null;
    const tree = parseBinaryXml(await file.async('uint8array'));
    layoutCache.set(resId, tree);
    return tree;
  };

  return {
    manifest: manifestXml.manifest,
    packageName: manifestXml.manifest.getAttribute('package'),
    resourceTable,
    dexFiles,
    assetFiles,
    layoutLoader,
    xmlCache: new Map(),
    zip,
    zipEntry(path) {
      const normalized = path.replace(/^\/+/, '');
      const bytes = resourceBytes.get(normalized) || resourceBytes.get(`res/${normalized}`);
      if (!bytes) throw new Error(`资源文件不存在: ${normalized}`);
      return bytes;
    },
    rawZip: zip,
    imageLoader: defaultImageLoader,
    invalidate: null,
  };
}

async function defaultImageLoader(bytes, key) {
  if (typeof createImageBitmap === 'function' && typeof Blob === 'function') {
    const blob = new Blob([bytes], { type: guessImageMime(key) });
    return createImageBitmap(blob);
  }
  if (typeof Image === 'function' && typeof URL !== 'undefined' && typeof Blob === 'function') {
    const blob = new Blob([bytes], { type: guessImageMime(key) });
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return null;
}

function guessImageMime(key) {
  const lower = String(key).toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}
