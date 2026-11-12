# Embedding

`dist/apk.min.js` exports `createSimulator` and `ApkSimulator`. Load JSZip first, then the bundle.

```html
<script src="https://caofangkuai.github.io/apk.js/vendor/jszip.min.js"></script>
<script type="module">
  import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/apk.min.js';

  const sim = createSimulator({
    element: '#phone-screen',
    device: {
      width: 360,
      height: 640,
      dpr: window.devicePixelRatio || 1,
      style: 'material',
      maxApkSize: Infinity,
    },
    onLog: (entry) => console.log(`[${entry.level}] ${entry.tag}: ${entry.message}`),
    onFinished: () => console.log('Activity finished'),
    onError: (error) => console.error(error),
  });

  await sim.loadFromFile(file);
</script>
```

## Loading sources

`ApkSimulator` accepts four input shapes:

| Method | Input |
| --- | --- |
| `loadFromFile(file)` | A browser `File`, typically from `<input type="file">` or a drop event |
| `loadFromUrl(url, options)` | A URL, downloaded with `fetch` |
| `loadFromArrayBuffer(buffer)` | Raw bytes |
| `loadFromZip(zip)` | An unpacked JSZip instance |

## Render target

Pass either `element` or `canvas`.

- `element` accepts a CSS selector or a DOM node. A canvas is created and appended to it.
- `canvas` takes an existing `<canvas>` and wins over `element` when both are set.

## Resize while running

```js
sim.setDevice({ width: 280, height: 480 });
```

The canvas CSS size and the engine resolution both update.

## Cleanup

```js
sim.stop();     // Stop execution, keep the canvas
sim.destroy();  // Stop and remove the canvas from its host
```

## Accessing the VM

`sim.vm` returns the current `JavaVM`. It is read-only and useful for inspecting the running activity, resource table or class registry during development.
