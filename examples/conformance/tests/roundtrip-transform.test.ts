import { TraceMap } from "@jridgewell/trace-mapping";
import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  assertRangeMapping,
  findUniqueRange,
  offsetToLocation,
} from "@lingui-for/internal-shared-test-helpers";

import {
  transformFixture,
  extractRoundtripFixture,
} from "./support/transform.ts";

type Detection =
  | {
      contract: "transform-range" | "boundary-preservation";
      fails?: boolean;
      name: string;
      original: string | RegExp;
      generated: string | RegExp;
      mapping?: "range" | "chars" | "start";
    }
  | {
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
    name: "Svelte transform expression contracts",
    framework: "svelte",
    filename: "/virtual/Fixture.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const reactiveLabel = $translate\`Fixture reactive script\`;
        const eagerLabel = translate.eager\`Fixture eager script\`;
        const name = "Ada";
      </script>

      <p class="keep">{$translate\`Fixture markup \${name}\`}</p>
      <section class="outer"><p class="nested">{$translate\`Fixture nested markup \${name}\`}</p></section>
      <p>{reactiveLabel}</p>
      <p>{eagerLabel}</p>
    `,
    detections: [
      {
        contract: "transform-range",
        name: "reactive script transform",
        original: "$translate`Fixture reactive script`",
        generated:
          /(?<=const reactiveLabel = )\$__l4s_translate\([\s\S]*?message: "Fixture reactive script"[\s\S]*?\)(?=;)/,
      },
      {
        contract: "extract-origin",
        name: "reactive script extraction",
        original: /translate`Fixture reactive script`/,
        extracted: "Fixture reactive script",
      },
      {
        contract: "transform-range",
        name: "eager script transform",
        original: /translate\.eager`Fixture eager script`/,
        generated:
          /(?<=const eagerLabel = )__l4s_getI18n\(\)\._\([\s\S]*?message: "Fixture eager script"[\s\S]*?\)(?=;)/,
      },
      {
        contract: "extract-origin",
        name: "eager script extraction",
        original: /translate\.eager`Fixture eager script`/,
        extracted: "Fixture eager script",
      },
      {
        contract: "transform-range",
        name: "markup transform",
        original: "$translate`Fixture markup ${name}`",
        generated:
          /(?<=<p class="keep">\{)\$__l4s_translate\([\s\S]*?message: "Fixture markup \{name\}"[\s\S]*?\)(?=\}<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "markup extraction",
        original: /translate`Fixture markup \$\{name\}`/,
        extracted: "Fixture markup {name}",
      },
      {
        contract: "transform-range",
        name: "nested markup transform",
        original: "$translate`Fixture nested markup ${name}`",
        generated:
          /(?<=<section class="outer"><p class="nested">\{)\$__l4s_translate\([\s\S]*?message: "Fixture nested markup \{name\}"[\s\S]*?\)(?=\}<\/p><\/section>)/,
      },
      {
        contract: "extract-origin",
        name: "nested markup extraction",
        original: /translate`Fixture nested markup \$\{name\}`/,
        extracted: "Fixture nested markup {name}",
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper",
        original: '<p class="keep">',
        generated: '<p class="keep">',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close",
        original: /<\/p>(?=\n<section class="outer">)/,
        generated: /<\/p>(?=\n<section class="outer">)/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Astro transform expression contracts",
    framework: "astro",
    filename: "/virtual/Fixture.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Fixture frontmatter\`;
      const name = "Ada";
      ---

      <p class="keep">{translate\`Fixture markup\`}</p>
      <section class="outer"><p class="nested">{translate\`Fixture nested markup\`}</p></section>
      <p>{label}</p>
    `,
    detections: [
      {
        contract: "transform-range",
        name: "frontmatter transform",
        original: "translate`Fixture frontmatter`",
        generated:
          /(?<=const label = )__l4a_i18n\._\([\s\S]*?message: "Fixture frontmatter"[\s\S]*?\)(?=;)/,
      },
      {
        contract: "extract-origin",
        name: "frontmatter extraction",
        original: "translate`Fixture frontmatter`",
        extracted: "Fixture frontmatter",
      },
      {
        contract: "transform-range",
        name: "markup transform",
        original: "translate`Fixture markup`",
        generated:
          /(?<=<p class="keep">\{)__l4a_i18n\._\([\s\S]*?message: "Fixture markup"[\s\S]*?\)(?=\}<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "markup extraction",
        original: "translate`Fixture markup`",
        extracted: "Fixture markup",
      },
      {
        contract: "transform-range",
        name: "nested markup transform",
        original: "translate`Fixture nested markup`",
        generated:
          /(?<=<section class="outer"><p class="nested">\{)__l4a_i18n\._\([\s\S]*?message: "Fixture nested markup"[\s\S]*?\)(?=\}<\/p><\/section>)/,
      },
      {
        contract: "extract-origin",
        name: "nested markup extraction",
        original: "translate`Fixture nested markup`",
        extracted: "Fixture nested markup",
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper",
        original: '<p class="keep">',
        generated: '<p class="keep">',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close",
        original: /<\/p>(?=\n<section class="outer">)/,
        generated: /<\/p>(?=\n<section class="outer">)/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Svelte transform nested component and attribute contracts",
    framework: "svelte",
    filename: "/virtual/ComponentNested.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <Translation>
        Nested <strong>{name}</strong> component
      </Translation>

      <p>{  $translate\`Whitespace markup \${name}\`  }</p>
      <button title={$translate\`Button title \${name}\`}>Trigger</button>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "nested component boundary",
        original: "<Translation>",
        generated: /<L4sRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "nested component extraction",
        original: "<Translation>",
        extracted: "Nested <0>{name}</0> component",
      },
      {
        contract: "transform-range",
        name: "whitespace markup transform",
        original: "$translate`Whitespace markup ${name}`",
        generated:
          /(?<=<p>\{  )\$__l4s_translate\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "whitespace markup extraction",
        original: /translate`Whitespace markup \$\{name\}`/,
        extracted: "Whitespace markup {name}",
      },
      {
        contract: "boundary-preservation",
        name: "whitespace wrapper open",
        original: "<p>{  ",
        generated: "<p>{  ",
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "whitespace wrapper close",
        original: /  \}<\/p>(?=\n<button title=\{)/,
        generated: /  \}<\/p>(?=\n<button title=\{)/,
        mapping: "range",
      },
      {
        contract: "transform-range",
        name: "attribute macro transform",
        original: "$translate`Button title ${name}`",
        generated:
          /(?<=<button title=\{)\$__l4s_translate\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
      },
      {
        contract: "extract-origin",
        name: "attribute macro extraction",
        original: /translate`Button title \$\{name\}`/,
        extracted: "Button title {name}",
      },
      {
        contract: "boundary-preservation",
        name: "attribute wrapper open",
        original: "<button title={",
        generated: "<button title={",
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "attribute wrapper close",
        original: /}>Trigger<\/button>/,
        generated: /}>Trigger<\/button>/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Astro transform nested component and attribute contracts",
    framework: "astro",
    filename: "/virtual/ComponentNested.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Translation>
        Nested <strong>{name}</strong> component
      </Translation>

      <p>{  translate\`Whitespace markup \${name}\`  }</p>
      <button title={translate\`Button title \${name}\`}>Trigger</button>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "nested component boundary",
        original: "<Translation>",
        generated: /<L4aRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "nested component extraction",
        original: "<Translation>",
        extracted: "Nested <0>{name}</0> component",
      },
      {
        contract: "transform-range",
        name: "whitespace markup transform",
        original: "translate`Whitespace markup ${name}`",
        generated:
          /(?<=<p>\{  )__l4a_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "whitespace markup extraction",
        original: "translate`Whitespace markup ${name}`",
        extracted: "Whitespace markup {name}",
      },
      {
        contract: "boundary-preservation",
        name: "whitespace wrapper open",
        original: "<p>{  ",
        generated: "<p>{  ",
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "whitespace wrapper close",
        original: /  \}<\/p>(?=\n<button title=\{)/,
        generated: /  \}<\/p>(?=\n<button title=\{)/,
        mapping: "range",
      },
      {
        contract: "transform-range",
        name: "attribute macro transform",
        original: "translate`Button title ${name}`",
        generated:
          /(?<=<button title=\{)__l4a_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
      },
      {
        contract: "extract-origin",
        name: "attribute macro extraction",
        original: "translate`Button title ${name}`",
        extracted: "Button title {name}",
      },
      {
        contract: "boundary-preservation",
        name: "attribute wrapper open",
        original: "<button title={",
        generated: "<button title={",
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "attribute wrapper close",
        original: /}>Trigger<\/button>/,
        generated: /}>Trigger<\/button>/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Svelte transform complex expression token contracts",
    framework: "svelte",
    filename: "/virtual/ComplexExpressionScenario.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const scriptData = { route: { path: "/docs" } };
        const markupData = { location: { path: "/guide" } };
        const scriptLabel = $translate\`foo \${String(scriptData.route.path ?? "")} bar\`;
      </script>

      <Translation>foo {String(markupData.location.path ?? "")} bar</Translation>
      <p>{scriptLabel}</p>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "complex script data start",
        original: /scriptData(?=\.route\.path \?\? "")/,
        generated: /(?<=String\()scriptData(?=\.route\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script route start",
        original: /(?<=scriptData\.)route\.path \?\?/,
        generated: /(?<=String\(scriptData\.)route\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script path start",
        original: /(?<=scriptData\.route\.)path \?\? ""/,
        generated: /(?<=String\(scriptData\.route\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // Babel does not preserve a standalone token start for `??` inside the transformed descriptor payload.
        name: "complex script nullish start",
        original: /(?<=scriptData\.route\.path )\?\? ""/,
        generated: /(?<=String\(scriptData\.route\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script empty string start",
        original: /(?<=scriptData\.route\.path \?\? )""/,
        generated: /(?<=String\(scriptData\.route\.path \?\? )""/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "complex script extraction",
        original:
          /translate`foo \$\{String\(scriptData\.route\.path \?\? ""\)\} bar`/,
        extracted: "foo {0} bar",
      },
      {
        contract: "boundary-preservation",
        name: "complex component boundary",
        original: "<Translation>",
        generated: /<L4sRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component data start",
        original: /markupData(?=\.location\.path \?\? "")/,
        generated: /(?<=String\()markupData(?=\.location\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component location start",
        original: /(?<=markupData\.)location\.path \?\?/,
        generated: /(?<=String\(markupData\.)location\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component path start",
        original: /(?<=markupData\.location\.)path \?\? ""/,
        generated: /(?<=String\(markupData\.location\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // Babel does not preserve a standalone token start for `??` inside the transformed descriptor payload.
        name: "complex component nullish start",
        original: /(?<=markupData\.location\.path )\?\? ""/,
        generated: /(?<=String\(markupData\.location\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component empty string start",
        original: /(?<=markupData\.location\.path \?\? )""/,
        generated: /(?<=String\(markupData\.location\.path \?\? )""/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "complex component extraction",
        original:
          /<Translation>foo \{String\(markupData\.location\.path \?\? ""\)\} bar<\/Translation>/,
        extracted: "foo {0} bar",
      },
    ],
  },
  {
    name: "Astro transform complex expression token contracts",
    framework: "astro",
    filename: "/virtual/ComplexExpressionScenario.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-astro/macro";
      const scriptData = { route: { path: "/docs" } };
      const markupData = { location: { path: "/guide" } };
      const scriptLabel = translate\`foo \${String(scriptData.route.path ?? "")} bar\`;
      ---

      <Translation>foo {String(markupData.location.path ?? "")} bar</Translation>
      <p>{scriptLabel}</p>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "complex script data start",
        original: /scriptData(?=\.route\.path \?\? "")/,
        generated: /(?<=String\()scriptData(?=\.route\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script route start",
        original: /(?<=scriptData\.)route\.path \?\?/,
        generated: /(?<=String\(scriptData\.)route\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script path start",
        original: /(?<=scriptData\.route\.)path \?\? ""/,
        generated: /(?<=String\(scriptData\.route\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // Babel does not preserve a standalone token start for `??` inside the transformed descriptor payload.
        name: "complex script nullish start",
        original: /(?<=scriptData\.route\.path )\?\? ""/,
        generated: /(?<=String\(scriptData\.route\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script empty string start",
        original: /(?<=scriptData\.route\.path \?\? )""/,
        generated: /(?<=String\(scriptData\.route\.path \?\? )""/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "complex script extraction",
        original:
          /translate`foo \$\{String\(scriptData\.route\.path \?\? ""\)\} bar`/,
        extracted: "foo {0} bar",
      },
      {
        contract: "boundary-preservation",
        name: "complex component boundary",
        original: "<Translation>",
        generated: /<L4aRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component data start",
        original: /markupData(?=\.location\.path \?\? "")/,
        generated: /(?<=String\()markupData(?=\.location\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component location start",
        original: /(?<=markupData\.)location\.path \?\?/,
        generated: /(?<=String\(markupData\.)location\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component path start",
        original: /(?<=markupData\.location\.)path \?\? ""/,
        generated: /(?<=String\(markupData\.location\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // Babel does not preserve a standalone token start for `??` inside the transformed descriptor payload.
        name: "complex component nullish start",
        original: /(?<=markupData\.location\.path )\?\? ""/,
        generated: /(?<=String\(markupData\.location\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex component empty string start",
        original: /(?<=markupData\.location\.path \?\? )""/,
        generated: /(?<=String\(markupData\.location\.path \?\? )""/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "complex component extraction",
        original:
          /<Translation>foo \{String\(markupData\.location\.path \?\? ""\)\} bar<\/Translation>/,
        extracted: "foo {0} bar",
      },
    ],
  },
  {
    name: "Svelte transform unicode contracts",
    framework: "svelte",
    filename: "/virtual/UnicodeScenario.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "世界😀";
      </script>

      <p class="frame">前置き🎌 {$translate\`テンプレート🚀 \${name}\`} 後置き🍣</p>
      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `,
    detections: [
      {
        contract: "transform-range",
        name: "unicode markup transform",
        original: "$translate`テンプレート🚀 ${name}`",
        generated:
          /(?<=<p class="frame">前置き🎌 \{)\$__l4s_translate\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "unicode markup extraction",
        original: /translate`テンプレート🚀 \$\{name\}`/,
        extracted: "テンプレート🚀 {name}",
      },
      {
        contract: "boundary-preservation",
        name: "unicode wrapper open",
        original: '<p class="frame">前置き🎌 {',
        generated: '<p class="frame">前置き🎌 {',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode wrapper close",
        original: /} 後置き🍣<\/p>(?=\n<Translation>)/,
        generated: /} 後置き🍣<\/p>(?=\n<L4sRuntimeTrans\b)/,
      },
      {
        contract: "boundary-preservation",
        name: "unicode component boundary",
        original: "<Translation>",
        generated: /<L4sRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "unicode component extraction",
        original:
          /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
  {
    name: "Astro transform unicode contracts",
    framework: "astro",
    filename: "/virtual/UnicodeScenario.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "世界😀";
      ---

      <p class="frame">前置き🎌 {translate\`テンプレート🚀 \${name}\`} 後置き🍣</p>
      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `,
    detections: [
      {
        contract: "transform-range",
        name: "unicode markup transform",
        original: "translate`テンプレート🚀 ${name}`",
        generated:
          /(?<=<p class="frame">前置き🎌 \{)__l4a_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "unicode markup extraction",
        original: "translate`テンプレート🚀 ${name}`",
        extracted: "テンプレート🚀 {name}",
      },
      {
        contract: "boundary-preservation",
        name: "unicode wrapper open",
        original: '<p class="frame">前置き🎌 {',
        generated: '<p class="frame">前置き🎌 {',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode wrapper close",
        original: /} 後置き🍣<\/p>(?=\n<Translation>)/,
        generated: /} 後置き🍣<\/p>(?=\n<L4aRuntimeTrans\b)/,
      },
      {
        contract: "boundary-preservation",
        name: "unicode component boundary",
        original: "<Translation>",
        generated: /<L4aRuntimeTrans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "unicode component extraction",
        original:
          /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
];

describe("package transform roundtrip source map discipline", () => {
  const prepare = async ({ framework, filename, source }: Fixture) => {
    const transformed = await transformFixture(framework, source, { filename });
    const messages = await extractRoundtripFixture(framework, source, {
      filename,
    });
    if (transformed.map == null) {
      throw new Error(`Missing transform sourcemap for ${filename}`);
    }

    return {
      transformed,
      consumer: new TraceMap(JSON.stringify(transformed.map)),
      messages,
    };
  };

  describe.for(fixtures)("$name", async (fixture) => {
    const { detections, filename, source } = fixture;

    let prepareResult: Awaited<ReturnType<typeof prepare>>;
    test.beforeAll(async () => {
      prepareResult = await prepare(fixture);
    });

    test("should not leak synthetic sources", async () => {
      const { transformed, messages } = prepareResult;

      assertNoSyntheticSourceLeak(
        JSON.stringify(transformed.map),
        transformed.artifacts.synthetic.filename,
      );
      assertNoSyntheticExtractionOrigins(
        messages,
        transformed.artifacts.synthetic.filename,
      );
    });

    test.for(
      detections.filter(
        (
          detection,
        ): detection is Extract<
          Detection,
          { contract: "transform-range" | "boundary-preservation" }
        > => !detection.fails && detection.contract !== "extract-origin",
      ),
    )("should satisfy contract: $name", async (detection) => {
      const { transformed, consumer } = prepareResult;

      assertContractRangeMapping(
        consumer,
        transformed.code,
        source,
        detection,
        filename,
      );
    });

    test.fails.for(
      detections.filter(
        (
          detection,
        ): detection is Extract<
          Detection,
          { contract: "transform-range" | "boundary-preservation" }
        > => !!detection.fails && detection.contract !== "extract-origin",
      ),
    )("should not satisfy contract: $name", async (detection) => {
      const { transformed, consumer } = prepareResult;

      assertContractRangeMapping(
        consumer,
        transformed.code,
        source,
        detection,
        filename,
      );
    });

    test.for(
      detections.filter(
        (
          detection,
        ): detection is Extract<Detection, { contract: "extract-origin" }> =>
          !detection.fails && detection.contract === "extract-origin",
      ),
    )("should satisfy extract contract: $name", async (detection) => {
      const { messages } = prepareResult;

      assertExtractionOrigin(messages, source, detection, filename);
    });

    test.fails.for(
      detections.filter(
        (
          detection,
        ): detection is Extract<Detection, { contract: "extract-origin" }> =>
          !!detection.fails && detection.contract === "extract-origin",
      ),
    )("should not satisfy extract contract: $name", async (detection) => {
      const { messages } = prepareResult;

      assertExtractionOrigin(messages, source, detection, filename);
    });
  });
});

function assertContractRangeMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Extract<
    Detection,
    { contract: "transform-range" | "boundary-preservation" }
  >,
  filename: string,
): void {
  assertRangeMapping(
    consumer,
    generatedSource,
    originalSource,
    {
      name: detection.name,
      original: detection.original,
      generated: detection.generated,
    },
    filename,
    detection.mapping === "start" ? "start" : "both",
    expect,
  );
}

function assertExtractionOrigin(
  messages: readonly ExtractedMessage[],
  source: string,
  detection: Extract<Detection, { contract: "extract-origin" }>,
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
