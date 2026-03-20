import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { AppServer, serverModes } from "./support/app-server.ts";
import { httpRouteCases } from "./support/expectations.ts";

describe.sequential.for(serverModes)("%s http rendering", (mode) => {
  const server = new AppServer(mode);

  beforeAll(async () => {
    await server.start();
  }, 30_000);

  afterAll(async () => {
    await server.close();
  });

  it.for(httpRouteCases)(
    "renders $path in $locale",
    async ({ expectedBody, expectedHtmlSnippets, locale, path }) => {
      const response = await server.fetch(`${path}?lang=${locale}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain(`<html lang="${locale}">`);

      for (const expectedText of expectedBody) {
        expect(html).toContain(expectedText);
      }

      for (const expectedText of expectedHtmlSnippets) {
        expect(html).toContain(expectedText);
      }
    },
  );

  it("reuses the locale cookie on routing and settings routes", async () => {
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

  it("renders imported descriptor content across Astro, Svelte, and React islands", async () => {
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
});
