import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import {
  homePageExpectations,
  playgroundLocaleCases,
  settingsPageExpectations,
} from "./support/expectations.ts";

describe.sequential.for(serverModes)("%s http rendering", (mode) => {
  const server = new AppServer(mode);

  beforeAll(async () => {
    await server.start();
  }, 60_000);

  afterAll(async () => {
    await server.close();
  });

  it("renders the main app home route in english", async () => {
    const response = await server.fetch("/?lang=en");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="en">');

    for (const expectedText of homePageExpectations.en) {
      expect(html).toContain(expectedText);
    }

    expect(html).toContain('href="/settings"');
    expect(html).toContain("playground");
  });

  it("renders the main app settings route in japanese", async () => {
    const response = await server.fetch("/settings?lang=ja");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<html lang="ja">');

    for (const expectedText of settingsPageExpectations.ja) {
      expect(html).toContain(expectedText);
    }
  }, 60_000);

  it.for(playgroundLocaleCases)(
    "renders $path in $locale",
    async ({ expectedBody, locale, path }) => {
      const response = await server.fetch(`${path}?lang=${locale}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain(`<html lang="${locale}">`);

      for (const expectedText of expectedBody) {
        expect(html).toContain(expectedText);
      }
    },
  );
});
