import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LinguiMacroDescriptorFields =
  | "auto"
  | "all"
  | "id-only"
  | "message";

export type LinguiMacroPluginOptions<TLinguiConfig> = {
  descriptorFields?: LinguiMacroDescriptorFields;
  extract?: true;
  linguiConfig: TLinguiConfig;
};

const LINGUI_MACRO_PLUGIN_PACKAGE = "@lingui/babel-plugin-lingui-macro";

const majorVersionCache = new Map<string, number>();

export function createLinguiMacroPluginOptions<TLinguiConfig>(options: {
  extract: boolean;
  linguiConfig: TLinguiConfig;
  pluginEntryUrl: string;
}): LinguiMacroPluginOptions<TLinguiConfig> {
  const major = resolveLinguiMacroPluginMajorVersion(options.pluginEntryUrl);

  if (major === 5) {
    return options.extract
      ? { extract: true, linguiConfig: options.linguiConfig }
      : { linguiConfig: options.linguiConfig };
  }

  if (major === 6) {
    return {
      descriptorFields: options.extract ? "all" : "auto",
      linguiConfig: options.linguiConfig,
    };
  }

  throw new Error(
    `${LINGUI_MACRO_PLUGIN_PACKAGE} ${major}.x is not supported. Expected major version 5 or 6.`,
  );
}

export function resolveLinguiMacroPluginMajorVersion(
  pluginEntryUrl: string,
): number {
  const cached = majorVersionCache.get(pluginEntryUrl);
  if (cached != null) {
    return cached;
  }

  const packageJson = readLinguiMacroPluginPackageJson(pluginEntryUrl);
  const major = Number.parseInt(packageJson.version.split(".")[0] ?? "", 10);

  if (!Number.isSafeInteger(major)) {
    throw new Error(
      `Could not parse ${LINGUI_MACRO_PLUGIN_PACKAGE} version "${packageJson.version}".`,
    );
  }

  majorVersionCache.set(pluginEntryUrl, major);
  return major;
}

function readLinguiMacroPluginPackageJson(pluginEntryUrl: string): {
  name: string;
  version: string;
} {
  let directory = dirname(fileURLToPath(pluginEntryUrl));

  while (true) {
    const candidate = join(directory, "package.json");

    if (existsSync(candidate)) {
      const packageJson = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: unknown;
        version?: unknown;
      };

      if (packageJson.name === LINGUI_MACRO_PLUGIN_PACKAGE) {
        if (typeof packageJson.version !== "string") {
          throw new Error(`${candidate} does not contain a string version.`);
        }

        return {
          name: packageJson.name,
          version: packageJson.version,
        };
      }
    }

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        `Could not find ${LINGUI_MACRO_PLUGIN_PACKAGE}/package.json from ${pluginEntryUrl}.`,
      );
    }
    directory = parent;
  }
}
