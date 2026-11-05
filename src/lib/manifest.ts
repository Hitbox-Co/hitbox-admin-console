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
 *    `qcStatus` and `qcNotes` columns — the vendor's own factory QC — a
 *    `variant` (or `variantCode`) column, and `key0`, `key1`, `key2` columns:
 *    the keys the vendor wrote onto each chip (all three or none per row).
 *    Keys are sent once and wrapped by the API; nothing here keeps them.
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

/** Header spellings accepted for each chip key column. */
const KEY_HEADERS: Record<"key0" | "key1" | "key2", string[]> = {
  key0: ["key0", "key00", "key_0", "key_00", "key 00", "master_key"],
  key1: ["key1", "key01", "key_1", "key_01", "key 01"],
  key2: ["key2", "key02", "key_2", "key_02", "key 02"],
};

/** A chip key with any separators removed, upper-cased. */
export function normalizeKey(key: string): string {
  return key.replace(/[\s:-]/g, "").toUpperCase();
}

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
    const keyCols = {
      key0: header.findIndex((h) => KEY_HEADERS.key0.includes(h)),
      key1: header.findIndex((h) => KEY_HEADERS.key1.includes(h)),
      key2: header.findIndex((h) => KEY_HEADERS.key2.includes(h)),
    };
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
      const keys = (["key0", "key1", "key2"] as const).map((name) =>
        keyCols[name] >= 0 ? normalizeKey(cells[keyCols[name]] ?? "") : ""
      );
      const given = keys.filter(Boolean).length;
      if (given === 3) {
        if (keys.some((k) => !/^[0-9A-F]{32}$/.test(k))) {
          problems.push({ row: n, message: "a key is not 32 hex characters (16 bytes)" });
        } else if (new Set(keys).size !== 3) {
          problems.push({ row: n, message: "key0, key1 and key2 must all be different" });
        }
        [row.key0, row.key1, row.key2] = keys;
      } else if (given > 0) {
        problems.push({ row: n, message: "give all three keys (key0, key1, key2) or none" });
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
  const keyed = rows.some((r) => r.key0);
  const rich = keyed || rows.some((r) => r.qcStatus || r.qcNotes || r.variantId);
  if (!rich) return rows.map((r) => r.uid).join("\n");
  const esc = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const code = (id?: string) =>
    id ? (lines.find((l) => l.variantId === id)?.variantCode ?? id) : "";
  return [
    keyed ? "uid,variant,qcStatus,qcNotes,key0,key1,key2" : "uid,variant,qcStatus,qcNotes",
    ...rows.map((r) =>
      [
        r.uid,
        esc(code(r.variantId)),
        r.qcStatus ?? "",
        esc(r.qcNotes ?? ""),
        ...(keyed ? [r.key0 ?? "", r.key1 ?? "", r.key2 ?? ""] : []),
      ].join(",")
    ),
  ].join("\n");
}

export function chunkManifest<T>(rows: T[], size = SUPPLY_MANIFEST_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * One row of the row-by-row editor: what the person typed, kept as typed so a
 * half-entered key is not lost between keystrokes. Turned into manifest text
 * by `entriesToCsv`, so the editor and a pasted file go through the same
 * `parseManifest` checks.
 */
export interface ManifestEntry {
  uid: string;
  variantId: string;
  qcStatus: "" | TagQcStatus;
  qcNotes: string;
  key0: string;
  key1: string;
  key2: string;
}

export function emptyEntry(): ManifestEntry {
  return { uid: "", variantId: "", qcStatus: "", qcNotes: "", key0: "", key1: "", key2: "" };
}

/** True when the person has typed nothing in the row (a spare row is not a chip). */
export function isBlankEntry(e: ManifestEntry): boolean {
  return !e.uid.trim() && !e.variantId && !e.qcStatus && !e.qcNotes.trim() &&
    !e.key0.trim() && !e.key1.trim() && !e.key2.trim();
}

/**
 * The editor's rows as manifest text. Blank rows are skipped, so manifest row
 * N is the N-th non-blank editor row — `entryIndexes` maps it back.
 */
export function entriesToCsv(entries: ManifestEntry[]): string {
  const filled = entries.filter((e) => !isBlankEntry(e));
  if (filled.length === 0) return "";
  const esc = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    "uid,variant,qc_status,qc_notes,key0,key1,key2",
    ...filled.map((e) =>
      [e.uid.trim(), e.variantId, e.qcStatus, esc(e.qcNotes.trim()), e.key0.trim(), e.key1.trim(), e.key2.trim()].join(",")
    ),
  ].join("\n");
}

/** Editor positions of the non-blank rows: manifest row N is entries[result[N - 1]]. */
export function entryIndexes(entries: ManifestEntry[]): number[] {
  return entries.flatMap((e, i) => (isBlankEntry(e) ? [] : [i]));
}

/** Parsed manifest rows back into editor rows (after loading a file, or switching from text). */
export function entriesFromRows(rows: TagManifestRow[]): ManifestEntry[] {
  return rows.map((r) => ({
    uid: r.uid,
    variantId: r.variantId ?? "",
    qcStatus: r.qcStatus ?? "",
    qcNotes: r.qcNotes ?? "",
    key0: r.key0 ?? "",
    key1: r.key1 ?? "",
    key2: r.key2 ?? "",
  }));
}
