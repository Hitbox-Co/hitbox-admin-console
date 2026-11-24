import { test as base, expect, type Page } from "@playwright/test";
import { hasSession, NO_SESSION_REASON } from "./session";

/**
 * The authenticated test base.
 *
 * The session precondition is an AUTO FIXTURE, not a `test.beforeEach` in this
 * module. A hook declared in an imported helper attaches to whichever file
 * happened to be loading at import time, so it applied to some spec files and
 * not others depending on load order — which showed up as the same suite
 * reporting 122 skips on one run and 24 failures on the next. A fixture is
 * attached per test by the runner and cannot drift.
 */
export const test = base.extend<{ session: void }>({
  session: [
    async ({}, use) => {
      test.skip(!hasSession(), NO_SESSION_REASON);
      await use();
    },
    { auto: true },
  ],
});

/**
 * Navigate, and fail loudly if the session turned out to be dead.
 *
 * A stale storageState bounces to /sign-in, after which every "element not
 * found" points at the wrong thing. One clear error beats twenty misleading
 * ones.
 */
export async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/sign-in")) {
    throw new Error(
      `Session rejected: ${path} redirected to sign-in. The captured session has expired — re-run \`npm run e2e:login\`.`
    );
  }
  return response;
}

/**
 * Wait for the screen to settle.
 *
 * Every authenticated screen sits behind AuthzGate, which holds the whole tree
 * until /authz/me answers, and then behind its own query. The <h1> the page
 * pushes to the topbar is the one signal meaning "this screen mounted",
 * independent of whether its data arrived.
 */
export async function settled(page: Page, title: string) {
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({
    timeout: 30_000,
  });
}

export { expect };
