import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const ctx=canvas.getContext('2d');
ctx.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const files = await loadApkFiles(fs.readFileSync('/tmp/devinfo.apk'));
const engine = new EmulatorEngine({ canvas, files });
const vm = engine.vm || engine.runtime?.vm || engine;
globalThis.__VM = vm;
await engine.start?.();
if (engine.runMainActivity) await engine.runMainActivity();
else if (vm.invokeActivity) await vm.invokeActivity();
const find = (v, pred) => { if (pred(v)) return v; for (const c of v.children||[]) { const r = find(c, pred); if (r) return r; } return null; };
const root = engine.decorView || vm.decorView || engine.rootView || vm.rootView;
const tb = find(root, v => /appcompat\/widget\/Toolbar/.test(v.$descriptor||''));
if (!tb) { console.log('no toolbar'); process.exit(0); }
console.log('toolbar kids', tb.children.length);
const obj = tb.$javaObject;
if (obj) { console.log('fields', [...obj.$fields.keys()].filter(k=>/Toolbar->/.test(k)).slice(0,20).join('\n  ')); }
