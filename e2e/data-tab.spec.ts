import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

test("data tab shows preview and can switch to query", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("schema-open-users").click();
  await expect(page.getByTestId("result-grid")).toContainText("Grace");
  await expect(page.getByTestId("workspace-status")).toContainText(/rows/i);
});

test("filter schema tree hides non-matches", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByPlaceholder(/Filter tables/i).fill("order");
  await expect(page.getByTestId("schema-row-orders")).toBeVisible();
  await expect(page.getByTestId("schema-row-users")).toHaveCount(0);
  await page.getByPlaceholder(/Filter tables/i).fill("");
  await expect(page.getByTestId("schema-row-users")).toBeVisible();
});
