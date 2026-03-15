import dedent from "dedent";
import { describe, expect, it } from "vitest";

import type {
  MacroComponent,
  MarkupExpression,
  ScriptBlock,
} from "../shared/types.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";

describe("buildCombinedProgram", () => {
  it("combines script, expressions, and component macros into one synthetic module", () => {
    const source = dedent`
      <script lang="ts">
        import { t, Trans } from "lingui-for-svelte/macro";

        const name = "Ada";
      </script>

      <p>{$t\`Hello \${name}\`}</p>
      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const expressionSource = "$t`Hello ${name}`";
    const componentSource = '<Trans id="demo.docs">Read the docs.</Trans>';

    const scriptStart = source.indexOf('<script lang="ts">');
    const scriptOpenEnd = scriptStart + '<script lang="ts">'.length;
    const scriptEnd = source.indexOf("</script>") + "</script>".length;
    const scriptContentStart = scriptOpenEnd + 1;
    const scriptContentEnd = source.indexOf("</script>");
    const scriptContent = source.slice(scriptContentStart, scriptContentEnd);
    const expressionStart = source.indexOf(expressionSource);
    const componentStart = source.indexOf(componentSource);

    const script: ScriptBlock = {
      kind: "instance",
      start: scriptStart,
      end: scriptEnd,
      contentStart: scriptContentStart,
      contentEnd: scriptContentEnd,
      content: scriptContent,
      lang: "ts",
      attributes: [],
    };

    const expressions: MarkupExpression[] = [
      {
        index: 0,
        start: expressionStart,
        end: expressionStart + expressionSource.length,
        source: expressionSource,
      },
    ];

    const components: MacroComponent[] = [
      {
        index: 0,
        name: "Trans",
        start: componentStart,
        end: componentStart + componentSource.length,
        source: componentSource,
      },
    ];

    const result = buildCombinedProgram(
      source,
      "/virtual/App.svelte",
      script,
      expressions,
      components,
    );

    expect(result.code).toMatchInlineSnapshot(`
      "  import { t, Trans } from "lingui-for-svelte/macro";

        const name = "Ada";
      const __lingui_for_svelte_expr_0 = (
      $t\`Hello \${name}\`
      );
      const __lingui_for_svelte_component_0 = (
      <Trans id="demo.docs">Read the docs.</Trans>
      );
      "
    `);
    expect(result.map.file).toBe("/virtual/App.svelte");
    expect(result.map.sources).toEqual(["/virtual/App.svelte"]);
    expect(result.map.sourcesContent).toEqual([source]);
  });
});
