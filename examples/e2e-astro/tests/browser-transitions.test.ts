import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import {
  getUnexpectedBrowserErrors,
  gotoAndStabilize,
  openTrackedPage,
  waitForPathname,
  waitForSearchParam,
  warmRoutes,
} from "./support/playwright.ts";

async function readTestIdText(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).textContent()) ?? "";
}

describe.sequential.for(serverModes)("%s browser transitions", (mode) => {
  const server = new AppServer(mode);
  let browser: Browser;

  beforeAll(async () => {
    await server.start();
    browser = await chromium.launch({ headless: true });

    if (mode === "dev") {
      await warmRoutes(browser, server.origin, [
        "/transitions/no-router/a?lang=en",
        "/transitions/router/a?lang=en",
      ]);
    }
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server.close();
  });

  test("full reload mode recreates every island on locale and page navigation", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL("/transitions/no-router/a?lang=en", server.origin).toString(),
      );

      await session.page.getByTestId("svelte-persisted-increment").waitFor();
      await session.page.getByTestId("svelte-persisted-increment").click();
      await session.page.getByTestId("react-persisted-increment").click();

      expect(
        await readTestIdText(session.page, "svelte-persisted-count"),
      ).toContain("1 Svelte clicks");
      expect(
        await readTestIdText(session.page, "react-persisted-count"),
      ).toContain("1 React clicks");

      await session.page.getByTestId("locale-ja-link").click();
      await waitForPathname(session.page, "/transitions/no-router/a");
      await waitForSearchParam(session.page, "lang", "ja");
      await session.page.waitForTimeout(250);

      expect(
        await readTestIdText(session.page, "svelte-persisted-count"),
      ).toContain("0 回の Svelte クリック");
      expect(
        await readTestIdText(session.page, "react-persisted-count"),
      ).toContain("0 回の React クリック");
      expect(await readTestIdText(session.page, "svelte-persisted")).toContain(
        "Svelte のプロパティでは ルーターなしページ A / 日本語 が見えています。",
      );

      await session.page.getByTestId("transition-next-link").click();
      await waitForPathname(session.page, "/transitions/no-router/b");
      await session.page.waitForTimeout(250);

      expect(
        await readTestIdText(session.page, "svelte-persisted-count"),
      ).toContain("0 回の Svelte クリック");
      expect(
        await readTestIdText(session.page, "react-persisted-count"),
      ).toContain("0 回の React クリック");
      expect(await readTestIdText(session.page, "svelte-persisted")).toContain(
        "Svelte のプロパティでは ルーターなしページ B / 日本語 が見えています。",
      );
      expect(await readTestIdText(session.page, "react-persisted")).toContain(
        "React のプロパティでは ルーターなしページ B / 日本語 が見えています。",
      );
      expect(await session.page.locator("html").getAttribute("lang")).toBe(
        "ja",
      );
      expect(getUnexpectedBrowserErrors(session.errors)).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);

  test("ClientRouter preserves persisted counters while persisted-props stays frozen", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL("/transitions/router/a?lang=en", server.origin).toString(),
      );

      await session.page.getByTestId("svelte-persisted-increment").waitFor();
      await session.page.getByTestId("svelte-persisted-increment").click();
      await session.page
        .getByTestId("svelte-persisted-props-increment")
        .click();
      await session.page.getByTestId("react-persisted-increment").click();
      await session.page.getByTestId("react-persisted-props-increment").click();

      await session.page.getByTestId("locale-ja-link").click();
      await waitForPathname(session.page, "/transitions/router/a");
      await waitForSearchParam(session.page, "lang", "ja");
      await session.page.waitForTimeout(500);

      expect(
        await readTestIdText(session.page, "svelte-persisted-count"),
      ).toContain("1 回の Svelte クリック");
      expect(
        await readTestIdText(session.page, "svelte-persisted-props-count"),
      ).toContain("1 Svelte clicks");
      expect(
        await readTestIdText(session.page, "react-persisted-count"),
      ).toContain("1 回の React クリック");
      expect(
        await readTestIdText(session.page, "react-persisted-props-count"),
      ).toContain("1 React clicks");

      expect(
        await readTestIdText(session.page, "svelte-persisted-props"),
      ).toContain("Svelte props say Router page A in English.");
      expect(
        await readTestIdText(session.page, "react-persisted-props"),
      ).toContain("React props say Router page A in English.");

      await session.page.getByTestId("transition-next-link").click();
      await waitForPathname(session.page, "/transitions/router/b");
      await session.page.waitForTimeout(500);

      expect(
        await readTestIdText(session.page, "svelte-volatile-count"),
      ).toContain("0 回の Svelte クリック");
      expect(
        await readTestIdText(session.page, "react-volatile-count"),
      ).toContain("0 回の React クリック");
      expect(
        await readTestIdText(session.page, "svelte-persisted-count"),
      ).toContain("1 回の Svelte クリック");
      expect(
        await readTestIdText(session.page, "react-persisted-count"),
      ).toContain("1 回の React クリック");

      expect(await readTestIdText(session.page, "svelte-persisted")).toContain(
        "Svelte のプロパティでは ルーターページ B / 日本語 が見えています。",
      );
      expect(await readTestIdText(session.page, "react-persisted")).toContain(
        "React のプロパティでは ルーターページ B / 日本語 が見えています。",
      );
      expect(
        await readTestIdText(session.page, "svelte-persisted-props"),
      ).toContain("Svelte props say Router page A in English.");
      expect(
        await readTestIdText(session.page, "react-persisted-props"),
      ).toContain("React props say Router page A in English.");
      expect(await session.page.locator("html").getAttribute("lang")).toBe(
        "ja",
      );
      expect(getUnexpectedBrowserErrors(session.errors)).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);
});
