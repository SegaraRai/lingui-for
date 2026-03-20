import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import { gotoAndStabilize, openTrackedPage } from "./support/playwright.ts";

type ReactivityTexts = {
  currentValue: string;
  scriptDescriptorStatic: string;
  scriptInterpolated: string;
  scriptTaggedStatic: string;
  templateDirect: string;
  templateIndirect: string;
  templateStatic: string;
};

function expectedTexts(
  locale: "en" | "ja",
  value: "Alpha" | "Beta",
): ReactivityTexts {
  if (locale === "ja") {
    return {
      currentValue: `現在のデモ値: ${value}`,
      scriptDescriptorStatic:
        "スクリプトのディスクリプタ固定リアクティビティ。",
      scriptInterpolated: `スクリプトの値: ${value}`,
      scriptTaggedStatic: "スクリプトの直接固定リアクティビティ。",
      templateDirect: `テンプレートの直接値: ${value}`,
      templateIndirect: `テンプレートの間接値: ${value}`,
      templateStatic: "テンプレートの固定リアクティビティ。",
    };
  }

  return {
    currentValue: `Current demo value: ${value}`,
    scriptDescriptorStatic: "Script descriptor static reactivity.",
    scriptInterpolated: `Script value: ${value}`,
    scriptTaggedStatic: "Script direct static reactivity.",
    templateDirect: `Template direct value: ${value}`,
    templateIndirect: `Template indirect value: ${value}`,
    templateStatic: "Template static reactivity.",
  };
}

async function expectReactivityTexts(
  page: Page,
  locale: "en" | "ja",
  value: "Alpha" | "Beta",
): Promise<void> {
  const texts = expectedTexts(locale, value);

  expect(await page.getByTestId("current-value").textContent()).toBe(
    texts.currentValue,
  );
  expect(await page.getByTestId("script-tagged-static").textContent()).toBe(
    texts.scriptTaggedStatic,
  );
  expect(await page.getByTestId("script-descriptor-static").textContent()).toBe(
    texts.scriptDescriptorStatic,
  );
  expect(await page.getByTestId("script-interpolated").textContent()).toBe(
    texts.scriptInterpolated,
  );
  expect(await page.getByTestId("template-indirect").textContent()).toBe(
    texts.templateIndirect,
  );
  expect(await page.getByTestId("template-direct").textContent()).toBe(
    texts.templateDirect,
  );
  expect(await page.getByTestId("template-static").textContent()).toBe(
    texts.templateStatic,
  );
}

describe.sequential.for(serverModes)("%s browser reactivity", (mode) => {
  const server = new AppServer(mode);
  let browser: Browser;

  beforeAll(async () => {
    await server.start();
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser.close();
    await server.close();
  });

  test("tracks locale and reactive values across script and template bindings", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL("/playground/reactivity?lang=en", server.origin).toString(),
      );

      await expectReactivityTexts(session.page, "en", "Alpha");

      await session.page.getByTestId("value-beta").click();
      await expectReactivityTexts(session.page, "en", "Beta");

      await session.page.locator('a[href*="lang=ja"]').first().click();
      await session.page.waitForURL(
        (url: URL) => url.searchParams.get("lang") === "ja",
      );
      await session.page.waitForTimeout(250);
      await expectReactivityTexts(session.page, "ja", "Beta");

      await session.page.getByTestId("value-alpha").click();
      await expectReactivityTexts(session.page, "ja", "Alpha");

      expect(session.errors).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);
});
