import { test, expect } from "@playwright/test";

/**
 * How the sign-in form refuses.
 *
 * Split out from sign-in.spec.ts because these tests talk to the live Clerk
 * instance and are the slowest in the public suite.
 *
 * Nothing here submits a real identity — only addresses Clerk is guaranteed
 * not to hold.
 */
test.describe("Sign in — refusals", () => {
  test("an unknown identifier is refused in words, not a stack trace", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(`no-such-operator-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /continue/i }).click();

    // Clerk answers "Couldn't find your account."
    await expect(page.getByText(/couldn't find your account/i).first()).toBeVisible({
      timeout: 25_000,
    });

    // Still on the form; nothing was signed in, nothing navigated.
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByLabel("Work email")).toBeVisible();
  });

  test("the refusal is announced once, not twice", async ({ page }) => {
    /**
     * DEFECT — recorded, not waived.
     *
     * `submitCredentials` guards the banner with `if (!errors.fields.identifier)`,
     * meaning "only show a global message when there is no field-level one".
     * The guard reads the signal in the same tick the call resolves, before
     * `errors.fields` has been populated — so both fire, and the same sentence
     * renders twice: once in the role="alert" banner and once under the field.
     *
     * A sighted operator sees it duplicated; a screen-reader user hears it
     * twice. Awaiting a tick before the check, or dropping the banner for
     * field-attributable errors, fixes it.
     */
    test.fail(true, "Known: the same refusal renders both as a banner and as a field error");

    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(`no-such-operator-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText(/couldn't find your account/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/couldn't find your account/i)).toHaveCount(1);
  });

  test("the field error is tied to the field for assistive technology", async ({ page }) => {
    /**
     * DEFECT — recorded, not waived.
     *
     * `Field` (src/components/ui/primitives.tsx) renders its error as a bare
     * <p>. There is no `aria-describedby` from the input to that paragraph, no
     * `aria-invalid` on the input, and no live region — so a screen-reader user
     * who submits a bad address hears nothing and, on returning to the field,
     * is not told it is invalid. WCAG 2.1 3.3.1 (Error Identification) and
     * 4.1.3 (Status Messages).
     *
     * It is one component: giving the error an id, pointing the input at it
     * with aria-describedby and setting aria-invalid fixes every form in the
     * console at once.
     */
    test.fail(true, "Known: Field errors are not associated with their input");

    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(`no-such-operator-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /continue/i }).click();

    const email = page.getByLabel("Work email");
    await expect(email).toHaveAttribute("aria-invalid", "true", { timeout: 25_000 });
    await expect(email).toHaveAttribute("aria-describedby", /.+/);
  });
});
