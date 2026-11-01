# Introduction

apk.js runs Android APKs in the browser with plain JavaScript. It reads an APK, executes the application bytecode, and draws the resulting UI on a Canvas. There is no device, emulator or native library involved.

## How it works

An APK is a zip archive. apk.js pulls five things out of it:

1. `classes.dex` — application bytecode, executed by the DEX interpreter.
2. `AndroidManifest.xml` — binary AXML, describing the package, activities and theme.
3. `resources.arsc` — the resource table, resolving IDs to strings, colors and file paths.
4. `res/` files — layouts and drawables, also binary AXML.
5. `assets/` files — application assets, served through the runtime.

The interpreter calls into a Canvas-backed implementation of the Android Framework. When the app calls `setContentView`, inflates a layout or measures a view, that call lands in the framework subset, which knows how to paint to a canvas.

## What it supports

The project targets small and medium Java/Kotlin apps. The sample `hello-dex.apk` exercises counters, text input, dynamic views, progress bars, shape drawables, `Build` info, reflection and multi-activity navigation.

Real apps work too. `image-debug/devinfo.png` is a render of a hardware-info app running through the interpreter.

## Where to go next

- [Quick start](/guide/quick-start) — get the demo running.
- [Embedding](/guide/embedding) — put a simulator on your own page.
- [Architecture](/internals/architecture) — how the pieces fit together.
