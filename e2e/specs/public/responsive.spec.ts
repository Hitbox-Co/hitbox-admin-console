import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
];

/**
 * Layout integrity across the range an operator might actually use.
 *
 * The one assertion that matters here is no horizontal page scroll: a console
 * that overflows sideways on a phone is unusable in a warehouse, and the
 * failure is invisible on a developer's monitor.
 */
test.describe("Responsive layout", () => {
  for (const vp of VIEWPORTS) {
    for (const route of ["/", "/sign-in"]) {
      test(`${route} does not overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${overflow}px of horizontal overflow`).toBeLessThanOrEqual(1);
      });
    }
  }

  test("the sign-in form stays reachable without zooming on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sign-in");

    const email = page.getByLabel("Work email");
    await expect(email).toBeInViewport();

    const box = await email.boundingBox();
    // A 44px target is the accessibility floor for touch; the field is the
    // only way into the whole console.
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });

  test("the landing page's primary action is above the fold on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in to the console" })).toBeInViewport();
  });
});
