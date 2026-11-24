import { test, expect } from "@playwright/test";
import { API, WRITES, COLLECTION_READS } from "../../support/api-surface";

/**
 * The whole API surface, unauthenticated.
 *
 * Every endpoint the console calls, asserted to be refused at the door. This is
 * the broadest security assertion in the suite and the only one that can be
 * made exhaustively without a session: 80-odd endpoints, including every one
 * that moves money, every one that changes ownership and every one that edits
 * access control.
 *
 * `maxRedirects: 0` throughout. Following the redirect is what hides the
 * refusal — a redirect chain ending at the sign-in page answers 200, and a
 * test that accepted that would report a wide-open API as secure.
 */

const REFUSED = [301, 302, 303, 307, 308, 401, 403, 404];

function sample(path: string): string {
  // A syntactically valid but certainly-nonexistent id. If the refusal were
  // ever to depend on the record existing, that would itself be the finding.
  return path
    .replace(/:[A-Za-z]+Id/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:skuCode/g, "E2E-NO-SUCH-CODE");
}

test.describe("API surface — every endpoint refuses an anonymous caller", () => {
  for (const ep of API) {
    test(`${ep.method} ${ep.path}`, async ({ request }) => {
      const url = `/api/hitbox/${sample(ep.path)}`;
      const res = await request.fetch(url, {
        method: ep.method,
        maxRedirects: 0,
        // A body only where the verb takes one; the point is the refusal, and
        // a refusal that depended on the body would be a defect in itself.
        data: ep.method === "GET" || ep.method === "DELETE" ? undefined : {},
        failOnStatusCode: false,
      });

      expect(
        res.status(),
        `${ep.method} ${ep.path} answered ${res.status()} to an anonymous caller`
      ).not.toBe(200);
      expect(REFUSED, `unexpected status ${res.status()}`).toContain(res.status());
    });
  }
});

test.describe("The refusal is the proxy's, not the backend's", () => {
  /**
   * These two properties are what make the ingress worth having. If a request
   * ever reached the backend without a session, the backend would refuse it
   * too — but the console's own token would have been in flight to do it.
   */
  for (const ep of WRITES.slice(0, 12)) {
    test(`${ep.method} ${ep.path} is stopped before any upstream call`, async ({ request }) => {
      const res = await request.fetch(`/api/hitbox/${sample(ep.path)}`, {
        method: ep.method,
        maxRedirects: 0,
        data: ep.method === "DELETE" ? undefined : { e2e: "must never reach the backend" },
        failOnStatusCode: false,
      });

      const body = await res.text();
      // A response shaped by the backend would name a backend error code; a
      // response shaped by the proxy is a redirect to sign-in.
      expect([301, 302, 303, 307, 308, 401]).toContain(res.status());
      expect(body).not.toMatch(/ngrok|:8000/);
      expect(body).not.toMatch(/Bearer\s+\S/);
      expect(body).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    });
  }
});

test.describe("Query handling at the ingress", () => {
  test("query parameters survive the rewrite", async ({ request }) => {
    // The ingress rebuilds the URL as `${API_URL}/api/v1/${path}?${search}`.
    // Losing the query would silently return page 1 of everything, which looks
    // like data rather than like a bug.
    const res = await request.get("/api/hitbox/admin/orders?page=2&status=PAID", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const location = res.headers()["location"] ?? "";
    if (location) {
      expect(decodeURIComponent(location)).toContain("page=2");
      expect(decodeURIComponent(location)).toContain("status=PAID");
    }
  });

  test("a malformed JSON body is rejected as a 422, not passed upstream", async ({ request }) => {
    // The handler parses the body itself and answers VALIDATION_ERROR. That
    // branch sits behind the same session gate, so unauthenticated it is the
    // redirect that answers — asserted here so the ordering is recorded.
    const res = await request.fetch("/api/hitbox/admin/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: "{not json",
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    expect([307, 302, 401, 422]).toContain(res.status());
  });

  test("an unknown path under the ingress is refused, not proxied blindly", async ({ request }) => {
    const res = await request.get("/api/hitbox/admin/definitely-not-an-endpoint", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
  });

  test("the ingress does not answer to a path traversal", async ({ request }) => {
    const res = await request.get("/api/hitbox/../../etc/passwd", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
  });
});

test.describe("Read endpoints are enumerable but not readable", () => {
  test("no collection endpoint leaks a row count or a payload", async ({ request }) => {
    const leaked: string[] = [];

    for (const ep of COLLECTION_READS) {
      const res = await request.get(`/api/hitbox/${ep.path}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      const body = await res.text();
      // A JSON body carrying `data` or `items` from an anonymous call would
      // mean the endpoint answered with real records.
      if (/"(data|items|total)"\s*:/.test(body)) {
        leaked.push(`${ep.path} → ${res.status()} ${body.slice(0, 120)}`);
      }
    }

    expect(leaked, `endpoints returned data to an anonymous caller:\n${leaked.join("\n")}`).toEqual(
      []
    );
  });
});
