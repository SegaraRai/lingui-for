import { describe, expect, test } from "vite-plus/test";

import { stripQuery } from "./paths.ts";

describe("paths", () => {
  test("strips query strings from ids", () => {
    expect(
      stripQuery("Component.astro?astro&type=script&index=0&lang.ts"),
    ).toBe("Component.astro");

    expect(stripQuery("Component.svelte?type=style&lang.css")).toBe(
      "Component.svelte",
    );
  });

  test("leaves ids without query strings unchanged", () => {
    expect(stripQuery("/work/Page.astro")).toBe("/work/Page.astro");
  });
});
