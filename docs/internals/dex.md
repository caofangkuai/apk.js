# DEX interpreter

## File structure

A DEX file carries a header, then tables for strings, types, prototypes, fields, methods and classes. apk.js reads all of them in one pass and keeps index-addressable arrays. Multi-dex APKs (`classes2.dex`, `classes3.dex`, …) are loaded into a single class registry, so cross-dex references resolve.

## Bytecode execution

`DexInterpreter.execute` allocates a register file sized by the method's `registersSize`, copies parameters into the tail end, and runs a program counter over the instruction stream.

Instructions are decoded by their 8-bit opcode. Invoke instructions (`0x6e`–`0x78`) read their argument registers, resolve the method reference, and hand the call to `JavaVM.invoke`. The result lands in `pendingResult` and the next `move-result` instruction picks it up.

## Method resolution

`JavaVM.invoke` resolves in this order:

1. Native definition registered for the class — framework and Java core classes.
2. DEX method on the resolved class, walking up the superclass chain.
3. Interface methods for `invoke-interface`.

Calls into unimplemented native methods raise a `VMRuntimeError`, which becomes a Java exception the app can catch.

## Exceptions

Handlers come from the method's catch table. When a call throws, the interpreter walks the table for a matching handler at the current PC, moves the PC to the handler, and stores the exception object in the handler's register. If nothing matches, the exception propagates up the stack.

## Field access

Fields resolve through the class registry. Instance fields live in a per-object map keyed by `classDesc->name:type`; inherited fields resolve by walking up the class chain. Static fields live on the runtime class and initialize once.
