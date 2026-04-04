import type { Browser } from "playwright";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "../support/app-server.ts";
import {
  getUnexpectedBrowserErrors,
  gotoAndStabilize,
  openTrackedPage,
} from "../support/playwright.ts";

describe.sequential.for(serverModes)("%s framework slot island behavior", (mode) => {
  const server = new AppServer(mode);
  let browser: Browser;

  beforeAll(async () => {
    await server.start();
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server.close();
  });

  test("hydrates islands passed through direct slots, Astro.slots.render output, and wrapped rendered HTML", async () => {
    const session = await openTrackedPage(browser);

    try {
      await gotoAndStabilize(
        session.page,
        new URL("/framework/slot-islands?lang=en", server.origin).toString(),
      );

      const directCount = session.page.getByTestId("framework-direct-count");
      const renderedCount = session.page.getByTestId("framework-rendered-count");
      const wrappedCount = session.page.getByTestId("framework-wrapped-count");

      expect(await directCount.innerText()).toContain("0 clicks");
      expect(await renderedCount.innerText()).toContain("0 clicks");
      expect(await wrappedCount.innerText()).toContain("0 clicks");

      await session.page.getByTestId("framework-direct-increment").click();
      await expect
        .poll(async () => await directCount.innerText(), {
          timeout: 15_000,
        })
        .toContain("1 clicks");

      const renderedButton = session.page.getByTestId("framework-rendered-increment");
      await renderedButton.waitFor();
      await renderedButton.click({ force: true });
      await expect
        .poll(async () => await renderedCount.innerText(), {
          timeout: 15_000,
        })
        .toContain("1 clicks");

      const wrappedButton = session.page.getByTestId("framework-wrapped-increment");
      await wrappedButton.waitFor();
      await wrappedButton.click({ force: true });
      await expect
        .poll(async () => await wrappedCount.innerText(), {
          timeout: 15_000,
        })
        .toContain("1 clicks");

      expect(getUnexpectedBrowserErrors(session.errors)).toEqual([]);
    } finally {
      await session.close();
    }
  }, 60_000);
});
