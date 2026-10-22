import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("login", () => {
  test("senha errada mostra mensagem clara", async ({ page }) => {
    await login(page, USERS.technician, "senha-errada");
    await expect(page).toHaveURL(/\/login\?erro=1/);
    await expect(page.getByRole("alert").filter({ hasText: "E-mail" })).toHaveText("E-mail ou senha incorretos.");
  });

  test("técnico entra e cai no quadro", async ({ page }) => {
    await login(page, USERS.technician);
    await expect(page).toHaveURL(/\/boards\//);
  });

  test("solicitante entra e cai no portal", async ({ page }) => {
    await login(page, USERS.requester);
    await expect(page).toHaveURL(/\/solicitante/);
  });

  test("página protegida sem sessão volta ao login", async ({ page }) => {
    await page.goto("/chamados");
    await expect(page).toHaveURL(/\/login/);
  });
});
