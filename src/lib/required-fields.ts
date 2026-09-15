import type { z } from "zod";

/**
 * Which keys of a zod object schema are required — i.e. `field.isOptional()`
 * is false, so the schema itself refuses a request missing that key.
 *
 * This exists so a form's asterisks track the schema that actually validates
 * it, rather than being a second, hand-typed list of "which fields matter"
 * that silently drifts from the real one the moment either changes.
 *
 * Each form colocates a small zod schema next to its state — deliberately its
 * OWN schema, not the backend's DTO imported across the wire: the backend's
 * zod lives in a different package and its `.transform()` pipelines (see
 * product-upload-api.md §1 — "500" → 500, "" → null, etc.) would make
 * `isOptional()` answer questions about the wrong layer. What matters here is
 * "does this **form** treat the field as required", which is a client-side
 * fact even when both schemas agree on the answer.
 */
export function requiredKeys<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>
): ReadonlySet<keyof Shape> {
  const out = new Set<keyof Shape>();
  for (const [key, field] of Object.entries(schema.shape) as [
    keyof Shape,
    z.ZodTypeAny,
  ][]) {
    if (!field.isOptional()) out.add(key);
  }
  return out;
}
