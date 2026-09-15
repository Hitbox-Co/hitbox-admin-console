/**
 * Verifies the permission logic this console owns.
 *
 *   npm run verify:gating
 *
 * Scope note: this used to also assert the response SHAPES of every endpoint,
 * against an in-process mock of the backend. That mock is gone — the console
 * now talks to the real API — so those assertions lost their subject and were
 * removed rather than left testing a fiction.
 *
 * What remains is the part that is still genuinely ours: how a permission key
 * is parsed, how `manage` subsumes `read`, how scope width is compared, and
 * which navigation entries a given grant set produces. Those decisions live in
 * src/lib/authz.ts and are what the whole UI keys off, so they are worth
 * pinning down.
 *
 * Response-shape conformance is now the backend's contract to keep; this
 * cannot verify it without the backend running.
 */
import { Permissions, visibleNav } from "../src/lib/authz";

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

/** The seeded platform roles, as documented in admin-api-reference.md §7. */
const ROLE_GRANTS: Record<string, string[]> = {
  HITBOX_SYSTEM_ADMIN: [
    "order:manage:global",
    "payment-royalty:manage:global",
    "buyer-profile:manage:global",
    "drop:manage:global",
    "release-approval:approve:global",
    "content-unlock:manage:global",
    "brand-artist-record:manage:global",
    "nfc-tag-claim:manage:global",
    "collectible-instance:manage:global",
    "employee-role-mgmt:manage:global",
    "audit-log:read:global",
    "reports-dashboards:read:global",
    "assets-documents-upload:manage:global",
  ],
  // Copied verbatim from packages/access-control/src/domain/role-catalog.ts.
  // These used to be hand-written approximations — Order Manager was listed
  // with `buyer-profile:read:global` when the catalog actually grants
  // `masked-partial`, and that substitution is precisely what stopped these
  // assertions from catching a parser that dropped every masked scope.
  HITBOX_ORDER_MANAGER: [
    "order:manage:global",
    "order:refund:global",
    "buyer-profile:read:masked-partial",
    "address:read:global",
    "nfc-tag-claim:read:global",
  ],
  HITBOX_SUPPORT: [
    "buyer-profile:read:masked",
    "order:read:global",
    "collectible-instance:read:masked",
    "nfc-tag-claim:read:global",
    "nfc-tag-claim:update:global",
  ],
  BUYER_COLLECTOR: ["collectible-instance:read:public"],
  HITBOX_FINANCE_ADMIN: [
    "payment-royalty:manage:global",
    "order:read:global",
    "reports-dashboards:read:global",
  ],
  BRAND_ADMIN: [
    "order:read:organization",
    "payment-royalty:read:organization",
    "drop:manage:organization",
    "assets-documents-upload:manage:organization",
    "employee-role-mgmt:read:organization",
    "reports-dashboards:read:organization",
  ],
  ARTIST: [
    "drop:read:own",
    "brand-artist-record:manage:own",
    "assets-documents-upload:manage:own",
    "collectible-instance:read:own",
  ],
  HITBOX_PLATFORM_ENGINEER: [
    "platform-config:manage:global",
    "service-health:manage:global",
    "feature-flag:manage:global",
  ],
};

const permsFor = (role: string) => new Permissions(ROLE_GRANTS[role]);
const navFor = (role: string) => visibleNav(permsFor(role)).map((n) => n.href);

function main() {
  console.log("\nPermission keys parse as resource:action:scope\n");
  const admin = permsFor("HITBOX_SYSTEM_ADMIN");
  check("reads a granted resource", admin.canRead("order"), true);
  check("rejects an ungranted resource", admin.canRead("platform-config"), false);
  check("malformed keys are ignored", new Permissions(["nonsense"]).isEmpty, true);
  check(
    "an unknown scope word is not a valid grant",
    new Permissions(["order:read:everywhere"]).canRead("order"),
    false
  );

  console.log("\n`manage` subsumes the non-destructive actions, but not itself\n");
  const dropManager = new Permissions(["drop:manage:global"]);
  check("manage implies read", dropManager.canRead("drop"), true);
  check("manage implies approve", dropManager.can("drop", "approve"), true);
  check(
    "read does NOT imply manage",
    new Permissions(["drop:read:global"]).can("drop", "manage"),
    false
  );

  console.log("\nScope width is ordered own < organization < global\n");
  const orgScoped = new Permissions(["order:read:organization"]);
  check("organization satisfies an own-scope need", orgScoped.can("order", "read", "own"), true);
  check("organization satisfies organization", orgScoped.can("order", "read", "organization"), true);
  check("organization does NOT satisfy global", orgScoped.can("order", "read", "global"), false);
  check("widestScope reports the widest held", orgScoped.widestScope("order"), "organization");
  check(
    "widestScope is null for an ungranted resource",
    orgScoped.widestScope("drop"),
    null
  );
  check(
    "the widest of several grants wins",
    new Permissions(["order:read:own", "order:read:global"]).widestScope("order"),
    "global"
  );

  console.log("\nTechnical-only roles hold nothing the dashboard is built from\n");
  check(
    "platform engineer is technical-only",
    permsFor("HITBOX_PLATFORM_ENGINEER").isTechnicalOnly,
    true
  );
  check("system admin is not", permsFor("HITBOX_SYSTEM_ADMIN").isTechnicalOnly, false);
  check("artist is not", permsFor("ARTIST").isTechnicalOnly, false);

  console.log("\nNavigation is derived from grants, never from a role name\n");
  check(
    "a technical role is offered only the dashboard",
    navFor("HITBOX_PLATFORM_ENGINEER"),
    ["/dashboard"]
  );

  const orderManagerNav = navFor("HITBOX_ORDER_MANAGER");
  check("order manager gets Orders", orderManagerNav.includes("/orders"), true);
  check("order manager gets Buyers", orderManagerNav.includes("/users"), true);
  check("order manager does NOT get Finance", orderManagerNav.includes("/finance"), false);
  check("order manager does NOT get Products", orderManagerNav.includes("/products"), false);
  check("order manager does NOT get Media", orderManagerNav.includes("/media"), false);

  const financeNav = navFor("HITBOX_FINANCE_ADMIN");
  check("finance admin gets Finance", financeNav.includes("/finance"), true);
  check("finance admin gets Orders", financeNav.includes("/orders"), true);
  check("finance admin does NOT get Buyers", financeNav.includes("/users"), false);
  check("finance admin does NOT get Roles", financeNav.includes("/roles"), false);

  const artistNav = navFor("ARTIST");
  check("artist gets Products", artistNav.includes("/products"), true);
  check("artist gets Media", artistNav.includes("/media"), true);
  check("artist does NOT get Finance", artistNav.includes("/finance"), false);
  check("artist does NOT get Team", artistNav.includes("/team"), false);
  check(
    "artist does NOT get Markets (no reports grant)",
    artistNav.includes("/markets"),
    false
  );

  const brandAdminNav = navFor("BRAND_ADMIN");
  check("brand admin gets Finance (org-scoped royalties)", brandAdminNav.includes("/finance"), true);
  check("brand admin gets Team (org-scoped)", brandAdminNav.includes("/team"), true);
  check(
    "brand admin does NOT get the audit log",
    brandAdminNav.includes("/activity"),
    false
  );

  console.log("\nMedia keys off a read grant, which `manage` subsumes\n");
  const hrefs = (keys: string[]) =>
    visibleNav(new Permissions(keys)).map((n) => n.href);
  check(
    "a manage grant yields Media",
    hrefs(["assets-documents-upload:manage:own"]).includes("/media"),
    true
  );
  check(
    "a read grant yields Media",
    hrefs(["assets-documents-upload:read:own"]).includes("/media"),
    true
  );
  check(
    "no media grant means no Media entry",
    hrefs(["order:read:global"]).includes("/media"),
    false
  );

  console.log("\nThe catalog has six scopes, not three\n");
  check(
    "a masked scope parses instead of being dropped",
    permsFor("HITBOX_SUPPORT").canRead("buyer-profile"),
    true
  );
  check(
    "masked-partial parses too",
    permsFor("HITBOX_ORDER_MANAGER").canRead("buyer-profile"),
    true
  );
  check(
    "Order Manager therefore keeps its Buyers entry",
    navFor("HITBOX_ORDER_MANAGER").includes("/users"),
    true
  );
  check(
    "masked reaches every record, so it outranks organization",
    new Permissions(["buyer-profile:read:masked"]).can(
      "buyer-profile",
      "read",
      "organization"
    ),
    true
  );
  check(
    "visibility is reported distinctly from breadth",
    permsFor("HITBOX_SUPPORT").visibility("buyer-profile"),
    "MASKED"
  );

  console.log("\nSerialized units refuse the two cases a capability check waves through\n");
  check(
    "Support reaches units (masked)",
    permsFor("HITBOX_SUPPORT").canReadUnits(),
    true
  );
  check(
    "a buyer holding :public is refused",
    permsFor("BUYER_COLLECTOR").canReadUnits(),
    false
  );
  check(
    "an own-scoped collector is refused",
    new Permissions(["collectible-instance:read:own"]).canReadUnits(),
    false
  );
  check(
    "update does not imply read, so Content Manager is refused",
    new Permissions([
      "collectible-instance:update:global",
      "drop:read:global",
    ]).canReadUnits(),
    false
  );
  check(
    "System Admin may mint and bind tags",
    permsFor("HITBOX_SYSTEM_ADMIN").canMintUnits() &&
      permsFor("HITBOX_SYSTEM_ADMIN").canBindTags(),
    true
  );
  check(
    "Support may not mint",
    permsFor("HITBOX_SUPPORT").canMintUnits(),
    false
  );

  // The review workflow now exists (/admin/releases), so this is no longer
  // "no backend" — it is specifically the publish transition that is missing:
  // there is no APPROVED -> PUBLISHED/ACTIVE endpoint, no product-image join
  // and no price upsert (admin-console-api.md §14). Approving a drop is done
  // from Release approvals; a wizard ending in a button that cannot publish
  // would be worse than no wizard.
  console.log("\nPublish drop has no nav entry — the publish step does not exist\n");
  check(
    "no role is offered a publish-drop route",
    Object.keys(ROLE_GRANTS).some((r) => navFor(r).includes("/publish-drop")),
    false
  );

  console.log(
    failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
