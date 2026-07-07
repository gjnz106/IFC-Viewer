// Vitest runs in the Node environment, but several feature modules attach
// helpers to `window` at module-load time (e.g. validator-rules.ts does
// `Object.assign(window, …)`). Stub a global `window` so importing those
// modules in a unit test doesn't throw `window is not defined`.
(globalThis as any).window ??= globalThis;
// window === globalThis above, so these also cover window.dispatchEvent(...)
// used by modules that broadcast state changes (e.g. lib/units.ts's
// 'ifc:unitschange') — CustomEvent itself is a real Node global already.
(globalThis as any).dispatchEvent ??= () => true;
(globalThis as any).addEventListener ??= () => {};
(globalThis as any).removeEventListener ??= () => {};

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

// Minimal in-memory localStorage — Node has no global localStorage, but
// several *-store.ts glue layers (projects-store, units, snapshots) read/
// write it. Real enough for unit tests to exercise persistence behavior
// (e.g. cycling through a preference) without needing jsdom.
(globalThis as any).localStorage ??= (() => {
  let store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store = new Map(); },
  };
})();
