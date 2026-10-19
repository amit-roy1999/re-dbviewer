import { test, expect } from "./fixtures";
import { DEMO_CONNECTION } from "./fixtures/tauriMock";

test("opens workspace from seeded connection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await page.getByTestId(`btn-open-connection-${DEMO_CONNECTION.id}`).click();
  await expect(page.getByTestId("workspace-root")).toBeVisible();
  await expect(page.getByTestId("sql-editor")).toBeVisible();
  await expect(page.getByTestId("btn-run-query")).toBeVisible();
});
