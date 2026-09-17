import { test, expect } from "@playwright/test";
import { scan, describeViolations } from "../../support/a11y";
import { PUBLIC_ROUTES } from "../../support/routes";

/**
 * Accessibility on the three screens reachable without a session.
 *
 * Contrast is separated from the rest on purpose. There is one known,
 * systemic contrast defect (below), and if it lived inside the general scan it
 * would mask every NEW violation behind an already-red test. Split, the
 * general scan stays green and keeps its job: catching the next regression.
 */

/**
 * DEFECT — systemic, recorded, not waived.
 *
 *   --text-3: #6b7280  on  --surface-1: #16171c  =  3.7:1
 *   WCAG 2.1 AA needs 4.5:1 for text under 18.66px, and every use here is
 *   11–12px.
 *
 * The landing page is NOT exempt — it is merely unmeasured. Its --text-3 copy
 * sits over the .ambient gradient, so axe reports those nodes as INCOMPLETE
 * with messageKey "bgGradient" rather than as violations.
 * Computed by hand, --text-3 over --ground (#08090a) is about 4.1:1, still
 * under the 4.5:1 floor. "No violations" there means "axe could not tell",
 * which is why the incomplete results get their own test below.
 *
 * It is not a sign-in problem either: --text-3 is the console's muted-text
 * token — sidebar group labels, table meta, hints, timestamps, empty-state
 * copy — and nearly all of it sits on --surface-1 panels. Every authenticated
 * screen inherits it.
 *
 * Lifting --text-3 to roughly #8b919c clears 4.5:1 on both backgrounds.
 */
const KNOWN_CONTRAST_FAILURE = new Set(["/sign-in", "/sign-up"]);

test.describe("Accessibility (WCAG 2.1 AA)", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no WCAG A/AA violations (contrast aside)`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await scan(page, { disable: ["color-contrast"] });

      expect(results.violations, `\n${describeViolations(results.violations)}\n`).toEqual([]);
    });

    test(`${route} meets AA contrast`, async ({ page }) => {
      test.fail(
        KNOWN_CONTRAST_FAILURE.has(route),
        "Known: --text-3 (#6b7280) on --surface-1 (#16171c) is 3.7:1, AA needs 4.5:1"
      );

      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await scan(page);
      const contrast = results.violations.filter((v) => v.id === "color-contrast");

      expect(contrast, `\n${describeViolations(contrast)}\n`).toEqual([]);
    });
  }

  test("the landing page's contrast can actually be measured", async ({ page }) => {
    /**
     * DEFECT — recorded, not waived.
     *
     * Text laid over the `.ambient` gradient cannot be contrast-checked by any
     * automated tool, axe included: there is no single background colour to
     * compare against. Every such node comes back `incomplete`, which reads as
     * a pass on a dashboard and is not one — and hand-computing the underlying
     * values puts --text-3 over --ground at roughly 4.1:1, under the floor.
     *
     * The fix is not a test change: give the hero copy a solid backing (or
     * bound the gradient so the text sits on a known colour) and the checker
     * can do its job.
     */
    test.fail(true, "Known: hero copy over the ambient gradient is unmeasurable, and computes under 4.5:1");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await scan(page);
    const unmeasurable = results.incomplete.filter((v) => v.id === "color-contrast");

    expect(
      unmeasurable.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 80))),
      "these nodes sit on a gradient, so their contrast is unverifiable"
    ).toEqual([]);
  });

  test("sign-in is operable by keyboard alone", async ({ page }) => {
    await page.goto("/sign-in");

    let reached = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      if ((await page.evaluate(() => document.activeElement?.id ?? "")) === "email") {
        reached = true;
        break;
      }
    }
    expect(reached, "could not reach the email field with Tab").toBe(true);

    await page.keyboard.type("operator@example.com");
    await expect(page.getByLabel("Work email")).toHaveValue("operator@example.com");
  });

  test("every public page declares a language", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
    }
  });

  test("focus is visible on the primary action", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "Sign in to the console" });
    await link.focus();
    const indicator = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
    });
    expect(indicator, "focused control has no visible focus indicator").not.toBe("none 0px none");
  });

  test("each page has exactly one h1", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.locator("h1"), `${route}`).toHaveCount(1);
    }
  });
});
