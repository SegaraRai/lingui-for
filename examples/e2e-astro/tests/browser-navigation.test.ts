import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import {
  browserLoadCases,
  localeNavigationExpectation,
} from "./support/expectations.ts";
import {
  getUnexpectedBrowserErrors,
  gotoAndStabilize,
  openTrackedPage,
  readVisibleText,
  waitForPathname,
  waitForSearchParam,
  warmRoutes,
} from "./support/playwright.ts";

describe.sequential.for(serverModes)("%s browser navigation", (mode) => {
  const server = new AppServer(mode);
  let browser: Browser;

  beforeAll(async () => {
    await server.start();
    browser = await chromium.launch({ headless: true });

    if (mode === "dev") {
      await warmRoutes(
        browser,
        server.origin,
        browserLoadCases.map((testCase) => testCase.path),
      );
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server.close();
  });

  test("switches locale from the header and keeps it across navigation", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL(
          localeNavigationExpectation.startPath,
          server.origin,
        ).toString(),
      );

      await session.page.getByTestId("locale-ja-link").waitFor();
      await session.page.getByTestId("locale-ja-link").click();
      await waitForSearchParam(session.page, "lang", "ja");
      await session.page.waitForTimeout(250);

      const localeBadge = await session.page
        .getByTestId("current-locale-badge")
        .textContent();

      expect(localeBadge).toContain("現在のロケール: 日本語");
      expect(await session.page.locator("html").getAttribute("lang")).toBe(
        "ja",
      );

      await session.page.locator('a[href="/routing/alpha"]').click();
      await waitForPathname(session.page, "/routing/alpha");
      await session.page.waitForTimeout(250);

      const mainText = await readVisibleText(session.page);

      for (const expectedText of localeNavigationExpectation.expectedBody) {
        expect(mainText).toContain(expectedText);
      }

      expect(await session.page.locator("html").getAttribute("lang")).toBe(
        "ja",
      );
      expect(getUnexpectedBrowserErrors(session.errors)).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);

  test.for(browserLoadCases)(
    "loads $path without browser errors",
    { timeout: 30_000 },
    async ({ expectedBody, locale, path }) => {
      const session = await openTrackedPage(browser);

      try {
        await gotoAndStabilize(
          session.page,
          new URL(path, server.origin).toString(),
        );

        const mainText = await readVisibleText(session.page);

        for (const expectedText of expectedBody) {
          expect(mainText).toContain(expectedText);
        }

        expect(await session.page.locator("html").getAttribute("lang")).toBe(
          locale,
        );
        expect(getUnexpectedBrowserErrors(session.errors)).toEqual([]);
      } finally {
        await session.close();
      }
    },
  );
});
