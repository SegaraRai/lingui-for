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
  generated?: string | RegExp;
  extracted?: string | RegExp;
  mapping?: "range" | "chars";
};

type DetectionFixture = {
  name: string;
  framework: "astro" | "svelte";
  filename: string;
  source: string;
  detections: readonly Detection[];
};

describe("lingui-analyzer roundtrip source map discipline", () => {
  const svelteExpressionFilename = "/virtual/Fixture.svelte";
  const svelteExpressionSource = dedent`
    <script lang="ts">
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "@lingui/react/macro";
      const reactiveLabel = $translate\`Fixture reactive script\`;
      const eagerLabel = translate.eager\`Fixture eager script\`;
      const name = "Ada";
    </script>

    <p class="keep">{$translate\`Fixture markup \${name}\`}</p>
    <section class="outer"><p class="nested">{$translate\`Fixture nested markup \${name}\`}</p></section>
    <p>{reactiveLabel}</p>
    <p>{eagerLabel}</p>
  `;
  const svelteExpressionDetections: Detection[] = [
    {
      name: "eager script prefix",
      original: "const eagerLabel = ",
      generated: "const eagerLabel = ",
    },
    {
      name: "reactive script transform",
      original: "translate`Fixture reactive script`",
      generated:
        /_i18n\._\([\s\S]*?message: "Fixture reactive script"[\s\S]*?\)/,
      extracted: "Fixture reactive script",
    },
    {
      name: "eager script transform",
      original: /translate\.eager`Fixture eager script`/,
      generated:
        /(?<=const eagerLabel = )_i18n\._\([\s\S]*?message: "Fixture eager script"[\s\S]*?\)/,
      extracted: "Fixture eager script",
    },
    {
      name: "markup transform",
      original: "translate`Fixture markup ${name}`",
      generated:
        /(?<=<p class="keep">\{)_i18n\._\([\s\S]*?message: "Fixture markup \{name\}"[\s\S]*?\)/,
      extracted: "Fixture markup {name}",
    },
    {
      name: "nested markup transform",
      original: "translate`Fixture nested markup ${name}`",
      generated:
        /(?<=<section class="outer"><p class="nested">\{)_i18n\._\([\s\S]*?message: "Fixture nested markup \{name\}"[\s\S]*?\)/,
      extracted: "Fixture nested markup {name}",
    },
    {
      name: "kept wrapper",
      original: '<p class="keep">',
      generated: '<p class="keep">',
    },
    {
      name: "kept wrapper close",
      original: /<\/p>(?=\n<section class="outer">)/,
      generated: /<\/p>(?=\n<section class="outer">)/,
    },
    {
      name: "reactive script prefix",
      original: "const reactiveLabel = ",
      generated: "const reactiveLabel = ",
      mapping: "chars",
    },
    {
      name: "kept wrapper with brace",
      original: '<p class="keep">{',
      generated: '<p class="keep">{',
    },
    {
      name: "kept wrapper close with brace",
      original: /\}<\/p>(?=\n<section class="outer">)/,
      generated: /\}<\/p>(?=\n<section class="outer">)/,
      mapping: "chars",
    },
    {
      name: "nested wrapper open",
      original: '<section class="outer"><p class="nested">{',
      generated: '<section class="outer"><p class="nested">{',
      mapping: "chars",
    },
    {
      name: "nested wrapper close",
      original: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
      generated: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
      mapping: "chars",
    },
  ];

  const svelteComponentFilename = "/virtual/ComponentBoundary.svelte";
  const svelteComponentSource = dedent`
    <script lang="ts">
      import { Trans as Translation } from "@lingui/react/macro";
      const name = "Ada";
    </script>

    <Translation>Boundary component {name}</Translation>
  `;
  const svelteComponentDetection: Detection = {
    name: "component boundary",
    original: "<Translation>Boundary component {name}</Translation>",
    generated: /<_Trans\b[\s\S]*?\/>/,
  };
  const svelteComponentExtractDetection: Detection = {
    name: "component extraction",
    original: "Boundary component ",
    extracted: "Boundary component {name}",
  };

  const svelteWhitespaceComponentFilename =
    "/virtual/ComponentWhitespace.svelte";
  const svelteWhitespaceComponentSource = dedent`
    <script lang="ts">
      import { Trans as Translation } from "@lingui/react/macro";
      const name = "Ada";
    </script>

    <Translation>
      Boundary component {name}
    </Translation>
  `;
  const svelteWhitespaceComponentExtractDetection: Detection = {
    name: "component extraction with surrounding whitespace",
    original: "Boundary component ",
    extracted: "Boundary component {name}",
  };

  const svelteNestedComponentFilename = "/virtual/ComponentNested.svelte";
  const svelteNestedComponentSource = dedent`
    <script lang="ts">
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "@lingui/react/macro";
      const name = "Ada";
    </script>

    <Translation>
      Nested <strong>{name}</strong> component
    </Translation>

    <p>{  $translate\`Whitespace markup \${name}\`  }</p>
    <button title={$translate\`Button title \${name}\`}>Trigger</button>
  `;
  const svelteNestedComponentDetections: Detection[] = [
    {
      name: "nested component boundary",
      original:
        /<Translation>\n  Nested <strong>\{name\}<\/strong> component\n<\/Translation>/,
      generated: /<_Trans\b[\s\S]*?\/>/,
    },
    {
      name: "nested component extraction",
      original: "Nested ",
      extracted: "Nested <0>{name}</0> component",
    },
    {
      name: "whitespace markup transform",
      original: "translate`Whitespace markup ${name}`",
      generated:
        /(?<=<p>\{  )_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
      extracted: "Whitespace markup {name}",
    },
    {
      name: "whitespace wrapper open",
      original: "<p>{  ",
      generated: "<p>{  ",
      mapping: "chars",
    },
    {
      name: "whitespace wrapper close",
      original: /  \}<\/p>(?=\n<button title=\{)/,
      generated: /  \}<\/p>(?=\n<button title=\{)/,
      mapping: "chars",
    },
    {
      name: "attribute macro transform",
      original: "translate`Button title ${name}`",
      generated:
        /(?<=<button title=\{)_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
      extracted: "Button title {name}",
    },
    {
      name: "attribute wrapper open",
      original: "<button title={",
      generated: "<button title={",
      mapping: "chars",
    },
    {
      name: "attribute wrapper close",
      original: /}>Trigger<\/button>/,
      generated: /}>Trigger<\/button>/,
      mapping: "chars",
    },
  ];

  const astroExpressionFilename = "/virtual/Fixture.astro";
  const astroExpressionSource = dedent`
    ---
    import { t as translate } from "@lingui/core/macro";
    import { Trans as Translation } from "@lingui/react/macro";
    const label = translate\`Fixture frontmatter\`;
    const name = "Ada";
    ---

    <p class="keep">{translate\`Fixture markup\`}</p>
    <section class="outer"><p class="nested">{translate\`Fixture nested markup\`}</p></section>
    <p>{label}</p>
  `;
  const astroExpressionDetections: Detection[] = [
    {
      name: "frontmatter prefix",
      original: "const label = ",
      generated: "const label = ",
    },
    {
      name: "frontmatter transform",
      original: "translate`Fixture frontmatter`",
      generated: /_i18n\._\([\s\S]*?message: "Fixture frontmatter"[\s\S]*?\)/,
      extracted: "Fixture frontmatter",
    },
    {
      name: "markup transform",
      original: "translate`Fixture markup`",
      generated:
        /(?<=<p class="keep">\{)_i18n\._\([\s\S]*?message: "Fixture markup"[\s\S]*?\)/,
      extracted: "Fixture markup",
    },
    {
      name: "nested markup transform",
      original: "translate`Fixture nested markup`",
      generated:
        /(?<=<section class="outer"><p class="nested">\{)_i18n\._\([\s\S]*?message: "Fixture nested markup"[\s\S]*?\)/,
      extracted: "Fixture nested markup",
    },
    {
      name: "kept wrapper",
      original: '<p class="keep">',
      generated: '<p class="keep">',
    },
    {
      name: "kept wrapper with brace",
      original: '<p class="keep">{',
      generated: '<p class="keep">{',
    },
    {
      name: "kept wrapper close",
      original: /<\/p>(?=\n<section class="outer">)/,
      generated: /<\/p>(?=\n<section class="outer">)/,
    },
    {
      name: "kept wrapper close with brace",
      original: /\}(?=<\/p>\n<section class="outer">)/,
      generated: /\}(?=<\/p>\n<section class="outer">)/,
    },
    {
      name: "nested wrapper open",
      original: '<section class="outer"><p class="nested">{',
      generated: '<section class="outer"><p class="nested">{',
      mapping: "chars",
    },
    {
      name: "nested wrapper close",
      original: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
      generated: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
      mapping: "chars",
    },
  ];

  const astroComponentFilename = "/virtual/ComponentBoundary.astro";
  const astroComponentSource = dedent`
    ---
    import { Trans as Translation } from "@lingui/react/macro";
    const name = "Ada";
    ---

    <Translation>Boundary component {name}</Translation>
  `;
  const astroComponentDetection: Detection = {
    name: "component boundary",
    original: "<Translation>Boundary component {name}</Translation>",
    generated: /<_Trans\b[\s\S]*?\/>/,
  };
  const astroComponentExtractDetection: Detection = {
    name: "component extraction",
    original: "Boundary component ",
    extracted: "Boundary component {name}",
  };

  const astroWhitespaceComponentFilename = "/virtual/ComponentWhitespace.astro";
  const astroWhitespaceComponentSource = dedent`
    ---
    import { Trans as Translation } from "@lingui/react/macro";
    const name = "Ada";
    ---

    <Translation>
      Boundary component {name}
    </Translation>
  `;
  const astroWhitespaceComponentExtractDetection: Detection = {
    name: "component extraction with surrounding whitespace",
    original: "Boundary component ",
    extracted: "Boundary component {name}",
  };

  const astroNestedComponentFilename = "/virtual/ComponentNested.astro";
  const astroNestedComponentSource = dedent`
    ---
    import { t as translate } from "@lingui/core/macro";
    import { Trans as Translation } from "@lingui/react/macro";
    const name = "Ada";
    ---

    <Translation>
      Nested <strong>{name}</strong> component
    </Translation>

    <p>{  translate\`Whitespace markup \${name}\`  }</p>
    <button title={translate\`Button title \${name}\`}>Trigger</button>
  `;
  const astroNestedComponentDetections: Detection[] = [
    {
      name: "nested component boundary",
      original:
        /<Translation>\n  Nested <strong>\{name\}<\/strong> component\n<\/Translation>/,
      generated: /<_Trans\b[\s\S]*?\/>/,
    },
    {
      name: "nested component extraction",
      original: "Nested ",
      extracted: "Nested <0>{name}</0> component",
    },
    {
      name: "whitespace markup transform",
      original: "translate`Whitespace markup ${name}`",
      generated:
        /(?<=<p>\{  )_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
      extracted: "Whitespace markup {name}",
    },
    {
      name: "whitespace wrapper open",
      original: "<p>{  ",
      generated: "<p>{  ",
      mapping: "chars",
    },
    {
      name: "whitespace wrapper close",
      original: /  \}<\/p>(?=\n<button title=\{)/,
      generated: /  \}<\/p>(?=\n<button title=\{)/,
      mapping: "chars",
    },
    {
      name: "attribute macro transform",
      original: "translate`Button title ${name}`",
      generated:
        /(?<=<button title=\{)_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
      extracted: "Button title {name}",
    },
    {
      name: "attribute wrapper open",
      original: "<button title={",
      generated: "<button title={",
      mapping: "chars",
    },
    {
      name: "attribute wrapper close",
      original: /}>Trigger<\/button>/,
      generated: /}>Trigger<\/button>/,
      mapping: "chars",
    },
  ];

  const fixtures: DetectionFixture[] = [
    {
      name: "Svelte expression contracts",
      framework: "svelte",
      filename: svelteExpressionFilename,
      source: svelteExpressionSource,
      detections: svelteExpressionDetections,
    },
    {
      name: "Svelte component boundary contracts",
      framework: "svelte",
      filename: svelteComponentFilename,
      source: svelteComponentSource,
      detections: [svelteComponentDetection, svelteComponentExtractDetection],
    },
    {
      name: "Svelte whitespace component extract contracts",
      framework: "svelte",
      filename: svelteWhitespaceComponentFilename,
      source: svelteWhitespaceComponentSource,
      detections: [svelteWhitespaceComponentExtractDetection],
    },
    {
      name: "Svelte nested component and attribute contracts",
      framework: "svelte",
      filename: svelteNestedComponentFilename,
      source: svelteNestedComponentSource,
      detections: svelteNestedComponentDetections,
    },
    {
      name: "Astro expression contracts",
      framework: "astro",
      filename: astroExpressionFilename,
      source: astroExpressionSource,
      detections: astroExpressionDetections,
    },
    {
      name: "Astro component boundary contracts",
      framework: "astro",
      filename: astroComponentFilename,
      source: astroComponentSource,
      detections: [astroComponentDetection, astroComponentExtractDetection],
    },
    {
      name: "Astro whitespace component extract contracts",
      framework: "astro",
      filename: astroWhitespaceComponentFilename,
      source: astroWhitespaceComponentSource,
      detections: [astroWhitespaceComponentExtractDetection],
    },
    {
      name: "Astro nested component and attribute contracts",
      framework: "astro",
      filename: astroNestedComponentFilename,
      source: astroNestedComponentSource,
      detections: astroNestedComponentDetections,
    },
  ];

  test.for(fixtures)("$name", async (fixture) => {
    await assertDetections(fixture);
  });
});

async function assertDetections(fixture: DetectionFixture): Promise<void> {
  const { detections, filename, framework, source } = fixture;
  const synthetic = buildSyntheticModuleForTest(framework, source, {
    sourceName: filename,
    syntheticName: filename.replace(/\.(astro|svelte)$/, ".synthetic.tsx"),
  });
  const transformed = transformSyntheticModule(synthetic);
  const reinserted = reinsertTransformedModule(
    source,
    synthetic,
    transformed.declarations,
    { sourceName: filename },
  );
  const consumer = new TraceMap(reinserted.source_map_json ?? "");
  const messages = await extractMessagesFromSyntheticModule(
    filename,
    synthetic,
  );

  detections.forEach((detection) => {
    if (detection.generated == null) {
      return assertExtractionOrigin(messages, source, detection, filename);
    }
    assertRangeMapping(consumer, reinserted.code, source, detection, filename);
    if (detection.extracted != null) {
      assertExtractionOrigin(messages, source, detection, filename);
    }
  });
}

function assertExtractionOrigin(
  messages: readonly ExtractedMessage[],
  source: string,
  detection: Detection,
  filename: string,
): void {
  if (detection.extracted == null) {
    throw new Error(`Missing extracted matcher: ${detection.name}`);
  }

  const original = findUniqueRange(source, detection.original);
  const originalStart = offsetToLocation(source, original.start);
  const message = findUniqueMessage(messages, detection.extracted);

  expect(
    message.origin,
    `${detection.name}: missing extraction origin`,
  ).toEqual([filename, originalStart.line, originalStart.column]);
}

function findUniqueMessage(
  messages: readonly ExtractedMessage[],
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
  if (detection.generated == null) {
    throw new Error(`Missing generated matcher: ${detection.name}`);
  }

  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);

  const mapping =
    detection.mapping ??
    (typeof detection.original === "string" &&
    typeof detection.generated === "string" &&
    detection.original === detection.generated
      ? "chars"
      : "range");

  if (mapping === "chars") {
    assertCharacterMapping(
      consumer,
      generatedSource,
      originalSource,
      detection,
      filename,
      generated,
      original,
    );
    return;
  }

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

function assertCharacterMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
  generatedRange?: {
    start: number;
    end: number;
  },
  originalRange?: {
    start: number;
    end: number;
  },
): void {
  const generated =
    generatedRange ??
    (detection.generated == null
      ? undefined
      : findUniqueRange(generatedSource, detection.generated));
  const original =
    originalRange ?? findUniqueRange(originalSource, detection.original);

  if (!generated) {
    throw new Error(`Missing generated matcher: ${detection.name}`);
  }

  const generatedLength = generated.end - generated.start;
  const originalLength = original.end - original.start;

  expect(generatedLength, `${detection.name}: range lengths differ`).toBe(
    originalLength,
  );

  for (let offset = 0; offset < generatedLength; offset += 1) {
    const generatedPoint = offsetToLocation(
      generatedSource,
      generated.start + offset,
    );
    const originalPoint = offsetToLocation(
      originalSource,
      original.start + offset,
    );
    const mapped = originalPositionFor(consumer, {
      line: generatedPoint.line,
      column: generatedPoint.column,
    });

    expect(
      mapped.source,
      `${detection.name}: char ${offset} missing source`,
    ).toBe(filename);
    expect(mapped.line, `${detection.name}: char ${offset} line`).toBe(
      originalPoint.line,
    );
    expect(mapped.column, `${detection.name}: char ${offset} column`).toBe(
      originalPoint.column,
    );
  }
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
