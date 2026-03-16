import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { transformMdxSource } from "./transform.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

describe("transformMdxSource", () => {
  it("lowers rendered function and component macros from MDX source", async () => {
    const source = dedent`
      import { msg, t, Trans } from "lingui-for-astro/macro";

      export const descriptor = msg\`Shared descriptor from MDX ESM.\`;

      # {t\`MDX headline\`}

      <p>{t(descriptor)}</p>

      <Trans>Read the <a href="/docs">docs</a>.</Trans>
    `;

    const result = await transformMdxSource(source, {
      filename: "/virtual/Page.mdx",
    });
    const code = compact(result.code);

    expect(code).toContain('from "lingui-for-astro/runtime"');
    expect(code).not.toContain('from "lingui-for-astro/macro"');
    expect(code).not.toContain('from "@lingui/core"');
    expect(code).toContain(
      "import { getMdxLinguiContext as __l4a_getLinguiContext }",
    );
    expect(code).toContain("export const descriptor = /*i18n*/ { id:");
    expect(code).toContain(
      '# {__l4a_getLinguiContext(props).i18n._({id:"/WyHQL",message:"MDX headline"})}',
    );
    expect(code).toContain(
      "<p>{__l4a_getLinguiContext(props).i18n._(descriptor)}</p>",
    );
    expect(code).toContain('message:"Read the <0>docs</0>."');
    expect(code).toContain("components:{");
    expect(code).toContain('kind:"element"');
    expect(code).toContain('tag:"a"');
  });

  it("supports translating function macros inside JSX attributes", async () => {
    const source = dedent`
      import { t, Trans } from "lingui-for-astro/macro";

      <a title={t\`Tooltip\`} aria-label={t\`Aria label\`} href="/docs">
        {t\`Docs label\`}
      </a>

      <Trans>
        Read the <a title={t\`Rich tooltip\`} href="/docs">docs</a>.
      </Trans>
    `;

    const result = await transformMdxSource(source, {
      filename: "/virtual/Page.mdx",
    });
    const code = compact(result.code);

    expect(code).toContain(
      '<a title={__l4a_getLinguiContext(props).i18n._({id:"',
    );
    expect(code).toContain('message:"Tooltip"');
    expect(code).toContain(
      'aria-label={__l4a_getLinguiContext(props).i18n._({id:"',
    );
    expect(code).toContain('message:"Aria label"');
    expect(code).toContain('{__l4a_getLinguiContext(props).i18n._({id:"');
    expect(code).toContain('message:"Docs label"');
    expect(code).toContain('message:"Read the <0>docs</0>."');
    expect(code).toContain('title:__l4a_getLinguiContext(props).i18n._({id:"');
    expect(code).toContain('message:"Rich tooltip"');
  });

  it("supports function and component macros inside lists and HTML tag children", async () => {
    const source = dedent`
      import { msg, t, Trans } from "lingui-for-astro/macro";

      export const descriptor = msg\`Descriptor in a list item.\`;

      - {t\`Bullet translation\`}
      - {t(descriptor)}
      - <Trans>Read the <a href="/docs">docs</a> from a list item.</Trans>

      <aside>
        {t\`Translated HTML tag child\`}
      </aside>
    `;

    const result = await transformMdxSource(source, {
      filename: "/virtual/ListAndHtml.mdx",
    });
    const code = compact(result.code);

    expect(code).toContain("- {__l4a_getLinguiContext(props).i18n._({id:");
    expect(code).toContain('message:"Bullet translation"');
    expect(code).toContain(
      "- {__l4a_getLinguiContext(props).i18n._(descriptor)}",
    );
    expect(code).toContain('- <L4aMdxRuntimeTrans {...{id:"');
    expect(code).toContain('message:"Read the <0>docs</0> from a list item."');
    expect(code).toContain(
      "<aside> {__l4a_getLinguiContext(props).i18n._({id:",
    );
    expect(code).toContain('message:"Translated HTML tag child"');
  });

  it("supports root-level component macros", async () => {
    const source = dedent`
      import {
        Plural,
        Select,
        SelectOrdinal,
        Trans,
      } from "lingui-for-astro/macro";

      <Trans>Root <strong>rich text</strong> message.</Trans>
      <Plural value={2} one="# root item" other="# root items" />
      <Select
        value="excited"
        _calm="Root calm."
        _excited="Root excited."
        other="Root other."
      />
      <SelectOrdinal
        value={2}
        one="Root #st."
        two="Root #nd."
        few="Root #rd."
        other="Root #th."
      />
    `;

    const result = await transformMdxSource(source, {
      filename: "/virtual/RootMacros.mdx",
    });
    const code = compact(result.code);

    expect(code).toContain('<L4aMdxRuntimeTrans {...{id:"');
    expect(code).toContain('message:"Root <0>rich text</0> message."');
    expect(code).toContain(
      'message:"{0, plural, one {# root item} other {# root items}}"',
    );
    expect(code).toContain(
      'message:"{0, select, calm {Root calm.} excited {Root excited.} other {Root other.}}"',
    );
    expect(code).toContain(
      'message:"{0, selectordinal, one {Root #st.} two {Root #nd.} few {Root #rd.} other {Root #th.}}"',
    );
  });

  it("supports nested component macros inside lists and HTML tags", async () => {
    const source = dedent`
      import {
        Plural,
        Select,
        SelectOrdinal,
        Trans,
      } from "lingui-for-astro/macro";

      - <Trans>List <a href="/docs">link</a> item.</Trans>
      - <Plural value={2} one="# nested item" other="# nested items" />

      <aside>
        <Select
          value="excited"
          _calm="Nested calm."
          _excited="Nested excited."
          other="Nested other."
        />
        <SelectOrdinal
          value={2}
          one="Nested #st."
          two="Nested #nd."
          few="Nested #rd."
          other="Nested #th."
        />
      </aside>
    `;

    const result = await transformMdxSource(source, {
      filename: "/virtual/NestedMacros.mdx",
    });
    const code = compact(result.code);

    expect(code).toContain('- <L4aMdxRuntimeTrans {...{id:"');
    expect(code).toContain('message:"List <0>link</0> item."');
    expect(code).toContain(
      'message:"{0, plural, one {# nested item} other {# nested items}}"',
    );
    expect(code).toContain('<aside> <L4aMdxRuntimeTrans {...{id:"');
    expect(code).toContain(
      'message:"{0, select, calm {Nested calm.} excited {Nested excited.} other {Nested other.}}"',
    );
    expect(code).toContain(
      'message:"{0, selectordinal, one {Nested #st.} two {Nested #nd.} few {Nested #rd.} other {Nested #th.}}"',
    );
  });

  it("rejects top-level translating macros in MDX ESM", async () => {
    const source = dedent`
      import { t } from "lingui-for-astro/macro";

      export const heading = t\`Top-level heading\`;

      {heading}
    `;

    await expect(
      transformMdxSource(source, {
        filename: "/virtual/Page.mdx",
      }),
    ).rejects.toThrow("outside rendered JSX content");
  });
});
