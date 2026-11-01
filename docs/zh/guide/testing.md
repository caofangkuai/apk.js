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

## 视觉检查

`npm run render -- <apk>` 会把 PNG 写进 `image-debug/`。这个目录里放着真实应用的参考出图，改动 Framework 后可以并排对照。

## 调试脚本

`tests/debug/` 下有约 400 个开发期探索脚本。它们会打开特定内部结构、打印中间状态，通常假定某个特定 APK。这些脚本不属于测试套件，后续会逐步清理。

## 调试开关

部分调试输出由环境变量或全局开关控制：

| 开关 | 作用 |
| --- | --- |
| `DBG_INV` | 跟踪方法调用 |
| `DBG_CAST` | 跟踪类型转换失败 |
| `DBG_LP` | 跟踪布局参数解析 |
| `__DBG_NPE_RV` | 跟踪 RecyclerView 空引用 |

生产构建里这些开关会固定为 `false`。
