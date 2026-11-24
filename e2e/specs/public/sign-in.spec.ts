import { test, expect } from "@playwright/test";

/**
 * The sign-in screen.
 *
 * This form adapts to the Clerk instance: it asks which first factors the
 * identifier supports and takes that route. On this instance password is
 * `used_for_first_factor: false`, so the form is expected to drop the password
 * field and send a one-time code instead. That adaptation is the interesting
 * behaviour and the thing most likely to break silently when the Clerk
 * dashboard is reconfigured.
 *
 * Nothing here submits a real identity or completes a sign-in.
 */
test.describe("Sign in", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
  });

  test("renders the form and its framing", async ({ page }) => {
    await expect(page).toHaveTitle(/Sign in/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
  });

  test("the submit button is inert until an email is typed", async ({ page }) => {
    const submit = page.getByRole("button", { name: /continue/i });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Work email").fill("operator@example.com");
    await expect(submit).toBeEnabled();
  });

  test("the password field can be revealed and re-hidden", async ({ page }) => {
    const reveal = page.getByRole("button", { name: "Show password" });
    // The field is only present until Clerk says password is not a factor.
    if (await reveal.count()) {
      const field = page.locator("#password");
      await field.fill("not-a-real-password");
      await expect(field).toHaveAttribute("type", "password");
      await reveal.click();
      await expect(field).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(field).toHaveAttribute("type", "password");
    }
  });

  test("offers a route to request access", async ({ page }) => {
    const link = page.getByRole("link", { name: "Request access" });
    await expect(link).toHaveAttribute("href", "/sign-up");
    await link.click();
    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("the email field is labelled and typed for password managers", async ({ page }) => {
    const email = page.getByLabel("Work email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("autocomplete", "email");
  });
});
