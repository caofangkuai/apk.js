/**
 * android.animation 宿主引擎回归。
 *
 * 校验宿主补全不是空 stub，而是真的在推进状态：
 *   1) ValueAnimator 的取值/插值/重复时长可计算；
 *   2) ObjectAnimator 会把插值结果写回目标 View 的属性；
 *   3) Keyframe 与 AnimatorSet 的依赖调度产生真实的中间值和总时长。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JAVA_CORE_CLASSES } from '../src/framework/java-core.js';
import { View } from '../src/framework/view.js';
import { viewObject } from '../src/framework/bridge.js';

const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);

const def = (descriptor) => vm.registry.resolve(descriptor).nativeDef;
const stat = (descriptor, key, args) => def(descriptor).staticMethods.get(key)(null, args, vm);
const call = (object, key, args = []) => {
  const name = key.slice(0, key.indexOf('('));
  const proto = key.slice(key.indexOf('('));
  return vm.invokeByName(name, proto, object, args);
};
const floatBits = (value) => {
  const floats = new Float32Array(1);
  const ints = new Int32Array(floats.buffer);
  floats[0] = value;
  return ints[0];
};
const floatArray = (values) => {
  const array = vm.newArray('[F', values.length, 0);
  values.forEach((value, index) => { array.$data[index] = floatBits(value); });
  return array;
};
const unbox = (value) => (value?.$peer && typeof value.$peer.value === 'number' ? value.$peer.value : value);
const readFloat = (bits) => {
  const ints = new Int32Array(1);
  ints[0] = bits;
  return new Float32Array(ints.buffer)[0];
};

/* 1. 纯数值动画：中间值由插值器 + 取值共同决定 */
const numeric = stat('Landroid/animation/ValueAnimator;', 'ofFloat([F)Landroid/animation/ValueAnimator;', [floatArray([0, 10])]);
assert.ok(numeric, 'ofFloat 应返回动画对象');
call(numeric, 'setCurrentFraction(F)V', [0.5]);
assert.equal(unbox(call(numeric, 'getAnimatedValue()Ljava/lang/Object;')), 5);
assert.equal(readFloat(call(numeric, 'getAnimatedFraction()F')), 0.5);

/* 2. ObjectAnimator 写入真实 View 属性 */
const targetView = new View(null);
const target = viewObject(vm, targetView);
const objectAnimator = stat(
  'Landroid/animation/ObjectAnimator;',
  'ofFloat(Ljava/lang/Object;Ljava/lang/String;[F)Landroid/animation/ObjectAnimator;',
  [target, 'alpha', floatArray([0, 1])]
);
call(objectAnimator, 'setCurrentFraction(F)V', [0.25]);
assert.equal(targetView.alpha, 0.25, 'alpha 应被插值写入目标 View');
call(objectAnimator, 'start()V');
assert.equal(targetView.alpha, 1, '无帧回调环境下 start 应落到终值');
assert.equal(call(objectAnimator, 'isRunning()Z'), 0, '结束后 isRunning 为 false');
assert.equal(call(objectAnimator, 'isStarted()Z'), 1, '结束后 isStarted 仍为 true');

/* 3. 重复次数参与总时长 */
call(objectAnimator, 'setRepeatCount(I)V', [2]);
assert.equal(Number(call(objectAnimator, 'getTotalDuration()J')), 900);
call(objectAnimator, 'setCurrentFraction(F)V', [0.5]);
assert.ok(Math.abs(targetView.alpha - 0.5) < 1e-6, '默认加速减速插值器在 0.5 处约为 0.5');

/* 4. Keyframe 动画给出中间关键值 */
const first = stat('Landroid/animation/Keyframe;', 'ofFloat(FF)Landroid/animation/Keyframe;', [0, 0]);
const last = stat('Landroid/animation/Keyframe;', 'ofFloat(FF)Landroid/animation/Keyframe;', [1, 100]);
const frames = vm.newArray('[Landroid/animation/Keyframe;', 2, null);
frames.$data[0] = first;
frames.$data[1] = last;
const holder = stat(
  'Landroid/animation/PropertyValuesHolder;',
  'ofKeyframe(Ljava/lang/String;[Landroid/animation/Keyframe;)Landroid/animation/PropertyValuesHolder;',
  ['alpha', frames]
);
const holders = vm.newArray('[Landroid/animation/PropertyValuesHolder;', 1, null);
holders.$data[0] = holder;
const keyed = stat(
  'Landroid/animation/ValueAnimator;',
  'ofPropertyValuesHolder([Landroid/animation/PropertyValuesHolder;)Landroid/animation/ValueAnimator;',
  [holders]
);
call(keyed, 'setCurrentFraction(F)V', [0.5]);
assert.equal(unbox(call(keyed, 'getAnimatedValue()Ljava/lang/Object;')), 50, '关键帧应线性插值');

/* 5. AnimatorSet 顺序调度：总时长累加，启动后子动画都被推进 */
const firstAnimator = stat('Landroid/animation/ValueAnimator;', 'ofFloat([F)Landroid/animation/ValueAnimator;', [floatArray([0, 1])]);
const secondAnimator = stat('Landroid/animation/ValueAnimator;', 'ofFloat([F)Landroid/animation/ValueAnimator;', [floatArray([0, 1])]);
call(firstAnimator, 'setDuration(J)Landroid/animation/Animator;', [200n]);
call(secondAnimator, 'setDuration(J)Landroid/animation/Animator;', [100n]);
const set = vm.allocateRawObject('Landroid/animation/AnimatorSet;');
set.$peer = {
  vm,
  running: false,
  started: false,
  paused: false,
  listeners: [],
  pauseListeners: [],
  updateListeners: [],
  children: [],
  nodes: [],
  duration: 0,
  animatedValues: new Map(),
};
const sequence = vm.newArray('[Landroid/animation/Animator;', 2, null);
sequence.$data[0] = firstAnimator;
sequence.$data[1] = secondAnimator;
call(set, 'playSequentially([Landroid/animation/Animator;)V', [sequence]);
assert.equal(Number(call(set, 'getTotalDuration()J')), 300, '顺序执行总时长应为 200 + 100');
call(set, 'start()V');
assert.equal(call(firstAnimator, 'isStarted()Z'), 1, '顺序组启动后第一个动画已启动');
assert.equal(call(secondAnimator, 'isStarted()Z'), 1, '顺序组启动后第二个动画已启动');

/* 6. Builder before 依赖把后者排到前者之后 */
const before = stat('Landroid/animation/ValueAnimator;', 'ofFloat([F)Landroid/animation/ValueAnimator;', [floatArray([0, 1])]);
const after = stat('Landroid/animation/ValueAnimator;', 'ofFloat([F)Landroid/animation/ValueAnimator;', [floatArray([0, 1])]);
call(before, 'setDuration(J)Landroid/animation/Animator;', [80n]);
call(after, 'setDuration(J)Landroid/animation/Animator;', [40n]);
const scheduled = vm.allocateRawObject('Landroid/animation/AnimatorSet;');
scheduled.$peer = {
  vm,
  running: false,
  started: false,
  paused: false,
  listeners: [],
  pauseListeners: [],
  updateListeners: [],
  children: [],
  nodes: [],
  duration: 0,
  animatedValues: new Map(),
};
const builder = call(scheduled, 'play(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;', [before]);
call(builder, 'before(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;', [after]);
assert.equal(Number(call(scheduled, 'getTotalDuration()J')), 120, 'before 依赖应把后者排在 80ms 之后');

console.log('animation OK');
