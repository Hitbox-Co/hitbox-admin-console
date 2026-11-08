import { test, expect, open, settled } from "../../support/authed";
import { scan, describeViolations } from "../../support/a11y";
import { NAVIGABLE } from "../../support/routes";

/**
 * Accessibility across the authenticated console.
 *
 * Contrast is excluded from the general scan for the reason set out in the
 * public a11y spec: there is one known systemic contrast defect (--text-3 on
 * --surface-1 is 3.7:1) and leaving it inside the scan would mask every new
 * violation behind an already-red test. It gets its own test below, so the
 * blast radius across authenticated screens is measured rather than assumed.
 */
test.describe("Accessibility — authenticated screens", () => {
  for (const route of NAVIGABLE) {
    test(`${route.path} has no WCAG A/AA violations (contrast aside)`, async ({ page }) => {
      await open(page, route.path);
      const denied = await page.getByText(/does not include this capability/i).count();
      test.skip(denied > 0, `this role cannot reach ${route.path}`);

      await settled(page, route.title);
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

      const results = await scan(page, { disable: ["color-contrast"] });
      expect(results.violations, `\n${describeViolations(results.violations)}\n`).toEqual([]);
    });
  }

  test("how far the --text-3 contrast defect reaches", async ({ page }) => {
    test.fail(true, "Known: --text-3 (#6b7280) on --surface-1 (#16171c) is 3.7:1, AA needs 4.5:1");

    const affected: string[] = [];
    for (const route of NAVIGABLE) {
      await open(page, route.path);
      if (await page.getByText(/does not include this capability/i).count()) continue;
      await settled(page, route.title).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      const results = await scan(page);
      const contrast = results.violations.filter((v) => v.id === "color-contrast");
      if (contrast.length) {
        affected.push(`${route.path} — ${contrast[0].nodes.length} node(s)`);
      }
    }

    expect(affected, `contrast failures:\n${affected.join("\n")}`).toEqual([]);
  });

  test("the main landmark and one h1 exist on every screen", async ({ page }) => {
    for (const route of NAVIGABLE) {
      await open(page, route.path);
      await expect(page.getByRole("main"), `${route.path}`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("h1"), `${route.path} has more than one h1`).toHaveCount(1);
    }
  });

  test("the sidebar is reachable and operable by keyboard", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const nav = page.getByRole("navigation", { name: "Main" });
    const first = nav.getByRole("link").nth(1);
    test.skip((await first.count()) === 0, "only one nav entry for this role");

    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("tables expose their headers to assistive technology", async ({ page }) => {
    await open(page, "/orders");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot reach /orders");
    await settled(page, "Orders");

    const table = page.locator("table").first();
    test.skip((await table.count()) === 0, "no table rendered");

    // Without <th scope>, a screen reader cannot say which column a cell is in,
    // and a 9-column money table becomes unreadable.
    const headers = table.locator("thead th");
    await expect(headers.first()).toBeVisible();
    const scopes = await headers.evaluateAll((els) => els.map((e) => e.getAttribute("scope")));
    expect(
      scopes.every((s) => s === "col"),
      "table headers carry no scope=\"col\" — cells cannot be associated with their column"
    ).toBe(true);
  });
});
