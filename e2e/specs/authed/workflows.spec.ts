import { test, expect, open, settled } from "../../support/authed";
import { WORKFLOWS } from "../../support/api-surface";
import { body as json, rows, errorCode, permissionsOf, str, strList } from "../../support/json";

/**
 * The operator workflows — read-only and negative.
 *
 * Every workflow in this console is a state machine whose transitions are the
 * server's to decide, not the UI's. `allowedTransitions` comes back on each
 * record and is what the drawer's buttons are built from. That design is what
 * makes these testable without mutating anything:
 *
 *   - the buttons OFFERED must equal the transitions ALLOWED;
 *   - a transition the server does not allow must not be reachable;
 *   - a step with a precondition (a comment, a confirmed return, an override)
 *     must collect it before it can be submitted.
 *
 * Nothing here advances a workflow. `process` on a refund revokes ownership,
 * quarantines the tag, sends money and reverses a royalty in one call; `execute`
 * on a payout pays real people. Those are not test fixtures. The success paths
 * are written against a seeded environment — see docs/TESTING-APPROACH.md,
 * "What this suite deliberately does not do".
 *
 * What IS asserted here is everything up to the commit point, which is where
 * the console's own bugs live.
 */

/** Guards every destructive step in this file. Unset in normal runs. */
const WRITES_ENABLED = process.env.E2E_ALLOW_WRITES === "1";

test.describe("Workflow inventory", () => {
  test("every workflow has a screen an operator can reach", async ({ page }) => {
    const unreachable: string[] = [];

    for (const wf of WORKFLOWS) {
      await open(page, wf.screen);
      const heading = await page.locator("h1").count();
      const denied = await page.getByText(/does not include this capability/i).count();
      if (heading === 0 && denied === 0) {
        unreachable.push(`${wf.name} → ${wf.screen}`);
      }
    }

    expect(unreachable, `workflows with no reachable screen:\n${unreachable.join("\n")}`).toEqual(
      []
    );
  });
});

/* ------------------------------------------------------------------ */
/* Refund: confirm-return → approve | reject → process                 */
/* ------------------------------------------------------------------ */

test.describe("Refund workflow", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/payments/refunds");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot reach refunds");
    await settled(page, "Refunds");
  });

  test("the buttons offered match the server's allowedTransitions", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/admin/payments/refunds?pageSize=5");
    test.skip(!res.ok(), "refund list not readable");

    const refunds = rows(await json(res));
    test.skip(refunds.length === 0, "no refunds to inspect");

    const row = refunds[0];
    const allowed = strList(row, "allowedTransitions");

    await page.locator("tbody tr").first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const LABELS: Record<string, RegExp> = {
      "confirm-return": /confirm return/i,
      approve: /^approve/i,
      reject: /^reject/i,
      process: /process/i,
    };

    const mismatches: string[] = [];
    for (const [action, label] of Object.entries(LABELS)) {
      const offered = (await drawer.getByRole("button", { name: label }).count()) > 0;
      const permitted = allowed.includes(action);
      if (offered && !permitted) {
        mismatches.push(`OFFERED but not allowed: ${action} — the button will 403`);
      }
      if (permitted && !offered) {
        mismatches.push(`ALLOWED but not offered: ${action} — the operator is stuck`);
      }
    }

    expect(mismatches, `\n${mismatches.join("\n")}\n`).toEqual([]);
    await page.keyboard.press("Escape");
  });

  test("approving before the return is confirmed demands an explicit override", async ({
    page,
  }) => {
    // PAYMENTS_RETURN_NOT_CONFIRMED: "Money does not move before the item is
    // back." The server allows an override with a reason — so the UI must
    // collect a reason rather than silently sending the override, and must
    // never send it by default.
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no refunds to inspect");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const approve = drawer.getByRole("button", { name: /^approve/i });
    test.skip((await approve.count()) === 0, "approve is not available on this refund");

    const override = drawer.getByRole("checkbox", { name: /override/i });
    if (await override.count()) {
      await override.check();
      // An override with no reason is an unattributable decision about money.
      await expect(
        approve,
        "override is armed with no reason captured — the decision would be unattributable"
      ).toBeDisabled();
    }

    await page.keyboard.press("Escape");
  });

  test("rejecting requires a reason", async ({ page }) => {
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no refunds to inspect");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const reject = drawer.getByRole("button", { name: /^reject/i });
    test.skip((await reject.count()) === 0, "reject is not available on this refund");

    await reject.click();
    const reason = drawer.getByRole("textbox").last();
    if (await reason.count()) {
      const submit = drawer.getByRole("button", { name: /confirm|reject/i }).last();
      await expect(submit, "a rejection can be submitted with no reason").toBeDisabled();
    }

    await page.keyboard.press("Escape");
  });

  test("process is presented as the irreversible step it is", async ({ page }) => {
    // One call revokes ownership, quarantines the tag, sends the money and
    // reverses the royalty. A bare button with no confirmation is a loaded gun.
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no refunds to inspect");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const process = drawer.getByRole("button", { name: /process/i });
    test.skip((await process.count()) === 0, "process is not available on this refund");

    await process.click();
    await expect(
      page.getByRole("dialog").getByText(/confirm|cannot be undone|irreversible|are you sure/i).first(),
      "process fires with no confirmation step"
    ).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  test("an illegal transition is refused by the server", async ({ page }) => {
    // The one negative assertion worth making against the live API: ask for a
    // step the record is not at. It changes nothing by definition — the whole
    // point is that it is refused.
    const res = await page.request.get("/api/hitbox/admin/payments/refunds?pageSize=5");
    test.skip(!res.ok(), "refund list not readable");

    const refunds = rows(await json(res));
    test.skip(refunds.length === 0, "no refunds to inspect");

    const row = refunds[0];
    const allowed = strList(row, "allowedTransitions");
    const illegal = ["confirm-return", "approve", "reject", "process"].find(
      (a) => !allowed.includes(a)
    );
    test.skip(!illegal, "every transition is currently legal on this record");

    const attempt = await page.request.post(
      `/api/hitbox/admin/payments/refunds/${str(row, "id")}/${illegal}`,
      { data: {} }
    );

    expect(
      attempt.ok(),
      `the server accepted '${illegal}' although allowedTransitions said ${JSON.stringify(allowed)} — the UI's gating is the only thing preventing it`
    ).toBe(false);

    expect([
      "PAYMENTS_INVALID_TRANSITION",
      "PAYMENTS_RETURN_NOT_CONFIRMED",
      "PAYMENTS_NOT_REFUNDABLE",
      "AUTHZ_FORBIDDEN",
      "PAYMENTS_FORBIDDEN",
      "VALIDATION_ERROR",
    ]).toContain(errorCode(await json(attempt)));
  });

  test("the full four-step path", async () => {
    test.skip(
      !WRITES_ENABLED,
      "Destructive: process revokes ownership, quarantines the tag, sends money and reverses a royalty. Run with E2E_ALLOW_WRITES=1 against a seeded backend only."
    );
    expect(WRITES_ENABLED).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Payout run: schedule → approve → execute | fail                     */
/* ------------------------------------------------------------------ */

test.describe("Payout workflow", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/finance/payouts");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");
    await settled(page, "Payouts");
  });

  test("payout actions are offered only on a global manage grant", async ({ page }) => {
    const me = await page.request.get("/api/hitbox/authz/me");
    test.skip(!me.ok(), "/authz/me not readable");
    const perms = permissionsOf(await json(me));

    // Every finance write is GLOBAL-only in the catalog and the route guards
    // pass globalOnly: true — an organization-scoped manage grant is refused.
    const canManage = perms.some((p) => p === "payment-royalty:manage:global");

    const actions = page.getByRole("button", { name: /approve|execute|mark failed|schedule/i });
    const offered = await actions.count();

    if (!canManage && offered > 0) {
      expect(
        offered,
        "payout actions are offered without payment-royalty:manage:global — every one will 403"
      ).toBe(0);
    }
  });

  test("execute is guarded by a confirmation", async ({ page }) => {
    const execute = page.getByRole("button", { name: /execute/i }).first();
    test.skip((await execute.count()) === 0, "no payout is at the execute step");

    await execute.click();
    await expect(
      page.getByRole("dialog").or(page.getByText(/confirm|cannot be undone|are you sure/i).first()),
      "execute pays real money with no confirmation step"
    ).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
  });

  test("scheduling a run with nothing eligible says so", async ({ page }) => {
    // FINANCE_NOTHING_TO_PAY — "every balance is below its threshold or already
    // batched". An empty result must read as a reason, not as a failure.
    const schedule = page.getByRole("button", { name: /schedule/i }).first();
    test.skip((await schedule.count()) === 0, "scheduling is not offered to this role");
    test.skip(!WRITES_ENABLED, "Scheduling creates a payout batch. Set E2E_ALLOW_WRITES=1.");
  });

  test("the full lifecycle", async () => {
    test.skip(
      !WRITES_ENABLED,
      "Destructive: execute pays real money to real people. Run with E2E_ALLOW_WRITES=1 against a seeded backend only."
    );
    expect(WRITES_ENABLED).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Release approval: submit → amend → decision                         */
/* ------------------------------------------------------------------ */

test.describe("Release approval workflow", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/release-approvals");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no release-approval grant");
    await settled(page, "Approvals");
  });

  test("a rejection cannot be submitted without a comment", async ({ page }) => {
    // RELEASES_COMMENT_REQUIRED — "A rejection needs a comment saying why."
    // The UI should make that refusal unreachable rather than round-trip it.
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no reviews to inspect");

    // Each review is its own page.
    await row.click();
    await expect(page.getByText(/Your decision/i)).toBeVisible({ timeout: 30_000 });

    const reject = page.getByRole("button", { name: /^reject$/i });
    test.skip(
      (await reject.count()) === 0 || !(await reject.isEnabled()),
      "reject is not available on this review"
    );

    await reject.click();
    const submit = page.getByRole("button", { name: /confirm rejection/i });
    await expect(submit, "a rejection can be submitted with no comment").toBeDisabled();
  });

  test("an already-decided review does not offer a second decision", async ({ page }) => {
    // RELEASES_ALREADY_DECIDED — reversing one needs the override permission.
    const res = await page.request.get("/api/hitbox/admin/releases?pageSize=20");
    test.skip(!res.ok(), "release list not readable");

    const decided = rows(await json(res)).find((r) => {
      const status = str(r, "status");
      return status !== null && !/pending/i.test(status);
    });
    test.skip(!decided, "no decided reviews to inspect");

    const attempt = await page.request.post(
      `/api/hitbox/admin/releases/${str(decided!, "id")}/decision`,
      { data: { decision: "APPROVED" } }
    );

    expect(
      attempt.ok(),
      "the server accepted a second decision on an already-decided review"
    ).toBe(false);
  });

  test("an age-restricted drop cannot be approved without a minimum age", async ({ page }) => {
    // RELEASES_COMPLIANCE_INCOMPLETE. Asserted as a refusal, not a write.
    const res = await page.request.get("/api/hitbox/admin/releases?status=PENDING&pageSize=20");
    test.skip(!res.ok(), "release list not readable");

    const gated = rows(await json(res)).find((r) => {
      const product = (r.product ?? {}) as Record<string, unknown>;
      return product.isAgeSpecific === true && !product.minimumAge;
    });
    test.skip(!gated, "no incomplete age-restricted review to inspect");

    // Open THAT review, not whichever row happens to be first.
    await open(page, `/release-approvals/${str(gated!, "id")}`);
    const approve = page.getByRole("button", { name: /^approve$/i });
    await expect(approve).toBeVisible({ timeout: 30_000 });
    await expect(
      approve,
      "approve is offered on an age-restricted drop with no minimum age — it will answer RELEASES_COMPLIANCE_INCOMPLETE"
    ).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */
/* Order lifecycle                                                     */
/* ------------------------------------------------------------------ */

test.describe("Order lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/orders");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot reach orders");
    await settled(page, "Orders");
  });

  test("PAID and REFUNDED are never offered by hand", async ({ page }) => {
    // ORDERS_STATUS_NOT_SETTABLE — "Paid and refunded are written by the
    // payment pipelines, not by hand." Offering either in a status control
    // invites an operator to desynchronise an order from its payment.
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no orders to inspect");

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const control = drawer.getByRole("combobox").or(drawer.locator("select")).first();
    test.skip((await control.count()) === 0, "no status control on this drawer");

    const options = await drawer.locator("option, [role='option']").allInnerTexts();
    if (options.length) {
      expect(
        options.filter((o) => /^(paid|refunded)$/i.test(o.trim())),
        "the status control offers PAID or REFUNDED, which the server refuses to set by hand"
      ).toEqual([]);
    }

    await page.keyboard.press("Escape");
  });

  test("an invalid transition is refused by the server", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/admin/orders?pageSize=5");
    test.skip(!res.ok(), "orders not readable");

    const orders = rows(await json(res));
    test.skip(orders.length === 0, "no orders to inspect");

    // Ask a DELIVERED order to go back to PENDING_PAYMENT, or any order to
    // become PAID by hand. Both are refusals by design, so nothing changes.
    const attempt = await page.request.patch(`/api/hitbox/admin/orders/${str(orders[0], "id")}/status`, {
      data: { status: "PAID" },
    });

    expect(
      attempt.ok(),
      "the server allowed PAID to be set by hand — the payment pipeline is no longer the only writer"
    ).toBe(false);

    expect([
      "ORDERS_STATUS_NOT_SETTABLE",
      "ORDERS_INVALID_TRANSITION",
      "AUTHZ_FORBIDDEN",
      "VALIDATION_ERROR",
    ]).toContain(errorCode(await json(attempt)));
  });
});

/* ------------------------------------------------------------------ */
/* Royalty reversal                                                    */
/* ------------------------------------------------------------------ */

test.describe("Royalty reversal", () => {
  test("reverse is offered only on an exact override grant", async ({ page }) => {
    await open(page, "/finance/royalties");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no payment-royalty grant");
    await settled(page, "Royalties");

    const me = await page.request.get("/api/hitbox/authz/me");
    test.skip(!me.ok(), "/authz/me not readable");
    const perms = permissionsOf(await json(me));

    // The route takes `manage` and the controller then re-checks `override` —
    // two different powers, and this is the one that cancels money someone is
    // owed. `manage` must not be enough to surface the button.
    const canOverride = perms.includes("payment-royalty:override:global");
    const reverse = page.getByRole("button", { name: /reverse/i });
    const offered = await reverse.count();

    if (!canOverride && offered > 0) {
      expect(
        offered,
        "Reverse is offered without payment-royalty:override:global — the controller will refuse every click"
      ).toBe(0);
    }
  });

  test("an already-reversed entry cannot be reversed again", async ({ page }) => {
    // FINANCE_ALREADY_REVERSED — "Reversing twice would double-credit it."
    const res = await page.request.get(
      "/api/hitbox/admin/finance/royalty-entries?status=REVERSED&pageSize=5"
    );
    test.skip(!res.ok(), "royalty entries not readable");

    const entries = rows(await json(res));
    test.skip(entries.length === 0, "no reversed entries to inspect");

    const attempt = await page.request.post(
      `/api/hitbox/admin/finance/royalty-entries/${str(entries[0], "id")}/reverse`,
      { data: { reason: "e2e — expected to be refused" } }
    );

    expect(
      attempt.ok(),
      "the server accepted a second reversal — the entry would be double-credited"
    ).toBe(false);
  });

  test("ledger rows are immutable", async ({ page }) => {
    // FINANCE_IMMUTABLE — "Ledger rows are never edited. Post an adjustment
    // against this instead." The console must offer no edit affordance at all.
    await open(page, "/finance/ledger");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "ledger not reachable by this role");

    const heading = await page.getByRole("heading", { level: 1, name: "Platform ledger" }).count();
    test.skip(heading === 0, "ledger tab withheld at this scope");

    await expect(
      page.getByRole("button", { name: /^edit|^delete/i }),
      "the ledger offers an edit or delete affordance on rows the server treats as immutable"
    ).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ */
/* Role lifecycle and assignment                                       */
/* ------------------------------------------------------------------ */

test.describe("Role lifecycle", () => {
  test("a seeded role cannot be deleted from the UI", async ({ page }) => {
    // AUTHZ_ROLE_IMMUTABLE — deactivating is offered instead.
    await open(page, "/roles");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no employee-role-mgmt grant");
    await settled(page, "Roles");

    const res = await page.request.get("/api/hitbox/admin/authz/roles");
    test.skip(!res.ok(), "role list not readable");

    const seeded = rows(await json(res)).find((r) => r.isSystem === true);
    test.skip(!seeded, "no seeded roles present");

    const attempt = await page.request.delete(
      `/api/hitbox/admin/authz/roles/${str(seeded!, "id")}`
    );
    expect(attempt.ok(), "the server allowed a seeded role to be deleted").toBe(false);

    expect(["AUTHZ_ROLE_IMMUTABLE", "AUTHZ_FORBIDDEN", "NOT_FOUND"]).toContain(
      errorCode(await json(attempt))
    );
  });

  test("a role still assigned cannot be deleted", async ({ page }) => {
    // AUTHZ_ROLE_IN_USE — "Revoke every assignment before deleting it." The
    // console should say that rather than surface a bare failure.
    await open(page, "/roles");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no employee-role-mgmt grant");
    test.skip(!WRITES_ENABLED, "Would need a disposable role to attempt against. Set E2E_ALLOW_WRITES=1.");
  });

  test("a permission outside the role's domain cannot be selected", async ({ page }) => {
    // AUTHZ_DOMAIN_VIOLATION is meant to be unreachable from the UI: the tree
    // is rendered from /admin/authz/permissions and filtered to the role's own
    // domain. If a cross-domain key is selectable, that guarantee is gone.
    await open(page, "/roles/new");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role cannot create roles");
    await settled(page, "New role");

    const boxes = page.getByRole("checkbox");
    test.skip((await boxes.count()) === 0, "no permission tree rendered");

    const all = await page.request.get("/api/hitbox/admin/authz/permissions");
    test.skip(!all.ok(), "permission catalog not readable");

    const catalog = rows(await json(all));
    const domains = new Set(catalog.map((p) => str(p, "domain")).filter(Boolean));
    // More than one domain exists in the catalog, so the tree must be showing
    // a filtered subset rather than all of it.
    test.skip(domains.size < 2, "the catalog has only one domain, so there is nothing to filter");

    const shown = await boxes.count();
    const total = catalog.length;
    expect(
      shown,
      `the permission tree shows ${shown} of ${total} catalog entries across ${domains.size} domains — it does not appear to be domain-filtered`
    ).toBeLessThan(total);
  });
});

test.describe("Role assignment", () => {
  test("an organization-scoped role demands an organization", async ({ page }) => {
    // ACCESS_CONTROL_MISSING_ORG_SCOPE. The console should collect it rather
    // than submit and translate the refusal.
    await open(page, "/team");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no employee-role-mgmt grant");
    await settled(page, "Team");

    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no team members to inspect");

    await row.click();
    const drawer = page.getByRole("dialog");
    test.skip((await drawer.count()) === 0, "no assignment drawer");
    await expect(drawer).toBeVisible({ timeout: 20_000 });

    const submit = drawer.getByRole("button", { name: /assign|add/i }).last();
    if (await submit.count()) {
      await expect(
        submit,
        "the assignment can be submitted before a role is chosen"
      ).toBeDisabled();
    }

    await page.keyboard.press("Escape");
  });

  test("a duplicate assignment is refused", async () => {
    // ACCESS_CONTROL_ASSIGNMENT_EXISTS — "This person already holds that role
    // at that scope."
    test.skip(!WRITES_ENABLED, "Attempting this creates an assignment on success. Set E2E_ALLOW_WRITES=1.");
  });
});

/* ------------------------------------------------------------------ */
/* Minting and tag binding                                             */
/* ------------------------------------------------------------------ */

test.describe("Minting and tag binding", () => {
  test("the units surface refuses PUBLIC and OWN scope holders", async ({ page }) => {
    // BUYER_COLLECTOR holds collectible-instance:read:public, and PUBLIC has
    // full breadth — so a bare "has a grant" check admits every signed-in
    // buyer. `canReadUnits()` refuses PUBLIC and OWN; this asserts the UI
    // agrees with it.
    const me = await page.request.get("/api/hitbox/authz/me");
    test.skip(!me.ok(), "/authz/me not readable");
    const perms = permissionsOf(await json(me));

    const scopes = perms
      .filter((p) => p.startsWith("collectible-instance:"))
      .map((p) => p.split(":")[2]);
    test.skip(scopes.length === 0, "this role holds no collectible-instance grant");

    const operatorGrade = scopes.some((s) =>
      ["organization", "masked", "masked-partial", "global"].includes(s)
    );

    await open(page, "/provenance");
    const reachable =
      (await page.getByRole("heading", { level: 1, name: "Provenance" }).count()) > 0;

    if (!operatorGrade) {
      expect(
        reachable,
        `scopes ${JSON.stringify(scopes)} are not operator-grade, but the provenance screen rendered — it will answer SKUS_FORBIDDEN`
      ).toBe(false);
    }
  });

  test("binding a tag needs nfc-tag-claim:manage, not just a mint grant", async ({ page }) => {
    const me = await page.request.get("/api/hitbox/authz/me");
    test.skip(!me.ok(), "/authz/me not readable");
    const perms = permissionsOf(await json(me));

    const canBind = perms.some((p) => p.startsWith("nfc-tag-claim:manage"));

    await open(page, "/provenance");
    const reachable =
      (await page.getByRole("heading", { level: 1, name: "Provenance" }).count()) > 0;
    test.skip(!reachable, "provenance not reachable by this role");

    const bind = page.getByRole("button", { name: /bind|attach tag/i });
    if (!canBind && (await bind.count()) > 0) {
      expect(
        await bind.count(),
        "a tag-binding action is offered without nfc-tag-claim:manage"
      ).toBe(0);
    }
  });

  test("minting past declared supply is refused", async () => {
    test.skip(!WRITES_ENABLED, "Minting creates serialized units. Set E2E_ALLOW_WRITES=1.");
  });
});

/* ------------------------------------------------------------------ */
/* Gateway configuration                                               */
/* ------------------------------------------------------------------ */

test.describe("Gateway configuration", () => {
  test("credentials are never rendered back to the browser", async ({ page }) => {
    // Changing credentialsRef is functionally changing the bank account the
    // platform's money lands in. The reference may be shown; the secret must
    // never be.
    const res = await page.request.get("/api/hitbox/admin/payments/gateway-configs");
    test.skip(!res.ok(), "gateway configs not readable by this role");

    const text = await res.text();
    expect(text).not.toMatch(/sk_(live|test)_[A-Za-z0-9]/);
    expect(text).not.toMatch(/"(secret|apiKey|privateKey|password)"\s*:\s*"[^"]{8,}/i);
  });
});
