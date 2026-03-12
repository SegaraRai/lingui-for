import { describe, expect, it } from "vitest";

import {
  createExtractionUnits,
  transformJavaScriptMacros,
  transformSvelte,
} from "./index.ts";

describe("transformJavaScriptMacros", () => {
  it("rewrites lingui-svelte macros through the official Lingui transform", () => {
    const result = transformJavaScriptMacros(
      'import { t } from "lingui-svelte/macro";\nconst label = t({ message: "Save" });\n',
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain('from "lingui-svelte/runtime"');
    expect(result?.code).toContain("._(");
    expect(result?.code).not.toContain('from "lingui-svelte/macro"');
  });

  it("rewrites tagged template literals through the official Lingui transform", () => {
    const result = transformJavaScriptMacros(
      'import { msg, t } from "lingui-svelte/macro";\nconst descriptor = msg`Tagged descriptor`;\nconst label = t`Tagged label`;\n',
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain('message: "Tagged descriptor"');
    expect(result?.code).toContain('message: "Tagged label"');
    expect(result?.code).toContain('from "lingui-svelte/runtime"');
  });

  it("returns null when no lingui-svelte macro import is present", () => {
    expect(
      transformJavaScriptMacros("const value = 1;", {
        filename: "/virtual/file.ts",
      }),
    ).toBeNull();
  });
});

describe("transformSvelte", () => {
  it("rewrites script and markup macros", () => {
    const source = String.raw`<script lang="ts">
  import { msg, t } from "lingui-svelte/macro";
  const heading = msg({ id: "demo.heading", message: "Hello" });
</script>

<h1>{t(heading)}</h1>`;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain(
      'import { i18n as _i18n } from "lingui-svelte/runtime";',
    );
    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("{_i18n._(heading)}");
    expect(result.code).not.toContain('from "lingui-svelte/macro"');
  });

  it("rewrites tagged template literals in script and markup expressions", () => {
    const source = [
      '<script lang="ts">',
      '  import { msg, t } from "lingui-svelte/macro";',
      "  const descriptor = msg`Tagged descriptor in script`;",
      "</script>",
      "",
      "<p>{t`Tagged literal in markup`}</p>",
      "<p>{descriptor.message}</p>",
    ].join("\n");

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain('message: "Tagged descriptor in script"');
    expect(result.code).toContain('message: "Tagged literal in markup"');
    expect(result.code).toContain('from "lingui-svelte/runtime"');
  });
});

describe("createExtractionUnits", () => {
  it("produces macro-transformed extraction code for svelte files", () => {
    const source = String.raw`<script lang="ts">
  import { t } from "lingui-svelte/macro";
</script>

<button>{t({ id: "demo.save", message: "Save" })}</button>`;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units.length).toBeGreaterThan(0);
    expect(units[0]?.code).toContain("demo.save");
    expect(units[0]?.code).toContain("i18n");
  });

  it("includes tagged template literals in extraction output", () => {
    const source = [
      '<script lang="ts">',
      '  import { msg, t } from "lingui-svelte/macro";',
      "  const descriptor = msg`Tagged extraction descriptor`;",
      "</script>",
      "",
      "<button>{t`Tagged extraction button`}</button>",
      "<p>{descriptor.message}</p>",
    ].join("\n");

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units.length).toBeGreaterThan(0);
    expect(units[0]?.code).toContain("Tagged extraction descriptor");
    expect(units[0]?.code).toContain("Tagged extraction button");
  });
});
