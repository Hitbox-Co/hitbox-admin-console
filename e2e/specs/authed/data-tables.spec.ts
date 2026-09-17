import { test, expect, open, settled } from "../../support/authed";

/**
 * List screens: search, filter, paginate, and the drawer.
 *
 * These are read-only interactions on live data, chosen so the suite can run
 * against a production-like backend without changing anything. Every
 * assertion is about the CONTROL doing what it says — the URL it produces, the
 * request it sends — rather than about specific rows, which no test can know.
 */

const LIST_SCREENS = [
  { path: "/orders", title: "Orders" },
  { path: "/users", title: "Buyers" },
  { path: "/products", title: "Drops" },
  { path: "/activity", title: "Audit log" },
  { path: "/release-approvals", title: "Approvals" },
];

for (const screen of LIST_SCREENS) {
  test.describe(screen.title, () => {
    test.beforeEach(async ({ page }) => {
      await open(page, screen.path);
      const denied = await page.getByText(/does not include this capability/i).count();
      test.skip(denied > 0, `this role cannot reach ${screen.path}`);
      await settled(page, screen.title);
    });

    test("renders a table or an honest empty state, never a blank frame", async ({ page }) => {
      const table = page.locator("table");
      const empty = page.getByText(/no .*(yet|found|in this)|nothing to show/i).first();
      await expect(table.or(empty)).toBeVisible({ timeout: 30_000 });
    });

    test("a search sends a filtered request rather than filtering in the browser", async ({
      page,
    }) => {
      const search = page.getByPlaceholder(/search/i).first();
      test.skip((await search.count()) === 0, "no search on this screen");

      const request = page.waitForRequest(
        (r) => r.url().includes("/api/hitbox/") && r.url().includes("="),
        { timeout: 15_000 }
      );

      await search.fill("zzz-no-such-record");
      // Client-side filtering of a paginated list is silently wrong: it filters
      // the page you happen to be on, not the result set.
      await request.catch(() => {
        throw new Error(
          `${screen.path}: typing in search produced no server request — the list is being filtered client-side, which only searches the current page`
        );
      });
    });

    test("an empty result says so instead of showing an empty table", async ({ page }) => {
      const search = page.getByPlaceholder(/search/i).first();
      test.skip((await search.count()) === 0, "no search on this screen");

      await search.fill(`zzz-no-such-record-${Date.now()}`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      const rows = page.locator("tbody tr");
      if ((await rows.count()) === 0) {
        await expect(
          page.getByText(/no |nothing|empty/i).first(),
          "the list emptied without saying why"
        ).toBeVisible();
      }
    });

    test("pagination moves and disables at the ends", async ({ page }) => {
      const next = page.getByRole("button", { name: "Next page" });
      const prev = page.getByRole("button", { name: "Previous page" });
      test.skip((await next.count()) === 0, "no pagination on this screen");

      // On page one, there is nothing before.
      await expect(prev).toBeDisabled();

      if (await next.isEnabled()) {
        const before = await page.locator("tbody tr").first().innerText();
        await next.click();
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await expect(prev).toBeEnabled();
        const after = await page.locator("tbody tr").first().innerText();
        expect(after, "Next page did not change the rows").not.toBe(before);
      }
    });

    test("the table has a header row for every column", async ({ page }) => {
      const table = page.locator("table").first();
      test.skip((await table.count()) === 0, "no table rendered");

      const headers = await table.locator("thead th").count();
      const firstRowCells = await table.locator("tbody tr").first().locator("td").count();
      if (firstRowCells > 0) {
        expect(headers, "header and body column counts disagree").toBe(firstRowCells);
      }
    });
  });
}

test.describe("Order drawer", () => {
  test("opens from a row and can be dismissed", async ({ page }) => {
    await open(page, "/orders");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot reach /orders");
    await settled(page, "Orders");

    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no orders to open");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("the drawer traps focus while it is open", async ({ page }) => {
    await open(page, "/orders");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot reach /orders");
    await settled(page, "Orders");

    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no orders to open");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    // Focus escaping a modal leaves keyboard users tabbing through a page
    // they cannot see.
    for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && dialog.contains(document.activeElement);
    });
    expect(inside, "focus left the open drawer").toBe(true);
  });
});

test.describe("Money", () => {
  test("no figure is summed across currencies", async ({ page }) => {
    await open(page, "/finance");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");
    await settled(page, "Finance");

    // There is no FX rate anywhere in this system, so a single total spanning
    // currencies would be a fabricated number. Finance gives each currency its
    // own column; this asserts a currency is always named next to an amount.
    const main = await page.getByRole("main").innerText();
    const bareTotals = main.match(/(?<![A-Z]{3}\s)\b\d{1,3}(,\d{3})+\.\d{2}\b(?!\s*[A-Z]{3})/g);
    if (bareTotals?.length) {
      expect(
        bareTotals,
        `amounts rendered with no currency beside them: ${bareTotals.join(", ")}`
      ).toEqual([]);
    }
  });
});
