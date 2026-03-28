import { describe, expect, test } from "vite-plus/test";

import { formatRichTextTranslation } from "./rich-text.ts";

describe("formatRichTextTranslation", () => {
  test("parses paired and self-closing placeholder tags", () => {
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

  test("preserves nested placeholder structure", () => {
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

  test("flattens tags that do not have component entries", () => {
    expect(formatRichTextTranslation("Read <0>docs</0>", {})).toEqual([
      "Read ",
      "docs",
    ]);
  });

  test("preserves known placeholders nested inside unknown wrappers", () => {
    expect(
      formatRichTextTranslation("Read <x><0>docs</0></x> now.", {
        0: {
          kind: "element",
          tag: "strong",
        },
      }),
    ).toEqual([
      "Read ",
      {
        kind: "component",
        key: "0:0",
        name: "0",
        children: ["docs"],
      },
      " now.",
    ]);
  });

  test("allocates stable keys for repeated placeholder occurrences", () => {
    expect(
      formatRichTextTranslation("<0>One</0> and <0>Two</0>", {
        0: {
          kind: "element",
          tag: "strong",
        },
      }),
    ).toEqual([
      {
        kind: "component",
        key: "0:0",
        name: "0",
        children: ["One"],
      },
      " and ",
      {
        kind: "component",
        key: "0:1",
        name: "0",
        children: ["Two"],
      },
    ]);
  });

  test("falls back to literal text for malformed placeholder markup", () => {
    expect(
      formatRichTextTranslation("Read <0>docs</1> and <0>later", {
        0: {
          kind: "element",
          tag: "strong",
        },
      }),
    ).toEqual(["Read <0>docs</1> and <0>later"]);
  });

  test("drops unknown self-closing placeholders while preserving adjacent text", () => {
    expect(formatRichTextTranslation("Line<1/>break", {})).toEqual([
      "Linebreak",
    ]);
  });

  test("parses rich-text translations into stable render nodes", () => {
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

  test("treats unknown rich-text tags as transparent wrappers", () => {
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
