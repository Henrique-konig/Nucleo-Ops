import { expect, test as setup } from "@playwright/test";
import { login, skipOnboarding, storageState, USERS, type UserKey } from "./helpers";

// Uma sessão salva por papel; os outros testes começam já autenticados.
for (const key of Object.keys(USERS) as UserKey[]) {
  setup(`sessão: ${key}`, async ({ page }) => {
    await login(page, USERS[key]);
    await expect(page).toHaveURL(/\/(boards|solicitante)/);
    await skipOnboarding(page);
    await page.context().storageState({ path: storageState(key) });
  });
}
