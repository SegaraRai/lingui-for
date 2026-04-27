import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./support/wasm-lingui.ts";

describe("lingui-analyzer wasm contract", () => {
  test("connects Svelte source to Lingui transform through Rust wasm", () => {
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate.eager\`Script hello\`;
        const name = "Ada";
      </script>

      <p>{$translate\`Markup hello \${name}\`}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source);
    const result = transformSyntheticModule(synthetic);

    expect(synthetic.source).toContain(
      'import { t as translate } from "@lingui/core/macro";',
    );
    expect(result.declarations.__lf_0).toContain("_i18n._(");
    expect(result.declarations.__lf_0).toContain('message: "Script hello"');
    expect(result.declarations.__lf_1).toContain("_i18n._(");
    expect(result.declarations.__lf_1).toContain(
      'message: "Markup hello {name}"',
    );
  });

  test("connects Astro source to Lingui transform through Rust wasm", () => {
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Frontmatter hello\`;
      ---

      <p>{translate\`Markup hello\`}</p>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source);
    const result = transformSyntheticModule(synthetic);

    expect(result.declarations.__lf_0).toContain("_i18n._(");
    expect(result.declarations.__lf_0).toContain(
      'message: "Frontmatter hello"',
    );
    expect(result.declarations.__lf_1).toContain("_i18n._(");
    expect(result.declarations.__lf_1).toContain('message: "Markup hello"');
  });

  test("ignores Astro comment-only html interpolations during extraction", async () => {
    const filename = "/virtual/CommentOnlyInterpolation.astro";
    const source = dedent`
        ---
        import { t as translate } from "@lingui/core/macro";
        ---

        {translate\`Before comment\`}
        {/* This is just a code comment */}
        {
          /* This comment shares the interpolation with an expression. */
          translate\`After comment\`
        }
        {undefined /* This comment follows an expression. */}
        {<!-- This is an HTML comment -->}
        {<!-- This is an HTML comment --><span>{translate\`Inside commented fragment\`}</span>}
        {<><span>{translate\`Fragment first\`}</span><span>{translate\`Fragment second\`}</span></>}
        {<><!-- This is an HTML comment --><span>{translate\`Fragment after comment\`}</span></>}
        {<span>{translate\`Adjacent first\`}</span><span>{translate\`Adjacent second\`}</span>}
        {condition ? <!-- This is an HTML comment --> : <span>{translate\`Fallback comment\`}</span>}
      `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/CommentOnlyInterpolation.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    expect(messages.map((message) => message.message)).toEqual([
      "Before comment",
      "After comment",
      "Inside commented fragment",
      "Fragment first",
      "Fragment second",
      "Fragment after comment",
      "Adjacent first",
      "Adjacent second",
      "Fallback comment",
    ]);
  });

  test("preserves Svelte extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/App.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate.eager\`Script origin\`;
      </script>

      <p>{$translate\`Markup origin\`}</p>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/App.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    expect(
      messages.find((message) => message.message === "Script origin")?.origin,
    ).toEqual([filename, 3, 16]);
    expect(
      messages.find((message) => message.message === "Markup origin")?.origin,
    ).toEqual([filename, 6, 5]);
  });

  test("preserves Astro extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/Page.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Frontmatter origin\`;
      ---

      <p>{translate\`Markup origin\`}</p>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Page.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    expect(
      messages.find((message) => message.message === "Frontmatter origin")
        ?.origin,
    ).toEqual([filename, 3, 14]);
    expect(
      messages.find((message) => message.message === "Markup origin")?.origin,
    ).toEqual([filename, 6, 4]);
  });

  test("connects Svelte component macros to Lingui transform through Rust wasm", () => {
    const source = dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <Translation>Component hello {name}</Translation>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source);
    const result = transformSyntheticModule(synthetic);

    expect(result.declarations.__lf_0).toContain("message:");
    expect(result.declarations.__lf_0).toContain("id:");
    expect(result.declarations.__lf_0).toContain('"Component hello {name}"');
  });

  test("connects Astro component macros to Lingui transform through Rust wasm", () => {
    const source = dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Translation>Astro component {name}</Translation>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source);
    const result = transformSyntheticModule(synthetic);

    expect(result.declarations.__lf_0).toContain("message:");
    expect(result.declarations.__lf_0).toContain("id:");
    expect(result.declarations.__lf_0).toContain('"Astro component {name}"');
  });

  test("preserves Svelte component extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/Component.svelte";
    const source = dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <p><Translation>Component origin {name}</Translation></p>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Component.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    expect(
      messages.find((message) => message.message === "Component origin {name}")
        ?.origin,
    ).toEqual([filename, 6, 3]);
  });

  test("preserves Astro component extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/Component.astro";
    const source = dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <p><Translation>Component origin {name}</Translation></p>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Component.synthetic.tsx",
    });
    const messages = await extractMessagesFromSyntheticModule(
      filename,
      synthetic,
    );

    expect(
      messages.find((message) => message.message === "Component origin {name}")
        ?.origin,
    ).toEqual([filename, 6, 3]);
  });

  test("reinjects transformed Svelte expressions back into markup with sourcemaps", () => {
    const filename = "/virtual/Roundtrip.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate.eager\`Script hello\`;
        const name = "Ada";
      </script>

      <p>{$translate\`Markup hello \${name}\`}</p>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/Roundtrip.synthetic.tsx",
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

    expect(reinserted.code).toContain("const label = _i18n._(");
    expect(reinserted.code).toContain("<p>{_i18n._(");

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.sourceMapJson ?? "",
      "_i18n._(",
    );
    expect(origins).toEqual([
      [filename, 3, 16],
      [filename, 7, 4],
    ]);
  });

  test("reinjects transformed Astro expressions back into markup with sourcemaps", () => {
    const filename = "/virtual/Roundtrip.astro";
    const source = dedent`
      ---
      import { t as translate } from "@lingui/core/macro";
      const label = translate\`Frontmatter hello\`;
      ---

      <p>{translate\`Markup hello\`}</p>
      <p>{label}</p>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/Roundtrip.synthetic.tsx",
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

    expect(reinserted.code).toContain("const label = _i18n._(");
    expect(reinserted.code).toContain("<p>{_i18n._(");

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.sourceMapJson ?? "",
      "_i18n._(",
    );
    expect(origins).toEqual([
      [filename, 3, 14],
      [filename, 6, 4],
    ]);
  });

  test("reinjects transformed Svelte component macros back into markup with sourcemaps", () => {
    const filename = "/virtual/ComponentRoundtrip.svelte";
    const source = dedent`
      <script lang="ts">
        import { Trans as Translation } from "lingui-for-svelte/macro";
        const name = "Ada";
      </script>

      <Translation>Component hello {name}</Translation>
    `;

    const synthetic = buildSyntheticModuleForTest("svelte", source, {
      sourceName: filename,
      syntheticName: "/virtual/ComponentRoundtrip.synthetic.tsx",
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

    expect(reinserted.code).toContain("<_Trans");
    expect(reinserted.code).toContain('"Component hello {name}"');

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.sourceMapJson ?? "",
      "_Trans",
    );
    expect(origins).toEqual([[filename, 6, 0]]);
  });

  test("reinjects transformed Astro component macros back into markup with sourcemaps", () => {
    const filename = "/virtual/ComponentRoundtrip.astro";
    const source = dedent`
      ---
      import { Trans as Translation } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Translation>Component hello {name}</Translation>
    `;

    const synthetic = buildSyntheticModuleForTest("astro", source, {
      sourceName: filename,
      syntheticName: "/virtual/ComponentRoundtrip.synthetic.tsx",
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

    expect(reinserted.code).toContain("<_Trans");
    expect(reinserted.code).toContain('"Component hello {name}"');

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.sourceMapJson ?? "",
      "_Trans",
    );
    expect(origins).toEqual([[filename, 6, 0]]);
  });
});

function collectOriginalPositionsForNeedle(
  code: string,
  sourceMapJson: string,
  needle: string,
): Array<[string, number, number]> {
  const map = new TraceMap(sourceMapJson);
  return findOffsets(code, needle).map((offset) => {
    const generated = offsetToGeneratedPosition(code, offset);
    const original = originalPositionFor(map, generated);
    if (!original.source || original.line == null || original.column == null) {
      throw new Error(`Missing original position for ${needle} at ${offset}`);
    }
    return [original.source, original.line, original.column];
  });
}

function findOffsets(source: string, needle: string): number[] {
  const offsets: number[] = [];
  let searchStart = 0;
  while (searchStart < source.length) {
    const offset = source.indexOf(needle, searchStart);
    if (offset === -1) {
      break;
    }
    offsets.push(offset);
    searchStart = offset + needle.length;
  }
  return offsets;
}

function offsetToGeneratedPosition(
  source: string,
  offset: number,
): {
  line: number;
  column: number;
} {
  const bounded = Math.min(offset, source.length);
  const lineStart = source.slice(0, bounded).lastIndexOf("\n") + 1;
  const line = source.slice(0, bounded).split("\n").length;
  return {
    line,
    column: bounded - lineStart,
  };
}
