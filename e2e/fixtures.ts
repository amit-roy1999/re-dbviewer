import { test as base, expect } from "@playwright/test";
import { tauriInitScriptSource } from "./fixtures/tauriMock";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(tauriInitScriptSource());
    await use(page);
  },
});

export { expect };
