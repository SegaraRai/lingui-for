import { setupI18n } from "@lingui/core";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, test } from "vite-plus/test";

import RuntimeTransWhitespaceHarness from "./RuntimeTransWhitespaceHarness.test.astro";

function normalizeAstroSsrBody(html: string): string {
  return html
    .replaceAll(/\s*data-astro-source-file="[^"]+"/g, "")
    .replaceAll(/\s*data-astro-source-loc="[^"]+"/g, "");
}

function extractWrapper(html: string): string {
  const openTag = "<runtime-trans-wrapper>";
  const start = html.indexOf(openTag);

  if (start === -1) {
    throw new Error("Could not find runtime-trans-wrapper");
  }

  const end = html.indexOf("</runtime-trans-wrapper>", start);

  if (end === -1) {
    throw new Error("Could not find closing runtime-trans-wrapper");
  }

  return html.slice(start, end + "</runtime-trans-wrapper>".length);
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

    expect(extractWrapper(normalizeAstroSsrBody(html))).toBe(
      '<runtime-trans-wrapper>Lead<a class="fixture-link" data-kind="fixture-link" href="/docs">docs</a>mid<div class="fixture-box"><strong class="fixture-strong">deep</strong>tail</div>end.</runtime-trans-wrapper>',
    );
  });
});
