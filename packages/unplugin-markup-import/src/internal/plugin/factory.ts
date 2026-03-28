import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import type { MarkupImportPluginOptions } from "../../types.ts";
import { matchesGlobPatterns, normalizeGlobPatterns } from "../fs/filters.ts";
import {
  dirnamePath,
  joinPath,
  normalizePath,
  relativePathFrom,
  resolveRelativeSpecifier,
} from "../fs/paths.ts";
import { FRAMEWORK_HANDLERS } from "../markup/frameworks/registry.ts";
import type { ShouldExternalizeMarkupImport } from "../markup/types.ts";
import { createBundlerOptionsHook } from "./bundler-options.ts";
import {
  createLifecycleContext,
  emitGeneratedMarkupAssets,
  scanGeneratedMarkups,
  type LifecycleContext,
} from "./lifecycle.ts";
import type { ScanFilter } from "./types.ts";

export const unpluginFactory: UnpluginFactory<
  MarkupImportPluginOptions | undefined
> = (options = {}) => {
  const projectRoot = normalizePath(options.rootDir ?? process.cwd());
  const sourceDir = normalizePath(
    options.sourceDir ?? joinPath(projectRoot, "src"),
  );
  const tempDir = joinPath(sourceDir, ".unplugin-markup-import");
  const frameworks = options.frameworks ?? ["astro", "svelte"];
  const handlers = frameworks.map((framework) => FRAMEWORK_HANDLERS[framework]);
  const handledExtensions = handlers.map((handler) => handler.extension);
  const scanFilter: ScanFilter = {
    include: normalizeGlobPatterns(options.include),
    exclude: normalizeGlobPatterns(options.exclude),
  };
  const externalizePatterns = normalizeGlobPatterns(options.externalize);
  const lifecycleContext = createLifecycleContext();
  const applyBundlerOptions = createBundlerOptionsHook(
    sourceDir,
    tempDir,
    handlers,
    scanFilter,
    lifecycleContext,
  );
  const shouldExternalizeImport: ShouldExternalizeMarkupImport | undefined =
    externalizePatterns.length === 0
      ? undefined
      : (specifier, context) =>
          matchesGlobPatterns(
            [normalizePath(specifier), normalizePath(context.resolvedSource)],
            externalizePatterns,
          );

  return {
    name: "unplugin-markup-import",
    rollup: {
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    rolldown: {
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    vite: {
      apply: "build",
      options(options) {
        return applyBundlerOptions(options);
      },
    },
    buildStart() {
      scanGeneratedMarkups(
        sourceDir,
        tempDir,
        handlers,
        scanFilter,
        lifecycleContext,
        shouldExternalizeImport,
      );
      emitGeneratedMarkupAssets(this, lifecycleContext);
    },
    resolveId(source, importer) {
      if (!isBuildRelativeMarkupImport(source, importer, handledExtensions)) {
        return null;
      }

      const normalizedImporter = normalizeImporterId(importer, projectRoot);
      const sourceId = resolveRelativeSpecifier(
        resolveImporterSourceDir(normalizedImporter),
        source,
      );
      const generatedMarkup = lifecycleContext.generatedMarkups.get(sourceId);
      if (!generatedMarkup) {
        return null;
      }

      return {
        external: true,
        id: resolveBuildImportSpecifier(
          normalizedImporter,
          generatedMarkup.assetFileName,
          sourceDir,
          lifecycleContext,
        ),
      };
    },
  };
};

function isBuildRelativeMarkupImport(
  source: string,
  importer: string | undefined,
  handledExtensions: readonly string[],
): importer is string {
  return Boolean(
    importer &&
    source.startsWith(".") &&
    handledExtensions.some((extension) => source.endsWith(extension)),
  );
}

function resolveBuildImportSpecifier(
  importer: string | undefined,
  targetAssetFileName: string,
  sourceDir: string,
  lifecycleContext: LifecycleContext,
): string {
  const importerDir = resolveBuildImporterDir(
    importer,
    sourceDir,
    lifecycleContext,
  );
  const value = relativePathFrom(importerDir, targetAssetFileName);
  return value.startsWith(".") ? value : `./${value}`;
}

function resolveBuildImporterDir(
  importer: string | undefined,
  sourceDir: string,
  lifecycleContext: LifecycleContext,
): string {
  if (!importer) {
    return ".";
  }

  const generatedFromFacade = [
    ...lifecycleContext.generatedMarkups.values(),
  ].find((generatedMarkup) => generatedMarkup.facadeTempPath === importer);
  if (generatedFromFacade?.facadeFileName) {
    return dirnamePath(generatedFromFacade.facadeFileName);
  }

  const generatedFromSource = lifecycleContext.generatedMarkups.get(importer);
  if (generatedFromSource) {
    return dirnamePath(generatedFromSource.assetFileName);
  }

  const normalizedImporter = normalizePath(importer);
  const normalizedSourceDir = normalizePath(sourceDir);
  if (normalizedImporter.startsWith(`${normalizedSourceDir}/`)) {
    return dirnamePath(
      relativePathFrom(normalizedSourceDir, normalizedImporter),
    );
  }

  return dirnamePath(normalizedImporter);
}

function resolveImporterSourceDir(importer: string): string {
  return dirnamePath(importer);
}

function normalizeImporterId(importer: string, projectRoot: string): string {
  const normalizedImporter = normalizePath(importer);
  if (isAbsolutePath(normalizedImporter)) {
    return normalizedImporter;
  }

  return joinPath(projectRoot, normalizedImporter);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//u.test(value);
}

export const unplugin: UnpluginInstance<MarkupImportPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
