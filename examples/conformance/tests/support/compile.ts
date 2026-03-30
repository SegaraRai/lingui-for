import type { ExtractedMessage } from "@lingui/conf";

import {
  unstable_transformAstro,
  type LinguiAstroTransformResult,
} from "lingui-for-astro/internal/compile";
import {
  unstable_transformSvelte,
  type LinguiSvelteTransformResult,
} from "lingui-for-svelte/internal/compile";

import { extractAstroFixture, extractSvelteFixture } from "./extract.ts";

type FixtureWhitespace = "auto" | "jsx";

export type FixtureCompileResult =
  | LinguiSvelteTransformResult
  | LinguiAstroTransformResult;

export async function compileFixture(
  framework: "astro" | "svelte",
  source: string,
  options: {
    filename: string;
    whitespace?: FixtureWhitespace;
  },
): Promise<FixtureCompileResult> {
  if (framework === "svelte") {
    const result = await unstable_transformSvelte(source, {
      filename: options.filename,
      whitespace: options.whitespace,
    });
    if (result == null) {
      throw new Error(
        `Expected Svelte transform to produce output for ${options.filename}`,
      );
    }
    return result;
  }

  const result = await unstable_transformAstro(source, {
    filename: options.filename,
    whitespace: options.whitespace,
  });
  if (result == null) {
    throw new Error(
      `Expected Astro transform to produce output for ${options.filename}`,
    );
  }
  return result;
}

export async function extractCompileFixture(
  framework: "astro" | "svelte",
  source: string,
  options: {
    filename: string;
    whitespace?: FixtureWhitespace;
  },
): Promise<ExtractedMessage[]> {
  if (framework === "svelte") {
    return await extractSvelteFixture(
      source,
      options.filename,
      options.whitespace,
    );
  }

  return await extractAstroFixture(
    source,
    options.filename,
    options.whitespace,
  );
}
