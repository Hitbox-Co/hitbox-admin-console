import { test, expect } from "@playwright/test";
import { PUBLIC_ROUTES } from "../../support/routes";

/**
 * Nothing shouting in the console, nothing failing in the network tab.
 *
 * A React hydration mismatch or a 4xx on a first-party asset is a real defect
 * that no functional assertion catches, because the page still looks right.
 */
test.describe("Runtime hygiene", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} loads without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        // Clerk's dev instance logs a keyless-mode / development-keys notice
        // that is a deployment fact, not a defect.
        if (/clerk.*development|development keys/i.test(text)) return;
        errors.push(text);
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      expect(errors, `console errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });

    test(`${route} loads every first-party asset it asks for`, async ({ page }) => {
      const failures: string[] = [];
      page.on("response", (res) => {
        const url = new URL(res.url());
        if (url.host !== new URL(page.url() || "http://localhost:3000").host) return;
        if (res.status() >= 400) failures.push(`${res.status()} ${url.pathname}`);
      });

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      expect(failures, `failed requests on ${route}:\n${failures.join("\n")}`).toEqual([]);
    });
  }

  test("no hydration mismatch on the landing page", async ({ page }) => {
    const hydration: string[] = [];
    page.on("console", (msg) => {
      if (/hydrat|did not match|server rendered/i.test(msg.text())) hydration.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(hydration).toEqual([]);
  });

  test("the landing page paints quickly enough to be usable", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const timing = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      return nav ? nav.domContentLoadedEventEnd - nav.startTime : null;
    });
    // A generous ceiling — this is a smoke check against a pathological
    // regression (a blocking sync request, a 5MB bundle), not a perf budget.
    if (timing !== null) expect(timing).toBeLessThan(10_000);
  });
});
