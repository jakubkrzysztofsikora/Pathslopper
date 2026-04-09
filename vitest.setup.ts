// jsdom does not implement ResizeObserver and leaves several Element
// pointer-capture helpers undefined. Radix UI primitives (Slider,
// ToggleGroup) call these on mount via use-size / collection hooks.
// Provide minimal no-op shims so component tests can render.

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// Radix Slider also touches hasPointerCapture / releasePointerCapture and
// scrollIntoView on jsdom elements during pointer interaction tests.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function () {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }
}
