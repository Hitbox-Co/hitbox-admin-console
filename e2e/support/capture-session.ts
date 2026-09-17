import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { AUTH_FILE } from "./session";

/**
 * Interactive session capture — `npm run e2e:login`.
 *
 * This opens a real browser at /sign-in and waits for a human to complete the
 * sign-in. Nothing here types a credential: the instance signs in with a
 * one-time email code (README, "Sign-in: this Clerk instance uses email codes,
 * not passwords"), so the code has to come from a person's inbox anyway, and
 * automating a password entry would be the wrong thing to build even if it
 * could work.
 *
 * The result is `e2e/.auth/user.json`, which every authed project reuses
 * headlessly until the session expires. It is gitignored — it is a live
 * session token.
 */
test("capture a signed-in session", async ({ page, context }) => {
  test.setTimeout(10 * 60_000);

  await page.goto("/sign-in");

  console.log(
    "\n  Sign in in the browser window that just opened.\n" +
      "  Waiting up to 10 minutes for /dashboard...\n"
  );

  await page.waitForURL("**/dashboard**", { timeout: 9 * 60_000 });

  // The session only counts once /authz/me has answered — that is what every
  // authenticated screen blocks on, and a cookie without it is not usable.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({
    timeout: 60_000,
  });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });

  const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  expect(state.cookies.length, "storage state captured no cookies").toBeGreaterThan(0);

  console.log(`\n  Session saved to ${AUTH_FILE}\n  Now run: npm run e2e:authed\n`);
});
