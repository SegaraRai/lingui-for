import {
  makeConfig,
  type ExtractedMessage,
  type LinguiConfigNormalized,
} from "@lingui/conf";
import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { normalizeLinguiConfig } from "../compiler-core/shared/config.ts";
import { mdxExtractor } from "./extractor.ts";

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

describe("mdxExtractor", () => {
  it("extracts messages from MDX ESM, rendered expressions, and component macros", async () => {
    const source = dedent`
      ---
      title: Demo
      ---

      import { msg, t, Trans } from "lingui-for-astro/macro";

      export const descriptor = msg\`Descriptor from MDX ESM.\`;
      export const name = "Ada";

      # {t\`MDX extraction heading\`}

      <p>{t(descriptor)}</p>
      <p>{t\`Hello \${name}\`}</p>
      <Trans>Read the <a href="/docs">docs</a>.</Trans>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        mdxExtractor.extract(
          "/virtual/Page.mdx",
          source,
          onMessageExtracted,
          createExtractorContext(),
        ),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "Descriptor from MDX ESM.",
      ),
    ).toBe(true);
    expect(
      messages.some((message) => message.message === "MDX extraction heading"),
    ).toBe(true);
    expect(messages.some((message) => message.message === "Hello {name}")).toBe(
      true,
    );
    expect(
      messages.some((message) => message.message === "Read the <0>docs</0>."),
    ).toBe(true);
  });

  it("extracts messages when Lingui CLI passes a normalized config", async () => {
    const source = dedent`
      import { msg, t } from "lingui-for-astro/macro";

      export const descriptor = msg\`Descriptor from MDX ESM.\`;

      # {t\`MDX extraction heading\`}
      <p>{t(descriptor)}</p>
    `;

    const messages = await collectMessages((onMessageExtracted) =>
      Promise.resolve(
        mdxExtractor.extract("/virtual/Page.mdx", source, onMessageExtracted, {
          linguiConfig: makeConfig(
            {
              locales: ["en", "ja"],
              sourceLocale: "en",
            },
            { skipValidation: true },
          ),
        }),
      ),
    );

    expect(
      messages.some(
        (message) => message.message === "Descriptor from MDX ESM.",
      ),
    ).toBe(true);
    expect(
      messages.some((message) => message.message === "MDX extraction heading"),
    ).toBe(true);
  });
});
