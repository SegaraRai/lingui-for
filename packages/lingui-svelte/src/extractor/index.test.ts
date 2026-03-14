import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { normalizeLinguiConfig } from "../compiler-core/config.ts";
import { jstsExtractor, svelteExtractor } from "./index.ts";

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
  it("extracts tagged template literals from svelte sources", async () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-for-svelte/macro";
        const descriptor = msg\`Tagged descriptor from Svelte\`;
        const eager = t\`Tagged eager from Svelte\`;
        const name = "Ada";
      </script>

      <p>{$t\`Tagged literal from markup\`}</p>
      <p>{$t\`Hello \${name}\`}</p>
      <p>{descriptor.message}</p>
      <p>{eager}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        svelteExtractor.extract(
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

  it("extracts markup-only components without a user-authored script block", async () => {
    const source = dedent`
      <p>{$t\`Markup-only extraction\`}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        svelteExtractor.extract(
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

  it("extracts Trans component macros with embedded elements", async () => {
    const source = dedent`
      <script lang="ts">
        let name = "Ada";
      </script>

      <Trans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        svelteExtractor.extract(
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

  it("extracts nested rich-text placeholders from Trans component macros", async () => {
    const source = dedent`
      <script lang="ts">
        import DocLink from "./DocLink.svelte";
        let name = "Ada";
      </script>

      <Trans>Read <strong><DocLink href="/docs">{name}</DocLink></strong> carefully.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        svelteExtractor.extract(
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

  it("extracts Plural, Select, and SelectOrdinal component macros", async () => {
    const source = dedent`
      <script lang="ts">
        let count = 2;
        let gender = "female";
      </script>

      <Plural value={count} one="# Book" other="# Books" />
      <Select value={gender} _female="she" other="they" />
      <SelectOrdinal value={count} one="#st" other="#th" />
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        svelteExtractor.extract(
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
});

describe("jstsExtractor", () => {
  it("extracts tagged template literals from plain TypeScript sources", async () => {
    const source = dedent`
      import { msg, t } from "lingui-for-svelte/macro";
      const count = 2;
      const name = "Ada";
      export const descriptor = msg\`Tagged descriptor from TypeScript\`;
      export const label = t\`Tagged label from TypeScript\`;
      export const greeting = msg\`Hello \${name}\`;
      export const summary = msg({ message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}" });
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        jstsExtractor.extract(
          "/virtual/messages.ts",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "Tagged descriptor from TypeScript",
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) => message.message === "Tagged label from TypeScript",
      ),
    ).toBe(true);
    expect(messages.some((message) => message.message === "Hello {name}")).toBe(
      true,
    );
    expect(
      messages.some(
        (message) =>
          message.message ===
          "{count, plural, one {# task for {name}} other {# tasks for {name}}}",
      ),
    ).toBe(true);
  });
});
