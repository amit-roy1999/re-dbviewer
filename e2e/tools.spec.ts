import { test, expect } from "./fixtures";
import { openDemoWorkspace } from "./helpers";

async function openTool(page: import("@playwright/test").Page, label: string) {
  await page.getByTestId("menubar-tools").click();
  await page.getByRole("menuitem", { name: label }).click();
}

test("Tools → EER Diagram", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /EER Diagram/i);
  await expect(page.getByTestId("tool-host-eer")).toBeVisible();
});

test("Tools → Schema Compare", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Schema Compare/i);
  await expect(page.getByTestId("tool-host-compare")).toBeVisible();
});

test("Tools → Migration Wizard", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Migration Wizard/i);
  await expect(page.getByTestId("tool-host-migrate")).toBeVisible();
});

test("Tools → Fake Data Factory", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Fake Data Factory/i);
  await expect(page.getByTestId("tool-host-fakeData")).toBeVisible();
  await expect(page.getByTestId("fake-data-factory")).toBeVisible();
});

test("Tools → Server Admin switches workspace mode", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Server Admin/i);
  await expect(page.getByTestId("admin-workbench")).toBeVisible();
});
