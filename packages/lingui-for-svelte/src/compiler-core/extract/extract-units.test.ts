import dedent from "dedent";
import { TraceMap } from "@jridgewell/trace-mapping";
import { describe, expect, test } from "vite-plus/test";

import {
  assertRangeMapping,
  findUniqueRange,
  type Detection,
} from "lingui-for-shared/test-helpers";

import { createExtractionUnits } from "./extract-units.ts";

describe("createExtractionUnits", () => {
  test("produces macro-transformed extraction code for svelte files", () => {
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

      if (unit?.map) {
        const consumer = new TraceMap(unit.map);
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
  });
});
