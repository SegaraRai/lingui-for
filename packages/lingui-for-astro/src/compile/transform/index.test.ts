import { TraceMap } from "@jridgewell/trace-mapping";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import type { RuntimeWarningOptions } from "@lingui-for/internal-lingui-analyzer-wasm";
import {
  assertRangeMapping,
  type Detection,
} from "@lingui-for/internal-shared-test-helpers";

import { transformAstro } from "./index.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

async function expectTransformed(
  source: string,
  options: {
    filename?: string;
    runtimeWarnings?: RuntimeWarningOptions;
    whitespace?: "jsx" | "auto" | "astro" | "svelte";
  } = {},
) {
  const result = await transformAstro(source, {
    filename: options.filename ?? "/virtual/App.astro",
    runtimeWarnings: options.runtimeWarnings,
    whitespace: options.whitespace,
  });
  expect.assert(result != null);
  return result;
}

describe("transformAstro", () => {
  test("rewrites frontmatter and template expressions through request-scoped i18n", async () => {
    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";

      const name = "Ada";
      const label = t\`Welcome\`;
      ---

      <p title={t\`Save\`}>{t\`Hello \${name}\`}</p>
      <span>{label}</span>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(result.code).toContain(
      '---\nimport { createLinguiAccessors as __l4a_createI18n } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain(
      'import { createLinguiAccessors as __l4a_createI18n } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain(
      "const __l4a_i18n = __l4a_createI18n(Astro.locals);",
    );
    expect(code).toContain("__l4a_i18n.prime();");
    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).toContain("const label = __l4a_i18n._(");
    expect(code).toContain("title={__l4a_i18n._(");
    expect(code).toContain("{__l4a_i18n._(");
    expect(code).toContain('message: "Hello {name}"');
  });

  test("lowers component macros to the RuntimeTrans Astro component", async () => {
    const source = dedent`
      ---
      import { Trans as LocalTrans } from "lingui-for-astro/macro";

      const name = "Ada";
      ---

      <LocalTrans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</LocalTrans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain(
      '<L4aRuntimeTrans placeholders={["0"]} {.../*i18n*/ {',
    );
    expect(code).not.toContain("<LocalTrans");
    expect(code).toContain('message: "Read the <0>docs</0>, {name}."');
    expect(code).toContain(
      '<fragment slot="component_0">{(children) => <a href="/docs"><Fragment set:html={children} /></a>}</fragment>',
    );
    expect(code).not.toContain("components: {");
  });

  test("supports set:html wrappers as translated html holes", async () => {
    const source = dedent`
      ---
      import { Trans as LocalTrans } from "lingui-for-astro/macro";
      const content = "<em>fallback</em>";
      ---

      <LocalTrans><article set:html={content}>Ignored child</article></LocalTrans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      '<fragment slot="component_0">{(children) => (children !== "" && console.warn(',
    );
    expect(code).toContain(
      "<article set:html={content}>Ignored child</article>",
    );
  });

  test("supports set:text wrappers as translated text holes", async () => {
    const source = dedent`
      ---
      import { Trans as LocalTrans } from "lingui-for-astro/macro";
      const content = "fallback";
      ---

      <LocalTrans><article set:text={content}>Ignored child</article></LocalTrans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      '<fragment slot="component_0">{(children) => (children !== "" && console.warn(',
    );
    expect(code).toContain(
      "<article set:text={content}>Ignored child</article>",
    );
  });

  test("supports disabling content-override runtime warnings", async () => {
    const source = dedent`
      ---
      import { Trans as LocalTrans } from "lingui-for-astro/macro";
      const content = "<em>fallback</em>";
      ---

      <LocalTrans><article set:html={content}>Ignored child</article></LocalTrans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
      runtimeWarnings: { transContentOverride: "off" },
    });
    const code = compact(result.code);

    expect(code).not.toContain("console.warn(");
    expect(code).toContain(
      '<fragment slot="component_0">{(children) => <article set:html={content}>Ignored child</article>}</fragment>',
    );
  });

  test("lowers nested TSX macros inside Trans children", async () => {
    const source = dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";
      ---

      <Trans>
        Before <em>{t\`inline emphasis\`}</em> after.
      </Trans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
    );
    expect(code).toContain("__l4a_i18n._(");
    expect(code).toContain("inline emphasis");
    expect(code).not.toContain("{t`inline emphasis`}");
  });

  test("keeps returned msg descriptors on the same line as the i18n marker", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { msg } from "lingui-for-astro/macro";

        function getMessage() {
          return msg\`No images found.\`;
        }
        ---
      `,
      { filename: "/virtual/Page.astro" },
    );

    expect(result.code).toContain("return /*i18n*/ {");
  });

  test("does not inject Astro i18n context for descriptor-only files", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { msg } from "lingui-for-astro/macro";

        const descriptor = msg\`No images found.\`;
        ---

        <p>{descriptor.message}</p>
      `,
      { filename: "/virtual/Page.astro" },
    );
    const code = compact(result.code);

    expect(code).not.toContain("createLinguiAccessors");
    expect(code).not.toContain("__l4a_i18n");
    expect(code).toContain("const descriptor = /*i18n*/ {");
  });

  test("only injects RuntimeTrans for component-only files", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans>Hello <strong>world</strong></Trans>
      `,
      { filename: "/virtual/Page.astro" },
    );
    const code = compact(result.code);

    expect(code).toContain(
      'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
    );
    expect(code).not.toContain("createLinguiAccessors");
    expect(code).not.toContain("__l4a_i18n");
  });

  test("primes the Astro i18n accessor after same-frontmatter context setup", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { setupI18n } from "@lingui/core";
        import { setLinguiContext } from "lingui-for-astro";
        import { t } from "lingui-for-astro/macro";

        const i18n = setupI18n({
          locale: "en",
          messages: { en: {} },
        });

        setLinguiContext(Astro.locals, i18n);
        const label = t\`Ready\`;
        ---

        <p>{label}</p>
      `,
      { filename: "/virtual/Page.astro" },
    );
    const code = compact(result.code);

    expect(code).toContain(
      "const __l4a_i18n = __l4a_createI18n(Astro.locals);",
    );
    expect(code).toContain("__l4a_i18n.prime();");
    expect(code.indexOf("setLinguiContext(Astro.locals, i18n);")).toBeLessThan(
      code.indexOf("__l4a_i18n.prime();"),
    );
  });

  test("defaults rich-text whitespace handling to framework-aware spacing", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans>
          <strong>Read</strong>
          <em>carefully</em>
        </Trans>
      `,
      { filename: "/virtual/Page.astro" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
  });

  test("supports opting rich-text whitespace handling back to jsx semantics", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans>
          <strong>Read</strong>
          <em>carefully</em>
        </Trans>
      `,
      { filename: "/virtual/Page.astro", whitespace: "jsx" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0><1>carefully</1>"',
    );
  });

  test('does not duplicate explicit {" "} rich-text spacing', async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans><strong>Read</strong> {" "} <em>carefully</em></Trans>
      `,
      { filename: "/virtual/Page.astro" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
    expect(compact(result.code)).not.toContain(
      'message: "<0>Read</0>  <1>carefully</1>"',
    );
  });

  test("treats escaped-whitespace string expressions as explicit spacing", async () => {
    const result = await expectTransformed(
      dedent`
        ---
        import { Trans } from "lingui-for-astro/macro";
        ---

        <Trans><strong>Read</strong> {"\\n"} <em>carefully</em></Trans>
      `,
      { filename: "/virtual/Page.astro" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
    expect(compact(result.code)).not.toContain(
      'message: "<0>Read</0>  <1>carefully</1>"',
    );
  });

  test("supports exact-number ICU branches in core and component macros", async () => {
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

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain("=0 {no queued builds}");
    expect(code).toContain("=2 {exactly two queued builds}");
    expect(code).toContain("=1 {take the shortcut}");
    expect(code).toContain("=2 {take the scenic route}");
  });

  test("handles deeply nested core and component macro shapes", async () => {
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

    const result = await expectTransformed(source, {
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
    expect(code).toMatch(
      /0:\s*__l4a_i18n\._\(\s*\/\*i18n\*\/\s*\{ id: "SMt\/JO", message: "\{rank, selectordinal, =1 \{\{role, select, admin \{component zero first admin\} other \{component zero first other\}\}\}/,
    );
    expect(code).toContain("component many later admin");
  });

  test("lowers callback-body macros inside mixed html interpolations", async () => {
    const source = dedent`
      ---
      import { msg, t as translate } from "lingui-for-astro/macro";

      const filteredQueue = queueItems;
      ---

      {
        filteredQueue.map((item) => {
          const nestedLabel =
            item.unread > 0
              ? translate(
                  msg\`\${item.owner} left \${String(item.comments)} comments while \${item.assignee} still has \${String(item.unread)} unread updates.\`,
                )
              : translate(
                  msg\`\${item.owner} left \${String(item.comments)} comments and the queue is fully read.\`,
                );

          return <p>{nestedLabel}</p>;
        })
      }
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });
    const code = compact(result.code);

    expect(code).toContain(
      "const nestedLabel = item.unread > 0 ? __l4a_i18n._(",
    );
    expect(code).toContain("still has");
    expect(code).toContain("fully read");
    expect(code).not.toContain("translate( msg`");
    expect(code).not.toContain("translate(msg`");
  });

  test("leaves same-name non-macro components untouched", async () => {
    const source = dedent`
      ---
      import Trans from "./Trans.astro";
      ---

      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = await transformAstro(source, {
      filename: "/virtual/Page.astro",
    });

    expect(result).toBeNull();
  });
});

describe("transformAstro edit discipline", () => {
  test("rewrites only macro-bearing regions and preserves untouched frontmatter and markup", async () => {
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

    const result = await expectTransformed(source, {
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

  test("keeps file-level metadata and maps transformed and preserved ranges back to the original astro file", async () => {
    const result = await expectTransformed(source, {
      filename: "/virtual/Page.astro",
    });

    const { code, map } = result;
    expect.assert(map != null);

    expect(map.file).toBe("/virtual/Page.astro");
    expect(map.sources).toEqual(["/virtual/Page.astro"]);
    expect(map.sourcesContent).toEqual([source]);

    const consumer = new TraceMap(JSON.stringify(map));
    detections.forEach((detection) => {
      assertRangeMapping(
        consumer,
        code,
        source,
        detection,
        "/virtual/Page.astro",
        "both",
        expect,
      );
    });
  });
});
