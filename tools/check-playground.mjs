import fs from 'node:fs';

const source = fs.readFileSync('playground.html', 'utf8');
const ids = new Set([...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const refs = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(refs)].filter((id) => !ids.has(id));
if (missing.length) {
  console.error('playground.html 引用了不存在的元素:', missing);
  process.exit(1);
}
console.log('playground DOM refs OK', { ids: ids.size, refs: new Set(refs).size });
