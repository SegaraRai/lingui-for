import { describe, expect, it } from "vite-plus/test";

import { stripQuery } from "./paths.ts";

describe("paths", () => {
  it("strips query strings from ids", () => {
    expect(
      stripQuery("Component.astro?astro&type=script&index=0&lang.ts"),
    ).toBe("Component.astro");
  });

  it("leaves ids without query strings unchanged", () => {
    expect(stripQuery("/work/Page.astro")).toBe("/work/Page.astro");
  });
});
