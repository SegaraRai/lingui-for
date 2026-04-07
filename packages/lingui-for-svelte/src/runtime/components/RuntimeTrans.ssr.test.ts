import { setupI18n } from "@lingui/core";
import { render } from "svelte/server";
import { describe, expect, test } from "vite-plus/test";

import RuntimeTransEmphasisHarness from "./RuntimeTransEmphasisHarness.test.svelte";
import RuntimeTransHarness from "./RuntimeTransHarness.test.svelte";
import RuntimeTransRichTextHarness from "./RuntimeTransRichTextHarness.test.svelte";
import RuntimeTransWhitespaceHarness from "./RuntimeTransWhitespaceHarness.test.svelte";

function normalizeSsrBody(body: string): string {
  return body.replaceAll(/<!--[\w[\]-]*-->/g, "");
}

describe("RuntimeTrans SSR", () => {
  test("renders translated plain text descriptors", () => {
    const i18n = setupI18n({
      locale: "ja",
      messages: {
        ja: {
          "demo.greeting": "こんにちは {name}！",
        },
      },
    });

    const result = render(RuntimeTransHarness, {
      props: {
        getI18n: () => i18n,
        id: "demo.greeting",
        message: "Hello {name}!",
        values: {
          name: "Ada",
        },
      },
    });

    expect(normalizeSsrBody(result.body)).toBe("こんにちは Ada！");
  });

  test("renders translated embedded elements with merged runtime values", () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {
          "demo.docs": "Read <0><1>{name}</1></0> carefully before shipping.",
        },
      },
    });

    const result = render(RuntimeTransRichTextHarness, {
      props: {
        getI18n: () => i18n,
        id: "demo.docs",
        message: "Read <0><1>{name}</1></0> carefully before shipping.",
        values: {
          name: "Runtime Ada",
        },
      },
    });

    const body = normalizeSsrBody(result.body);

    expect(body).toContain('<strong class="outer">');
    expect(body).toContain(
      '<a class="fixture-link" data-kind="fixture-link" href="/docs">Runtime Ada</a>',
    );
    expect(body).toContain("carefully before shipping.");
  });

  test("renders rich-text placeholders without adding extra SSR whitespace", () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {
          "demo.tight": "Lead<0>docs</0>mid<1><2>deep</2>tail</1>end.",
        },
      },
    });

    const result = render(RuntimeTransWhitespaceHarness, {
      props: {
        getI18n: () => i18n,
        id: "demo.tight",
        message: "Lead<0>docs</0>mid<1><2>deep</2>tail</1>end.",
      },
    });

    expect(normalizeSsrBody(result.body)).toBe(
      '<div class="runtime-trans-wrapper">Lead<a class="fixture-link" data-kind="fixture-link" href="/docs">docs</a>mid<div class="fixture-box"><strong class="fixture-strong">deep</strong>tail</div>end.</div>',
    );
  });

  test("renders message fallbacks through Lingui", () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {},
      },
    });

    const result = render(RuntimeTransEmphasisHarness, {
      props: {
        getI18n: () => i18n,
        id: "demo.fallback",
        message: "Fallback <0>copy</0> for {name}.",
        values: {
          name: "Ada",
        },
      },
    });

    expect(normalizeSsrBody(result.body)).toBe(
      "Fallback <em>copy</em> for Ada.",
    );
  });

  test("renders id-only runtime Trans calls after build-style lowering", () => {
    const i18n = setupI18n({
      locale: "ja",
      messages: {
        ja: {
          "demo.component-only-id": "ビルド後の {count} 件",
        },
      },
    });

    const result = render(RuntimeTransHarness, {
      props: {
        getI18n: () => i18n,
        id: "demo.component-only-id",
        values: {
          count: 2,
        },
      },
    });

    expect(normalizeSsrBody(result.body)).toBe("ビルド後の 2 件");
  });
});
