import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { transformAstro } from "./transform-astro.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transformAstro", () => {
  it("rewrites frontmatter and template expressions through request-scoped i18n", () => {
    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";

      const name = "Ada";
      const label = t\`Welcome\`;
      ---

      <p title={t\`Save\`}>{t\`Hello \${name}\`}</p>
      <span>{label}</span>
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      'import { getLinguiContext as __l4a_getLinguiContext } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain("const __l4a_ctx = __l4a_getLinguiContext(Astro);");
    expect(code).toContain("const __l4a_i18n = __l4a_ctx.i18n;");
    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).toContain("const label = __l4a_i18n._(");
    expect(code).toContain("title={__l4a_i18n._(");
    expect(code).toContain("{__l4a_i18n._(");
    expect(code).toContain('message: "Hello {name}"');
  });

  it("lowers component macros to the RuntimeTrans Astro component", () => {
    const source = dedent`
      ---
      import { Trans as LocalTrans } from "lingui-for-astro/macro";

      const name = "Ada";
      ---

      <LocalTrans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</LocalTrans>
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain("<L4aRuntimeTrans {...{");
    expect(code).not.toContain("<LocalTrans");
    expect(code).toContain('message: "Read the <0>docs</0>, {name}."');
    expect(code).toContain('kind: "element"');
    expect(code).toContain('tag: "a"');
    expect(code).toContain('href: "/docs"');
  });

  it("leaves same-name non-macro components untouched", () => {
    const source = dedent`
      ---
      import Trans from "./Trans.astro";
      ---

      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });

    expect(result.code.trim()).toBe(source.trim());
  });
});
