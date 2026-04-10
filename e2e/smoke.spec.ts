import { test, expect } from "@playwright/test";

test.describe("Pathfinder Nexus — Smoke Test", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.service).toBe("pathfinder-nexus");
  });

  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    // Wait for Next.js hydration
    await page.waitForLoadState("networkidle");
    // Check for core text content that exists in all deployed versions
    await expect(page.getByText("Select Pathfinder Edition")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Pathfinder 1e")).toBeVisible();
    await expect(page.getByText("Pathfinder 2e")).toBeVisible();
  });

  test("story DNA sliders render", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Story DNA")).toBeVisible({ timeout: 15_000 });
  });

  test("full resolve flow works end-to-end", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const textarea = page.getByTestId("player-input-textarea");
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill("I swing my longsword at the goblin");
    await page.getByTestId("player-input-modifier").fill("5");
    await page.getByTestId("player-input-dc").fill("15");

    await page.getByTestId("player-input-resolve-button").click();

    // LLM call — generous timeout for cold starts + inference
    const result = page.getByTestId("player-input-result");
    await expect(result).toBeVisible({ timeout: 90_000 });

    // Audit-the-math breakdown should be present
    const audit = page.getByTestId("player-input-audit");
    await expect(audit).toBeVisible();
    const auditText = await audit.textContent();
    expect(auditText!.length).toBeGreaterThan(0);

    // Session log should appear
    await expect(page.getByTestId("session-log")).toBeVisible();
    await expect(page.getByTestId("session-id-display")).toBeVisible();
  });

  test("narrate scene works after resolve", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Resolve first to create a session
    const textarea = page.getByTestId("player-input-textarea");
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill("I search for traps");
    await page.getByTestId("player-input-resolve-button").click();
    await expect(page.getByTestId("player-input-result")).toBeVisible({
      timeout: 90_000,
    });

    // Narrate
    await page.getByTestId("player-input-narrate-button").click();

    // Wait for a narration turn in the session log
    const narration = page
      .locator("[data-testid^='session-turn-']")
      .filter({ hasText: "Narration" });
    await expect(narration.first()).toBeVisible({ timeout: 90_000 });
  });
});
