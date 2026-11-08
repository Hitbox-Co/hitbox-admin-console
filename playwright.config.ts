import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * E2E configuration for the HitBox Collectibles operations console.
 *
 * The console has no offline mode: every authenticated screen reads the live
 * backend through /api/hitbox/*, and everything behind `/` is sealed by the
 * Clerk proxy (src/proxy.ts). That splits the suite in two, and the split is
 * structural rather than cosmetic:
 *
 *  - `public-*`  runs with no session. It covers the marketing page, both auth
 *                screens, route protection, the API ingress and the cross-
 *                cutting checks (a11y, responsive, console hygiene). It needs
 *                nothing but a dev server, so it runs on every commit and in CI.
 *
 *  - `authed-*`  runs with a saved Clerk session (e2e/.auth/user.json). Capture
 *                one with `npm run e2e:login` — a headed browser where a human
 *                signs in once; the session is then reused headlessly. Without
 *                that file the project still loads, and each spec skips itself
 *                with a reason rather than failing as if the app were broken.
 *
 * Nothing here creates an account or handles a credential; the login capture is
 * interactive by design.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AUTH_FILE = path.join(__dirname, "e2e/.auth/user.json");
const HAS_SESSION = fs.existsSync(AUTH_FILE);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/.report", open: "never" }],
    ["json", { outputFile: "e2e/.report/results.json" }],
  ],

  use: {
    baseURL: BASE_URL,
    /**
     * Which browser binary to drive.
     *
     * Default `chrome` — the Chrome already installed on the machine — rather
     * than Playwright's bundled Chromium, for one practical reason: the
     * bundled download (`npx playwright install chromium`) fails behind this
     * network, and a suite nobody can install is a suite nobody runs. Chrome
     * is also what operators actually use.
     *
     * CI, where the download works, should set `E2E_CHANNEL=chromium` (after
     * `npx playwright install chromium`) so runs are pinned to one version
     * instead of whatever Chrome the agent happens to have.
     */
    channel: process.env.E2E_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    /**
     * Video is opt-in (`E2E_VIDEO=1`) because it needs Playwright's ffmpeg
     * download, which fails behind this network. The trace already carries a
     * DOM snapshot per action, which is more useful than a video for
     * diagnosing a failure anyway.
     */
    video: process.env.E2E_VIDEO ? "retain-on-failure" : "off",
    actionTimeout: 10_000,
    /*
     * No `extraHTTPHeaders` here, deliberately.
     *
     * The ngrok-fronted backend wants an `ngrok-skip-browser-warning` header —
     * but the browser never talks to it; the server-side proxy does. Setting
     * the header globally adds it to EVERY request the page makes, including
     * the cross-origin <script> fetch for clerk-js. A custom header makes that
     * request non-simple, CORS preflights it, Clerk's CDN answers the preflight
     * with a redirect, and Chrome refuses it: "Redirect is not allowed for a
     * preflight request". Clerk then never loads and the sign-in form silently
     * does nothing — a harness-induced failure that looks exactly like an app
     * bug. Left as a comment so nobody adds it back.
     */
  },

  projects: [
    /* ---------------- unauthenticated ---------------- */
    {
      name: "public-chromium",
      testMatch: /specs[\/]public[\/].*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } },
    },
    {
      name: "public-mobile",
      testMatch: /specs[\/]public[\/](landing|sign-in|responsive)\.spec\.ts/,
      use: { ...devices["Pixel 7"], storageState: { cookies: [], origins: [] } },
    },

    /* ---------------- session capture (manual, headed) ---------------- */
    {
      name: "auth-capture",
      testMatch: /support[\/]capture-session\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } },
    },

    /* ---------------- authenticated ---------------- */
    {
      name: "authed-chromium",
      testMatch: /specs[\/]authed[\/].*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: HAS_SESSION ? AUTH_FILE : undefined,
      },
    },
    {
      name: "authed-mobile",
      testMatch: /specs[\/]authed[\/](shell-nav|routes-smoke)\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        storageState: HAS_SESSION ? AUTH_FILE : undefined,
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
