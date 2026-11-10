import fs from 'node:fs';
import { createRequire } from 'node:module';
import { AnalogClock, TimePicker, CalendarView, DatePicker, NumberPicker, TextView } from '../src/framework/widgets.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');

const canvas = createCanvas(800, 600);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, 800, 600);
ctx.font = '14px sans-serif';
ctx.fillStyle = '#37474f';

const adapter = new Proxy(ctx, {
  get(target, prop) {
    if (prop === 'context') return ctx;
    if (prop === 'drawText') return (text, x, y, paint) => {
      ctx.save();
      ctx.font = `${Math.round(paint?.textSize || 14)}px ${paint?.typeface || 'sans-serif'}`;
      ctx.fillStyle = paint?.colorText || '#263238';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(text), x, y);
      ctx.restore();
    };
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

const drawCell = (label, view, x, y, w, h) => {
  ctx.save();
  ctx.strokeStyle = '#cfd8dc';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#37474f';
  ctx.fillText(label, x + 8, y + 18);
  ctx.save();
  ctx.translate(x, y + 24);
  ctx.beginPath();
  ctx.rect(0, 0, w, h - 24);
  ctx.clip();
  view.layout(0, 0, w, h - 24);
  view.onDraw(adapter);
  ctx.restore();
  ctx.restore();
};

const clock = new AnalogClock(null);
const time = Object.assign(new TimePicker(null), { hour: 10, minute: 30 });
const calendar = Object.assign(new CalendarView(null), { date: Date.now() });
const date = Object.assign(new DatePicker(null), {});
date.setDate(2024, 5, 6);
const number = Object.assign(new NumberPicker(null), {});
number.setValue(42);
const text = new TextView(null);
text.setText('TextView 中文 Hello');
text.setTextSize(20);
text.layout(0, 0, 240, 48);

drawCell('AnalogClock', clock, 20, 20, 240, 240);
drawCell('TimePicker', time, 280, 20, 240, 240);
drawCell('CalendarView', calendar, 540, 20, 240, 240);
drawCell('DatePicker/NumberPicker', {
  layout() {},
  onDraw() {
    date.layout(0, 0, 240, 48);
    date.onDraw(adapter);
    ctx.save();
    ctx.translate(0, 64);
    number.layout(0, 0, 240, 48);
    number.onDraw(adapter);
    ctx.restore();
  },
}, 20, 290, 240, 200);
drawCell('TextView', text, 280, 290, 280, 100);

fs.mkdirSync('image-debug', { recursive: true });
fs.writeFileSync('image-debug/widgets.png', canvas.toBuffer('image/png'));
console.log('已生成 image-debug/widgets.png');
