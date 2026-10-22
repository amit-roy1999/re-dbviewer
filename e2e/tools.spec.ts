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

test("Tools → Visualize Data", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Visualize Data/i);
  await expect(page.getByTestId("tool-host-visualize")).toBeVisible();
  await expect(page.getByTestId("visualize-data")).toBeVisible();
  await expect(page.getByTestId("visualize-schema")).toBeVisible();
  await expect(page.getByTestId("visualize-table")).toBeVisible();
  await expect(page.getByRole("button", { name: /1\.\s*Data/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /2\.\s*Chart/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /3\.\s*Preview/i })).toBeVisible();
});

test("Visualize Data → Open as tab", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Visualize Data/i);
  await expect(page.getByTestId("tool-host-visualize")).toBeVisible();
  await page.getByTestId("visualize-open-as-tab").click();
  await expect(page.getByTestId("tool-host-visualize")).toHaveCount(0);
  await expect(page.getByTestId("visualize-tab-pane")).toBeVisible();
  await expect(page.getByTestId("visualize-data")).toBeVisible();
  await expect(page.getByTestId("visualize-open-as-tab")).toHaveCount(0);
});

test("Tools → Server Admin switches workspace mode", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Server Admin/i);
  await expect(page.getByTestId("admin-workbench")).toBeVisible();
});
