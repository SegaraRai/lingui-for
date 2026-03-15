import { describe, expect, it } from "vitest";

import {
  collectRelativeSvelteImports,
  createSvelteFacadeModule,
  rewriteSvelteImports,
} from "./svelte-module.ts";

describe("rewriteSvelteImports", () => {
  it("rewrites import and export specifiers inside both svelte script blocks", () => {
    const source = [
      '<script lang="ts">',
      '  import { helper } from "../component-utils.ts";',
      '  export { helper as exportedHelper } from "../component-utils.ts";',
      "</script>",
      "",
      "<script module>",
      '  export * from "../component-utils.ts";',
      "</script>",
    ].join("\n");

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
    const source = [
      "<script>",
      '  import helper from "./helper.js";',
      "</script>",
    ].join("\n");

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
    const source = [
      "<script>",
      '  import Child from "./Child.svelte";',
      "</script>",
      "",
      "<script module>",
      '  export { default as Header } from "./Header.svelte";',
      "</script>",
    ].join("\n");

    expect(
      collectRelativeSvelteImports(source, "/virtual/runtime/Parent.svelte"),
    ).toEqual(["./Child.svelte", "./Header.svelte"]);
  });
});

describe("createSvelteFacadeModule", () => {
  it("creates a rewritten svelte asset plus a matching virtual facade module", () => {
    const source = [
      '<script lang="ts">',
      '  import type { MessageDescriptor } from "@lingui/core";',
      '  import { getLinguiContext } from "../core/context.ts";',
      '  import RenderTransNodes from "./RenderTransNodes.svelte";',
      "  import {",
      "    formatRichTextTranslation,",
      "    type TransComponentMap,",
      '  } from "./rich-text.ts";',
      "  import {",
      "    mergeRuntimeTransValues,",
      "    toRuntimeTransDescriptor,",
      '  } from "./trans-descriptor.ts";',
      "</script>",
    ].join("\n");

    const result = createSvelteFacadeModule(
      source,
      "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/RuntimeTrans.svelte",
      "runtime/trans/RuntimeTrans.svelte",
    );

    expect(result.assetFileName).toBe("runtime/trans/RuntimeTrans.svelte");
    expect(result.facadeFileName).toBe(
      "runtime/trans/RuntimeTrans.svelte.imports.mjs",
    );
    expect(result.rewrittenCode).toMatchInlineSnapshot(`
      "<script lang="ts">
        import type { MessageDescriptor } from "@lingui/core";
        import { __unplugin_svelte_import_0 as getLinguiContext } from "./RuntimeTrans.svelte.imports.mjs";
        import RenderTransNodes from "./RenderTransNodes.svelte";
        import { __unplugin_svelte_import_1 as formatRichTextTranslation, type __unplugin_svelte_import_2 as TransComponentMap } from "./RuntimeTrans.svelte.imports.mjs";
        import { __unplugin_svelte_import_3 as mergeRuntimeTransValues, __unplugin_svelte_import_4 as toRuntimeTransDescriptor } from "./RuntimeTrans.svelte.imports.mjs";
      </script>"
    `);
    expect(result.facadeCode).toMatchInlineSnapshot(`
      "export { getLinguiContext as __unplugin_svelte_import_0 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/core/context.ts";
      export { formatRichTextTranslation as __unplugin_svelte_import_1 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/rich-text.ts";
      export { mergeRuntimeTransValues as __unplugin_svelte_import_3 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/trans-descriptor.ts";
      export { toRuntimeTransDescriptor as __unplugin_svelte_import_4 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/trans-descriptor.ts";"
    `);
    expect(result.facadeDtsFileName).toBe(
      "runtime/trans/RuntimeTrans.svelte.imports.d.mts",
    );
    expect(result.facadeDtsCode).toMatchInlineSnapshot(`
      "export { getLinguiContext as __unplugin_svelte_import_0 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/core/context.ts";
      export { formatRichTextTranslation as __unplugin_svelte_import_1 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/rich-text.ts";
      export type { TransComponentMap as __unplugin_svelte_import_2 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/rich-text.ts";
      export { mergeRuntimeTransValues as __unplugin_svelte_import_3 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/trans-descriptor.ts";
      export { toRuntimeTransDescriptor as __unplugin_svelte_import_4 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/trans-descriptor.ts";"
    `);
  });

  it("keeps svelte-only import graphs untouched", () => {
    const source = [
      "<script>",
      '  import RenderTransNodes from "./RenderTransNodes.svelte";',
      "</script>",
    ].join("\n");

    const result = createSvelteFacadeModule(
      source,
      "/virtual/runtime/trans/OnlySvelte.svelte",
      "runtime/trans/OnlySvelte.svelte",
    );

    expect(result.facadeCode).toBeNull();
    expect(result.facadeDtsCode).toBeNull();
    expect(result.rewrittenCode).toBe(source);
  });

  it("uses import type and still emits an empty js facade for type-only imports", () => {
    const source = [
      '<script lang="ts">',
      '  import type { TransComponentMap, TransRenderNode } from "./rich-text.ts";',
      "</script>",
    ].join("\n");

    const result = createSvelteFacadeModule(
      source,
      "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/RenderTransNodes.svelte",
      "runtime/trans/RenderTransNodes.svelte",
    );

    expect(result.rewrittenCode).toMatchInlineSnapshot(`
      "<script lang="ts">
        import type { __unplugin_svelte_import_0 as TransComponentMap, __unplugin_svelte_import_1 as TransRenderNode } from "./RenderTransNodes.svelte.imports.mjs";
      </script>"
    `);
    expect(result.facadeCode).toBe("export {};");
    expect(result.facadeDtsCode).toMatchInlineSnapshot(`
      "export type { TransComponentMap as __unplugin_svelte_import_0 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/rich-text.ts";
      export type { TransRenderNode as __unplugin_svelte_import_1 } from "C:/Workspace/lingui-svelte/packages/lingui-svelte/src/runtime/trans/rich-text.ts";"
    `);
  });
});
