import dedent from "dedent";
import { SourceMapConsumer } from "source-map";
import { describe, expect, it } from "vite-plus/test";

import { createExtractionUnits } from "./extract-units.ts";

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

describe("createExtractionUnits", () => {
  it("produces macro-transformed extraction code for svelte files", () => {
    const units = createExtractionUnits(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";
          const direct = $t\`Direct\`;
        </script>

        <p>{$t\`Template\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(units.length).toBeGreaterThan(0);
    expect(units.some((unit) => unit.code.includes("/*i18n*/"))).toBe(true);
  });

  it("maps extracted script, template, and component ranges back to the original svelte file", async () => {
    const source = dedent`
        <script lang="ts">
          import { t, Trans } from "lingui-for-svelte/macro";

          const scriptLabel = t.eager\`Script origin message\`;
        </script>

        <p>{$t\`Template origin message\`}</p>
        <Trans>Component origin message</Trans>
      `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });
    const detections: Detection[] = [
      {
        name: "script extraction",
        original: "t.eager`Script origin message`",
        generated:
          /const __lingui_for_svelte_expr_0 = _i18n\._\([\s\S]*?message: "Script origin message"[\s\S]*?\);/,
      },
      {
        name: "template extraction",
        original: /\$t`Template origin message`/,
        generated:
          /const __lingui_for_svelte_expr_0 = _i18n\._\([\s\S]*?message: "Template origin message"[\s\S]*?\);/,
      },
      {
        name: "component extraction",
        original: "<Trans>Component origin message</Trans>",
        generated:
          /const __lingui_for_svelte_component_0 = <_Trans\b[\s\S]*?message: "Component origin message"[\s\S]*?>;/,
      },
    ];

    for (const detection of detections) {
      const matches = units.filter((unit) => {
        try {
          findUniqueRange(unit.code, detection.generated);
          return true;
        } catch {
          return false;
        }
      });

      expect(
        matches,
        `${detection.name}: expected a single extraction unit`,
      ).toHaveLength(1);

      const [unit] = matches;
      const mappedSource = unit?.map?.sources?.[0] ?? unit?.map?.file;

      expect(mappedSource).toBe("/virtual/App.svelte");
      expect(unit?.map?.sources).toEqual(["/virtual/App.svelte"]);
      expect(unit?.map?.sourcesContent).toEqual([source]);

      await SourceMapConsumer.with(unit?.map as never, null, (consumer) => {
        assertRangeMapping(consumer, unit?.code ?? "", source, detection);
      });
    }
  });
});
