import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { analyzeSvelte } from "./svelte-analysis.ts";

describe("analyzeSvelte", () => {
  it("extracts only imported macro expressions and components", () => {
    const source = dedent`
      <script module lang="ts">
        export const prerender = true;
      </script>

      <script lang="ts">
        import { Select as Choice, t as translate } from "lingui-for-svelte/macro";
        const count = 1;
      </script>

      <div title={count}>{count + 1}</div>
      <Trans>Hello {count}</Trans>
      <Choice value={"female"} _female="she" other="they" />
      <SelectOrdinal value={count} one="#st" other="#th" />
      <p>{translate\`Count: \${count}\`}</p>
    `;

    const analysis = analyzeSvelte(source, "Component.svelte");

    expect(analysis.module?.lang).toBe("ts");
    expect(analysis.module?.content).toContain("prerender");
    expect(analysis.instance?.lang).toBe("ts");
    expect(analysis.instance?.content).toContain("Select as Choice");
    expect(analysis.expressions.map((expression) => expression.source)).toEqual(
      ["translate`Count: ${count}`"],
    );
    expect(analysis.components.map((component) => component.name)).toEqual([
      "Choice",
    ]);
  });

  it("returns no scripts or macro expressions for markup-only components", () => {
    const analysis = analyzeSvelte("<p>{1 + 2}</p>", "Inline.svelte");

    expect(analysis.instance).toBeNull();
    expect(analysis.module).toBeNull();
    expect(analysis.expressions).toHaveLength(0);
    expect(analysis.components).toHaveLength(0);
  });

  it("ignores same-name components and expressions when they are not macro imports", () => {
    const source = dedent`
      <script lang="ts">
        import Select from "./Select.svelte";

        const t = (value: string) => value;
      </script>

      <Select value={"female"} other="they" />
      <p>{t("Count")}</p>
    `;

    const analysis = analyzeSvelte(source, "AliasSafety.svelte");

    expect(analysis.expressions).toHaveLength(0);
    expect(analysis.components).toHaveLength(0);
  });

  it("extracts block, attribute, and special-tag expressions explicitly by node type", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
        const condition = true;
        const count = 1;
        const loader = () => Promise.resolve("ok");
        const renderSnippet = () => null;
      </script>

      <div class:active={t\`active\` === "active"} style:color={t\`red\`}></div>
      {#if t\`visible\`}
        <p>{t\`shown\`}</p>
      {/if}
      {#each items as item, index (t\`key-\${index}\`)}
        <span>{item}</span>
      {/each}
      {#await loader() then value}
        <p>{value}</p>
      {/await}
      {#key t\`keyed\`}
        <p>content</p>
      {/key}
      {@html t\`<strong>html</strong>\`}
      {@render renderSnippet(t\`snippet\`)}
    `;

    const analysis = analyzeSvelte(source, "ExplicitExpressions.svelte");

    expect(analysis.expressions.map((expression) => expression.source)).toEqual(
      [
        't`active` === "active"',
        "t`red`",
        "t`visible`",
        "t`shown`",
        "t`key-${index}`",
        "t`keyed`",
        "t`<strong>html</strong>`",
        "renderSnippet(t`snippet`)",
      ],
    );
  });
});
