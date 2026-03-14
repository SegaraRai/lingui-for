import { sveltekit } from "@sveltejs/kit/vite";
import { playwright } from "@vitest/browser-playwright";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, ConsoleMessage } from "playwright";
import { defineProject } from "vitest/config";

import linguiForSvelte from "lingui-for-svelte/unplugin/vite";

const devPort = 41732;
const devOrigin = `http://127.0.0.1:${devPort}`;
const projectRoot = dirname(fileURLToPath(import.meta.url));

async function waitForServer(url: string, output: () => string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is not ready yet.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  throw new Error(`Timed out waiting for ${url}\n${output()}`);
}

async function startDevServer(): Promise<{
  server: { close: () => Promise<void> };
}> {
  const { createServer } = await import("vite");
  const viteServer = await createServer({
    configFile: resolve(projectRoot, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: devPort,
    },
  });

  await viteServer.listen();
  await waitForServer(`${devOrigin}/playground?lang=en`, () => "");

  return {
    server: {
      async close() {
        await viteServer.close();
      },
    },
  };
}

export default defineProject({
  plugins: [linguiForSvelte(), sveltekit()],
  test: {
    name: "e2e-svelte-browser",
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      commands: {
        async captureHydrationErrors(
          { context }: { context: BrowserContext },
          pathname: string,
        ) {
          const { server } = await startDevServer();

          try {
            const probePage = await context.newPage();
            const errors: string[] = [];

            probePage.on("console", (message: ConsoleMessage) => {
              if (message.type() === "error") {
                errors.push(message.text());
              }
            });

            probePage.on("pageerror", (error: unknown) => {
              errors.push(String(error));
            });

            const targetUrl = new URL(pathname, devOrigin).toString();
            await probePage.goto(targetUrl, { waitUntil: "networkidle" });
            await probePage.waitForTimeout(250);

            const bodyText =
              (await probePage.locator("body").textContent()) ?? "";

            await probePage.close();

            return { bodyText, errors };
          } finally {
            await server.close();
          }
        },
      },
    },
  },
});
