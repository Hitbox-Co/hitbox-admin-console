/**
 * Renders the testing documents in docs/ to PDF — `npm run docs:pdf`.
 *
 * Chrome does the typesetting. There is no Python, pandoc or wkhtmltopdf on the
 * machines this repo is built on, and Playwright's own browser downloads fail
 * behind this network — but the E2E suite already drives the installed Chrome,
 * and Chrome prints PDFs. So the toolchain that tests the app is the toolchain
 * that renders the report, and there is nothing extra to install.
 *
 * Re-run it after editing any of them; the PDFs are committed so a reviewer
 * without a checkout can read them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright-core";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const DOCS = [
  { md: "docs/E2E-TEST-REPORT.md", pdf: "docs/E2E-TEST-REPORT.pdf", title: "E2E Test Report" },
  { md: "docs/TESTING-APPROACH.md", pdf: "docs/TESTING-APPROACH.pdf", title: "Testing Approach" },
  { md: "docs/API-TEST-CASES.md", pdf: "docs/API-TEST-CASES.pdf", title: "API Test Cases" },
];

/**
 * Print styling.
 *
 * Deliberately NOT the console's own dark palette: this is a document to be
 * read on paper and in a PDF viewer, and inverting it would burn a cartridge
 * to say the same thing less legibly. Ink colours are chosen for contrast on
 * white — including the muted grey, which is the defect the report itself is
 * about.
 */
const CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }

  :root {
    --ink:     #16181d;
    --ink-2:   #444a55;
    --ink-3:   #6b7280;
    --rule:    #e3e6ea;
    --rule-2:  #cfd4da;
    --accent:  #b8452f;
    --surface: #f7f8f9;
    --code-bg: #f2f3f5;
  }

  * { box-sizing: border-box; }

  body {
    font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 9.6pt;
    line-height: 1.52;
    color: var(--ink);
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1 {
    font-size: 21pt;
    line-height: 1.18;
    letter-spacing: -0.02em;
    margin: 0 0 4mm;
    padding-bottom: 3mm;
    border-bottom: 2px solid var(--ink);
  }
  h2 {
    font-size: 13pt;
    letter-spacing: -0.01em;
    margin: 9mm 0 3mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid var(--rule-2);
    break-after: avoid;
  }
  h3 { font-size: 10.8pt; margin: 6mm 0 2mm; break-after: avoid; }
  h2 + h3 { margin-top: 4mm; }

  p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
  strong { font-weight: 650; }
  em { color: var(--ink-2); }
  a { color: var(--accent); text-decoration: none; }

  hr { border: 0; border-top: 1px solid var(--rule); margin: 6mm 0; }

  code {
    font-family: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
    font-size: 8.5pt;
    background: var(--code-bg);
    border: 1px solid var(--rule);
    border-radius: 3px;
    padding: 0.4mm 1.1mm;
  }
  pre {
    background: var(--surface);
    border: 1px solid var(--rule);
    border-left: 3px solid var(--rule-2);
    border-radius: 4px;
    padding: 2.8mm 3.2mm;
    margin: 0 0 3mm;
    break-inside: avoid;
  }
  pre code {
    background: none; border: 0; padding: 0;
    font-size: 8.3pt; line-height: 1.45;
    white-space: pre-wrap; word-break: break-word;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 4mm;
    font-size: 8.6pt;
  }
  /* Repeat the header when a table spans a page break. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    text-align: left;
    font-size: 7.6pt;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-2);
    background: var(--surface);
    border-bottom: 1px solid var(--rule-2);
    padding: 1.8mm 2.2mm;
  }
  td { border-bottom: 1px solid var(--rule); padding: 1.8mm 2.2mm; vertical-align: top; }
  td code { font-size: 7.9pt; }

  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1.2mm; }

  blockquote {
    margin: 0 0 3mm;
    padding: 2mm 0 2mm 4mm;
    border-left: 3px solid var(--accent);
    color: var(--ink-2);
    font-style: italic;
  }

  h1 + p { color: var(--ink-2); font-size: 9pt; line-height: 1.7; }
`;

const footer = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:7pt;color:#8b919c;
              width:100%;padding:0 16mm;display:flex;justify-content:space-between;">
    <span>HitBox Collectibles operations console</span>
    <span class="pageNumber"></span>/<span class="totalPages"></span>
  </div>`;

const header = (title) => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:7pt;color:#8b919c;
              width:100%;padding:0 16mm;text-align:left;">${title}</div>`;

/**
 * The masthead is a run of `**Key:** value` lines, which markdown folds into a
 * single paragraph because one newline is a soft break. Turning on `breaks`
 * globally would fix it and wreck every hard-wrapped paragraph in the document,
 * so the hard break is added only to those lines, only above the first rule.
 */
function hardBreakMasthead(md) {
  const end = md.indexOf("\n---");
  if (end < 0) return md;
  const head = md
    .slice(0, end)
    .split("\n")
    .map((line) => (/^\*\*[^*]+:\*\*/.test(line) ? `${line}  ` : line))
    .join("\n");
  return head + md.slice(end);
}

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? "chrome" });

for (const doc of DOCS) {
  const src = path.join(ROOT, doc.md);
  if (!fs.existsSync(src)) {
    console.warn(`  skipped ${doc.md} — not found`);
    continue;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${doc.title}</title><style>${CSS}</style></head>
    <body>${marked.parse(hardBreakMasthead(fs.readFileSync(src, "utf8")))}</body></html>`;

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const out = path.join(ROOT, doc.pdf);
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: header(doc.title),
    footerTemplate: footer,
    margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
  });
  await page.close();

  console.log(`  ${doc.pdf}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

await browser.close();
