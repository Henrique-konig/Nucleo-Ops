import { expect, test, type Page } from "@playwright/test";
import { openBoard, storageState, unique } from "./helpers";

test.use({ storageState: storageState("technician") });

/** Toque longo seguido de arraste, com eventos de toque reais (CDP). */
async function longPressDrag(page: Page, path: { x: number; y: number; hold?: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  const [from, ...rest] = path;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  await page.waitForTimeout(500);
  let current = from;
  for (const to of rest) {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const point = { x: current.x + ((to.x - current.x) * i) / steps, y: current.y + ((to.y - current.y) * i) / steps };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
      await page.waitForTimeout(25);
    }
    current = to;
    await page.waitForTimeout(to.hold ?? 100);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("quadro no celular", () => {
  test("colunas ocupam a tela, rolam na horizontal e têm atalhos", async ({ page }) => {
    await openBoard(page);
    const width = page.viewportSize()!.width;
    const column = page.locator("[data-column-id]").first();
    const box = (await column.boundingBox())!;
    expect(box.width).toBeGreaterThan(width * 0.7);

    // A página não rola na horizontal; só o quadro.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const nav = page.getByRole("navigation", { name: "Colunas" });
    const second = nav.getByRole("button").nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true");
    await expect(page.locator("[data-column-id]").nth(1)).toBeInViewport({ ratio: 0.9 });
  });

  test("segurar e arrastar move o cartão para outra coluna", async ({ page }) => {
    await openBoard(page);
    const columns = page.locator("[data-column-id]");
    const title = unique("Arrastar no celular");
    await columns.first().getByRole("button", { name: "Adicionar cartão" }).click();
    await columns.first().getByLabel("Título do cartão").fill(title);
    await columns.first().getByLabel("Título do cartão").press("Enter");
    await expect(columns.first().getByText("Salvando…")).toBeHidden();
    await columns.first().getByRole("button", { name: "Cancelar" }).click();

    const card = columns.first().locator("[data-card-id]", { hasText: title });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const width = page.viewportSize()!.width;
    const y = from.y + from.height / 2;
    // Leva o cartão até a borda direita (o quadro rola sozinho) e solta no meio da tela.
    await longPressDrag(page, [{ x: from.x + 20, y }, { x: width - 10, y, hold: 500 }, { x: width / 2, y }]);

    await expect(page.getByText(new RegExp(`${title} movido para`))).toBeAttached();
    await expect(columns.first().getByText(title)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(title)).toBeAttached();
    await expect(page.locator("[data-column-id]").first().getByText(title)).toHaveCount(0);
  });
});
