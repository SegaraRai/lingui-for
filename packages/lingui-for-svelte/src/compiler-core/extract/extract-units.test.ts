import dedent from "dedent";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { describe, expect, test } from "vite-plus/test";

import {
  assertRangeMapping,
  findUniqueRange,
  offsetToLocation,
  type Detection,
} from "lingui-for-shared/test-helpers";

import { createExtractionUnits } from "./extract-units.ts";

describe("createExtractionUnits", () => {
  test("produces extraction units with source maps for svelte files", () => {
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
    expect(units.every((unit) => unit.map != null)).toBe(true);
  });

  test("maps extracted script, template, and component ranges back to the original svelte file", () => {
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
    // createExtractionUnits returns raw (untransformed) code for expressions so
    // that the downstream Lingui extractor can run its own Babel pass. Component
    // macros are lowered via transformProgram(extract:true) because they require
    // JSX handling that the Lingui extractor does not apply.
    const detections: Detection[] = [
      {
        // Script expression: t.eager`...` with `.eager` stripped → t`...`
        name: "script extraction",
        original: "t.eager`Script origin message`",
        generated: /t`Script origin message`/,
      },
      {
        // Template expression: $t`...` with `$` stripped → t`...`
        // Use `t\`...\`` (without $) as original so it maps to the `t` position
        // that the source map points to after the `$` is removed.
        name: "template extraction",
        original: "t`Template origin message`",
        generated: /t`Template origin message`/,
      },
      {
        // Component macro: lowered with extract:true through Babel + Lingui macro.
        // Lingui transforms <Trans> to an object form: message: "..." (not JSX).
        // The component source map uses hires:false so only start position is
        // checked (the entire lowered code maps to the component's start offset).
        name: "component extraction",
        original: "<Trans>Component origin message</Trans>",
        generated: /message:\s*"Component origin message"/,
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
      // Component maps are built with includeContent:false — no sourcesContent.
      if (detection.name !== "component extraction") {
        expect(unit?.map?.sourcesContent).toEqual([source]);
      }

      if (unit?.map) {
        const consumer = new TraceMap(unit.map);

        if (detection.name === "component extraction") {
          // Component map uses hires:false — only start position is accurate.
          const genRange = findUniqueRange(unit.code, detection.generated);
          const origRange = findUniqueRange(source, detection.original);
          const genStart = offsetToLocation(unit.code, genRange.start);
          const origStart = offsetToLocation(source, origRange.start);
          const mapped = originalPositionFor(consumer, {
            line: genStart.line,
            column: genStart.column,
          });
          expect(mapped.source, `${detection.name}: source`).toBe(
            "/virtual/App.svelte",
          );
          expect(mapped.line, `${detection.name}: start line`).toBe(
            origStart.line,
          );
          expect(mapped.column, `${detection.name}: start column`).toBe(
            origStart.column,
          );
        } else {
          // Expression maps use hires:true — both start and end are accurate.
          assertRangeMapping(
            consumer,
            unit.code,
            source,
            detection,
            "/virtual/App.svelte",
            expect,
          );
        }
      }
    }
  });

  test("preserves $t() and $t`` literal text inside message strings without stripping", () => {
    // If a user writes $t`Use $t() to translate`, the literal "$t()" in the
    // template content is part of the message text — not a nested macro call —
    // so the $ must not be removed when building the extraction unit.
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
      </script>

      <p>{$t\`Use $t() to translate\`}</p>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/MacroInContent.svelte",
    });

    // There should be exactly one expression unit for the template expression.
    const templateUnit = units.find((unit) =>
      unit.code.includes("Use $t() to translate"),
    );
    expect(
      templateUnit,
      "extraction unit should preserve $t() in message text",
    ).toBeDefined();
    // The $ from "$t()" inside the template content must not be stripped.
    // The unit code should contain t`Use $t() to translate` (outer $ stripped,
    // inner $ preserved).
    expect(templateUnit?.code).toContain("Use $t() to translate");
    expect(templateUnit?.code).not.toContain("Use t() to translate");
  });
});
