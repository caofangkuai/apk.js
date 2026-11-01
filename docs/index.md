---
layout: home

hero:
  name: apk.js
  text: Run Android APKs in the browser
  tagline: Parse DEX, interpret bytecode, paint the UI on Canvas — all in plain JavaScript.
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: Introduction
      link: /guide/introduction

features:
  - title: Pure frontend
    details: Unpacking, parsing, execution and rendering all run inside the browser. No backend, no device, no emulator.
  - title: DEX interpreter
    details: Executes Dalvik bytecode with exception handling, switch, arrays, fields and method dispatch.
  - title: Canvas framework
    details: A growing subset of the Android Framework renders Activity, View, layout, widgets, drawables and themes.
  - title: Resource fidelity
    details: Reads binary AndroidManifest.xml and resources.arsc directly, so themes and strings come from the APK itself.
  - title: Small API surface
    details: createSimulator gives you device sizing, file loading and log callbacks. Drop it on any static page.
  - title: Debug renders
    details: tools/render-apk.mjs runs a real APK through node-canvas and writes a PNG for visual comparison.
---
