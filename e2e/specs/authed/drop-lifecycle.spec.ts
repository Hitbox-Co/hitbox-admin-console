import type { Page } from "@playwright/test";
import { test, expect, open, settled } from "../../support/authed";
import { body as json, rows, errorCode, permissionsOf, str, unwrap, type JsonRow } from "../../support/json";

/**
 * The drop approval lifecycle (drop-approval-lifecycle.md), read-only and
 * negative like workflows.spec.ts.
 *
 *   DRAFT ─submit─▶ SUBMITTED ─owner decides─▶ APPROVED ─publish─▶ PUBLISHED | ACTIVE
 *
 * Every write below is one the backend is documented to REFUSE, chosen so a
 * refusal leaves nothing behind (a refused publish and a refused approval
 * each write a DENIED audit row, which is the documented behaviour). Where a
 * wrong server could accept, the request is aimed so that acceptance changes
 * nothing — e.g. PATCH status ACTIVE is sent only to a drop already ACTIVE.
 *
 * Who may approve a given drop turns on the review's frozen authority, which
 * only the server resolves. So the UI assertions compare the buttons against
 * the server's canApprove / canReject / canReopen, never against a role name.
 */

async function grants(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/hitbox/authz/me");
  return res.ok() ? permissionsOf(await json(res)) : [];
}

/** Exact action at any scope — approve, reject and override imply nothing. */
const hasExact = (keys: string[], resource: string, action: string) =>
  keys.some((k) => {
    const [r, a] = k.split(":");
    return r === resource && a === action;
  });

const hasGlobal = (keys: string[], resource: string, action: string) =>
  keys.some((k) => {
    const [r, a, s] = k.split(":");
    return r === resource && a === action && s === "global";
  });

async function products(page: Page, status?: string): Promise<JsonRow[]> {
  const qs = status ? `?status=${status}&limit=20` : "?limit=20";
  const res = await page.request.get(`/api/hitbox/admin/dashboard/products${qs}`);
  return res.ok() ? rows(await json(res)) : [];
}

async function reviews(page: Page, query: string): Promise<JsonRow[]> {
  const res = await page.request.get(`/api/hitbox/admin/releases?${query}`);
  return res.ok() ? rows(await json(res)) : [];
}

async function detail(page: Page, approvalId: string): Promise<JsonRow | null> {
  const res = await page.request.get(`/api/hitbox/admin/releases/${approvalId}`);
  if (!res.ok()) return null;
  const d = unwrap(await json(res));
  return d && typeof d === "object" ? (d as JsonRow) : null;
}

/* ------------------------------------------------------------------ */
/* Status is not a field                                               */
/* ------------------------------------------------------------------ */

test.describe("Drop status moves only through its own routes", () => {
  test("PATCH refuses `status` with a 422 naming the field", async ({ page }) => {
    const keys = await grants(page);
    test.skip(!hasGlobal(keys, "drop", "manage"), "needs drop:manage:global to reach PATCH");

    // Aimed at a drop that is ALREADY active, so a server that wrongly
    // accepted the field would still change nothing.
    const live = (await products(page, "ACTIVE"))[0];
    test.skip(!live, "no ACTIVE drop to aim at");

    const res = await page.request.patch(`/api/hitbox/admin/products/${str(live, "id")}`, {
      data: { status: "ACTIVE" },
    });
    expect(res.status(), "PATCH accepted `status` — the approval lifecycle is advisory again").toBe(422);
  });

  test("publishing a drop that was never approved is refused", async ({ page }) => {
    const keys = await grants(page);
    test.skip(!hasGlobal(keys, "drop", "manage"), "needs drop:manage:global to reach publish");

    const draft = (await products(page, "DRAFT"))[0];
    test.skip(!draft, "no DRAFT drop to aim at");

    const res = await page.request.post(
      `/api/hitbox/admin/products/${str(draft, "id")}/publish`,
      { data: { target: "ACTIVE" } }
    );
    expect(res.ok(), "an unapproved DRAFT drop was published").toBe(false);
    expect(res.status()).toBe(409);
    expect(errorCode(await json(res))).toBe("PRODUCTS_NOT_APPROVED");
  });

  test("publish rejects a target other than ACTIVE or PUBLISHED", async ({ page }) => {
    const keys = await grants(page);
    test.skip(!hasGlobal(keys, "drop", "manage"), "needs drop:manage:global to reach publish");

    const any = (await products(page))[0];
    test.skip(!any, "no drop to aim at");

    const res = await page.request.post(`/api/hitbox/admin/products/${str(any, "id")}/publish`, {
      data: { target: "ARCHIVED" },
    });
    expect(res.status()).toBe(422);
  });

  test("a caller without drop:manage:global cannot publish", async ({ page }) => {
    const keys = await grants(page);
    test.skip(hasGlobal(keys, "drop", "manage"), "this role may publish");

    const any = (await products(page))[0];
    test.skip(!any, "no readable drop to aim at");

    const res = await page.request.post(`/api/hitbox/admin/products/${str(any, "id")}/publish`, {
      data: { target: "ACTIVE" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

/* ------------------------------------------------------------------ */
/* Minting waits for the owner's approval (§10)                        */
/* ------------------------------------------------------------------ */

/** A wrong server would MINT here, so these run only when writes are allowed. */
const WRITES_ENABLED = process.env.E2E_ALLOW_WRITES === "1";

test.describe("Minting waits for approval", () => {
  test("Add SKUs is not offered on an owned drop that is not yet approved", async ({ page }) => {
    const drafts = await products(page, "DRAFT");
    const owned = drafts.find((p) => str(p, "artistId") || str(p, "organizationId"));
    test.skip(!owned, "no owned DRAFT drop to inspect");

    await open(page, `/products/${str(owned, "id")}`);
    await expect(page.getByText(/Release lifecycle/i)).toBeVisible({ timeout: 30_000 });
    const add = page.getByRole("button", { name: /add skus/i });
    test.skip((await add.count()) === 0, "this role cannot mint, or cannot read the unit list");
    await expect(add, "Add SKUs offered before the owner approved the drop").toBeDisabled();
  });

  test("the server refuses to mint an owned, unapproved drop", async ({ page }) => {
    test.skip(!WRITES_ENABLED, "set E2E_ALLOW_WRITES=1 — a wrong server would mint a unit");
    const drafts = await products(page, "DRAFT");
    const owned = drafts.find((p) => str(p, "artistId") || str(p, "organizationId"));
    test.skip(!owned, "no owned DRAFT drop to aim at");

    const res = await page.request.post(`/api/hitbox/admin/products/${str(owned, "id")}/skus`, {
      data: { count: 1 },
    });
    test.skip(res.status() === 403, "this role cannot mint");
    expect(res.status()).toBe(409);
    expect(errorCode(await json(res))).toBe("SKUS_NOT_APPROVED");
  });
});

/* ------------------------------------------------------------------ */
/* The decision                                                        */
/* ------------------------------------------------------------------ */

test.describe("Deciding a review", () => {
  test("approving without the legal tickmark is refused", async ({ page }) => {
    const pending = (await reviews(page, "status=PENDING&latestOnly=true&limit=20"))[0];
    test.skip(!pending, "no pending review");

    const res = await page.request.post(
      `/api/hitbox/admin/releases/${str(pending, "id")}/decision`,
      { data: { status: "APPROVED" } }
    );
    expect(res.ok(), "an approval was recorded with no legal acceptance").toBe(false);
  });

  test("rejecting without a reason is refused", async ({ page }) => {
    const pending = (await reviews(page, "status=PENDING&latestOnly=true&limit=20"))[0];
    test.skip(!pending, "no pending review");

    const res = await page.request.post(
      `/api/hitbox/admin/releases/${str(pending, "id")}/decision`,
      { data: { status: "REJECTED" } }
    );
    expect(res.ok(), "a rejection was recorded with no reason").toBe(false);
  });

  test("an administrator is never offered approval of an owner's drop", async ({ page }) => {
    // §1: the owner approves, nobody approves on their behalf. A caller
    // holding manage but not approve must see canApprove false on ARTIST and
    // ORGANIZATION reviews — they may still reject.
    const keys = await grants(page);
    test.skip(
      !hasExact(keys, "release-approval", "manage") || hasExact(keys, "release-approval", "approve"),
      "needs release-approval:manage without :approve"
    );

    const owned = (await reviews(page, "status=PENDING&latestOnly=true&limit=50")).find((r) =>
      ["ARTIST", "ORGANIZATION"].includes(str(r, "authority") ?? "")
    );
    test.skip(!owned, "no pending artist- or brand-owned review");

    const d = await detail(page, str(owned, "id")!);
    expect(d?.canApprove, "an administrator was offered approval of an owner's drop").toBe(false);
    expect(d?.approveBlockedReason, "the refusal should explain itself").toBeTruthy();
  });

  test("reopening an undecided review is refused", async ({ page }) => {
    const pending = (await reviews(page, "status=PENDING&latestOnly=true&limit=20"))[0];
    test.skip(!pending, "no pending review");

    const res = await page.request.post(
      `/api/hitbox/admin/releases/${str(pending, "id")}/reopen`,
      { data: { reason: "e2e: this must be refused" } }
    );
    expect(res.ok(), "a review that was never decided was reopened").toBe(false);
    // 403 without override; 409 RELEASES_NOT_REOPENABLE with it.
    expect([403, 409]).toContain(res.status());
  });

  test("the detail carries what the UI needs to drive its buttons", async ({ page }) => {
    const any = (await reviews(page, "latestOnly=true&limit=5"))[0];
    test.skip(!any, "no review readable");

    const d = await detail(page, str(any, "id")!);
    expect(d, "review detail not readable").not.toBeNull();
    for (const key of ["canApprove", "canReject", "canReopen", "canDecide"]) {
      expect(typeof d![key], `${key} missing from the review detail`).toBe("boolean");
    }
    expect(typeof d!.legalComplianceStatement).toBe("string");
    expect(typeof d!.legalComplianceVersionRequired).toBe("string");
    expect(Array.isArray(d!.history)).toBe(true);
  });

  test("an auto-passed review records no legal acceptance", async ({ page }) => {
    // §3: authority NONE is a real review row, not a signed one.
    const auto = (await reviews(page, "status=APPROVED&limit=50")).find(
      (r) => str(r, "authority") === "NONE"
    );
    test.skip(!auto, "no auto-passed review");
    expect(auto!.legalComplianceAccepted).toBe(false);
    expect(auto!.checkedById ?? null).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The screens                                                         */
/* ------------------------------------------------------------------ */

test.describe("Review screen matches the server's verdict", () => {
  test("Approve / Reject / Reopen appear exactly when the detail allows them", async ({ page }) => {
    const first = (await reviews(page, "latestOnly=true&limit=5"))[0];
    test.skip(!first, "no review readable");
    const d = await detail(page, str(first, "id")!);
    test.skip(!d, "detail not readable");

    await open(page, `/release-approvals?open=${str(first, "id")}`);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText(/Entitled to decide/i)).toBeVisible({ timeout: 20_000 });

    const count = (name: RegExp) => drawer.getByRole("button", { name }).count();
    expect(await count(/^approve$/i) > 0, "Approve shown/hidden against canApprove").toBe(!!d!.canApprove);
    expect(await count(/^reject$/i) > 0, "Reject shown/hidden against canReject").toBe(!!d!.canReject);
    expect(await count(/^reopen$/i) > 0, "Reopen shown/hidden against canReopen").toBe(!!d!.canReopen);
  });

  test("the legal statement is the server's wording and starts unticked", async ({ page }) => {
    const approvable = (await reviews(page, "status=PENDING&latestOnly=true&limit=50"));
    let target: JsonRow | null = null;
    for (const r of approvable) {
      const d = await detail(page, str(r, "id")!);
      const product = (d?.product ?? {}) as JsonRow;
      if (d?.canApprove && !(product.isAgeSpecific && !product.minimumAge)) {
        target = d;
        break;
      }
    }
    test.skip(!target, "no review this role may approve");

    await open(page, `/release-approvals?open=${str(target!, "id")}`);
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: /^approve$/i }).click();

    await expect(drawer.getByText(String(target!.legalComplianceStatement))).toBeVisible();
    await expect(drawer.getByRole("checkbox").last()).not.toBeChecked();
    await expect(drawer.getByRole("button", { name: /confirm approval/i })).toBeDisabled();
    await page.keyboard.press("Escape");
  });
});

test.describe("Drop pages", () => {
  test("Add drop is a page, not a dialog, and has no status field", async ({ page }) => {
    const keys = await grants(page);
    await open(page, "/products/new");
    if (!hasGlobal(keys, "drop", "manage")) {
      await expect(page.getByText(/does not include this capability/i)).toBeVisible({ timeout: 30_000 });
      return;
    }
    await settled(page, "Add drop");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel(/^status$/i)).toHaveCount(0);
  });

  test("Edit drop saves nothing until something changes, and has no status field", async ({ page }) => {
    const keys = await grants(page);
    test.skip(!hasGlobal(keys, "drop", "manage"), "needs drop:manage:global to edit");
    const any = (await products(page))[0];
    test.skip(!any, "no drop to edit");

    await open(page, `/products/${str(any, "id")}/edit`);
    await expect(page.getByLabel(/^name/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/^status$/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /save changes/i })).toBeDisabled();

    await page.getByLabel(/^name/i).fill(`${str(any, "name") ?? "Drop"} (edited)`);
    await expect(page.getByRole("button", { name: /save changes/i })).toBeEnabled();
    // Not saved — Cancel returns to the drop.
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${str(any, "id")}$`));
  });

  test("the drop detail offers only the next legal transition", async ({ page }) => {
    const any = (await products(page))[0];
    test.skip(!any, "no drop readable");
    const status = str(any, "status") ?? "";

    await open(page, `/products/${str(any, "id")}`);
    await expect(page.getByText(/Release lifecycle/i)).toBeVisible({ timeout: 30_000 });

    const submit = await page.getByRole("button", { name: /submit for review/i }).count();
    const publish = await page.getByRole("button", { name: /^publish/i }).count();
    if (!["DRAFT", "REJECTED"].includes(status)) {
      expect(submit, `Submit offered on a ${status} drop`).toBe(0);
    }
    if (!["APPROVED", "PUBLISHED"].includes(status)) {
      expect(publish, `Publish offered on a ${status} drop`).toBe(0);
    }
  });

  test("clicking a drop opens its page, not a drawer", async ({ page }) => {
    const any = (await products(page))[0];
    test.skip(!any, "no drop readable");

    await open(page, "/products");
    await settled(page, "Drops");
    await page.locator("tbody tr").first().click();
    await expect(page).toHaveURL(/\/products\/[^/?]+$/, { timeout: 30_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/SKU allotment/i)).toBeVisible({ timeout: 30_000 });
  });

  test("the drawer's old ?open= link still lands on the drop", async ({ page }) => {
    const any = (await products(page))[0];
    test.skip(!any, "no drop readable");

    await open(page, `/products?open=${str(any, "id")}`);
    await expect(page).toHaveURL(new RegExp(`/products/${str(any, "id")}$`), { timeout: 30_000 });
  });
});
