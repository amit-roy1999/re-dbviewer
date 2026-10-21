import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

test("opens workspace from seeded connection", async ({ page }) => {
  await openDemoWorkspace(page);
  await expect(page.getByTestId("sql-editor")).toBeVisible();
  await expect(page.getByTestId("btn-run-query")).toBeVisible();
});

test("Connections back returns to home", async ({ page }) => {
  await openDemoWorkspace(page);
  await page
    .getByTestId("workspace-root")
    .getByRole("button", { name: /^Connections$/ })
    .click();
  await expect(page.getByTestId("home-root")).toBeVisible();
});

test("schema tree lists users and orders", async ({ page }) => {
  await openDemoWorkspace(page);
  await expect(page.getByTestId("schema-row-users")).toBeVisible();
  await expect(page.getByTestId("schema-row-orders")).toBeVisible();
});
