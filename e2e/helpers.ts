import { expect, type Page } from "@playwright/test";
import { DEMO_CONNECTION, RESTRICTED_CONNECTION } from "./fixtures/tauriMock";

export async function openDemoWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("home-root")).toBeVisible();
  await page
    .getByTestId(`btn-open-connection-${DEMO_CONNECTION.id}`)
    .click();
  await expect(page.getByTestId("workspace-root")).toBeVisible();
}

export async function openRestrictedWorkspace(page: Page) {
  await page.goto("/");
  await page
    .getByTestId(`btn-open-connection-${RESTRICTED_CONNECTION.id}`)
    .click();
  await expect(page.getByTestId("workspace-root")).toBeVisible();
}

export async function openTableMenu(page: Page, table: string) {
  await page.keyboard.press("Escape").catch(() => {});
  const row = page.getByTestId(`schema-row-${table}`);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.getByTestId(`schema-menu-${table}`).click({ force: true });
  await expect(page.getByRole("menuitem").first()).toBeVisible({
    timeout: 5000,
  });
}

export async function setE2eFlags(
  page: Page,
  flags: Record<string, boolean>,
) {
  await page.evaluate((f) => {
    const w = window as unknown as {
      __E2E__?: { flags: Record<string, boolean> };
    };
    w.__E2E__ = w.__E2E__ || { flags: {} };
    w.__E2E__.flags = { ...w.__E2E__.flags, ...f };
  }, flags);
}

export async function lastInvokes(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __E2E__?: { lastInvokes: { cmd: string; args: Record<string, unknown> }[] };
    };
    return w.__E2E__?.lastInvokes ?? [];
  });
}

export async function clearInvokes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __E2E__?: { lastInvokes: unknown[] } };
    if (w.__E2E__) w.__E2E__.lastInvokes = [];
  });
}
