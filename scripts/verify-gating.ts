/**
 * Verifies the console's core contract: a section the caller cannot see is
 * OMITTED from the dashboard payload, not zeroed.
 *
 *   npx tsx scripts/verify-gating.ts
 *
 * Runs against the in-process demo router, which mirrors the real service's
 * gating rules. Exits non-zero on any mismatch.
 */
import { handleDemo } from "../src/lib/demo/router";
import { Permissions, visibleNav } from "../src/lib/authz";
import { permissionsForRole } from "../src/lib/demo/catalog";
import type { DashboardResponse } from "../src/lib/types";

const EXPECTED: Record<string, string[]> = {
  HITBOX_SYSTEM_ADMIN: [
    "period", "summary", "users", "orders", "finance", "payments", "refunds",
    "markets", "products", "content", "artists", "organizations", "operations",
    "provenance", "paymentGatewayConfig", "activity",
  ],
  HITBOX_ORDER_MANAGER: [
    "period", "summary", "users", "orders", "refunds", "markets",
    "operations", "provenance",
  ],
  HITBOX_FINANCE_ADMIN: [
    "period", "summary", "orders", "finance", "payments", "refunds",
    "markets", "operations", "paymentGatewayConfig",
  ],
  HITBOX_PLATFORM_ENGINEER: ["period", "summary"],
  HITBOX_FULL_STACK_ENGINEER: ["period", "summary"],
};

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
    console.log(`       expected ${e}`);
    console.log(`       actual   ${a}`);
  }
}

async function dashboardFor(role: string): Promise<DashboardResponse> {
  const res = await handleDemo(
    "admin/dashboard",
    "GET",
    new URLSearchParams({ period: "month" }),
    undefined,
    role
  );
  if (res.status !== 200) throw new Error(`status ${res.status} for ${role}`);
  return res.body as DashboardResponse;
}

async function main() {
  console.log("\nSection presence per role\n");
  for (const [role, expected] of Object.entries(EXPECTED)) {
    const d = await dashboardFor(role);
    check(`${role} keys`, Object.keys(d).sort(), [...expected].sort());
  }

  console.log("\nThe canonical case: Order Manager sees refund counts, not amounts\n");
  const om = await dashboardFor("HITBOX_ORDER_MANAGER");
  check("refunds.processed present", typeof om.refunds?.processed, "number");
  check("refunds.amount absent", "amount" in (om.refunds ?? {}), false);
  check(
    "operations.paymentsNeedingReview absent",
    "paymentsNeedingReview" in (om.operations ?? {}),
    false
  );
  check("summary has no revenue", "grossRevenue" in om.summary, false);
  check("summary has no profit", "profit" in om.summary, false);

  console.log("\nFinance Admin: money yes, buyers and products no\n");
  const fa = await dashboardFor("HITBOX_FINANCE_ADMIN");
  check("refunds.amount present", "amount" in (fa.refunds ?? {}), true);
  check(
    "operations.paymentsNeedingReview present",
    "paymentsNeedingReview" in (fa.operations ?? {}),
    true
  );
  check("summary.totalUsers absent", "totalUsers" in fa.summary, false);
  check("summary.totalProducts absent", "totalProducts" in fa.summary, false);
  check("users section absent", "users" in fa, false);

  console.log("\nMoney is never a bare number\n");
  const sa = await dashboardFor("HITBOX_SYSTEM_ADMIN");
  const gross = sa.finance!.grossRevenue;
  check("grossRevenue is an object", typeof gross, "object");
  check(
    "every value is a string",
    Object.values(gross).every((v) => typeof v === "string"),
    true
  );
  check("more than one currency", Object.keys(gross).length > 1, true);

  console.log("\nTechnical roles get no business sections\n");
  const pe = await dashboardFor("HITBOX_PLATFORM_ENGINEER");
  check("summary is empty", Object.keys(pe.summary).length, 0);
  check(
    "Permissions.isTechnicalOnly",
    new Permissions(permissionsForRole("HITBOX_PLATFORM_ENGINEER")).isTechnicalOnly,
    true
  );
  check(
    "nav offers only the dashboard",
    visibleNav(new Permissions(permissionsForRole("HITBOX_PLATFORM_ENGINEER"))).map(
      (n) => n.href
    ),
    ["/dashboard"]
  );

  console.log("\nSub-endpoints 403 instead of omitting\n");
  const forbidden = await handleDemo(
    "admin/dashboard/finance",
    "GET",
    new URLSearchParams(),
    undefined,
    "HITBOX_ORDER_MANAGER"
  );
  check("finance sub-endpoint status", forbidden.status, 403);
  check(
    "finance sub-endpoint code",
    (forbidden.body as { error: { code: string } }).error.code,
    "AUTHZ_FORBIDDEN"
  );

  console.log("\nOrder rows drop fields the caller may not see\n");
  const omOrders = await handleDemo(
    "admin/dashboard/orders",
    "GET",
    new URLSearchParams({ limit: "1" }),
    undefined,
    "HITBOX_ORDER_MANAGER"
  );
  const omRow = (omOrders.body as { items: Record<string, unknown>[] }).items[0];
  check("order.amount absent for Order Manager", "amount" in omRow, false);
  check("order.buyerId present for Order Manager", "buyerId" in omRow, true);

  const faOrders = await handleDemo(
    "admin/dashboard/orders",
    "GET",
    new URLSearchParams({ limit: "1" }),
    undefined,
    "HITBOX_FINANCE_ADMIN"
  );
  const faRow = (faOrders.body as { items: Record<string, unknown>[] }).items[0];
  check("order.amount present for Finance Admin", "amount" in faRow, true);
  check("order.buyerId absent for Finance Admin", "buyerId" in faRow, false);

  console.log("\nRole immutability and domain rules\n");
  const editSeeded = await handleDemo(
    "admin/authz/roles/r-sys-01",
    "PATCH",
    new URLSearchParams(),
    { permissions: ["order:read:global"] },
    "HITBOX_SYSTEM_ADMIN"
  );
  check("editing a seeded role", editSeeded.status, 403);
  check(
    "immutable code",
    (editSeeded.body as { error: { code: string } }).error.code,
    "AUTHZ_ROLE_IMMUTABLE"
  );

  const deactivate = await handleDemo(
    "admin/authz/roles/r-sys-01",
    "PATCH",
    new URLSearchParams(),
    { isActive: false },
    "HITBOX_SYSTEM_ADMIN"
  );
  check("deactivating a seeded role is allowed", deactivate.status, 200);

  const mixed = await handleDemo(
    "admin/authz/roles",
    "POST",
    new URLSearchParams(),
    {
      name: "MIXED_DOMAIN_ROLE",
      displayName: "Mixed",
      entityGroup: "hitbox",
      domain: "BUSINESS",
      permissions: ["order:read:global", "feature-flag:manage:global"],
    },
    "HITBOX_SYSTEM_ADMIN"
  );
  check("mixing domains", mixed.status, 400);
  check(
    "domain violation code",
    (mixed.body as { error: { code: string } }).error.code,
    "AUTHZ_DOMAIN_VIOLATION"
  );

  console.log("\nCustom range validation\n");
  const badRange = await handleDemo(
    "admin/dashboard",
    "GET",
    new URLSearchParams({ period: "custom", from: "2026-09-10", to: "2026-09-01" }),
    undefined,
    "HITBOX_SYSTEM_ADMIN"
  );
  check("reversed range", badRange.status, 422);
  check(
    "reversed range code",
    (badRange.body as { error: { code: string } }).error.code,
    "INVALID_RANGE"
  );

  console.log("\nMedia storage is reported unavailable, not broken\n");
  const upload = await handleDemo(
    "admin/media/upload-url",
    "POST",
    new URLSearchParams(),
    {},
    "HITBOX_SYSTEM_ADMIN"
  );
  check("upload-url status", upload.status, 503);
  check(
    "upload-url code",
    (upload.body as { error: { code: string } }).error.code,
    "STORAGE_UNAVAILABLE"
  );

  console.log(
    failures === 0
      ? "\nAll checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
