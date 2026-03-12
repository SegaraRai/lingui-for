import { describe, expect, it } from "vitest";

import { analyzeSvelte } from "./svelte-analysis.ts";

describe("analyzeSvelte", () => {
  it("extracts module and instance scripts plus markup expressions", () => {
    const source = String.raw`<script module lang="ts">
  export const prerender = true;
</script>

<script lang="ts">
  const count = 1;
</script>

<div title={count}>{count + 1}</div>`;

    const analysis = analyzeSvelte(source, "Component.svelte");

    expect(analysis.module?.lang).toBe("ts");
    expect(analysis.module?.content).toContain("prerender");
    expect(analysis.instance?.lang).toBe("ts");
    expect(analysis.instance?.content).toContain("const count = 1;");
    expect(analysis.expressions.map((expression) => expression.source)).toEqual(
      ["count", "count + 1"],
    );
  });

  it("returns no scripts for markup-only components", () => {
    const analysis = analyzeSvelte("<p>{1 + 2}</p>", "Inline.svelte");

    expect(analysis.instance).toBeNull();
    expect(analysis.module).toBeNull();
    expect(analysis.expressions).toHaveLength(1);
  });
});
