import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
  findUniqueRange,
  offsetToLocation,
} from "@lingui-for/internal-shared-test-helpers";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./support/wasm-lingui.ts";

type Detection = {
  contract: "extract-origin";
  fails?: boolean;
  name: string;
  original: string | RegExp;
  extracted: string | RegExp;
};

type Fixture = {
  name: string;
  framework: "astro" | "svelte";
  filename: string;
  source: string;
  detections: readonly Detection[];
};

const fixtures: readonly Fixture[] = [
  {
    name: "Svelte synthetic extraction origins",
    framework: "svelte",
    filename: "/virtual/Fixture.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const reactiveLabel = $translate\`Fixture reactive script\`;
        const eagerLabel = translate.eager\`Fixture eager script\`;
        const name = "Ada";
      </script>

      <p class="keep">{$translate\`Fixture markup \${name}\`}</p>
      <section class="outer"><p class="nested">{$translate\`Fixture nested markup \${name}\`}</p></section>
      <Translation>Fixture component {name}</Translation>
      <p>{reactiveLabel}</p>
      <p>{eagerLabel}</p>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "reactive script extraction",
        original: /translate`Fixture reactive script`/,
        extracted: "Fixture reactive script",
      },
      {
        contract: "extract-origin",
        name: "eager script extraction",
        original: /translate\.eager`Fixture eager script`/,
        extracted: "Fixture eager script",
      },
      {
        contract: "extract-origin",
        name: "markup extraction",
        original: /translate`Fixture markup \$\{name\}`/,
        extracted: "Fixture markup {name}",
      },
      {
        contract: "extract-origin",
        name: "nested markup extraction",
        original: /translate`Fixture nested markup \$\{name\}`/,
        extracted: "Fixture nested markup {name}",
      },
      {
        contract: "extract-origin",
        name: "component extraction",
        original: "<Translation>",
        extracted: "Fixture component {name}",
      },
    ],
  },
  {
    name: "Astro synthetic extraction origins",
    framework: "astro",
    filename: "/virtual/Fixture.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-astro/macro";
      const label = translate\`Fixture frontmatter\`;
      const name = "Ada";
      ---

      <p class="keep">{translate\`Fixture markup\`}</p>
      <section class="outer"><p class="nested">{translate\`Fixture nested markup\`}</p></section>
      <Translation>Fixture component {name}</Translation>
      <p>{label}</p>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "frontmatter extraction",
        original: "translate`Fixture frontmatter`",
        extracted: "Fixture frontmatter",
      },
      {
        contract: "extract-origin",
        name: "markup extraction",
        original: "translate`Fixture markup`",
        extracted: "Fixture markup",
      },
      {
        contract: "extract-origin",
        name: "nested markup extraction",
        original: "translate`Fixture nested markup`",
        extracted: "Fixture nested markup",
      },
      {
        contract: "extract-origin",
        name: "component extraction",
        original: "<Translation>",
        extracted: "Fixture component {name}",
      },
    ],
  },
  {
    name: "Svelte synthetic whitespace and unicode extraction",
    framework: "svelte",
    filename: "/virtual/WhitespaceUnicode.svelte",
    source: dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "世界😀";
      </script>

      <Translation>
        ようこそ <strong>{name}</strong> さん🎉
      </Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "whitespace component extraction",
        original: "<Translation>",
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
  {
    name: "Astro synthetic whitespace and unicode extraction",
    framework: "astro",
    filename: "/virtual/WhitespaceUnicode.astro",
    source: dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "世界😀";
      ---

      <Translation>
        ようこそ <strong>{name}</strong> さん🎉
      </Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "whitespace component extraction",
        original: "<Translation>",
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
  {
    name: "Svelte synthetic CRLF extraction",
    framework: "svelte",
    filename: "/virtual/UnicodeScenarioCrlf.svelte",
    source: dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "世界👨‍👩‍👧‍👦😀😃😄";
      </script>

      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `.replaceAll("\n", "\r\n"),
    detections: [
      {
        contract: "extract-origin",
        name: "crlf component extraction",
        original: "<Translation>",
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
  {
    name: "Astro synthetic CRLF extraction",
    framework: "astro",
    filename: "/virtual/UnicodeScenarioCrlf.astro",
    source: dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "世界👨‍👩‍👧‍👦😀😃😄";
      ---

      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `.replaceAll("\n", "\r\n"),
    detections: [
      {
        contract: "extract-origin",
        name: "crlf component extraction",
        original: "<Translation>",
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
];

describe("lingui-analyzer synthetic roundtrip source map discipline", () => {
  const prepare = async ({ framework, filename, source }: Fixture) => {
    const synthetic = buildSyntheticModuleForTest(framework, source, {
      sourceName: filename,
      syntheticName: filename.replace(/\.(astro|svelte)$/, ".synthetic.tsx"),
    });
    const transformed = transformSyntheticModule(synthetic);
    const reinserted = reinsertTransformedModule(
      source,
      synthetic,
      transformed,
      { sourceName: filename },
    );
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    return { synthetic, reinserted, messages };
  };

  describe.for(fixtures)("$name", async (fixture) => {
    const { detections, filename, source } = fixture;

    let prepareResult: Awaited<ReturnType<typeof prepare>>;
    beforeAll(async () => {
      prepareResult = await prepare(fixture);
    });

    test("should not leak synthetic sources", async () => {
      const { messages, reinserted, synthetic } = prepareResult;

      assertNoSyntheticSourceLeak(
        reinserted.sourceMapJson ?? "",
        synthetic.syntheticName,
      );
      assertNoSyntheticExtractionOrigins(messages, synthetic.syntheticName);
    });

    test.for(detections.filter(({ fails }) => !fails))(
      "should satisfy contract: $name",
      async (detection) => {
        const { messages } = prepareResult;
        assertExtractionOrigin(messages, source, detection, filename);
      },
    );

    test.fails.for(detections.filter(({ fails }) => fails))(
      "should not satisfy contract: $name",
      async (detection) => {
        const { messages } = prepareResult;
        assertExtractionOrigin(messages, source, detection, filename);
      },
    );
  });
});

function assertExtractionOrigin(
  messages: readonly ExtractedMessage[],
  source: string,
  detection: Detection,
  filename: string,
): void {
  const original = findUniqueRange(source, detection.original);
  const originalStart = offsetToLocation(source, original.start);
  const matched = findMatchingMessages(messages, detection.extracted);

  expect(
    matched.some(
      (message) =>
        message.origin?.[0] === filename &&
        message.origin?.[1] === originalStart.line &&
        message.origin?.[2] === originalStart.column,
    ),
    `${detection.name}: missing extraction origin`,
  ).toBe(true);
}

function findMatchingMessages(
  messages: readonly ExtractedMessage[],
  needle: string | RegExp,
) {
  return messages.filter((message) => {
    const value = message.message ?? "";
    if (typeof needle === "string") {
      return value === needle;
    }
    return needle.test(value);
  });
}

function assertNoSyntheticSourceLeak(
  sourceMapJson: string,
  syntheticName: string,
): void {
  const map = JSON.parse(sourceMapJson) as { sources?: string[] };
  expect(
    map.sources?.includes(syntheticName) ?? false,
    `final sourcemap should not expose synthetic source ${syntheticName}`,
  ).toBe(false);
}

function assertNoSyntheticExtractionOrigins(
  messages: readonly ExtractedMessage[],
  syntheticName: string,
): void {
  expect(
    messages.some((message) => message.origin?.[0] === syntheticName),
    `extraction origins should not expose synthetic source ${syntheticName}`,
  ).toBe(false);
}
