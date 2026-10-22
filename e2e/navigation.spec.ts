import { expect, test } from "@playwright/test";
import { storageState } from "./helpers";

test.describe("navegação e estados", () => {
  test.use({ storageState: storageState("admin") });

  test("link 'Pular para o conteúdo' é o primeiro foco e leva ao conteúdo", async ({ page }) => {
    await page.goto("/chamados");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#conteudo")).toBeFocused();
  });

  test("foco do teclado é visível", async ({ page }) => {
    await page.goto("/chamados");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("busca sem resultado mostra estado vazio com saída", async ({ page }) => {
    await page.goto("/chamados?q=nada-vai-encontrar-isto-xyz");
    await expect(page.getByText("Nenhum chamado com esses filtros")).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/chamados$/);
  });

  test("endereço inexistente mostra página amigável", async ({ page }) => {
    const response = await page.goto("/pagina-que-nao-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Não encontramos esta página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ir para o início" })).toBeVisible();
  });

  test("quadro inexistente mostra página amigável", async ({ page }) => {
    await page.goto("/boards/nao-existe");
    await expect(page.getByRole("heading", { name: "Não encontramos esta página" })).toBeVisible();
  });
});

test.describe("introdução do primeiro acesso", () => {
  test.use({ storageState: storageState("auditor") });

  test("pode ser revista pela conta e não volta depois de concluída", async ({ page }) => {
    await page.goto("/conta");
    await page.getByRole("button", { name: "Rever a introdução" }).click();

    const dialog = page.getByRole("dialog", { name: "Boas-vindas ao Plantão" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Próximo" }).click();
    await expect(page.getByRole("dialog", { name: "O quadro" })).toBeVisible();
    await page.getByRole("button", { name: "Voltar" }).click();
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Próximo" }).click();
    await page.getByRole("button", { name: "Começar a usar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
