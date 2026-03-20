import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import {
  collectRelativeSvelteImports,
  createSvelteFacadeModule,
  rewriteSvelteImports,
} from "./svelte.ts";

describe("rewriteSvelteImports", () => {
  it("rewrites import and export specifiers inside both svelte script blocks", () => {
    const source = dedent`
      <script lang="ts">
        import { helper } from "../component-utils.ts";
        export { helper as exportedHelper } from "../component-utils.ts";
      </script>

      <script module>
        export * from "../component-utils.ts";
      </script>
    `;

    const result = rewriteSvelteImports(
      source,
      "/virtual/RuntimeTrans.svelte",
      (specifier) =>
        specifier === "../component-utils.ts" ? "../component-utils.mjs" : null,
    );

    expect(result.changed).toBe(true);
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { helper } from "../component-utils.mjs";
    	  export { helper as exportedHelper } from "../component-utils.mjs";
    	</script>

    	<script module>
    	  export * from "../component-utils.mjs";
    	</script>"
    `);
  });

  it("leaves svelte files untouched when the rewrite callback returns null", () => {
    const source = dedent`
      <script>
        import helper from "./helper.js";
      </script>
    `;

    const result = rewriteSvelteImports(
      source,
      "/virtual/RenderTransNodes.svelte",
      () => null,
    );

    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });
});

describe("collectRelativeSvelteImports", () => {
  it("collects direct relative svelte imports from both script blocks", () => {
    const source = dedent`
      <script>
        import Child from "./Child.svelte";
      </script>

      <script module>
        export { default as Header } from "./Header.svelte";
      </script>
    `;

    expect(
      collectRelativeSvelteImports(source, "/virtual/runtime/Parent.svelte"),
    ).toEqual(["./Child.svelte", "./Header.svelte"]);
  });
});

describe("createSvelteFacadeModule", () => {
  it("rewrites every non-self import through a single companion module", () => {
    const source = dedent`
      <script lang="ts">
        import type { MessageDescriptor } from "@lingui/core";
        import { getLinguiContext } from "../core/context.ts";
        import RenderTransNodes from "./RenderTransNodes.svelte";
        import {
          formatRichTextTranslation,
          type TransComponentMap,
        } from "./rich-text.ts";
      </script>
    `;

    const result = createSvelteFacadeModule(
      source,
      "/virtual/runtime/trans/RuntimeTrans.svelte",
      "runtime/trans/RuntimeTrans.svelte",
    );

    expect(result.assetFileName).toBe("runtime/trans/RuntimeTrans.svelte");
    expect(result.facadeFileName).toBe(
      "runtime/trans/RuntimeTrans.svelte.imports.mjs",
    );
    expect(result.rewrittenCode).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import type { __unplugin_markup_import_0 as MessageDescriptor } from "./RuntimeTrans.svelte.imports.mjs";
    	  import { __unplugin_markup_import_1 as getLinguiContext } from "./RuntimeTrans.svelte.imports.mjs";
    	  import { __unplugin_markup_import_2 as RenderTransNodes } from "./RuntimeTrans.svelte.imports.mjs";
    	  import { __unplugin_markup_import_3 as formatRichTextTranslation, type __unplugin_markup_import_4 as TransComponentMap } from "./RuntimeTrans.svelte.imports.mjs";
    	</script>"
    `);
    expect(result.facadeCode).toMatchInlineSnapshot(`
    	"export type { MessageDescriptor as __unplugin_markup_import_0 } from "@lingui/core";
    	export { getLinguiContext as __unplugin_markup_import_1 } from "/virtual/runtime/core/context.ts";
    	export { default as __unplugin_markup_import_2 } from "/virtual/runtime/trans/RenderTransNodes.svelte";
    	export { formatRichTextTranslation as __unplugin_markup_import_3 } from "/virtual/runtime/trans/rich-text.ts";
    	export type { TransComponentMap as __unplugin_markup_import_4 } from "/virtual/runtime/trans/rich-text.ts";
    	"
    `);
  });

  it("supports temp-source-relative facade specifiers", () => {
    const source = dedent`
      <script lang="ts">
        import { getLinguiContext } from "../core/context.ts";
      </script>
    `;

    const result = createSvelteFacadeModule(
      source,
      "/virtual/runtime/trans/RuntimeTrans.svelte",
      "runtime/trans/RuntimeTrans.svelte",
      (_specifier, context) => `TEMP:${context.resolvedSource}`,
    );

    expect(result.facadeCode).toBe(
      'export { getLinguiContext as __unplugin_markup_import_0 } from "TEMP:/virtual/runtime/core/context.ts";\n',
    );
  });

  it("keeps self-only import graphs untouched", () => {
    const source = dedent`
      <script>
        import OnlySvelte from "./OnlySvelte.svelte";
      </script>
    `;

    const result = createSvelteFacadeModule(
      source,
      "/virtual/runtime/trans/OnlySvelte.svelte",
      "runtime/trans/OnlySvelte.svelte",
    );

    expect(result.facadeCode).toBeNull();
    expect(result.rewrittenCode).toBe(source);
  });

  it("keeps type-only exports in the companion source", () => {
    const source = dedent`
      <script lang="ts">
        import type { TransComponentMap, TransRenderNode } from "./rich-text.ts";
      </script>
    `;

    const result = createSvelteFacadeModule(
      source,
      "/virtual/runtime/trans/RenderTransNodes.svelte",
      "runtime/trans/RenderTransNodes.svelte",
    );

    expect(result.rewrittenCode).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import type { __unplugin_markup_import_0 as TransComponentMap, __unplugin_markup_import_1 as TransRenderNode } from "./RenderTransNodes.svelte.imports.mjs";
    	</script>"
    `);
    expect(result.facadeCode).toMatchInlineSnapshot(`
    	"export type { TransComponentMap as __unplugin_markup_import_0 } from "/virtual/runtime/trans/rich-text.ts";
    	export type { TransRenderNode as __unplugin_markup_import_1 } from "/virtual/runtime/trans/rich-text.ts";
    	"
    `);
  });
});
