import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

test("Command palette opens from keyboard and runs Preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await page.getByTestId("command-palette-input").fill("prefer");
  await expect(page.getByTestId("command-item-file.prefs")).toBeVisible();
  await page.getByTestId("command-item-file.prefs").click();
  await expect(page.getByLabel("Preferences")).toBeVisible();
});

test("View → Command palette menu opens palette", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("menubar-view").click();
  await page.getByRole("menuitem", { name: /Command palette/i }).click();
  await expect(page.getByTestId("command-palette")).toBeVisible();
});

test("Command palette finds open connection tables", async ({ page }) => {
  await openDemoWorkspace(page);
  await expect(page.getByTestId("schema-row-users")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  await page.getByTestId("command-palette-input").fill("users");
  await expect(page.getByTestId("command-item-table.demo.users")).toBeVisible();
  await page.getByTestId("command-item-table.demo.users").click();
  await expect(page.getByTestId("result-grid")).toContainText("Ada");
});
