import { Permissions } from "../authz";
import type { ProductRow, Role, ScopeType } from "../types";
import {
  CUSTOM_ROLES,
  PERMISSION_GROUPS,
  SYSTEM_ROLES,
  permissionsForRole,
} from "./catalog";
import {
  buildActivity,
  buildDashboard,
  buildDemandSignals,
  buildMedia,
  buildOrders,
  buildProducts,
  buildProvenance,
  buildReleaseApprovals,
  buildResale,
  buildSupply,
  buildTeam,
  resolvePeriod,
} from "./data";
import type { Period } from "../types";

/**
 * An in-process stand-in for the HitBox Collectibles API, used when HITBOX_API_URL is
 * unset. It enforces the same permission gating as the real service so the
 * console can be exercised as every role without a backend.
 *
 * State lives in module scope, so role edits survive within a server process
 * but reset on restart. That is deliberate: it is a demo, not a database.
 */

export interface DemoResult {
  status: number;
  body: unknown;
}

function ok(body: unknown): DemoResult {
  return { status: 200, body };
}

function fail(status: number, code: string, message: string, details: unknown = null): DemoResult {
  return { status, body: { error: { code, message, details } } };
}

/* ---------- mutable role store ---------- */

let roleStore: Role[] | null = null;

function roles(): Role[] {
  if (!roleStore) roleStore = [...SYSTEM_ROLES, ...CUSTOM_ROLES];
  return roleStore;
}

let assignmentStore: Record<
  string,
  { assignmentId: string; roleId: string; scopeType: ScopeType; organizationId: string | null; assignedAt: string }[]
> | null = null;

function assignments() {
  if (!assignmentStore) {
    assignmentStore = {};
    for (const u of buildTeam(
      roles().map((r) => ({ roleId: r.roleId, name: r.name, displayName: r.displayName }))
    )) {
      assignmentStore[u.userId] = u.roles.map((r, i) => ({
        assignmentId: `as-${u.userId.slice(0, 6)}-${i}`,
        roleId: r.roleId,
        scopeType: (roles().find((x) => x.roleId === r.roleId)?.entityGroup === "brand_artist"
          ? "ORGANIZATION"
          : "GLOBAL") as ScopeType,
        organizationId: null,
        assignedAt: "2026-06-01T10:00:00.000Z",
      }));
    }
  }
  return assignmentStore;
}

function naturalScope(role: Role): ScopeType {
  if (role.entityGroup === "brand_artist") return "ORGANIZATION";
  if (role.entityGroup === "end_user") return "OWN";
  return "GLOBAL";
}

function num(v: string | null, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ------------------------------------------------------------------ */

export async function handleDemo(
  path: string,
  method: string,
  search: URLSearchParams,
  body: unknown,
  roleName: string
): Promise<DemoResult> {
  const perms = new Permissions(permissionsForRole(roleName));
  const page = num(search.get("page"), 1);
  const limit = Math.min(num(search.get("limit"), 20), 100);

  /* ---------------- authz/me ---------------- */
  if (path === "authz/me") {
    const role = roles().find((r) => r.name === roleName);
    return ok({
      data: {
        userId: "3f2a9b1c-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
        permissions: permissionsForRole(roleName),
        roles: [
          {
            roleId: role?.roleId ?? "r-sys-01",
            roleName,
            organizationId:
              role && role.entityGroup === "brand_artist"
                ? "org-1000-0000-4000-8000-000000000001"
                : null,
          },
        ],
      },
    });
  }

  /* ---------------- dashboard ---------------- */
  if (path === "admin/dashboard") {
    const type = (search.get("period") ?? "month") as Period;
    const from = search.get("from");
    const to = search.get("to");
    if (type === "custom") {
      if (!from || !to) {
        return fail(422, "VALIDATION_ERROR", "from and to are required when period=custom", {
          from: !from ? "Required" : undefined,
          to: !to ? "Required" : undefined,
        });
      }
      if (Date.parse(from) >= Date.parse(to)) {
        return fail(422, "INVALID_RANGE", "from must be before to");
      }
    }
    const period = resolvePeriod(type, from, to);
    return ok(
      buildDashboard(perms, period, {
        organizationId: search.get("organizationId") ?? undefined,
        marketId: search.get("marketId") ?? undefined,
      })
    );
  }

  /* ---------------- dashboard sub-endpoints ---------------- */
  // Unlike the aggregate, these 403 rather than omitting a key.
  const subGuards: Record<string, () => boolean> = {
    "admin/dashboard/users": () => perms.canRead("buyer-profile"),
    "admin/dashboard/orders": () => perms.canRead("order"),
    "admin/dashboard/finance": () => perms.canRead("payment-royalty"),
    "admin/dashboard/markets": () => perms.canRead("reports-dashboards"),
    "admin/dashboard/products": () => perms.canRead("drop"),
    "admin/dashboard/release-approvals": () => perms.canRead("release-approval"),
    "admin/dashboard/provenance": () => perms.canRead("nfc-tag-claim"),
    "admin/dashboard/supply": () => perms.canRead("drop"),
    "admin/dashboard/resale": () => perms.canRead("order"),
    "admin/dashboard/activity": () => perms.canRead("audit-log"),
    "admin/dashboard/demand-signals": () => perms.canRead("drop"),
  };
  if (path in subGuards && !subGuards[path]()) {
    return fail(403, "AUTHZ_FORBIDDEN", "You do not hold the capability for this resource.");
  }

  if (path === "admin/dashboard/users") {
    const period = resolvePeriod((search.get("period") ?? "month") as Period);
    const d = buildDashboard(perms, period);
    return ok({ data: d.users });
  }
  if (path === "admin/dashboard/orders") {
    return ok(
      buildOrders(perms, {
        page,
        limit,
        status: search.get("status") ?? undefined,
        marketId: search.get("marketId") ?? undefined,
      })
    );
  }
  if (path === "admin/dashboard/finance") {
    const period = resolvePeriod((search.get("period") ?? "month") as Period);
    const d = buildDashboard(perms, period);
    return ok({ data: d.finance });
  }
  if (path === "admin/dashboard/markets") {
    const period = resolvePeriod((search.get("period") ?? "month") as Period);
    const d = buildDashboard(perms, period);
    return ok({ data: d.markets ?? [] });
  }
  if (path === "admin/dashboard/products") {
    return ok(buildProducts({ page, limit, status: search.get("status") ?? undefined }));
  }
  if (path === "admin/dashboard/release-approvals") {
    return ok(buildReleaseApprovals({ page, limit, status: search.get("status") ?? undefined }));
  }
  if (path === "admin/dashboard/provenance") {
    return ok(
      buildProvenance({
        page,
        limit,
        status: search.get("status") ?? undefined,
        caseType: search.get("caseType") ?? undefined,
      })
    );
  }
  if (path === "admin/dashboard/supply") {
    return ok(buildSupply({ page, limit, vendorId: search.get("vendorId") ?? undefined }));
  }
  if (path === "admin/dashboard/resale") {
    return ok(buildResale(perms, { page, limit, status: search.get("status") ?? undefined }));
  }
  if (path === "admin/dashboard/activity") {
    const severity = search.get("severity");
    let items = buildActivity(180, perms.canRead("payment-royalty"));
    if (severity) items = items.filter((e) => e.severity === severity);
    const start = (page - 1) * limit;
    return ok({ page, limit, total: items.length, items: items.slice(start, start + limit) });
  }
  if (path === "admin/dashboard/demand-signals") {
    return ok({ data: buildDemandSignals() });
  }

  /* ---------------- authz administration ---------------- */
  if (path === "admin/authz/permissions") {
    if (!perms.canRead("employee-role-mgmt")) {
      return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:read is required.");
    }
    const domain = search.get("domain");
    const shape = search.get("shape") ?? "grouped";
    const groups = domain
      ? PERMISSION_GROUPS.filter((g) => g.domain === domain)
      : PERMISSION_GROUPS;
    if (shape === "flat") {
      return ok({
        data: groups.flatMap((g) =>
          g.permissions.map((p) => ({ ...p, resource: g.resource, domain: g.domain }))
        ),
        meta: { shape: "flat" },
      });
    }
    return ok({ data: groups, meta: { shape: "grouped" } });
  }

  /* ---------------- drop publishing ---------------- */
  if (path === "admin/dashboard/drops/publish" && method === "POST") {
    if (!perms.can("drop", "manage") && !perms.can("employee-role-mgmt", "manage")) {
      return fail(403, "AUTHZ_FORBIDDEN", "drop:manage is required to publish drops.");
    }
    const b = body as {
      dropId?: string;
      name?: string;
      organizationId?: string;
      totalSupply?: number;
      price?: number;
      currency?: string;
      status?: string;
    };

    if (b.dropId) {
      const published: ProductRow = {
        id: b.dropId,
        name: b.name ?? "Drop",
        status: b.status ?? "PUBLISHED",
        organizationId: b.organizationId ?? "org-1000-0000-4000-8000-000000000005",
        totalSupply: b.totalSupply ?? 500,
        sold: 0,
        available: b.totalSupply ?? 500,
        createdAt: new Date().toISOString(),
      };
      return ok({ data: published });
    }

    if (!b.name?.trim()) {
      return fail(422, "VALIDATION_ERROR", "Drop name is required.", { name: "Required." });
    }
    const supply = Number(b.totalSupply) || 500;
    const created: ProductRow = {
      id: `p-99${Math.floor(Math.random() * 90 + 10)}-0000-4000-8000-${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`,
      name: b.name.trim(),
      status: b.status ?? "PUBLISHED",
      organizationId: b.organizationId ?? "org-1000-0000-4000-8000-000000000005",
      totalSupply: supply,
      sold: 0,
      available: supply,
      createdAt: new Date().toISOString(),
    };
    return { status: 201, body: { data: created } };
  }

  if (path === "admin/authz/roles") {
    if (method === "GET") {
      if (!perms.canRead("employee-role-mgmt")) {
        return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:read is required.");
      }
      return ok({ data: roles() });
    }
    if (method === "POST") {
      if (!perms.can("employee-role-mgmt", "manage")) {
        return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:manage is required.");
      }
      const b = body as Partial<Role> & { permissions?: string[] };
      const fieldErrors: Record<string, string> = {};
      if (!b.name || !/^[A-Z][A-Z0-9_]*$/.test(b.name)) {
        fieldErrors.name = "Must be SCREAMING_SNAKE_CASE.";
      }
      if (roles().some((r) => r.name === b.name)) {
        fieldErrors.name = "A role with this name already exists.";
      }
      if (!b.displayName) fieldErrors.displayName = "Required.";
      if (!b.permissions?.length) fieldErrors.permissions = "Select at least one permission.";
      if (Object.keys(fieldErrors).length) {
        return fail(422, "VALIDATION_ERROR", "The role could not be saved.", fieldErrors);
      }
      // Every permission must be same-domain as the role.
      const offending = (b.permissions ?? []).filter((key) => {
        const g = PERMISSION_GROUPS.find((grp) => grp.permissions.some((p) => p.key === key));
        return !g || g.domain !== b.domain;
      });
      if (offending.length) {
        return fail(
          400,
          "AUTHZ_DOMAIN_VIOLATION",
          `Permissions must match the role domain (${b.domain}).`,
          { permissions: offending }
        );
      }
      const created: Role = {
        roleId: `r-cus-${Math.random().toString(36).slice(2, 8)}`,
        name: b.name!,
        displayName: b.displayName!,
        entityGroup: b.entityGroup ?? "hitbox",
        domain: b.domain ?? "BUSINESS",
        isSystem: false,
        isActive: true,
        permissions: b.permissions!,
        assignmentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      roleStore = [...roles(), created];
      return { status: 201, body: { data: created } };
    }
  }

  const roleMatch = path.match(/^admin\/authz\/roles\/([^/]+)$/);
  if (roleMatch) {
    const roleId = roleMatch[1];
    const role = roles().find((r) => r.roleId === roleId);
    if (!role) return fail(404, "NOT_FOUND", "Role not found.");

    if (method === "GET") {
      if (!perms.canRead("employee-role-mgmt")) {
        return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:read is required.");
      }
      return ok({ data: role });
    }
    if (!perms.can("employee-role-mgmt", "manage")) {
      return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:manage is required.");
    }
    if (method === "PATCH") {
      const b = body as Partial<Role>;
      // A system role's permissions are immutable; deactivating it is allowed.
      if (role.isSystem && b.permissions) {
        return fail(403, "AUTHZ_ROLE_IMMUTABLE", "Seeded platform roles cannot be edited.");
      }
      if (b.permissions) {
        const offending = b.permissions.filter((key) => {
          const g = PERMISSION_GROUPS.find((grp) => grp.permissions.some((p) => p.key === key));
          return !g || g.domain !== (b.domain ?? role.domain);
        });
        if (offending.length) {
          return fail(400, "AUTHZ_DOMAIN_VIOLATION", "Permissions must match the role domain.", {
            permissions: offending,
          });
        }
      }
      const updated: Role = { ...role, ...b, updatedAt: new Date().toISOString() };
      roleStore = roles().map((r) => (r.roleId === roleId ? updated : r));
      return ok({ data: updated });
    }
    if (method === "DELETE") {
      if (role.isSystem) {
        return fail(403, "AUTHZ_ROLE_IMMUTABLE", "Seeded platform roles cannot be deleted.");
      }
      if ((role.assignmentCount ?? 0) > 0) {
        return fail(
          409,
          "AUTHZ_ROLE_IN_USE",
          "Revoke every assignment of this role before deleting it."
        );
      }
      roleStore = roles().filter((r) => r.roleId !== roleId);
      return ok({ data: { roleId } });
    }
  }

  /* ---------------- team ---------------- */
  if (path === "admin/authz/users") {
    if (!perms.canRead("employee-role-mgmt")) {
      return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:read is required.");
    }
    const team = buildTeam(
      roles().map((r) => ({ roleId: r.roleId, name: r.name, displayName: r.displayName }))
    ).map((u) => {
      const live = assignments()[u.userId] ?? [];
      return {
        ...u,
        roles: live
          .map((a) => {
            const r = roles().find((x) => x.roleId === a.roleId);
            return r
              ? { roleId: r.roleId, roleName: r.name, displayName: r.displayName }
              : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
      };
    });
    const q = (search.get("q") ?? "").toLowerCase();
    const filtered = q
      ? team.filter(
          (u) =>
            u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        )
      : team;
    return ok({ page: 1, limit: filtered.length, total: filtered.length, items: filtered });
  }

  const userRolesMatch = path.match(/^admin\/authz\/users\/([^/]+)\/roles$/);
  if (userRolesMatch) {
    const userId = userRolesMatch[1];
    if (method === "GET") {
      if (!perms.canRead("employee-role-mgmt")) {
        return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:read is required.");
      }
      const list = (assignments()[userId] ?? []).map((a) => {
        const r = roles().find((x) => x.roleId === a.roleId);
        return {
          assignmentId: a.assignmentId,
          roleId: a.roleId,
          roleName: r?.name ?? "UNKNOWN",
          displayName: r?.displayName ?? "Unknown role",
          scopeType: a.scopeType,
          organizationId: a.organizationId,
          assignedAt: a.assignedAt,
          revokedAt: null,
        };
      });
      return ok({ data: list });
    }
    if (method === "POST") {
      if (!perms.can("employee-role-mgmt", "assign")) {
        return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:assign is required.");
      }
      const b = body as { roleId?: string; scopeType?: ScopeType; organizationId?: string | null };
      const role = roles().find((r) => r.roleId === b.roleId);
      if (!role) return fail(404, "NOT_FOUND", "Role not found.");
      const scopeType = b.scopeType ?? naturalScope(role);
      if (scopeType === "ORGANIZATION" && !b.organizationId) {
        return fail(422, "VALIDATION_ERROR", "organizationId is required for ORGANIZATION scope.", {
          organizationId: "Required for ORGANIZATION scope.",
        });
      }
      if (scopeType !== "ORGANIZATION" && b.organizationId) {
        return fail(422, "VALIDATION_ERROR", "organizationId is only valid for ORGANIZATION scope.", {
          organizationId: `Not accepted for ${scopeType} scope.`,
        });
      }
      const existing = assignments()[userId] ?? [];
      if (existing.some((a) => a.roleId === role.roleId)) {
        return fail(409, "VALIDATION_ERROR", "This role is already assigned to the user.");
      }
      assignments()[userId] = [
        ...existing,
        {
          assignmentId: `as-${Math.random().toString(36).slice(2, 9)}`,
          roleId: role.roleId,
          scopeType,
          organizationId: scopeType === "ORGANIZATION" ? (b.organizationId ?? null) : null,
          assignedAt: new Date().toISOString(),
        },
      ];
      return { status: 201, body: { data: { userId, roleId: role.roleId, scopeType } } };
    }
  }

  const revokeMatch = path.match(/^admin\/authz\/users\/([^/]+)\/roles\/([^/]+)$/);
  if (revokeMatch && method === "DELETE") {
    if (!perms.can("employee-role-mgmt", "delete")) {
      return fail(403, "AUTHZ_FORBIDDEN", "employee-role-mgmt:delete is required.");
    }
    const [, userId, roleId] = revokeMatch;
    const existing = assignments()[userId] ?? [];
    if (!existing.some((a) => a.roleId === roleId)) {
      return fail(404, "NOT_FOUND", "Assignment not found.");
    }
    // Revoking is a soft delete; the row survives for audit.
    assignments()[userId] = existing.filter((a) => a.roleId !== roleId);
    return ok({ data: { userId, roleId, revokedAt: new Date().toISOString() } });
  }

  /* ---------------- media ---------------- */
  if (path === "admin/media" && method === "GET") {
    if (!perms.hasResource("assets-documents-upload")) {
      return fail(403, "AUTHZ_FORBIDDEN", "assets-documents-upload is required.");
    }
    return ok(
      buildMedia({
        page,
        limit,
        assetType: search.get("assetType") ?? undefined,
        virusScanStatus: search.get("virusScanStatus") ?? undefined,
      })
    );
  }

  if (path === "admin/media/upload-url" && method === "POST") {
    // No bucket is configured in demo mode - surface the real failure mode.
    return fail(
      503,
      "STORAGE_UNAVAILABLE",
      "Media storage is not configured on this deployment (MEDIA_S3_BUCKET unset)."
    );
  }

  const assetUrlMatch = path.match(/^admin\/media\/([^/]+)\/url$/);
  if (assetUrlMatch) {
    return fail(
      404,
      "NOT_FOUND",
      "Asset not found, not CLEAN, archived, or out of scope."
    );
  }

  const assetMatch = path.match(/^admin\/media\/([^/]+)$/);
  if (assetMatch && method === "DELETE") {
    if (!perms.can("assets-documents-upload", "manage")) {
      return fail(403, "AUTHZ_FORBIDDEN", "assets-documents-upload:manage is required.");
    }
    return ok({ data: { assetId: assetMatch[1], archivedAt: new Date().toISOString() } });
  }

  return fail(404, "NOT_FOUND", `No demo handler for /${path}`);
}
