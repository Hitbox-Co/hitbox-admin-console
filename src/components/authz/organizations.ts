/**
 * Organizations offered when assigning an ORGANIZATION-scoped role.
 *
 * The API has no organization-list endpoint in the documented surface, so
 * these mirror the seeded set. Replace with a live fetch the moment one
 * exists — assigning against a stale id would 403 with SCOPE_MISMATCH.
 */
export const ORGANIZATION_OPTIONS = [
  { id: "org-1000-0000-4000-8000-000000000001", name: "Nocturne Athletics" },
  { id: "org-1000-0000-4000-8000-000000000002", name: "Vantablack Studio" },
  { id: "org-1000-0000-4000-8000-000000000003", name: "Kite & Ash" },
  { id: "org-1000-0000-4000-8000-000000000004", name: "Rei Tanaka" },
  { id: "org-1000-0000-4000-8000-000000000005", name: "HitBox Collectibles" },
];
