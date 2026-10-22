import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openBoard, storageState } from "./helpers";

/** Verifica as regras WCAG 2.1 A/AA com o axe; falha em violações sérias ou críticas. */
async function expectAccessible(page: Page) {
  // Espera as animações de entrada terminarem para medir o contraste final.
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`).join("\n  ")}`);
  expect(report, report.join("\n")).toEqual([]);
}

test("login é acessível", async ({ page }) => {
  await page.goto("/login");
  await expectAccessible(page);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`tema ${scheme === "light" ? "claro" : "escuro"}`, () => {
    test.use({ storageState: storageState("admin"), colorScheme: scheme });

    test("quadro é acessível", async ({ page }) => {
      await openBoard(page);
      await expectAccessible(page);
    });

    for (const path of ["/chamados", "/base", "/indicadores", "/auditoria", "/conta"]) {
      test(`${path} é acessível`, async ({ page }) => {
        await page.goto(path);
        await expectAccessible(page);
      });
    }
  });
}

test.describe("solicitante", () => {
  test.use({ storageState: storageState("requester") });

  test("portal do solicitante é acessível", async ({ page }) => {
    await page.goto("/solicitante");
    await expectAccessible(page);
  });
});
