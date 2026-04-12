import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "@/tests/msw/server";

// ---------------------------------------------------------------------------
// MSW server lifecycle — intercepts fetch in vitest (node environment)
// ---------------------------------------------------------------------------

beforeAll(() =>
  server.listen({
    // Fail tests on any unhandled request except known Next.js internals.
    // /_next/* and /favicon.ico are handled as passthroughs in handlers.ts.
    onUnhandledRequest: (request) => {
      // Allow next-internal RSC/static requests silently
      if (
        request.url.includes("/_next/") ||
        request.url.includes("/favicon")
      ) {
        return;
      }
      console.warn(`[MSW] Unhandled request: ${request.method} ${request.url}`);
    },
  })
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// localStorage shim — jsdom's localStorage.clear() may be unimplemented in
// some dependency configurations (broke after inkjs dep-tree addition).
// Provide a full in-memory shim so session-bookmarks tests can run.
// ---------------------------------------------------------------------------

class LocalStorageShim implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

// Replace jsdom localStorage with our shim only if the native one is broken.
// We detect this by checking whether clear() is a real function.
try {
  const testKey = "__shim_test__";
  window.localStorage.setItem(testKey, "1");
  window.localStorage.clear();
  // If clear() didn't actually remove the item, replace with shim
  if (window.localStorage.getItem(testKey) !== null) {
    throw new Error("clear() is broken");
  }
} catch {
  Object.defineProperty(window, "localStorage", {
    value: new LocalStorageShim(),
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// jsdom does not implement ResizeObserver and leaves several Element
// pointer-capture helpers undefined. Radix UI primitives (Slider,
// ToggleGroup) call these on mount via use-size / collection hooks.
// Provide minimal no-op shims so component tests can render.
// ---------------------------------------------------------------------------

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
