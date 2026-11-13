/**
 * apk.js 核心引擎入口。
 *
 * 这里只放与 Android Framework 无关的部分：
 * - DEX 解析与解释执行（src/dex、src/runtime）
 * - AXML / ARSC 资源解析（src/res）
 * - APK 文件装载（src/core/apk-file.js）
 * - 方法拦截运行时的数据层（src/runtime/xposed.js）
 *
 * Java/Android 宿主类模拟与 ApkSimulator 门面在 android-framework.js 里，
 * 浏览器产物分别是 dist/apk.min.js 与 dist/android-framework.min.js
 * （后者依赖前者，需要先加载核心引擎）。
 */
export { loadApkFiles } from './src/core/apk-file.js';
export { DexFile, descriptorToName, nameToDescriptor, descriptorToJavaType } from './src/dex/dexfile.js';
export { ResourceTable } from './src/res/arsc.js';
export { parseBinaryXml } from './src/res/axml.js';
export { JavaVM } from './src/runtime/vm.js';
export { DexInterpreter } from './src/runtime/interpreter.js';
export { ClassRegistry, NativeClassDef, RuntimeClass } from './src/runtime/class-registry.js';
export {
  JavaArray,
  JavaObject,
  defaultValueFor,
  isJavaObject,
  isJavaArray,
  isObjectType,
} from './src/runtime/values.js';
export { HookBus, createHookBus } from './src/runtime/hooks.js';
export {
  XposedRuntime,
  XposedBridge,
  XposedHelpers,
  XC_MethodHook,
  MethodHookParam,
  XposedMethodInfo,
  XposedClassInfo,
  Unhook,
  UnhookSet,
  parseProtoDescriptor,
  typeToDescriptor,
  resolveClassDescriptor,
  listDeclaredMethods,
  fieldDescriptorOf,
} from './src/runtime/xposed.js';
