import dedent from "dedent";
import { SourceMapConsumer } from "source-map";
import { describe, expect, it, test } from "vite-plus/test";

import { transformSvelte } from "./transform-svelte.ts";

type SourceLocation = { line: number; column: number };
type SourceRange = { start: number; end: number };
type Detection = {
  name: string;
  original: string | RegExp;
  generated: string | RegExp;
};

function findUniqueRange(source: string, needle: string | RegExp): SourceRange {
  if (typeof needle === "string") {
    const start = source.indexOf(needle);
    if (start < 0) {
      throw new Error(`Needle not found: ${needle}`);
    }

    const second = source.indexOf(needle, start + 1);
    if (second >= 0) {
      throw new Error(`Needle matched multiple times: ${needle}`);
    }

    return { start, end: start + needle.length };
  }

  const flags = needle.flags.includes("g") ? needle.flags : `${needle.flags}g`;
  const expression = new RegExp(needle.source, flags);
  const matches = [...source.matchAll(expression)];

  if (matches.length === 0) {
    throw new Error(`Pattern not found: ${needle}`);
  }
  if (matches.length > 1) {
    throw new Error(`Pattern matched multiple times: ${needle}`);
  }

  const match = matches[0];
  const fullMatch = match?.[0];
  const index = match?.index;

  if (fullMatch == null || index == null) {
    throw new Error(`Pattern did not provide a stable range: ${needle}`);
  }

  return { start: index, end: index + fullMatch.length };
}

function offsetToLocation(source: string, offset: number): SourceLocation {
  let line = 1;
  let column = 0;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function assertRangeMapping(
  consumer: SourceMapConsumer,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
): void {
  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);
  const generatedStart = offsetToLocation(generatedSource, generated.start);
  const generatedEnd = offsetToLocation(generatedSource, generated.end - 1);
  const originalStart = offsetToLocation(originalSource, original.start);
  const originalEnd = offsetToLocation(originalSource, original.end - 1);
  const mappedStart = consumer.originalPositionFor({
    line: generatedStart.line,
    column: generatedStart.column,
  });
  const mappedEnd = consumer.originalPositionFor({
    line: generatedEnd.line,
    column: generatedEnd.column,
  });

  expect(
    String(mappedStart.source),
    `${detection.name}: missing source for start position`,
  ).toMatch(/App\.svelte$/);
  expect(mappedStart.line, `${detection.name}: start line`).toBe(
    originalStart.line,
  );
  expect(mappedStart.column, `${detection.name}: start column`).toBe(
    originalStart.column,
  );

  expect(
    String(mappedEnd.source),
    `${detection.name}: missing source for end position`,
  ).toMatch(/App\.svelte$/);
  expect(mappedEnd.line, `${detection.name}: end line`).toBe(originalEnd.line);
  expect(mappedEnd.column, `${detection.name}: end column`).toBe(
    originalEnd.column,
  );
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

    const generatedScript = offsetToLocation(
      result.code,
      findUniqueRange(result.code, 'const keepAfter = "after";').start,
    );
    const originalScript = offsetToLocation(
      source,
      findUniqueRange(source, 'const keepAfter = "after";').start,
    );
    const generatedMarkup = offsetToLocation(
      result.code,
      findUniqueRange(result.code, "<p>{keepAfter}</p>").start,
    );
    const originalMarkup = offsetToLocation(
      source,
      findUniqueRange(source, "<p>{keepAfter}</p>").start,
    );
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

  const rangeSource = dedent`
    <script lang="ts">
      import { t, Trans } from "lingui-for-svelte/macro";

      const keepBefore = "before";
      const label = t.eager\`Mapped script message\`;
      const keepAfter = "after";
    </script>

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p><strong>{$t\`Mapped template message\`}</strong></p>
      <a href="/docs"><Trans>Mapped component message</Trans></a>
      <p>{keepAfter}</p>
    </section>
  `;

  const detections: Detection[] = [
    {
      name: "script transform",
      original: "t.eager`Mapped script message`",
      generated:
        /__l4s_getI18n\(\)\._\([^)]*message: "Mapped script message"[^)]*\)/,
    },
    {
      name: "template transform",
      original: /\$t`Mapped template message`/,
      generated:
        /\$?__l4s_translate\([^)]*message: "Mapped template message"[^)]*\)/,
    },
    {
      name: "component transform",
      original: "<Trans>Mapped component message</Trans>",
      generated: /<L4sRuntimeTrans\b[\s\S]*?\/>/,
    },
    {
      name: "label binding is preserved",
      original: "const label = ",
      generated: "const label = ",
    },
    {
      name: "keepAfter binding is preserved",
      original: 'const keepAfter = "after";',
      generated: 'const keepAfter = "after";',
    },
    {
      name: "template opening wrapper is preserved",
      original: "<p><strong>{",
      generated: "<p><strong>{",
    },
    {
      name: "template closing wrapper is preserved",
      original: "}</strong></p>",
      generated: "}</strong></p>",
    },
    {
      name: "component opening wrapper is preserved",
      original: '<a href="/docs">',
      generated: '<a href="/docs">',
    },
    {
      name: "component closing wrapper is preserved",
      original: "</a>",
      generated: "</a>",
    },
  ];

  test("maps transformed and preserved compile ranges back to the original svelte file", async () => {
    const result = transformSvelte(rangeSource, {
      filename: "/virtual/App.svelte",
    });

    expect(result.map.file).toBe("App.svelte");
    expect(result.map.sources).toEqual(["App.svelte"]);
    expect(result.map.sourcesContent).toEqual([rangeSource]);

    await SourceMapConsumer.with(result.map as never, null, (consumer) => {
      detections.forEach((detection) => {
        assertRangeMapping(consumer, result.code, rangeSource, detection);
      });
    });
  });
});
