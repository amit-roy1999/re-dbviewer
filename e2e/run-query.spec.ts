import { test, expect } from "./fixtures";
import { DEMO_CONNECTION } from "./fixtures/tauriMock";

test("run query shows mocked result grid", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`btn-open-connection-${DEMO_CONNECTION.id}`).click();
  await expect(page.getByTestId("workspace-root")).toBeVisible();
  await page.getByTestId("btn-run-query").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
  await expect(page.getByTestId("result-grid")).toContainText("ok");
  await expect(page.getByTestId("result-grid")).toContainText("1");
});
