import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type { ExtractedMessage } from "@lingui/conf";
import dedent from "dedent";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
  assertRangeMapping,
  findUniqueRange,
  nextCodePointOffset,
  offsetToLocation,
} from "@lingui-for/internal-shared-test-helpers";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./support/wasm-lingui.ts";

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

type DetectionFixture = {
  name: string;
  framework: "astro" | "svelte";
  filename: string;
  source: string;
  detections: readonly Detection[];
};

const fixtures: readonly DetectionFixture[] = [
  // Svelte basics
  {
    name: "Svelte component expression contracts",
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
      <p>{reactiveLabel}</p>
      <p>{eagerLabel}</p>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "eager script prefix",
        original: "const eagerLabel = ",
        generated: "const eagerLabel = ",
        mapping: "range",
      },
      {
        contract: "transform-range",
        name: "reactive script transform",
        original: "$translate`Fixture reactive script`",
        generated:
          /_i18n\._\([\s\S]*?message: "Fixture reactive script"[\s\S]*?\)/,
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
          /(?<=const eagerLabel = )_i18n\._\([\s\S]*?message: "Fixture eager script"[\s\S]*?\)/,
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
          /(?<=<p class="keep">\{)_i18n\._\([\s\S]*?message: "Fixture markup \{name\}"[\s\S]*?\)/,
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
          /(?<=<section class="outer"><p class="nested">\{)_i18n\._\([\s\S]*?message: "Fixture nested markup \{name\}"[\s\S]*?\)/,
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
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close",
        original: /<\/p>(?=\n<section class="outer">)/,
        generated: /<\/p>(?=\n<section class="outer">)/,
      },
      {
        contract: "boundary-preservation",
        name: "reactive script prefix",
        original: "const reactiveLabel = ",
        generated: "const reactiveLabel = ",
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper with brace",
        original: '<p class="keep">{',
        generated: '<p class="keep">{',
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close with brace",
        original: /\}<\/p>(?=\n<section class="outer">)/,
        generated: /\}<\/p>(?=\n<section class="outer">)/,
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "nested wrapper open",
        original: '<section class="outer"><p class="nested">{',
        generated: '<section class="outer"><p class="nested">{',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "nested wrapper close",
        original: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
        generated: /\}<\/p><\/section>(?=\n<p>\{reactiveLabel\}<\/p>)/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Svelte component boundary contracts",
    framework: "svelte",
    filename: "/virtual/ComponentBoundary.svelte",
    source: dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <Translation>Boundary component {name}</Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "component extraction",
        original: /<Translation>Boundary component \{name\}<\/Translation>/,
        extracted: "Boundary component {name}",
      },
    ],
  },
  {
    name: "Svelte whitespace component extract contracts",
    framework: "svelte",
    filename: "/virtual/ComponentWhitespace.svelte",
    source: dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <Translation>
        Boundary component {name}
      </Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "component extraction with surrounding whitespace",
        original:
          /<Translation>\n  Boundary component \{name\}\n<\/Translation>/,
        extracted: "Boundary component {name}",
      },
    ],
  },
  {
    name: "Svelte nested component and attribute contracts",
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
        generated: /<_Trans\b/,
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
          /(?<=<p>\{  )_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
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
          /(?<=<button title=\{)_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
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
  // Astro basics
  {
    name: "Astro expression contracts",
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
      <p>{label}</p>
    `,
    detections: [
      {
        contract: "boundary-preservation",
        name: "frontmatter prefix",
        original: "const label = ",
        generated: "const label = ",
        mapping: "range",
      },
      {
        contract: "transform-range",
        name: "frontmatter transform",
        original: "translate`Fixture frontmatter`",
        generated: /_i18n\._\([\s\S]*?message: "Fixture frontmatter"[\s\S]*?\)/,
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
          /(?<=<p class="keep">\{)_i18n\._\([\s\S]*?message: "Fixture markup"[\s\S]*?\)/,
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
          /(?<=<section class="outer"><p class="nested">\{)_i18n\._\([\s\S]*?message: "Fixture nested markup"[\s\S]*?\)/,
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
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper with brace",
        original: '<p class="keep">{',
        generated: '<p class="keep">{',
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close",
        original: /<\/p>(?=\n<section class="outer">)/,
        generated: /<\/p>(?=\n<section class="outer">)/,
      },
      {
        contract: "boundary-preservation",
        name: "kept wrapper close with brace",
        original: /\}(?=<\/p>\n<section class="outer">)/,
        generated: /\}(?=<\/p>\n<section class="outer">)/,
      },
      {
        contract: "boundary-preservation",
        name: "nested wrapper open",
        original: '<section class="outer"><p class="nested">{',
        generated: '<section class="outer"><p class="nested">{',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "nested wrapper close",
        original: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
        generated: /\}<\/p><\/section>(?=\n<p>\{label\}<\/p>)/,
        mapping: "range",
      },
    ],
  },
  {
    name: "Astro component boundary contracts",
    framework: "astro",
    filename: "/virtual/ComponentBoundary.astro",
    source: dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Translation>Boundary component {name}</Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "component extraction",
        original: /<Translation>Boundary component \{name\}<\/Translation>/,
        extracted: "Boundary component {name}",
      },
    ],
  },
  {
    name: "Astro whitespace component extract contracts",
    framework: "astro",
    filename: "/virtual/ComponentWhitespace.astro",
    source: dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Translation>
        Boundary component {name}
      </Translation>
    `,
    detections: [
      {
        contract: "extract-origin",
        name: "component extraction with surrounding whitespace",
        original:
          /<Translation>\n  Boundary component \{name\}\n<\/Translation>/,
        extracted: "Boundary component {name}",
      },
    ],
  },
  {
    name: "Astro nested component and attribute contracts",
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
        generated: /<_Trans\b/,
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
          /(?<=<p>\{  )_i18n\._\([\s\S]*?message: "Whitespace markup \{name\}"[\s\S]*?\)(?=  \}<\/p>)/,
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
          /(?<=<button title=\{)_i18n\._\([\s\S]*?message: "Button title \{name\}"[\s\S]*?\)(?=\}>Trigger<\/button>)/,
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
  // etc.
  {
    name: "Svelte complex derived contracts",
    framework: "svelte",
    filename: "/virtual/ComplexScenario.svelte",
    source: dedent`
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
    `,
    detections: [
      {
        contract: "transform-range",
        name: "derived loading branch transform",
        original: "$translate`Loading items...`",
        generated: /_i18n\._\([\s\S]*?message: "Loading items\.\.\."[\s\S]*?\)/,
      },
      {
        contract: "transform-range",
        name: "derived loaded branch transform",
        original: /\$translate\(msg`Loaded \$\{count\} items\.`\)/,
        generated:
          /(?<=\? _i18n\._\([\s\S]*?: )_i18n\._\([\s\S]*?message: "Loaded \{count\} items\."[\s\S]*?\)(?=,\n\s*\);\n<\/script>)/,
      },
      {
        contract: "boundary-preservation",
        name: "nested plural boundary",
        original:
          /<Translation>[\s\S]*?<Plural[\s\S]*?\/>[\s\S]*?<\/Translation>/,
        generated: /<_Trans\b[\s\S]*?\/>/,
      },
      {
        contract: "extract-origin",
        name: "nested plural extracted message",
        original: "<Translation>",
        extracted: /Before[\s\S]*After/,
      },
    ],
  },
  {
    name: "Astro complex nested component contracts",
    framework: "astro",
    filename: "/virtual/ComplexScenario.astro",
    source: dedent`
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
    `,
    detections: [
      {
        contract: "transform-range",
        name: "derived loading branch transform",
        original: "translate`Loading items...`",
        generated: /_i18n\._\([\s\S]*?message: "Loading items\.\.\."[\s\S]*?\)/,
      },
      {
        contract: "extract-origin",
        name: "derived loading branch extraction",
        original: "translate`Loading items...`",
        extracted: "Loading items...",
      },
      {
        contract: "transform-range",
        name: "derived loaded branch transform",
        original: /translate\(msg`Loaded \$\{count\} items\.`\)/,
        generated:
          /(?<=const status = loading\n\s*\? _i18n\._\([\s\S]*?: )_i18n\._\([\s\S]*?message: "Loaded \{count\} items\."[\s\S]*?\)(?=;\n---)/,
      },
      {
        contract: "boundary-preservation",
        name: "nested plural boundary",
        original:
          /<Translation>[\s\S]*?<Plural[\s\S]*?\/>[\s\S]*?<\/Translation>/,
        generated: /<_Trans\b[\s\S]*?\/>/,
      },
      {
        contract: "extract-origin",
        name: "nested plural extracted message",
        original: "<Translation>",
        extracted: /Before[\s\S]*After/,
      },
    ],
  },
  {
    name: "Svelte complex expression token contracts",
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
        generated: /scriptData(?=\.route\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script route start",
        original: /(?<=scriptData\.)route\.path \?\?/,
        generated: /(?<=scriptData\.)route\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script path start",
        original: /(?<=scriptData\.route\.)path \?\? ""/,
        generated: /(?<=scriptData\.route\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // babel does not create a single token for the nullish coalescing operator
        name: "complex script nullish start",
        original: /(?<=scriptData\.route\.path )\?\? ""/,
        generated: /(?<=scriptData\.route\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script empty string start",
        original: /(?<=scriptData\.route\.path \?\? )""/,
        generated: /(?<=scriptData\.route\.path \?\? )""/,
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
        generated: /<_Trans\b/,
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
        fails: true, // runtime component lowering does not preserve a standalone anchor for the nullish coalescing operator
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
    name: "Astro complex expression token contracts",
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
        generated: /scriptData(?=\.route\.path \?\? "")/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script route start",
        original: /(?<=scriptData\.)route\.path \?\?/,
        generated: /(?<=scriptData\.)route\.path \?\?/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script path start",
        original: /(?<=scriptData\.route\.)path \?\? ""/,
        generated: /(?<=scriptData\.route\.)path \?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        fails: true, // babel does not create a single token for the nullish coalescing operator
        name: "complex script nullish start",
        original: /(?<=scriptData\.route\.path )\?\? ""/,
        generated: /(?<=scriptData\.route\.path )\?\? ""/,
        mapping: "start",
      },
      {
        contract: "boundary-preservation",
        name: "complex script empty string start",
        original: /(?<=scriptData\.route\.path \?\? )""/,
        generated: /(?<=scriptData\.route\.path \?\? )""/,
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
        generated: /<_Trans\b/,
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
        fails: true, // runtime component lowering does not preserve a standalone anchor for the nullish coalescing operator
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
    name: "Svelte unicode contracts",
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
          /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
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
        generated: /} 後置き🍣<\/p>(?=\n<_Trans\b)/,
      },
      {
        contract: "boundary-preservation",
        name: "unicode component boundary",
        original: "<Translation>",
        generated: /<_Trans\b/,
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
    name: "Astro unicode contracts",
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
          /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
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
        generated: /} 後置き🍣<\/p>(?=\n<_Trans\b)/,
      },
      {
        contract: "boundary-preservation",
        name: "unicode component boundary",
        original: "<Translation>",
        generated: /<_Trans\b/,
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
    name: "Svelte unicode CRLF contracts",
    framework: "svelte",
    filename: "/virtual/UnicodeScenarioCrlf.svelte",
    source: dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "世界👨‍👩‍👧‍👦😀😃😄";
      </script>

      <p class="frame">前置き🎌 {$translate\`家族👨‍👩‍👧‍👦😀😃😄 \${name}\`} 後置き🍣</p>
      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `.replaceAll("\n", "\r\n"),
    detections: [
      {
        contract: "transform-range",
        name: "unicode crlf markup transform",
        original: "$translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`",
        generated:
          /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf wrapper open",
        original: '<p class="frame">前置き🎌 {',
        generated: '<p class="frame">前置き🎌 {',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf wrapper close",
        original: /} 後置き🍣<\/p>(?=\r\n<Translation>)/,
        generated: /} 後置き🍣<\/p>(?=\r\n<_Trans\b)/,
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf component boundary",
        original: "<Translation>",
        generated: /<_Trans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "unicode crlf component extraction",
        original:
          /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
  {
    name: "Astro unicode CRLF contracts",
    framework: "astro",
    filename: "/virtual/UnicodeScenarioCrlf.astro",
    source: dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "世界👨‍👩‍👧‍👦😀😃😄";
      ---

      <p class="frame">前置き🎌 {translate\`家族👨‍👩‍👧‍👦😀😃😄 \${name}\`} 後置き🍣</p>
      <Translation>ようこそ <strong>{name}</strong> さん🎉</Translation>
    `.replaceAll("\n", "\r\n"),
    detections: [
      {
        contract: "transform-range",
        name: "unicode crlf markup transform",
        original: "translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`",
        generated:
          /(?<=<p class="frame">前置き🎌 \{)_i18n\._\([\s\S]*?\)(?=\} 後置き🍣<\/p>)/,
      },
      {
        contract: "extract-origin",
        name: "unicode crlf markup extraction",
        original: "translate`家族👨‍👩‍👧‍👦😀😃😄 ${name}`",
        extracted: "家族👨‍👩‍👧‍👦😀😃😄 {name}",
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf wrapper open",
        original: '<p class="frame">前置き🎌 {',
        generated: '<p class="frame">前置き🎌 {',
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf wrapper close",
        original: /} 後置き🍣<\/p>(?=\r\n<Translation>)/,
        generated: /} 後置き🍣<\/p>(?=\r\n<_Trans\b)/,
        mapping: "range",
      },
      {
        contract: "boundary-preservation",
        name: "unicode crlf component boundary",
        original: "<Translation>",
        generated: /<_Trans\b/,
        mapping: "start",
      },
      {
        contract: "extract-origin",
        name: "unicode crlf component extraction",
        original:
          /<Translation>ようこそ <strong>\{name\}<\/strong> さん🎉<\/Translation>/,
        extracted: "ようこそ <0>{name}</0> さん🎉",
      },
    ],
  },
];

describe("lingui-analyzer roundtrip source map discipline", () => {
  describe.for(fixtures)("$name", async (fixture) => {
    const { detections, filename, framework, source } = fixture;

    const compute = async () => {
      const synthetic = buildSyntheticModuleForTest(framework, source, {
        sourceName: filename,
        syntheticName: filename.replace(/\.(astro|svelte)$/, ".synthetic.tsx"),
      });
      const transformed = transformSyntheticModule(synthetic);
      const reinserted = reinsertTransformedModule(
        source,
        synthetic,
        transformed,
        {
          sourceName: filename,
        },
      );
      const consumer = new TraceMap(reinserted.sourceMapJson ?? "");
      const messages = await extractMessagesFromSyntheticModule(
        filename,
        synthetic,
      );

      return { synthetic, reinserted, consumer, messages };
    };

    let computeResult: Awaited<ReturnType<typeof compute>>;
    beforeAll(async () => {
      computeResult = await compute();
    });

    test("should not leak synthetic sources", async () => {
      const { synthetic, reinserted } = computeResult;

      assertNoSyntheticSourceLeak(
        reinserted.sourceMapJson ?? "",
        synthetic.syntheticName,
      );

      assertNoSyntheticExtractionOrigins(
        computeResult.messages,
        synthetic.syntheticName,
      );
    });

    test.for(detections.filter(({ fails }) => !fails))(
      "should satisfy contract: $name",
      async (detection) => {
        const { reinserted, consumer, messages } = computeResult;

        if (detection.contract === "extract-origin") {
          assertExtractionOrigin(messages, source, detection, filename);
        } else {
          assertContractRangeMapping(
            consumer,
            reinserted.code,
            source,
            detection,
            filename,
          );
        }
      },
    );

    test.fails.for(detections.filter(({ fails }) => fails))(
      "should not satisfy contract: $name",
      async (detection) => {
        const { reinserted, consumer, messages } = computeResult;

        if (detection.contract === "extract-origin") {
          assertExtractionOrigin(messages, source, detection, filename);
        } else {
          assertContractRangeMapping(
            consumer,
            reinserted.code,
            source,
            detection,
            filename,
          );
        }
      },
    );
  });
});

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
    detection.mapping === "start" ? detection.mapping : "both",
    expect,
  );
}

function assertCharacterMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Extract<
    Detection,
    { contract: "transform-range" | "boundary-preservation" }
  >,
  filename: string,
): void {
  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);

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
