# Methods

## Loading

| Method | Returns | Description |
| --- | --- | --- |
| `loadFromFile(file)` | `Promise<this>` | Load from a `File` object |
| `loadFromUrl(url, options?)` | `Promise<this>` | Download with `fetch`, then load |
| `loadFromArrayBuffer(buffer)` | `Promise<this>` | Load from raw bytes |
| `loadFromZip(zip)` | `Promise<this>` | Load from a JSZip instance |

All four reject if the file is not a valid APK, contains native libraries, or exceeds the size limit.

## Lifecycle

| Method | Returns | Description |
| --- | --- | --- |
| `setDevice(device)` | `this` | Merge device overrides and apply the new size |
| `stop()` | `this` | Stop the engine, keep the canvas |
| `destroy()` | `this` | Stop and remove the canvas from its host |

## Properties

| Property | Type | Description |
| --- | --- | --- |
| `vm` | `JavaVM \| null` | Current VM instance, read-only |
| `canvas` | `HTMLCanvasElement \| null` | The canvas in use |
| `running` | `boolean` | Whether an activity is running |
| `device` | object | Effective device configuration |

## Example

```js
const sim = createSimulator({ element: '#screen' });

await sim.loadFromUrl('https://caofangkuai.github.io/apk.js/samples/hello-dex.apk');
console.log(sim.vm?.packageName);

sim.setDevice({ width: 280, height: 480 });
sim.destroy();
```
