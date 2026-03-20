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
    expect(code).toContain("<L4aRuntimeTrans {.../*i18n*/ {");
    expect(code).not.toContain("<LocalTrans");
    expect(code).toContain('message: "Read the <0>docs</0>, {name}."');
    expect(code).toContain('kind: "element"');
    expect(code).toContain('tag: "a"');
    expect(code).toContain('href: "/docs"');
  });

  it("supports exact-number ICU branches in core and component macros", () => {
    const source = dedent`
      ---
      import {
        Plural,
        plural,
        SelectOrdinal,
        selectOrdinal,
      } from "lingui-for-astro/macro";

      const count = 2;
      const rank = 1;
      ---

      <p>{plural(count, {
        0: "no queued builds",
        2: "exactly two queued builds",
        other: "# queued builds",
      })}</p>
      <p>{selectOrdinal(rank, {
        1: "take the shortcut",
        2: "take the scenic route",
        other: "finish in #th place",
      })}</p>
      <Plural
        value={count}
        _0="no queued builds"
        _2="exactly two queued builds"
        other="# queued builds"
      />
      <SelectOrdinal
        value={rank}
        _1="take the shortcut"
        _2="take the scenic route"
        other="finish in #th place"
      />
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain("=0 {no queued builds}");
    expect(code).toContain("=2 {exactly two queued builds}");
    expect(code).toContain("=1 {take the shortcut}");
    expect(code).toContain("=2 {take the scenic route}");
  });

  it("handles deeply nested core and component macro shapes", () => {
    const source = dedent`
      ---
      import {
        Plural,
        plural,
        select,
        selectOrdinal,
        t,
      } from "lingui-for-astro/macro";

      const count = 0;
      const rank = 1;
      const role = "admin";
      const deepCore = t({
        message: plural(count, {
          0: selectOrdinal(rank, {
            1: select(role, {
              admin: "core zero first admin",
              other: "core zero first other",
            }),
            2: select(role, {
              admin: "core zero second admin",
              other: "core zero second other",
            }),
            other: select(role, {
              admin: "core zero later admin",
              other: "core zero later other",
            }),
          }),
          2: selectOrdinal(rank, {
            1: select(role, {
              admin: "core two first admin",
              other: "core two first other",
            }),
            2: select(role, {
              admin: "core two second admin",
              other: "core two second other",
            }),
            other: select(role, {
              admin: "core two later admin",
              other: "core two later other",
            }),
          }),
          other: selectOrdinal(rank, {
            1: select(role, {
              admin: "core many first admin",
              other: "core many first other",
            }),
            2: select(role, {
              admin: "core many second admin",
              other: "core many second other",
            }),
            other: select(role, {
              admin: "core many later admin",
              other: "core many later other",
            }),
          }),
        }),
      });
      ---

      <p>{deepCore}</p>
      <Plural
        value={count}
        _0={selectOrdinal(rank, {
          1: select(role, {
            admin: "component zero first admin",
            other: "component zero first other",
          }),
          2: select(role, {
            admin: "component zero second admin",
            other: "component zero second other",
          }),
          other: select(role, {
            admin: "component zero later admin",
            other: "component zero later other",
          }),
        })}
        _2={selectOrdinal(rank, {
          1: select(role, {
            admin: "component two first admin",
            other: "component two first other",
          }),
          2: select(role, {
            admin: "component two second admin",
            other: "component two second other",
          }),
          other: select(role, {
            admin: "component two later admin",
            other: "component two later other",
          }),
        })}
        other={selectOrdinal(rank, {
          1: select(role, {
            admin: "component many first admin",
            other: "component many first other",
          }),
          2: select(role, {
            admin: "component many second admin",
            other: "component many second other",
          }),
          other: select(role, {
            admin: "component many later admin",
            other: "component many later other",
          }),
        })}
      />
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      'message: "{count, plural, =0 {{rank, selectordinal, =1 {{role, select, admin {core zero first admin} other {core zero first other}}}',
    );
    expect(code).toContain("core many later admin");
    expect(code).toContain(
      'message: "{count, plural, =0 {{0}} =2 {{1}} other {{2}}}"',
    );
    expect(code).toContain(
      '0: __l4a_i18n._(/*i18n*/ { id: "SMt/JO", message: "{rank, selectordinal, =1 {{role, select, admin {component zero first admin} other {component zero first other}}}',
    );
    expect(code).toContain("component many later admin");
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
