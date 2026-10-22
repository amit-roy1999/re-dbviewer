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
  await expect(page.getByTestId("eer-diagram")).toBeVisible();
  await expect(page.getByTestId("eer-edit-panel")).toBeVisible();
  await expect(page.getByTestId("eer-add-fk")).toBeVisible();
});

test("Tools → Schema Compare", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Schema Compare/i);
  await expect(page.getByTestId("tool-host-compare")).toBeVisible();
});

test("Tools → Data Compare", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Data Compare/i);
  await expect(page.getByTestId("tool-host-dataCompare")).toBeVisible();
  await expect(page.getByTestId("data-compare")).toBeVisible();
  await expect(page.getByTestId("data-compare-run")).toBeVisible();
});

test("Tools → Schema Sync", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Schema Sync/i);
  await expect(page.getByTestId("tool-host-schemaSync")).toBeVisible();
  await expect(page.getByTestId("schema-data-sync")).toBeVisible();
  await expect(page.getByTestId("schema-sync-analyze")).toBeVisible();
});

test("Tools → Pivot / Crosstab", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Pivot/i);
  await expect(page.getByTestId("tool-host-pivot")).toBeVisible();
  await expect(page.getByTestId("pivot-tool")).toBeVisible();
});

test("Tools → Query Notebook", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Query Notebook/i);
  await expect(page.getByTestId("tool-host-notebook")).toBeVisible();
  await expect(page.getByTestId("query-notebook")).toBeVisible();
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

test("Tools → Visual Query Builder", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Visual Query Builder/i);
  await expect(page.getByTestId("tool-host-vqb")).toBeVisible();
  await expect(page.getByTestId("visual-query-builder")).toBeVisible();
  await expect(page.getByTestId("vqb-root-table")).toBeVisible();
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

test("Visualize Data → Chart step prompts to run query first", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Visualize Data/i);
  await page.getByRole("button", { name: /2\.\s*Chart/i }).click();
  await expect(page.getByText(/run a query on the data step first/i)).toBeVisible();
});

test("Tools → Server Admin switches workspace mode", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTool(page, /Server Admin/i);
  await expect(page.getByTestId("admin-workbench")).toBeVisible();
});

test("File → Dump Selected Tables opens dump/restore wizard", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("menubar-file").click();
  await page.getByRole("menuitem", { name: /Dump Selected Tables/i }).click();
  await expect(page.getByTestId("dump-restore-wizard")).toBeVisible();
  await expect(page.getByTestId("dump-restore-run")).toBeVisible();
  await page.getByTestId("dump-restore-tab-restore").click();
  await expect(page.getByTestId("dump-restore-run")).toHaveText(/Choose SQL/i);
});
