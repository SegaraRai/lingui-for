import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const localeDir = resolve(import.meta.dirname, "lib", "i18n", "locales");

describe("lingui extract and compile outputs", () => {
  it("contains messages from every Astro verification route", async () => {
    const enPo = await readFile(resolve(localeDir, "en.po"), "utf8");

    expect(enPo).toContain("Lingui Astro multi-page playground");
    expect(enPo).toContain("Server translation checks");
    expect(enPo).toContain("Island translation checks");
    expect(enPo).toContain("MDX translation checks");
    expect(enPo).toContain("Content collection checks");
    expect(enPo).toContain("Rich text translation checks");
    expect(enPo).toContain("Format macro checks");
    expect(enPo).toContain("Dynamic route checks");
    expect(enPo).toContain("Client transition checks");
    expect(enPo).toContain("Current page: {currentPage}");
    expect(enPo).toContain("Shared descriptor imported from plain TypeScript.");
    expect(enPo).toContain(
      "Astro, Svelte, and React all translate the same imported descriptor.",
    );
    expect(enPo).toContain("MDX module descriptors stay extractable.");
    expect(enPo).toContain(
      "MDX content files compile Lingui macros after Astro's MDX pipeline.",
    );
    expect(enPo).toContain(
      "MDX also renders imported descriptors and eager translations inside component content.",
    );
    expect(enPo).toContain(
      "{0, plural, one {# MDX root format sample} other {# MDX root format samples}}",
    );
    expect(enPo).toContain("Nested <0>MDX link</0> content keeps rich text.");
    expect(enPo).toContain(
      "{0, select, calm {MDX nested select says calm.} excited {MDX nested select says excited.} other {MDX nested select says unknown.}}",
    );
    expect(enPo).toContain(
      "{0, selectordinal, one {MDX nested ordinal says #st.} two {MDX nested ordinal says #nd.} few {MDX nested ordinal says #rd.} other {MDX nested ordinal says #th.}}",
    );
    expect(enPo).toContain("MDX attribute tooltip");
    expect(enPo).toContain("MDX attribute label");
    expect(enPo).toContain("MDX attribute macro link");
    expect(enPo).toContain(
      "The MDX page keeps the <0>settings link</0> inside translated output.",
    );
    expect(enPo).toContain(
      "MDX rich text can preserve <0>strong emphasis</0> too.",
    );
    expect(enPo).toContain(
      "Collection-level MDX descriptors stay extractable.",
    );
    expect(enPo).toContain("Content collection rendering");
    expect(enPo).toContain(
      "Content collections can render MDX entries through entry.render().",
    );
    expect(enPo).toContain(
      "HTML tags can render translated MDX expressions too.",
    );
    expect(enPo).toContain(
      "The collection entry keeps the <0>settings link</0> in translated output.",
    );
    expect(enPo).toContain(
      "Collection rich text can preserve <0>strong emphasis</0> too.",
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

  it("contains japanese translations for representative multi-page messages", async () => {
    const jaCatalog = await readFile(resolve(localeDir, "ja.ts"), "utf8");

    expect(jaCatalog).toContain("Lingui Astro マルチページプレイグラウンド");
    expect(jaCatalog).toContain("サーバー翻訳の確認");
    expect(jaCatalog).toContain("MDX 翻訳の確認");
    expect(jaCatalog).toContain("コンテンツコレクションの確認");
    expect(jaCatalog).toContain("動的ルートの確認");
    expect(jaCatalog).toContain("クライアント遷移の確認");
    expect(jaCatalog).toContain(
      "素の TypeScript から import した共有ディスクリプタです。",
    );
    expect(jaCatalog).toContain("現在のページ: ");
    expect(jaCatalog).toContain(
      "MDX のモジュールディスクリプタも抽出対象のままです。",
    );
    expect(jaCatalog).toContain(
      "MDX でも import したディスクリプタと eager 翻訳をコンポーネント本文の中で描画できます。",
    );
    expect(jaCatalog).toContain("件の MDX ルートフォーマットサンプル");
    expect(jaCatalog).toContain(
      "入れ子の<0>MDX リンク</0>コンテンツでもリッチテキストを保てます。",
    );
    expect(jaCatalog).toContain("MDX の入れ子 select は興奮しています。");
    expect(jaCatalog).toContain("MDX の入れ子 ordinal は ");
    expect(jaCatalog).toContain("MDX 属性ツールチップ");
    expect(jaCatalog).toContain("MDX 属性ラベル");
    expect(jaCatalog).toContain("MDX 属性マクロリンク");
    expect(jaCatalog).toContain(
      "MDX ページでも翻訳結果の中に<0>設定リンク</0>を保てます。",
    );
    expect(jaCatalog).toContain(
      "MDX リッチテキストでも<0>強調表示</0>を保てます。",
    );
    expect(jaCatalog).toContain(
      "コレクションレベルの MDX ディスクリプタも抽出対象のままです。",
    );
    expect(jaCatalog).toContain(
      "コンテンツコレクションは entry.render() 経由で MDX エントリを描画できます。",
    );
    expect(jaCatalog).toContain(
      "HTML タグの中でも翻訳済みの MDX 式を描画できます。",
    );
    expect(jaCatalog).toContain(
      "コレクションエントリでも翻訳結果の中に<0>設定リンク</0>を保てます。",
    );
    expect(jaCatalog).toContain(
      "コレクションのリッチテキストでも<0>強調表示</0>を保てます。",
    );
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
