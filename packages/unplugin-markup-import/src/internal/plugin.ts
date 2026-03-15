import {
  createUnplugin,
  type UnpluginFactory,
  type UnpluginInstance,
} from "unplugin";

import type { MarkupFramework, MarkupImportPluginOptions } from "../types.ts";
import {
  collectRelativeAstroImports,
  createAstroFacadeModule,
} from "./astro-module.ts";
import {
  dirnamePath,
  joinPath,
  normalizePath,
  relativePathFrom,
  resolveRelativeSpecifier,
} from "./path.ts";
import {
  collectRelativeSvelteImports,
  createSvelteFacadeModule,
} from "./svelte-module.ts";
import type { MarkupFacadeModule, StoredFacadeModule } from "./types.ts";
import {
  createFacadeId,
  createProxyId,
  createProxyModuleCode,
  createScanModuleCode,
  isPublicRequest,
  isScanRequest,
  parseFacadeSourceId,
  parseProxyId,
  resolveScanSourceId,
  shouldPreserveRelativeMarkupImport,
  stripKnownQuery,
} from "./virtual-modules.ts";

type FrameworkHandler = {
  extension: string;
  createFacadeModule: (
    source: string,
    filename: string,
    relativePath: string,
  ) => MarkupFacadeModule;
  collectRelativeImports: (
    source: string,
    filename: string,
  ) => readonly string[];
};

const FRAMEWORK_HANDLERS: Record<MarkupFramework, FrameworkHandler> = {
  astro: {
    extension: ".astro",
    createFacadeModule: createAstroFacadeModule,
    collectRelativeImports: collectRelativeAstroImports,
  },
  svelte: {
    extension: ".svelte",
    createFacadeModule: createSvelteFacadeModule,
    collectRelativeImports: collectRelativeSvelteImports,
  },
};

/**
 * Creates the unplugin instance that keeps shipped markup files in the output
 * graph while routing their non-markup relative imports through emitted facade
 * modules.
 *
 * The factory works without manual runtime entries or temporary source files by
 * using virtual proxy modules plus emitted markup assets.
 */
export const unpluginFactory: UnpluginFactory<
  MarkupImportPluginOptions | undefined
> = (options = {}) => {
  const projectRoot = normalizePath(options.rootDir ?? process.cwd());
  const sourceDir = normalizePath(
    options.sourceDir ?? joinPath(projectRoot, "src"),
  );
  const frameworks = options.frameworks ?? ["svelte"];
  const handlers = frameworks.map((framework) => FRAMEWORK_HANDLERS[framework]);
  const handledExtensions = handlers.map((handler) => handler.extension);
  const modules = new Map<string, StoredFacadeModule>();
  const emittedAssets = new Set<string>();
  const emittedFacades = new Set<string>();
  const emittedFacadeDts = new Set<string>();
  const scanTargets = new Set<string>();

  return {
    name: "unplugin-markup-import",
    resolveId(source, importer) {
      const proxy = parseProxyId(source);
      if (proxy) {
        return source;
      }

      const facadeSourceId = parseFacadeSourceId(source);
      if (facadeSourceId) {
        return source;
      }

      if (isPublicRequest(source)) {
        return {
          external: true,
          id: stripKnownQuery(source),
        };
      }

      if (isScanRequest(source)) {
        const resolvedId = resolveScanSourceId(source, importer);
        if (!resolvedId) {
          return null;
        }

        scanTargets.add(resolvedId);
        return resolvedId;
      }

      if (
        !shouldPreserveRelativeMarkupImport(source, importer, handledExtensions)
      ) {
        return null;
      }

      if (!importer) {
        return null;
      }

      const importerFilename = stripKnownQuery(importer);
      const resolvedSourceId = resolveRelativeSpecifier(
        dirnamePath(importerFilename),
        source,
      );

      return createProxyId(resolvedSourceId, source);
    },
    load(id) {
      const proxy = parseProxyId(id);
      if (proxy) {
        return createProxyModuleCode(proxy.sourceId, proxy.publicSpecifier);
      }

      const facade = modules.get(parseFacadeSourceId(id));
      if (facade?.facadeCode) {
        return facade.facadeCode;
      }

      return null;
    },
    transform(code, id) {
      const sourceId = stripKnownQuery(id);
      if (!scanTargets.has(sourceId)) {
        return null;
      }

      const handler = handlers.find((candidate) =>
        sourceId.endsWith(candidate.extension),
      );
      if (!handler) {
        return null;
      }

      const relativePath = relativePathFrom(sourceDir, sourceId);
      const facadeModule = handler.createFacadeModule(
        code,
        sourceId,
        relativePath,
      );
      const facadeId =
        facadeModule.facadeCode && facadeModule.facadeFileName
          ? createFacadeId(sourceId)
          : null;

      modules.set(sourceId, {
        ...facadeModule,
        facadeId,
      });

      this.addWatchFile(sourceId);

      if (!emittedAssets.has(sourceId)) {
        this.emitFile({
          type: "asset",
          fileName: facadeModule.assetFileName,
          originalFileName: sourceId,
          source: facadeModule.rewrittenCode,
        });
        emittedAssets.add(sourceId);
      }

      if (
        facadeModule.facadeDtsFileName &&
        facadeModule.facadeDtsCode &&
        !emittedFacadeDts.has(sourceId)
      ) {
        this.emitFile({
          type: "asset",
          fileName: facadeModule.facadeDtsFileName,
          source: facadeModule.facadeDtsCode,
        });
        emittedFacadeDts.add(sourceId);
      }

      if (
        facadeId &&
        facadeModule.facadeFileName &&
        !emittedFacades.has(sourceId)
      ) {
        if (facadeModule.facadeCode === "export {};") {
          this.emitFile({
            type: "asset",
            fileName: facadeModule.facadeFileName,
            source: facadeModule.facadeCode,
          });
        } else {
          const chunkFile = {
            type: "chunk",
            id: facadeId,
            fileName: facadeModule.facadeFileName,
          } as const;

          this.emitFile(
            chunkFile as unknown as Parameters<typeof this.emitFile>[0],
          );
        }
        emittedFacades.add(sourceId);
      }

      const childSourceIds = handler
        .collectRelativeImports(code, sourceId)
        .map((specifier) =>
          resolveRelativeSpecifier(dirnamePath(sourceId), specifier),
        );

      return {
        code: createScanModuleCode(childSourceIds),
        map: null,
      };
    },
  };
};

export const unplugin: UnpluginInstance<MarkupImportPluginOptions | undefined> =
  /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
