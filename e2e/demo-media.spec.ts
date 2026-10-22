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

/** Fill the data-tab filter bar with several rules and apply. */
async function applyManyFilters(page: import("@playwright/test").Page) {
  const filterBar = page.locator(".border-b.border-border.bg-card\\/40");
  await expect(filterBar.getByPlaceholder("Enter Value").first()).toBeVisible();

  // Row 0: name like %a%
  let selects = filterBar.locator("select");
  await selects.nth(0).selectOption({ label: "name" });
  await selects.nth(1).selectOption({ label: "like" });
  await filterBar.getByPlaceholder("Enter Value").nth(0).fill("%a%");

  await page.getByTitle("Add filter").click();
  await page.getByTitle("Add filter").click();
  await page.getByTitle("Add filter").click();

  selects = filterBar.locator("select");
  const values = filterBar.getByPlaceholder("Enter Value");

  // Row 1: id gte 1
  await selects.nth(2).selectOption({ label: "id" });
  await selects.nth(3).selectOption({ label: "gte" });
  await values.nth(1).fill("1");

  // Row 2: id not equals 0
  await selects.nth(4).selectOption({ label: "id" });
  await selects.nth(5).selectOption({ label: "not equals" });
  await values.nth(2).fill("0");

  // Row 3: name not null (no value input)
  await selects.nth(6).selectOption({ label: "name" });
  await selects.nth(7).selectOption({ label: "not null" });

  await page.getByTitle("Toggle AND / OR").first().click();
  await page.getByTitle("Apply filters").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
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

  // Filtered table view (many filters) + JSON view
  await page.getByTestId("schema-open-users").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
  await applyManyFilters(page);
  await page.waitForTimeout(400);
  await shot(page, "06-filtered-data.png");

  await page.getByRole("button", { name: /^JSON$/i }).click();
  await expect(page.getByTestId("json-result-view")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "07-json-view.png");
});
