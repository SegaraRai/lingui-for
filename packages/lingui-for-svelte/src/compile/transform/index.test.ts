import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import type {
  RuntimeWarningOptions,
  SvelteWhitespaceMode,
} from "@lingui-for/framework-core/compile";
import {
  assertRangeMapping,
  findUniqueRange,
  offsetToLocation,
  type Detection,
} from "@lingui-for/internal-shared-test-helpers";

import { defineConfig } from "../../config.ts";
import { loadLinguiConfig } from "../common/config.ts";
import { transformSvelte } from "./index.ts";

function compact(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function expectNoExcessBlankLines(value: string): void {
  expect(value).not.toMatch(/<script[^>]*>\r?\n\r?\n/);
  expect(value).not.toMatch(/\r?\n[ \t]+\r?\n/);
  expect(value).not.toMatch(/\r?\n\r?\n\r?\n+/);
}

async function resolveTestConfig(
  options: {
    runtimeWarnings?: RuntimeWarningOptions;
    whitespace?: SvelteWhitespaceMode;
  } = {},
) {
  return loadLinguiConfig(
    defineConfig({
      locales: ["en"],
      framework: {
        svelte: {
          runtimeWarnings: options.runtimeWarnings,
          whitespace: options.whitespace,
        },
      },
    }),
  );
}

async function expectTransformed(
  source: string,
  options: {
    filename?: string;
    runtimeWarnings?: RuntimeWarningOptions;
    whitespace?: SvelteWhitespaceMode;
  } = {},
) {
  const resolvedConfig = await resolveTestConfig(options);
  const result = await transformSvelte(source, {
    filename: options.filename ?? "/virtual/App.svelte",
    linguiConfig: resolvedConfig.linguiConfig,
    frameworkConfig: resolvedConfig.frameworkConfig,
  });
  expect.assert(result != null);
  return result;
}

const preloadedInitPageSource = dedent`
  <script lang="ts">
    import { setupI18n } from "@lingui/core";
    import { setLinguiContext } from "lingui-for-svelte";
    import { plural, t } from "lingui-for-svelte/macro";

    import { messages as en } from "$lib/i18n/locales/en";
    import { messages as ja } from "$lib/i18n/locales/ja";

    const i18n = setupI18n({
      locale: "en",
      messages: { en, ja },
    });
    setLinguiContext(i18n);

    let locale = $state<"en" | "ja">("en");
    let count = $state(3);

    function toggle() {
      locale = locale === "en" ? "ja" : "en";
      i18n.activate(locale);
    }
  </script>

  <section class="card">
    <p>{$t\`Hello from the preloaded init pattern.\`}</p>
    <p>
      {$plural(count, {
        one: "# item in the list.",
        other: "# items in the list.",
      })}
    </p>
  </section>
`;

describe("transformSvelte", () => {
  test("keeps msg descriptors pure inside user-authored $derived", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { msg } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const message = $derived(msg\`Hello \${name}\`);
        </script>

        <p>{$message.message}</p>
      `,
    );

    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  let name = $state("Ada");
    	  const message = $derived(/*i18n*/ {
    	    id: "OVaF9k",
    	    message: "Hello {name}",
    	    values: {
    	      name: name
    	    }
    	  });
    	</script>

    	<p>{$message.message}</p>"
    `);
  });

  test("rewrites eager t in script and $t in markup through separate runtime paths", async () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-for-svelte/macro";

        const heading = msg({ id: "demo.heading", message: "Hello" });
        const label = t.eager({ message: "Save" });
      </script>

      <h1>{$t(heading)}</h1>
      <p>{label}</p>
    `;

    const result = await expectTransformed(source);

    expectNoExcessBlankLines(result.code);
    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  const heading = /*i18n*/ {
    	    id: "demo.heading",
    	    message: "Hello"
    	  };
    	  const label = __l4s_getI18n()._(
    	  /*i18n*/ {
    	    id: "tfDRzk",
    	    message: "Save"
    	  });

    	  __l4s_ctx.prime();
    	</script>

    	<h1>{$__l4s_translate(heading)}</h1>
    	<p>{label}</p>"
    `);
  });

  test("keeps returned msg descriptors on the same line as the i18n marker", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { msg } from "lingui-for-svelte/macro";

          function getMessage() {
            return msg\`No images found.\`;
          }
        </script>
      `,
    );

    expect(result.code).toContain("return /*i18n*/ {");
  });

  test("defaults rich-text whitespace handling to framework-aware spacing", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
        </script>

        <Trans>
          <strong>Read</strong>
          <em>carefully</em>
        </Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
  });

  test("supports opting rich-text whitespace handling back to jsx semantics", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
        </script>

        <Trans>
          <strong>Read</strong>
          <em>carefully</em>
        </Trans>
      `,
      { filename: "/virtual/App.svelte", whitespace: "jsx" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0><1>carefully</1>"',
    );
  });

  test('does not duplicate explicit {" "} rich-text spacing', async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
        </script>

        <Trans><strong>Read</strong> {" "} <em>carefully</em></Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
    expect(compact(result.code)).not.toContain(
      'message: "<0>Read</0>  <1>carefully</1>"',
    );
  });

  test("lowers html and render tags inside Trans through implicit snippets", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";

          let content = "<strong>unsafe</strong>";
          let row = $props().row;
          let item = $state("Ada");
        </script>

        <Trans>
          {@html content}
          {@render row(item)}
        </Trans>
      `,
    );

    expect(compact(result.code)).toContain('message: "<0/> <1/>"');
    expect(result.code).toContain(
      '{#snippet component_0(children)}{#if children}{@const __l4s_ignored = console.warn("[lingui-for-svelte] <Trans> content tags ignore translated children and use their own source instead.")}{/if}{@html content}{/snippet}',
    );
    expect(result.code).toContain(
      '{#snippet component_1(children)}{#if children}{@const __l4s_ignored = console.warn("[lingui-for-svelte] <Trans> content tags ignore translated children and use their own source instead.")}{/if}{@render row(item)}{/snippet}',
    );
  });

  test("supports disabling content-override runtime warnings", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";

          let content = "<strong>unsafe</strong>";
        </script>

        <Trans>
          {@html content}
        </Trans>
      `,
      {
        runtimeWarnings: { transContentOverride: "off" },
      },
    );

    expect(result.code).not.toContain("console.warn(");
    expect(result.code).toContain(
      "{#snippet component_0(children)}{@html content}{/snippet}",
    );
  });

  test("treats escaped-whitespace string expressions as explicit spacing", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
        </script>

        <Trans><strong>Read</strong> {"\\n"} <em>carefully</em></Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(compact(result.code)).toContain(
      'message: "<0>Read</0> <1>carefully</1>"',
    );
    expect(compact(result.code)).not.toContain(
      'message: "<0>Read</0>  <1>carefully</1>"',
    );
  });

  test("keeps $t inside script initializers as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const label = $t\`Hello \${name}\`;
        </script>

        <p>{label}</p>
      `,
    );

    expectNoExcessBlankLines(result.code);
    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("const label = $__l4s_translate(");
    expect(result.code).not.toContain("$derived(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let name = $state("Ada");
    	  const label = $__l4s_translate(
    	  /*i18n*/ {
    	    id: "OVaF9k",
    	    message: "Hello {name}",
    	    values: {
    	      name: name
    	    }
    	  });

    	  __l4s_ctx.prime();
    	</script>

    	<p>{label}</p>"
    `);
  });

  test("wraps $t inside $derived.by callbacks with another derived translator read", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const label = $derived.by(() => $t\`Hello \${name}\`);
        </script>
      `,
    );

    expect(result.code).toContain("$derived.by(() => $__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let name = $state("Ada");
    	  const label = $derived.by(() => $__l4s_translate(
    	  /*i18n*/ {
    	    id: "OVaF9k",
    	    message: "Hello {name}",
    	    values: {
    	      name: name
    	    }
    	  }));

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps $t inside ordinary function branches as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let state = $state("idle");

          function getStatusText() {
            return state === "idle" ? $t\`idle\` : $t\`active\`;
          }
        </script>
      `,
    );

    expect(result.code).toContain(
      'return state === "idle" ? $__l4s_translate(',
    );
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let state = $state("idle");

    	  function getStatusText() {
    	    return state === "idle" ? $__l4s_translate(
    	    /*i18n*/ {
    	      id: "oBVc6R",
    	      message: "idle"
    	    }) : $__l4s_translate(
    	    /*i18n*/ {
    	      id: "s/ereB",
    	      message: "active"
    	    });
    	  }

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps reactive plural/select macros inside callback-based derived runes as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { plural, select } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");

          const status = $derived.by(() => ({
            books: $plural(count, { one: "# Book", other: "# Books" }),
            pronoun: $select(gender, { female: "she", other: "they" }),
          }));
        </script>
      `,
    );

    expect(result.code).toContain("books: $__l4s_translate(");
    expect(result.code).toContain("pronoun: $__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let count = $state(2);
    	  let gender = $state("female");

    	  const status = $derived.by(() => ({
    	    books: $__l4s_translate(
    	    /*i18n*/ {
    	      id: "V/M0Vc",
    	      message: "{count, plural, one {# Book} other {# Books}}",
    	      values: {
    	        count: count
    	      }
    	    }),
    	    pronoun: $__l4s_translate(
    	    /*i18n*/ {
    	      id: "BGY2VE",
    	      message: "{gender, select, female {she} other {they}}",
    	      values: {
    	        gender: gender
    	      }
    	    }),
    	  }));

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps top-level ternary initializers containing reactive translations as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let state = $state("idle");
          const label = state === "idle" ? $t\`idle\` : $t\`active\`;
        </script>
      `,
    );

    expect(result.code).toContain(
      'const label = state === "idle" ? $__l4s_translate(',
    );
    expect(result.code).not.toContain("$derived(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let state = $state("idle");
    	  const label = state === "idle" ? $__l4s_translate(
    	  /*i18n*/ {
    	    id: "oBVc6R",
    	    message: "idle"
    	  }) : $__l4s_translate(
    	  /*i18n*/ {
    	    id: "s/ereB",
    	    message: "active"
    	  });

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps top-level object initializers containing reactive translations as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t, plural } from "lingui-for-svelte/macro";

          let count = $state(2);
          const labels = {
            state: $t\`idle\`,
            books: $plural(count, { one: "# Book", other: "# Books" }),
          };
        </script>
      `,
    );

    expect(result.code).toContain("const labels = {");
    expect(result.code).not.toContain("$derived(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let count = $state(2);
    	  const labels = {
    	    state: $__l4s_translate(
    	    /*i18n*/ {
    	      id: "oBVc6R",
    	      message: "idle"
    	    }),
    	    books: $__l4s_translate(
    	    /*i18n*/ {
    	      id: "V/M0Vc",
    	      message: "{count, plural, one {# Book} other {# Books}}",
    	      values: {
    	        count: count
    	      }
    	    }),
    	  };

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps top-level function initializers that return reactive translations as direct translator reads", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          const getStatusText = () => $t\`idle\`;
        </script>
      `,
    );

    expect(result.code).not.toContain("const getStatusText = $derived(");
    expect(result.code).toContain(
      "const getStatusText = () => $__l4s_translate(",
    );
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  const getStatusText = () => $__l4s_translate(
    	  /*i18n*/ {
    	    id: "oBVc6R",
    	    message: "idle"
    	  });

    	  __l4s_ctx.prime();
    	</script>"
    `);
  });

  test("keeps $t in script direct while letting t.eager stay eager", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        let name = $state("Ada");
        const eager = t.eager\`Tagged eager in script for \${name}\`;
        const reactive = $t\`Tagged reactive in script for \${name}\`;
      </script>

      <p>{eager}</p>
      <p>{reactive}</p>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("__l4s_getI18n()._(");
    expect(result.code).toContain("const reactive = $__l4s_translate(");
    expect(result.code).not.toContain("$derived(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let name = $state("Ada");
    	  const eager = __l4s_getI18n()._(
    	  /*i18n*/ {
    	    id: "hhBkx1",
    	    message: "Tagged eager in script for {name}",
    	    values: {
    	      name: name
    	    }
    	  });
    	  const reactive = $__l4s_translate(
    	  /*i18n*/ {
    	    id: "ZKsO3J",
    	    message: "Tagged reactive in script for {name}",
    	    values: {
    	      name: name
    	    }
    	  });

    	  __l4s_ctx.prime();
    	</script>

    	<p>{eager}</p>
    	<p>{reactive}</p>"
    `);
  });

  test("rejects bare direct t in Svelte scripts", async () => {
    const resolvedConfig = await resolveTestConfig();

    await expect(async () =>
      transformSvelte(
        dedent`
          <script lang="ts">
            import { t } from "lingui-for-svelte/macro";

            const label = t\`Hello\`;
          </script>

          <p>{label}</p>
        `,
        {
          filename: "/virtual/App.svelte",
          ...resolvedConfig,
        },
      ),
    ).rejects.toThrow(/Bare `t` in `.svelte` files is not allowed/);
  });

  test("rewrites $t markup expressions to runtime reactive translations", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
        </script>

        <p>{$t\`Hello \${name}\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expectNoExcessBlankLines(result.code);
    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let name = $state("Ada");

    	  __l4s_ctx.prime();
    	</script>

    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "OVaF9k",
    	  message: "Hello {name}",
    	  values: {
    	    name: name
    	  }
    	})}</p>"
    `);
  });

  test("treats $plural, $select, and $selectOrdinal as reactive string macros", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { plural, select, selectOrdinal } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");
        </script>

        <p>{$plural(count, { one: "# Book", other: "# Books" })}</p>
        <p>{$select(gender, { female: "she", other: "they" })}</p>
        <p>{$selectOrdinal(count, { one: "#st", other: "#th" })}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  let count = $state(2);
    	  let gender = $state("female");

    	  __l4s_ctx.prime();
    	</script>

    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "V/M0Vc",
    	  message: "{count, plural, one {# Book} other {# Books}}",
    	  values: {
    	    count: count
    	  }
    	})}</p>
    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "BGY2VE",
    	  message: "{gender, select, female {she} other {they}}",
    	  values: {
    	    gender: gender
    	  }
    	})}</p>
    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "0ALwK4",
    	  message: "{count, selectordinal, one {#st} other {#th}}",
    	  values: {
    	    count: count
    	  }
    	})}</p>"
    `);
  });

  test("rewrites reactive markup plural without leaving source fragments behind", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { plural } from "lingui-for-svelte/macro";

          let count = $state(3);
        </script>

        <p>
          {$plural(count, {
            one: "# item in the list.",
            other: "# items in the list.",
          })}
        </p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).not.toContain("{$p$__l4s_translate(");
    expect(result.code).toContain("{$__l4s_translate(");
    expect(result.code).toContain(
      'message: "{count, plural, one {# item in the list.} other {# items in the list.}}"',
    );
  });

  test("rewrites the e2e preloaded page without leaving plural source fragments behind", async () => {
    const result = await expectTransformed(preloadedInitPageSource, {
      filename: "/virtual/+page.svelte",
    });

    expect(result.code).not.toContain("{$p$__l4s_translate(");
    expect(result.code).toContain("{$__l4s_translate(");
  });

  test("rewrites preloaded template expressions without leaving raw macro syntax behind", async () => {
    const result = await expectTransformed(preloadedInitPageSource, {
      filename: "/virtual/+page.svelte",
    });

    expect(result.code).toContain("{$__l4s_translate(");
    expect(result.code).not.toContain(
      "{$t`Hello from the preloaded init pattern.`}",
    );
    expect(result.code).not.toContain("{$plural(count, {");
    expect(result.code).toContain(
      'message: "Hello from the preloaded init pattern."',
    );
    expect(result.code).toContain(
      'message: "{count, plural, one {# item in the list.} other {# items in the list.}}"',
    );
  });

  test("supports exact-number ICU branches in core and component macros", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import {
            Plural,
            plural,
            SelectOrdinal,
            selectOrdinal,
          } from "lingui-for-svelte/macro";

          let count = $state(2);
          let rank = $state(1);
        </script>

        <p>{$plural(count, {
          0: "no queued builds",
          2: "exactly two queued builds",
          other: "# queued builds",
        })}</p>
        <p>{$selectOrdinal(rank, {
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
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("=0 {no queued builds}");
    expect(result.code).toContain("=2 {exactly two queued builds}");
    expect(result.code).toContain("=1 {take the shortcut}");
    expect(result.code).toContain("=2 {take the scenic route}");
  });

  test("handles deeply nested core and component macro shapes", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import {
            Plural,
            plural,
            select,
            selectOrdinal,
            t,
          } from "lingui-for-svelte/macro";

          let count = $state(0);
          let rank = $state(1);
          let role = $state("admin");

          const deepCore = $derived($t({
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
          }));
        </script>

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
      `,
      { filename: "/virtual/App.svelte" },
    );

    const code = compact(result.code);

    expect(code).toContain(
      'message: "{count, plural, =0 {{rank, selectordinal, =1 {{role, select, admin {core zero first admin} other {core zero first other}}}',
    );
    expect(code).toContain("core many later admin");
    expect(code).toContain(
      'message: "{count, plural, =0 {{0}} =2 {{1}} other {{2}}}"',
    );
    expect(code).toContain(
      'message: "{rank, selectordinal, =1 {{role, select, admin {component zero first admin} other {component zero first other}}}',
    );
    expect(code).toContain("component many later admin");
  });

  test("lowers Trans with embedded elements to the runtime RuntimeTrans component", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";

          let name = $state("Ada");
        </script>

        <Trans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
    	  let name = $state("Ada");
    	</script>

    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "demo.docs",
    	  message: "Read the <0>docs</0>, {name}.",
    	  values: {
    	    name: name
    	  }
    	}}>
    	{#snippet component_0(children)}<a href="/docs">{@render children?.()}</a>{/snippet}
    	</L4sRuntimeTrans>"
    `);
  });

  test("lowers Trans with nested embedded elements and components", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
          import DocLink from "./DocLink.svelte";

          let name = $state("Ada");
        </script>

        <Trans>Read <strong><DocLink href="/docs">{name}</DocLink></strong> carefully.</Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
    	  import DocLink from "./DocLink.svelte";

    	  let name = $state("Ada");
    	</script>

    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "N+nKUg",
    	  message: "Read <0><1>{name}</1></0> carefully.",
    	  values: {
    	    name: name
    	  }
    	}}>
    	{#snippet component_0(children)}<strong>{@render children?.()}</strong>{/snippet}
    	{#snippet component_1(children)}<DocLink href="/docs">{@render children?.()}</DocLink>{/snippet}
    	</L4sRuntimeTrans>"
    `);
  });

  test("injects RuntimeTrans for imported alias component macros", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { Trans as LocalTrans } from "lingui-for-svelte/macro";
        </script>

        <LocalTrans id="demo.docs">Read the <a href="/docs">docs</a>.</LocalTrans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
    	</script>

    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "demo.docs",
    	  message: "Read the <0>docs</0>."
    	}}>
    	{#snippet component_0(children)}<a href="/docs">{@render children?.()}</a>{/snippet}
    	</L4sRuntimeTrans>"
    `);
  });

  test("lowers Plural, Select, and SelectOrdinal component macros to RuntimeTrans", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import {
            Plural,
            Select,
            SelectOrdinal,
          } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");
        </script>

        <Plural value={count} one="# Book" other="# Books" />
        <Select value={gender} _female="she" other="they" />
        <SelectOrdinal value={count} one="#st" other="#th" />
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
    	  let count = $state(2);
    	  let gender = $state("female");
    	</script>

    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "V/M0Vc",
    	  message: "{count, plural, one {# Book} other {# Books}}",
    	  values: {
    	    count: count
    	  }
    	}} />
    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "BGY2VE",
    	  message: "{gender, select, female {she} other {they}}",
    	  values: {
    	    gender: gender
    	  }
    	}} />
    	<L4sRuntimeTrans {.../*i18n*/ {
    	  id: "0ALwK4",
    	  message: "{count, selectordinal, one {#st} other {#th}}",
    	  values: {
    	    count: count
    	  }
    	}} />"
    `);
  });

  test("does not activate markup macros without a macro import", async () => {
    const resolvedConfig = await resolveTestConfig();
    const source = dedent`
      <p>{$t\`Hello from markup-only component\`}</p>
      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = await transformSvelte(source, {
      filename: "/virtual/App.svelte",
      ...resolvedConfig,
    });

    expect(result).toBeNull();
  });

  test("does not activate same-name components imported from other modules", async () => {
    const resolvedConfig = await resolveTestConfig();
    const source = dedent`
      <script lang="ts">
        import Trans from "./Trans.svelte";
      </script>

      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = await transformSvelte(source, {
      filename: "/virtual/App.svelte",
      ...resolvedConfig,
    });

    expect(result).toBeNull();
  });

  test("does not activate same-name non-component macros imported from other modules", async () => {
    const resolvedConfig = await resolveTestConfig();
    const source = dedent`
      <script lang="ts">
        import { t } from "./macro";

        const label = t\`Hello from another module\`;
      </script>

      <p>{label}</p>
      <p>{$t\`Reactive from markup without a macro import\`}</p>
    `;

    const result = await transformSvelte(source, {
      filename: "/virtual/App.svelte",
      ...resolvedConfig,
    });

    expect(result).toBeNull();
  });

  test("keeps shadowed macro aliases untouched while rewriting the still-bound usages", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t as translate } from "lingui-for-svelte/macro";

          const outer = translate.eager\`Outer\`;

          function render() {
            const translate = notMacro;
            return translate\`Inner\`;
          }
        </script>

        <p>{outer}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain('message: "Outer"');
    expect(result.code).toContain("return translate`Inner`;");
    expect(result.code).not.toContain('message: "Inner"');
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  const outer = __l4s_getI18n()._(
    	  /*i18n*/ {
    	    id: "wVGQ6j",
    	    message: "Outer"
    	  });

    	  function render() {
    	    const translate = notMacro;
    	    return translate\`Inner\`;
    	  }

    	  __l4s_ctx.prime();
    	</script>

    	<p>{outer}</p>"
    `);
  });

  test("does not lower same-name components from non-macro imports even when macro expressions are present", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
        import Trans from "./Trans.svelte";
      </script>

      <p>{$t\`Reactive greeting\`}</p>
      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).toContain(
      '<Trans id="demo.docs">Read the docs.</Trans>',
    );
    expect(result.code).not.toContain("<L4sRuntimeTrans");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;
    	  import Trans from "./Trans.svelte";

    	  __l4s_ctx.prime();
    	</script>

    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "UmW678",
    	  message: "Reactive greeting"
    	})}</p>
    	<Trans id="demo.docs">Read the docs.</Trans>"
    `);
  });

  test("injects a script block for imported markup-only expressions", async () => {
    const source = dedent`
      <script>
        import { t as translate } from "lingui-for-svelte/macro";
      </script>

      <p>{$translate\`Hello from markup-only component\`}</p>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain("createLinguiAccessors");
    expect(result.code).toContain("$__l4s_translate");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script>
    	  import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx = createLinguiAccessors();
    	  const __l4s_getI18n = __l4s_ctx.getI18n;
    	  const __l4s_translate = __l4s_ctx._;

    	  __l4s_ctx.prime();
    	</script>

    	<p>{$__l4s_translate(
    	/*i18n*/ {
    	  id: "PVyl3J",
    	  message: "Hello from markup-only component"
    	})}</p>"
    `);
  });

  test("avoids collisions when injecting hidden Lingui bindings", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        const createLinguiAccessors = "occupied";
        const __l4s_ctx = "occupied";
        const __l4s_getI18n = "occupied";
        const __l4s_translate = "occupied";
      </script>

      <p>{$t\`Hello\`}</p>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain("const __l4s_ctx_1 =");
    expect(result.code).toContain("const __l4s_getI18n_1 =");
    expect(result.code).toContain("const __l4s_translate_1 =");
    expect(result.code).toContain("$__l4s_translate_1(");
    expect(result.code).toMatchInlineSnapshot(`
    	"<script lang="ts">
    	  import { createLinguiAccessors as createLinguiAccessors_1 } from "lingui-for-svelte/runtime";
    	  const __l4s_ctx_1 = createLinguiAccessors_1();
    	  const __l4s_getI18n_1 = __l4s_ctx_1.getI18n;
    	  const __l4s_translate_1 = __l4s_ctx_1._;
    	  const createLinguiAccessors = "occupied";
    	  const __l4s_ctx = "occupied";
    	  const __l4s_getI18n = "occupied";
    	  const __l4s_translate = "occupied";

    	  __l4s_ctx_1.prime();
    	</script>

    	<p>{$__l4s_translate_1(
    	/*i18n*/ {
    	  id: "uzTaYi",
    	  message: "Hello"
    	})}</p>"
    `);
  });

  test("avoids collisions for internal wrapper markers during synthetic lowering", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        const __lingui_for_svelte_reactive_translation__ = "occupied";
        const __lingui_for_svelte_eager_translation__ = "occupied";
      </script>

      <p>{$t\`Hello\`}</p>
    `;

    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.artifacts.synthetic.code).toContain(
      "__lingui_for_svelte_reactive_translation___1(",
    );
    expect(result.artifacts.lowered.code).toContain(
      "__lingui_for_svelte_reactive_translation___1(",
    );
    expect(result.artifacts.contextual.code).not.toContain(
      "__lingui_for_svelte_reactive_translation__(",
    );
    expect(result.code).toContain("{$__l4s_translate(");
  });

  test("primes lazy Lingui accessors after same-component initialization helpers", async () => {
    const result = await expectTransformed(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";
          import { useLinguiLocale } from "./use-lingui-locale.svelte";

          let { locale } = $props();

          useLinguiLocale(() => locale);
        </script>

        <p>{$t\`Hello\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain(
      'import { createLinguiAccessors as createLinguiAccessors } from "lingui-for-svelte/runtime";',
    );
    expect(result.code).not.toContain("getLinguiContext()");
    expect(result.code).toContain("const __l4s_ctx = createLinguiAccessors();");
    expect(result.code).toContain("__l4s_ctx.prime();");
    expect(result.code.indexOf("useLinguiLocale(() => locale);")).toBeLessThan(
      result.code.indexOf("__l4s_ctx.prime();"),
    );
  });
});

describe("transformSvelte source map discipline", () => {
  const source = dedent`
    <script lang="ts">
      import { t, Trans } from "lingui-for-svelte/macro";

      const keepBefore = "before";
      // KEEP_SCRIPT_COMMENT
      const eagerLabel = t.eager\`Mapped script message\`;
      const keepAfter = "after";
    </script>

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p>{$t\`Mapped template message\`}</p>
      <Trans>Mapped component message</Trans>
      <p>{keepAfter}</p>
    </section>
  `;

  test("preserves untouched script and markup while keeping file-level source map metadata", async () => {
    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain('const keepBefore = "before";');
    expect(result.code).toContain("// KEEP_SCRIPT_COMMENT");
    expect(result.code).toContain('const keepAfter = "after";');
    expect(result.code).toContain('<section data-keep="yes">');
    expect(result.code).toContain("<p>{keepBefore}</p>");
    expect(result.code).toContain("<p>{keepAfter}</p>");

    expect(result.map).not.toBeNull();
    expect(result.map?.file).toBe("/virtual/App.svelte");
    expect(result.map?.sources).toEqual(["/virtual/App.svelte"]);
    expect(result.map?.sourcesContent).toEqual([source]);
  });

  test("maps unchanged script lines back to their original locations instead of the rewritten script prelude", async () => {
    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    const generatedScript = offsetToLocation(
      result.code,
      findUniqueRange(result.code, 'const keepAfter = "after";').start,
    );
    const originalScript = offsetToLocation(
      source,
      findUniqueRange(source, 'const keepAfter = "after";').start,
    );
    const generatedMarkup = offsetToLocation(
      result.code,
      findUniqueRange(result.code, "<p>{keepAfter}</p>").start,
    );
    const originalMarkup = offsetToLocation(
      source,
      findUniqueRange(source, "<p>{keepAfter}</p>").start,
    );
    const mappedSource = result.map?.sources[0] ?? result.map?.file;

    const consumer = new TraceMap(JSON.stringify(result.map));
    expect(
      originalPositionFor(consumer, {
        line: generatedScript.line,
        column: generatedScript.column,
      }),
    ).toMatchObject({
      source: mappedSource,
      line: originalScript.line,
      column: originalScript.column,
    });

    expect(
      originalPositionFor(consumer, {
        line: generatedMarkup.line,
        column: generatedMarkup.column,
      }),
    ).toMatchObject({
      source: mappedSource,
      line: originalMarkup.line,
      column: originalMarkup.column,
    });
  });
});

describe("transformSvelte source map discipline", () => {
  const source = dedent`
    <script lang="ts">
      import { t, Trans } from "lingui-for-svelte/macro";

      const keepBefore = "before";
      // KEEP_SCRIPT_COMMENT
      const eagerLabel = t.eager\`Mapped script message\`;
      const keepAfter = "after";
    </script>

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p>{$t\`Mapped template message\`}</p>
      <Trans>Mapped component message</Trans>
      <p>{keepAfter}</p>
    </section>
  `;

  test("preserves untouched script and markup while keeping file-level source map metadata", async () => {
    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain('const keepBefore = "before";');
    expect(result.code).toContain("// KEEP_SCRIPT_COMMENT");
    expect(result.code).toContain('const keepAfter = "after";');
    expect(result.code).toContain('<section data-keep="yes">');
    expect(result.code).toContain("<p>{keepBefore}</p>");
    expect(result.code).toContain("<p>{keepAfter}</p>");

    expect(result.map).not.toBeNull();
    expect(result.map?.file).toBe("/virtual/App.svelte");
    expect(result.map?.sources).toEqual(["/virtual/App.svelte"]);
    expect(result.map?.sourcesContent).toEqual([source]);
  });

  test("maps unchanged script lines back to their original locations instead of the rewritten script prelude", async () => {
    const result = await expectTransformed(source, {
      filename: "/virtual/App.svelte",
    });

    const generatedScript = offsetToLocation(
      result.code,
      findUniqueRange(result.code, 'const keepAfter = "after";').start,
    );
    const originalScript = offsetToLocation(
      source,
      findUniqueRange(source, 'const keepAfter = "after";').start,
    );
    const generatedMarkup = offsetToLocation(
      result.code,
      findUniqueRange(result.code, "<p>{keepAfter}</p>").start,
    );
    const originalMarkup = offsetToLocation(
      source,
      findUniqueRange(source, "<p>{keepAfter}</p>").start,
    );
    const mappedSource = result.map?.sources[0] ?? result.map?.file;

    const consumer = new TraceMap(JSON.stringify(result.map));
    expect(
      originalPositionFor(consumer, {
        line: generatedScript.line,
        column: generatedScript.column,
      }),
    ).toMatchObject({
      source: mappedSource,
      line: originalScript.line,
      column: originalScript.column,
    });

    expect(
      originalPositionFor(consumer, {
        line: generatedMarkup.line,
        column: generatedMarkup.column,
      }),
    ).toMatchObject({
      source: mappedSource,
      line: originalMarkup.line,
      column: originalMarkup.column,
    });
  });

  const rangeSource = dedent`
    <script lang="ts">
      import { t, Trans } from "lingui-for-svelte/macro";

      const keepBefore = "before";
      const label = t.eager\`Mapped script message\`;
      const keepAfter = "after";
    </script>

    <section data-keep="yes">
      <p>{keepBefore}</p>
      <p><strong>{$t\`Mapped template message\`}</strong></p>
      <a href="/docs"><Trans>Mapped component message</Trans></a>
      <p>{keepAfter}</p>
      <p>{

        $t\`Range check with surrounding whitespace\`

      }</p>
    </section>
  `;

  const detections: Detection[] = [
    {
      name: "script transform",
      original: "t.eager`Mapped script message`",
      generated:
        /__l4s_getI18n\(\)\._\([^)]*message: "Mapped script message"[^)]*\)/,
    },
    {
      name: "template transform",
      original: /\$t`Mapped template message`/,
      generated:
        /\$__l4s_translate\([^)]*message: "Mapped template message"[^)]*\)/,
    },
    {
      name: "range check with surrounding whitespace",
      original: /\$t`Range check with surrounding whitespace`/,
      generated:
        /\$__l4s_translate\([^)]*message: "Range check with surrounding whitespace"[^)]*\)/,
    },
    {
      name: "component transform",
      original: "<Trans>Mapped component message</Trans>",
      generated: /<L4sRuntimeTrans\b[\s\S]*?(?:\/>|<\/L4sRuntimeTrans>)/,
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

  test("maps transformed and preserved compile ranges back to the original svelte file", async () => {
    const result = await expectTransformed(rangeSource, {
      filename: "/virtual/App.svelte",
    });

    const { code, map } = result;
    expect.assert(map != null);

    expect(map.file).toBe("/virtual/App.svelte");
    expect(map.sources).toEqual(["/virtual/App.svelte"]);
    expect(map.sourcesContent).toEqual([rangeSource]);

    const consumer = new TraceMap(JSON.stringify(map));
    detections.forEach((detection) => {
      assertRangeMapping(
        consumer,
        code,
        rangeSource,
        detection,
        "/virtual/App.svelte",
        "both",
        expect,
      );
    });
  });
});
