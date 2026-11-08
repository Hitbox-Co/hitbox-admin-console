import fs from "node:fs";
import path from "node:path";

export const AUTH_FILE = path.join(__dirname, "..", ".auth", "user.json");

/**
 * Is there a captured Clerk session on disk?
 *
 * A file with no cookies is worse than no file — it produces an anonymous run
 * that reports as a pass — so an empty cookie jar counts as "no session".
 */
export function hasSession(): boolean {
  if (!fs.existsSync(AUTH_FILE)) return false;
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    return Array.isArray(state.cookies) && state.cookies.length > 0;
  } catch {
    return false;
  }
}

export const NO_SESSION_REASON =
  "No captured Clerk session. Run `npm run e2e:login`, sign in once in the headed browser, and re-run.";
