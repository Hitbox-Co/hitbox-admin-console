import { test, expect } from "@playwright/test";

/**
 * The API ingress at /api/hitbox/[...path].
 *
 * Its reason to exist is attaching the Clerk JWT server-side so the token
 * never enters the browser bundle. Two things are checked without a session:
 * that nothing is forwarded upstream, and that nothing leaks back.
 *
 * There is a third thing, and it is the interesting one — see the
 * "expired session" block at the bottom.
 */
test.describe("API ingress, unauthenticated", () => {
  const paths = [
    "authz/me",
    "admin/orders",
    "admin/finance/balances",
    "admin/authz/roles",
    "admin/audit-logs",
  ];

  for (const path of paths) {
    test(`GET /api/hitbox/${path} is refused before it reaches the backend`, async ({
      request,
    }) => {
      // maxRedirects: 0 — following the redirect is what hides the refusal.
      const res = await request.get(`/api/hitbox/${path}`, { maxRedirects: 0 });

      expect(res.status(), "an unauthenticated API call must not be served").not.toBe(200);
      expect([307, 302, 401]).toContain(res.status());

      if (res.status() === 307 || res.status() === 302) {
        expect(res.headers()["location"]).toContain("/sign-in");
      }
    });
  }

  test("a write is refused at the door, not forwarded upstream", async ({ request }) => {
    const res = await request.post("/api/hitbox/admin/finance/payouts", {
      data: { note: "e2e — must never reach the backend" },
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(200);
    expect([307, 302, 401]).toContain(res.status());
  });

  test("the refusal leaks no token and no upstream origin", async ({ request }) => {
    const res = await request.get("/api/hitbox/authz/me", { maxRedirects: 0 });
    const text = await res.text();

    expect(text).not.toMatch(/Bearer\s+\S/);
    expect(text).not.toMatch(/sk_(test|live)_/);
    expect(text).not.toMatch(/eyJ[\w-]+\.[\w-]+\./); // a JWT body
    expect(Object.keys(res.headers())).not.toContain("authorization");
  });

  test("the backend origin is never named in a client-visible response", async ({ request }) => {
    // HITBOX_API_URL is a server-side secret in the sense that matters: it is
    // the only host that will accept the console's tokens.
    const res = await request.get("/api/hitbox/authz/me", { maxRedirects: 0 });
    expect(await res.text()).not.toMatch(/ngrok|:8000/);
  });

  /* ------------------------------------------------------------------ */

  test.describe("expired or missing session", () => {
    /**
     * DEFECT — recorded, not waived.
     *
     * The route handler has an explicit branch for this:
     *
     *     if (!userId) return NextResponse.json(
     *       { error: { code: "AUTH_UNAUTHENTICATED", ... } }, { status: 401 })
     *
     * and `ApiError.friendly` maps that code to "Your session has expired.
     * Sign in again to continue." Neither can ever run. `auth.protect()` in
     * src/proxy.ts matches `/(api|trpc)(.*)` and answers a 307 to /sign-in
     * first, so the browser's `fetch` follows the redirect, receives the
     * sign-in HTML with status 200, `res.ok` is true, `tryParse` returns null
     * — and the query resolves with `null` data instead of raising an auth
     * error. A session that expires mid-shift therefore blanks the screen
     * instead of asking the operator to sign in again.
     *
     * `test.fail()` rather than a skip: the day the proxy stops swallowing
     * API routes, this test passes and Playwright reports it as an unexpected
     * pass, which is the reminder to delete the annotation.
     */
    test.fail(
      true,
      "Known: proxy 307s API routes to /sign-in, so the handler's JSON 401 is unreachable"
    );

    test("answers a JSON 401 the client can map to a message", async ({ request }) => {
      const res = await request.get("/api/hitbox/authz/me");

      expect(res.status()).toBe(401);
      expect((await res.json())?.error?.code).toBe("AUTH_UNAUTHENTICATED");
    });
  });

  test("the Clerk session cookie is not readable from page scripts", async ({ page }) => {
    await page.goto("/sign-in");
    const readable = await page.evaluate(() => document.cookie);
    // __session is the credential. __client_uat is a public timestamp Clerk
    // uses to decide whether to attempt a refresh, and is JS-readable by design.
    expect(readable).not.toMatch(/__session=/);
  });
});
