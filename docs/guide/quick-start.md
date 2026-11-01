# Quick start

## Requirements

Node.js 18 or newer. The demo runs in any modern browser.

## Install and build

```bash
# Install dependencies
npm install

# Bundle into dist/
npm run build

# Serve the static site
npm run serve
```

Open `http://localhost:8080`. Click **Choose APK** or drop an APK file on the page.

## Try the sample

The repository ships `samples/hello-dex.apk`, a small app that exercises most framework features. Download it from the demo page or load it directly:

```js
await sim.loadFromUrl('https://caofangkuai.github.io/apk.js/samples/hello-dex.apk');
```

## Render a real APK to an image

`tools/render-apk.mjs` boots a node-canvas surface, runs the APK, and saves a PNG:

```bash
# Renders into image-debug/my-app.png
npm run render -- /path/to/app.apk my-app
```

Set `RENDER_WIDTH`, `RENDER_HEIGHT` or `RENDER_DENSITY` to change the output size.

## Development build

```bash
npm run build:dev
```

This produces an unminified bundle with source maps.
