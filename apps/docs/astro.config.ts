import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import starlight from "@astrojs/starlight";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import stripWhitespace from "astro-strip-whitespace";
import { defineConfig } from "astro/config";

import linguiForAstro from "lingui-for-astro/integration";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

import { macroWorkbenchPlugin } from "./plugins/macro-workbench.ts";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const hashTabSyncScript = readFileSync(
  new URL("./src/scripts/hash-tab-sync.js", import.meta.url),
  "utf8",
);

export default defineConfig({
  output: "static",
  site: "https://lingui-for.roundtrip.dev",
  trailingSlash: "never",
  build: {
    format: "preserve",
  },
  integrations: [
    linguiForAstro(),
    svelte(),
    starlight({
      head: [{ tag: "script", content: hashTabSyncScript }],
      title: {
        en: "lingui-for",
        ja: "lingui-for",
      },
      description:
        "Macro-first, official-first Lingui support for frameworks and languages beyond the official integrations.",
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        ja: {
          label: "日本語",
          lang: "ja",
        },
      },
      customCss: ["./src/styles/global.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/SegaraRai/lingui-for",
        },
      ],
      sidebar: [
        {
          label: "Overview",
          translations: {
            ja: "概要",
          },
          items: [
            {
              label: "Introduction",
              translations: {
                ja: "はじめに",
              },
              slug: "",
            },
            {
              label: "Concepts",
              translations: {
                ja: "コンセプト",
              },
              slug: "concepts",
            },
          ],
        },
        {
          label: "Svelte",
          translations: {
            ja: "Svelte",
          },
          items: [
            {
              label: "Getting Started",
              translations: {
                ja: "はじめに",
              },
              slug: "frameworks/svelte/getting-started",
            },
            {
              label: "i18n Context",
              translations: {
                ja: "i18n コンテキスト",
              },
              slug: "frameworks/svelte/i18n-context",
            },
            {
              label: "Reactive Macros",
              translations: {
                ja: "リアクティブマクロ",
              },
              slug: "frameworks/svelte/reactive-macros",
            },
            {
              label: "Trans",
              translations: {
                ja: "Trans",
              },
              slug: "frameworks/svelte/trans-component",
            },
            {
              label: "Locale Resolution",
              translations: {
                ja: "ロケール解決",
              },
              slug: "frameworks/svelte/locale-resolution",
            },
            {
              label: "Caveats",
              translations: {
                ja: "注意点",
              },
              slug: "frameworks/svelte/caveats",
            },
          ],
        },
        {
          label: "Astro",
          translations: {
            ja: "Astro",
          },
          items: [
            {
              label: "Getting Started",
              translations: {
                ja: "はじめに",
              },
              slug: "frameworks/astro/getting-started",
            },
            {
              label: "i18n Context",
              translations: {
                ja: "i18n コンテキスト",
              },
              slug: "frameworks/astro/i18n-context",
            },
            {
              label: "Using Islands",
              translations: {
                ja: "アイランドの使用",
              },
              slug: "frameworks/astro/using-islands",
            },
            {
              label: "Trans",
              translations: {
                ja: "Trans",
              },
              slug: "frameworks/astro/trans-component",
            },
            {
              label: "Caveats",
              translations: {
                ja: "注意点",
              },
              slug: "frameworks/astro/caveats",
            },
          ],
        },
        {
          label: "Macros",
          translations: {
            ja: "マクロ",
          },
          items: [
            {
              label: "Core Macros",
              translations: {
                ja: "コアマクロ",
              },
              slug: "macros/core-macros",
            },
            {
              label: "t",
              translations: {
                ja: "t",
              },
              slug: "macros/t",
            },
            {
              label: "msg and defineMessage",
              translations: {
                ja: "msg と defineMessage",
              },
              slug: "macros/msg-and-define-message",
            },
            {
              label: "plural",
              translations: {
                ja: "plural",
              },
              slug: "macros/plural",
            },
            {
              label: "select",
              translations: {
                ja: "select",
              },
              slug: "macros/select",
            },
            {
              label: "selectOrdinal",
              translations: {
                ja: "selectOrdinal",
              },
              slug: "macros/select-ordinal",
            },
            {
              label: "Component Macros",
              translations: {
                ja: "コンポーネントマクロ",
              },
              slug: "macros/component-macros",
            },
            {
              label: "Trans",
              translations: {
                ja: "Trans",
              },
              slug: "macros/trans-component",
            },
            {
              label: "Plural",
              translations: {
                ja: "Plural",
              },
              slug: "macros/plural-component",
            },
            {
              label: "Select",
              translations: {
                ja: "Select",
              },
              slug: "macros/select-component",
            },
            {
              label: "SelectOrdinal",
              translations: {
                ja: "SelectOrdinal",
              },
              slug: "macros/select-ordinal-component",
            },
          ],
        },
        {
          label: "Guides",
          translations: {
            ja: "ガイド",
          },
          items: [
            {
              label: "Install and First Translation",
              translations: {
                ja: "インストールと最初の翻訳",
              },
              slug: "guides/install-and-first-translation",
            },
            {
              label: "Plain JS/TS Setup",
              translations: {
                ja: "プレーンな JS/TS でのセットアップ",
              },
              slug: "guides/plain-js-ts",
            },
            {
              label: "Add a Locale",
              translations: {
                ja: "ロケールを追加する",
              },
              slug: "guides/add-a-locale",
            },
            {
              label: "Load Compiled Catalogs",
              translations: {
                ja: "コンパイル済みカタログの読み込み",
              },
              slug: "guides/load-compiled-catalogs",
            },
            {
              label: "Extract, Compile, and Verify",
              translations: {
                ja: "抽出、コンパイル、検証",
              },
              slug: "guides/extract-compile-verify",
            },
            {
              label: "Framework Config",
              translations: {
                ja: "フレームワーク設定",
              },
              slug: "guides/framework-config",
            },
            {
              label: "Share Messages Across Files",
              translations: {
                ja: "ファイルをまたいでメッセージを共有する",
              },
              slug: "guides/share-messages-across-files",
            },
            {
              label: "Rich Text and Structured Messages",
              translations: {
                ja: "リッチテキストと構造化メッセージ",
              },
              slug: "guides/rich-text-and-structured-messages",
            },
            {
              label: "Whitespace in Component Macros",
              translations: {
                ja: "コンポーネントマクロにおける空白",
              },
              slug: "guides/whitespace-in-component-macros",
            },
            {
              label: "Package Reference",
              translations: {
                ja: "パッケージリファレンス",
              },
              slug: "guides/package-reference",
            },
          ],
        },
      ],
    }),
  ],
  vite: {
    plugins: [
      linguiMacro(),
      macroWorkbenchPlugin({ projectRoot }),
      tailwindcss(),
      stripWhitespace(),
      // TODO: remove type assertion once Astro uses Vite 8
      linguiForSvelte() as any,
    ],
  },
});
