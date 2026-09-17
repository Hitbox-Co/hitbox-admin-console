import { test, expect } from "@playwright/test";
import { APP_ROUTES, PUBLIC_ROUTES } from "../../support/routes";

/**
 * The session wall.
 *
 * `src/proxy.ts` calls `auth.protect()` for everything outside the three
 * public routes. This is the single highest-value unauthenticated check in the
 * suite: a regression here exposes every operator screen — buyers, money,
 * audit — to anyone with the URL. It is also the one check that stays honest
 * without a session, so it runs on every commit.
 */
test.describe("Session wall", () => {
  for (const route of APP_ROUTES) {
    test(`${route.path} redirects a signed-out visitor to sign-in`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveURL(/\/sign-in/);
      await expect(page.getByLabel("Work email")).toBeVisible();
    });
  }

  test("the redirect preserves where the visitor was going", async ({ page }) => {
    await page.goto("/orders");
    // Clerk round-trips the original destination so sign-in can return there.
    // Losing it means every deep link from an email or a chat dumps the
    // operator on the dashboard instead.
    await expect(page).toHaveURL(/redirect_url=.*orders/);
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route} stays public`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `${route} should answer 200`).toBe(200);
      expect(page.url()).toContain(route === "/" ? "/" : route);
    });
  }

  test("an unknown path under the wall does not leak a 404 shell", async ({ page }) => {
    // A signed-out visitor must not be able to probe which routes exist.
    await page.goto("/orders-does-not-exist");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
