import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import { httpRouteCases } from "./support/expectations.ts";

function cleanupHtml(html: string): string {
  return (
    html
      // Astro dev
      .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
      .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "")
      // Svelte SSR
      .replaceAll(/<!--[\w[\]-]*-->/g, "")
  );
}

describe.sequential.for(serverModes)("%s http rendering", (mode) => {
  const server = new AppServer(mode);

  beforeAll(async () => {
    await server.start();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  test.for(httpRouteCases)(
    "renders $path in $locale",
    async ({ expectedBody, expectedHtmlSnippets, locale, path }) => {
      const response = await server.fetch(`${path}?lang=${locale}`);
      const originalHtml = await response.text();
      const html = cleanupHtml(originalHtml);

      expect(response.status).toBe(200);
      expect(html).toContain(`<html lang="${locale}">`);

      for (const expectedText of expectedBody) {
        expect(html, `Expected body to contain: ${expectedText}`).toContain(
          expectedText,
        );
      }

      for (const expectedText of expectedHtmlSnippets) {
        expect(
          html,
          `Expected HTML snippet to contain: ${expectedText}`,
        ).toContain(expectedText);
      }
    },
  );

  test("reuses the locale cookie on routing and settings routes", async () => {
    const initial = await server.fetch("/server?lang=ja");
    const initialHtml = await initial.text();
    const cookie = initial.headers.get("set-cookie");

    expect(cookie).toBeTruthy();
    expect(initialHtml).toContain('<html lang="ja">');
    expect(initialHtml).toContain("サーバー翻訳の確認");
    expect(initialHtml).toContain(
      "Astro のページは locals 経由でリクエスト単位の翻訳を描画します。",
    );

    const routingResponse = await server.fetch("/routing/alpha", {
      headers: {
        Cookie: cookie ?? "",
      },
    });
    const routingHtml = await routingResponse.text();

    expect(routingResponse.status).toBe(200);
    expect(routingHtml).toContain('<html lang="ja">');
    expect(routingHtml).toContain("動的ルートの確認");
    expect(routingHtml).toContain("現在表示中の slug は alpha です。");
    expect(routingHtml).toContain(
      "ここでもロケールクッキーが適用されるため、翻訳されたページは前のリクエストと一致します。",
    );

    const settingsResponse = await server.fetch("/settings", {
      headers: {
        Cookie: cookie ?? "",
      },
    });
    const settingsHtml = await settingsResponse.text();

    expect(settingsResponse.status).toBe(200);
    expect(settingsHtml).toContain("言語設定");
    expect(settingsHtml).toContain("現在のロケール: 日本語");
    expect(settingsHtml).toContain(
      "Astro はリクエスト単位の locals を使います。",
    );
    expect(settingsHtml).toContain(
      "React は I18nProvider 経由で Lingui を読み取ります。",
    );

    const islandsResponse = await server.fetch("/islands", {
      headers: {
        Cookie: cookie ?? "",
      },
    });
    const islandsHtml = await islandsResponse.text();

    expect(islandsResponse.status).toBe(200);
    expect(
      islandsHtml.split(
        "素の TypeScript から import した共有ディスクリプタです。",
      ).length - 1,
    ).toBe(3);
  });

  test("renders imported descriptor content across Astro, Svelte, and React islands", async () => {
    const response = await server.fetch("/islands?lang=en");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(
      html.split("Shared descriptor imported from plain TypeScript.").length -
        1,
    ).toBe(3);
    expect(html).toContain(
      "Astro, Svelte, and React all translate the same imported descriptor.",
    );
    expect(html).toContain("Svelte macros keep working inside Astro.");
    expect(html).toContain(
      "React components can translate Lingui descriptors inside Astro.",
    );
  });

  test("renders framework interpolation behavior route", async () => {
    const response = await server.fetch("/framework/interpolation");
    const html = cleanupHtml(await response.text());

    expect(response.status).toBe(200);
    expect(html).toContain("Astro interpolation behavior checks");
    expect(html).toContain(
      "Allowed: a JavaScript expression can produce text.",
    );
    expect(html).toContain(
      "Allowed: an interpolation can render one element root.",
    );
    expect(html).toContain(
      "Allowed: an HTML comment can be the whole interpolation.",
    );
    expect(html).toContain(
      "Allowed: a JavaScript block comment can be the whole interpolation.",
    );
    expect(html).toContain("Allowed: first node inside fragment.");
    expect(html).toContain("Allowed: second node inside fragment.");
    expect(html).toContain(
      "Allowed: first node after a comment inside fragment.",
    );
    expect(html).toContain(
      "Allowed: second node after a comment inside fragment.",
    );
    expect(html).toContain("Allowed: an HTML comment can be the true branch.");
    expect(html).toContain("Allowed: an HTML comment can be the false branch.");
    expect(html).toContain("element right branch rendered");
    expect(html).toContain(
      "Allowed: the alternate branch can render a single element root.",
    );
    expect(html).not.toContain("unexpected left");
    expect(html).not.toContain("unexpected right");
  });
});
