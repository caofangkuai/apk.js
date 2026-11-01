# Framework subset

## Native class definitions

Framework classes are registered as `NativeClassDef` records. Each declares a descriptor, a superclass, instance fields, static fields, and method tables. Methods are plain JavaScript functions that receive `(self, args, vm)`.

```js
JAVA_CORE_CLASSES['Ljava/lang/Runtime;'] = nativeDef('Ljava/lang/Runtime;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'availableProcessors()I': () => deviceCapabilities().cores,
  },
});
```

## Views

A `View` carries geometry (`left`, `top`, `right`, `bottom`), measured size, layout params, padding, background and children. `measure` computes desired size from `MeasureSpec` constraints; `layout` places children; `draw` paints to the canvas.

`ViewGroup` subclasses implement their own measurement strategies:

| Class | Strategy |
| --- | --- |
| `LinearLayout` | Orientation, weights, gravity |
| `FrameLayout` | Stack children, apply gravity |
| `RelativeLayout` | Relative constraints, two-pass resolution |
| `ScrollView` | Single scrolling child |
| `CoordinatorLayout` | Behavior-driven layout |

## Layout params

`getLayoutParams()` resolves the params class from the parent. For framework parents, apk.js looks for a nested class whose descriptor matches `<Parent>$X` and whose superclass chain reaches `ViewGroup$LayoutParams`. When nothing matches, it falls back to the parent's declared `generateLayoutParams` return type.

This keeps params classes coming from the APK's own DEX, so custom `LayoutParams` subclasses behave correctly.

## Resources

`Resources` wraps the resource table. `getText`, `getColor`, `getDrawable` and `getLayout` resolve IDs against the table, handling configuration variants and references. Layouts parse through the same AXML reader as the manifest.

## Device info

Device identity prefers live browser values over fixed defaults:

```js
const caps = deviceCapabilities();
// { cores, memoryBytes, availBytes, touchPoints }
```

`navigator.hardwareConcurrency`, `navigator.deviceMemory` and `navigator.maxTouchPoints` feed `Runtime`, `MemoryInfo` and `ActivityManager`. When a browser withholds them, the fallback keeps apps running.

`ro.*` system properties follow the same rule: `navigator.platform` and `navigator.language` shape `ro.product.device` and `ro.product.locale`, with `browser` and `en-US` as fallbacks.
