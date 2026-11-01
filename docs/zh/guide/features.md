# 功能特性

## DEX 解释器

解释器覆盖 Dalvik 指令集的主体：算术、跳转、`switch`、数组、字段、方法调用（virtual、super、direct、static、interface）、异常处理和 `move-result` 取值。

## 资源解析

直接解析二进制 `AndroidManifest.xml` 和 `resources.arsc`。资源 ID 通过资源表解析，主题属性、字符串引用和文件路径都按应用预期工作。

## Framework 子集

| 领域 | 支持内容 |
| --- | --- |
| Activity | 生命周期、`setContentView`、`findViewById`、应用内 `startActivity` |
| 视图 | `LinearLayout`、`FrameLayout`、`RelativeLayout`、`ScrollView`、`ViewPager`、`RecyclerView`、`CoordinatorLayout`、`DrawerLayout`、`Toolbar`、`TabLayout` |
| 控件 | `TextView`、`Button`、`EditText`、`ImageView`、`ProgressBar`、`CheckBox`、`Switch` |
| 可绘制资源 | `shape`、`vector`、`ripple`、`selector`、`GradientDrawable`、`RippleDrawable`、`backgroundTint` |
| 主题 | `Context.setTheme`、主题继承、`@android:color/*` 解析 |
| 输入 | 软键盘桥接、`InputMethodManager`、选区和光标 |
| 系统 | `Build`、`VERSION`、`SystemProperties`、`ActivityManager.getMemoryInfo` |

## 设备信息

浏览器能提供的设备信息优先从 `navigator` 读取：

| 浏览器 API | 用途 |
| --- | --- |
| `navigator.platform` | `ro.product.device`、board、hardware |
| `navigator.language` | `ro.product.locale`、区域 |
| `navigator.hardwareConcurrency` | `Runtime.availableProcessors()` |
| `navigator.deviceMemory` | `MemoryInfo.totalMem`、`Runtime.maxMemory()` |
| `navigator.maxTouchPoints` | 触摸能力 |

浏览器不提供某项值时，apk.js 会回退到固定默认值，保证应用仍能启动。
