import { test, expect } from "@playwright/test";

/**
 * The marketing page — one of only three routes `isPublic` admits
 * (src/proxy.ts). It is also the only page a signed-out visitor can reach
 * without being bounced, so it carries the whole first impression.
 */
test.describe("Landing page", () => {
  test("renders the console's identity and the way in", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("HitBox Collectibles — Operations Console");
    await expect(page.getByRole("heading", { level: 1, name: "Operations Console" })).toBeVisible();
    await expect(
      page.getByText("Orders, finance, drops, provenance and access control")
    ).toBeVisible();
    await expect(page.getByText("Restricted Access")).toBeVisible();
  });

  test("offers sign-in to a signed-out visitor, and only that", async ({ page }) => {
    await page.goto("/");

    const signIn = page.getByRole("link", { name: "Sign in to the console" });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/sign-in");

    // <Show when="signed-in"> must not leak the console entry to a visitor.
    await expect(page.getByRole("link", { name: "Open console" })).toHaveCount(0);
  });

  test("the sign-in link actually lands on the sign-in screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Sign in to the console" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByLabel("Work email")).toBeVisible();
  });

  test("carries a description for anything that indexes or previews it", async ({ page }) => {
    await page.goto("/");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      /orders, finance, drops, provenance and access control/i
    );
  });

  test("the hero decoration is hidden from assistive technology", async ({ page }) => {
    await page.goto("/");
    // Three purely decorative layers: ambient bloom, grid, and the mark.
    // Every one of them is aria-hidden or it becomes noise in a screen reader.
    await expect(page.locator(".ambient")).toHaveAttribute("aria-hidden", "true");
  });
});
