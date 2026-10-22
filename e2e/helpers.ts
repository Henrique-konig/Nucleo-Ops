import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "plantao-dev";

export const USERS = {
  admin: "admin@plantao.local",
  technician: "tecnico@plantao.local",
  requester: "solicitante@plantao.local",
  auditor: "auditor@plantao.local",
} as const;

export type UserKey = keyof typeof USERS;

export const storageState = (user: UserKey) => `e2e/.auth/${user}.json`;

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Fecha a introdução do primeiro acesso, se aparecer. */
export async function skipOnboarding(page: Page) {
  const skip = page.getByRole("button", { name: "Pular introdução" });
  // O <dialog> só abre depois da hidratação, então espera um pouco por ele.
  const shown = await skip.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
  if (!shown) return;
  await skip.click();
  await expect(skip).toBeHidden();
}

/** Abre o primeiro quadro da equipe (a página inicial redireciona para ele). */
export async function openBoard(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/boards\//);
  await expect(page.locator("[data-column-id]").first()).toBeVisible();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
