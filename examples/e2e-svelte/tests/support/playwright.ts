import type { Browser, BrowserContext, ConsoleMessage, Page } from "playwright";

type TrackedPageSession = {
  close: () => Promise<void>;
  context: BrowserContext;
  errors: string[];
  page: Page;
};

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
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
}
