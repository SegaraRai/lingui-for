import { describe, expect, test } from "vite-plus/test";

import {
  RUNTIME_BINDING_I18N,
  RUNTIME_BINDING_RUNTIME_TRANS,
} from "../shared/constants.ts";
import { lowerComponentMacro } from "./component-macro.ts";

describe("lower/component-macro", () => {
  test("lowers component macros for compile and extract", () => {
    const source = '<Trans>Read the <a href="/docs">docs</a>.</Trans>';

    const runtimeBindings = {
      i18n: RUNTIME_BINDING_I18N,
      runtimeTrans: RUNTIME_BINDING_RUNTIME_TRANS,
    };
    const sourceMapOptions = { fullSource: source, sourceStart: 0 };
    const compileLowered = lowerComponentMacro(
      source,
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
      { extract: false, runtimeBindings, sourceMapOptions },
    );
    const extractLowered = lowerComponentMacro(
      source,
      new Map([["Trans", "Trans"]]),
      { filename: "/virtual/Page.astro" },
      { extract: true, runtimeBindings, sourceMapOptions },
    );

    expect(compileLowered.code).toContain("<L4aRuntimeTrans");
    expect(extractLowered.code).toContain("RuntimeTrans as _Trans");
    expect(extractLowered.code).toContain("/*i18n*/");
  });
});
