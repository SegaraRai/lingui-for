import { describe, expect, it } from "vite-plus/test";

import { formatRichTextTranslation } from "./components/rich-text.ts";
import { getLinguiContext, setLinguiContext } from "./core/context.ts";

describe("lingui-for-astro runtime helpers", () => {
  it("stores and reads the request-scoped Lingui context from Astro.locals", () => {
    const locals: Record<string, unknown> = {};
    const i18n = { _: () => "translated" } as never;

    setLinguiContext(locals, i18n);

    expect(getLinguiContext({ locals }).i18n).toBe(i18n);
  });

  it("parses rich-text translations into stable render nodes", () => {
    expect(
      formatRichTextTranslation("Read <0><1>Ada</1></0> carefully.", {
        0: {
          kind: "element",
          tag: "strong",
        },
        1: {
          kind: "component",
          component: () => {},
        },
      }),
    ).toEqual([
      "Read ",
      {
        kind: "component",
        key: "0:0",
        name: "0",
        children: [
          {
            kind: "component",
            key: "1:0",
            name: "1",
            children: ["Ada"],
          },
        ],
      },
      " carefully.",
    ]);
  });

  it("treats unknown rich-text tags as transparent wrappers", () => {
    expect(
      formatRichTextTranslation("Read <0>the <1>docs</1></0> carefully.", {
        1: {
          kind: "element",
          tag: "em",
        },
      }),
    ).toEqual([
      "Read ",
      "the ",
      {
        kind: "component",
        key: "1:0",
        name: "1",
        children: ["docs"],
      },
      " carefully.",
    ]);
  });
});
