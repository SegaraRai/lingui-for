import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const localeDir = resolve(import.meta.dirname, "lib", "i18n", "locales");

describe("lingui extract and compile outputs", () => {
  it("contains route-local messages in the extracted source catalog", async () => {
    const enPo = await readFile(resolve(localeDir, "en.po"), "utf8");

    expect(enPo).toContain("Lingui in a small SvelteKit application");
    expect(enPo).toContain("Immediate translation in markup.");
    expect(enPo).toContain("Hello {name} from the basic route.");
    expect(enPo).toContain("Descriptor imported from plain TypeScript.");
    expect(enPo).toContain(
      "A plain TypeScript module can define Lingui descriptors for Svelte.",
    );
    expect(enPo).toContain("$t across Svelte syntax positions");
    expect(enPo).toContain(
      "This placeholder comes from $t inside an attribute",
    );
    expect(enPo).toContain("Keyed subtree revision {0}");
    expect(enPo).toContain("Embedded elements and components inside Trans");
    expect(enPo).toContain("Explicit id from a plain descriptor.");
    expect(enPo).toContain('msgid "playground.ids.trans"');
    expect(enPo).toContain('msgid "playground.ids.call"');
    expect(enPo).toContain('msgid "playground.ids.descriptor"');
  });

  it("contains japanese translations in the compiled catalog", async () => {
    const jaCatalog = await readFile(resolve(localeDir, "ja.ts"), "utf8");

    expect(jaCatalog).toContain("小さな SvelteKit アプリで使う Lingui");
    expect(jaCatalog).toContain("Svelte コンポーネントで直接マクロを使う");
    expect(jaCatalog).toContain(
      "素の TypeScript から import したディスクリプタです。",
    );
    expect(jaCatalog).toContain("Svelte 構文の各所で使う $t");
    expect(jaCatalog).toContain("キー付きサブツリーのリビジョン");
    expect(jaCatalog).toContain("クッキーで保持されるロケール");
    expect(jaCatalog).toContain("Trans コンポーネントからの明示的な id。");
  });
});
