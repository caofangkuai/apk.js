# Features

## DEX interpreter

The interpreter covers the main Dalvik instruction set: arithmetic, branching, `switch`, arrays, fields, method dispatch (virtual, super, direct, static, interface), exception handling and `move-result` plumbing.

## Resource parsing

Binary `AndroidManifest.xml` and `resources.arsc` are parsed directly. Resource IDs resolve through the table, so theme attributes, string references and file paths behave the way the app expects.

## Framework subset

| Area | What works |
| --- | --- |
| Activity | Lifecycle, `setContentView`, `findViewById`, `startActivity` within the app |
| Views | `LinearLayout`, `FrameLayout`, `RelativeLayout`, `ScrollView`, `ViewPager`, `RecyclerView`, `CoordinatorLayout`, `DrawerLayout`, `Toolbar`, `TabLayout` |
| Widgets | `TextView`, `Button`, `EditText`, `ImageView`, `ProgressBar`, `CheckBox`, `Switch` |
| Drawables | `shape`, `vector`, `ripple`, `selector`, `GradientDrawable`, `RippleDrawable`, `backgroundTint` |
| Themes | `Context.setTheme`, theme inheritance, `@android:color/*` resolution |
| Input | Soft keyboard bridge, `InputMethodManager`, selection and caret |
| System | `Build`, `VERSION`, `SystemProperties`, `ActivityManager.getMemoryInfo` |

## Device info

Device identity comes from `navigator` where the browser exposes it:

| Browser API | Used for |
| --- | --- |
| `navigator.platform` | `ro.product.device`, board, hardware |
| `navigator.language` | `ro.product.locale`, region |
| `navigator.hardwareConcurrency` | `Runtime.availableProcessors()` |
| `navigator.deviceMemory` | `MemoryInfo.totalMem`, `Runtime.maxMemory()` |
| `navigator.maxTouchPoints` | Touch capability |

When a browser withholds a value, apk.js falls back to a fixed default so apps still start.
