import {
  SUPPLY_MANIFEST_MAX,
  type SupplyBatchLine,
  type TagManifestRow,
  type TagQcStatus,
} from "./types";

/**
 * Client-side parsing of a vendor's chip manifest.
 *
 * Nothing parses spreadsheets server-side, so turning the vendor's file into
 * `tags[]` is the console's job. Two shapes are accepted:
 *
 *  - a bare list, one UID per line (commas and semicolons also split), and
 *  - a CSV whose first line is a header naming a `uid` column, with optional
 *    `qcStatus` and `qcNotes` columns — the vendor's own factory QC — and a
 *    `variant` (or `variantCode`) column.
 *
 * A consignment split into lines (a by-variant drop) needs every row to name
 * its variant. The file names it by variantCode — what is on the vendor's
 * paperwork — and it is mapped to `variantId` from the consignment's own
 * lines here. A bare list takes one variant for every row (`defaultVariantId`).
 *
 * Separator style inside a UID is left alone: the API normalises
 * 04:A3:…, 04-a3-… and 04a39b… to the same chip. `normalizeUid` exists only
 * to catch the same chip listed twice before a round trip does.
 */

const QC_STATUSES: TagQcStatus[] = ["PENDING", "PASSED", "FAILED"];

export interface ParsedManifest {
  rows: TagManifestRow[];
  /** Problems found before sending — 1-based manifest row numbers. */
  problems: { row: number; message: string }[];
}

export function normalizeUid(uid: string): string {
  return uid.replace(/[\s:-]/g, "").toUpperCase();
}

/** Splits one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export interface ManifestOptions {
  /** The consignment's lines. Empty → rows must NOT carry a variant. */
  lines?: SupplyBatchLine[];
  /** Applied to every row the file does not give a variant for. */
  defaultVariantId?: string;
}

/** Matches a cell against a line by variantCode, label or id, ignoring case. */
function resolveVariant(cell: string, lines: SupplyBatchLine[]): string | undefined {
  const v = cell.trim().toLowerCase();
  return lines.find(
    (l) =>
      l.variantId.toLowerCase() === v ||
      l.variantCode?.toLowerCase() === v ||
      l.label?.toLowerCase() === v
  )?.variantId;
}

export function parseManifest(raw: string, opts: ManifestOptions = {}): ParsedManifest {
  const batchLines = opts.lines ?? [];
  const split = batchLines.length > 0;
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows: TagManifestRow[] = [];
  const problems: ParsedManifest["problems"] = [];

  const header = lines[0] ? splitCsvLine(lines[0]).map((h) => h.toLowerCase()) : [];
  const uidCol = header.indexOf("uid");

  if (uidCol === -1) {
    for (const uid of raw.split(/[\r\n,;]+/).map((l) => l.trim()).filter(Boolean)) {
      rows.push({ uid });
    }
  } else {
    const qcCol = header.findIndex((h) => h === "qcstatus" || h === "qc_status" || h === "qc");
    const notesCol = header.findIndex((h) => h === "qcnotes" || h === "qc_notes" || h === "notes");
    const variantCol = header.findIndex((h) =>
      ["variant", "variantcode", "variant_code", "variantid", "variant_id", "sku"].includes(h)
    );
    lines.slice(1).forEach((line) => {
      const cells = splitCsvLine(line);
      const row: TagManifestRow = { uid: cells[uidCol] ?? "" };
      const n = rows.length + 1;
      const qc = qcCol >= 0 ? cells[qcCol]?.toUpperCase() : "";
      if (qc) {
        if (QC_STATUSES.includes(qc as TagQcStatus)) row.qcStatus = qc as TagQcStatus;
        else problems.push({ row: n, message: `qcStatus "${cells[qcCol]}" is not PENDING, PASSED or FAILED` });
      }
      const notes = notesCol >= 0 ? cells[notesCol] : "";
      if (notes) {
        if (notes.length > 500) problems.push({ row: n, message: "qcNotes is longer than 500 characters" });
        row.qcNotes = notes;
      }
      const variant = variantCol >= 0 ? cells[variantCol]?.trim() : "";
      if (variant) {
        if (!split) {
          problems.push({ row: n, message: "this consignment has no variant lines — leave the variant column empty" });
        } else {
          const id = resolveVariant(variant, batchLines);
          if (id) row.variantId = id;
          else problems.push({ row: n, message: `variant "${variant}" is not one of this consignment's lines` });
        }
      }
      rows.push(row);
    });
  }

  if (split) {
    rows.forEach((r, i) => {
      if (r.variantId) return;
      if (opts.defaultVariantId) r.variantId = opts.defaultVariantId;
      else if (!problems.some((p) => p.row === i + 1)) {
        problems.push({ row: i + 1, message: "no variant — add a variant column or pick one for all rows" });
      }
    });
  }

  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const n = i + 1;
    const key = normalizeUid(r.uid);
    if (!/^[0-9A-F]{8,64}$/.test(key)) {
      problems.push({ row: n, message: "not a hex chip UID of 8–64 characters" });
      return;
    }
    const first = seen.get(key);
    if (first) problems.push({ row: n, message: `same chip as row ${first}` });
    else seen.set(key, n);
  });

  problems.sort((a, b) => a.row - b.row);
  return { rows, problems };
}

/** Rows per variant, for checking against each line's remaining room. */
export function countByVariant(rows: TagManifestRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (r.variantId) out.set(r.variantId, (out.get(r.variantId) ?? 0) + 1);
  return out;
}

/**
 * Serialises rows back to text the parser accepts — used to keep what is
 * left after a partial commit. Variants are written by variantCode when the
 * line has one, so the text stays readable.
 */
export function formatManifest(rows: TagManifestRow[], lines: SupplyBatchLine[] = []): string {
  const rich = rows.some((r) => r.qcStatus || r.qcNotes || r.variantId);
  if (!rich) return rows.map((r) => r.uid).join("\n");
  const esc = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const code = (id?: string) =>
    id ? (lines.find((l) => l.variantId === id)?.variantCode ?? id) : "";
  return [
    "uid,variant,qcStatus,qcNotes",
    ...rows.map((r) =>
      [r.uid, esc(code(r.variantId)), r.qcStatus ?? "", esc(r.qcNotes ?? "")].join(",")
    ),
  ].join("\n");
}

export function chunkManifest<T>(rows: T[], size = SUPPLY_MANIFEST_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
