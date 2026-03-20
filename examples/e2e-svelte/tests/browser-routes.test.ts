import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import {
  browserRouteExpectations,
  localeSwitchExpectation,
} from "./support/expectations.ts";
import { gotoAndStabilize, openTrackedPage } from "./support/playwright.ts";

describe.sequential.for(serverModes)("%s browser navigation", (mode) => {
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

  test("switches locale from the header and updates html lang", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL(localeSwitchExpectation.startPath, server.origin).toString(),
      );
      await session.page
        .locator(`a[href*="lang=${localeSwitchExpectation.targetLocale}"]`)
        .first()
        .click();
      await session.page.waitForURL(
        (url: URL) =>
          url.searchParams.get("lang") === localeSwitchExpectation.targetLocale,
      );
      await session.page.waitForTimeout(250);

      const bodyText = (await session.page.locator("body").textContent()) ?? "";
      const currentUrl = session.page.url();
      const htmlLang = await session.page.locator("html").getAttribute("lang");

      expect(currentUrl).toContain(
        `?lang=${localeSwitchExpectation.targetLocale}`,
      );

      for (const expectedText of localeSwitchExpectation.expectedBody) {
        expect(bodyText).toContain(expectedText);
      }

      expect(htmlLang).toBe(localeSwitchExpectation.targetLocale);
      expect(session.errors).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);

  test.for(browserRouteExpectations)(
    "loads $path in $locale without browser errors",
    { timeout: 60_000 },
    async ({ expectedBody, locale, path }) => {
      const session = await openTrackedPage(browser);

      try {
        await gotoAndStabilize(
          session.page,
          new URL(path, server.origin).toString(),
        );

        const bodyText =
          (await session.page.locator("body").textContent()) ?? "";
        const htmlLang = await session.page
          .locator("html")
          .getAttribute("lang");

        for (const expectedText of expectedBody) {
          expect(bodyText).toContain(expectedText);
        }

        expect(htmlLang).toBe(locale);
        expect(session.errors).toEqual([]);
      } finally {
        await session.close();
      }
    },
  );
});
