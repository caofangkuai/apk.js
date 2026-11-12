# 限制

## 原生库

含 `lib/` 原生代码的 APK 无法运行。解释器执行 Dalvik 字节码，没有办法加载 `.so` 文件。

## 体积

APK 默认不限制大小；仍受浏览器可用内存约束。

## Framework 覆盖

Framework 只是 Android 的一部分。应用调用未实现的类或方法时，会以日志形式报错，应用可能失败或跳过部分界面。

触及大量系统服务的大型应用经常在 `onStart` 阶段停下。中小型工具类应用通常能跑通。

## 跨应用 Intent

`startActivity` 只解析应用内部的 Activity。启动其他应用会抛 `ActivityNotFoundException`。

## 渲染

演示页面按 360×640 渲染。其他尺寸通过 `device` 选项指定。
