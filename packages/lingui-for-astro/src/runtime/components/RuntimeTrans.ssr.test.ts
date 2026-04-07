import { setupI18n } from "@lingui/core";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vite-plus/test";

import RuntimeTransWhitespaceHarness from "./RuntimeTransWhitespaceHarness.test.astro";

function normalizeAstroSsrBody(html: string): string {
  return html.replaceAll(
    /\s*data-astro-source-file="[^"]+"\s+data-astro-source-loc="[^"]+"/g,
    "",
  );
}

describe("RuntimeTrans SSR", () => {
  test("renders rich-text placeholders without adding extra SSR whitespace", async () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {
          "demo.tight": "Lead<0>docs</0>mid<1><2>deep</2>tail</1>end.",
        },
      },
    });

    const container = await AstroContainer.create();
    const html = await container.renderToString(RuntimeTransWhitespaceHarness, {
      props: {
        i18n,
        id: "demo.tight",
        message: "Lead<0>docs</0>mid<1><2>deep</2>tail</1>end.",
      },
    });

    expect(normalizeAstroSsrBody(html)).toBe(
      '<div class="runtime-trans-wrapper">Lead<a class="fixture-link" data-kind="fixture-link" href="/docs">docs</a>mid<div class="fixture-box"><strong class="fixture-strong">deep</strong>tail</div>end.</div>',
    );
  });
});
