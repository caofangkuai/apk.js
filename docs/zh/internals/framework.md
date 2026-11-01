# Framework 子集

## native 类定义

Framework 类以 `NativeClassDef` 记录的形式注册。每条记录声明描述符、父类、实例字段、静态字段和方法表。方法就是普通的 JavaScript 函数，接收 `(self, args, vm)`。

```js
JAVA_CORE_CLASSES['Ljava/lang/Runtime;'] = nativeDef('Ljava/lang/Runtime;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'availableProcessors()I': () => deviceCapabilities().cores,
  },
});
```

## 视图

`View` 保存几何信息（`left`、`top`、`right`、`bottom`）、测量尺寸、布局参数、内边距、背景和子视图。`measure` 根据 `MeasureSpec` 约束算出期望尺寸，`layout` 摆放子视图，`draw` 画到 canvas 上。

`ViewGroup` 的各子类有自己的测量策略：

| 类 | 策略 |
| --- | --- |
| `LinearLayout` | 方向、权重、gravity |
| `FrameLayout` | 层叠子视图，应用 gravity |
| `RelativeLayout` | 相对约束，两遍解析 |
| `ScrollView` | 单个可滚动子视图 |
| `CoordinatorLayout` | Behavior 驱动布局 |

## 布局参数

`getLayoutParams()` 从父视图推导参数类。父视图属于 Framework 时，apk.js 会找描述符形如 `<Parent>$X`、且父类链能到达 `ViewGroup$LayoutParams` 的内部类。都没有匹配时，退回到父类声明的 `generateLayoutParams` 返回类型。

这样参数类始终来自 APK 自己的 DEX，自定义 `LayoutParams` 子类也能正确工作。

## 资源

`Resources` 封装资源表。`getText`、`getColor`、`getDrawable` 和 `getLayout` 通过资源表解析 ID，处理配置变体和引用。布局与 manifest 走同一个 AXML 读取器。

## 设备信息

设备标识优先取浏览器实时值，取不到才用固定默认值：

```js
const caps = deviceCapabilities();
// { cores, memoryBytes, availBytes, touchPoints }
```

`navigator.hardwareConcurrency`、`navigator.deviceMemory` 和 `navigator.maxTouchPoints` 提供给 `Runtime`、`MemoryInfo` 和 `ActivityManager`。浏览器不提供时，回退值保证应用仍能启动。

`ro.*` 系统属性同理：`navigator.platform` 和 `navigator.language` 决定 `ro.product.device` 和 `ro.product.locale`，回退值是 `browser` 和 `en-US`。
