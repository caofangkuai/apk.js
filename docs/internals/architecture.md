# Architecture

apk.js is layered. Each layer hands a narrower representation to the next.

```
APK zip
  └── parser        dex/, res/      bytes → classes, resources, layouts
        └── runtime  runtime/       DEX → JavaVM, objects, interpreter
              └── framework          Java API calls → view tree and pixels
                    └── engine       lifecycle, screen, input
```

## Layers

| Layer | Directory | Responsibility |
| --- | --- | --- |
| Parser | `src/dex`, `src/res` | Read binary formats: DEX, AXML, ARSC |
| Runtime | `src/runtime` | Class registry, value model, bytecode interpreter |
| Framework | `src/framework` | Android API surface backed by Canvas and JavaScript |
| Entry | `apk.js` | Public API, device setup, file loading |

## Runtime

`JavaVM` owns the class registry, the interpreter, the heap and the method stack. Values are JavaScript objects with a descriptor: `JavaObject` for instances, `JavaArray` for arrays, and plain numbers or strings for primitives.

`DexInterpreter` walks bytecode, maintaining a register file per frame. It dispatches method calls back into the VM, which resolves them against native definitions first and then against DEX classes.

## Framework

The framework is a set of native class definitions. Each one implements a slice of an Android class in terms of JavaScript and the Canvas 2D API. A `View` holds geometry, layout params and a draw method; a `ViewGroup` additionally knows how to measure and arrange children.

The engine wires the framework to a canvas: it creates the initial activity, drives `onCreate`, drains the choreographer loop, and routes pointer events into the view tree.

## Engine

`EmulatorEngine.start(apk)` sets up the VM, registers native classes, seeds the virtual filesystem, installs sensor sources, and launches the launcher activity. `attachCanvas` binds a canvas for rendering and input.

The screen tracks dirty state. When a view calls `invalidate`, the engine marks the screen dirty and repaints on the next frame.
