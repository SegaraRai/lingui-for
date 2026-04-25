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
    expect(enPo).toContain("テンプレートこんにちは😀 {name}");
    expect(enPo).toContain("ようこそ <0>{name}</0> さん🚀");
    expect(enPo).toContain("Now viewing the slug {slug}.");
    expect(enPo).toContain("Persisted-props React island");
    expect(enPo).toContain(
      "Plain translated expression inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Single translated element root inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "First translated fragment child inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Second translated fragment child inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "First translated fragment child after an HTML comment inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Second translated fragment child after an HTML comment inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Message before a JavaScript comment interpolation.",
    );
    expect(enPo).toContain("Message after a JavaScript comment interpolation.");
    expect(enPo).toContain(
      "Message before an HTML comment-only interpolation.",
    );
    expect(enPo).toContain("Message after an HTML comment-only interpolation.");
    expect(enPo).toContain("Conditional HTML comment branches");
    expect(enPo).toContain(
      "Message after a selected HTML comment consequent branch.",
    );
    expect(enPo).toContain(
      "Translated alternate element after an unselected HTML comment consequent.",
    );
    expect(enPo).toContain(
      "Translated consequent element before an unselected HTML comment alternate.",
    );
    expect(enPo).toContain(
      "Message after a selected HTML comment alternate branch.",
    );
    expect(enPo).toContain(
      "<0>Trans alternate element after an unselected HTML comment consequent outside an Astro interpolation.</0>",
    );
    expect(enPo).toContain(
      "<0>Trans consequent element before an unselected HTML comment alternate outside an Astro interpolation.</0>",
    );
    expect(enPo).toContain(
      "Plain Trans component message on the interpolation page.",
    );
    expect(enPo).toContain(
      "Trans-wrapped plain expression outside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans-wrapped single root outside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "<0>Trans-wrapped first fragment child outside an Astro interpolation.</0><1>Trans-wrapped second fragment child outside an Astro interpolation.</1>",
    );
    expect(enPo).toContain(
      "<0>Trans-wrapped first fragment child after an HTML comment outside an Astro interpolation.</0><1>Trans-wrapped second fragment child after an HTML comment outside an Astro interpolation.</1>",
    );
    expect(enPo).toContain(
      "Trans-wrapped message before a JavaScript comment outside an Astro interpolation.  Trans-wrapped message after a JavaScript comment outside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans-wrapped message before an HTML comment-only interpolation outside an Astro interpolation.  Trans-wrapped message after an HTML comment-only interpolation outside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans component rendered from inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans-wrapped plain expression inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans-wrapped single root inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "<0>Trans-wrapped first fragment child inside an Astro interpolation.</0><1>Trans-wrapped second fragment child inside an Astro interpolation.</1>",
    );
    expect(enPo).toContain(
      "<0>Trans-wrapped first fragment child after an HTML comment inside an Astro interpolation.</0><1>Trans-wrapped second fragment child after an HTML comment inside an Astro interpolation.</1>",
    );
    expect(enPo).toContain(
      "Trans-wrapped message before a JavaScript comment inside an Astro interpolation.  Trans-wrapped message after a JavaScript comment inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "Trans-wrapped message before an HTML comment-only interpolation inside an Astro interpolation.  Trans-wrapped message after an HTML comment-only interpolation inside an Astro interpolation.",
    );
    expect(enPo).toContain(
      "<0>Trans alternate element after an unselected HTML comment consequent inside an Astro interpolation.</0>",
    );
    expect(enPo).toContain(
      "<0>Trans consequent element before an unselected HTML comment alternate inside an Astro interpolation.</0>",
    );
  });

  test("contains japanese translations for representative multi-page messages", async () => {
    const jaCatalog = await readFile(resolve(localeDir, "ja.ts"), "utf8");

    expect(jaCatalog).toContain("Lingui Astro マルチページプレイグラウンド");
    expect(jaCatalog).toContain("サーバー翻訳の確認");
    expect(jaCatalog).toContain("動的ルートの確認");
    expect(jaCatalog).toContain("クライアント遷移の確認");
    expect(jaCatalog).toContain("テンプレートこんにちは😀 ");
    expect(jaCatalog).toContain("ようこそ <0>");
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
