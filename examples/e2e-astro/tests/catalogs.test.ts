import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const localeDir = resolve(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "i18n",
  "locales",
);

describe("lingui extract and compile outputs", () => {
  test("contains messages from every Astro verification route", async () => {
    const enPo = await readFile(resolve(localeDir, "en.po"), "utf8");

    expect(enPo).toContain("Lingui Astro multi-page playground");
    expect(enPo).toContain("Server translation checks");
    expect(enPo).toContain("Island translation checks");
    expect(enPo).toContain("Rich text translation checks");
    expect(enPo).toContain("Format macro checks");
    expect(enPo).toContain("Dynamic route checks");
    expect(enPo).toContain("Client transition checks");
    expect(enPo).toContain("Current page: {currentPage}");
    expect(enPo).toContain("Shared descriptor imported from plain TypeScript.");
    expect(enPo).toContain(
      "Astro, Svelte, and React all translate the same imported descriptor.",
    );
    expect(enPo).toContain(
      "React rich text keeps component placeholders intact.",
    );
    expect(enPo).toContain(
      "Svelte runs plural, select, and selectOrdinal macros in component code.",
    );
    expect(enPo).toContain("Now viewing the slug {slug}.");
    expect(enPo).toContain("Persisted-props React island");
  });

  test("contains japanese translations for representative multi-page messages", async () => {
    const jaCatalog = await readFile(resolve(localeDir, "ja.ts"), "utf8");

    expect(jaCatalog).toContain("Lingui Astro マルチページプレイグラウンド");
    expect(jaCatalog).toContain("サーバー翻訳の確認");
    expect(jaCatalog).toContain("動的ルートの確認");
    expect(jaCatalog).toContain("クライアント遷移の確認");
    expect(jaCatalog).toContain(
      "素の TypeScript から import した共有ディスクリプタです。",
    );
    expect(jaCatalog).toContain("現在のページ: ");
    expect(jaCatalog).toContain("現在表示中の slug は ");
    expect(jaCatalog).toContain(
      "React リッチテキストはコンポーネントのプレースホルダーをそのまま保ちます。",
    );
    expect(jaCatalog).toContain(
      "Svelte はコンポーネントコードの中で plural、select、selectOrdinal マクロを実行します。",
    );
    expect(jaCatalog).toContain("プロパティが永続化された React アイランド");
  });
});
