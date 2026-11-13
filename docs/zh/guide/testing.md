# 测试

## 回归测试

```bash
# 加载示例 APK 并模拟点击
npm test

# 校验 APK 解析结果
npm run check

# 两项一起跑
npm run test:all
```

`npm test` 会解析 `samples/hello-dex.apk`、构建 View 树，然后依次模拟：点击计数按钮、聚焦编辑框并回显键盘输入、动态添加视图、推进进度条、点击形状背景按钮、读取 `Build` 信息、执行一次反射调用、`startActivity` 跳到第二个 Activity 并校验传参，最后断言每个回调都触发了。

## 静态检查

```bash
npm run check:refs        # 禁用类名引用
npm run check:duplicates  # native 类重复注册
npm run check:shadowing   # 实例属性遮蔽同名方法
npm run check:coverage    # Framework 覆盖表是否最新
```

`check:shadowing` 针对的是 JS 不会报错的一类问题：构造函数给实例赋了与原型方法同名的字段，字段会悄悄地覆盖方法，调用方拿到的是值而不是函数。所以宿主字段统一用 `$` 前缀，例如 `$layoutRequested`。

## 视觉检查

`npm run render -- <apk>` 会把 PNG 写进 `image-debug/`。这个目录里放着真实应用的参考出图，改动 Framework 后可以并排对照。

## 性能剖析

`npm run profile:apk -- <apk>` 会在 VM 创建的那一刻给 `vm.invoke` 加上计时，输出每个方法的调用次数与包含子调用的耗时（嵌套调用会重复累加）：

```bash
PROFILE_FRAMES=60 npm run profile:apk -- /path/to/app.apk 20
```

输出分两张表——全部方法（DEX + 宿主）与仅宿主 `android.*` / `java.*` 实现——都按耗时排序。要和调用次数一起看：次数高、占比也高才是真热点；单项占比特别大的通常是 layout/draw 入口，它本来就包含了所有子调用。

## 调试脚本

`tests/debug/` 下有约 400 个开发期探索脚本。它们会打开特定内部结构、打印中间状态，通常假定某个特定 APK。这些脚本不属于测试套件，后续会逐步清理。

## 调试开关

部分调试输出由环境变量或全局开关控制：

| 开关 | 作用 |
| --- | --- |
| `DBG_INV` | 跟踪方法调用 |
| `DBG_CAST` | 跟踪类型转换失败 |
| `DBG_LP` | 跟踪布局参数解析 |
| `DBG_INVSTATS` | 把每个方法的调用次数记进 `vm._invokeStats`（默认关闭，开启后单次调用约慢 30%） |
| `__DBG_NPE_RV` | 跟踪 RecyclerView 空引用 |

生产构建里这些开关会固定为 `false`。
