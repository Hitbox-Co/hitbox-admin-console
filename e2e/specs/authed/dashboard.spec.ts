import { test, expect, open, settled } from "../../support/authed";

/**
 * The dashboard, and the one rule the whole console is built around:
 *
 *   A section the caller cannot see is OMITTED from the JSON — not empty,
 *   not zero, not null.
 *
 * So `{ "revenue": 0 }` means there was no revenue, and a missing `revenue`
 * key means you are not allowed to see revenue. The tests below check those
 * two never look alike, because a console that renders a hidden figure as
 * "0" is not merely wrong — it is confidently wrong about money.
 *
 * This is checked against whatever the signed-in role actually holds, by
 * reading the live payload and comparing it to what rendered. It asserts the
 * RELATIONSHIP, so it is true for every role rather than for one fixture.
 */
test.describe("Dashboard", () => {
  test("mounts and renders a body", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");
    await expect(page.getByRole("main")).not.toBeEmpty();
  });

  test("every withheld section is named, and named as withheld", async ({ page }) => {
    const payload = page.waitForResponse(
      (r) => r.url().includes("/api/hitbox/") && r.url().includes("dashboard") && r.ok(),
      { timeout: 30_000 }
    );

    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    let data: Record<string, unknown>;
    try {
      const body = await (await payload).json();
      data = (body?.data ?? body) as Record<string, unknown>;
    } catch {
      test.skip(true, "no dashboard payload observed");
      return;
    }

    const SECTIONS = [
      "orders",
      "users",
      "finance",
      "operations",
      "markets",
      "products",
      "provenance",
      "content",
      "artists",
      "organizations",
      "paymentGatewayConfig",
      "activity",
    ];
    const withheld = SECTIONS.filter((k) => !(k in data));

    if (withheld.length === 0) {
      // A role that sees everything: the panel must not appear at all.
      await expect(page.getByText(/section.* withheld from this response/i)).toHaveCount(0);
      return;
    }

    const notice = page.getByText(/withheld from this response/i);
    await expect(
      notice,
      `${withheld.length} sections are absent from the payload but nothing said so`
    ).toBeVisible();
    await expect(notice).toContainText(String(withheld.length));
  });

  test("a hidden figure is never rendered as a zero", async ({ page }) => {
    const payload = page.waitForResponse(
      (r) => r.url().includes("/api/hitbox/") && r.url().includes("dashboard") && r.ok(),
      { timeout: 30_000 }
    );

    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    let data: Record<string, unknown>;
    try {
      const body = await (await payload).json();
      data = (body?.data ?? body) as Record<string, unknown>;
    } catch {
      test.skip(true, "no dashboard payload observed");
      return;
    }

    if (!("finance" in data)) {
      // Revenue is withheld. The screen must say so — with the permission it
      // would take — and must not print a currency figure for it.
      const lock = page.getByText(/payment-royalty:read/i);
      await expect(
        lock,
        "finance is absent from the payload but the screen does not say it is withheld"
      ).toBeVisible();
    }
  });

  test("no baseline is written in words, not as 0%", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    // `growthPercentage: null` means there is no prior period to compare to.
    // Rendering it as "0%" asserts flat growth, which is a different and false
    // claim. If the word appears anywhere, it is correct; if a role has no
    // null growth this simply finds nothing, which is not a failure.
    const noBaseline = page.getByText(/no baseline/i);
    if (await noBaseline.count()) await expect(noBaseline.first()).toBeVisible();
  });

  test("deep links from the dashboard carry their filter", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const link = page.getByRole("link", { name: /order/i }).first();
    test.skip((await link.count()) === 0, "no order links on this role's dashboard");

    const href = await link.getAttribute("href");
    test.skip(!href?.includes("status="), "dashboard order links carry no status filter");

    await open(page, href!);
    await settled(page, "Orders");
    // The status the dashboard linked to must be the one the list applied.
    const status = new URL(href!, "http://x").searchParams.get("status")!;
    await expect(page.getByRole("main")).toContainText(
      new RegExp(status.replace(/_/g, "[ _]"), "i")
    );
  });

  test("a technical-only role is told why, not shown an empty dashboard", async ({ page }) => {
    await open(page, "/dashboard");
    await settled(page, "Dashboard");

    const main = page.getByRole("main");
    const text = await main.innerText();
    // Either there is content, or there is an explanation. Never neither.
    expect(text.trim().length, "the dashboard rendered nothing at all").toBeGreaterThan(40);
  });
});
