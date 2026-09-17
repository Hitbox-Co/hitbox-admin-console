import { test, expect, open, settled } from "../../support/authed";

/**
 * Access control: the roles catalog, the role editor, and team assignments.
 *
 * Read-only throughout. This suite will open the editor, inspect what it
 * offers and confirm the refusals are enforced in the UI, but it never saves a
 * role and never assigns one — a permission change on a shared backend is not
 * something a test run should leave behind.
 *
 * The write path belongs in a seeded environment; see TESTING-APPROACH.md,
 * "What this suite deliberately does not do".
 */
test.describe("Roles", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/roles");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no employee-role-mgmt grant");
    await settled(page, "Roles");
  });

  test("lists roles and marks the seeded ones", async ({ page }) => {
    await expect(page.locator("table").or(page.getByText(/no roles/i))).toBeVisible({
      timeout: 30_000,
    });

    // Seeded roles carry isSystem: true and are read-only. If any are present
    // they must be labelled, or an operator will try to edit one and be
    // refused with AUTHZ_ROLE_IMMUTABLE.
    const system = page.getByText("System", { exact: true });
    if (await system.count()) await expect(system.first()).toBeVisible();
  });

  test("a seeded role opens read-only", async ({ page }) => {
    const systemBadge = page.getByText("System", { exact: true }).first();
    test.skip((await systemBadge.count()) === 0, "no seeded roles visible");

    const row = page.locator("tbody tr").filter({ has: systemBadge }).first();
    await row.click().catch(async () => {
      await row.getByRole("link").first().click();
    });

    await expect(page.getByText(/seeded platform role|permissions are fixed/i)).toBeVisible({
      timeout: 25_000,
    });

    // Offering a Save on an immutable role produces AUTHZ_ROLE_IMMUTABLE —
    // a refusal the UI could have made unreachable, which is the stated design.
    const save = page.getByRole("button", { name: /^save|save changes/i });
    if (await save.count()) await expect(save.first()).toBeDisabled();
  });

  test("the permission tree is rendered from the catalog, never typed by hand", async ({
    page,
  }) => {
    const create = page.getByRole("link", { name: /new role|create/i }).first();
    test.skip((await create.count()) === 0, "this role cannot create roles");

    await create.click();
    await settled(page, "New role");

    // A free-text permission field would make AUTHZ_DOMAIN_VIOLATION reachable
    // from the UI. The design is explicit that it must not be.
    const freeText = page.locator('input[type="text"]').filter({
      hasNot: page.locator("[readonly]"),
    });
    const names = await freeText.evaluateAll((els) =>
      els.map((e) => (e as HTMLInputElement).name || (e as HTMLInputElement).id)
    );
    for (const name of names) {
      expect(
        /permission/i.test(name ?? ""),
        `a free-text permission input (${name}) makes an invalid key typeable`
      ).toBe(false);
    }

    await expect(
      page.getByRole("checkbox").first(),
      "the permission tree rendered no selectable permissions"
    ).toBeVisible({ timeout: 25_000 });
  });

  test("the create form refuses to submit while it is empty", async ({ page }) => {
    const create = page.getByRole("link", { name: /new role|create/i }).first();
    test.skip((await create.count()) === 0, "this role cannot create roles");

    await create.click();
    await settled(page, "New role");

    const submit = page.getByRole("button", { name: /create|save/i }).first();
    await expect(submit).toBeDisabled();
  });
});

test.describe("Team", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/team");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no employee-role-mgmt grant");
    await settled(page, "Team");
  });

  test("lists people, or says there are none", async ({ page }) => {
    await expect(page.locator("table").or(page.getByText(/no /i).first())).toBeVisible({
      timeout: 30_000,
    });
  });

  test("role assignment is additive, not a single-select", async ({ page }) => {
    // A person holds a LIST of roles. A single-select would silently replace
    // an assignment instead of adding one.
    const row = page.locator("tbody tr").first();
    test.skip((await row.count()) === 0, "no team members to open");

    await row.click();
    const drawer = page.getByRole("dialog");
    test.skip((await drawer.count()) === 0, "no assignment drawer on this row");

    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(
      drawer.locator("select[multiple], [role='listbox']").or(drawer.getByRole("button", { name: /add role/i })),
      "the assignment UI looks like a single-select — assigning a second role would replace the first"
    ).toBeVisible();

    await page.keyboard.press("Escape");
  });
});

test.describe("Audit log", () => {
  test("shows the role held at the time, not the role held now", async ({ page }) => {
    await open(page, "/activity");
    const denied = await page.getByText(/does not include this capability/i).count();
    test.skip(denied > 0, "this role holds no audit-log grant");
    await settled(page, "Audit log");

    const rows = page.locator("tbody tr");
    test.skip((await rows.count()) === 0, "no audit rows to inspect");

    // `actorRoleSnapshot` is what makes a since-revoked Finance Admin's past
    // approval still read as a Finance Admin action. Rendering the actor's
    // CURRENT role would rewrite history.
    const response = await page.request.get("/api/hitbox/admin/audit-logs?limit=1");
    test.skip(!response.ok(), "audit endpoint not reachable from this session");

    const body = await response.json();
    const first = (body?.data?.items ?? body?.data ?? body?.items ?? [])[0];
    test.skip(!first, "audit endpoint returned no rows");

    expect(
      "actorRoleSnapshot" in first,
      "the audit payload carries no actorRoleSnapshot — the console cannot show the role held at the time"
    ).toBe(true);
  });
});
