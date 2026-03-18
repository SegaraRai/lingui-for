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
      title: "lingui-for",
      description:
        "Macro-first, official-first Lingui support for frameworks and languages beyond the official integrations.",
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
          items: [
            {
              label: "Introduction",
              slug: "",
            },
            {
              label: "Concepts",
              slug: "concepts",
            },
          ],
        },
        {
          label: "Svelte",
          items: [
            {
              label: "Getting Started",
              slug: "frameworks/svelte/getting-started",
            },
            {
              label: "Caveats",
              slug: "frameworks/svelte/caveats",
            },
          ],
        },
        {
          label: "Astro",
          items: [
            {
              label: "Getting Started",
              slug: "frameworks/astro/getting-started",
            },
            {
              label: "Using Islands",
              slug: "frameworks/astro/using-islands",
            },
            {
              label: "Caveats",
              slug: "frameworks/astro/caveats",
            },
          ],
        },
        {
          label: "Macros",
          items: [
            {
              label: "Core Macros",
              slug: "macros/core-macros",
            },
            {
              label: "t",
              slug: "macros/t",
            },
            {
              label: "msg and defineMessage",
              slug: "macros/msg-and-define-message",
            },
            {
              label: "plural",
              slug: "macros/plural",
            },
            {
              label: "select",
              slug: "macros/select",
            },
            {
              label: "selectOrdinal",
              slug: "macros/select-ordinal",
            },
            {
              label: "Component Macros",
              slug: "macros/component-macros",
            },
            {
              label: "Trans",
              slug: "macros/trans-component",
            },
            {
              label: "Plural",
              slug: "macros/plural-component",
            },
            {
              label: "Select",
              slug: "macros/select-component",
            },
            {
              label: "SelectOrdinal",
              slug: "macros/select-ordinal-component",
            },
          ],
        },
        {
          label: "Guides",
          items: [
            {
              label: "Install and First Translation",
              slug: "guides/install-and-first-translation",
            },
            {
              label: "Add a Locale",
              slug: "guides/add-a-locale",
            },
            {
              label: "Extract, Compile, and Verify",
              slug: "guides/extract-compile-verify",
            },
            {
              label: "Share Messages Across Files",
              slug: "guides/share-messages-across-files",
            },
            {
              label: "Rich Text and Structured Messages",
              slug: "guides/rich-text-and-structured-messages",
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
