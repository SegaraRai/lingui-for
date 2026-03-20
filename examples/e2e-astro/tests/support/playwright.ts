import type { Browser, BrowserContext, ConsoleMessage, Page } from "playwright";
import { expect } from "vite-plus/test";

type TrackedPageSession = {
  close: () => Promise<void>;
  context: BrowserContext;
  errors: string[];
  page: Page;
};

const ignoredErrorPatterns = [
  /Outdated Optimize Dep/,
  /Failed to fetch dynamically imported module: .*\/node_modules\/\.vite\/deps\//,
] as const;

export async function openTrackedPage(
  browser: Browser,
): Promise<TrackedPageSession> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  page.on("pageerror", (error: unknown) => {
    errors.push(String(error));
  });

  return {
    close: async () => {
      await context.close();
    },
    context,
    errors,
    page,
  };
}

export async function gotoAndStabilize(
  page: Page,
  targetUrl: string,
): Promise<void> {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  await page.waitForTimeout(250);
}

export async function readVisibleText(
  page: Page,
  selector = "main",
): Promise<string> {
  return await page.locator(selector).innerText();
}

export async function waitForPathname(
  page: Page,
  pathname: string,
): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, {
      timeout: 15_000,
    })
    .toBe(pathname);
}

export async function waitForSearchParam(
  page: Page,
  key: string,
  value: string,
): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.get(key), {
      timeout: 15_000,
    })
    .toBe(value);
}

export async function warmRoutes(
  browser: Browser,
  origin: string,
  paths: readonly string[],
): Promise<void> {
  const session = await openTrackedPage(browser);

  try {
    for (const path of paths) {
      await gotoAndStabilize(session.page, new URL(path, origin).toString());
    }
  } finally {
    await session.close();
  }
}

export function getUnexpectedBrowserErrors(
  errors: readonly string[],
): string[] {
  return errors.filter(
    (error) => !ignoredErrorPatterns.some((pattern) => pattern.test(error)),
  );
}
