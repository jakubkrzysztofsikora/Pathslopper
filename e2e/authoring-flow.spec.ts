import { test, expect } from "@playwright/test";

/**
 * E2E spec: authoring flow — wizard → generate → graph editor.
 *
 * These tests cover the full GM authoring journey from session creation
 * through graph approval. They require a running dev server with a real
 * LLM_API_KEY and REDIS_URL configured.
 */

test.describe("Authoring flow", () => {
  test.skip(
    true,
    "Stub — requires live dev server with LLM_API_KEY and REDIS_URL"
  );

  test("wizard creates a session and navigates to the session page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("wizard-next-0").click();
    await page.getByTestId("wizard-preset-classic").click();
    await page.getByTestId("wizard-next-1").click();
    await page.getByTestId("wizard-duration").fill("4");
    await page.getByTestId("wizard-tone").fill("heroic adventure");
    await page.getByTestId("wizard-setting").fill("Ancient ruins near Absalom");
    await page.getByTestId("wizard-next-2").click();
    await page.getByTestId("wizard-skip-3").click();
    await page.getByTestId("wizard-finish").click();
    await expect(page).toHaveURL(/\/sesja\/[A-Za-z0-9_-]+/);
  });

  test("authoring shell loads and shows the graph canvas", async ({ page }) => {
    // Navigate to an existing authoring session
    await page.goto("/sesja/test-session-id/przygotowanie");
    await expect(page.locator(".react-flow__renderer")).toBeVisible();
  });

  test("can switch to edit mode and save draft", async ({ page }) => {
    await page.goto("/sesja/test-session-id/przygotowanie");
    await page.getByText("Tryb edycji").click();
    await page.getByText("Zapisz szkic").click();
    await expect(page.getByText("OK")).toBeVisible();
  });
});
