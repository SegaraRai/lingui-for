import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";
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
    const source = [
      '<script lang="ts">',
      '  import { msg, t } from "lingui-for-svelte/macro";',
      "  const descriptor = msg`Tagged descriptor from Svelte`;",
      "  const eager = t`Tagged eager from Svelte`;",
      '  const name = "Ada";',
      "</script>",
      "",
      "<p>{$t`Tagged literal from markup`}</p>",
      "<p>{$t`Hello ${name}`}</p>",
      "<p>{descriptor.message}</p>",
      "<p>{eager}</p>",
    ].join("\n");

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
      messages.some((message) => message.message === "Tagged eager from Svelte"),
    ).toBe(true);
    expect(messages.some((message) => message.message === "Hello {name}")).toBe(
      true,
    );
  });

  it("extracts markup-only components without a user-authored script block", async () => {
    const source = ["<p>{$t`Markup-only extraction`}</p>"].join("\n");

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
});

describe("jstsExtractor", () => {
  it("extracts tagged template literals from plain TypeScript sources", async () => {
    const source = [
      'import { msg, t } from "lingui-for-svelte/macro";',
      "const count = 2;",
      'const name = "Ada";',
      "export const descriptor = msg`Tagged descriptor from TypeScript`;",
      "export const label = t`Tagged label from TypeScript`;",
      "export const greeting = msg`Hello ${name}`;",
      'export const summary = msg({ message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}" });',
      "",
    ].join("\n");

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
