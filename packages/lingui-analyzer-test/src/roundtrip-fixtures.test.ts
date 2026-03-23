import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./wasm-lingui.ts";

type Detection = {
  name: string;
  original: string | RegExp;
  generated: string | RegExp;
};

type ExtractDetection = {
  name: string;
  original: string | RegExp;
  extracted: string | RegExp;
};

describe("lingui-analyzer roundtrip source map discipline", () => {
  test.fails("maps transformed Svelte script expression ranges back to the original source", () => {
    const filename = "/virtual/Fixture.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "@lingui/react/macro";
        const label = translate\`Fixture script\`;
        const name = "Ada";
      </script>

      <p class="keep">{$translate\`Fixture markup \${name}\`}</p>
      <p>{label}</p>
    `;
    const detection: Detection = {
      name: "script transform",
      original: "const label = translate`Fixture script`;",
      generated:
        /const label = _i18n\._\([\s\S]*?message: "Fixture script"[\s\S]*?\)/,
    };

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    assertRangeMapping(consumer, reinserted.code, source, detection, filename);
  });

  test.fails("maps transformed Svelte markup expression ranges back to the original source", () => {
    const filename = "/virtual/Fixture.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "@lingui/react/macro";
        const label = translate\`Fixture script\`;
        const name = "Ada";
      </script>

      <p class="keep">{$translate\`Fixture markup \${name}\`}</p>
      <p>{label}</p>
    `;
    const detections: Detection[] = [
      {
        name: "markup transform",
        original: "$translate`Fixture markup ${name}`",
        generated:
          /<p class="keep">\{_i18n\._\([\s\S]*?message: "Fixture markup \{name\}"[\s\S]*?\)/,
      },
      {
        name: "kept wrapper",
        original: '<p class="keep">{',
        generated: '<p class="keep">{',
      },
    ];

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    detections.forEach((detection) => {
      assertRangeMapping(
        consumer,
        reinserted.code,
        source,
        detection,
        filename,
      );
    });
  });

  test("maps extracted Svelte messages back to the original source", async () => {
    const filename = "/virtual/Fixture.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate\`Fixture script\`;
        const name = "Ada";
      </script>

      <p>{$translate\`Fixture markup \${name}\`}</p>
      <Translation>Fixture component {name}</Translation>
      <p>{label}</p>
    `;
    const detections: ExtractDetection[] = [
      {
        name: "script extraction",
        original: "translate`Fixture script`",
        extracted: "Fixture script",
      },
      {
        name: "markup extraction",
        original: "translate`Fixture markup ${name}`",
        extracted: "Fixture markup {name}",
      },
    ];

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    detections.forEach((detection) => {
      assertExtractionOrigin(messages, source, detection, filename);
    });
  });

  test.fails("maps extracted Svelte component messages back to the original source", async () => {
    const filename = "/virtual/Fixture.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "@lingui/react/macro";
        const label = translate\`Fixture script\`;
        const name = "Ada";
      </script>

      <p>{$translate\`Fixture markup \${name}\`}</p>
      <Translation>Fixture component {name}</Translation>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    assertExtractionOrigin(
      messages,
      source,
      {
        name: "component extraction",
        original: "Fixture component ",
        extracted: "Fixture component {name}",
      },
      filename,
    );
  });

  test("maps transformed Svelte component replacement boundaries back to the original source", () => {
    const filename = "/virtual/ComponentBoundary.svelte";
    const source = dedent`
        <script lang="ts">
          import { Trans as Translation } from "@lingui/react/macro";
          const name = "Ada";
        </script>

        <Translation>Boundary component {name}</Translation>
      `;
    const detection: Detection = {
      name: "component transform boundary",
      original: "<Translation>Boundary component {name}</Translation>",
      generated: /<_Trans\b[\s\S]*?\/>/,
    };

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/ComponentBoundary.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    assertRangeMapping(consumer, reinserted.code, source, detection, filename);
  });

  test.fails("maps transformed Astro frontmatter expression ranges back to the original source", () => {
    const filename = "/virtual/Fixture.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Fixture frontmatter\`;
      ---

      <p class="keep">{translate\`Fixture markup\`}</p>
      <p>{label}</p>
    `;
    const detection: Detection = {
      name: "frontmatter transform",
      original: "const label = translate`Fixture frontmatter`;",
      generated:
        /const label = _i18n\._\([\s\S]*?message: "Fixture frontmatter"[\s\S]*?\)/,
    };

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    assertRangeMapping(consumer, reinserted.code, source, detection, filename);
  });

  test.fails("maps transformed Astro markup expression ranges back to the original source", () => {
    const filename = "/virtual/Fixture.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Fixture frontmatter\`;
      ---

      <p class="keep">{translate\`Fixture markup\`}</p>
      <p>{label}</p>
    `;
    const detections: Detection[] = [
      {
        name: "markup transform",
        original: "translate`Fixture markup`",
        generated:
          /<p class="keep">\{_i18n\._\([\s\S]*?message: "Fixture markup"[\s\S]*?\)/,
      },
      {
        name: "kept wrapper",
        original: '<p class="keep">{',
        generated: '<p class="keep">{',
      },
    ];

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    detections.forEach((detection) => {
      assertRangeMapping(
        consumer,
        reinserted.code,
        source,
        detection,
        filename,
      );
    });
  });

  test("maps extracted Astro messages back to the original source", async () => {
    const filename = "/virtual/Fixture.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "@lingui/react/macro";
      const label = translate\`Fixture frontmatter\`;
      const name = "Ada";
      ---

      <p>{translate\`Fixture markup\`}</p>
      <Translation>Fixture component {name}</Translation>
      <p>{label}</p>
    `;
    const detections: ExtractDetection[] = [
      {
        name: "frontmatter extraction",
        original: "translate`Fixture frontmatter`",
        extracted: "Fixture frontmatter",
      },
      {
        name: "markup extraction",
        original: "translate`Fixture markup`",
        extracted: "Fixture markup",
      },
    ];

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    detections.forEach((detection) => {
      assertExtractionOrigin(messages, source, detection, filename);
    });
  });

  test.fails("maps extracted Astro component messages back to the original source", async () => {
    const filename = "/virtual/Fixture.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "@lingui/react/macro";
      const label = translate\`Fixture frontmatter\`;
      const name = "Ada";
      ---

      <p>{translate\`Fixture markup\`}</p>
      <Translation>Fixture component {name}</Translation>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Fixture.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    assertExtractionOrigin(
      messages,
      source,
      {
        name: "component extraction",
        original: "Fixture component ",
        extracted: "Fixture component {name}",
      },
      filename,
    );
  });

  test("maps transformed Astro component replacement boundaries back to the original source", () => {
    const filename = "/virtual/ComponentBoundary.astro";
    const source = dedent`
        ---
        import { Trans as Translation } from "@lingui/react/macro";
        const name = "Ada";
        ---

        <Translation>Boundary component {name}</Translation>
      `;
    const detection: Detection = {
      name: "component transform boundary",
      original: "<Translation>Boundary component {name}</Translation>",
      generated: /<_Trans\b[\s\S]*?\/>/,
    };

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/ComponentBoundary.synthetic.tsx",
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed.declarations,
      { sourceName: filename },
    );
    const consumer = new TraceMap(reinserted.source_map_json ?? "");

    assertRangeMapping(consumer, reinserted.code, source, detection, filename);
  });
});

function assertExtractionOrigin(
  messages: ExtractedMessage[],
  source: string,
  detection: ExtractDetection,
  filename: string,
): void {
  const original = findUniqueRange(source, detection.original);
  const originalStart = offsetToLocation(source, original.start);
  const message = findUniqueMessage(messages, detection.extracted);

  expect(
    message.origin,
    `${detection.name}: missing extraction origin`,
  ).toEqual([filename, originalStart.line, originalStart.column]);
}

function findUniqueMessage(
  messages: ExtractedMessage[],
  needle: string | RegExp,
) {
  const matched = messages.filter((message) => {
    const value = message.message ?? "";
    if (typeof needle === "string") {
      return value === needle;
    }
    return needle.test(value);
  });

  if (matched.length === 0) {
    throw new Error(`Extracted message not found: ${needle}`);
  }
  if (matched.length > 1) {
    throw new Error(`Extracted message matched multiple times: ${needle}`);
  }
  return matched[0];
}

function assertRangeMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
): void {
  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);
  const generatedStart = offsetToLocation(generatedSource, generated.start);
  const generatedEnd = offsetToLocation(generatedSource, generated.end);
  const originalStart = offsetToLocation(originalSource, original.start);
  const originalEnd = offsetToLocation(originalSource, original.end);
  const mappedStart = originalPositionFor(consumer, {
    line: generatedStart.line,
    column: generatedStart.column,
  });
  const mappedEnd = originalPositionFor(consumer, {
    line: generatedEnd.line,
    column: generatedEnd.column,
  });

  expect(
    mappedStart.source,
    `${detection.name}: missing source for start`,
  ).toBe(filename);
  expect(mappedStart.line, `${detection.name}: start line`).toBe(
    originalStart.line,
  );
  expect(mappedStart.column, `${detection.name}: start column`).toBe(
    originalStart.column,
  );
  expect(mappedEnd.source, `${detection.name}: missing source for end`).toBe(
    filename,
  );
  expect(mappedEnd.line, `${detection.name}: end line`).toBe(originalEnd.line);
  expect(mappedEnd.column, `${detection.name}: end column`).toBe(
    originalEnd.column,
  );
}

function findUniqueRange(
  source: string,
  needle: string | RegExp,
): {
  start: number;
  end: number;
} {
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
  if (match.index == null) {
    throw new Error(`Pattern did not provide a stable range: ${needle}`);
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
  };
}

function offsetToLocation(
  source: string,
  offset: number,
): {
  line: number;
  column: number;
} {
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
