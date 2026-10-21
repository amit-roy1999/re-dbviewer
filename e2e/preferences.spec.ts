import { test, expect } from "./fixtures";
import { clearInvokes, lastInvokes, openDemoWorkspace } from "./helpers";

test("Preferences → Export diagnostics", async ({ page }) => {
  await openDemoWorkspace(page);
  await page.getByTestId("menubar-file").click();
  await page.getByRole("menuitem", { name: /Preferences/i }).click();
  const prefs = page.getByLabel("Preferences");
  await expect(prefs).toBeVisible();
  await clearInvokes(page);
  await prefs.getByRole("button", { name: /Export diagnostics/i }).click();
  const invokes = await lastInvokes(page);
  expect(invokes.some((i) => i.cmd === "read_diagnostics")).toBe(true);
  expect(invokes.some((i) => i.cmd === "write_text_file")).toBe(true);
});
