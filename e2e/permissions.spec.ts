import { test, expect } from "./fixtures";
import { openRestrictedWorkspace, openTableMenu } from "./helpers";

test("restricted: Import / Duplicate / Edit table disabled", async ({
  page,
}) => {
  await openRestrictedWorkspace(page);
  await openTableMenu(page, "users");

  const importItem = page.getByRole("menuitem", { name: "Import from File…" });
  await expect(importItem).toBeDisabled();

  const edit = page.getByRole("menuitem", { name: "Edit table" });
  await expect(edit).toBeDisabled();

  const dup = page.getByRole("menuitem", { name: "Duplicate…" });
  await expect(dup).toBeDisabled();

  const drop = page.getByRole("menuitem", { name: "Drop…" });
  await expect(drop).toBeDisabled();
});

test("restricted: View Data still works", async ({ page }) => {
  await openRestrictedWorkspace(page);
  await page.getByTestId("schema-open-users").click();
  await expect(page.getByTestId("result-grid")).toContainText("Ada");
});

test("restricted: Run query still works", async ({ page }) => {
  await openRestrictedWorkspace(page);
  await expect(page.getByTestId("btn-run-query")).toBeVisible();
  await page.getByTestId("btn-run-query").click();
  await expect(page.getByTestId("result-grid")).toContainText("ok");
});
