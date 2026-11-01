# 架构

apk.js 分层组织，每一层把更窄的数据交给下一层。

```
APK zip
  └── 解析层        dex/、res/     字节 → 类、资源、布局
        └── 运行时  runtime/       DEX → JavaVM、对象、解释器
              └── Framework        Java API 调用 → 视图树和像素
                    └── 引擎       生命周期、屏幕、输入
```

## 分层

| 层 | 目录 | 职责 |
| --- | --- | --- |
| 解析层 | `src/dex`、`src/res` | 读取二进制格式：DEX、AXML、ARSC |
| 运行时 | `src/runtime` | 类注册表、值模型、字节码解释器 |
| Framework | `src/framework` | 用 Canvas 和 JavaScript 实现的 Android API |
| 入口 | `apk.js` | 公开 API、设备设置、文件加载 |

## 运行时

`JavaVM` 持有类注册表、解释器、堆和方法栈。值都是带描述符的 JavaScript 对象：实例用 `JavaObject`，数组用 `JavaArray`，基本类型直接用数字或字符串。

`DexInterpreter` 遍历字节码，每帧维护一个寄存器文件。方法调用会转回 VM，VM 先查 native 定义，再查 DEX 类。

## Framework

Framework 是一组 native 类定义。每个定义用 JavaScript 和 Canvas 2D API 实现 Android 类的一部分。`View` 保存几何、布局参数和绘制方法；`ViewGroup` 额外负责测量和排布子视图。

引擎把 Framework 接到 canvas 上：创建初始 Activity、驱动 `onCreate`、推进 choreographer 循环，并把指针事件分派到视图树。

## 引擎

`EmulatorEngine.start(apk)` 会准备好 VM、注册 native 类、填充虚拟文件系统、安装传感器源，然后启动 launcher Activity。`attachCanvas` 绑定用于渲染和输入的 canvas。

屏幕记录脏状态。视图调用 `invalidate` 时，引擎把屏幕标记为脏，在下一帧重绘。
