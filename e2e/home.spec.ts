import { test, expect } from "./fixtures";
import { DEMO_CONNECTION, RESTRICTED_CONNECTION } from "./fixtures/tauriMock";
import { setE2eFlags } from "./helpers";

test("home loads and opens new connection dialog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await page.getByTestId("btn-new-connection").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("New connection")).toBeVisible();
  await expect(page.getByText("SQLite", { exact: true }).first()).toBeVisible();
});

test("lists demo and restricted connections", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByTestId(`connection-card-${DEMO_CONNECTION.id}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`connection-card-${RESTRICTED_CONNECTION.id}`),
  ).toBeVisible();
  await expect(page.getByText("restricted").first()).toBeVisible();
});

test("test connection from new dialog succeeds", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-new-connection").click();
  await page.getByRole("dialog").getByRole("button", { name: "Test" }).click();
  await expect(page.getByText("ok").first()).toBeVisible();
});

test("test connection failure shows error", async ({ page }) => {
  await page.goto("/");
  await setE2eFlags(page, { failTestConnection: true });
  await page.getByTestId("btn-new-connection").click();
  await page.getByRole("dialog").getByRole("button", { name: "Test" }).click();
  await expect(page.getByText(/e2e: test failed/i).first()).toBeVisible();
});

test("save new MySQL connection then list it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-new-connection").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#conn-name").fill("E2E Saved");
  await dialog.getByRole("button", { name: "MySQL", exact: true }).click();
  await dialog.getByPlaceholder("127.0.0.1").fill("127.0.0.1");
  await expect(dialog.getByTestId("store-password-checkbox")).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Connection saved.")).toBeVisible();
  await expect(page.getByText("E2E Saved")).toBeVisible();
});

test("Store in Vault can be unchecked before save", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("btn-new-connection").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#conn-name").fill("No Persist PW");
  await dialog.getByRole("button", { name: "MySQL", exact: true }).click();
  const store = dialog.getByTestId("store-password-checkbox");
  await expect(store).toBeChecked();
  await store.uncheck();
  await dialog.getByPlaceholder("127.0.0.1").fill("127.0.0.1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Connection saved.")).toBeVisible();
  await expect(page.getByText("No Persist PW")).toBeVisible();
});

test("edit shows clear stored password when keyring flag set", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("connection-card-conn-mysql-1")
    .first()
    .getByTestId("btn-conn-menu-conn-mysql-1")
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/password stored securely/i)).toBeVisible();
  await dialog.getByTestId("clear-stored-password").click();
  await expect(page.getByText(/stored password cleared/i)).toBeVisible();
});

test("card menu: favorite and test connection", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId(`connection-card-${DEMO_CONNECTION.id}`).first();
  await card.getByTestId(`btn-conn-menu-${DEMO_CONNECTION.id}`).click();
  await page.getByRole("menuitem", { name: "Favorite" }).click();
  await card.getByTestId(`btn-conn-menu-${DEMO_CONNECTION.id}`).click();
  await expect(
    page.getByRole("menuitem", { name: "Unfavorite" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Test connection" }).click();
  await expect(page.getByText("ok").first()).toBeVisible();
});

test("card menu: duplicate connection", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId(`connection-card-${DEMO_CONNECTION.id}`)
    .first()
    .getByTestId(`btn-conn-menu-${DEMO_CONNECTION.id}`)
    .click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByText("Demo MySQL copy").last()).toBeVisible();
});
