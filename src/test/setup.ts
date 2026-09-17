import "@testing-library/jest-dom";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverMock, writable: true });
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: () => null, writable: true });
Object.defineProperty(window, "scrollTo", { value: () => undefined, writable: true });
