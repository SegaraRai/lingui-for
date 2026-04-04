import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { svelteExtractor } from "./index.ts";

const extractor = svelteExtractor();

function createExtractorContext(): { linguiConfig: LinguiConfigNormalized } {
  return {
    linguiConfig: normalizeLinguiConfig(),
  };
}

async function collectMessages(
  run: (
    onMessageExtracted: (message: ExtractedMessage) => void,
  ) => Promise<void>,
): Promise<ExtractedMessage[]> {
  const extracted: ExtractedMessage[] = [];
  await run((message) => {
    extracted.push(message);
  });
  return extracted;
}

describe("svelteExtractor", () => {
  test("preserves original origins without query suffixes for indexed source maps", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        const label = t.eager\`Script origin message\`;
      </script>

      <p>{label}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/origin-check.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.origin).toEqual([
      "/virtual/origin-check.svelte",
      4,
      16,
    ]);
  });

  test("extracts tagged template literals from svelte sources", async () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-for-svelte/macro";
        const descriptor = msg\`Tagged descriptor from Svelte\`;
        const eager = t.eager\`Tagged eager from Svelte\`;
        const name = "Ada";
      </script>

      <p>{$t\`Tagged literal from markup\`}</p>
      <p>{$t\`Hello \${name}\`}</p>
      <p>{descriptor.message}</p>
      <p>{eager}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "Tagged descriptor from Svelte",
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) => message.message === "Tagged literal from markup",
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) => message.message === "Tagged eager from Svelte",
      ),
    ).toBe(true);
    expect(messages.some((message) => message.message === "Hello {name}")).toBe(
      true,
    );
  });

  test("does not extract markup macros without a user-authored macro import", async () => {
    const source = dedent`
      <p>{$t\`Markup-only extraction\`}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(messages).toEqual([]);
  });

  test("does not extract same-name markup macros imported from other modules", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "./macro";
      </script>

      <p>{$t\`Ignored markup extraction\`}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(messages).toEqual([]);
  });

  test("extracts imported alias markup expressions", async () => {
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "lingui-for-svelte/macro";
      </script>

      <p>{$translate\`Markup-only extraction\`}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some((message) => message.message === "Markup-only extraction"),
    ).toBe(true);
  });

  test("does not extract same-name component macros imported from other modules", async () => {
    const source = dedent`
      <script lang="ts">
        import Trans from "./Trans.svelte";
      </script>

      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(messages).toEqual([]);
  });

  test("does not extract shadowed macro aliases that no longer reference the import", async () => {
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "lingui-for-svelte/macro";

        const outer = translate.eager\`Outer\`;

        function render() {
          const translate = notMacro;
          return translate\`Inner\`;
        }
      </script>

      <p>{outer}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(messages.some((message) => message.message === "Outer")).toBe(true);
    expect(messages.some((message) => message.message === "Inner")).toBe(false);
  });

  test("extracts Trans component macros with embedded elements", async () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
        let name = "Ada";
      </script>

      <Trans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) =>
          message.id === "demo.docs" &&
          message.message === "Read the <0>docs</0>, {name}.",
      ),
    ).toBe(true);
  });

  test("extracts nested rich-text placeholders from Trans component macros", async () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
        import DocLink from "./DocLink.svelte";
        let name = "Ada";
      </script>

      <Trans>Read <strong><DocLink href="/docs">{name}</DocLink></strong> carefully.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "Read <0><1>{name}</1></0> carefully.",
      ),
    ).toBe(true);
  });

  test("uses framework-aware whitespace for Trans rich-text extraction", async () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
      </script>

      <Trans>
        <strong>Read</strong>
        <em>carefully</em>
      </Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "<0>Read</0> <1>carefully</1>",
      ),
    ).toBe(true);
  });

  test("extracts Plural, Select, and SelectOrdinal component macros", async () => {
    const source = dedent`
      <script lang="ts">
        import {
          Plural,
          Select as Choice,
          SelectOrdinal,
        } from "lingui-for-svelte/macro";
        let count = 2;
        let gender = "female";
      </script>

      <Plural value={count} one="# Book" other="# Books" />
      <Choice value={gender} _female="she" other="they" />
      <SelectOrdinal value={count} one="#st" other="#th" />
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) =>
          message.message === "{count, plural, one {# Book} other {# Books}}",
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) =>
          message.message === "{gender, select, female {she} other {they}}",
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) =>
          message.message === "{count, selectordinal, one {#st} other {#th}}",
      ),
    ).toBe(true);
  });

  test("extracts messages from @const ternaries and each-block row summaries", async () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        let syntaxState = $state({
          mode: "idle" as "idle" | "active",
          items: ["placeholder"],
        });
      </script>

      {#if true}
        {@const statusSummary =
          syntaxState.mode === "idle"
            ? $t\`Status summary: idle\`
            : $t\`Status summary: active\`}

        <p>{statusSummary}</p>
      {/if}

      {#each syntaxState.items as item, index (item)}
        {@const rowSummary = $t\`Row \${index + 1}: \${item}\`}
        <span>{rowSummary}</span>
      {/each}
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        extractor.extract(
          "/virtual/App.svelte",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some((message) => message.message === "Status summary: idle"),
    ).toBe(true);
    expect(
      messages.some((message) => message.message === "Status summary: active"),
    ).toBe(true);
    expect(
      messages.some((message) => message.message === "Row {0}: {item}"),
    ).toBe(true);
  });
});
