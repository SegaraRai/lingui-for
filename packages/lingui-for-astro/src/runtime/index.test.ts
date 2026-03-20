import { describe, expect, it } from "vite-plus/test";

import { getLinguiContext, setLinguiContext } from "./core/context.ts";
import { formatRichTextTranslation } from "./trans/rich-text.ts";
import {
  mergeRuntimeTransValues,
  translateRuntimeTrans,
} from "./trans/trans-descriptor.ts";

describe("lingui-for-astro runtime helpers", () => {
  it("stores and reads the request-scoped Lingui context from Astro.locals", () => {
    const locals: Record<string, unknown> = {};
    const i18n = { _: () => "translated" } as never;

    setLinguiContext(locals, i18n);

    expect(getLinguiContext({ locals }).i18n).toBe(i18n);
  });

  it("merges runtime values on top of descriptor values", () => {
    expect(
      mergeRuntimeTransValues(
        {
          id: "demo.greeting",
          message: "Hello {name} from {place}",
          values: {
            name: "Descriptor Ada",
            place: "Tokyo",
          },
        },
        {
          name: "Runtime Ada",
        },
      ),
    ).toEqual({
      id: "demo.greeting",
      message: "Hello {name} from {place}",
      values: {
        name: "Runtime Ada",
        place: "Tokyo",
      },
    });
  });

  it("translates descriptor, id-only, and string runtime trans inputs", () => {
    const calls: unknown[] = [];
    const i18n = {
      _: (...args: unknown[]) => {
        calls.push(args);
        return "translated";
      },
    } as never;

    expect(
      translateRuntimeTrans(
        i18n,
        {
          id: "demo.greeting",
          message: "Hello {name}",
          values: {
            name: "Descriptor Ada",
          },
        },
        {
          name: "Runtime Ada",
        },
      ),
    ).toBe("translated");
    expect(
      translateRuntimeTrans(i18n, undefined, { count: 2 }, "demo.count"),
    ).toBe("translated");
    expect(translateRuntimeTrans(i18n, "Save", { count: 1 }, "demo.save")).toBe(
      "translated",
    );

    expect(calls).toEqual([
      [
        {
          id: "demo.greeting",
          message: "Hello {name}",
          values: {
            name: "Runtime Ada",
          },
        },
      ],
      ["demo.count", { count: 2 }, undefined],
      ["demo.save", { count: 1 }, { message: "Save" }],
    ]);
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
