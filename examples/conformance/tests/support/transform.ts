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

export type FixtureTransformResult =
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

function createSvelteTransformConfig(whitespace: FixtureWhitespace) {
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

function createAstroTransformConfig(whitespace: FixtureWhitespace) {
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

async function getSvelteTransformConfig(
  whitespace: FixtureWhitespace,
): Promise<LoadedSvelteFixtureConfig> {
  let configPromise = svelteConfigCache.get(whitespace);
  if (configPromise == null) {
    configPromise = loadSvelteConfig(createSvelteTransformConfig(whitespace));
    svelteConfigCache.set(whitespace, configPromise);
  }
  return await configPromise;
}

async function getAstroTransformConfig(
  whitespace: FixtureWhitespace,
): Promise<LoadedAstroFixtureConfig> {
  let configPromise = astroConfigCache.get(whitespace);
  if (configPromise == null) {
    configPromise = loadAstroConfig(createAstroTransformConfig(whitespace));
    astroConfigCache.set(whitespace, configPromise);
  }
  return await configPromise;
}

export async function transformFixture(
  framework: "astro" | "svelte",
  source: string,
  options: {
    filename: string;
    whitespace?: FixtureWhitespace;
  },
): Promise<FixtureTransformResult> {
  if (framework === "svelte") {
    const config = await getSvelteTransformConfig(options.whitespace ?? "auto");
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

  const config = await getAstroTransformConfig(options.whitespace ?? "auto");
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

export async function extractRoundtripFixture(
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
