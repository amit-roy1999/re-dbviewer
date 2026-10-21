import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

test("File → New Query Tab", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("menubar-file").click();
  await page.getByRole("menuitem", { name: /New Query Tab/i }).click();
  await expect(page.getByTestId("sql-editor")).toBeVisible();
});

test("File → Preferences opens dialog", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("menubar-file").click();
  await page.getByRole("menuitem", { name: /Preferences/i }).click();
  await expect(page.getByLabel("Preferences")).toBeVisible();
});

test("View → Keyboard shortcuts", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("menubar-view").click();
  await page.getByRole("menuitem", { name: /Keyboard shortcuts/i }).click();
  await expect(page.getByText(/shortcut/i).first()).toBeVisible();
});

test("View → Toggle theme", async ({ page }) => {
  await openDemoWorkspace(page);
  const before = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.getByTestId("menubar-view").click();
  await page.getByRole("menuitem", { name: /Toggle theme/i }).click();
  const after = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  expect(after).not.toBe(before);
});
