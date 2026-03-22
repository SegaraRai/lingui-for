import dedent from "dedent";
import { TraceMap } from "@jridgewell/trace-mapping";
import { describe, expect, test } from "vite-plus/test";

import {
  assertRangeMapping,
  type Detection,
} from "lingui-for-shared/test-helpers";

import { transformAstro } from "./transform-astro.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transformAstro", () => {
  test("rewrites frontmatter and template expressions through request-scoped i18n", () => {
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

    expect(result.code).toContain(
      '---\nimport { createFrontmatterI18n as __l4a_createI18n } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain(
      'import { createFrontmatterI18n as __l4a_createI18n } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain(
      "const __l4a_i18n = __l4a_createI18n(Astro.locals);",
    );
    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).toContain("const label = __l4a_i18n._(");
    expect(code).toContain("title={__l4a_i18n._(");
    expect(code).toContain("{__l4a_i18n._(");
    expect(code).toContain('message: "Hello {name}"');
  });

  test("lowers component macros to the RuntimeTrans Astro component", () => {
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

  test("supports exact-number ICU branches in core and component macros", () => {
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

  test("handles deeply nested core and component macro shapes", () => {
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

  test("leaves same-name non-macro components untouched", () => {
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

describe("transformAstro edit discipline", () => {
  test("rewrites only macro-bearing regions and preserves untouched frontmatter and markup", () => {
    const source = dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";

      const keepBefore = "before";
      // KEEP_FRONTMATTER_COMMENT
      const eagerLabel = t\`Mapped script message\`;
      const keepAfter = "after";
      ---

      <section data-keep="yes">
        <p>{keepBefore}</p>
        <p>{t\`Mapped template message\`}</p>
        <Trans>Mapped component message</Trans>
        <p>{keepAfter}</p>
      </section>
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });

    expect(result.code).toContain('const keepBefore = "before";');
    expect(result.code).toContain("// KEEP_FRONTMATTER_COMMENT");
    expect(result.code).toContain('const keepAfter = "after";');
    expect(result.code).toContain('<section data-keep="yes">');
    expect(result.code).toContain("<p>{keepBefore}</p>");
    expect(result.code).toContain("<p>{keepAfter}</p>");
    expect(result.code).toContain("Mapped script message");
    expect(result.code).toContain("Mapped template message");
    expect(result.code).toContain("Mapped component message");
  });
});

describe("transformAstro source map discipline", () => {
  const source = dedent`
    ---
    import { t, Trans } from "lingui-for-astro/macro";

    const keepBefore = "before";
    const label = t\`Mapped script message\`;
    const keepAfter = "after";
    ---

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p><strong>{t\`Mapped template message\`}</strong></p>
      <a href="/docs"><Trans>Mapped component message</Trans></a>
      <p>{keepAfter}</p>
      <p>{

        t\`Range check with surrounding whitespace\`

      }</p>
    </section>
  `;

  const detections: Detection[] = [
    {
      name: "frontmatter transform",
      original: "t`Mapped script message`",
      generated: /__l4a_i18n\._\([^)]+message: "Mapped script message"[^)]+\)/,
    },
    {
      name: "template transform",
      original: /t`Mapped template message`/,
      generated:
        /__l4a_i18n\._\([^)]+message: "Mapped template message"[^)]+\)/,
    },
    {
      name: "range check with surrounding whitespace",
      original: /t`Range check with surrounding whitespace`/,
      generated:
        /__l4a_i18n\._\([^)]+message: "Range check with surrounding whitespace"[^)]+\)/,
    },
    {
      name: "component transform",
      original: "<Trans>Mapped component message</Trans>",
      generated: /<L4aRuntimeTrans\b[\s\S]*?\/>/,
    },
    {
      name: "label binding is preserved",
      original: "const label = ",
      generated: "const label = ",
    },
    {
      name: "keepAfter binding is preserved",
      original: 'const keepAfter = "after";',
      generated: 'const keepAfter = "after";',
    },
    {
      name: "template opening wrapper is preserved",
      original: "<p><strong>{",
      generated: "<p><strong>{",
    },
    {
      name: "template closing wrapper is preserved",
      original: "}</strong></p>",
      generated: "}</strong></p>",
    },
    {
      name: "component opening wrapper is preserved",
      original: '<a href="/docs">',
      generated: '<a href="/docs">',
    },
    {
      name: "component closing wrapper is preserved",
      original: "</a>",
      generated: "</a>",
    },
  ];

  test("keeps file-level metadata and maps transformed and preserved ranges back to the original astro file", () => {
    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });
    const map = result.map!;

    expect(map.file).toBe("/virtual/Page.astro");
    expect(map.sources).toEqual(["/virtual/Page.astro"]);
    expect(map.sourcesContent).toEqual([source]);

    const consumer = new TraceMap(map);
    detections.forEach((detection) => {
      assertRangeMapping(
        consumer,
        result.code,
        source,
        detection,
        "/virtual/Page.astro",
        expect,
      );
    });
  });
});
