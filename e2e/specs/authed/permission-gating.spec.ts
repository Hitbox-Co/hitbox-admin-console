import { test, expect, open } from "../../support/authed";
import { APP_ROUTES } from "../../support/routes";
import { Permissions } from "../../../src/lib/authz";

/**
 * Permission gating, checked against the caller's own grant list.
 *
 * `GET /authz/me` is the single source of truth for what this session may do,
 * and the sidebar, the page guards and the action buttons are all supposed to
 * be derived from it. This spec reads that payload and asserts the UI agrees
 * with it — in both directions:
 *
 *   OFFERED BUT REFUSED  a button that answers 403 is worse than no button;
 *                        it teaches operators their tools are broken.
 *   HELD BUT HIDDEN      a capability the role holds and the UI never exposes
 *                        is a feature paid for and not delivered.
 *
 * Both directions matter and only the first is usually tested.
 */

async function grants(page: import("@playwright/test").Page): Promise<string[]> {
  const res = await page.request.get("/api/hitbox/authz/me");
  if (!res.ok()) return [];
  const body = await res.json();
  const me = body?.data ?? body;
  return Array.isArray(me?.permissions) ? me.permissions : [];
}

test.describe("Permission gating", () => {
  test("the sidebar offers exactly what the grant list supports", async ({ page }) => {
    await open(page, "/dashboard");
    await page.getByRole("navigation", { name: "Main" }).waitFor({ timeout: 30_000 });

    const keys = await grants(page);
    test.skip(keys.length === 0, "/authz/me returned no permissions");

    const offered = new Set(
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link")
        .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))
    );

    const disagreements: string[] = [];
    for (const route of APP_ROUTES.filter((r) => r.inNav && r.requires)) {
      // The console's own route map — the rule each backend route enforces,
      // scope included (an org-scoped grant does not open a no-context route).
      const canSee = new Permissions(keys).canOpen(route.path);
      const isOffered = offered.has(route.path);
      if (canSee && !isOffered) {
        disagreements.push(`HELD BUT HIDDEN: ${route.path} (holds ${route.requires})`);
      }
      if (!canSee && isOffered) {
        disagreements.push(`OFFERED BUT NOT HELD: ${route.path} (needs ${route.requires})`);
      }
    }

    expect(disagreements, `\n${disagreements.join("\n")}\n`).toEqual([]);
  });

  test("a route the role cannot reach explains itself and names the permission", async ({
    page,
  }) => {
    const keys = await grants(page);
    test.skip(keys.length === 0, "/authz/me returned no permissions");

    const perms = new Permissions(keys);
    const denied = APP_ROUTES.filter((r) => r.requires && !perms.canOpen(r.path));
    test.skip(denied.length === 0, "this role reaches every route");

    for (const route of denied.slice(0, 6)) {
      await open(page, route.path);

      // A denial must be a denial — not an empty table, not a spinner, and
      // not a red error that reads like an outage.
      const panel = page.getByText(/does not include this capability|requires/i).first();
      await expect(panel, `${route.path} does not explain its refusal`).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        panel.or(page.getByRole("main")),
        `${route.path} refuses without naming the permission it needs`
      ).toContainText(new RegExp(route.requires!.split(":")[0], "i"));
    }
  });

  test("a denial is not styled as a failure", async ({ page }) => {
    const keys = await grants(page);
    test.skip(keys.length === 0, "/authz/me returned no permissions");
    const perms = new Permissions(keys);
    const denied = APP_ROUTES.find((r) => r.requires && !perms.canOpen(r.path));
    test.skip(!denied, "this role reaches every route");

    await open(page, denied!.path);
    // "You may not see this" and "this broke" must not look alike — the README
    // is explicit that a 403 gets the muted treatment, not a red one.
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("gateway configuration is offered only on an exact configure grant", async ({ page }) => {
    const keys = await grants(page);
    test.skip(keys.length === 0, "/authz/me returned no permissions");

    // `manage` does NOT subsume `configure` here: buildPaymentAccess resolves
    // canConfigure from a literal payment-royalty:configure key. Offering the
    // screen on a manage grant produces buttons the controller then refuses.
    const exactConfigure = keys.some((k) => k.startsWith("payment-royalty:configure:global"));

    await open(page, "/payments/gateways");
    const rendered =
      (await page.getByRole("heading", { level: 1, name: "Gateway configuration" }).count()) > 0;

    expect(
      rendered,
      exactConfigure
        ? "holds payment-royalty:configure:global but the gateway screen is denied"
        : "does NOT hold payment-royalty:configure:global but the gateway screen rendered — its actions will 403"
    ).toBe(exactConfigure);
  });

  test("refund actions require both the refund grant and a finance grant", async ({ page }) => {
    const keys = await grants(page);
    test.skip(keys.length === 0, "/authz/me returned no permissions");

    // HITBOX_ORDER_MANAGER holds order:refund:global and no payment-royalty
    // grant. Every handler calls buildPaymentAccess first, which throws 403
    // without one — so the role named for refunds is refused on all four
    // workflow routes. Offering the buttons anyway is the failure this checks.
    const canRefund = keys.some((k) => k.startsWith("order:refund:global"));
    const hasFinance = keys.some((k) => k.startsWith("payment-royalty:"));
    test.skip(!canRefund, "this role holds no order:refund grant");

    await open(page, "/payments/refunds");
    const actions = page.getByRole("button", {
      name: /approve|reject|process refund|confirm return/i,
    });

    if (!hasFinance) {
      expect(
        await actions.count(),
        "refund actions are offered to a role with no payment-royalty grant — every one of them will answer 403"
      ).toBe(0);
    }
  });
});
