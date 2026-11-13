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

## Static checks

```bash
npm run check:refs        # forbidden class references
npm run check:duplicates  # duplicated native class registrations
npm run check:shadowing   # instance fields that shadow prototype methods
npm run check:coverage    # framework coverage table is up to date
```

`check:shadowing` exists because JavaScript never complains when a constructor assigns an instance field with the same name as a prototype method: the field silently wins and the method becomes uncallable. Host fields therefore use a `$` prefix, for example `$layoutRequested`.

## Visual checks

`npm run render -- <apk>` writes a PNG into `image-debug/`. That directory holds reference renders of real apps, useful when comparing framework changes side by side.

## Profiling

`npm run profile:apk -- <apk>` wraps `vm.invoke` from the moment the VM is created and reports per-method call counts plus inclusive time (own time plus everything it called, so nested calls add up):

```bash
PROFILE_FRAMES=60 npm run profile:apk -- /path/to/app.apk 20
```

The output has two tables — every method (DEX + host) and host `android.*` / `java.*` implementations only — both sorted by inclusive time. Cross-read it with the call count: a high count with a high share is a real hot spot, while one huge entry is usually a layout or draw entry point that simply contains everything else.

## Debug scripts

`tests/debug/` holds roughly 400 exploratory scripts from development. They open specific internals, print intermediate state, and generally assume a particular APK. They are not part of the suite and will be pruned over time.

## Debug switches

Some debug output is gated behind environment variables or global flags:

| Switch | Effect |
| --- | --- |
| `DBG_INV` | Trace method invocations |
| `DBG_CAST` | Trace type cast failures |
| `DBG_LP` | Trace layout params resolution |
| `DBG_INVSTATS` | Collect per-method invocation counts into `vm._invokeStats` (off by default, it costs about 30% per call) |
| `__DBG_NPE_RV` | Trace RecyclerView null dereferences |

These are stripped to `false` in production builds.
