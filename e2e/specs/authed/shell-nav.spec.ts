import { test, expect, open, settled } from "../../support/authed";
import { NAVIGABLE, NAV_LABELS } from "../../support/routes";

/**
 * The console shell: sidebar, topbar, and the relationship between them.
 *
 * The sidebar is derived from permission keys, never from a role name
 * (src/lib/authz.ts). The assertions here are therefore about CONSISTENCY
 * rather than about a fixed menu — this suite does not know which role signed
 * in, and hardcoding an expected menu would re-introduce exactly the coupling
 * the backend removed. What must hold for every role:
 *
 *   - whatever the sidebar offers, opens;
 *   - whatever it does not offer, is either genuinely unreachable or says why;
 *   - the shell itself never disappears.
 */
test.describe("Console shell", () => {
  test("the dashboard mounts with its navigation", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("every sidebar entry it offers actually opens", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const nav = page.getByRole("navigation", { name: "Main" });
    const hrefs = await nav.getByRole("link").evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")).filter(Boolean)
    );

    // The wordmark links to /dashboard too; dedupe.
    const routes = [...new Set(hrefs)].filter((h) => h !== "/dashboard");
    expect(routes.length, "the sidebar offered nothing at all").toBeGreaterThan(0);

    for (const href of routes) {
      const expected = NAV_LABELS[href!];
      await open(page, href!);
      if (expected) await settled(page, expected);
      // A link the sidebar offers must never land on its own denial panel.
      await expect(
        page.getByText(/your role does not include|not permitted/i),
        `${href} is offered in the sidebar but renders a denial`
      ).toHaveCount(0);
    }
  });

  test("the sidebar offers nothing that is not in the route manifest", async ({ page }) => {
    // Catches a nav entry added to authz.ts without a page behind it — the
    // failure mode the "Publish drop" note in authz.ts warns about.
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const hrefs = await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));

    const known = new Set(NAVIGABLE.map((r) => r.path));
    for (const href of new Set(hrefs)) {
      expect(known.has(href), `sidebar offers ${href}, which is not a known route`).toBe(true);
    }
  });

  test("the active entry is marked for assistive technology", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const current = page.getByRole("navigation", { name: "Main" }).locator("[aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", "/dashboard");
  });

  test("navigating by click keeps the shell and updates the heading", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const nav = page.getByRole("navigation", { name: "Main" });
    const first = nav.getByRole("link").nth(1); // 0 is the wordmark
    const href = await first.getAttribute("href");
    test.skip(!href || !NAV_LABELS[href], "no second nav entry for this role");

    await first.click();
    await settled(page, NAV_LABELS[href!]);
    await expect(nav).toBeVisible();
    await expect(page).toHaveURL(new RegExp(href!.replace("/", "\/")));
  });

  test("the browser's back button returns to the previous screen", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const nav = page.getByRole("navigation", { name: "Main" });
    const links = await nav.getByRole("link").evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!)
    );
    const target = links.find((h) => h !== "/dashboard" && NAV_LABELS[h]);
    test.skip(!target, "only the dashboard is available to this role");

    await open(page, target!);
    await settled(page, NAV_LABELS[target!]);

    await page.goBack();
    await settled(page, "Dashboard");
  });

  test("the account menu is present, so an operator can sign out", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");
    // Clerk's <UserButton /> renders a button with the user's name/avatar.
    await expect(page.locator("header").getByRole("button").last()).toBeVisible();
  });
});

test.describe("Console shell on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile projects only");

  test("the sidebar collapses behind a toggle and opens on demand", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const toggle = page.getByRole("button", { name: "Open navigation" });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
  });

  test("no horizontal overflow on the dashboard", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
