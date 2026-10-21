import { test, expect } from "./fixtures";
import {
  clearInvokes,
  lastInvokes,
  openDemoWorkspace,
  openTableMenu,
} from "./helpers";

test("click table opens data with preview rows", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("schema-open-users").click();
  await expect(page.getByTestId("result-grid")).toBeVisible();
  await expect(page.getByTestId("result-grid")).toContainText("Ada");
});

test("structure wrench opens structure tab", async ({ page }) => {
  await openDemoWorkspace(page);
  const row = page.getByTestId("schema-row-users");
  await row.hover();
  await row.getByTitle("Structure").click();
  await expect(page.getByText(/columns/i).first()).toBeVisible();
});

test("⋯ View Data", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "View Data" }).click();
  await expect(page.getByTestId("result-grid")).toContainText("Ada");
});

test("⋯ View Structure", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "View Structure" }).click();
  await expect(page.getByText(/columns/i).first()).toBeVisible();
});

test("⋯ Copy Name", async ({ page }) => {
  await openDemoWorkspace(page);
  await clearInvokes(page);
  await openTableMenu(page, "orders");
  await page.getByRole("menuitem", { name: "Copy Name" }).click();
  const afterCopy = await lastInvokes(page);
  expect(afterCopy.some((i) => i.cmd === "write_clipboard")).toBe(true);
});

test("⋯ Hide / Show hidden", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "orders");
  await page.getByRole("menuitem", { name: "Hide" }).click();
  await expect(page.getByTestId("schema-row-orders")).toHaveCount(0);
  await expect(page.getByTestId("btn-show-hidden")).toBeVisible();
  await page.getByTestId("btn-show-hidden").click();
  await expect(page.getByTestId("schema-row-orders")).toBeVisible();
});

test("⋯ SQL: Select Top opens query tab text", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "SQL: Select Top" }).click();
  await expect(page.getByTestId("sql-editor")).toBeVisible();
  // Editor content is CodeMirror — check status or that a new tab appeared
  await expect(page.getByText(/Query|LIMIT|TOP/i).first()).toBeVisible();
});

test("⋯ SQL: Create invokes export_table_sql", async ({ page }) => {
  await openDemoWorkspace(page);
  await clearInvokes(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "SQL: Create" }).click();
  const invokes = await lastInvokes(page);
  expect(invokes.some((i) => i.cmd === "export_table_sql")).toBe(true);
});

test("⋯ Export To File uses save dialog mock", async ({ page }) => {
  await openDemoWorkspace(page);
  await clearInvokes(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "Export To File…" }).click();
  await expect(page.getByTestId("workspace-status")).toContainText(/Exported/i);
  const invokes = await lastInvokes(page);
  expect(invokes.some((i) => i.cmd === "export_table_sql")).toBe(true);
  expect(invokes.some((i) => i.cmd === "write_text_file")).toBe(true);
});

test("⋯ Import from File appends CSV", async ({ page }) => {
  await openDemoWorkspace(page);
  await clearInvokes(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "Import from File…" }).click();
  await expect(page.getByTestId("workspace-status")).toContainText(/Imported/i);
  const invokes = await lastInvokes(page);
  const imp = invokes.find((i) => i.cmd === "import_table_csv");
  expect(imp).toBeTruthy();
  expect(imp?.args?.mode).toBe("append");
});

test("⋯ Drop cancel does not run DROP", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "Drop…" }).click();
  await expect(page.getByText(/Drop table/i)).toBeVisible();
  await clearInvokes(page);
  await page.getByRole("button", { name: /Cancel/i }).click();
  const invokes = await lastInvokes(page);
  expect(
    invokes.some(
      (i) =>
        i.cmd === "run_sql" &&
        String(i.args?.sql ?? "").toUpperCase().includes("DROP"),
    ),
  ).toBe(false);
});

test("⋯ View ERD opens tools host", async ({ page }) => {
  await openDemoWorkspace(page);
  await openTableMenu(page, "users");
  await page.getByRole("menuitem", { name: "View ERD" }).click();
  await expect(page.getByTestId("tool-host-eer")).toBeVisible();
});
