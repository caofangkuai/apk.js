# 简介

apk.js 用纯 JavaScript 在浏览器里运行 Android APK。它读取 APK、执行应用字节码，再把生成的界面画到 Canvas 上，不需要设备、模拟器或原生库。

## 工作原理

APK 是一个 zip 包，apk.js 从中取出五类内容：

1. `classes.dex`：应用字节码，交给 DEX 解释器执行。
2. `AndroidManifest.xml`：二进制 AXML，描述包名、Activity 和主题。
3. `resources.arsc`：资源表，把资源 ID 解析成字符串、颜色和文件路径。
4. `res/` 下的文件：布局和可绘制资源，同样是二进制 AXML。
5. `assets/` 下的文件：应用资源，通过运行时提供。

解释器遇到 Android API 调用时，会转交给 Canvas 支撑的 Framework 实现。应用调用 `setContentView`、加载布局或测量视图时，这些调用都落在 Framework 子集里，由它决定如何画到 canvas 上。

## 能跑什么

项目面向中小型 Java/Kotlin 应用。示例 `hello-dex.apk` 涵盖计数、文本输入、动态视图、进度条、形状背景、`Build` 信息、反射和多 Activity 跳转。

真实应用也能跑。`image-debug/devinfo.png` 就是一个硬件信息应用经过解释器后的渲染结果。

## 下一步

- [快速开始](/zh/guide/quick-start)：先把演示跑起来。
- [嵌入页面](/zh/guide/embedding)：把模拟器放进你自己的页面。
- [架构](/zh/internals/architecture)：各部分如何配合。
