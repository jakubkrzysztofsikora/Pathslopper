/**
 * Full browser walkthrough — Screenshot every major screen of Pathfinder Nexus.
 * Uses mock=true for graph generation to bypass LLM dependency.
 * Saves PNGs to screenshots/browser-test-2026-04-12/.
 *
 * Run: npx tsx scripts/browser-walkthrough.ts
 */

import { chromium, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const SCREENSHOT_DIR = path.resolve("screenshots/browser-test-2026-04-12");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Clear old screenshots
for (const f of fs.readdirSync(SCREENSHOT_DIR)) {
  fs.unlinkSync(path.join(SCREENSHOT_DIR, f));
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  >> ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pl-PL",
  });
  const page = await context.newPage();

  // ─── 1. Homepage ───────────────────────────────────────────
  console.log("\n=== 1. Homepage ===");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await screenshot(page, "01-homepage");

  // ─── 2. New Session Wizard ─────────────────────────────────
  console.log("\n=== 2. New Session Wizard ===");
  await page.click('[data-testid="hero-cta-new-session"]');
  await page.waitForSelector('[data-testid="new-session-wizard"]');
  await screenshot(page, "02-wizard-step0-version");

  // Step 0 → 1
  await page.click('[data-testid="wizard-next-0"]');
  await page.waitForSelector('[data-testid="wizard-step-1"]');
  await screenshot(page, "03-wizard-step1-style");

  // Step 1 → 2
  await page.click('[data-testid="wizard-preset-classic"]');
  await page.click('[data-testid="wizard-next-1"]');
  await page.waitForSelector('[data-testid="wizard-step-2"]');

  // Fill brief
  await page.fill('[data-testid="wizard-party-size"]', "4");
  await page.fill('[data-testid="wizard-party-level"]', "3");
  await page.fill('[data-testid="wizard-duration"]', "5");
  await page.fill('[data-testid="wizard-tone"]', "mroczna przygoda w podziemiach");
  await page.fill('[data-testid="wizard-setting"]', "Drużyna eksploruje pradawne ruiny pod Absolom, poszukując zaginionego artefaktu Nethysa.");
  await screenshot(page, "04-wizard-step2-brief-filled");

  // Step 2 → 3 (Characters)
  await page.click('[data-testid="wizard-next-2"]');
  await page.waitForSelector('[data-testid="wizard-step-3"]');
  await screenshot(page, "05-wizard-step3-characters");

  // Skip → Step 4 (Summary)
  await page.click('[data-testid="wizard-skip-3"]');
  await page.waitForSelector('[data-testid="wizard-step-4"]');
  await screenshot(page, "06-wizard-step4-summary");

  // ─── 3. Submit session ─────────────────────────────────────
  console.log("\n=== 3. Create Session ===");
  await page.click('[data-testid="wizard-finish"]');
  await page.waitForURL(/\/sesja\//, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await screenshot(page, "07-session-created-brief-phase");

  // Extract session ID from URL
  const sessionUrl = page.url();
  const sessionId = sessionUrl.split("/sesja/")[1]?.split("/")[0]?.split("?")[0];
  console.log(`  Session ID: ${sessionId}`);

  // ─── 4. Trigger mock generation ────────────────────────────
  console.log("\n=== 4. Triggering mock graph generation ===");
  const genRes = await page.evaluate(async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}/generate?mock=true`, {
      method: "POST",
    });
    return res.json();
  }, sessionId);

  console.log(`  Generate response ok: ${genRes.ok}`);
  if (genRes.warnings) console.log(`  Warnings: ${genRes.warnings}`);

  if (!genRes.ok) {
    console.error("  Generation failed:", genRes.error);
    await browser.close();
    process.exit(1);
  }

  // Reload to see authoring phase
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await screenshot(page, "08-after-generate-reload");

  // ─── 5. Authoring UI ──────────────────────────────────────
  const afterGenUrl = page.url();
  console.log(`\n=== 5. Authoring UI === (URL: ${afterGenUrl})`);

  if (afterGenUrl.includes("/przygotowanie")) {
    await page.waitForTimeout(3000); // Let React Flow render
    await screenshot(page, "09-authoring-canvas");

    // Click on a node if any visible
    const nodeElements = page.locator('.react-flow__node');
    const nodeCount = await nodeElements.count();
    console.log(`  Found ${nodeCount} nodes on canvas`);

    if (nodeCount > 0) {
      await nodeElements.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, "10-authoring-node-selected");
    }

    // Take toolbar screenshot
    await screenshot(page, "11-authoring-toolbar");

    // Approve the session
    console.log("  Approving session graph...");
    const approveBtn = page.locator('button').filter({ hasText: /Zatwierdź|Approve/i });
    if (await approveBtn.count() > 0) {
      await approveBtn.first().click();
      await page.waitForTimeout(3000);
      await screenshot(page, "12-after-approve");
    } else {
      // Try via API
      console.log("  Approve button not found, trying API...");
      const approveRes = await page.evaluate(async (sid: string) => {
        const res = await fetch(`/api/sessions/${sid}/approve`, { method: "POST" });
        return res.json();
      }, sessionId);
      console.log(`  Approve API ok: ${approveRes.ok}`);
      if (!approveRes.ok) {
        console.log(`  Approve error: ${approveRes.error}`);
      }
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await screenshot(page, "12-after-approve-api");
    }
  } else {
    console.log("  Not redirected to authoring, current URL:", afterGenUrl);
    // Try navigating directly
    await page.goto(`${BASE_URL}/sesja/${sessionId}/przygotowanie`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await screenshot(page, "09-authoring-canvas-direct");

    // Approve via API
    const approveRes = await page.evaluate(async (sid: string) => {
      const res = await fetch(`/api/sessions/${sid}/approve`, { method: "POST" });
      return res.json();
    }, sessionId);
    console.log(`  Approve API ok: ${approveRes.ok}`);
    await page.waitForTimeout(1000);
  }

  // ─── 6. Play Runtime ──────────────────────────────────────
  console.log("\n=== 6. Play Runtime ===");
  await page.goto(`${BASE_URL}/sesja/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000); // Let autoplay run
  await screenshot(page, "13-play-runtime-initial");

  // Check for narration entries
  const narrationEntries = page.locator('.overflow-y-auto > div > div');
  const entryCount = await narrationEntries.count();
  console.log(`  Narration entries: ${entryCount}`);

  // Try interacting with choices
  for (let turn = 1; turn <= 5; turn++) {
    await page.waitForTimeout(2000);

    // Look for choice buttons (secondary variant, full width, left aligned)
    const choices = page.locator('.border-t button.w-full');
    const choiceCount = await choices.count();

    if (choiceCount > 1) { // More than just the submit button
      console.log(`  Turn ${turn}: Found ${choiceCount} interactive elements`);
      // Click first choice-like button (not submit)
      const firstChoice = choices.first();
      const text = await firstChoice.textContent();
      console.log(`  Clicking: "${text?.slice(0, 50)}"`);
      await firstChoice.click();
      await page.waitForTimeout(3000);
      await screenshot(page, `14-play-turn-${turn}`);
    } else {
      // Try free text
      const textarea = page.locator('textarea');
      if (await textarea.isVisible()) {
        console.log(`  Turn ${turn}: Using free text input`);
        await textarea.fill(`Rozglądam się dookoła i badam ruiny. (tura ${turn})`);
        const submitBtn = page.locator('button[type="submit"]');
        if (await submitBtn.isEnabled()) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          await screenshot(page, `14-play-freetext-${turn}`);
        }
      } else {
        console.log(`  Turn ${turn}: No interactive elements found`);
        await screenshot(page, `14-play-waiting-${turn}`);
      }
    }

    // Check for ending
    const endingTitle = page.locator('text="Koniec sesji"');
    if (await endingTitle.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log("  >> Game ended!");
      await screenshot(page, "15-ending-screen");
      break;
    }
  }

  // Final play state
  await screenshot(page, "16-play-final-state");

  // ─── 7. Homepage with session list ─────────────────────────
  console.log("\n=== 7. Return to Homepage ===");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await screenshot(page, "17-homepage-with-sessions");

  // ─── Done ──────────────────────────────────────────────────
  await browser.close();

  const files = fs.readdirSync(SCREENSHOT_DIR).sort();
  console.log(`\n=== DONE === ${files.length} screenshots saved:`);
  files.forEach((f) => console.log(`  ${f}`));
}

main().catch((err) => {
  console.error("Walkthrough failed:", err);
  process.exit(1);
});
