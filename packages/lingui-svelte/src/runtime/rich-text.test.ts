import { describe, expect, it } from "vitest";

import { formatRichTextTranslation } from "./rich-text.ts";

describe("formatRichTextTranslation", () => {
  it("parses paired and self-closing placeholder tags", () => {
    expect(
      formatRichTextTranslation("Read the <0>docs</0><1/>.", {
        0: {
          kind: "element",
          tag: "a",
        },
        1: {
          kind: "element",
          tag: "br",
        },
      }),
    ).toEqual([
      "Read the ",
      {
        kind: "component",
        key: "0:0",
        name: "0",
        children: ["docs"],
      },
      {
        kind: "component",
        key: "1:0",
        name: "1",
        children: [],
      },
      ".",
    ]);
  });

  it("preserves nested placeholder structure", () => {
    expect(
      formatRichTextTranslation("<0><1>Deep</1></0>", {
        0: {
          kind: "element",
          tag: "strong",
        },
        1: {
          kind: "element",
          tag: "em",
        },
      }),
    ).toEqual([
      {
        kind: "component",
        key: "0:0",
        name: "0",
        children: [
          {
            kind: "component",
            key: "1:0",
            name: "1",
            children: ["Deep"],
          },
        ],
      },
    ]);
  });

  it("flattens tags that do not have component entries", () => {
    expect(formatRichTextTranslation("Read <0>docs</0>", {})).toEqual([
      "Read ",
      "docs",
    ]);
  });
});
