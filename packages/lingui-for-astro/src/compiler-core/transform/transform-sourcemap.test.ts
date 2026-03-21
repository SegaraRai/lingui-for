import dedent from "dedent";
import { SourceMapConsumer } from "source-map";
import { describe, expect, it } from "vite-plus/test";

import { transformAstro } from "./transform-astro.ts";

type SourceLocation = {
  line: number;
  column: number;
};

type SourceRange = {
  start: number;
  end: number;
};

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

    return {
      start,
      end: start + needle.length,
    };
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

  return {
    start: index,
    end: index + fullMatch.length,
  };
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
    mappedStart.source,
    `${detection.name}: missing source for start position`,
  ).toMatch(/Page\.astro$/);
  expect(mappedStart.line, `${detection.name}: start line`).toBe(
    originalStart.line,
  );
  expect(mappedStart.column, `${detection.name}: start column`).toBe(
    originalStart.column,
  );

  expect(
    mappedEnd.source,
    `${detection.name}: missing source for end position`,
  ).toMatch(/Page\.astro$/);
  expect(mappedEnd.line, `${detection.name}: end line`).toBe(originalEnd.line);
  expect(mappedEnd.column, `${detection.name}: end column`).toBe(
    originalEnd.column,
  );
}

describe("transformAstro source map discipline", () => {
  const source = dedent`
    ---
    import { t, Trans } from "lingui-for-astro/macro";

    const keepBefore = "before";
    const label = t\`Mapped script message\`;
    const keepAfter = "after";
    ---

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p><strong>{t\`Mapped template message\`}</strong></p>
      <a href="/docs"><Trans>Mapped component message</Trans></a>
      <p>{keepAfter}</p>
    </section>
  `;

  const detections: Detection[] = [
    {
      name: "frontmatter transform",
      original: "t`Mapped script message`",
      generated: /__l4a_i18n\._\([^)]+message: "Mapped script message"[^)]+\)/,
    },
    {
      name: "template transform",
      original: /t`Mapped template message`/,
      generated:
        /__l4a_i18n\._\([^)]+message: "Mapped template message"[^)]+\)/,
    },
    {
      name: "component transform",
      original: "<Trans>Mapped component message</Trans>",
      generated: /<L4aRuntimeTrans\b[\s\S]*?\/>/,
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

  it("keeps file-level metadata and maps transformed and preserved ranges back to the original astro file", async () => {
    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const map = result.map!;

    expect(map.file).toBe("Page.astro");
    expect(map.sources).toEqual(["Page.astro"]);
    expect(map.sourcesContent).toEqual([source]);

    await SourceMapConsumer.with(map as never, null, (consumer) => {
      detections.forEach((detection) => {
        assertRangeMapping(consumer, result.code, source, detection);
      });
    });
  });
});
