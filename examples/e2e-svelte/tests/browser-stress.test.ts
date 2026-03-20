import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import { gotoAndStabilize, openTrackedPage } from "./support/playwright.ts";

async function readTestIdText(page: Page, testId: string): Promise<string> {
  return (await page.getByTestId(testId).textContent()) ?? "";
}

describe.sequential.for(serverModes)("%s browser stress", (mode) => {
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

  test("renders exact-number branches and deep macro output", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL("/playground/stress?lang=en", server.origin).toString(),
      );

      expect(await readTestIdText(session.page, "core-exact-plural")).toBe(
        "no queued builds",
      );
      expect(await readTestIdText(session.page, "component-exact-plural")).toBe(
        "no queued builds",
      );
      expect(await readTestIdText(session.page, "core-exact-ordinal")).toBe(
        "take the shortcut",
      );
      expect(
        await readTestIdText(session.page, "component-exact-ordinal"),
      ).toBe("take the shortcut");
      expect(await readTestIdText(session.page, "deep-core")).toBe(
        "core zero first admin",
      );
      expect(await readTestIdText(session.page, "deep-component")).toBe(
        "component zero first admin",
      );

      await session.page.getByTestId("count-2").click();
      await session.page.getByTestId("rank-2").click();

      expect(await readTestIdText(session.page, "core-exact-plural")).toBe(
        "exactly two queued builds",
      );
      expect(await readTestIdText(session.page, "component-exact-plural")).toBe(
        "exactly two queued builds",
      );
      expect(await readTestIdText(session.page, "core-exact-ordinal")).toBe(
        "take the scenic route",
      );
      expect(
        await readTestIdText(session.page, "component-exact-ordinal"),
      ).toBe("take the scenic route");
      expect(await readTestIdText(session.page, "deep-core")).toBe(
        "core two second admin",
      );
      expect(await readTestIdText(session.page, "deep-component")).toBe(
        "component two second admin",
      );

      await session.page.getByTestId("count-5").click();
      await session.page.getByTestId("rank-4").click();
      await session.page.getByTestId("role-other").click();

      expect(await readTestIdText(session.page, "core-exact-plural")).toBe(
        "5 queued builds",
      );
      expect(await readTestIdText(session.page, "component-exact-plural")).toBe(
        "5 queued builds",
      );
      expect(await readTestIdText(session.page, "core-exact-ordinal")).toBe(
        "finish in 4th place",
      );
      expect(
        await readTestIdText(session.page, "component-exact-ordinal"),
      ).toBe("finish in 4th place");
      expect(await readTestIdText(session.page, "deep-core")).toBe(
        "core many later other",
      );
      expect(await readTestIdText(session.page, "deep-component")).toBe(
        "component many later other",
      );

      await session.page.locator('a[href*="lang=ja"]').first().click();
      await session.page.waitForURL(
        (url: URL) => url.searchParams.get("lang") === "ja",
      );
      await session.page.waitForTimeout(250);

      expect(await session.page.locator("html").getAttribute("lang")).toBe(
        "ja",
      );
      expect(session.errors).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);
});
