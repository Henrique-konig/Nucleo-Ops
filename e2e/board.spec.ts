import { expect, test } from "@playwright/test";
import { openBoard, storageState, unique } from "./helpers";

test.use({ storageState: storageState("technician") });

test.describe("quadro", () => {
  test("cria cartão com atualização otimista e ele persiste", async ({ page }) => {
    await openBoard(page);
    const firstColumn = page.locator("[data-column-id]").first();
    const title = unique("Trocar teclado");

    await firstColumn.getByRole("button", { name: "Adicionar cartão" }).click();
    await firstColumn.getByLabel("Título do cartão").fill(title);
    await firstColumn.getByLabel("Título do cartão").press("Enter");

    // Aparece na hora, antes da resposta do servidor, e o campo já fica livre.
    await expect(firstColumn.getByText(title)).toBeVisible();
    await expect(firstColumn.getByLabel("Título do cartão")).toHaveValue("");
    await expect(firstColumn.getByText("Salvando…")).toBeHidden();

    await page.reload();
    await expect(page.locator("[data-column-id]").first().getByText(title)).toBeVisible();
  });

  test("move cartão pelo teclado (Alt + seta) e anuncia a mudança", async ({ page }) => {
    await openBoard(page);
    const columns = page.locator("[data-column-id]");
    const title = unique("Mover pelo teclado");
    await columns.first().getByRole("button", { name: "Adicionar cartão" }).click();
    await columns.first().getByLabel("Título do cartão").fill(title);
    await columns.first().getByLabel("Título do cartão").press("Enter");
    await expect(columns.first().getByText("Salvando…")).toBeHidden();

    const card = page.getByRole("button", { name: new RegExp(title) });
    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Alt+ArrowRight");

    await expect(columns.nth(1).getByText(title)).toBeVisible();
    await expect(page.getByText(new RegExp(`${title} movido para`))).toBeAttached();
    // O foco acompanha o cartão.
    await expect(page.getByRole("button", { name: new RegExp(title) })).toBeFocused();

    await page.reload();
    await expect(page.locator("[data-column-id]").nth(1).getByText(title)).toBeVisible();
  });

  test("Enter abre o cartão e Esc fecha", async ({ page }) => {
    await openBoard(page);
    const card = page.locator("[data-card-id]").first();
    await card.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
