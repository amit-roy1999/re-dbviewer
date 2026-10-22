/**
 * Captures README demo stills into docs/media/.
 * Run: npx playwright test e2e/demo-media.spec.ts
 * Not part of CI (filename matched only when invoked explicitly).
 */
import { test, expect } from "./fixtures";
import { openDemoWorkspace, openTableMenu } from "./helpers";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "media",
);

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({
    path: path.join(MEDIA, name),
    type: "png",
  });
}

test.describe.configure({ mode: "serial" });

test("capture demo media for README", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await shot(page, "01-home.png");

  await openDemoWorkspace(page);
  await page.getByTestId("schema-open-users").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
  await shot(page, "02-data-grid.png");

  await page.getByTestId("menubar-tools").click();
  await page.getByRole("menuitem", { name: /Visual Query Builder/i }).click();
  await expect(page.getByTestId("visual-query-builder")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "03-visual-query-builder.png");

  await page.keyboard.press("Escape").catch(() => {});
  await page.getByTestId("menubar-tools").click();
  await page.getByRole("menuitem", { name: /Visualize Data/i }).click();
  await expect(page.getByTestId("visualize-data")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "04-visualize-data.png");

  await page.keyboard.press("Escape").catch(() => {});
  await openTableMenu(page, "orders");
  await page.getByRole("menuitem", { name: "View Structure" }).click();
  await page.getByRole("button", { name: /^Relations$/i }).click();
  await expect(page.getByTestId("relation-query-builder")).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(600);
  await shot(page, "05-relation-builder.png");

  await page.getByTestId("menubar-view").click();
  await page.getByRole("menuitem", { name: /Search Data/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "06-search-data.png");
});
