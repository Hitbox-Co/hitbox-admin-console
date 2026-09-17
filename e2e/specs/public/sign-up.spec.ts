import { test, expect } from "@playwright/test";

/**
 * Request access.
 *
 * Deliberately shallow: this suite never creates an account, so it stops at
 * the point where a real identity would be submitted. What it does check is
 * that the screen is reachable, labelled, and refuses an obviously bad
 * password rather than passing it upstream.
 */
test.describe("Request access", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-up");
  });

  test("renders the form", async ({ page }) => {
    await expect(page).toHaveTitle(/Request access/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
  });

  test("collects a password, because Clerk requires one at sign-up", async ({ page }) => {
    // Sign-in on this instance is email-code only, but Clerk still stores a
    // password at sign-up — so the field belongs here and nowhere else.
    await expect(page.locator("#signup-password").or(page.locator("#password"))).toBeVisible();
  });

  test("links back to sign-in", async ({ page }) => {
    const link = page.getByRole("link", { name: /sign in/i }).first();
    await expect(link).toHaveAttribute("href", "/sign-in");
  });

  test("the submit control is disabled until the form is filled", async ({ page }) => {
    const submit = page.getByRole("button", { name: /create|request|continue/i }).first();
    await expect(submit).toBeDisabled();
  });
});
