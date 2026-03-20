import { describe, expect, test } from "vite-plus/test";
import { commands } from "vite-plus/test/browser";

describe.sequential("dev hydration", () => {
  test("does not log Lingui locale initialization errors during hydration", async () => {
    const result = await commands.captureHydrationErrors(
      "/playground/reactive?lang=en",
    );

    expect(result.errors).toEqual([]);
  });

  test("switches locale from the header during dev navigation", async () => {
    const switched = await commands.switchLocaleFromHeader("/?lang=en", "ja");

    expect(switched.currentUrl).toContain("?lang=ja");
    expect(switched.bodyText).toContain("小さな SvelteKit アプリで使う Lingui");
    expect(switched.errors).toEqual([]);
  }, 30_000);

  test("updates the html lang attribute during dev navigation", async () => {
    const switched = await commands.switchLocaleFromHeader("/?lang=en", "ja");

    expect(switched.currentUrl).toContain("?lang=ja");
    expect(switched.bodyText).toContain("小さな SvelteKit アプリで使う Lingui");
    expect(switched.bodyText).toContain("サーバーが選択した言語を記憶する");
    expect(switched.htmlLang).toBe("ja");
    expect(switched.errors).toEqual([]);
  }, 30_000);

  test("renders japanese catalogs on the app home route", async () => {
    const home = await commands.captureHydrationErrors("/?lang=ja");

    expect(home.bodyText).toContain("小さな SvelteKit アプリで使う Lingui");
    expect(home.bodyText).toContain("設定");
    expect(home.errors).toEqual([]);
  });

  test("renders japanese catalogs on the reactive playground route", async () => {
    const reactive = await commands.captureHydrationErrors(
      "/playground/reactive?lang=ja",
    );

    expect(reactive.bodyText).toContain("$t とルーンベースのステート");
    expect(reactive.bodyText).toContain(
      "リアクティブルートからこんにちは、SvelteKit。",
    );
    expect(reactive.bodyText).toContain("件数: 2");
    expect(reactive.bodyText).toContain("現在の状態");
    expect(reactive.errors).toEqual([]);
  });

  test("renders the rich-text playground route without hydration errors", async () => {
    const richText = await commands.captureHydrationErrors(
      "/playground/rich-text?lang=ja",
    );

    expect(richText.bodyText).toContain("クッキーで保持されるロケール");
    expect(richText.bodyText).toContain("意味のある強調");
    expect(richText.errors).toEqual([]);
  });

  test("renders the syntax playground route without hydration errors", async () => {
    const syntax = await commands.captureHydrationErrors(
      "/playground/syntax?lang=ja",
    );

    expect(syntax.bodyText).toContain("Svelte 構文の各所で使う $t");
    expect(syntax.bodyText).toContain("状態サマリー: アイドル");
    expect(syntax.bodyText).toContain("フィルタ文字列: （未入力）");
    expect(syntax.bodyText).toContain("キー付きサブツリーのリビジョン 1");
    expect(syntax.errors).toEqual([]);
  });

  test("renders the component playground route without hydration errors", async () => {
    const components = await commands.captureHydrationErrors(
      "/playground/components?lang=ja",
    );

    expect(components.bodyText).toContain(
      "コンポーネントタスクは 2 件待機中です",
    );
    expect(components.bodyText).toContain("ロケール切り替えを承認しました。");
    expect(components.bodyText).toContain("第 2 リリース候補");
    expect(components.errors).toEqual([]);
  });

  test("renders explicit-id playground route without hydration errors", async () => {
    const result = await commands.captureHydrationErrors(
      "/playground/ids?lang=ja",
    );

    expect(result.bodyText).toContain("id、コメント、コンテキストの確認に絞る");
    expect(result.bodyText).toContain(
      "Trans コンポーネントからの明示的な id。",
    );
    expect(result.errors).toEqual([]);
  });
});
