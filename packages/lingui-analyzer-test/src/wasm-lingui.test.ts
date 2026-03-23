import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
  reinsertTransformedModule,
  transformSyntheticModule,
} from "./wasm-lingui.ts";

describe("lingui-analyzer wasm contract", () => {
  test("connects Svelte source to Lingui transform through Rust wasm", () => {
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate\`Script hello\`;
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

  test("preserves Svelte extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/App.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate\`Script origin\`;
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
        import { Trans as Translation } from "@lingui/react/macro";
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
      import { Trans as Translation } from "@lingui/react/macro";
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
        import { Trans as Translation } from "@lingui/react/macro";
        const name = "Ada";
      </script>

      <Translation>Component origin {name}</Translation>
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
    ).toEqual([filename, 6, 13]);
  });

  test("preserves Astro component extraction origins through Rust sourcemaps", async () => {
    const filename = "/virtual/Component.astro";
    const source = dedent`
      ---
      import { Trans as Translation } from "@lingui/react/macro";
      const name = "Ada";
      ---

      <Translation>Component origin {name}</Translation>
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
    ).toEqual([filename, 6, 13]);
  });

  test("reinjects transformed Svelte expressions back into markup with sourcemaps", () => {
    const filename = "/virtual/Roundtrip.svelte";
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "@lingui/core/macro";
        const label = translate\`Script hello\`;
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
      transformed.declarations,
      {
        sourceName: filename,
      },
    );

    expect(reinserted.code).toContain("const label = _i18n._(");
    expect(reinserted.code).toContain("<p>{_i18n._(");

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.source_map_json ?? "",
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
      transformed.declarations,
      {
        sourceName: filename,
      },
    );

    expect(reinserted.code).toContain("const label = _i18n._(");
    expect(reinserted.code).toContain("<p>{_i18n._(");

    const origins = collectOriginalPositionsForNeedle(
      reinserted.code,
      reinserted.source_map_json ?? "",
      "_i18n._(",
    );
    expect(origins).toEqual([
      [filename, 3, 14],
      [filename, 6, 4],
    ]);
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
