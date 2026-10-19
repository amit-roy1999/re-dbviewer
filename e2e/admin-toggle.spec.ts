import { test, expect } from "./fixtures";
import { DEMO_CONNECTION } from "./fixtures/tauriMock";

test("toggles Objects / Administration for MySQL", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`btn-open-connection-${DEMO_CONNECTION.id}`).click();
  await expect(page.getByTestId("workspace-root")).toBeVisible();
  await expect(page.getByText("Objects", { exact: false }).first()).toBeVisible();

  await page.getByTestId("btn-workspace-mode").click();
  await expect(page.getByTestId("admin-nav")).toBeVisible();
  await expect(page.getByTestId("admin-view-serverStatus")).toBeVisible();
  await expect(page.getByTestId("admin-workbench")).toBeVisible();
});
