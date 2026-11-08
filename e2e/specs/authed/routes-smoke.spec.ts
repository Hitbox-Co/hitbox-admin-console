import { test, expect, open, settled } from "../../support/authed";
import { APP_ROUTES } from "../../support/routes";

/**
 * Every route, opened directly.
 *
 * Deep-linking is the case that breaks first: a screen that works when you
 * click into it can still fail when opened cold, because its data, its
 * permission list and its URL parameters all arrive at once. Operators reach
 * these from bookmarks and from links pasted into chat, so the cold path is
 * the real path.
 *
 * Each route must reach one of exactly three legible outcomes. Anything else
 * — a blank frame, a spinner that never resolves, an unhandled error — fails.
 */
test.describe("Every route opens", () => {
  for (const route of APP_ROUTES) {
    test(`${route.path} reaches a legible state`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));

      await open(page, route.path);

      const heading = page.getByRole("heading", { level: 1, name: route.title });
      const denied = page.getByText(/your role does not include this capability|requires/i).first();

      await expect(
        heading.or(denied),
        `${route.path} produced neither its screen nor an explanation`
      ).toBeVisible({ timeout: 30_000 });

      // Whichever outcome, the shell survives it.
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

      expect(pageErrors, `${route.path} threw:\n${pageErrors.join("\n")}`).toEqual([]);
    });
  }
});

test.describe("Loading and empty states resolve", () => {
  for (const route of APP_ROUTES) {
    test(`${route.path} does not leave a skeleton on screen`, async ({ page }) => {
      await open(page, route.path);
      await page
        .getByRole("heading", { level: 1, name: route.title })
        .waitFor({ timeout: 30_000 })
        .catch(() => {
          /* denial panel; nothing to settle */
        });

      // Whatever the outcome, the screen must stop pretending to load. A
      // skeleton still on screen after the network is quiet is a query that
      // never resolved — the failure mode a human reads as "it's just slow".
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
    });
  }
});

test.describe("Sub-navigation", () => {
  test("finance tabs all open and mark themselves active", async ({ page }) => {
    await open(page, "/finance");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");

    await settled(page, "Finance");

    const section = page.getByRole("navigation", { name: "Section" });
    await expect(section).toBeVisible();

    const hrefs = await section
      .getByRole("link")
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));

    for (const href of hrefs) {
      await open(page, href);
      await expect(
        section.locator("[aria-current='page']"),
        `${href} does not mark itself active in the section nav`
      ).toHaveAttribute("href", href);
    }
  });

  test("payments tabs all open", async ({ page }) => {
    await open(page, "/payments");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");

    await settled(page, "Payments");
    const section = page.getByRole("navigation", { name: "Section" });
    const hrefs = await section
      .getByRole("link")
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));

    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) {
      await open(page, href);
      await expect(page.getByRole("main")).toBeVisible();
    }
  });

  test("the ledger and adjustments tabs are withheld at own scope, not shown empty", async ({
    page,
  }) => {
    // At OWN scope these two are empty BY CONSTRUCTION — they are the
    // platform's own books. Showing them empty would read as "no activity",
    // which is false. The layout hides them instead; this asserts the two
    // states stay consistent with each other.
    await open(page, "/finance");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");

    await settled(page, "Finance");
    const section = page.getByRole("navigation", { name: "Section" });
    const ledgerOffered = (await section.getByRole("link", { name: "Ledger" }).count()) > 0;

    await open(page, "/finance/ledger");
    const ledgerRenders =
      (await page.getByRole("heading", { level: 1, name: "Platform ledger" }).count()) > 0;

    expect(
      ledgerOffered,
      "the Ledger tab is hidden but /finance/ledger still renders a table — an own-scoped operator reaching it by URL sees an empty ledger and reads it as 'no activity'"
    ).toBe(ledgerRenders);
  });
});
