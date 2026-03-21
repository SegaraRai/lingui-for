import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import {
  collectModuleSpecifiers,
  collectRelativeImports,
  createMarkupFacadeModule,
  rewriteMarkupImports,
} from "./facade.ts";
import type { ScriptRange } from "./types.ts";

describe("rewriteMarkupImports", () => {
  test("rewrites generic import and export specifiers within provided script ranges", () => {
    const source = dedent`
      import { helper } from "./helpers.ts";
      export { helper as exportedHelper } from "./helpers.ts";
      export * from "./shared.ts";
    `;

    const result = rewriteMarkupImports(
      source,
      "/virtual/runtime/RuntimeTrans.svelte",
      ".svelte",
      collectWholeModuleScript,
      (specifier) =>
        specifier.startsWith(".") ? specifier.replace(/\.ts$/u, ".mjs") : null,
    );

    expect(result.changed).toBe(true);
    expect(result.code).toMatchInlineSnapshot(`
      "import { helper } from "./helpers.mjs";
      export { helper as exportedHelper } from "./helpers.mjs";
      export * from "./shared.mjs";"
    `);
  });
});

describe("collectModuleSpecifiers", () => {
  test("collects both relative-only and all module specifiers from generic script ranges", () => {
    const source = dedent`
      import { helper } from "./helpers.ts";
      import { runtime } from "@scope/runtime";
      export * from "./shared.ts";
    `;

    expect(
      collectRelativeImports(
        source,
        "/virtual/runtime/RuntimeTrans.svelte",
        collectWholeModuleScript,
      ),
    ).toEqual(["./helpers.ts", "./shared.ts"]);
    expect(
      collectModuleSpecifiers(
        source,
        "/virtual/runtime/RuntimeTrans.svelte",
        collectWholeModuleScript,
      ),
    ).toEqual(["./helpers.ts", "@scope/runtime", "./shared.ts"]);
  });
});

describe("createMarkupFacadeModule", () => {
  test("builds one companion module for every non-self import", () => {
    const source = dedent`
      import "./polyfill.ts";
      import DefaultThing from "./default.ts";
      import * as namespace from "./namespace.ts";
      import { helper, type HelperOptions } from "./helpers.ts";
      import View from "./View.svelte";
      import { runtime } from "@scope/runtime";
    `;

    const result = createMarkupFacadeModule(
      source,
      "/virtual/runtime/Entry.svelte",
      "runtime/Entry.svelte",
      ".svelte",
      collectWholeModuleScript,
    );

    expect(result.assetFileName).toBe("runtime/Entry.svelte");
    expect(result.facadeFileName).toBe("runtime/Entry.svelte.imports.mjs");
    expect(result.rewrittenCode).toMatchInlineSnapshot(`
      "import "./Entry.svelte.imports.mjs";
      import { __unplugin_markup_import_0 as DefaultThing } from "./Entry.svelte.imports.mjs";
      import { __unplugin_markup_import_1 as namespace } from "./Entry.svelte.imports.mjs";
      import { __unplugin_markup_import_2 as helper, type __unplugin_markup_import_3 as HelperOptions } from "./Entry.svelte.imports.mjs";
      import { __unplugin_markup_import_4 as View } from "./Entry.svelte.imports.mjs";
      import { __unplugin_markup_import_5 as runtime } from "./Entry.svelte.imports.mjs";"
    `);
    expect(result.facadeCode).toMatchInlineSnapshot(`
    	"import "/virtual/runtime/polyfill.ts";
    	export { default as __unplugin_markup_import_0 } from "/virtual/runtime/default.ts";
    	export * as __unplugin_markup_import_1 from "/virtual/runtime/namespace.ts";
    	export { helper as __unplugin_markup_import_2 } from "/virtual/runtime/helpers.ts";
    	export type { HelperOptions as __unplugin_markup_import_3 } from "/virtual/runtime/helpers.ts";
    	export { default as __unplugin_markup_import_4 } from "/virtual/runtime/View.svelte";
    	export { runtime as __unplugin_markup_import_5 } from "@scope/runtime";
    	"
    `);
  });

  test("keeps self imports direct", () => {
    const source = dedent`
      import Self from "./Entry.svelte";
    `;

    const result = createMarkupFacadeModule(
      source,
      "/virtual/runtime/Entry.svelte",
      "runtime/Entry.svelte",
      ".svelte",
      collectWholeModuleScript,
    );

    expect(result.facadeCode).toBeNull();
    expect(result.rewrittenCode).toBe(source);
  });

  test("keeps configured externalized imports direct", () => {
    const source = dedent`
      import { runtime } from "@scope/runtime";
      import View from "./View.svelte";
    `;

    const result = createMarkupFacadeModule(
      source,
      "/virtual/runtime/Entry.svelte",
      "runtime/Entry.svelte",
      ".svelte",
      collectWholeModuleScript,
      undefined,
      (specifier) => specifier === "@scope/runtime",
    );

    expect(result.rewrittenCode).toMatchInlineSnapshot(`
      "import { runtime } from "@scope/runtime";
      import { __unplugin_markup_import_0 as View } from "./Entry.svelte.imports.mjs";"
    `);
    expect(result.facadeCode).toBe(
      'export { default as __unplugin_markup_import_0 } from "/virtual/runtime/View.svelte";\n',
    );
  });
});

function collectWholeModuleScript(
  source: string,
  _filename: string,
): readonly ScriptRange[] {
  return [
    {
      content: source,
      contentStart: 0,
      kind: "instance",
      lang: "ts",
    },
  ];
}
