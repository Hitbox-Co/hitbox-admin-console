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
    "order:refund:global",
    // All THREE payment-royalty verbs, because the catalog grants all three
    // explicitly. `manage` does not imply `configure` or `override` in
    // buildFinanceAccess/buildPaymentAccess — each is matched by exact
    // action — so listing only `manage` here would have made the finance
    // assertions below pass against a role that does not exist.
    "payment-royalty:manage:global",
    "payment-royalty:configure:global",
    "payment-royalty:override:global",
    "buyer-profile:manage:global",
    "drop:manage:global",
    // manage + override, NOT approve — the catalog withholds approve on
    // purpose: an administrator may never consent on an owner's behalf.
    "release-approval:manage:global",
    "release-approval:override:global",
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
  // READ, not manage. The catalog withholds `payment-royalty:manage` and
  // `:configure` from this role on purpose — the comment beside it says so in
  // as many words: "Gateway configuration and the royalty ledger are
  // System-Admin-only, so this role reads but never configures." The console's
  // copy said `manage:global`, which would have shown a finance operator a
  // Schedule-payouts button that answers 403.
  HITBOX_FINANCE_ADMIN: [
    "payment-royalty:read:global",
    "order:read:global",
    "reports-dashboards:read:global",
  ],
  // Also copied verbatim from the catalog. This used to list six of the
  // fifteen — no release-approval, no collectible-instance, no
  // content-unlock, no brand-artist-record, no notification-config — which
  // made every assertion about what a Brand Admin can reach weaker than it
  // looked, because the fixture could not see the entries those grants open.
  BRAND_ADMIN: [
    "drop:manage:organization",
    "release-approval:read:organization",
    "release-approval:approve:organization",
    "release-approval:reject:organization",
    "collectible-instance:manage:organization",
    "assets-documents-upload:manage:organization",
    "content-unlock:manage:organization",
    "reports-dashboards:read:organization",
    "payment-royalty:read:organization",
    "brand-artist-record:read:organization",
    "brand-artist-record:update:organization",
    "employee-role-mgmt:read:organization",
    "employee-role-mgmt:assign:organization",
    "notification-config:update:organization",
    "order:read:organization",
  ],
  // The catalog's ARTIST is wider than this list used to claim. It holds
  // `payment-royalty:read:own` and `reports-dashboards:read:own` — the whole
  // point of the role is that a creator can see their own earnings — and it
  // manages drops at ORGANIZATION scope, not own. Both omissions mattered:
  // without the royalty grant the Finance and Payments entries looked
  // unreachable to an artist, which is the opposite of what the finance API
  // is built to do.
  ARTIST: [
    "drop:manage:organization",
    "release-approval:read:organization",
    "release-approval:approve:organization",
    "release-approval:reject:organization",
    "collectible-instance:manage:organization",
    "assets-documents-upload:manage:organization",
    "content-unlock:manage:organization",
    "reports-dashboards:read:own",
    "payment-royalty:read:own",
    "brand-artist-record:read:own",
    "brand-artist-record:update:own",
    "notification-config:update:own",
  ],
  // Same authoring rights as Brand Admin, no approval authority.
  BRAND_EMPLOYEE: [
    "drop:manage:organization",
    "release-approval:read:organization",
    "collectible-instance:manage:organization",
    "assets-documents-upload:manage:organization",
    "content-unlock:manage:organization",
    "reports-dashboards:read:organization",
    "notification-config:update:organization",
    "order:read:organization",
  ],
  // Manages every brand's drops; reads reviews, decides none.
  HITBOX_DROP_MANAGER: [
    "drop:manage:global",
    "release-approval:read:global",
    "collectible-instance:manage:global",
    "assets-documents-upload:manage:global",
    "general-location:read:masked",
    "search-discover:manage:global",
    "reports-dashboards:read:global",
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
  // `payment-royalty:read:own` is in the catalog for this role, so an artist
  // DOES reach Finance and Payments — narrowed to their own earnings, which
  // is the artist earnings screen the finance API is built around.
  check("artist gets Finance (own royalties)", artistNav.includes("/finance"), true);
  check("artist gets Payments", artistNav.includes("/payments"), true);
  check("artist does NOT get Team", artistNav.includes("/team"), false);
  check(
    "artist does NOT get Markets (own-scoped reports, no order grant)",
    artistNav.includes("/markets"),
    false
  );
  check("artist gets My workspace", artistNav.includes("/artist"), true);

  const brandAdminNav = navFor("BRAND_ADMIN");
  check("brand admin gets Finance (org-scoped royalties)", brandAdminNav.includes("/finance"), true);
  check("brand admin gets Team (org-scoped)", brandAdminNav.includes("/team"), true);
  check(
    "brand admin does NOT get the audit log",
    brandAdminNav.includes("/activity"),
    false
  );
  check("brand admin gets My workspace", brandAdminNav.includes("/artist"), true);

  // "Mine" filters nothing for a grant that reaches every record, so the
  // workspace is withheld from staff rather than rendering the platform
  // back to them under a personal heading.
  check(
    "system admin does NOT get My workspace (global scope)",
    navFor("HITBOX_SYSTEM_ADMIN").includes("/artist"),
    false
  );
  check(
    "order manager does NOT get My workspace (no brand-artist grant)",
    navFor("HITBOX_ORDER_MANAGER").includes("/artist"),
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

  /* ---------------------------------------------------------------- */
  /* Finance & payments                                                */
  /* ---------------------------------------------------------------- */

  console.log("\nFinance reads are scope-narrowed, never role-named\n");
  check(
    "system admin reads globally",
    permsFor("HITBOX_SYSTEM_ADMIN").financeScope(),
    "global"
  );
  check(
    "finance admin reads globally",
    permsFor("HITBOX_FINANCE_ADMIN").financeScope(),
    "global"
  );
  check(
    "brand admin is confined to its organization",
    permsFor("BRAND_ADMIN").financeScope(),
    "organization"
  );
  check("artist is confined to their own", permsFor("ARTIST").financeScope(), "own");
  check(
    "order manager holds no payment-royalty grant at all",
    permsFor("HITBOX_ORDER_MANAGER").financeScope(),
    null
  );
  check(
    "a role with no grant is refused rather than shown an empty list",
    permsFor("HITBOX_ORDER_MANAGER").canReadFinance(),
    false
  );

  console.log("\n`manage` does NOT imply `override` or `configure` on money\n");
  // buildFinanceAccess matches these by EXACT action — only `read` is
  // satisfied by a wider verb. A UI using the usual `can()` here would offer
  // a Reverse button to anyone holding manage, and the controller would 403.
  const manageOnly = new Permissions(["payment-royalty:manage:global"]);
  check("manage alone can manage", manageOnly.canManageFinance(), true);
  check("manage alone cannot override", manageOnly.canOverrideRoyalties(), false);
  check("manage alone cannot configure", manageOnly.canConfigureGateways(), false);
  check(
    "system admin holds all three explicitly",
    [
      permsFor("HITBOX_SYSTEM_ADMIN").canManageFinance(),
      permsFor("HITBOX_SYSTEM_ADMIN").canOverrideRoyalties(),
      permsFor("HITBOX_SYSTEM_ADMIN").canConfigureGateways(),
    ],
    [true, true, true]
  );
  check(
    "an organization-scoped manage grant is not enough — writes are global-only",
    new Permissions(["payment-royalty:manage:organization"]).canManageFinance(),
    false
  );

  console.log("\nFinance Admin reads everything and writes nothing\n");
  const financeAdmin = permsFor("HITBOX_FINANCE_ADMIN");
  check("reads finance", financeAdmin.canReadFinance(), true);
  check("cannot schedule a payout", financeAdmin.canManageFinance(), false);
  check("cannot reverse an accrual", financeAdmin.canOverrideRoyalties(), false);
  check("cannot configure a gateway", financeAdmin.canConfigureGateways(), false);
  check("cannot work the refund queue", financeAdmin.canWorkRefunds(), false);

  console.log("\nThe refund workflow needs BOTH grants, which is the rough edge\n");
  // Every refund handler calls buildPaymentAccess() before it runs, and that
  // throws 403 when the caller holds no payment-royalty grant. Order Manager
  // holds `order:refund:global` and no payment-royalty grant, so it is
  // refused on the workflow it was named for. Checking only the refund
  // capability would render four buttons that each answer 403.
  check(
    "system admin can work refunds",
    permsFor("HITBOX_SYSTEM_ADMIN").canWorkRefunds(),
    true
  );
  check(
    "order manager holds order:refund:global",
    permsFor("HITBOX_ORDER_MANAGER").hasAction("order", "refund", "global"),
    true
  );
  check(
    "…and is still refused, because it holds no payment-royalty grant",
    permsFor("HITBOX_ORDER_MANAGER").canWorkRefunds(),
    false
  );
  check(
    "adding a read grant to that role would fix it",
    new Permissions([
      "order:refund:global",
      "payment-royalty:read:global",
    ]).canWorkRefunds(),
    true
  );

  console.log("\nThe money entries follow the grant, not the job title\n");
  check(
    "finance admin gets Payments",
    navFor("HITBOX_FINANCE_ADMIN").includes("/payments"),
    true
  );
  check(
    "order manager gets neither Finance nor Payments",
    navFor("HITBOX_ORDER_MANAGER").some((h) => h === "/finance" || h === "/payments"),
    false
  );
  check(
    "brand admin gets Payments (org-scoped)",
    navFor("BRAND_ADMIN").includes("/payments"),
    true
  );
  check(
    "a technical role gets neither",
    navFor("HITBOX_PLATFORM_ENGINEER").some(
      (h) => h === "/finance" || h === "/payments"
    ),
    false
  );

  // Publishing is a transition on one drop, offered from its detail — not a
  // screen of its own.
  console.log("\nPublish drop has no nav entry — it is an action on a drop\n");
  check(
    "no role is offered a publish-drop route",
    Object.keys(ROLE_GRANTS).some((r) => navFor(r).includes("/publish-drop")),
    false
  );

  /*
   * drop-approval-lifecycle.md §9, row by row. These assert which ROUTES a
   * role reaches. Whether it may approve a particular drop turns on the
   * review's frozen authority and comes back as canApprove from the server;
   * the table's "own drops" qualifiers are exactly that server-side narrowing.
   *
   *   role   read  submit  amend  decide  reopen  catalog (edit / publish)
   */
  const LIFECYCLE: Record<string, [boolean, boolean, boolean, boolean, boolean, boolean]> = {
    ARTIST: [true, true, false, true, false, false],
    BRAND_ADMIN: [true, true, false, true, false, false],
    BRAND_EMPLOYEE: [true, true, false, false, false, false],
    HITBOX_SYSTEM_ADMIN: [true, true, true, true, true, true],
    HITBOX_DROP_MANAGER: [true, true, false, false, false, true],
    BUYER_COLLECTOR: [false, false, false, false, false, false],
    HITBOX_PLATFORM_ENGINEER: [false, false, false, false, false, false],
  };
  console.log("\nRelease lifecycle — who reaches which route (§9)\n");
  for (const [role, [read, submit, amend, decide, reopen, catalog]] of Object.entries(
    LIFECYCLE
  )) {
    const p = permsFor(role);
    check(`${role} reads reviews`, p.canRead("release-approval"), read);
    check(`${role} submits for review`, p.canSubmitRelease(), submit);
    check(`${role} amends review notes`, p.canAmendRelease(), amend);
    check(`${role} reaches the decision route`, p.canReachReleaseDecision(), decide);
    check(`${role} reopens a decided review`, p.canReopenRelease(), reopen);
    check(`${role} edits and publishes drops`, p.canManageCatalog(), catalog);
  }

  console.log("\nThe decision route admits approve, reject OR manage — none implies another\n");
  check(
    "approve alone reaches it (the bug §9 records: it used to need manage)",
    new Permissions(["release-approval:approve:organization"]).canReachReleaseDecision(),
    true
  );
  check(
    "reject alone reaches it",
    new Permissions(["release-approval:reject:global"]).canReachReleaseDecision(),
    true
  );
  check(
    "read alone does not",
    new Permissions(["release-approval:read:global"]).canReachReleaseDecision(),
    false
  );
  check(
    "approve does not imply manage, so it cannot amend notes",
    new Permissions(["release-approval:approve:global"]).canAmendRelease(),
    false
  );
  check(
    "manage does not imply override, so it cannot reopen",
    new Permissions(["release-approval:manage:global"]).canReopenRelease(),
    false
  );

  console.log("\nSubmit rides on drop:manage at any scope; catalog writes need GLOBAL\n");
  check(
    "org-scoped drop:manage submits",
    new Permissions(["drop:manage:organization"]).canSubmitRelease(),
    true
  );
  check(
    "org-scoped drop:manage cannot edit or publish (globalOnly routes)",
    new Permissions(["drop:manage:organization"]).canManageCatalog(),
    false
  );
  check(
    "drop:read cannot submit",
    new Permissions(["drop:read:global"]).canSubmitRelease(),
    false
  );
  check(
    "public drop:read cannot submit (BUYER_COLLECTOR's grant)",
    new Permissions(["drop:read:public"]).canSubmitRelease(),
    false
  );

  console.log(
    failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
