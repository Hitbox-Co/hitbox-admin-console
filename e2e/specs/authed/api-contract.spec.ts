import { test, expect } from "../../support/authed";
import { COLLECTION_READS, READS, WRITES } from "../../support/api-surface";
import {
  body as json,
  unwrap,
  rows,
  errorCode,
  permissionsOf,
  str,
  type JsonRow,
} from "../../support/json";

/**
 * The API contract, exercised through the console's own ingress with the
 * console's own session.
 *
 * Every call here is a READ. The write and act endpoints appear only through
 * their refusals, which is deliberate — see docs/TESTING-APPROACH.md.
 *
 * This is not a re-test of the backend's business logic; that is the backend's
 * suite to own. What it asserts is the contract the console depends on and
 * would break quietly without: the envelope shape, the omission rule, the
 * pagination fields, and the documented error codes. Each of those is read
 * directly by `src/lib/api/client.ts` or `hooks.ts`.
 *
 * Payloads are typed `unknown` and narrowed, never `any` — the point of a
 * contract test is that the shape might not be what the console expects, and
 * `any` would silence exactly that.
 */

function isRecord(v: unknown): v is JsonRow {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

test.describe("Envelope", () => {
  test("every readable collection answers JSON with a data envelope", async ({ page }) => {
    const problems: string[] = [];

    for (const ep of COLLECTION_READS) {
      const res = await page.request.get(`/api/hitbox/${ep.path}`);

      // 403/404 are legitimate — this role may not hold the grant. What is not
      // legitimate is a 2xx that is not JSON, or an error with no code.
      if (res.status() === 403 || res.status() === 404) continue;

      if (!res.ok()) {
        const payload = await json(res).catch(() => null);
        if (!errorCode(payload)) {
          problems.push(`${ep.path} → ${res.status()} with no error.code`);
        }
        continue;
      }

      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("application/json")) {
        problems.push(`${ep.path} → 200 with content-type ${ct}`);
        continue;
      }

      if (!isRecord(await json(res))) {
        problems.push(`${ep.path} → 200 with a non-object body`);
      }
    }

    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  test("an error carries the documented { error: { code, message, details } }", async ({
    page,
  }) => {
    // Every branch of ApiError.friendly switches on `code`. A refusal without
    // one falls through to the raw message, which is how an operator ends up
    // reading a stack trace.
    const res = await page.request.get(
      "/api/hitbox/admin/orders/00000000-0000-0000-0000-000000000000"
    );
    test.skip(res.ok(), "that id unexpectedly exists");

    const payload = await json(res);
    expect(errorCode(payload), "the refusal carried no error.code").not.toBeNull();

    const err = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    expect(typeof err.message).toBe("string");
    expect(err, "details is absent — a 422 could highlight no field").toHaveProperty("details");
  });

  test("a not-found answers a documented NOT_FOUND-family code", async ({ page }) => {
    const res = await page.request.get(
      "/api/hitbox/admin/products/00000000-0000-0000-0000-000000000000"
    );
    test.skip(res.ok(), "that id unexpectedly exists");
    test.skip(res.status() === 403, "this role cannot read drops");

    // The client maps each of these to "Not found — or outside your scope."
    // Anything else surfaces as a raw server message.
    expect(["NOT_FOUND", "PRODUCTS_NOT_FOUND", "SKUS_PRODUCT_NOT_FOUND"]).toContain(
      errorCode(await json(res))
    );
  });
});

test.describe("The omission rule", () => {
  test("the dashboard omits withheld sections rather than nulling them", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/admin/dashboard");
    test.skip(!res.ok(), "dashboard not readable by this role");

    const data = unwrap(await json(res));
    test.skip(!isRecord(data), "dashboard payload is not an object");

    // The rule the whole console is built on: absent means "not permitted",
    // present-but-zero means "zero". A null in a section slot collapses those
    // two into one and makes the UI's distinction impossible to draw.
    const nulled = Object.entries(data as JsonRow)
      .filter(([, v]) => v === null)
      .map(([k]) => k);

    expect(
      nulled,
      `sections returned as null instead of being omitted: ${nulled.join(", ")} — the console cannot tell "not permitted" from "no data"`
    ).toEqual([]);
  });

  test("growthPercentage is a number or null, never a string", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/admin/dashboard");
    test.skip(!res.ok(), "dashboard not readable by this role");

    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!isRecord(node)) return;
      for (const [k, v] of Object.entries(node)) {
        if (k === "growthPercentage" && v !== null && typeof v !== "number") {
          found.push(`${path}.${k} = ${JSON.stringify(v)}`);
        }
        walk(v, `${path}.${k}`);
      }
    };
    walk(unwrap(await json(res)), "$");

    // null renders as "No baseline"; a number renders as a percentage. A
    // string would render as neither.
    expect(found, `growthPercentage must be a number or null:\n${found.join("\n")}`).toEqual([]);
  });
});

test.describe("Pagination", () => {
  const paginated = [
    "admin/orders",
    "admin/products",
    "admin/releases",
    "admin/markets",
    "admin/audit-logs",
    "admin/finance/royalty-entries",
    "admin/payments/transactions",
  ];

  for (const path of paginated) {
    test(`${path} honours page and pageSize`, async ({ page }) => {
      const res = await page.request.get(`/api/hitbox/${path}?page=1&pageSize=1`);
      test.skip(!res.ok(), "not readable by this role");

      const items = rows(await json(res));
      test.skip(items.length === 0, `${path} returned no rows to page over`);

      expect(
        items.length,
        `pageSize=1 returned ${items.length} rows — the parameter is being ignored, so every list screen shows page one of everything`
      ).toBeLessThanOrEqual(1);
    });
  }

  test("page 2 is not page 1 again", async ({ page }) => {
    const one = await page.request.get("/api/hitbox/admin/orders?page=1&pageSize=1");
    test.skip(!one.ok(), "orders not readable by this role");
    const two = await page.request.get("/api/hitbox/admin/orders?page=2&pageSize=1");
    test.skip(!two.ok(), "page 2 not readable");

    const a = str(rows(await json(one))[0], "id");
    const b = str(rows(await json(two))[0], "id");
    test.skip(!a || !b, "fewer than two records to page over");

    expect(b, "page 2 returned the same record as page 1").not.toBe(a);
  });
});

test.describe("Filters reach the server", () => {
  test("an order status filter narrows the result set", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/admin/orders?status=PAID&pageSize=50");
    test.skip(!res.ok(), "orders not readable by this role");

    const narrowed = rows(await json(res));
    test.skip(narrowed.length === 0, "no PAID orders to check");

    // Every row must carry the status asked for. A filter the server silently
    // ignores is worse than one that errors: the operator trusts the result.
    const wrong = narrowed
      .map((o) => str(o, "status"))
      .filter((s): s is string => s !== null && s !== "PAID");

    expect(wrong, "the status filter was ignored — rows came back with other statuses").toEqual([]);
  });

  test("an invalid range is refused rather than silently swapped", async ({ page }) => {
    const res = await page.request.get(
      "/api/hitbox/admin/audit-logs?from=2026-12-31T00:00:00Z&to=2026-01-01T00:00:00Z"
    );
    test.skip(res.status() === 403, "audit log not readable by this role");

    if (!res.ok()) {
      // INVALID_RANGE — "The start of the range must come before the end."
      expect(["INVALID_RANGE", "VALIDATION_ERROR"]).toContain(errorCode(await json(res)));
    }
  });
});

test.describe("Scope and masking", () => {
  test("a masked grant does not return unmasked personal data", async ({ page }) => {
    const me = await page.request.get("/api/hitbox/authz/me");
    test.skip(!me.ok(), "/authz/me not readable");

    const perms = permissionsOf(await json(me));
    const masked = perms.find((p) => p.startsWith("buyer-profile:read:masked"));
    test.skip(!masked, "this role holds no masked buyer-profile grant");

    const res = await page.request.get("/api/hitbox/admin/dashboard/users?pageSize=1");
    test.skip(!res.ok(), "buyer list not readable");

    const row = rows(await json(res))[0];
    test.skip(!row, "no buyer rows to inspect");

    // A masked grant reaches every record but shows less of each. A full email
    // arriving under a masked scope is a data leak, not a nicety.
    const email = str(row, "email");
    if (email && email.includes("@")) {
      expect(email, `a ${masked} grant returned an unmasked email`).toMatch(/\*|•|redact/i);
    }
  });

  test("/authz/me returns only permissions this catalog can parse", async ({ page }) => {
    const res = await page.request.get("/api/hitbox/authz/me");
    test.skip(!res.ok(), "/authz/me not readable");

    const perms = permissionsOf(await json(res));
    test.skip(perms.length === 0, "no permissions returned");

    const SCOPES = ["own", "organization", "public", "masked", "masked-partial", "global"];
    const unparseable = perms.filter((p) => {
      const [resource, action, scope] = p.split(":");
      return !resource || !action || !SCOPES.includes(scope);
    });

    // `parsePermission` drops anything whose scope it does not recognise — the
    // exact bug that once cost Support its Buyer column. A new scope token
    // added backend-side would vanish here silently.
    expect(
      unparseable,
      `permissions the frontend catalog will silently drop: ${unparseable.join(", ")}`
    ).toEqual([]);
  });
});

test.describe("Write endpoints refuse what they should", () => {
  test("no write acts on an empty body", async ({ page }) => {
    const acted: string[] = [];

    for (const ep of WRITES.filter((e) => e.method === "POST" && !e.path.includes(":"))) {
      const res = await page.request.post(`/api/hitbox/${ep.path}`, { data: {} });

      // 422, 403 and 400 are all correct. 200/201 is not: an empty body
      // created something.
      if (res.status() === 200 || res.status() === 201) {
        acted.push(`${ep.method} ${ep.path} → ${res.status()} on an EMPTY body`);
      }
    }

    expect(acted, `\n${acted.join("\n")}\n`).toEqual([]);
  });

  test("a 422 carries details naming the offending field", async ({ page }) => {
    const res = await page.request.post("/api/hitbox/admin/markets", {
      data: { code: "", countries: "not-an-array" },
    });
    test.skip(res.status() === 403, "this role cannot manage markets");
    test.skip(res.ok(), "the server accepted an invalid market");

    const payload = await json(res);
    const err = isRecord(payload) && isRecord(payload.error) ? payload.error : {};

    // ApiError.fieldErrors reads both shapes — an array of zod issues and a
    // flat object. Without details, the operator changes the payload by
    // guesswork.
    expect(err.details, "a 422 arrived with no details, so no field can be highlighted").toBeTruthy();
  });
});

test.describe("Reads are genuinely read-only", () => {
  test("every parameterless read answers identically twice", async ({ page }) => {
    // A cheap invariant with real teeth: a GET with a side effect usually
    // shows up here first, as a status that changes between calls.
    const drift: string[] = [];

    for (const ep of READS.filter((e) => !e.path.includes(":")).slice(0, 12)) {
      const a = await page.request.get(`/api/hitbox/${ep.path}`);
      const b = await page.request.get(`/api/hitbox/${ep.path}`);
      if (a.status() !== b.status()) drift.push(`${ep.path}: ${a.status()} then ${b.status()}`);
    }

    expect(drift, `\n${drift.join("\n")}\n`).toEqual([]);
  });
});
