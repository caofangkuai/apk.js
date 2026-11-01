# DEX 解释器

## 文件结构

DEX 文件由一个头和若干张表组成：字符串、类型、原型、字段、方法和类定义。apk.js 一次读完所有表，保留可按索引访问的数组。多 dex 的 APK（`classes2.dex`、`classes3.dex` 等）会加载到同一个类注册表，跨 dex 的引用能够正常解析。

## 字节码执行

`DexInterpreter.execute` 按方法的 `registersSize` 分配寄存器文件，把参数复制到尾部，再用程序计数器遍历指令流。

指令按 8 位 opcode 解码。调用指令（`0x6e`–`0x78`）读出参数寄存器、解析方法引用，把调用交给 `JavaVM.invoke`。返回值放进 `pendingResult`，由下一条 `move-result` 取走。

## 方法解析

`JavaVM.invoke` 的解析顺序：

1. 类上注册的 native 定义，即 Framework 和 Java 核心类。
2. 解析到的类上的 DEX 方法，沿父类链向上查找。
3. `invoke-interface` 对应的接口方法。

调用未实现的 native 方法会抛 `VMRuntimeError`，再转成应用可以捕获的 Java 异常。

## 异常

处理器来自方法的 catch 表。调用抛错时，解释器在当前 PC 上查表找匹配的处理器，把 PC 移到处理器入口，并把异常对象写进处理器的寄存器。没有匹配项时，异常沿栈向上传播。

## 字段访问

字段通过类注册表解析。实例字段存在每个对象的映射里，键为 `classDesc->name:type`；继承字段沿类链查找。静态字段挂在运行时类上，只初始化一次。
