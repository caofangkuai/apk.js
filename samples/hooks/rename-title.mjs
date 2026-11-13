/**
 * 示例 hook：把示例应用的标题文案加前缀，验证 Xposed 拦截链路。
 * 用法：node tools/hook-apk.mjs samples/hello-dex.apk samples/hooks/rename-title.mjs demo-hooked
 */
export default function ({ bridge, log }) {
  bridge.hookAllMethods('android.widget.TextView', 'setText', {
    beforeHookedMethod(param) {
      const value = param.args[0];
      if (typeof value !== 'string') return;
      log('setText(' + value + ')');
      if (value === 'Hello World') param.args[0] = '[hook] Hello World';
    },
  });
}
