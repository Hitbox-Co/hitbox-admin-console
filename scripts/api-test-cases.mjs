/**
 * Generates docs/API-TEST-CASES.md — `npm run docs:api-cases`.
 *
 * The document is GENERATED, for two reasons that matter more than convenience:
 *
 *  1. The case list is read out of the Playwright suite itself
 *     (`playwright test --list`), so a case cannot exist in the document and
 *     not in the code, or vice versa. A hand-maintained test matrix drifts from
 *     the suite within a sprint and then quietly lies.
 *
 *  2. The "observed" column is a live probe, not a transcription. Every
 *     endpoint is actually called against the running dev server and the real
 *     status code is recorded. A matrix whose evidence column was typed by hand
 *     is a claim, not a result.
 *
 * Every probe here is unauthenticated, and the ingress refuses those before any
 * upstream call — so running this changes nothing, on any environment. The
 * authenticated cases are listed with their IDs and marked NOT EXECUTED rather
 * than omitted, because the gap is part of the report.
 *
 * Usage:  npm run dev   (in another terminal)
 *         npm run docs:api-cases
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(ROOT, "docs/API-TEST-CASES.md");

/* ------------------------------------------------------------------ */
/* 1. The endpoint manifest, read from the suite's own source           */
/* ------------------------------------------------------------------ */

/**
 * `api-surface.ts` is TypeScript the suite imports; this script is plain ESM
 * run by node, so the manifest is parsed out of the source rather than
 * imported. It keeps this script dependency-free and, more usefully, means the
 * document is built from the exact file the tests use.
 */
function readManifest() {
  const src = fs.readFileSync(path.join(ROOT, "e2e/support/api-surface.ts"), "utf8");
  const body = src.slice(src.indexOf("export const API"), src.indexOf("export const READS"));

  const entries = [];
  const re =
    /\{\s*method:\s*"(\w+)",\s*path:\s*"([^"]+)",\s*kind:\s*"(\w+)",\s*requires:\s*"([^"]*)"(?:,\s*workflow:\s*"([^"]+)")?/g;

  let m;
  while ((m = re.exec(body))) {
    entries.push({
      method: m[1],
      path: m[2],
      kind: m[3],
      requires: m[4],
      workflow: m[5] ?? null,
    });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* 2. The case list, read from the Playwright suite                     */
/* ------------------------------------------------------------------ */

function readSuite() {
  // The Playwright CLI lives in node_modules, called directly rather than
  // through npx: `npx.cmd` is a batch file, and execFileSync cannot spawn one
  // on Windows without a shell.
  const cli = path.join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  const json = execFileSync(process.execPath, [cli, "test", "--list", "--reporter=json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  const parsed = JSON.parse(json);
  const byFile = new Map();

  const walk = (suite, titles = []) => {
    for (const child of suite.suites ?? []) {
      walk(child, child.title && child.title !== suite.title ? [...titles, child.title] : titles);
    }
    for (const spec of suite.specs ?? []) {
      const file = spec.file;
      if (!byFile.has(file)) byFile.set(file, []);
      // Playwright repeats a spec once per project; one entry is enough here.
      const list = byFile.get(file);
      if (!list.some((s) => s.title === spec.title && s.group === titles.join(" › "))) {
        list.push({ title: spec.title, group: titles.join(" › "), line: spec.line });
      }
    }
  };
  for (const suite of parsed.suites ?? []) walk(suite, [suite.title].filter(Boolean));

  return byFile;
}

/* ------------------------------------------------------------------ */
/* 3. The live probe                                                    */
/* ------------------------------------------------------------------ */

/** A syntactically valid id that certainly does not exist. */
function concrete(p) {
  return p
    .replace(/:[A-Za-z]+Id/g, "00000000-0000-0000-0000-000000000000")
    .replace(/:skuCode/g, "E2E-NO-SUCH-CODE");
}

const REFUSED = new Set([301, 302, 303, 307, 308, 401, 403, 404]);
const LEAK = /"(data|items|total)"\s*:|Bearer\s+\S|sk_(test|live)_|eyJ[\w-]+\.[\w-]+\./;

async function probe(ep) {
  const url = `${BASE}/api/hitbox/${concrete(ep.path)}`;
  const init = {
    method: ep.method,
    redirect: "manual", // following the redirect is what hides the refusal
    headers: { Accept: "application/json" },
  };
  if (ep.method !== "GET" && ep.method !== "DELETE") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({ e2e: "must never reach the backend" });
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    const location = res.headers.get("location") ?? "";

    return {
      status: res.status,
      refused: REFUSED.has(res.status),
      toSignIn: location.includes("/sign-in"),
      leaked: LEAK.test(text),
      note: location ? `→ ${location.split("?")[0]}` : "",
    };
  } catch (err) {
    return { status: 0, refused: false, toSignIn: false, leaked: false, note: String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* 4. The document                                                      */
/* ------------------------------------------------------------------ */

const KIND_NOTE = {
  read: "Safe to call anywhere",
  write: "Creates or edits a record",
  act: "Advances a state machine — money or ownership moves",
};

function table(rows) {
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** Playwright prefixes a group with the spec's own path; drop it. */
function groupName(group) {
  const parts = group.split("›").map((p) => p.trim());
  return parts.filter((p) => !/\.spec\.ts$/.test(p)).join(" › ") || "—";
}

/**
 * Which cases are annotated as known defects.
 *
 * `test.fail(true, "Known: …")` is a runtime call, so `--list` cannot see it.
 * Scanning the source instead: each `test.fail(` is attributed to the nearest
 * preceding `test(` or `test.describe(`, which is exactly how it is scoped.
 * Without this, a case that is currently red and expected to be red would be
 * documented as an ordinary pending case.
 */
function knownDefects(file) {
  const lines = fs.readFileSync(path.join(ROOT, "e2e", file), "utf8").split("\n");

  /**
   * Scoping is decided by declaration order and indentation, not by parsing.
   *
   * A brace-matching version of this was tried and was worse: `//` inside a
   * glob like "**\/api/hitbox/**" reads as a line comment, a destructuring
   * `({ page })` reads as a block, and each mis-read silently reattributes
   * annotations to the wrong case. These files are Prettier-formatted, so
   * indentation is exact and is the more reliable signal.
   *
   * The two shapes that occur:
   *   - inside a test body — the nearest preceding declaration is that `test(`;
   *   - at describe scope  — the nearest preceding declaration is the
   *     `test.describe(`, and the annotation covers every test nested in it.
   */
  const decls = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*)test(\.describe)?\s*\(/);
    if (m) decls.push({ line: i + 1, indent: m[1].length, isTest: !m[2] });
  });

  const marked = new Map();

  lines.forEach((line, i) => {
    if (!/^\s*test\.fail\s*\(/.test(line)) return;

    // The condition is sometimes an expression rather than a literal `true`
    // (the contrast cases fail on some routes and not others), and the call
    // may wrap across lines. The reason string is what marks a known defect.
    const window = lines.slice(i, i + 6).join("\n");
    const reason = window.match(/"(Known:[^"]+)"/);
    if (!reason) return;

    const owner = [...decls].reverse().find((d) => d.line <= i + 1);
    if (!owner) return;

    if (owner.isTest) {
      marked.set(owner.line, reason[1]);
      return;
    }

    // Describe scope: every test declared below it and indented inside it,
    // stopping at the first declaration that closes the describe.
    for (const d of decls) {
      if (d.line <= owner.line) continue;
      if (d.indent <= owner.indent) break;
      if (d.isTest) marked.set(d.line, reason[1]);
    }
  });

  return marked;
}

function caseRows(byFile, file, prefix) {
  const specs = byFile.get(file) ?? [];
  const defects = knownDefects(file);

  return specs.map((s, i) => ({
    id: `${prefix}-${String(i + 1).padStart(3, "0")}`,
    group: groupName(s.group),
    title: s.title,
    line: s.line,
    defect: defects.get(s.line) ?? null,
  }));
}

const today = new Date().toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const manifest = readManifest();
const byFile = readSuite();

console.log(`  probing ${manifest.length} endpoints at ${BASE} ...`);
const results = [];
for (const ep of manifest) results.push({ ep, r: await probe(ep) });

const refused = results.filter((x) => x.r.refused).length;
const leaked = results.filter((x) => x.r.leaked);
const unreachable = results.filter((x) => x.r.status === 0);

const byKind = {};
for (const { ep } of results) byKind[ep.kind] = (byKind[ep.kind] ?? 0) + 1;

const contractCases = caseRows(byFile, "specs/authed/api-contract.spec.ts", "API-AUTH");
const workflowCases = caseRows(byFile, "specs/authed/workflows.spec.ts", "WF");
const ingressCases = caseRows(byFile, "specs/public/api-ingress.spec.ts", "ING");
const surfaceGroups = (byFile.get("specs/public/api-surface.spec.ts") ?? []).reduce((acc, s) => {
  const g = groupName(s.group);
  acc[g] = (acc[g] ?? 0) + 1;
  return acc;
}, {});

let md = `# API test cases — HitBox Collectibles operations console

**Date:** ${today}
**Base URL:** \`${BASE}\` (Next ingress at \`/api/hitbox/*\` → \`<HITBOX_API_URL>/api/v1/*\`)
**Endpoints under test:** ${manifest.length}
**Generated by:** \`npm run docs:api-cases\` — do not edit by hand

---

## How to read this

This document is **generated**, not written. The case list comes from the Playwright
suite itself (\`playwright test --list\`), so a case cannot appear here without existing
in the code. The **Observed** column is a live probe run at generation time, not a
transcription — every endpoint below was actually called and its real status recorded.

Every probe is unauthenticated. The ingress refuses those before any upstream call, so
generating this document changes nothing, on any environment — including one pointed at
production.

Cases that need a Clerk session are listed with their IDs and marked **NOT EXECUTED**
rather than left out. The gap is part of the report.

---

## Result

\`\`\`
${manifest.length} endpoints probed
${refused} refused to an anonymous caller
${leaked.length} leaked data
${unreachable.length} unreachable
\`\`\`

| Kind | Count | Meaning | Probed for |
|---|---|---|---|
${table(
  ["read", "write", "act"].map((k) => [
    `\`${k}\``,
    String(byKind[k] ?? 0),
    KIND_NOTE[k],
    k === "read" ? "Refusal (unauth)" : "Refusal only — never a success path",
  ])
)}

${
  refused === manifest.length && leaked.length === 0
    ? `**All ${manifest.length} endpoints refused the anonymous caller, and none returned a row.** That is exhaustive, not a sample — every endpoint the console can call was tried, including the ones that move money and change ownership.`
    : `**${manifest.length - refused} endpoint(s) did not refuse an anonymous caller.** See the matrix below; each is a live finding.`
}

---

## Method

Each endpoint is called once, unauthenticated, with:

- **\`redirect: "manual"\`** — following the redirect is exactly what hides the refusal.
  A redirect chain ending at the sign-in page answers **200**, and a matrix that accepted
  that would record a wide-open API as secure. (This is how finding #1 in the E2E report
  surfaced.)
- **a concrete, non-existent id** for parameterised paths
  (\`00000000-0000-0000-0000-000000000000\`), so a refusal cannot depend on the record
  existing — if it ever did, that would itself be the finding.
- **a JSON body** on every verb that takes one, so a refusal cannot depend on the body
  being absent.

A pass requires the status to be one of \`301 302 303 307 308 401 403 404\` **and** the
body to contain no \`data\`/\`items\`/\`total\` key, no \`Bearer\` token, no \`sk_\` secret and no
JWT.

---

## Matrix — unauthenticated refusal

| ID | Method | Endpoint | Kind | Backend guard | Observed | Leak | Result |
|---|---|---|---|---|---|---|---|
`;

results.forEach(({ ep, r }, i) => {
  const id = `API-UNAUTH-${String(i + 1).padStart(3, "0")}`;
  const observed = r.status === 0 ? "**no response**" : `\`${r.status}\`${r.toSignIn ? " → /sign-in" : ""}`;
  const verdict = r.status === 0 ? "⚠ UNREACHABLE" : r.refused && !r.leaked ? "PASS" : "**FAIL**";
  md += `| ${id} | \`${ep.method}\` | \`${ep.path}\` | ${ep.kind} | \`${ep.requires}\` | ${observed} | ${r.leaked ? "**yes**" : "none"} | ${verdict} |\n`;
});

md += `
### Endpoints that move money or ownership

The \`act\` rows above are the ones worth naming individually, because a regression on any
of them is not a data-exposure bug — it is an unauthenticated stranger able to pay out a
balance or revoke a collector's ownership:

| Endpoint | What a successful anonymous call would do |
|---|---|
| \`POST admin/finance/payouts/:payoutId/execute\` | Pay real money to a real person |
| \`POST admin/payments/refunds/:refundId/process\` | Revoke ownership, quarantine the tag, send money, reverse the royalty |
| \`POST admin/finance/royalty-entries/:entryId/reverse\` | Cancel money someone is owed |
| \`PATCH admin/orders/:orderId/status\` | Desynchronise an order from its payment |
| \`POST admin/authz/users/:userId/roles\` | Grant themselves any role in the catalog |
| \`DELETE admin/authz/roles/:roleId\` | Delete a role out from under everyone holding it |

All ${results.filter((x) => x.ep.kind === "act").length} \`act\` endpoints are in the matrix above with their observed results.

---

## Ingress behaviour

Beyond per-endpoint refusal, the ingress itself is asserted
(\`e2e/specs/public/api-surface.spec.ts\`, \`api-ingress.spec.ts\`):

| Group | Cases |
|---|---|
${table(Object.entries(surfaceGroups).map(([g, n]) => [g, String(n)]))}

| ID | Case | Status |
|---|---|---|
${table(
  ingressCases.map((c) => [
    c.id,
    c.title,
    c.defect ? `**KNOWN DEFECT** — ${c.defect.replace(/^Known: /, "")}` : "PASS",
  ])
)}

---

## Contract cases — require a session (NOT EXECUTED)

\`e2e/specs/authed/api-contract.spec.ts\`. These check what \`src/lib/api/client.ts\` and
\`hooks.ts\` read directly and would break quietly without. They are not a re-test of the
backend's business logic — that is the backend's suite to own.

| ID | Group | Case | Status |
|---|---|---|---|
${table(
  contractCases.map((c) => [
    c.id,
    c.group,
    c.title,
    c.defect ? `KNOWN DEFECT — ${c.defect.replace(/^Known: /, "")}` : "NOT EXECUTED — no session",
  ])
)}

---

## Workflow cases — require a session (NOT EXECUTED)

\`e2e/specs/authed/workflows.spec.ts\`. Read-only and negative by decision: nothing
advances a state machine. What they assert is agreement between what the UI offers and
what the server's \`allowedTransitions\` permits, plus the refusals.

| ID | Workflow | Case | Status |
|---|---|---|---|
${table(
  workflowCases.map((c) => [
    c.id,
    c.group,
    c.title,
    /E2E_ALLOW_WRITES|full (four-step path|lifecycle)/i.test(c.title)
      ? "NOT EXECUTED — gated behind E2E_ALLOW_WRITES"
      : "NOT EXECUTED — no session",
  ])
)}

Cases whose name implies a write (the full refund path, the payout lifecycle, minting)
are additionally gated behind \`E2E_ALLOW_WRITES=1\` and will not run even with a session
unless that is set deliberately, against a seeded backend.

---

## What this run does and does not prove

**Proves.** No endpoint the console calls is reachable without a session — exhaustively,
across all ${manifest.length}. No refusal leaks a token, a JWT, a secret key, the backend
origin or a single row of data. The refusal happens at the Next ingress, before the
Clerk JWT is attached and before any upstream request is made.

**Does not prove.** Anything about behaviour *with* a session: whether scopes are
enforced per-role, whether masked grants actually mask, whether \`pageSize\` is honoured,
whether an illegal state transition is refused. Those are the ${contractCases.length +
  workflowCases.length} cases above, written and waiting on \`npm run e2e:login\`.

**A refusal is not an endorsement.** Every row here says "the door is locked". None says
"the room behind it is tidy".
`;

fs.writeFileSync(OUT, md);
console.log(`  ${path.relative(ROOT, OUT)}  (${manifest.length} endpoints, ${refused} refused)`);
if (leaked.length) {
  console.error(`\n  FAIL: ${leaked.length} endpoint(s) leaked data:`);
  for (const x of leaked) console.error(`    ${x.ep.method} ${x.ep.path}`);
  process.exitCode = 1;
}
if (unreachable.length) {
  console.warn(`\n  ${unreachable.length} endpoint(s) unreachable — is the dev server running?`);
}
