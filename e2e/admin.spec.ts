import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

test("toggles Objects / Administration for MySQL", async ({ page }) => {
  await openDemoWorkspace(page);
  await expect(page.getByText("Objects", { exact: false }).first()).toBeVisible();
  await page.getByTestId("btn-workspace-mode").click();
  await expect(page.getByTestId("admin-nav")).toBeVisible();
  await expect(page.getByTestId("admin-view-serverStatus")).toBeVisible();
  await expect(page.getByTestId("admin-workbench")).toBeVisible();
});

test("admin nav switches views and returns to Objects with editor", async ({
  page,
}) => {
  await openDemoWorkspace(page);
  await page.getByTestId("btn-workspace-mode").click();
  await expect(page.getByTestId("admin-workbench")).toBeVisible();

  for (const id of ["processes", "users", "variables"]) {
    const tab = page.getByTestId(`admin-view-${id}`);
    if (await tab.count()) {
      await tab.click();
      await expect(page.getByTestId("admin-workbench")).toBeVisible();
    }
  }

  await page.getByTestId("btn-workspace-mode").click();
  await expect(page.getByTestId("sql-editor")).toBeVisible();
});
