# Hooking methods

`apk.js` intercepts methods with the [Xposed](https://api.xposed.info/) API shape: `XC_MethodHook`, `MethodHookParam`, `XposedBridge` and `XposedHelpers`. The interception point sits right after method resolution and before execution, so three kinds of calls can be hooked:

- methods implemented in the APK's DEX files (including constructors)
- host implementations of `android.*` / `java.*` classes
- `super` and interface dispatch, because the hook keys off the resolved method

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });
const { bridge, helpers } = sim.xposed;

bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    param.args[0] = 'rewritten';
  },
});

await sim.loadFromFile(file);
```

Hooks registered before the first APK load are queued and applied when the VM starts, so the example above keeps working even though `sim.vm` is still `null`.

## `sim.xposed`

| Member | Description |
| --- | --- |
| `bridge` | `XposedBridge` instance bound to this simulator. |
| `helpers` | `XposedHelpers` instance bound to this simulator. |
| `attach(vm)` | Bind (or rebind) the runtime to a VM and replay queued hooks. Called automatically by the engine. |
| `clear()` | Drop every registered hook. |
| `active` | `true` when at least one hook is registered; the interpreter skips hook lookup entirely while it is `false`. |

## Registering hooks

| API | Description |
| --- | --- |
| `bridge.hookAllMethods(className, methodName, callback)` | Hook every overload with that name declared on the class. Returns a `UnhookSet` with `size`, `forEach`, iteration and `unhook()`. |
| `bridge.hookAllConstructors(className, callback)` | Hook the `<init>` overloads. |
| `bridge.hookMethod(methodInfo, callback)` | Hook a method object returned by `helpers.findMethodExact`. |
| `helpers.findAndHookMethod(className, classLoader, methodName, ...paramTypes, callback)` | Hook exactly one overload. `classLoader` mirrors the Xposed signature; pass `null`. |
| `helpers.findMethodExact(className, methodName, ...paramTypes)` | Resolve a method without hooking it. |

`className` accepts a Java name (`android.widget.TextView`) or a descriptor (`Landroid/widget/TextView;`); an unknown class throws `找不到类 ...`. Parameter types accept the same two forms plus primitive names (`int`, `long`, `boolean`, `float`, `double`, `byte`, `short`, `char`, `void`).

Each registration returns an `Unhook` (or a `UnhookSet` for the `hookAll*` helpers):

```js
const unhooks = bridge.hookAllMethods('android.os.SystemClock', 'uptimeMillis', after);
unhooks.unhook();
```

## The callback

```js
helpers.findAndHookMethod('java.lang.String', null, 'trim', {
  beforeHookedMethod(param) {
    // Runs before the original body; throw or setResult() to skip it.
  },
  afterHookedMethod(param) {
    // Runs after the original body (also runs when the body threw).
    param.setResult(param.getResult() + '!');
  },
});
```

The callback may be:

- a plain object with `beforeHookedMethod` / `afterHookedMethod`
- a single function, used as `beforeHookedMethod`
- an `XC_MethodHook` instance, or a subclass overriding either phase

Callback exceptions are logged through `vm.log('error', 'xposed', ...)` instead of aborting the app, so a broken hook cannot take the whole frame down.

## `MethodHookParam`

| Member | Description |
| --- | --- |
| `method` | Method info: `getName()`, `getDescriptor()`, `getDeclaringClass()`, `getParameterTypes()`, `getReturnType()`, `isStaticMethod()`, `isConstructor()`. |
| `thisObject` | Receiver, or `null` for static calls. |
| `args` | Argument array. Mutating entries before the call changes what the original method receives. |
| `isStatic` | `true` for static methods. |
| `setResult(value)` / `getResult()` / `hasResult` | Replace the return value. Calling `setResult` in the "before" phase skips the original method entirely. |
| `setThrowable(error)` / `getThrowable()` / `hasThrowable()` | Make the call throw. The value should be a VM exception object (see below). |
| `getObjectExtra(key)` / `setObjectExtra(key, value)` | Per-call scratch space shared between the before and after phases. |

Ordering: `beforeHookedMethod` runs for every registered hook, then the original body (unless a hook already produced a result or a throwable), then `afterHookedMethod` for every hook. The last `setResult` wins.

## Fields and calls

| API | Description |
| --- | --- |
| `helpers.getObjectField(obj, name)` / `setObjectField(obj, name, value)` | Instance field read/write. |
| `helpers.getIntField` / `getLongField` / `getBooleanField` / `getFloatField` / `getDoubleField` | Typed reads (`long` returns a `BigInt`). |
| `helpers.setIntField` / `setLongField` / `setBooleanField` / `setFloatField` / `setDoubleField` | Typed writes. |
| `helpers.getStaticObjectField(className, name)` / `setStaticObjectField(className, name, value)` | Static field read/write. |
| `helpers.callMethod(obj, name, ...args)` | Invoke an instance method, picking the overload that matches the argument shapes. |
| `helpers.callStaticMethod(className, name, ...args)` | Invoke a static method. |
| `helpers.newInstance(className, ...args)` | Construct an instance. |

Field lookup walks the superclass chain and understands both the `NAME:TYPE` and bare-name key styles used by host classes.

## Throwing from a hook

```js
bridge.hookAllMethods('android.app.Activity', 'finish', {
  beforeHookedMethod(param) {
    const error = sim.vm.allocateRawObject('Ljava/lang/IllegalStateException;');
    error.$exceptionMessage = 'finish() blocked';
    param.setThrowable(error);
  },
});
```

The engine then unwinds normally: `try/catch` blocks inside the DEX method see the exception, and an uncaught one surfaces through the usual crash path.

## Notes and limits

- Host constructors run inside the native `ctor`, before any `<init>` method exists. `hookAllConstructors` therefore works for DEX classes and for host classes that declare `<init>`; on a pure host class it reports that there is no `<init>` to hook.
- Hooks match the resolved method, so hooking a base class also catches `super` calls, while hooking a subclass only catches calls that resolve to the subclass implementation.
- Every registered hook adds a string-keyed map lookup per call. Remove hooks you no longer need via `unhook()`; with none registered the lookup is skipped completely.
