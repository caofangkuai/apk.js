# Testing

## Regression suite

```bash
# Load the sample APK and simulate taps
npm test

# Verify the APK parse result
npm run check

# Both
npm run test:all
```

`npm test` parses `samples/hello-dex.apk`, builds the view tree, then simulates a counter tap, focusing the editor and echoing keyboard input, dynamic view insertion, progress advancement, a shape-backed button tap, reading `Build` info, a reflection call, and a `startActivity` jump to a second activity with argument checks. It asserts that each callback fired.

## Visual checks

`npm run render -- <apk>` writes a PNG into `image-debug/`. That directory holds reference renders of real apps, useful when comparing framework changes side by side.

## Debug scripts

`tests/debug/` holds roughly 400 exploratory scripts from development. They open specific internals, print intermediate state, and generally assume a particular APK. They are not part of the suite and will be pruned over time.

## Debug switches

Some debug output is gated behind environment variables or global flags:

| Switch | Effect |
| --- | --- |
| `DBG_INV` | Trace method invocations |
| `DBG_CAST` | Trace type cast failures |
| `DBG_LP` | Trace layout params resolution |
| `__DBG_NPE_RV` | Trace RecyclerView null dereferences |

These are stripped to `false` in production builds.
