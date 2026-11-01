# Limitations

## Native libraries

APKs with native code under `lib/` cannot run. The interpreter executes Dalvik bytecode; it has no way to load `.so` files.

## Size

The default APK size limit is 50MB. Raise it through `device.maxApkSize` if you need to, keeping in mind that parsing happens in memory.

## Framework coverage

The framework is a subset. When an app calls into an unimplemented class or method, the call surfaces as a log error and the app may fail or skip part of its UI.

Large apps that touch many system services often stop during `onStart`. Smaller utility apps tend to work.

## Cross-app intents

`startActivity` resolves activities inside the same app. Launching another app throws `ActivityNotFoundException`.

## Rendering

The demo renders at 360×640. Other sizes work through the `device` options.
