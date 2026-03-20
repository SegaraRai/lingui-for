import { describe, expect, it } from "vite-plus/test";

import {
  mergeRuntimeTransValues,
  translateRuntimeTrans,
} from "./trans-descriptor.ts";

describe("mergeRuntimeTransValues", () => {
  it("keeps descriptor values when no overrides are provided", () => {
    expect(
      mergeRuntimeTransValues({
        id: "demo.greeting",
        message: "Hello {name}",
        values: {
          name: "Ada",
        },
      }),
    ).toEqual({
      id: "demo.greeting",
      message: "Hello {name}",
      values: {
        name: "Ada",
      },
    });
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
});

describe("translateRuntimeTrans", () => {
  it("translates descriptor inputs with merged runtime values", () => {
    const i18n = {
      _: (input: unknown) => JSON.stringify(input),
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
    ).toBe(
      JSON.stringify({
        id: "demo.greeting",
        message: "Hello {name}",
        values: {
          name: "Runtime Ada",
        },
      }),
    );
  });

  it("translates id-only runtime Trans calls without a default message", () => {
    const calls: unknown[] = [];
    const i18n = {
      _: (...args: unknown[]) => {
        calls.push(args);
        return "translated";
      },
    } as never;

    expect(
      translateRuntimeTrans(i18n, undefined, { count: 2 }, "demo.count"),
    ).toBe("translated");
    expect(calls).toEqual([["demo.count", { count: 2 }, undefined]]);
  });

  it("translates plain string messages through id + message options", () => {
    const calls: unknown[] = [];
    const i18n = {
      _: (...args: unknown[]) => {
        calls.push(args);
        return "translated";
      },
    } as never;

    expect(translateRuntimeTrans(i18n, "Save", { count: 1 }, "demo.save")).toBe(
      "translated",
    );
    expect(calls).toEqual([["demo.save", { count: 1 }, { message: "Save" }]]);
  });
});
