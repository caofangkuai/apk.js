/**
 * ProgressBar VisualProgress 回归。
 *
 * 之前 setProgress 直接跳到目标值：进度条没有任何过渡。
 * 现在用 $progressAnim 记录起止值与起始时间，visualProgress() 按 250ms
 * 减速曲线插值，绘制与帧循环都读这个值。
 */
import assert from 'node:assert/strict';
import { ProgressBar } from '../src/framework/widgets.js';

const bar = new ProgressBar(null);
bar.max = 100;

assert.equal(bar.visualProgress(), 0, '初始显示值为 0');

// 首次设置直接生效：控件刚出现时就该是正确宽度，而不是从 0 涨上来
bar.setProgress(50);
assert.equal(bar.visualProgress(), 50, '首次设置应立即生效');
assert.equal(bar.$progressAnim, null, '首次设置不应启动动画');

// 之后的变化才做插值
bar.setProgress(80);
assert.ok(bar.$progressAnim, '后续变化应存在进行中的动画');
bar.$progressAnim.start -= 60;
const first = bar.visualProgress();
assert.ok(first > 50 && first < 80, `插值中显示值应在起止之间，实际 ${first}`);
assert.ok(bar.$progressAnim, '动画仍在进行');

// 模拟时间推进到动画结束
bar.$progressAnim.start -= 260;
assert.equal(bar.visualProgress(), 80, '动画结束后应等于目标值');
assert.equal(bar.$progressAnim, null, '动画结束后应清理状态');

// 相同值不重复触发动画
bar.setProgress(80);
assert.equal(bar.$progressAnim, null, '值未变化不应重新开始动画');

// 进度下降也要插值
bar.setProgress(20);
bar.$progressAnim.start -= 120;
const lower = bar.visualProgress();
assert.ok(lower < 80 && lower >= 20, `下降时应从 80 插值到 20，实际 ${lower}`);
bar.$progressAnim.start -= 260;
assert.equal(bar.visualProgress(), 20);

// 不确定态不做数值插值（它有自己的旋转动画）
const indeterminate = new ProgressBar(null);
indeterminate.indeterminate = true;
indeterminate.setProgress(30);
assert.equal(indeterminate.$progressAnim, null, '不确定态不应启动数值插值');
assert.equal(indeterminate.visualProgress(), 30);

// 插值单调：随时间推进逐渐逼近目标
const probe = new ProgressBar(null);
probe.setProgress(10);
probe.setProgress(100);
const samples = [];
for (const elapsed of [0, 60, 120, 180, 240]) {
  probe.$progressAnim.start = Date.now() - elapsed;
  samples.push(probe.visualProgress());
}
for (let i = 1; i < samples.length; i += 1) {
  assert.ok(samples[i] >= samples[i - 1], `插值应单调递增（${samples.join(' → ')}）`);
}
assert.ok(samples[samples.length - 1] > samples[0]);

console.log('progress animation OK', { first: +first.toFixed(1), samples: samples.map((v) => +v.toFixed(0)) });
