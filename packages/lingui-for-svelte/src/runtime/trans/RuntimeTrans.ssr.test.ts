import { setupI18n } from "@lingui/core";
import { render } from "svelte/server";
import { describe, expect, it } from "vite-plus/test";

import RuntimeTransFixtureLink from "./RuntimeTransFixtureLink.test.svelte";
import RuntimeTransHarness from "./RuntimeTransHarness.test.svelte";

function normalizeSsrBody(body: string): string {
  return body.replace(/<!--.*?-->/g, "");
}

describe("RuntimeTrans SSR", () => {
  it("renders translated plain text descriptors", () => {
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
        message: {
          id: "demo.greeting",
          message: "Hello {name}!",
        },
        values: {
          name: "Ada",
        },
      },
    });

    expect(normalizeSsrBody(result.body)).toBe("こんにちは Ada！");
  });

  it("renders translated embedded elements with merged runtime values", () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {
          "demo.docs": "Read <0><1>{name}</1></0> carefully before shipping.",
        },
      },
    });

    const result = render(RuntimeTransHarness, {
      props: {
        getI18n: () => i18n,
        message: {
          id: "demo.docs",
          message: "Read <0><1>{name}</1></0> carefully before shipping.",
          values: {
            name: "Descriptor Ada",
          },
        },
        values: {
          name: "Runtime Ada",
        },
        components: {
          0: {
            kind: "element",
            tag: "strong",
            props: {
              class: "outer",
            },
          },
          1: {
            kind: "component",
            component: RuntimeTransFixtureLink,
            props: {
              href: "/docs",
            },
          },
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

  it("renders plain string messages by synthesizing a descriptor id", () => {
    const i18n = setupI18n({
      locale: "en",
      messages: {
        en: {},
      },
    });

    const result = render(RuntimeTransHarness, {
      props: {
        getI18n: () => i18n,
        message: "Fallback <0>copy</0> for {name}.",
        values: {
          name: "Ada",
        },
        components: {
          0: {
            kind: "element",
            tag: "em",
          },
        },
      },
    });

    expect(normalizeSsrBody(result.body)).toBe(
      "Fallback <em>copy</em> for Ada.",
    );
  });

  it("renders id-only runtime Trans calls after build-style lowering", () => {
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
