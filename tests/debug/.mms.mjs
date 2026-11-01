globalThis.__DBG_ARG = 1;
await import('/workspace/.dump3.mjs');
console.error('MMS=' + JSON.stringify(globalThis.__MMS?.slice(0, 12)));
