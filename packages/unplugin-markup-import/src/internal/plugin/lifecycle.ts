import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { matchesScanFilter } from "../fs/filters.ts";
import { dirnamePath, relativePathFrom } from "../fs/paths.ts";
import { collectSourceFiles, relativePathFromSourceDir } from "../fs/scan.ts";
import { createTempFilePath } from "../fs/temp-files.ts";
import type { FrameworkHandler } from "../markup/frameworks/registry.ts";
import type { ResolveFacadeSourceSpecifier } from "../markup/types.ts";
import type { GeneratedMarkupRecord, ScanFilter } from "./types.ts";

export interface LifecycleContext {
  generatedMarkups: Map<string, GeneratedMarkupRecord>;
  emittedAssets: Set<string>;
}

export function createLifecycleContext(): LifecycleContext {
  return {
    generatedMarkups: new Map<string, GeneratedMarkupRecord>(),
    emittedAssets: new Set<string>(),
  };
}

type EmitAssetContext = {
  addWatchFile: (id: string) => void;
  emitFile: (file: {
    type: "asset";
    fileName: string;
    originalFileName?: string;
    source: string;
  }) => void;
};

export function scanGeneratedMarkups(
  sourceDir: string,
  tempDir: string,
  handlers: readonly FrameworkHandler[],
  scanFilter: ScanFilter,
  context: LifecycleContext,
): void {
  resetGeneratedState(tempDir, context);
  const resolveFacadeSourceSpecifier =
    createTempFacadeSourceSpecifierResolver(tempDir);

  for (const sourceId of collectSourceFiles(sourceDir, (filename) =>
    handlers.some((handler) => filename.endsWith(handler.extension)),
  )) {
    if (!matchesScanFilter(sourceDir, sourceId, scanFilter)) {
      continue;
    }

    const handler = handlers.find((candidate) =>
      sourceId.endsWith(candidate.extension),
    );
    if (!handler) {
      continue;
    }

    const source = readFileSync(sourceId, "utf8");
    const relativePath = relativePathFromSourceDir(sourceDir, sourceId);
    const facadeModule = handler.createFacadeModule(
      source,
      sourceId,
      relativePath,
      resolveFacadeSourceSpecifier,
    );

    const facadeTempPath =
      facadeModule.facadeFileName && facadeModule.facadeCode
        ? createTempFilePath(
            tempDir,
            facadeModule.facadeFileName,
            facadeModule.facadeCode,
            ".mts",
          )
        : null;

    if (facadeTempPath && facadeModule.facadeCode) {
      writeGeneratedFile(facadeTempPath, facadeModule.facadeCode);
    }

    context.generatedMarkups.set(sourceId, {
      sourceId,
      relativePath,
      assetFileName: facadeModule.assetFileName,
      rewrittenCode: facadeModule.rewrittenCode,
      facadeFileName: facadeModule.facadeFileName,
      facadeTempPath,
    });
  }
}

export function emitGeneratedMarkupAssets(
  pluginContext: EmitAssetContext,
  context: LifecycleContext,
): void {
  for (const generatedMarkup of context.generatedMarkups.values()) {
    pluginContext.addWatchFile(generatedMarkup.sourceId);

    if (context.emittedAssets.has(generatedMarkup.assetFileName)) {
      continue;
    }

    pluginContext.emitFile({
      type: "asset",
      fileName: generatedMarkup.assetFileName,
      originalFileName: generatedMarkup.sourceId,
      source: generatedMarkup.rewrittenCode,
    });
    context.emittedAssets.add(generatedMarkup.assetFileName);
  }
}

export function cleanupGeneratedState(
  tempDir: string,
  context: LifecycleContext,
): void {
  rmSync(tempDir, {
    force: true,
    recursive: true,
  });
  context.generatedMarkups.clear();
  context.emittedAssets.clear();
}

function resetGeneratedState(tempDir: string, context: LifecycleContext): void {
  rmSync(tempDir, {
    force: true,
    recursive: true,
  });
  mkdirSync(tempDir, {
    recursive: true,
  });
  context.generatedMarkups.clear();
  context.emittedAssets.clear();
}

function createTempFacadeSourceSpecifierResolver(
  tempDir: string,
): ResolveFacadeSourceSpecifier {
  return (_specifier, context) =>
    toRelativeImportSpecifier(
      relativePathFrom(tempDir, context.resolvedSource),
    );
}

function toRelativeImportSpecifier(value: string): string {
  return value.startsWith(".") ? value : `./${value}`;
}

function writeGeneratedFile(filename: string, source: string): void {
  mkdirSync(dirnamePath(filename), {
    recursive: true,
  });
  writeFileSync(filename, source, "utf8");
}
