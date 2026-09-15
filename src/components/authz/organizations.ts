/**
 * Organizations offered when assigning an ORGANIZATION-scoped role, and when
 * setting a drop's brand.
 *
 * The API still has no organization-list endpoint, so these mirror the seeded
 * set — but they are now the **real row ids**, read out of the database.
 *
 * They previously read `org-1000-0000-4000-8000-000000000001`, which is not a
 * uuid at all ("org-" is not hex). Every place the API validates the field
 * with `z.string().uuid()` rejected it, so picking a brand on Add product was
 * a guaranteed `422 VALIDATION_ERROR` and an ORGANIZATION-scoped role
 * assignment would have failed the same way.
 *
 * Replace the whole list with a live fetch the moment an endpoint exists: a
 * hardcoded id that is merely *stale* still 403s with SCOPE_MISMATCH, which is
 * harder to spot than a malformed one.
 */
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

/**
 * Artists, for the same reason and with the same caveat — `artistId` is also
 * validated as a uuid.
 */
export const ARTIST_OPTIONS = [
  { id: "18562582-d02a-410e-9965-f4057d5dae9e", name: "Lumen" },
  { id: "16793985-814a-4aa5-8bc4-a792deeb8379", name: "Ronin" },
  { id: "23ef4303-f877-4dc5-a375-ab4fe568b361", name: "Kaze" },
];
