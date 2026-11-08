import { test, expect, open } from "../../support/authed";
import type { Page, Route } from "@playwright/test";

/**
 * How the console behaves when the backend misbehaves.
 *
 * Every response here is synthesised by intercepting /api/hitbox/* in the
 * browser, so these tests are deterministic, touch no real data, and can
 * produce states a healthy backend never will — which is precisely why they
 * are worth having. An operator meets these states on the worst day of the
 * quarter, and that is a bad time to discover the screen goes blank.
 *
 * /authz/me is deliberately left alone in most of them: breaking it would stop
 * the shell rendering at all, and the test would then be about the gate rather
 * than about the screen.
 */

const AUTHZ_ME = /\/api\/hitbox\/authz\/me/;

async function failWith(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route("**/api/hitbox/**", async (route) => {
    if (AUTHZ_ME.test(route.request().url())) return route.fallback();
    await handler(route);
  });
}

function errorBody(code: string, message: string, details: unknown = null) {
  return JSON.stringify({ error: { code, message, details } });
}

test.describe("Backend failure", () => {
  test("a 500 shows an error state, not a blank screen", async ({ page }) => {
    await failWith(page, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: errorBody("INTERNAL", "Something broke upstream."),
      })
    );

    await open(page, "/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
      timeout: 30_000,
    });

    const main = page.getByRole("main");
    await expect(main).not.toBeEmpty();
    await expect(
      main.getByText(/could not|failed|error|try again|went wrong/i).first(),
      "a 500 produced no message the operator can act on"
    ).toBeVisible({ timeout: 20_000 });

    // And nothing is still pretending to load.
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
  });

  test("a 403 reads as a permission boundary, not an outage", async ({ page }) => {
    await failWith(page, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: errorBody("AUTHZ_FORBIDDEN", "Forbidden"),
      })
    );

    await open(page, "/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
      timeout: 30_000,
    });

    // ApiError.friendly maps AUTHZ_FORBIDDEN to "Your role does not include
    // this capability." The README is explicit that a 403 gets the same muted
    // treatment as "not permitted", never a red failure.
    await expect(
      page.getByText(/role does not include this capability/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("an unreachable backend says so instead of hanging", async ({ page }) => {
    await failWith(page, (route) => route.abort("connectionrefused"));

    await open(page, "/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
      timeout: 30_000,
    });

    // The client raises NETWORK_ERROR — "Could not reach the console API."
    await expect(
      page.getByText(/could not reach|check your connection|network/i).first()
    ).toBeVisible({ timeout: 25_000 });
  });

  test("a 502 from the proxy is surfaced as a configuration fact", async ({ page }) => {
    await failWith(page, (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: errorBody("NETWORK_ERROR", "HITBOX_API_URL is not set."),
      })
    );

    await open(page, "/orders");
    await expect(
      page.getByRole("main").getByText(/HITBOX_API_URL|could not reach/i).first()
    ).toBeVisible({ timeout: 25_000 });
  });

  test("a 200 carrying HTML does not throw in the render path", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await failWith(page, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html>nginx</html>" })
    );

    await open(page, "/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);

    expect(
      pageErrors,
      `a 200 with an HTML body threw in the render path:\n${pageErrors.join("\n")}`
    ).toEqual([]);
  });

  test("a slow backend shows a skeleton and then resolves it", async ({ page }) => {
    await page.route("**/api/hitbox/**", async (route) => {
      if (AUTHZ_ME.test(route.request().url())) return route.fallback();
      await new Promise((r) => setTimeout(r, 2500));
      await route.fallback();
    });

    await open(page, "/orders");
    // A screen that shows nothing for three seconds reads as broken.
    await expect(page.locator(".animate-pulse").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 40_000 });
  });
});

test.describe("Session expiry", () => {
  /**
   * DEFECT — root cause in api-ingress.spec.ts.
   *
   * When the Clerk session dies mid-shift, the proxy answers the API call with
   * a 307 to /sign-in. The browser's `fetch` follows it, receives the sign-in
   * HTML with status 200, `res.ok` is true, the JSON parse fails and the
   * client returns `null` — so no ApiError is ever raised and "Your session
   * has expired. Sign in again to continue." cannot be shown. The screen just
   * empties, and the operator has no idea why.
   *
   * Reproduced deterministically here by answering API calls the way the proxy
   * does.
   */
  test("an expired session prompts for re-auth rather than emptying the screen", async ({
    page,
  }) => {
    test.fail(true, "Known: an expired session blanks the screen instead of prompting re-auth");

    await page.route("**/api/hitbox/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>sign in</body></html>",
      })
    );

    await page.goto("/orders");

    await expect(
      page.getByText(/session has expired|sign in again/i).first(),
      "an expired session produced neither a prompt nor a redirect"
    ).toBeVisible({ timeout: 25_000 });
  });
});
