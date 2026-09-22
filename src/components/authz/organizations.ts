
export interface OrganizationOption {
  id: string;
  name: string;
  /** HITBOX | BRAND | ARTIST_INDIVIDUAL — shown so the picker is unambiguous. */
  type: string;
}

export const ORGANIZATION_OPTIONS: OrganizationOption[] = [
  { id: "90ff1548-ae54-4d9c-9e01-ac552d41e4c7", name: "Lumen Studios", type: "BRAND" },
  { id: "0740e970-aaf3-4dc0-b405-fb381adfc3d1", name: "Ronin Collective", type: "BRAND" },
  { id: "f3bb6065-76c0-4fc9-8d57-a3fcd93d9bfa", name: "Kaze (solo)", type: "ARTIST_INDIVIDUAL" },
  { id: "1cabd03c-2b3b-4c9c-8269-28f617b2bc46", name: "HitBox", type: "HITBOX" },
];

/*
 * There is no ARTIST_OPTIONS any more. The drop form reads both directories
 * live from /admin/organizations and /admin/artists (useOrganizations /
 * useArtists); these seed uuids exist only in this database and fail
 * validation anywhere else.
 *
 * ORGANIZATION_OPTIONS survives only for the authz screens, which label an
 * organizationId they already hold. Those are gated on team and role
 * permissions, while the directories are gated on drop:read — so they cannot
 * simply switch to the same source without a caller who holds that grant.
 */
