import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';

const ctx = new Proxy({ measureText: () => ({ width: 8 }), getLineDash: () => [] }, {
  get(t, p) { return p in t ? t[p] : () => {}; }, set(t, p, v) { t[p] = v; return true; },
});
const canvas = { clientWidth: 360, clientHeight: 720, width: 360, height: 720, style: {},
  getContext: () => ctx, addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 720 }; } };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 16);

const ids = new Map(); let nx = 1;
function oid(o) { if (!o || typeof o !== 'object') return String(o); if (!ids.has(o)) ids.set(o, nx++); return ids.get(o); }
function pn(ref) { const p = ref.proto; if (!p) return ''; return p.text || p.raw || p.descriptor || ''; }

const orig = JavaVM.prototype.invoke;
JavaVM.prototype.invoke = function (ref, recv, args, mode, method) {
  try {
    if (ref.classDesc === 'Landroidx/fragment/app/j;' && ref.name === 'a' && pn(ref) === '(Landroidx/fragment/app/Fragment;Z)V') {
      const f = args[0];
      const added = this.getField(f, { classDesc: 'Landroidx/fragment/app/Fragment;', name: 'mAdded', type: 'Z' });
      const g = this.getField(recv, { classDesc: 'Landroidx/fragment/app/j;', name: 'g', type: 'Ljava/util/ArrayList;' });
      console.error('ADDFRAG oid=' + oid(f) + ' g.contains=' + (g && g.items ? g.items.includes(f) : '?') + ' g.len=' + (g && g.items ? g.items.length : '?')
        + '\n    ' + (this.methodStack || []).slice(-8).join(' < '));
    }
    if (ref.classDesc === 'Landroidx/fragment/app/o;' && ref.name === 'a' && pn(ref) === '(Landroid/view/ViewGroup;)V') {
      const d = this.getField(recv, { classDesc: 'Landroidx/fragment/app/o;', name: 'd', type: 'Landroidx/fragment/app/p;' });
      console.error('FINISHUPD adapter=' + oid(recv) + ' d=' + (d === null ? 'null' : (typeof d === 'object' ? 'rec' + oid(d) : String(d))));
    }
    if (ref.classDesc === 'Landroidx/fragment/app/o;' && ref.name === 'a' && pn(ref) === '(Landroid/view/ViewGroup;I)Ljava/lang/Object;') {
      const d = this.getField(recv, { classDesc: 'Landroidx/fragment/app/o;', name: 'd', type: 'Landroidx/fragment/app/p;' });
      console.error('INSTANTIATE adapter=' + oid(recv) + ' pos=' + args[1] + ' d=' + (d === null ? 'null' : (typeof d === 'object' ? 'rec' + oid(d) : String(d))));
    }
    if (ref.classDesc === 'Ljava/util/ArrayList;' && ref.name === 'add' && pn(ref) === '(Ljava/lang/Object;)Z') {
      const st = (this.methodStack || []);
      if (st.slice(-4).some((x) => x.indexOf('fragment.app.j.a') >= 0 || x.indexOf('fragment.app.a.a') >= 0)) {
        console.error('ARRADD oid=' + oid(recv) + ' item=' + oid(args[0]) + '\n    ' + st.slice(-6).join(' < '));
      }
    }
    if (ref.classDesc === 'Ljava/util/ArrayList;' && ref.name === 'clear' && pn(ref) === '()V') {
      console.error('ARRLIST.clear oid=' + oid(recv) + ' len=' + (recv && recv.items ? recv.items.length : '?')
        + '\n    ' + (this.methodStack || []).slice(-5).join(' < '));
    }
    if (ref.classDesc === 'Landroidx/fragment/app/j;' && ref.name === 'b' && pn(ref) === '(Ljava/util/ArrayList;Ljava/util/ArrayList;)Z') {
      const d = this.getField(recv, { classDesc: 'Landroidx/fragment/app/j;', name: 'd', type: 'Ljava/util/ArrayList;' });
      const owner = this.resolveFieldOwner(recv, { classDesc: 'Landroidx/fragment/app/j;', name: 'd', type: 'Ljava/util/ArrayList;' });
      const keys = [...(recv.$fields ? recv.$fields.keys() : [])].filter((k) => k.indexOf('->d:') >= 0);
      console.error('JB dOid=' + oid(d) + ' owner=' + owner + ' keys=' + keys.join(',')
        + ' runtime=' + (recv.$runtimeClass ? recv.$runtimeClass.descriptor : '?')
        + ' dex=' + (recv.$dexClass ? recv.$dexClass.descriptor : '?')
        + ' A=' + oid(args[0]) + ' B=' + oid(args[1]));
    }
    if (ref.classDesc === 'Landroidx/fragment/app/a;' && ref.name === 'c' && pn(ref) === '()V') {
      const ops = this.getField(recv, { classDesc: 'Landroidx/fragment/app/a;', name: 'a', type: 'Ljava/util/ArrayList;' });
      console.error('EXECUTE rec=' + oid(recv) + ' ops=' + (ops && ops.items ? ops.items.length : '?')
        + '\n    ' + (this.methodStack || []).slice(-8).join(' < '));
    }
    if (ref.classDesc === 'Landroidx/fragment/app/a;' && ref.name === 'a' && pn(ref) === '()V') {
      console.error('COMMIT rec=' + oid(recv) + '\n    ' + (this.methodStack || []).slice(-5).join(' < '));
    }
  } catch (e) { console.error('PROBE-ERR', e && e.message); }
  return orig.apply(this, arguments);
};

const eng = new EmulatorEngine({ onLog: () => {}, width: 360, height: 720 });
eng.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2] || '/tmp/devinfo.apk')));
try { await eng.start(apk); } catch (e) { console.error('START-THROW', e && e.message); }
