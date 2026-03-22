import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  buildSyntheticModuleForTest,
  extractMessagesFromSyntheticModule,
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

    const synthetic = buildSyntheticModuleForTest("svelte", source);
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

    const synthetic = buildSyntheticModuleForTest("astro", source);
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
});
