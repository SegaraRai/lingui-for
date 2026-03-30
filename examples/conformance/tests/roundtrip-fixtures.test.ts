import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import {
  assertRangeMapping as assertSharedRangeMapping,
  findUniqueRange,
  nextCodePointOffset,
  offsetToLocation,
} from "@lingui-for/internal-shared-test-helpers";
import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./support/wasm-lingui.ts";

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
  fails?: boolean;
};

describe("lingui-analyzer roundtrip source map discipline", () => {
  const svelteExpressionFilename = "/virtual/Fixture.svelte";
  const svelteExpressionSource = dedent`
    <script lang="ts">
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-svelte/macro";
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
      mapping: "range",
    },
    {
      name: "reactive script transform",
      original: "$translate`Fixture reactive script`",
      generated:
        /_i18n\._\([\s\S]*?message: "Fixture reactive script"[\s\S]*?\)/,
    },
    {
      name: "reactive script extraction",
      original: /translate`Fixture reactive script`/,
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
      original: "$translate`Fixture markup ${name}`",
      generated:
        /(?<=<p class="keep">\{)_i18n\._\([\s\S]*?message: "Fixture markup \{name\}"[\s\S]*?\)/,
    },
    {
      name: "markup extraction",
      original: /translate`Fixture markup \$\{name\}`/,
      extracted: "Fixture markup {name}",
    },
    {
      name: "nested markup transform",
      original: "$translate`Fixture nested markup ${name}`",
      generated:
        /(?<=<section class="outer"><p class="nested">\{)_i18n\._\([\s\S]*?message: "Fixture nested markup \{name\}"[\s\S]*?\)/,
    },
    {
      name: "nested markup extraction",
      original: /translate`Fixture nested markup \$\{name\}`/,
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
      mapping: "range",
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
      mapping: "range",
    },
    {
      name: "nested wrapper open",
      original: '<section class="outer"><p class="nested">{',
      generated: '<section class="outer"><p class="nested">{',
      mapping: "range",
    },
    {
      name: "nested wrapper close",
      original: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
      generated: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
      mapping: "range",
    },
  ];

  const svelteComponentFilename = "/virtual/ComponentBoundary.svelte";
  const svelteComponentSource = dedent`
    <script lang="ts">
      import { Trans as Translation } from "lingui-for-svelte/macro";
      const name = "Ada";
    </script>

    <Translation>Boundary component {name}</Translation>
  `;
  const svelteComponentExtractDetection: Detection = {
    name: "component extraction",
    original: /<Translation>Boundary component \{name\}<\/Translation>/,
    extracted: "Boundary component {name}",
  };

  const svelteWhitespaceComponentFilename =
    "/virtual/ComponentWhitespace.svelte";
  const svelteWhitespaceComponentSource = dedent`
    <script lang="ts">
      import { Trans as Translation } from "lingui-for-svelte/macro";
      const name = "Ada";
    </script>

    <Translation>
      Boundary component {name}
    </Translation>
  `;
  const svelteWhitespaceComponentExtractDetection: Detection = {
    name: "component extraction with surrounding whitespace",
    original: /<Translation>\n  Boundary component \{name\}\n<\/Translation>/,
    extracted: "Boundary component {name}",
  };

  const svelteNestedComponentFilename = "/virtual/ComponentNested.svelte";
  const svelteNestedComponentSource = dedent`
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
  `;
  const svelteNestedComponentDetections: Detection[] = [
    {
      name: "nested component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "nested component extraction",
      original: "<Translation>",
      extracted: "Nested <0>{name}</0> component",
    },
    {
      name: "whitespace markup transform",
      original: "$translate`Whitespace markup ${name}`",
      generated:
        /(?<=<p>\{  )_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
    },
    {
      name: "whitespace markup extraction",
      original: /translate`Whitespace markup \$\{name\}`/,
      extracted: "Whitespace markup {name}",
    },
    {
      name: "whitespace wrapper open",
      original: "<p>{  ",
      generated: "<p>{  ",
      mapping: "range",
    },
    {
      name: "whitespace wrapper close",
      original: /  \}<\/p>(?=\n<button title=\{)/,
      generated: /  \}<\/p>(?=\n<button title=\{)/,
      mapping: "range",
    },
    {
      name: "attribute macro transform",
      original: "$translate`Button title ${name}`",
      generated:
        /(?<=<button title=\{)_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
    },
    {
      name: "attribute macro extraction",
      original: /translate`Button title \$\{name\}`/,
      extracted: "Button title {name}",
    },
    {
      name: "attribute wrapper open",
      original: "<button title={",
      generated: "<button title={",
      mapping: "range",
    },
    {
      name: "attribute wrapper close",
      original: /}>Trigger<\/button>/,
      generated: /}>Trigger<\/button>/,
      mapping: "range",
    },
  ];

  const astroExpressionFilename = "/virtual/Fixture.astro";
  const astroExpressionSource = dedent`
    ---
    import { t as translate } from "@lingui/core/macro";
    import { Trans as Translation } from "lingui-for-astro/macro";
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
      mapping: "range",
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
      mapping: "range",
    },
    {
      name: "nested wrapper close",
      original: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
      generated: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
      mapping: "range",
    },
  ];

  const astroComponentFilename = "/virtual/ComponentBoundary.astro";
  const astroComponentSource = dedent`
    ---
    import { Trans as Translation } from "lingui-for-astro/macro";
    const name = "Ada";
    ---

    <Translation>Boundary component {name}</Translation>
  `;
  const astroComponentExtractDetection: Detection = {
    name: "component extraction",
    original: /<Translation>Boundary component \{name\}<\/Translation>/,
    extracted: "Boundary component {name}",
  };

  const astroWhitespaceComponentFilename = "/virtual/ComponentWhitespace.astro";
  const astroWhitespaceComponentSource = dedent`
    ---
    import { Trans as Translation } from "lingui-for-astro/macro";
    const name = "Ada";
    ---

    <Translation>
      Boundary component {name}
    </Translation>
  `;
  const astroWhitespaceComponentExtractDetection: Detection = {
    name: "component extraction with surrounding whitespace",
    original: /<Translation>\n  Boundary component \{name\}\n<\/Translation>/,
    extracted: "Boundary component {name}",
  };

  const astroNestedComponentFilename = "/virtual/ComponentNested.astro";
  const astroNestedComponentSource = dedent`
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
  `;
  const astroNestedComponentDetections: Detection[] = [
    {
      name: "nested component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "nested component extraction",
      original: "<Translation>",
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
      mapping: "range",
    },
    {
      name: "whitespace wrapper close",
      original: /  \}<\/p>(?=\n<button title=\{)/,
      generated: /  \}<\/p>(?=\n<button title=\{)/,
      mapping: "range",
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
      mapping: "range",
    },
    {
      name: "attribute wrapper close",
      original: /}>Trigger<\/button>/,
      generated: /}>Trigger<\/button>/,
      mapping: "range",
    },
  ];

  const svelteComplexFilename = "/virtual/ComplexScenario.svelte";
  const svelteComplexSource = dedent`
    <script lang="ts">
      import { msg, t as translate } from "@lingui/core/macro";
      import { Plural, Trans as Translation } from "lingui-for-svelte/macro";
      const loading = false;
      const count = 3;
      const gender = "female";
      const status = $derived.by(() =>
        loading
          ? $translate\`Loading items...\`
          : $translate(msg\`Loaded \${count} items.\`),
      );
    </script>

    <Translation>
      Before
      <Plural
        value={count}
        one={$translate\`One item for \${gender}.\`}
        other={$translate\`Plural loaded \${count} items.\`}
      />
      After
    </Translation>

    <p>{status}</p>
  `;
  const svelteComplexDetections: Detection[] = [
    {
      name: "derived loading branch transform",
      original: "$translate`Loading items...`",
      generated: /_i18n\._\([\s\S]*?message: "Loading items\.\.\."[\s\S]*?\)/,
    },
    {
      name: "derived loaded branch transform",
      original: /\$translate\(msg`Loaded \$\{count\} items\.`\)/,
      generated:
        /(?<=\? _i18n\._\([\s\S]*?: )_i18n\._\([\s\S]*?message: "Loaded \{count\} items\."[\s\S]*?\)(?=,\n\s*\);\n<\/script>)/,
    },
    {
      name: "nested plural boundary",
      original:
        /<Translation>[\s\S]*?<Plural[\s\S]*?\/>[\s\S]*?<\/Translation>/,
      generated: /<_Trans\b[\s\S]*?\/>/,
    },
    {
      name: "nested plural extracted message",
      original: "<Translation>",
      extracted: /Before[\s\S]*After/,
    },
  ];

  const astroComplexFilename = "/virtual/ComplexScenario.astro";
  const astroComplexSource = dedent`
    ---
    import { msg, select, t as translate } from "@lingui/core/macro";
    import { Plural, Trans as Translation } from "lingui-for-astro/macro";
    const loading = false;
    const count = 3;
    const gender = "female";
    const status = loading
      ? translate\`Loading items...\`
      : translate(msg\`Loaded \${count} items.\`);
    ---

    <Translation>
      Before
      <Plural
        value={count}
        one={select(gender, {
          female: "one item for her",
          male: "one item for him",
          other: "one item",
        })}
        other={translate\`Plural loaded \${count} items.\`}
      />
      After
    </Translation>

    <p>{status}</p>
  `;
  const astroComplexDetections: Detection[] = [
    {
      name: "derived loading branch transform",
      original: "translate`Loading items...`",
      generated: /_i18n\._\([\s\S]*?message: "Loading items\.\.\."[\s\S]*?\)/,
      extracted: "Loading items...",
    },
    {
      name: "derived loaded branch transform",
      original: /translate\(msg`Loaded \$\{count\} items\.`\)/,
      generated:
        /(?<=const status = loading\n\s*\? _i18n\._\([\s\S]*?: )_i18n\._\([\s\S]*?message: "Loaded \{count\} items\."[\s\S]*?\)(?=;\n---)/,
    },
    {
      name: "nested plural boundary",
      original:
        /<Translation>[\s\S]*?<Plural[\s\S]*?\/>[\s\S]*?<\/Translation>/,
      generated: /<_Trans\b[\s\S]*?\/>/,
    },
    {
      name: "nested plural extracted message",
      original: "<Translation>",
      extracted: /Before[\s\S]*After/,
    },
  ];

  const svelteUnicodeFilename = "/virtual/UnicodeScenario.svelte";
  const svelteUnicodeSource = dedent`
    <script lang="ts">
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-svelte/macro";
      const name = "世界😀";
    </script>

    <p class="frame">前置き🎌 {$translate\`テンプレート🚀 \${name}\`} 後置き🍣</p>
    <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
  `;
  const svelteUnicodeDetections: Detection[] = [
    {
      name: "unicode markup transform",
      original: "$translate`テンプレート🚀 ${name}`",
      generated:
        /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
    },
    {
      name: "unicode wrapper open",
      original: '<p class="frame">前置き🎌 {',
      generated: '<p class="frame">前置き🎌 {',
      mapping: "range",
    },
    {
      name: "unicode wrapper close",
      original: /} 後置き🍣<\/p>(?=\n<Translation>)/,
      generated: /} 後置き🍣<\/p>(?=\n<_Trans\b)/,
    },
    {
      name: "unicode component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "unicode component extraction",
      original:
        /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
      extracted: "ようこそ <0>{name}</0> さん🎉",
    },
  ];

  const astroUnicodeFilename = "/virtual/UnicodeScenario.astro";
  const astroUnicodeSource = dedent`
    ---
    import { t as translate } from "@lingui/core/macro";
    import { Trans as Translation } from "lingui-for-astro/macro";
    const name = "世界😀";
    ---

    <p class="frame">前置き🎌 {translate\`テンプレート🚀 \${name}\`} 後置き🍣</p>
    <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
  `;
  const astroUnicodeDetections: Detection[] = [
    {
      name: "unicode markup transform",
      original: "translate`テンプレート🚀 ${name}`",
      generated:
        /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      extracted: "テンプレート🚀 {name}",
    },
    {
      name: "unicode wrapper open",
      original: '<p class="frame">前置き🎌 {',
      generated: '<p class="frame">前置き🎌 {',
      mapping: "range",
    },
    {
      name: "unicode wrapper close",
      original: /} 後置き🍣<\/p>(?=\n<Translation>)/,
      generated: /} 後置き🍣<\/p>(?=\n<_Trans\b)/,
    },
    {
      name: "unicode component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "unicode component extraction",
      original:
        /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
      extracted: "ようこそ <0>{name}</0> さん🎉",
    },
  ];

  const svelteUnicodeCrlfFilename = "/virtual/UnicodeScenarioCrlf.svelte";
  const svelteUnicodeCrlfSource = [
    '<script lang="ts">',
    '  import { t as translate } from "@lingui/core/macro";',
    '  import { Trans as Translation } from "lingui-for-svelte/macro";',
    '  const name = "世界👨‍👩‍👧‍👦😀😃😄";',
    "</script>",
    "",
    '<p class="frame">前置き🎌 {$translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`} 後置き🍣</p>',
    "<Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>",
  ].join("\r\n");
  const svelteUnicodeCrlfDetections: Detection[] = [
    {
      name: "unicode crlf markup transform",
      original: "$translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`",
      generated:
        /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
    },
    {
      name: "unicode crlf wrapper open",
      original: '<p class="frame">前置き🎌 {',
      generated: '<p class="frame">前置き🎌 {',
      mapping: "range",
    },
    {
      name: "unicode crlf wrapper close",
      original: /} 後置き🍣<\/p>(?=\r\n<Translation>)/,
      generated: /} 後置き🍣<\/p>(?=\r\n<_Trans\b)/,
      mapping: "range",
    },
    {
      name: "unicode crlf component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "unicode crlf component extraction",
      original:
        /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
      extracted: "ようこそ <0>{name}</0> さん🎉",
    },
  ];

  const astroUnicodeCrlfFilename = "/virtual/UnicodeScenarioCrlf.astro";
  const astroUnicodeCrlfSource = [
    "---",
    'import { t as translate } from "@lingui/core/macro";',
    'import { Trans as Translation } from "lingui-for-astro/macro";',
    'const name = "世界👨‍👩‍👧‍👦😀😃😄";',
    "---",
    "",
    '<p class="frame">前置き🎌 {translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`} 後置き🍣</p>',
    "<Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>",
  ].join("\r\n");
  const astroUnicodeCrlfDetections: Detection[] = [
    {
      name: "unicode crlf markup transform",
      original: "translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`",
      generated:
        /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      extracted: "家族👨‍👩‍👧‍👦😀😃😄 {name}",
    },
    {
      name: "unicode crlf wrapper open",
      original: '<p class="frame">前置き🎌 {',
      generated: '<p class="frame">前置き🎌 {',
      mapping: "range",
    },
    {
      name: "unicode crlf wrapper close",
      original: /} 後置き🍣<\/p>(?=\r\n<Translation>)/,
      generated: /} 後置き🍣<\/p>(?=\r\n<_Trans\b)/,
      mapping: "range",
    },
    {
      name: "unicode crlf component boundary",
      original: "<Translation>",
      generated: /<_Trans\b/,
    },
    {
      name: "unicode crlf component extraction",
      original:
        /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
      extracted: "ようこそ <0>{name}</0> さん🎉",
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
      detections: [svelteComponentExtractDetection],
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
      detections: svelteNestedComponentDetections.filter(
        (detection) => detection.name !== "nested component boundary",
      ),
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
      detections: [astroComponentExtractDetection],
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
      detections: astroNestedComponentDetections.filter(
        (detection) => detection.name !== "nested component boundary",
      ),
    },
    {
      name: "Svelte complex derived contracts",
      framework: "svelte",
      filename: svelteComplexFilename,
      source: svelteComplexSource,
      detections: svelteComplexDetections,
    },
    {
      name: "Astro complex nested component contracts",
      framework: "astro",
      filename: astroComplexFilename,
      source: astroComplexSource,
      detections: astroComplexDetections,
    },
    {
      name: "Svelte unicode contracts",
      framework: "svelte",
      filename: svelteUnicodeFilename,
      source: svelteUnicodeSource,
      detections: svelteUnicodeDetections.filter(
        (detection) => detection.name !== "unicode component boundary",
      ),
    },
    {
      name: "Astro unicode contracts",
      framework: "astro",
      filename: astroUnicodeFilename,
      source: astroUnicodeSource,
      detections: astroUnicodeDetections.filter(
        (detection) => detection.name !== "unicode component boundary",
      ),
    },
    {
      name: "Svelte unicode CRLF contracts",
      framework: "svelte",
      filename: svelteUnicodeCrlfFilename,
      source: svelteUnicodeCrlfSource,
      detections: svelteUnicodeCrlfDetections.filter(
        (detection) => detection.name !== "unicode crlf component boundary",
      ),
    },
    {
      name: "Astro unicode CRLF contracts",
      framework: "astro",
      filename: astroUnicodeCrlfFilename,
      source: astroUnicodeCrlfSource,
      detections: astroUnicodeCrlfDetections.filter(
        (detection) => detection.name !== "unicode crlf component boundary",
      ),
    },
  ];

  test.for(fixtures.filter((fixture) => !fixture.fails))(
    "$name",
    async (fixture) => {
      await assertDetections(fixture);
    },
  );

  test.fails.for(fixtures.filter((fixture) => fixture.fails))(
    "$name",
    async (fixture) => {
      await assertDetections(fixture);
    },
  );
});

async function assertDetections(fixture: DetectionFixture): Promise<void> {
  const { detections, filename, framework, source } = fixture;
  const synthetic = buildSyntheticModuleForTest(framework, source, {
    sourceName: filename,
    syntheticName: filename.replace(/\.(astro|svelte)$/, ".synthetic.tsx"),
  });
  const transformed = transformSyntheticModule(synthetic);
  const reinserted = reinsertTransformedModule(source, synthetic, transformed, {
    sourceName: filename,
  });
  const consumer = new TraceMap(reinserted.sourceMapJson ?? "");
  const messages = await extractMessagesFromSyntheticModule(
    filename,
    synthetic,
  );

  detections.forEach((detection) => {
    if (detection.generated == null) {
      return assertExtractionOrigin(messages, source, detection, filename);
    }
    assertContractRangeMapping(
      consumer,
      reinserted.code,
      source,
      detection,
      filename,
    );
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

function assertContractRangeMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
): void {
  if (detection.generated == null) {
    throw new Error(`Missing generated matcher: ${detection.name}`);
  }

  const mapping = detection.mapping ?? "range";

  if (mapping === "chars") {
    assertCharacterMapping(
      consumer,
      generatedSource,
      originalSource,
      detection,
      filename,
    );
    return;
  }

  assertSharedRangeMapping(
    consumer,
    generatedSource,
    originalSource,
    {
      name: detection.name,
      original: detection.original,
      generated: detection.generated,
    },
    filename,
    expect,
  );
}

function assertCharacterMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
): void {
  const generated =
    detection.generated == null
      ? undefined
      : findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);

  if (!generated) {
    throw new Error(`Missing generated matcher: ${detection.name}`);
  }

  let generatedOffset = generated.start;
  let originalOffset = original.start;

  while (generatedOffset < generated.end && originalOffset < original.end) {
    const generatedPoint = offsetToLocation(generatedSource, generatedOffset);
    const originalPoint = offsetToLocation(originalSource, originalOffset);
    const mapped = originalPositionFor(consumer, {
      line: generatedPoint.line,
      column: generatedPoint.column,
    });

    expect(
      mapped.source,
      `${detection.name}: offset ${generatedOffset - generated.start} missing source`,
    ).toBe(filename);
    expect(
      mapped.line,
      `${detection.name}: offset ${generatedOffset - generated.start} line`,
    ).toBe(originalPoint.line);
    expect(
      mapped.column,
      `${detection.name}: offset ${generatedOffset - generated.start} column`,
    ).toBe(originalPoint.column);

    generatedOffset = nextCodePointOffset(generatedSource, generatedOffset);
    originalOffset = nextCodePointOffset(originalSource, originalOffset);
  }

  expect(
    generatedOffset,
    `${detection.name}: generated range lengths differ`,
  ).toBe(generated.end);
  expect(
    originalOffset,
    `${detection.name}: original range lengths differ`,
  ).toBe(original.end);
}
