import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);

test.describe("public site", () => {
  test("home and live stations pages load", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible();
    await page.goto("/hosts");
    await expect(page).toHaveURL(/\/hosts/);
  });

  test("API health is reachable through the site", async ({ request }) => {
    const res = await request.get("/api/v1/health");
    expect(res.ok()).toBeTruthy();
  });
});

test.describe("accounts", () => {
  test("a new artist can register, sign out and sign back in", async ({ page }) => {
    const username = `e2e_${unique}`;
    const password = "Str0ng!Pass-e2e";

    await page.goto("/register");
    await page.fill("#register-email", `${username}@example.com`);
    await page.fill("#register-username", username);
    await page.fill("#register-displayname", "E2E Artist");
    await page.fill("#register-password", password);
    await page.fill("#register-confirm-password", password);
    await page.check("#register-accept-terms");
    await page.click("#register-submit-button");
    await expect(page).not.toHaveURL(/\/register/);
    await expect(page.getByText("E2E Artist").first()).toBeVisible();

    await page.request.post("/api/v1/auth/logout");
    await page.goto("/login");
    await page.fill("#login-identifier", username);
    await page.fill("#login-password", password);
    await page.click("#login-submit-button");
    await expect(page).not.toHaveURL(/\/login/);

    const me = await page.request.get("/api/v1/auth/me");
    expect((await me.json()).user.username).toBe(username);
  });

  test("host-only pages send signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/host/income");
    await expect(page).toHaveURL(/\/login/);
  });
});
