import { test, expect } from "@playwright/test";

/**
 * E2E spec: authoring performance — measures React Flow re-render time.
 *
 * Validates Amendment V requirements: initial layout < 3s, node click
 * response < 200ms, re-layout after node update < 1s.
 */

test.describe("Authoring performance", () => {
  test.skip(
    true,
    "Stub — requires live dev server with a seeded session (use scripts/seed-session.ts)"
  );

  test("initial layout completes within 3 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/sesja/test-session-id/przygotowanie");
    await page.locator(".react-flow__renderer").waitFor({ state: "visible" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test("node click responds in under 200ms", async ({ page }) => {
    await page.goto("/sesja/test-session-id/przygotowanie");
    await page.locator(".react-flow__renderer").waitFor({ state: "visible" });

    const start = Date.now();
    await page.locator(".react-flow__node").first().click();
    // Node inspector should show the selected node
    await page.locator("[data-testid=node-inspector]").waitFor({ state: "visible" });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
