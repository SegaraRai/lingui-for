import dedent from "dedent";
import { SourceMapConsumer } from "source-map";
import { describe, expect, it } from "vite-plus/test";

import { transformSvelte } from "./transform-svelte.ts";

type SourceLocation = {
  line: number;
  column: number;
};

function findSourceLocation(source: string, needle: string): SourceLocation {
  const start = source.indexOf(needle);

  if (start < 0) {
    throw new Error(`Needle not found in source: ${needle}`);
  }

  let line = 1;
  let column = 0;

  for (let index = 0; index < start; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function findGeneratedLocation(code: string, needle: string): SourceLocation {
  return findSourceLocation(code, needle);
}

describe("transformSvelte source map discipline", () => {
  const source = dedent`
    <script lang="ts">
      import { t, Trans } from "lingui-for-svelte/macro";

      const keepBefore = "before";
      // KEEP_SCRIPT_COMMENT
      const eagerLabel = t.eager\`Mapped script message\`;
      const keepAfter = "after";
    </script>

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p>{$t\`Mapped template message\`}</p>
      <Trans>Mapped component message</Trans>
      <p>{keepAfter}</p>
    </section>
  `;

  it("preserves untouched script and markup while keeping file-level source map metadata", async () => {
    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain('const keepBefore = "before";');
    expect(result.code).toContain("// KEEP_SCRIPT_COMMENT");
    expect(result.code).toContain('const keepAfter = "after";');
    expect(result.code).toContain('<section data-keep="yes">');
    expect(result.code).toContain("<p>{keepBefore}</p>");
    expect(result.code).toContain("<p>{keepAfter}</p>");

    await SourceMapConsumer.with(result.map as never, null, () => {
      expect(result.map.file).toBe("App.svelte");
      expect(result.map.sources).toEqual(["App.svelte"]);
      expect(result.map.sourcesContent).toEqual([source]);
    });
  });

  it("maps unchanged script lines back to their original locations instead of the rewritten script prelude", async () => {
    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    const generatedScript = findGeneratedLocation(
      result.code,
      'const keepAfter = "after";',
    );
    const originalScript = findSourceLocation(
      source,
      'const keepAfter = "after";',
    );
    const generatedMarkup = findGeneratedLocation(
      result.code,
      "<p>{keepAfter}</p>",
    );
    const originalMarkup = findSourceLocation(source, "<p>{keepAfter}</p>");
    const mappedSource = result.map.sources[0] ?? result.map.file;

    await SourceMapConsumer.with(result.map as never, null, (consumer) => {
      expect(
        consumer.originalPositionFor({
          line: generatedScript.line,
          column: generatedScript.column,
        }),
      ).toMatchObject({
        source: mappedSource,
        line: originalScript.line,
        column: originalScript.column,
      });

      expect(
        consumer.originalPositionFor({
          line: generatedMarkup.line,
          column: generatedMarkup.column,
        }),
      ).toMatchObject({
        source: mappedSource,
        line: originalMarkup.line,
        column: originalMarkup.column,
      });
    });
  });
});
