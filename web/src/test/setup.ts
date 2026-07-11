import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  });
}
