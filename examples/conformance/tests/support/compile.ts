import type { ExtractedMessage } from "@lingui/conf";

import { defineConfig as defineAstroConfig } from "lingui-for-astro/config";
import {
  unstable_loadLinguiConfig as loadAstroConfig,
  unstable_transformAstro,
  type LinguiAstroFrameworkConfig,
  type LinguiAstroTransformResult,
} from "lingui-for-astro/internal/compile";
import { defineConfig as defineSvelteConfig } from "lingui-for-svelte/config";
import {
  unstable_loadLinguiConfig as loadSvelteConfig,
  unstable_transformSvelte,
  type LinguiSvelteFrameworkConfig,
  type LinguiSvelteTransformResult,
} from "lingui-for-svelte/internal/compile";

import { extractAstroFixture, extractSvelteFixture } from "./extract.ts";

type FixtureWhitespace = "auto" | "jsx";

export type FixtureCompileResult =
  | LinguiSvelteTransformResult
  | LinguiAstroTransformResult;

type LoadedSvelteFixtureConfig = Awaited<ReturnType<typeof loadSvelteConfig>>;
type LoadedAstroFixtureConfig = Awaited<ReturnType<typeof loadAstroConfig>>;

const svelteConfigCache = new Map<
  FixtureWhitespace,
  Promise<LoadedSvelteFixtureConfig>
>();
const astroConfigCache = new Map<
  FixtureWhitespace,
  Promise<LoadedAstroFixtureConfig>
>();

function createSvelteCompileConfig(whitespace: FixtureWhitespace) {
  return defineSvelteConfig({
    locales: ["en"],
    sourceLocale: "en",
    framework: {
      svelte: {
        whitespace: resolveSvelteFixtureWhitespace(whitespace),
      } satisfies LinguiSvelteFrameworkConfig,
    },
  });
}

function createAstroCompileConfig(whitespace: FixtureWhitespace) {
  return defineAstroConfig({
    locales: ["en"],
    sourceLocale: "en",
    framework: {
      astro: {
        whitespace: resolveAstroFixtureWhitespace(whitespace),
      } satisfies LinguiAstroFrameworkConfig,
    },
  });
}

function resolveSvelteFixtureWhitespace(
  whitespace: FixtureWhitespace,
): LinguiSvelteFrameworkConfig["whitespace"] {
  return whitespace === "auto" ? "svelte" : whitespace;
}

function resolveAstroFixtureWhitespace(
  whitespace: FixtureWhitespace,
): LinguiAstroFrameworkConfig["whitespace"] {
  return whitespace === "auto" ? "astro" : whitespace;
}

async function getSvelteCompileConfig(
  whitespace: FixtureWhitespace,
): Promise<LoadedSvelteFixtureConfig> {
  let configPromise = svelteConfigCache.get(whitespace);
  if (configPromise == null) {
    configPromise = loadSvelteConfig(createSvelteCompileConfig(whitespace));
    svelteConfigCache.set(whitespace, configPromise);
  }
  return await configPromise;
}

async function getAstroCompileConfig(
  whitespace: FixtureWhitespace,
): Promise<LoadedAstroFixtureConfig> {
  let configPromise = astroConfigCache.get(whitespace);
  if (configPromise == null) {
    configPromise = loadAstroConfig(createAstroCompileConfig(whitespace));
    astroConfigCache.set(whitespace, configPromise);
  }
  return await configPromise;
}

export async function compileFixture(
  framework: "astro" | "svelte",
  source: string,
  options: {
    filename: string;
    whitespace?: FixtureWhitespace;
  },
): Promise<FixtureCompileResult> {
  if (framework === "svelte") {
    const config = await getSvelteCompileConfig(options.whitespace ?? "auto");
    const result = await unstable_transformSvelte(source, {
      filename: options.filename,
      linguiConfig: config.linguiConfig,
      frameworkConfig: config.frameworkConfig,
    });
    if (result == null) {
      throw new Error(
        `Expected Svelte transform to produce output for ${options.filename}`,
      );
    }
    return result;
  }

  const config = await getAstroCompileConfig(options.whitespace ?? "auto");
  const result = await unstable_transformAstro(source, {
    filename: options.filename,
    linguiConfig: config.linguiConfig,
    frameworkConfig: config.frameworkConfig,
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
