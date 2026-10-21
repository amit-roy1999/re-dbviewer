import { test, expect } from "./fixtures";
import { openDemoWorkspace, setE2eFlags } from "./helpers";

test("run query shows mocked result grid", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("btn-run-query").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
  await expect(page.getByTestId("result-grid")).toContainText("ok");
  await expect(page.getByTestId("result-grid")).toContainText("1");
});

test("run query failure shows status error", async ({ page }) => {
  await openDemoWorkspace(page);
  await setE2eFlags(page, { failRunSql: true });
  await page.getByTestId("btn-run-query").click();
  await expect(page.getByTestId("workspace-status")).toContainText(
    /e2e: run_sql failed/i,
  );
});
