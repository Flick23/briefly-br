import { expect, test } from "@playwright/test";

test("home carrega com o título do app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Briefly" })).toBeVisible();
});
