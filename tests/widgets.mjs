import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AnalogClock, TimePicker, CalendarView } from '../src/framework/widgets.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');

const cases = [
  ['AnalogClock', new AnalogClock(null)],
  ['TimePicker', Object.assign(new TimePicker(null), { hour: 10, minute: 30 })],
  ['CalendarView', Object.assign(new CalendarView(null), { date: Date.now() })],
];
for (const [name, view] of cases) {
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 200, 200);
  view.layout(0, 0, 200, 200);
  view.onDraw({ context: ctx });
  const data = ctx.getImageData(0, 0, 200, 200).data;
  let painted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) painted++;
  }
  assert.ok(painted > 100, `${name} 应绘制内容`);
  console.log(`${name} painted pixels:`, painted);
}
console.log('widgets OK');
