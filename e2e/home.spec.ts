import { test, expect } from "./fixtures";

test("home loads and opens new connection dialog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await page.getByTestId("btn-new-connection").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("New connection")).toBeVisible();
  await expect(page.getByText("SQLite", { exact: true }).first()).toBeVisible();
});
