import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import {
  collectRelativeAstroImports,
  createAstroFacadeModule,
  rewriteAstroImports,
} from "./astro.ts";

describe("rewriteAstroImports", () => {
  it("rewrites import and export specifiers inside astro frontmatter", () => {
    const source = dedent`
      ---
      import { helper } from "../component-utils.ts";
      export { helper as exportedHelper } from "../component-utils.ts";
      ---

      <p>Hello</p>
    `;

    const result = rewriteAstroImports(
      source,
      "/virtual/RuntimeTrans.astro",
      (specifier) =>
        specifier === "../component-utils.ts" ? "../component-utils.mjs" : null,
    );

    expect(result.changed).toBe(true);
    expect(result.code).toMatchInlineSnapshot(`
      "---
      import { helper } from "../component-utils.mjs";
      export { helper as exportedHelper } from "../component-utils.mjs";
      ---

      <p>Hello</p>"
    `);
  });
});

describe("collectRelativeAstroImports", () => {
  it("collects direct relative astro imports from frontmatter", () => {
    const source = dedent`
      ---
      import RuntimeTrans from "./RuntimeTrans.astro";
      export { default as RenderTransNode } from "./RenderTransNode.astro";
      ---

      <slot />
    `;

    expect(
      collectRelativeAstroImports(
        source,
        "/virtual/runtime/RenderTransNodes.astro",
      ),
    ).toEqual(["./RuntimeTrans.astro", "./RenderTransNode.astro"]);
  });
});

describe("createAstroFacadeModule", () => {
  it("rewrites non-astro relative imports through a single companion module", () => {
    const source = dedent`
      ---
      import type { MessageDescriptor } from "@lingui/core";
      import { getLinguiContext } from "./index.ts";
      import RenderTransNodes from "./RenderTransNodes.astro";
      import { translateRuntimeTrans } from "./helpers.ts";
      ---

      <RenderTransNodes />
    `;

    const result = createAstroFacadeModule(
      source,
      "/virtual/runtime/RuntimeTrans.astro",
      "runtime/RuntimeTrans.astro",
    );

    expect(result.assetFileName).toBe("runtime/RuntimeTrans.astro");
    expect(result.facadeFileName).toBe(
      "runtime/RuntimeTrans.astro.imports.mjs",
    );
    expect(result.rewrittenCode).toMatchInlineSnapshot(`
      "---
      import type { MessageDescriptor } from "@lingui/core";
      import { __unplugin_markup_import_0 as getLinguiContext } from "./RuntimeTrans.astro.imports.mjs";
      import RenderTransNodes from "./RenderTransNodes.astro";
      import { __unplugin_markup_import_1 as translateRuntimeTrans } from "./RuntimeTrans.astro.imports.mjs";
      ---

      <RenderTransNodes />"
    `);
    expect(result.facadeCode).toMatchInlineSnapshot(`
    	"export { getLinguiContext as __unplugin_markup_import_0 } from "/virtual/runtime/index.ts";
    	export { translateRuntimeTrans as __unplugin_markup_import_1 } from "/virtual/runtime/helpers.ts";
    	"
    `);
  });
});
