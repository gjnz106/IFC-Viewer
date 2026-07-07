// Vitest runs in the Node environment, but several feature modules attach
// helpers to `window` at module-load time (e.g. validator-rules.ts does
// `Object.assign(window, …)`). Stub a global `window` so importing those
// modules in a unit test doesn't throw `window is not defined`.
(globalThis as any).window ??= globalThis;

// A few modules also wire a real DOM listener at module scope (e.g.
// compare.ts's "close dropdown when clicking outside" on `document`). This
// project has no jsdom dependency — tests here exercise pure logic, not DOM
// interaction — so stub just enough of `document` for that top-level code to
// run without throwing, not a real DOM.
(globalThis as any).document ??= {
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
