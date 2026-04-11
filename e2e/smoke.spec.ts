import { test, expect } from "@playwright/test";
import { pl } from "../src/lib/i18n/pl";

/**
 * Player-UX smoke suite.
 *
 * The app is single-locale pl-PL. These tests assert on Polish strings
 * imported directly from the dictionary so they never drift from UI copy.
 * Live LLM calls get a generous 90s timeout (configured in
 * playwright.config.ts) but assertions only check that the UI responded,
 * never the exact Polish wording of the LLM output.
 */

test.describe("Pathfinder Nexus — Smoke", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.service).toBe("pathfinder-nexus");
  });

  test("home page renders hero, nav, and CTA to new session", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("onboarding-hero")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("hero-cta-new-session")).toBeVisible();
    await expect(
      page.getByRole("link", { name: pl.nav.newSession }).first()
    ).toBeVisible();
    await expect(page.getByText(pl.home.stepsHeading)).toBeVisible();
  });

  test("new-session wizard renders all four step indicators", async ({ page }) => {
    await page.goto("/sesja/nowa");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("new-session-wizard")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("wizard-step-indicator-0")).toBeVisible();
    await expect(page.getByTestId("wizard-step-indicator-3")).toBeVisible();
    await expect(page.getByText(pl.wizard.versionHeading)).toBeVisible();
  });

  test("full wizard → active session → resolve flow works end-to-end", async ({
    page,
  }) => {
    // 1. Start on the hub.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("hero-cta-new-session").click();

    // 2. Wizard step 0 — pick version (pf2e default is fine), advance.
    await expect(page.getByTestId("wizard-step-0")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("wizard-next-0").click();

    // 3. Wizard step 1 — pick the classic preset and advance.
    await expect(page.getByTestId("wizard-step-1")).toBeVisible();
    await page.getByTestId("wizard-preset-classic").click();
    await page.getByTestId("wizard-next-1").click();

    // 4. Wizard step 2 — skip character upload.
    await expect(page.getByTestId("wizard-step-2")).toBeVisible();
    await page.getByTestId("wizard-skip-2").click();

    // 5. Wizard step 3 — summary, finish.
    await expect(page.getByTestId("wizard-step-3")).toBeVisible();
    await page.getByTestId("wizard-finish").click();

    // 6. Landed on /sesja/[id]. Session header + player console should
    //    render without waiting for an LLM call.
    await expect(page.getByTestId("session-page")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("session-header")).toBeVisible();

    // 7. Resolve a real action against the live backend. Generous timeout
    //    because this hits the LLM.
    const textarea = page.getByTestId("player-input-textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("Atakuję goblina długim mieczem.");
    await page.getByTestId("player-input-modifier").fill("5");
    await page.getByTestId("player-input-dc").fill("15");
    await page.getByTestId("player-input-resolve-button").click();

    const result = page.getByTestId("player-input-result");
    await expect(result).toBeVisible({ timeout: 90_000 });
    const audit = page.getByTestId("player-input-audit");
    await expect(audit).toBeVisible();
    const auditText = await audit.textContent();
    expect(auditText && auditText.length).toBeGreaterThan(0);

    await expect(page.getByTestId("session-log")).toBeVisible();
    await expect(page.getByTestId("session-id-display")).toBeVisible();
  });

  test("created session appears on the hub and rehydrates on click", async ({
    page,
  }) => {
    // Create a session via the wizard.
    await page.goto("/sesja/nowa");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("wizard-next-0").click();
    await page.getByTestId("wizard-preset-classic").click();
    await page.getByTestId("wizard-next-1").click();
    await page.getByTestId("wizard-skip-2").click();
    await page.getByTestId("wizard-finish").click();
    await expect(page.getByTestId("session-page")).toBeVisible({
      timeout: 15_000,
    });

    // Go back to the hub — the bookmark should have rendered as a card.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("session-list")).toBeVisible();
    const firstCard = page.getByTestId("session-card").first();
    await expect(firstCard).toBeVisible();

    // Clicking the card rehydrates the active session.
    await firstCard.getByTestId("session-card-open").click();
    await expect(page.getByTestId("session-page")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("expired session screen renders for a bogus session id", async ({
    page,
  }) => {
    // Seed localStorage so the bookmark exists locally even though the
    // server never saw this id. The expired screen handles the 404.
    await page.goto("/");
    await page.evaluate(() => {
      const bogus = {
        id: "bogus_999_not_real_abc",
        name: "Wygasła sesja",
        version: "pf2e",
        createdAt: "2026-04-11T12:00:00.000Z",
        lastOpenedAt: "2026-04-11T12:00:00.000Z",
        storyDnaSnapshot: {
          version: "pf2e",
          sliders: { narrativePacing: 50, tacticalLethality: 50, npcImprov: 50 },
          tags: { include: [], exclude: [] },
        },
      };
      window.localStorage.setItem("pfnexus:bookmarks", JSON.stringify([bogus]));
    });

    await page.goto("/sesja/bogus_999_not_real_abc");
    await expect(page.getByTestId("expired-session-screen")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("expired-new-session")).toBeVisible();
  });

  test("help page renders four guide cards in Polish", async ({ page }) => {
    await page.goto("/pomoc");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("help-page")).toBeVisible();
    await expect(page.getByText(pl.help.sectionDnaTitle)).toBeVisible();
    await expect(page.getByText(pl.help.sectionDegreesTitle)).toBeVisible();
    await expect(page.getByText(pl.help.sectionMgTitle)).toBeVisible();
    await expect(page.getByText(pl.help.sectionSessionsTitle)).toBeVisible();
  });
});
