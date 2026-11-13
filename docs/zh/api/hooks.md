# 拦截方法

`apk.js` 用 [Xposed](https://api.xposed.info/) 的 API 形状做方法拦截：`XC_MethodHook`、`MethodHookParam`、`XposedBridge`、`XposedHelpers`。拦截点位于「方法解析完成之后、执行之前」，因此三类调用都能拦：

- APK 的 DEX 里实现的方法（含构造方法）
- `android.*` / `java.*` 的宿主实现
- `super` 与接口分派，因为拦截键取的是解析后的方法

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });
const { bridge, helpers } = sim.xposed;

bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    param.args[0] = '被改写了';
  },
});

await sim.loadFromFile(file);
```

第一次加载 APK 之前注册的 hook 会先排队，等 VM 启动时统一生效，所以上面的写法即使在 `sim.vm` 还是 `null` 时也没问题。

## `sim.xposed`

| 成员 | 说明 |
| --- | --- |
| `bridge` | 绑定到该模拟器的 `XposedBridge`。 |
| `helpers` | 绑定到该模拟器的 `XposedHelpers`。 |
| `attach(vm)` | 绑定（或重新绑定）到某个 VM，并展开排队的 hook。引擎会自动调用。 |
| `clear()` | 清空全部已注册的 hook。 |
| `active` | 至少注册了一个 hook 时为 `true`；为 `false` 时解释器完全跳过查表。 |

## 注册拦截

| API | 说明 |
| --- | --- |
| `bridge.hookAllMethods(className, methodName, callback)` | 拦截该类声明的同名全部重载，返回 `UnhookSet`（有 `size`、`forEach`、可迭代、可 `unhook()`）。 |
| `bridge.hookAllConstructors(className, callback)` | 拦截 `<init>` 重载。 |
| `bridge.hookMethod(methodInfo, callback)` | 拦截 `helpers.findMethodExact` 返回的方法对象。 |
| `helpers.findAndHookMethod(className, classLoader, methodName, ...参数类型, callback)` | 精确拦截单个重载；`classLoader` 只为对齐 Xposed 签名，传 `null`。 |
| `helpers.findMethodExact(className, methodName, ...参数类型)` | 只解析方法，不拦截。 |

`className` 支持 Java 名（`android.widget.TextView`）和描述符（`Landroid/widget/TextView;`），类不存在会抛 `找不到类 ...`。参数类型同样两种写法都行，另外支持基本类型名（`int`、`long`、`boolean`、`float`、`double`、`byte`、`short`、`char`、`void`）。

每次注册都返回 `Unhook`（`hookAll*` 返回 `UnhookSet`）：

```js
const unhooks = bridge.hookAllMethods('android.os.SystemClock', 'uptimeMillis', after);
unhooks.unhook();
```

## 回调

```js
helpers.findAndHookMethod('java.lang.String', null, 'trim', {
  beforeHookedMethod(param) {
    // 原方法执行前；抛错或 setResult() 可跳过原方法
  },
  afterHookedMethod(param) {
    // 原方法执行后（原方法抛错时也会执行）
    param.setResult(param.getResult() + '!');
  },
});
```

回调可以是：

- 带 `beforeHookedMethod` / `afterHookedMethod` 的普通对象
- 单个函数，等价于 `beforeHookedMethod`
- `XC_MethodHook` 实例，或覆写了任意一阶段子类

回调自身抛错只会写进 `vm.log('error', 'xposed', ...)`，不会中断应用执行，避免一个坏 hook 把整帧搞挂。

## `MethodHookParam`

| 成员 | 说明 |
| --- | --- |
| `method` | 方法信息：`getName()`、`getDescriptor()`、`getDeclaringClass()`、`getParameterTypes()`、`getReturnType()`、`isStaticMethod()`、`isConstructor()`。 |
| `thisObject` | 接收者；静态调用为 `null`。 |
| `args` | 参数数组。调用前改动它即可改变原方法收到的值。 |
| `isStatic` | 静态方法为 `true`。 |
| `setResult(value)` / `getResult()` / `hasResult` | 替换返回值。在 before 阶段调用 `setResult` 会完全跳过原方法。 |
| `setThrowable(error)` / `getThrowable()` / `hasThrowable()` | 让这次调用抛异常，值应当是 VM 异常对象（见下）。 |
| `getObjectExtra(key)` / `setObjectExtra(key, value)` | 单次调用的暂存区，可在 before 与 after 之间传值。 |

执行顺序：先按注册顺序跑完所有 `beforeHookedMethod`，然后执行原方法（除非某个 hook 已经产出返回值或异常），最后跑所有 `afterHookedMethod`。多次 `setResult` 以最后一次为准。

## 字段与调用

| API | 说明 |
| --- | --- |
| `helpers.getObjectField(obj, name)` / `setObjectField(obj, name, value)` | 读写实例字段。 |
| `helpers.getIntField` / `getLongField` / `getBooleanField` / `getFloatField` / `getDoubleField` | 带类型的读取（`long` 返回 `BigInt`）。 |
| `helpers.setIntField` / `setLongField` / `setBooleanField` / `setFloatField` / `setDoubleField` | 带类型的写入。 |
| `helpers.getStaticObjectField(className, name)` / `setStaticObjectField(className, name, value)` | 读写静态字段。 |
| `helpers.callMethod(obj, name, ...args)` | 调用实例方法，按参数形状挑选重载。 |
| `helpers.callStaticMethod(className, name, ...args)` | 调用静态方法。 |
| `helpers.newInstance(className, ...args)` | 构造实例。 |

字段查找会沿父类链向上，并同时支持宿主类里常见的 `名字:类型` 与裸名两种键。

## 从 hook 里抛异常

```js
bridge.hookAllMethods('android.app.Activity', 'finish', {
  beforeHookedMethod(param) {
    const error = sim.vm.allocateRawObject('Ljava/lang/IllegalStateException;');
    error.$exceptionMessage = 'finish() blocked';
    param.setThrowable(error);
  },
});
```

引擎随后按正常流程展开：DEX 方法内的 `try/catch` 能捕获它，未捕获则走常规崩溃路径。

## 说明与限制

- 宿主类的构造发生在原生 `ctor` 里，那时还不存在 `<init>` 方法。所以 `hookAllConstructors` 对 DEX 类和声明了 `<init>` 的宿主类有效；对纯宿主类会明确提示没有可拦截的 `<init>`。
- 拦截按解析后的方法匹配：hook 基类同时能抓到 `super` 调用，hook 子类只抓到解析到子类实现的调用。
- 每注册一个 hook，每次调用会多一次字符串键查表。不需要时用 `unhook()` 摘掉；一个都没有时查表完全跳过。
