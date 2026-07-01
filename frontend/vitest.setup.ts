// Vitest runs in the Node environment, but several feature modules attach
// helpers to `window` at module-load time (e.g. validator-rules.ts does
// `Object.assign(window, …)`). Stub a global `window` so importing those
// modules in a unit test doesn't throw `window is not defined`.
(globalThis as any).window ??= globalThis;
